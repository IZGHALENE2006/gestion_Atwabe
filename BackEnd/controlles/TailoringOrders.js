import Client from '../models/Client.js';
import { prepareTailoringClient, finishTailoringClient } from '../utils/tailoringClients.js';
import { resolveTailoringClient, prepareTailoringCredit, finishTailoringCredit, publicTailoringCreditOrder, payTailoringCredit, clientCreditSummaries } from "../utils/tailoringCredit.js";
import { tailoringCreditInput } from "../../shared/tailoringCredit.js";
import { currentSfifaViews } from "../utils/sfifaIdentity.js";
import { ensureSfifaStyleBalances } from "../utils/sfifaStyleBalances.js";
import SfifaStock from '../models/SfifaStock.js';
import { sfifaStockStyles, sfifaVariantIdentity } from '../../shared/sfifaStock.js';
import { hasTailoringSfifa } from '../utils/tailoringSfifaStock.js';
import { moduleOperationPermissions } from "../../shared/employeePermissions.js";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import AdminModel from "../models/AdminModel.js";
import EmployeModel from "../models/EmployeModele.js";
import Fabric from "../models/Fabric.js";
import TailoringOrder from "../models/TailoringOrder.js";
import { validateTailoringOrder, tailoringRemainingAmount, tailoringMoneyCents, tailoringOrderItems, tailoringGarmentType, tailoringProfitAmount, tailoringHasExpenses } from "../../shared/tailoring.js";
import { createTailoringDeliveryFinancials } from "../../shared/tailoringProfits.js";
import { saveTailoringFabricStock, resumeTailoringFabricStock } from "../utils/tailoringFabricStock.js";
import { applyTailoringAdjustments } from "../utils/tailoringAdjustments.js";
import { priceDjellabaOrder } from "../utils/tailoringCosts.js";
import { tailoringOrderBarcode } from "../../shared/tailoringBarcode.js";
import { createTailoringReceipt, publicTailoringReceipt, tailoringPaymentReference } from '../../shared/tailoringReceipts.js';
import { saveTailoringPhoto, deleteTailoringPhoto, tailoringPhotoPath } from "../utils/tailoringPhotos.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
const readyTailoringOrder = async order => finishTailoringCredit(await finishTailoringClient(await resumeTailoringFabricStock(order)));
const publicPayment = (order, receipt, index) => ({ amount: receipt.amount, paidAt: receipt.paidAt, reference: tailoringPaymentReference(order, index), ...(receipt.actor ? { actor: receipt.actor } : {}), ...(receipt.document ? { document: publicTailoringReceipt(receipt.document) } : {}) });
const publicOrder = async (document) => {
  const { stockOperation: _stockOperation, clientRegistration: _clientRegistration, photo, items: _items, requestId: _requestId, requestFingerprint: _fingerprint, paymentReceipts = [], deliveryPayment: _deliveryPayment, deliveryFabricItems: _deliveryFabricItems, deliveredBy: _deliveredBy, ...order } = typeof document.toObject === "function" ? document.toObject() : document;
  const totalPrice = order.totalPrice ?? 0, paidAmount = order.paidAmount ?? 0;
  const items = tailoringOrderItems({ ...order, items: _items, photo }).map(raw => { const { photo: itemPhoto, fabricSale: _fabricSale, ...item } = raw; return { ...item, hasPhoto: Boolean(itemPhoto) }; });
  const garmentType = tailoringGarmentType(order);
  return publicTailoringCreditOrder({ ...order, ...(order.customerReceipt ? { customerReceipt: publicTailoringReceipt(order.customerReceipt) } : {}), garmentType, ...((tailoringHasExpenses(order) || order.costing) ? { profitAmount: tailoringProfitAmount(totalPrice, order.expenseAmount) } : {}), items, deliveredAt: order.deliveredAt ?? null, addedPayments: paymentReceipts.map((receipt, index) => publicPayment(order, receipt, index)), barcode: tailoringOrderBarcode(order), totalPrice, paidAmount, remainingAmount: tailoringRemainingAmount(totalPrice, paidAmount), hasPhoto: Boolean(photo) }, document);
};
const sendError = (res, error, fallback) => {
  if (error.message === "invalidOrder") return res.status(400).json({ message: "invalidOrder", fields: error.fields });
  if (error.name === "VersionError") return res.status(409).json({ message: "conflict" });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
};
export async function accessFor(req, action) {
  if (!["admin", "Employe"].includes(req.user?.role)) throw fail("forbidden", 403);
  const admin = req.user.role === "admin";
  const actor = await (admin ? AdminModel : EmployeModel).findById(req.user.id).select("_id name role idAdmin isActive action moduleAccess operationPermissions");
  if (!actor || (!admin && !actor.isActive)) throw fail("forbidden", 403);
  const idAdmin = admin ? actor._id : actor.idAdmin;
  if (!mongoose.isObjectIdOrHexString(idAdmin)) throw fail("forbidden", 403);
  const permissions = moduleOperationPermissions(req.user.role, actor, 'tailoring');
  if (action && !(Array.isArray(action) ? action.some(key => permissions[key]) : permissions[action])) throw fail("forbidden", 403);
  return { idAdmin, createdBy: actor._id, creator: { id: actor._id, name: actor.name || "", role: req.user.role }, permissions, canRegisterClient: moduleOperationPermissions(req.user.role, actor, 'clients').add };
}
// Check current account permissions before accepting an image upload.
export const tailoringWriteAccess = (action) => async (req, res, next) => {
  try { req.tailoringAccess = await accessFor(req, action); next(); }
  catch (error) { sendError(res, error, "saveFailed"); }
};

async function resolveFabric(value, idAdmin, current) {
  if (value.fabricSource === "client") return { ...value, fabricId: null, colorId: null, fabricReference: "" };
  if (current?.fabricSource === "shop" && String(current.fabricId).toLowerCase() === value.fabricId.toLowerCase() && String(current.colorId || "").toLowerCase() === value.colorId.toLowerCase()) return { ...value, fabricType: current.fabricType, fabricReference: current.fabricReference, fabricColor: current.fabricColor };
  const fabric = await Fabric.findOne({ _id: value.fabricId, idAdmin });
  if (!fabric) throw fail("fabricNotFound", 404);
  const color = value.colorId ? fabric.colors.find(entry => String(entry._id) === value.colorId.toLowerCase()) : null;
  if (value.colorId && !color) throw fail("fabricNotFound", 404);
  return { ...value, fabricType: fabric.type, fabricReference: fabric.reference || "", fabricColor: color?.name || "", colorId: color?._id || null };
}
function checkImageMapping(req, value) {
  const images = req.files?.images || [];
  if (!value.items) { if (images.length) throw fail("imageUploadInvalid", 400); return; }
  if (req.file) throw fail("imageUploadInvalid", 400);
  const indices = value.items.filter(item => item.imageIndex !== undefined).map(item => item.imageIndex);
  if (indices.length !== images.length || new Set(indices).size !== indices.length || indices.some(index => index >= images.length)) throw fail("imageUploadInvalid", 400);
}
async function orderInput(req, idAdmin, current) {
  const value = await resolveTailoringClient(validateTailoringOrder(req.body), idAdmin, current);
  if (current && value.registerClient) throw Object.assign(fail('invalidOrder', 400), { fields: { registerClient: 'clientRegistrationNewOrderOnly' } });
  if (current && tailoringGarmentType(value) !== tailoringGarmentType(current)) throw Object.assign(fail("invalidOrder", 400), { fields: { garmentType: "garmentTypeLocked" } });
  checkImageMapping(req, value);
  if (!value.items) {
    if (current?.items?.length) throw fail("itemsRequired", 400);
    return resolveFabric(value, idAdmin, current);
  }
  const previous = tailoringOrderItems(current), items = [];
  for (const item of value.items) items.push(await resolveFabric(item, idAdmin, previous.find(entry => entry.lineId === item.lineId)));
  const first = items[0];
  const priced = await priceDjellabaOrder({ ...value, items, fabricSource: first.fabricSource, fabricType: first.fabricType, fabricReference: first.fabricReference, fabricColor: first.fabricColor, fabricId: first.fabricId, colorId: first.colorId, ...(tailoringGarmentType(value) === "trousers" ? { trouserType: first.trouserType } : tailoringGarmentType(value) === "shirts" ? { shirtType: first.shirtType } : { sfifa: first.sfifa }) }, idAdmin, current, req.tailoringAccess.creator);
  return applyTailoringAdjustments(priced, idAdmin, current, req.tailoringAccess.permissions);
}
const orderPhotos = order => new Set([order?.photo, ...(order?.items || []).map(item => item.photo)].filter(Boolean));
async function attachPhotos(req, value, current, createdPhotos) {
  if (!value.items) {
    const uploaded = await saveTailoringPhoto(req.file);
    if (uploaded) createdPhotos.push(uploaded);
    return { ...value, photo: uploaded || ([true, "true"].includes(req.body.removeImage) ? "" : current?.photo || "") };
  }
  const previous = tailoringOrderItems(current), items = [];
  for (const entry of value.items) {
    const { imageIndex, removeImage, ...item } = entry;
    const uploaded = await saveTailoringPhoto(imageIndex === undefined ? null : req.files.images[imageIndex]);
    if (uploaded) createdPhotos.push(uploaded);
    items.push({ ...item, photo: uploaded || (removeImage ? "" : previous.find(old => old.lineId === item.lineId)?.photo || "") });
  }
  return { ...value, items, photo: items[0].photo };
}
export async function listTailoringSfifaOptions(req, res) {
  try {
    const { idAdmin } = await accessFor(req, ['add', 'update']);
    const stocks = await SfifaStock.find({ idAdmin }).lean();
    for (const stock of stocks) await ensureSfifaStyleBalances(stock);
    const items = stocks.flatMap(stock => [...(stock.variants || []).map(row => ({ stockId: stock._id, variantId: row._id, ...sfifaVariantIdentity(stock, row), quantity: row.quantity, styles: sfifaStockStyles(stock, row.code, { variantId: row._id }) })), ...((stock.unassignedQuantity ?? stock.quantity) > 0 ? [{ stockId: stock._id, variantId: stock._id, width: stock.width, family: stock.family, quantity: stock.unassignedQuantity ?? stock.quantity, styles: sfifaStockStyles(stock) }] : [])]);
    res.json({ items });
  } catch (error) { sendError(res, error, 'sfifaStockUnavailable'); }
}
export async function listTailoringClientOptions(req, res) {
  try {
    const { idAdmin, permissions } = await accessFor(req, ['add', 'update', 'deliver']);
    const rows = await Client.find({ idAdmin }).sort({ name: 1 }).lean();
    const clients = permissions.creditDelivery ? await clientCreditSummaries(rows, idAdmin) : rows;
    res.json({ clients: clients.map(row => ({ _id: row._id, name: row.name, phone: row.phone, ...(permissions.creditDelivery ? { creditRemainingAmount: row.creditRemainingAmount, creditAmbiguous: row.creditAmbiguous } : {}) })) });
  } catch (error) { sendError(res, error, 'creditClientsFailed'); }
}
export async function listTailoringOrders(req, res) {
  try {
    const { idAdmin, permissions } = await accessFor(req);
    const orders = await TailoringOrder.find({ idAdmin }).sort({ orderDate: -1, createdAt: -1, _id: -1 }).lean();
    const ready = [];
    for (const row of orders) ready.push((row.stockOperation || row.creditDelivery || row.clientRegistration?.state === "prepared") ? await readyTailoringOrder(await TailoringOrder.findOne({ _id: row._id, idAdmin })) : row);
    res.json({ orders: await currentSfifaViews(idAdmin, await Promise.all(ready.filter(Boolean).map(publicOrder))), permissions });
  } catch (error) { sendError(res, error, "loadFailed"); }
}

export async function addTailoringOrder(req, res) {
  const createdPhotos = [];
  let requestId, requestFingerprint, committed = false;
  try {
    const { idAdmin, createdBy, creator } = req.tailoringAccess;
    requestId = typeof req.body?.requestId === "string" ? req.body.requestId.toLowerCase() : "";
    if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(requestId)) throw fail("invalidRequest", 400);
    const value = validateTailoringOrder(req.body);
    if (req.employeeAccount?.operationPermissions !== undefined && !req.tailoringAccess.permissions.payment && Number(value.paidAmount) > 0) throw fail("forbidden", 403);
    checkImageMapping(req, value);
    const normalizeFabric = item => ({ ...item, ...(item.fabricSource === "shop" ? { fabricType: "", fabricColor: "", fabricId: item.fabricId.toLowerCase(), colorId: item.colorId.toLowerCase() } : {}) });
    const normalized = { ...normalizeFabric(value), ...(value.items ? { items: value.items.map(normalizeFabric) } : {}) };
    const hash = createHash("sha256").update(JSON.stringify(normalized)).update(req.file?.buffer || Buffer.alloc(0));
    for (const image of req.files?.images || []) hash.update(String(image.buffer.length) + ":").update(image.buffer);
    requestFingerprint = hash.digest("hex");
    const existing = await TailoringOrder.findOne({ idAdmin, requestId });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw fail("requestConflict", 409);
      return res.json(await publicOrder(await readyTailoringOrder(existing)));
    }
    const input = await attachPhotos(req, await orderInput(req, idAdmin), null, createdPhotos);
    const document = { ...input, _id: new mongoose.Types.ObjectId(), idAdmin, createdBy, creator, requestId, requestFingerprint };
    const registeringClient = input.registerClient ? await prepareTailoringClient(document, req.tailoringAccess) : undefined;
    delete document.registerClient;
    if (input.deliverOnCredit) document.creditDelivery = await prepareTailoringCredit(document, req.tailoringAccess, registeringClient);
    document.customerReceipt = createTailoringReceipt(document, { issuedAt: new Date() });
    const order = (input.deductFabricStock || hasTailoringSfifa(input)) ? await saveTailoringFabricStock(document, { create: true }) : await TailoringOrder.create(document);
    committed = true;
    res.status(201).json(await publicOrder(await finishTailoringCredit(await finishTailoringClient(order))));
  } catch (error) {
    if (!committed && !error.tailoringStockPersisted) await Promise.all(createdPhotos.map(deleteTailoringPhoto));
    if (error.code === 11000 && requestId) {
      try {
        const existing = await TailoringOrder.findOne({ idAdmin: req.tailoringAccess.idAdmin, requestId });
        if (existing?.requestFingerprint === requestFingerprint) return res.json(await publicOrder(await readyTailoringOrder(existing)));
        if (existing) return res.status(409).json({ message: "requestConflict" });
      } catch { /* Return the stable save error below. */ }
    }
    sendError(res, error, "saveFailed");
  }
}
export async function updateTailoringOrder(req, res) {
  const createdPhotos = [];
  let committed = false;
  try {
    const { idAdmin } = req.tailoringAccess;
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
    let order = await TailoringOrder.findOne({ _id: req.params.id, idAdmin });
    if (!order) throw fail("notFound", 404);
    order = await readyTailoringOrder(order);
    checkActionVersion(req, order);
    if (order.cancelledAt) throw fail("orderCancelled", 409);
    if (order.creditDelivery || req.body.deliverOnCredit === true || req.body.deliverOnCredit === "true") throw fail("creditOrderLocked", 409);
    if (![undefined, false, true, "false", "true"].includes(req.body.removeImage)) throw fail("invalidOrder", 400);
    const previous = orderPhotos(order);
    const input = await attachPhotos(req, await orderInput(req, idAdmin, order), order, createdPhotos);
    if (!req.tailoringAccess.permissions.payment && tailoringMoneyCents(input.paidAmount) !== tailoringMoneyCents(order.paidAmount)) throw fail("forbidden", 403);
    // Preserve the prior delivery figures when an older delivered order is edited.
    if (order.deliveredAt) {
      if (!order.deliveryFinancials) order.deliveryFinancials = createTailoringDeliveryFinancials(order);
      // Unknown legacy costs may be supplied once without changing the delivery date or revenue.
      if (order.deliveryFinancials.expenseAmount === null && tailoringMoneyCents(input.expenseAmount) !== null) order.deliveryFinancials.expenseAmount = input.expenseAmount;
    }
    if (order.fabricStock && !input.deductFabricStock) throw fail("fabricStockRequired", 400);
    order.set(input);
    const savedOrder = order.fabricStock || hasTailoringSfifa(order) || input.deductFabricStock ? await saveTailoringFabricStock(order, { trackFabric: Boolean(order.fabricStock || input.deductFabricStock) }) : await order.save();
    committed = true;
    const retained = orderPhotos(savedOrder);
    await Promise.all([...previous].filter(photo => !retained.has(photo)).map(deleteTailoringPhoto));
    res.json(await publicOrder(savedOrder));
  } catch (error) { if (!committed && !error.tailoringStockPersisted) await Promise.all(createdPhotos.map(deleteTailoringPhoto)); sendError(res, error, "saveFailed"); }
}
export async function getTailoringPhoto(req, res) {
  try {
    const { idAdmin } = await accessFor(req);
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
    const order = await TailoringOrder.findOne({ _id: req.params.id, idAdmin });
    const photo = req.params.lineId ? tailoringOrderItems(order).find(item => item.lineId === req.params.lineId)?.photo : order?.photo;
    const filename = tailoringPhotoPath(photo);
    if (!filename) throw fail("photoNotFound", 404);
    res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    res.sendFile(filename, { dotfiles: "deny" }, (error) => { if (error && !res.headersSent) res.status(404).json({ message: "photoNotFound" }); });
  } catch (error) { sendError(res, error, "imageLoadFailed"); }
}

async function actionOrder(req) {
  const { idAdmin } = req.tailoringAccess;
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
  const order = await TailoringOrder.findOne({ _id: req.params.id, idAdmin });
  if (!order) throw fail("notFound", 404);
  return readyTailoringOrder(order);
}
function checkActionVersion(req, order) {
  const raw = req.body?.version;
  const version = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(version) || version !== order.__v) throw fail("conflict", 409);
}
export async function addTailoringPayment(req, res) {
  try {
    const amount = tailoringMoneyCents(req.body?.amount);
    if (amount === null || amount === 0) throw fail("invalidPayment", 400);
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId.toLowerCase() : "";
    if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(requestId)) throw fail("invalidRequest", 400);
    const order = await actionOrder(req);
    const receipt = order.paymentReceipts.find(entry => entry.requestId === requestId);
    // A retry after a lost response must never add the same payment again.
    if (receipt) {
      if (tailoringMoneyCents(receipt.amount) !== amount) throw fail("requestConflict", 409);
      return res.json({ ...await publicOrder(order), paymentReceipt: publicPayment(order, receipt, order.paymentReceipts.indexOf(receipt)) });
    }
    if (order.creditDelivery) {
      const paymentId = await payTailoringCredit(order, amount, requestId, req.tailoringAccess.creator);
      const output = await publicOrder(order);
      return res.json({ ...output, paymentReceipt: output.addedPayments.find(payment => payment.creditPaymentId === paymentId) });
    }
    if (order.cancelledAt) throw fail("orderCancelled", 409);
    checkActionVersion(req, order);
    const paid = tailoringMoneyCents(order.paidAmount ?? 0), total = tailoringMoneyCents(order.totalPrice ?? 0);
    if (paid === null || total === null) throw fail("invalidPayment", 400);
    if (paid + amount > total) throw fail("paymentExceedsRemaining", 400);
    order.paidAmount = (paid + amount) / 100;
    const paidAt = new Date();
    const document = createTailoringReceipt(order, { kind: 'payment', reference: tailoringPaymentReference(order, order.paymentReceipts.length), issuedAt: paidAt, paymentAmount: amount / 100 });
    order.paymentReceipts.push({ requestId, amount: amount / 100, paidAt, createdBy: req.tailoringAccess.createdBy, actor: req.tailoringAccess.creator, document });
    // Money and its receipt commit together using the order's optimistic version.
    await order.save();
    res.json({ ...await publicOrder(order), paymentReceipt: publicPayment(order, order.paymentReceipts.at(-1), order.paymentReceipts.length - 1) });
  } catch (error) { sendError(res, error, "saveFailed"); }
}
export async function deliverTailoringOrder(req, res) {
  try {
    // Older clients can still deliver without recording a payment. New clients
    // commit the payment, receipt and delivery intent in the same order save.
    const collecting = Object.hasOwn(req.body, 'paymentAmount');
    const amount = collecting ? tailoringMoneyCents(req.body.paymentAmount) : 0;
    const requestId = typeof req.body.requestId === 'string' ? req.body.requestId.toLowerCase() : '';
    if (amount === null) throw fail('invalidDeliveryPayment', 400);
    if (collecting && !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(requestId)) throw fail('invalidRequest', 400);
    if (amount > 0 && !req.tailoringAccess.permissions.payment) throw fail('forbidden', 403);
    const order = await actionOrder(req);
    if (order.cancelledAt) throw fail("orderCancelled", 409);
    const flag = req.body.deliverOnCredit;
    const credit = tailoringCreditInput({ clientId: order.clientId ? String(order.clientId) : undefined, deliverOnCredit: flag, registerClient: !order.clientId && [true, 'true'].includes(flag) });
    const output = async saved => {
      const result = await publicOrder(saved);
      const index = collecting ? saved.paymentReceipts.findIndex(row => row.requestId === requestId) : -1;
      return index < 0 ? result : { ...result, paymentReceipt: publicPayment(saved, saved.paymentReceipts[index], index) };
    };
    if (order.deliveredAt) {
      if (collecting && (!order.deliveryPayment || order.deliveryPayment.requestId !== requestId)) throw fail('conflict', 409);
      if (collecting && (tailoringMoneyCents(order.deliveryPayment.amount) !== amount || order.deliveryPayment.deliverOnCredit !== Boolean(credit.deliverOnCredit))) throw fail('requestConflict', 409);
      return res.json(await output(order));
    }
    checkActionVersion(req, order);
    if (collecting) {
      if (order.paymentReceipts.some(row => row.requestId === requestId)) throw fail('requestConflict', 409);
      const remaining = tailoringRemainingAmount(order.totalPrice, order.paidAmount);
      if (remaining === null) throw fail('invalidDeliveryPayment', 400);
      if (amount > tailoringMoneyCents(remaining)) throw fail('paymentExceedsRemaining', 400);
      if (amount > 0) {
        order.paidAmount = (tailoringMoneyCents(order.paidAmount) + amount) / 100;
        const paidAt = new Date();
        const document = createTailoringReceipt(order, { kind: 'payment', reference: tailoringPaymentReference(order, order.paymentReceipts.length), issuedAt: paidAt, paymentAmount: amount / 100 });
        order.paymentReceipts.push({ requestId, amount: amount / 100, paidAt, createdBy: req.tailoringAccess.createdBy, actor: req.tailoringAccess.creator, document });
      }
      order.deliveryPayment = { requestId, amount: amount / 100, deliverOnCredit: Boolean(credit.deliverOnCredit) };
    }
    if (credit.deliverOnCredit) {
      if (!req.tailoringAccess.permissions.creditDelivery) throw fail('forbidden', 403);
      // Delivery always belongs to the original order owner; a request cannot
      // redirect the balance to another client, including an unlinked order.
      if (req.body.clientId != null && req.body.clientId !== '' && (typeof req.body.clientId !== 'string' || req.body.clientId.toLowerCase() !== String(order.clientId || '').toLowerCase())) throw fail('creditOwnerFixed', 409);
      const registeringClient = order.clientId ? undefined : await prepareTailoringClient(order, req.tailoringAccess, { delivery: true });
      order.creditDelivery = await prepareTailoringCredit(order, req.tailoringAccess, registeringClient);
      await order.save();
      return res.json(await output(await finishTailoringCredit(await finishTailoringClient(order))));
    }
    if (order.costing?.pricingVersion >= 2 || order.fabricSalesVersion === 1) order.deliveryFabricItems = order.items.map(item => item.toObject());
    order.deliveryFinancials = createTailoringDeliveryFinancials(order);
    order.deliveredAt = new Date();
    order.deliveredBy = req.tailoringAccess.createdBy;
    await order.save();
    res.json(await output(order));
  } catch (error) { sendError(res, error, "saveFailed"); }
}

export async function cancelTailoringOrder(req, res) {
  try {
    const order = await actionOrder(req);
    // A lost response or repeated click must not replace the original audit entry.
    if (order.cancelledAt) return res.json(await publicOrder(order));
    checkActionVersion(req, order);
    if (!order.deliveredAt && !order.fabricStock && !order.sfifaStock) throw fail("orderNotDelivered", 409);
    if (order.deliveredAt) order.deliveryFinancials ||= createTailoringDeliveryFinancials(order);
    order.cancelledAt = new Date();
    order.cancelledBy = req.tailoringAccess.creator;
    // Return reserved materials only when cancellation occurs before delivery.
    const savedOrder = (order.fabricStock || order.sfifaStock) ? await saveTailoringFabricStock(order) : await order.save();
    res.json(await publicOrder(await finishTailoringCredit(savedOrder)));
  } catch (error) { sendError(res, error, "saveFailed"); }
}

export { accessFor as tailoringAccessFor };
