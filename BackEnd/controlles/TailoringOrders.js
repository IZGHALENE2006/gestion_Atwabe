import mongoose from "mongoose";
import { createHash } from "node:crypto";
import AdminModel from "../models/AdminModel.js";
import EmployeModel from "../models/EmployeModele.js";
import Fabric from "../models/Fabric.js";
import TailoringOrder from "../models/TailoringOrder.js";
import { validateTailoringOrder, tailoringRemainingAmount, tailoringMoneyCents, tailoringOrderItems, tailoringGarmentType, tailoringProfitAmount, tailoringHasExpenses } from "../../shared/tailoring.js";
import { createTailoringDeliveryFinancials } from "../../shared/tailoringProfits.js";
import { priceDjellabaOrder } from "../utils/tailoringCosts.js";
import { tailoringOrderBarcode } from "../../shared/tailoringBarcode.js";
import { createTailoringReceipt, publicTailoringReceipt, tailoringPaymentReference } from '../../shared/tailoringReceipts.js';
import { saveTailoringPhoto, deleteTailoringPhoto, tailoringPhotoPath } from "../utils/tailoringPhotos.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
const publicPayment = (order, receipt, index) => ({ amount: receipt.amount, paidAt: receipt.paidAt, reference: tailoringPaymentReference(order, index), ...(receipt.document ? { document: publicTailoringReceipt(receipt.document) } : {}) });
const publicOrder = (document) => {
  const { photo, items: _items, requestId: _requestId, requestFingerprint: _fingerprint, paymentReceipts = [], deliveredBy: _deliveredBy, ...order } = typeof document.toObject === "function" ? document.toObject() : document;
  const totalPrice = order.totalPrice ?? 0, paidAmount = order.paidAmount ?? 0;
  const items = tailoringOrderItems({ ...order, items: _items, photo }).map(({ photo: itemPhoto, ...item }) => ({ ...item, hasPhoto: Boolean(itemPhoto) }));
  const garmentType = tailoringGarmentType(order);
  return { ...order, ...(order.customerReceipt ? { customerReceipt: publicTailoringReceipt(order.customerReceipt) } : {}), garmentType, ...((tailoringHasExpenses(order) || order.costing) ? { profitAmount: tailoringProfitAmount(totalPrice, order.expenseAmount) } : {}), items, deliveredAt: order.deliveredAt ?? null, addedPayments: paymentReceipts.map((receipt, index) => publicPayment(order, receipt, index)), barcode: tailoringOrderBarcode(order), totalPrice, paidAmount, remainingAmount: tailoringRemainingAmount(totalPrice, paidAmount), hasPhoto: Boolean(photo) };
};
const sendError = (res, error, fallback) => {
  if (error.message === "invalidOrder") return res.status(400).json({ message: "invalidOrder", fields: error.fields });
  if (error.name === "VersionError") return res.status(409).json({ message: "conflict" });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
};
async function accessFor(req, action) {
  if (!["admin", "Employe"].includes(req.user?.role)) throw fail("forbidden", 403);
  const admin = req.user.role === "admin";
  const actor = await (admin ? AdminModel : EmployeModel).findById(req.user.id).select("_id name role idAdmin isActive action");
  if (!actor || (!admin && !actor.isActive)) throw fail("forbidden", 403);
  const idAdmin = admin ? actor._id : actor.idAdmin;
  if (!mongoose.isObjectIdOrHexString(idAdmin)) throw fail("forbidden", 403);
  const permissions = { add: admin || actor.action?.add === true, update: admin || actor.action?.update === true };
  if (action && !permissions[action]) throw fail("forbidden", 403);
  return { idAdmin, createdBy: actor._id, creator: { id: actor._id, name: actor.name || "", role: req.user.role }, permissions };
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
  const value = validateTailoringOrder(req.body);
  if (current && tailoringGarmentType(value) !== tailoringGarmentType(current)) throw Object.assign(fail("invalidOrder", 400), { fields: { garmentType: "garmentTypeLocked" } });
  checkImageMapping(req, value);
  if (!value.items) {
    if (current?.items?.length) throw fail("itemsRequired", 400);
    return resolveFabric(value, idAdmin, current);
  }
  const previous = tailoringOrderItems(current), items = [];
  for (const item of value.items) items.push(await resolveFabric(item, idAdmin, previous.find(entry => entry.lineId === item.lineId)));
  const first = items[0];
  return priceDjellabaOrder({ ...value, items, fabricSource: first.fabricSource, fabricType: first.fabricType, fabricReference: first.fabricReference, fabricColor: first.fabricColor, fabricId: first.fabricId, colorId: first.colorId, ...(tailoringGarmentType(value) === "trousers" ? { trouserType: first.trouserType } : tailoringGarmentType(value) === "shirts" ? { shirtType: first.shirtType } : { sfifa: first.sfifa }) }, idAdmin, current);
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
export async function listTailoringOrders(req, res) {
  try {
    const { idAdmin, permissions } = await accessFor(req);
    const orders = await TailoringOrder.find({ idAdmin }).sort({ orderDate: -1, createdAt: -1, _id: -1 }).lean();
    res.json({ orders: orders.map(publicOrder), permissions });
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
    checkImageMapping(req, value);
    const normalizeFabric = item => ({ ...item, ...(item.fabricSource === "shop" ? { fabricType: "", fabricColor: "", fabricId: item.fabricId.toLowerCase(), colorId: item.colorId.toLowerCase() } : {}) });
    const normalized = { ...normalizeFabric(value), ...(value.items ? { items: value.items.map(normalizeFabric) } : {}) };
    const hash = createHash("sha256").update(JSON.stringify(normalized)).update(req.file?.buffer || Buffer.alloc(0));
    for (const image of req.files?.images || []) hash.update(String(image.buffer.length) + ":").update(image.buffer);
    requestFingerprint = hash.digest("hex");
    const existing = await TailoringOrder.findOne({ idAdmin, requestId });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw fail("requestConflict", 409);
      return res.json(publicOrder(existing));
    }
    const input = await attachPhotos(req, await orderInput(req, idAdmin), null, createdPhotos);
    const document = { ...input, _id: new mongoose.Types.ObjectId(), idAdmin, createdBy, creator, requestId, requestFingerprint };
    document.customerReceipt = createTailoringReceipt(document, { issuedAt: new Date() });
    const order = await TailoringOrder.create(document);
    committed = true;
    res.status(201).json(publicOrder(order));
  } catch (error) {
    if (!committed) await Promise.all(createdPhotos.map(deleteTailoringPhoto));
    if (error.code === 11000 && requestId) {
      try {
        const existing = await TailoringOrder.findOne({ idAdmin: req.tailoringAccess.idAdmin, requestId });
        if (existing?.requestFingerprint === requestFingerprint) return res.json(publicOrder(existing));
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
    const order = await TailoringOrder.findOne({ _id: req.params.id, idAdmin });
    if (!order) throw fail("notFound", 404);
    checkActionVersion(req, order);
    if (![undefined, false, true, "false", "true"].includes(req.body.removeImage)) throw fail("invalidOrder", 400);
    const previous = orderPhotos(order);
    const input = await attachPhotos(req, await orderInput(req, idAdmin, order), order, createdPhotos);
    // Preserve the prior delivery figures when an older delivered order is edited.
    if (order.deliveredAt) {
      if (!order.deliveryFinancials) order.deliveryFinancials = createTailoringDeliveryFinancials(order);
      // Unknown legacy costs may be supplied once without changing the delivery date or revenue.
      if (order.deliveryFinancials.expenseAmount === null && tailoringMoneyCents(input.expenseAmount) !== null) order.deliveryFinancials.expenseAmount = input.expenseAmount;
    }
    order.set(input);
    await order.save();
    committed = true;
    const retained = orderPhotos(order);
    await Promise.all([...previous].filter(photo => !retained.has(photo)).map(deleteTailoringPhoto));
    res.json(publicOrder(order));
  } catch (error) { if (!committed) await Promise.all(createdPhotos.map(deleteTailoringPhoto)); sendError(res, error, "saveFailed"); }
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
  return order;
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
      return res.json({ ...publicOrder(order), paymentReceipt: publicPayment(order, receipt, order.paymentReceipts.indexOf(receipt)) });
    }
    checkActionVersion(req, order);
    const paid = tailoringMoneyCents(order.paidAmount ?? 0), total = tailoringMoneyCents(order.totalPrice ?? 0);
    if (paid === null || total === null) throw fail("invalidPayment", 400);
    if (paid + amount > total) throw fail("paymentExceedsRemaining", 400);
    order.paidAmount = (paid + amount) / 100;
    const paidAt = new Date();
    const document = createTailoringReceipt(order, { kind: 'payment', reference: tailoringPaymentReference(order, order.paymentReceipts.length), issuedAt: paidAt, paymentAmount: amount / 100 });
    order.paymentReceipts.push({ requestId, amount: amount / 100, paidAt, createdBy: req.tailoringAccess.createdBy, document });
    // Money and its receipt commit together using the order's optimistic version.
    await order.save();
    res.json({ ...publicOrder(order), paymentReceipt: publicPayment(order, order.paymentReceipts.at(-1), order.paymentReceipts.length - 1) });
  } catch (error) { sendError(res, error, "saveFailed"); }
}
export async function deliverTailoringOrder(req, res) {
  try {
    const order = await actionOrder(req);
    if (order.deliveredAt) return res.json(publicOrder(order));
    checkActionVersion(req, order);
    order.deliveryFinancials = createTailoringDeliveryFinancials(order);
    order.deliveredAt = new Date();
    order.deliveredBy = req.tailoringAccess.createdBy;
    await order.save();
    res.json(publicOrder(order));
  } catch (error) { sendError(res, error, "saveFailed"); }
}

export { accessFor as tailoringAccessFor };
