import EmployeModel from '../models/EmployeModele.js';
import AdminModel from '../models/AdminModel.js';
import Product from '../models/productModel.js';
import Checkout from '../models/CashCheckout.js';
import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { calculateCartTotals, roundMoney } from '../../shared/saleTotals.js';
import { getProductSalePrice } from '../../shared/productPricing.js';
import { selectProductBatch, validBatchId, batchRowKey, batchFail } from '../../shared/productBatches.js';
import { PAYMENT_METHOD_VALUES } from '../../shared/paymentMethods.js';
import { resolveDocumentClient } from '../utils/documentClient.js';
import { groupProductStock } from '../utils/productStock.js';
import { reserveCheckoutStock, withProductCheckoutLock } from '../utils/checkoutStock.js';

function normalize(body) {
  const { invoiceOrigin = 'cashier', clientName = '', paymentMethod, amountPaid, vatRate } = body;
  if (!['manual', 'cashier'].includes(invoiceOrigin)) throw batchFail('invalidInvoiceOrigin');
  if (typeof clientName !== 'string' || clientName.trim().length > 160) throw batchFail('invalidClientName');
  if (paymentMethod !== undefined && !PAYMENT_METHOD_VALUES.includes(paymentMethod)) throw batchFail('invalidPaymentMethod');
  if (!Array.isArray(body.cart) || !body.cart.length || body.cart.length > 200) throw batchFail('Invalid cart item');
  const ids = new Set();
  const cart = body.cart.map(item => {
    const id = typeof item?.id === 'string' ? item.id.toLowerCase() : '', qty = Number(item?.qty);
    if (!mongoose.isObjectIdOrHexString(id) || !['number', 'string'].includes(typeof item.qty) || !Number.isSafeInteger(qty) || qty < 1 || (item.batchId !== undefined && !validBatchId(item.batchId)) || ids.has(batchRowKey({ id, batchId: item.batchId, priceType: item.priceType }))) throw batchFail('Invalid cart item');
    ids.add(batchRowKey({ id, batchId: item.batchId, priceType: item.priceType }));
    if (item.expectedUnitPrice !== undefined && (!['number', 'string'].includes(typeof item.expectedUnitPrice) || String(item.expectedUnitPrice).trim() === '' || !Number.isFinite(Number(item.expectedUnitPrice)) || Number(item.expectedUnitPrice) < 0 || Number(item.expectedUnitPrice) > 1e9)) throw batchFail('Invalid cart item');
    return { id, qty, ...(item.expectedUnitPrice !== undefined ? { expectedUnitPrice: roundMoney(Number(item.expectedUnitPrice)) } : {}), priceType: item.priceType === undefined ? 'retail' : item.priceType, ...(item.batchId !== undefined ? { batchId: item.batchId } : {}),
      ...(item.discountType !== undefined ? { discountType: item.discountType } : {}), ...(item.discountValue !== undefined ? { discountValue: item.discountValue } : {}), ...(item.vatRate !== undefined ? { vatRate: item.vatRate } : {}) };
  });
  if (!['number', 'string'].includes(typeof amountPaid) || String(amountPaid).trim() === '' || !Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0) throw batchFail('Invalid or insufficient payment');
  const requestId = body.requestId ?? randomUUID();
  if (!validBatchId(requestId) || requestId === 'initial') throw batchFail('productRestockInvalidRequest');
  return { requestId: requestId.toLowerCase(), cart, invoiceOrigin, clientName: clientName.trim(), ...(body.clientId ? { clientId: body.clientId } : {}), ...(paymentMethod !== undefined ? { paymentMethod } : {}), ...(vatRate !== undefined ? { vatRate } : {}), amountPaid: roundMoney(Number(amountPaid)), discountType: body.discountType ?? 'percent', discountValue: body.discountValue ?? 0 };
}

async function prepare(input, fingerprint, user, owner, actorRole) {
  const client = await resolveDocumentClient(input, owner), lines = [];
  for (const item of input.cart) {
    const product = await Product.findById(item.id);
    if (!product || String(product.idAdmin) !== String(owner)) throw batchFail('Product not found', 404);
    const batch = selectProductBatch(product, item.batchId);
    if (batch.quantite < item.qty) throw batchFail('productBatchStockChanged');
    let price;
    try { price = getProductSalePrice(batch, item.priceType); } catch (error) { throw batchFail(error.message); }
    if (item.expectedUnitPrice !== undefined && item.expectedUnitPrice !== roundMoney(price)) throw batchFail('productBatchStockChanged', 409);
    lines.push({ ...item, product, batch, price });
  }
  const stock = groupProductStock(lines);
  for (const entry of stock) {
    const product = lines.find(line => String(line.product._id) === entry.id).product;
    if (product.quantite < entry.qty || entry.batches.some(allocation => selectProductBatch(product, allocation.batchId).quantite < allocation.qty)) throw batchFail('productBatchStockChanged', 409);
  }
  let totals;
  try { totals = calculateCartTotals(lines, input.discountType, input.discountValue, input.vatRate); } catch (error) { throw batchFail(error.message); }
  if (input.amountPaid < totals.total) throw batchFail('Invalid or insufficient payment');
  const hasVat = input.invoiceOrigin === 'manual' || input.vatRate !== undefined || lines.some(line => line.vatRate !== undefined);
  const invoiceId = new mongoose.Types.ObjectId().toString(), date = new Date().toISOString();
  const sales = [], products = [];
  for (const [index, { product, batch, qty, price, priceType }] of lines.entries()) {
    const line = totals.lines[index], snapshot = { batchId: batch.batchId, batchNumber: batch.number };
    sales.push({ _id: new mongoose.Types.ObjectId().toString(), ...snapshot, idProduct: product._id, name: product.name, price, priceType, quantite: qty, invoiceId,
      saleAmount: line.totalTTC, profite: roundMoney(line.totalHT - (Number(batch.prix_achat || 0) + Number(batch.frais_unitaire || 0)) * qty), DateVante: date });
    products.push({ ...snapshot, idProduct: product._id, code: String(batch.barcode || product.barcode || ''), name: product.name, price, priceType, quantite: qty,
      subtotal: line.subtotal, discountType: line.discountType, discountValue: line.discountValue, discountAmount: line.discountAmount, TotalPrix: line.total,
      ...(hasVat ? { vatRate: line.vatRate, vatAmount: line.vatAmount, totalHT: line.totalHT, totalTTC: line.totalTTC, orderDiscountAmount: line.orderDiscountAmount } : {}) });
  }
  const facture = { _id: invoiceId, DateFacture: date, Product: products, nameEmp: user.name, ...client, invoiceOrigin: input.invoiceOrigin,
    ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}), ...(hasVat ? { vatRate: totals.vatRate, vatAmount: totals.vatAmount, totalHT: totals.totalHT } : {}),
    TotalQauntite: lines.reduce((sum, line) => sum + line.qty, 0), subtotal: totals.subtotal, discountType: totals.discountType, discountValue: totals.discountValue,
    discountAmount: totals.discountAmount, lineDiscountAmount: totals.lineDiscountAmount, orderDiscountAmount: totals.orderDiscountAmount,
    TotalPrix: totals.total, totalOrder: totals.total, amountPaid: input.amountPaid, PrixReture: roundMoney(input.amountPaid - totals.total) };
  return Checkout.create({ _id: invoiceId, idAdmin: owner, requestId: input.requestId, fingerprint, plan: { actor: { id: String(user._id), role: actorRole }, stock, sales, facture } });
}

export const AddVente = async (req, res) => {
  let prepared = false;
  try {
    const input = normalize(req.body);
    const user = (await AdminModel.findById(req.user.id)) || (await EmployeModel.findById(req.user.id));
    if (!user || user.isActive === false) throw batchFail('Unauthorized', 403);
    const actorRole = user.role === 'admin' ? 'admin' : 'Employe', owner = actorRole === 'admin' ? user._id : user.idAdmin;
    if (String(req.user.idAdmin) !== String(owner)) throw batchFail('Unauthorized', 403);
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const output = await withProductCheckoutLock(owner, async () => {
      let operation = await Checkout.findOne({ idAdmin: owner, requestId: input.requestId });
      if (!operation) {
        try { operation = await prepare(input, fingerprint, user, owner, actorRole); }
        catch (error) { if (error.code !== 11000) throw error; operation = await Checkout.findOne({ idAdmin: owner, requestId: input.requestId }); if (!operation) throw error; }
      }
      if (operation.fingerprint !== fingerprint || operation.plan.actor.id !== String(user._id)) throw batchFail('productRestockRequestConflict', 409);
      prepared = true;
      if (operation.status !== 'complete') {
        await reserveCheckoutStock(operation, owner, Checkout, 'productBatchStockChanged');
        const Model = actorRole === 'admin' ? AdminModel : EmployeModel;
        const saved = await Model.findOneAndUpdate({ _id: user._id, 'Facture._id': { $ne: operation._id } }, { $push: { ventes: { $each: operation.plan.sales }, Facture: operation.plan.facture } }, { new: true, runValidators: true });
        if (!saved && !(await Model.findById(user._id))?.Facture.some(invoice => String(invoice._id) === String(operation._id))) throw new Error('Checkout actor unavailable');
        await Checkout.updateOne({ _id: operation._id, idAdmin: owner }, { $set: { status: 'complete' } });
      }
      return { message: 'success Operation', facture: operation.plan.facture, ventes: operation.plan.sales, lastVentes: operation.plan.sales };
    });
    return res.status(201).json(output);
  } catch (error) {
    return res.status(error.status || (prepared ? 503 : 500)).json({ message: error.status ? error.message : prepared ? 'productCheckoutPending' : 'productCheckoutFailed' });
  }
};
