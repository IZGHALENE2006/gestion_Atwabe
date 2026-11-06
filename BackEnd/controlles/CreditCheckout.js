import { selectProductBatch, batchRowKey, validBatchId } from '../../shared/productBatches.js';
import { groupProductStock } from '../utils/productStock.js';
import { reserveCheckoutStock, withProductCheckoutLock } from '../utils/checkoutStock.js';
import { salesWithRevenue } from "../../shared/salesRevenue.js";
import Employee from "../models/EmployeModele.js";
import { creditAccessFor, assertCreditActor } from "../utils/creditAccess.js";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import Admin from "../models/AdminModel.js";
import Product from "../models/productModel.js";
import UserCredit from "../models/userCidit.js";
import Checkout from "../models/CreditCheckout.js";
import { allocateDiscount, calculateCartTotals, roundMoney } from "../../shared/saleTotals.js";
import { getProductSalePrice } from "../../shared/productPricing.js";
import { creditCustomer, creditInvoiceReference } from "../../shared/creditDocuments.js";
import { buildCreditPayload, mutateCredit, creditReceipt } from "./UserCridite.js";

const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const objectId = () => new mongoose.Types.ObjectId().toString();
function normalize(body = {}) {
  if (typeof body.requestId !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.requestId)) throw failure("creditInvalidRequest");
  if (!Array.isArray(body.cart) || !body.cart.length || body.cart.length > 100) throw failure("creditCheckoutCartInvalid");
  const ids = new Set();
  const cart = body.cart.map(item => {
    const id = typeof item?.id === "string" ? item.id.toLowerCase() : "", qty = Number(item?.qty), priceType = item?.priceType ?? "retail";
    if (!mongoose.isObjectIdOrHexString(id) || !['number', 'string'].includes(typeof item?.qty) || !Number.isSafeInteger(qty) || qty < 1 || ids.has(batchRowKey(item)) || (item.batchId !== undefined && !validBatchId(item.batchId)) || !["retail", "wholesale"].includes(priceType)) throw failure("creditCheckoutCartInvalid");
    ids.add(batchRowKey(item));
    if (item.expectedUnitPrice !== undefined && (!['number', 'string'].includes(typeof item.expectedUnitPrice) || String(item.expectedUnitPrice).trim() === '' || !Number.isFinite(Number(item.expectedUnitPrice)) || Number(item.expectedUnitPrice) < 0 || Number(item.expectedUnitPrice) > 1e9)) throw failure("creditCheckoutCartInvalid");
    return { id, qty, ...(item.expectedUnitPrice !== undefined ? { expectedUnitPrice: roundMoney(Number(item.expectedUnitPrice)) } : {}), priceType, ...(item.batchId !== undefined ? { batchId: item.batchId } : {}) };
  });
  let customerId = "", newCustomer;
  if (body.customerId && body.newCustomer) throw failure("creditCheckoutCustomerRequired");
  if (body.customerId) {
    if (typeof body.customerId !== "string" || !mongoose.isObjectIdOrHexString(body.customerId)) throw failure("creditCheckoutCustomerRequired");
    customerId = body.customerId.toLowerCase();
  } else if (body.newCustomer && typeof body.newCustomer === "object") {
    newCustomer = {};
    for (const [key, limit] of [["name", 160], ["phone", 40], ["cin", 80], ["email", 254]]) {
      if (body.newCustomer[key] != null && typeof body.newCustomer[key] !== "string") throw failure("creditCheckoutCustomerInvalid");
      newCustomer[key] = (body.newCustomer[key] || "").trim();
      if (newCustomer[key].length > limit) throw failure("creditCheckoutCustomerInvalid");
    }
    newCustomer.email = newCustomer.email.toLowerCase();
    if (!newCustomer.name || (newCustomer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email))) throw failure("creditCheckoutCustomerInvalid");
  } else throw failure("creditCheckoutCustomerRequired");
  const rawAmount = body.amountPaid === "" || body.amountPaid === undefined ? 0 : body.amountPaid;
  if (!["number", "string"].includes(typeof rawAmount) || !Number.isFinite(Number(rawAmount)) || Number(rawAmount) < 0) throw failure("creditCheckoutPaymentInvalid");
  const discountType = body.discountType ?? "percent", discountValue = body.discountValue === "" || body.discountValue === undefined ? 0 : body.discountValue;
  return { requestId: body.requestId.toLowerCase(), cart, customerId, ...(newCustomer ? { newCustomer } : {}), amountPaid: roundMoney(Number(rawAmount)), discountType, discountValue };
}
async function prepare(owner, actor, input, fingerprint) {
  let customer;
  if (input.customerId) {
    customer = await UserCredit.findOne({ _id: input.customerId, idUser: owner });
    if (!customer) throw failure("creditCheckoutCustomerUnavailable", 404);
  } else {
    for (const key of ["email", "cin"]) if (input.newCustomer[key] && await UserCredit.findOne({ idUser: owner, [key]: input.newCustomer[key] })) throw failure(key === "email" ? "Email already exists" : "CIN already exists");
    customer = { _id: objectId(), ...input.newCustomer };
  }
  const items = [];
  for (const item of input.cart) {
    const product = await Product.findOne({ _id: item.id, idAdmin: owner });
    if (!product) throw failure("Product not found", 404);
    if (product.quantite < item.qty) throw failure("creditCheckoutStockChanged");
    const batch = selectProductBatch(product, item.batchId);
    if (batch.quantite < item.qty) throw failure('creditCheckoutStockChanged');
    let price;
    try { price = getProductSalePrice(batch, item.priceType); } catch (error) { throw failure(error.message); }
    if (item.expectedUnitPrice !== undefined && item.expectedUnitPrice !== roundMoney(price)) throw failure('productBatchStockChanged', 409);
    items.push({ product, batch, qty: item.qty, price, priceType: item.priceType });
  }
  const stock = groupProductStock(items);
  for (const entry of stock) {
    const product = items.find(item => String(item.product._id) === entry.id).product;
    if (product.quantite < entry.qty || entry.batches.some(allocation => selectProductBatch(product, allocation.batchId).quantite < allocation.qty)) throw failure('creditCheckoutStockChanged');
  }
  let totals;
  try { totals = calculateCartTotals(items, input.discountType, input.discountValue); } catch (error) { throw failure(error.message); }
  if (input.amountPaid > totals.total) throw failure("creditCheckoutPaymentInvalid");
  const date = new Date().toISOString(), id = objectId();
  const upfront = allocateDiscount(totals.lines.map(line => line.totalHT), input.amountPaid);
  const creditLines = items.map(({ product, batch, qty, price }, index) => ({ batchId: batch.batchId, batchNumber: batch.number, id: objectId(), productId: String(product._id), invoiceId: id, actor, nom: product.name, prix: price, Quantite: qty, Paiement: upfront[index], Date: date, lineTotal: totals.lines[index].totalHT, discountAmount: roundMoney(totals.lines[index].subtotal - totals.lines[index].totalHT) }));
  const sales = items.map(({ product, batch, qty, price, priceType }, index) => ({ batchId: batch.batchId, batchNumber: batch.number, _id: objectId(), idProduct: String(product._id), name: product.name, price, priceType, quantite: qty, invoiceId: id, saleAmount: totals.lines[index].totalTTC, profite: roundMoney(totals.lines[index].totalHT - (Number(batch.prix_achat || 0) + Number(batch.frais_unitaire || 0)) * qty), DateVante: date, saleType: "credit" }));
  const facture = { _id: id, DateFacture: date, invoiceOrigin: "cashier", saleType: "credit", creditUserId: String(customer._id), clientName: customer.name, nameEmp: actor.name, Product: items.map(({ product, batch, qty, price, priceType }, index) => ({ batchId: batch.batchId, batchNumber: batch.number, idProduct: String(product._id), name: product.name, code: batch.barcode || product.barcode || "", quantite: qty, price, priceType, subtotal: totals.lines[index].subtotal, TotalPrix: totals.lines[index].total, discountAmount: 0 })), TotalQauntite: items.reduce((sum, item) => sum + item.qty, 0), TotalPrix: totals.total, totalOrder: totals.total, amountPaid: input.amountPaid, remainingAmount: roundMoney(totals.total - input.amountPaid), PrixReture: 0, subtotal: totals.subtotal, discountType: totals.discountType, discountValue: totals.discountValue, discountAmount: totals.discountAmount, lineDiscountAmount: 0, orderDiscountAmount: totals.orderDiscountAmount };
  return Checkout.create({ _id: id, idAdmin: owner, requestId: input.requestId, fingerprint, plan: { actor, customerId: String(customer._id), customer: creditCustomer(customer), ...(input.newCustomer ? { newCustomer: input.newCustomer } : {}), stock, creditLines, sales, facture, date, total: totals.total, paid: input.amountPaid, quantity: facture.TotalQauntite } });
}
async function reserveStock(operation, owner) {
  return reserveCheckoutStock(operation, owner, Checkout, 'creditCheckoutStockChanged');
}
async function recordCredit(operation, owner) {
  const p = operation.plan;
  const actor = p.actor || { id: owner, role: "admin", name: p.facture.nameEmp || "" };
  if (p.newCustomer && !await UserCredit.findOne({ _id: p.customerId, idUser: owner })) {
    try { await UserCredit.create({ _id: p.customerId, idUser: owner, createdBy: actor, ...p.newCustomer }); }
    catch (error) { if (error.code !== 11000 || !await UserCredit.findOne({ _id: p.customerId, idUser: owner })) throw error; }
  }
  return (await mutateCredit(p.customerId, owner, user => {
    if (user.creditInvoices.some(invoice => invoice.id === String(operation._id))) return { unchanged: true };
    const paidBefore = roundMoney(user.Paye);
    user.Total = roundMoney(user.Total + p.total); user.Paye = roundMoney(paidBefore + p.paid); user.Qauntite += p.quantity;
    user.produit.push(...p.creditLines.map(line => ({ ...line, actor })));
    user.creditInvoices.push({ id: String(operation._id), Date: p.date, actor, origin: "cashier", customer: p.customer, lines: p.creditLines, total: p.total, paid: p.paid, remaining: roundMoney(p.total - p.paid) });
    if (p.paid > 0) user.paymentHistory.push(creditReceipt({ Total: user.Total, ...p.customer }, p.paid, { paidBefore, date: new Date(p.date), source: "initial", actor, invoiceId: String(operation._id) }));
    return {};
  })).user;
}
async function finish(operation, owner) {
  if (operation.status === "cancelled") throw failure("creditCheckoutStockChanged");
  const sales = salesWithRevenue({ ventes: operation.plan.sales, Facture: [operation.plan.facture] }).map(sale => ({ ...sale, invoiceId: String(operation._id) }));
  if (operation.status !== "complete") {
    const account = await UserCredit.findOne({ _id: operation.plan.customerId, idUser: owner });
    if (!account?.creditInvoices.some(invoice => invoice.id === String(operation._id))) {
      await reserveStock(operation, owner);
      await recordCredit(operation, owner);
    }
    const actorId = operation.plan.actor?.id || owner, actorModel = operation.plan.actor?.role === "Employe" ? Employee : Admin;
    const actor = await actorModel.findOneAndUpdate({ _id: actorId, "Facture._id": { $ne: operation._id } }, { $push: { ventes: { $each: sales }, Facture: operation.plan.facture } }, { new: true, runValidators: true });
    if (!actor && !(await actorModel.findById(actorId))?.Facture.some(invoice => String(invoice._id) === String(operation._id))) throw new Error("Checkout actor unavailable");
    await Checkout.updateOne({ _id: operation._id, idAdmin: owner }, { $set: { status: "complete" } });
  }
  const creditUser = await UserCredit.findOne({ _id: operation.plan.customerId, idUser: owner });
  if (!creditUser) throw new Error("Checkout credit account unavailable");
  return { facture: operation.plan.facture, lastVentes: sales, creditUser: buildCreditPayload(creditUser), document: { kind: "invoice", reference: creditInvoiceReference({ id: String(operation._id) }) } };
}
export async function AddCreditCheckout(req, res) {
  let prepared = false;
  try {
    const { ownerId: owner, actor } = await creditAccessFor(req);
    const input = normalize(req.body), fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const output = await withProductCheckoutLock(owner, async () => {
      let operation = await Checkout.findOne({ idAdmin: owner, requestId: input.requestId });
      if (!operation) {
        try { operation = await prepare(owner, actor, input, fingerprint); }
        catch (error) { if (error.code !== 11000) throw error; operation = await Checkout.findOne({ idAdmin: owner, requestId: input.requestId }); if (!operation) throw error; }
      }
      assertCreditActor(operation.plan.actor, actor, owner);
      if (operation.fingerprint !== fingerprint) throw failure("creditRequestConflict", 409);
      prepared = true;
      return finish(operation, owner);
    });
    return res.status(201).json(output);
  } catch (error) {
    // Never expose internal database errors or tell the client to start a new
    // payment when a durable checkout might already have committed money.
    return res.status(error.status || (prepared ? 503 : 500)).json({ message: error.status ? error.message : prepared ? "creditCheckoutPending" : "creditSaveFailed" });
  }
}
