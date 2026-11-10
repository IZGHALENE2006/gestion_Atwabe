import { moduleOperationPermissions } from "../../shared/employeePermissions.js";
import mongoose from "mongoose";
import AdminModel from "../models/AdminModel.js";
import EmployeModel from "../models/EmployeModele.js";
import Fabric from "../models/Fabric.js";
import FabricMovement from "../models/FabricMovement.js";
import Client from "../models/Client.js";
import TailoringOrder from "../models/TailoringOrder.js";
import { tailoringFabricProfitMovements } from "../../shared/tailoringFabricSales.js";
import { resolveDocumentClient } from "../utils/documentClient.js";
import { validateFabricSaleInput, calculateFabricSale, fabricSaleFingerprint } from "../../shared/fabricSales.js";
import { createFabricSaleFinancials, fabricProfitEntries, filterFabricProfits, groupFabricProfits, summarizeFabricProfits, validateFabricProfitQuery } from "../../shared/fabricProfits.js";
import { protectTailoringFabricDeletion } from '../utils/tailoringFabricStock.js';
import { protectWorkerMaterialDeletion } from '../utils/workerMaterials.js';
import { validateFabric, validateFabricUpdate, calculateFabricReduction, isFabricBarcode } from "../../shared/fabrics.js";

import { saveFabricPhoto, deleteFabricPhoto, fabricPhotoPath } from "../utils/fabricPhotos.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
const publicFabric = (fabric) => {
  const { tailoringOrderIds: _tailoringOrderIds, tailoringStockOperations: _tailoringStockOperations, movements: _movements, workerMaterialDebits: _workerMaterialDebits, photo, ...value } = typeof fabric.toObject === "function" ? fabric.toObject() : fabric;
  return { ...value, hasPhoto: Boolean(fabricPhotoPath(photo)) };
};

function publicMovement(movement) {
  const value = typeof movement.toObject === 'function' ? movement.toObject() : movement;
  if (!value.sale) return value;
  const { purchaseUnitPrice: _purchaseUnitPrice, costAmount: _costAmount, profitAmount: _profitAmount, ...sale } = value.sale;
  return { ...value, sale };
}

async function archiveMovements(fabric, trim = true) {
  if (!fabric.movements?.length) return;
  const movements = fabric.movements.map((entry) => entry.toObject());
  await FabricMovement.bulkWrite(movements.map((movement) => ({
    updateOne: { filter: { _id: movement._id, idAdmin: fabric.idAdmin }, update: { $setOnInsert: movement }, upsert: true },
  })));
  if (trim) await Fabric.updateOne({ _id: fabric._id, idAdmin: fabric.idAdmin, __v: fabric.__v }, { $pull: { movements: { _id: { $in: movements.map((entry) => entry._id) } } } });
}

async function accessFor(req, action) {
  if (!["admin", "Employe"].includes(req.user?.role)) throw fail("forbidden", 403);
  const admin = req.user.role === "admin";
  const actor = await (admin ? AdminModel : EmployeModel).findById(req.user.id).select("_id name idAdmin isActive action moduleAccess operationPermissions");
  if (!actor || (!admin && !actor.isActive)) throw fail("forbidden", 403);
  const idAdmin = admin ? actor._id : actor.idAdmin;
  if (!mongoose.isValidObjectId(idAdmin)) throw fail("forbidden", 403);
  const permissions = moduleOperationPermissions(req.user.role, actor, 'fabrics');
  if (action && !(Array.isArray(action) ? action.some(key => permissions[key]) : permissions[action])) throw fail("forbidden", 403);
  return { idAdmin, createdBy: actor._id, createdByName: String(actor.name || "").slice(0, 120), permissions };
}

function sendError(res, error, fallback) {
  if (error.message === "invalidFabric") return res.status(400).json({ message: "invalidFabric", fields: error.fields });
  if (error.code === 11000) return res.status(409).json({ message: "duplicateBarcode" });
  if (error.name === "VersionError") return res.status(409).json({ message: "conflict" });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
}

export const fabricWriteAccess = (action) => async (req, res, next) => {
  try { await accessFor(req, action); next(); }
  catch (error) { sendError(res, error, "saveFailed"); }
};

export async function getFabricPhoto(req, res) {
  try {
    const { idAdmin } = await accessFor(req);
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
    const fabric = await Fabric.findOne({ _id: req.params.id, idAdmin });
    const filename = fabricPhotoPath(fabric?.photo);
    if (!filename) throw fail("photoNotFound", 404);
    res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    res.sendFile(filename, { dotfiles: "deny" }, (error) => { if (error && !res.headersSent) res.status(404).json({ message: "photoNotFound" }); });
  } catch (error) { sendError(res, error, "imageLoadFailed"); }
}

export async function listFabrics(req, res) {
  try {
    const { idAdmin, permissions } = await accessFor(req);
    const fabrics = await Fabric.find({ idAdmin }).select("-movements").sort({ createdAt: -1, _id: -1 }).lean();
    res.json({ fabrics: fabrics.map(publicFabric), permissions });
  } catch (error) { sendError(res, error, "loadFailed"); }
}

export async function addFabric(req, res) {
  let uploaded = "", committed = false;
  try {
    const { idAdmin, createdBy } = await accessFor(req, "add");
    const input = validateFabric(req.body);
    const barcodes = input.colors.flatMap((color) => color.pieces.map((piece) => piece.barcode));
    const exists = await Fabric.exists({ idAdmin, "colors.pieces.barcode": { $in: barcodes } });
    if (exists) throw fail("duplicateBarcode", 409);
    uploaded = await saveFabricPhoto(req.file);
    const fabric = await Fabric.create({ ...input, photo: uploaded, idAdmin, createdBy });
    committed = true;
    res.status(201).json(publicFabric(fabric));
  } catch (error) { if (!committed) await deleteFabricPhoto(uploaded); sendError(res, error, "saveFailed"); }
}

export async function updateFabric(req, res) {
  let uploaded = "", committed = false;
  try {
    const { idAdmin, permissions } = await accessFor(req, ["update", "addColor", "addPiece"]);
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
    const fabric = await Fabric.findOne({ _id: req.params.id, idAdmin });
    if (!fabric) throw fail("notFound", 404);
    if (req.body?.version !== undefined && (!Number.isInteger(req.body.version) || req.body.version !== fabric.__v)) throw fail("conflict", 409);
    const input = validateFabricUpdate(req.body, fabric.toObject());
    if (!permissions.addColor && input.colors.some(color => !color._id)) throw fail("forbidden", 403);
    if (!permissions.addPiece && input.colors.some(color => color._id && color.pieces.some(piece => !piece._id))) throw fail("forbidden", 403);
    if (!permissions.update) {
      if (input.type !== fabric.type || (input.reference || '') !== (fabric.reference || '') || ["salePricePerMeter", "purchasePricePerMeter", "wholesalePricePerMeter"].some(key => input[key] !== fabric[key]) || req.file || req.body.removePhoto === true) throw fail("forbidden", 403);
      for (const original of fabric.colors) {
        const color = input.colors.find(row => String(row._id) === String(original._id));
        if (!color) continue;
        if (color.name !== original.name || (color.number || '') !== (original.number || '')) throw fail("forbidden", 403);
        for (const stored of original.pieces) {
          const piece = color.pieces.find(row => String(row._id) === String(stored._id));
          if (piece && (piece.meters !== stored.meters || piece.barcode !== stored.barcode)) throw fail("forbidden", 403);
        }
      }
    }
    const colorIds = new Set(input.colors.map(color => String(color._id)));
    const pieceIds = new Set(input.colors.flatMap(color => color.pieces.map(piece => String(piece._id))));
    if (!permissions.deleteColor && fabric.colors.some(color => !colorIds.has(String(color._id)))) throw fail("forbidden", 403);
    if (!permissions.deletePiece && fabric.colors.some(color => colorIds.has(String(color._id)) && color.pieces.some(piece => !pieceIds.has(String(piece._id))))) throw fail("forbidden", 403);
    const barcodes = input.colors.flatMap((color) => color.pieces.map((piece) => piece.barcode));
    const exists = await Fabric.exists({ idAdmin, _id: { $ne: fabric._id }, "colors.pieces.barcode": { $in: barcodes } });
    if (exists) throw fail("duplicateBarcode", 409);
    const retainedPieces = new Set(input.colors.flatMap(color => color.pieces.map(piece => String(piece._id))));
    const removedPieces = new Set(fabric.colors.flatMap(color => color.pieces).filter(piece => !retainedPieces.has(String(piece._id))).map(piece => String(piece._id)));
    if (removedPieces.size) { await protectWorkerMaterialDeletion(fabric, removedPieces, 'fabric'); await protectTailoringFabricDeletion(fabric, removedPieces); }
    const changedBarcodes = new Set(fabric.colors.flatMap(color => color.pieces).filter(piece => input.colors.flatMap(color => color.pieces).some(next => String(next._id) === String(piece._id) && next.barcode !== piece.barcode)).map(piece => String(piece._id)));
    if (changedBarcodes.size) await protectTailoringFabricDeletion(fabric, changedBarcodes);
    const previousPhoto = fabric.photo;
    uploaded = await saveFabricPhoto(req.file);
    fabric.set(input);
    if (uploaded) fabric.photo = uploaded;
    else if (req.body.removePhoto === true) fabric.photo = "";
    await fabric.save();
    committed = true;
    if (previousPhoto !== fabric.photo) await deleteFabricPhoto(previousPhoto);
    res.json(publicFabric(fabric));
  } catch (error) { if (!committed) await deleteFabricPhoto(uploaded); sendError(res, error, "saveFailed"); }
}

async function removeFabricEntry(req, res, kind) {
  try {
    const { idAdmin } = await accessFor(req, kind === "fabric" ? "delete" : kind === "color" ? "deleteColor" : "deletePiece");
    const ids = [req.params.id, ...(kind !== "fabric" ? [req.params.colorId] : []), ...(kind === "piece" ? [req.params.pieceId] : [])];
    if (ids.some((id) => !mongoose.isObjectIdOrHexString(id))) throw fail("notFound", 404);
    const fabric = await Fabric.findOne({ _id: req.params.id, idAdmin });
    if (!fabric) throw fail("notFound", 404);
    if (!Number.isInteger(req.body?.version) || req.body.version !== fabric.__v) throw fail("conflict", 409);

    const removedIds = kind === 'fabric' ? null : new Set(kind === 'piece' ? [req.params.pieceId] : (fabric.colors.id(req.params.colorId)?.pieces || []).map(piece => String(piece._id)));
    await protectWorkerMaterialDeletion(fabric, removedIds, 'fabric');
    await protectTailoringFabricDeletion(fabric, removedIds);

    if (kind !== "fabric") {
      const color = fabric.colors.id(req.params.colorId);
      if (!color) throw fail("notFound", 404);
      if (kind === "piece") {
        const piece = color.pieces.id(req.params.pieceId);
        if (!piece) throw fail("notFound", 404);
        color.pieces = color.pieces.filter((entry) => String(entry._id) !== String(piece._id));
      }
      if (kind === "color" || !color.pieces.length) {
        fabric.colors = fabric.colors.filter((entry) => String(entry._id) !== String(color._id));
      }
    }

    if (kind === "fabric" || !fabric.colors.length) {
      // Preserve pending history before the document can be removed.
      await archiveMovements(fabric, false);
      const result = await Fabric.deleteOne({ _id: fabric._id, idAdmin, __v: fabric.__v });
      if (result.deletedCount !== 1) throw fail("conflict", 409);
      await deleteFabricPhoto(fabric.photo);
      return res.json({ fabricId: String(fabric._id), fabric: null });
    }
    await fabric.save();
    res.json({ fabricId: String(fabric._id), fabric: publicFabric(fabric) });
  } catch (error) { sendError(res, error, "deleteFailed"); }
}

export const deleteFabric = (req, res) => removeFabricEntry(req, res, "fabric");
export const deleteFabricColor = (req, res) => removeFabricEntry(req, res, "color");
export const deleteFabricPiece = (req, res) => removeFabricEntry(req, res, "piece");

export const reduceFabricPiece = (req, res) => changeFabricPiece(req, res, false);
export const sellFabricPiece = (req, res) => changeFabricPiece(req, res, true);

export async function listFabricSaleClients(req, res) {
  try {
    const { idAdmin } = await accessFor(req, "sell");
    const clients = await Client.find({ idAdmin }).select("_id name").sort({ name: 1, _id: 1 }).lean();
    res.json({ clients: clients.map(client => ({ _id: client._id, name: client.name })) });
  } catch (error) { sendError(res, error, "loadSaleClientsFailed"); }
}

async function changeFabricPiece(req, res, selling) {
  let scope, input;
  try {
    const actor = await accessFor(req, selling ? "sell" : "reduce");
    const ids = [req.params.id, req.params.colorId, req.params.pieceId];
    if (ids.some((id) => !mongoose.isObjectIdOrHexString(id))) throw fail("notFound", 404);
    if (!Number.isInteger(req.body?.version) || req.body.version < 0) throw fail("conflict", 409);
    if (typeof req.body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.body.requestId)) throw fail("invalidReduction", 400);
    if (!isFabricBarcode(req.body.barcode)) throw fail("invalidBarcode", 400);
    input = { ...(selling ? validateFabricSaleInput(req.body) : calculateFabricReduction(req.body.meters, 1000000)), requestId: req.body.requestId.toLowerCase(), barcode: req.body.barcode, selling };
    if (selling && ((input.discountValue > 0 && !actor.permissions.discount) || (input.pricingMode === 'wholesale' && !actor.permissions.wholesale))) throw fail("forbidden", 403);
    scope = { _id: req.params.id, idAdmin: actor.idAdmin };
    const fabric = await Fabric.findOne(scope);
    const archived = await FabricMovement.findOne({ idAdmin: actor.idAdmin, fabricId: req.params.id, requestId: input.requestId });
    const previous = archived || fabric?.movements.find((entry) => entry.requestId === input.requestId);
    if (previous) return replyReduction(res, fabric, previous, req.params, input, false);
    if (!fabric) throw fail("notFound", 404);
    if (fabric.__v !== req.body.version) throw fail("conflict", 409);
    const color = fabric.colors.id(req.params.colorId);
    const piece = color?.pieces.id(req.params.pieceId);
    if (!piece || piece.barcode !== input.barcode) throw fail("notFound", 404);
    const result = calculateFabricReduction(input.meters, piece.meters);
    const sale = selling ? {
      ...calculateFabricSale(input, fabric),
      ...await resolveDocumentClient(input, actor.idAdmin),
      createdByName: actor.createdByName, createdByRole: req.user.role,
      requestFingerprint: fabricSaleFingerprint(input),
    } : undefined;
    if (sale) Object.assign(sale, createFabricSaleFinancials(result.meters, fabric.purchasePricePerMeter, sale.total));
    fabric.movements.push({
      idAdmin: actor.idAdmin, createdBy: actor.createdBy,
      fabricId: fabric._id, colorId: color._id, pieceId: piece._id, requestId: input.requestId,
      type: fabric.type, reference: fabric.reference, color: color.name, colorNumber: color.number,
      barcode: piece.barcode, beforeMeters: piece.meters, meters: result.meters, remainingMeters: result.remaining,
      ...(sale ? { sale } : {}), occurredAt: new Date(),
    });
    const movement = fabric.movements[fabric.movements.length - 1];
    piece.meters = result.remaining;
    // The stock change and its dated record commit in the same MongoDB document.
    await fabric.save();
    // A failed archive write leaves the record in the document for history and retry.
    try { await archiveMovements(fabric); } catch { /* Pending movements remain durable. */ }
    replyReduction(res, fabric, movement, req.params, input, true);
  } catch (error) {
    if (error.name === "VersionError" && scope && input) {
      try {
        const fabric = await Fabric.findOne(scope);
        const archived = await FabricMovement.findOne({ idAdmin: scope.idAdmin, fabricId: scope._id, requestId: input.requestId });
        const previous = archived || fabric?.movements.find((entry) => entry.requestId === input.requestId);
        if (previous) return replyReduction(res, fabric, previous, req.params, input, false);
      } catch (retryError) { return sendError(res, retryError, selling ? "saleFailed" : "reductionFailed"); }
    }
    sendError(res, error, selling ? "saleFailed" : "reductionFailed");
  }
}

function replyReduction(res, fabric, movement, params, input, created) {
  if (Boolean(movement.sale) !== input.selling || (input.selling && movement.sale.requestFingerprint !== fabricSaleFingerprint(input))) throw fail("requestConflict", 409);
  if (String(movement.colorId) !== params.colorId.toLowerCase() || String(movement.pieceId) !== params.pieceId.toLowerCase() || movement.barcode !== input.barcode || movement.meters !== input.meters) throw fail("requestConflict", 409);
  return res.status(created ? 201 : 200).json({ fabricId: String(movement.fabricId), fabric: fabric ? publicFabric(fabric) : null, movement: publicMovement(movement) });
}

export async function listFabricProfits(req, res) {
  try {
    const { idAdmin } = await accessFor(req, 'profits');
    const filters = validateFabricProfitQuery(req.query);
    // Pending records must be read before archived records: archiving may happen
    // between reads. Deduplicate by movement identity so it cannot count twice.
    const fabrics = await Fabric.find({ idAdmin }).select('movements').lean();
    const pending = fabrics.flatMap(fabric => fabric.movements || []).filter(row => row.sale);
    const archived = await FabricMovement.find({ idAdmin, sale: { $exists: true } }).select('-sale.requestFingerprint -sale.clientId').lean();
    const orders = await TailoringOrder.find({ idAdmin, $or: [{ 'items.fabricSale': { $exists: true } }, { 'deliveryFabricItems.fabricSale': { $exists: true } }] }).select('_id garmentType clientName cancelledAt deliveredAt deliveryFabricItems items.lineId items.fabricSource items.fabricType items.fabricReference items.fabricColor items.fabricMeters items.fabricSale items.costs items.fabricCost').lean();
    const entries = fabricProfitEntries([...archived, ...pending, ...tailoringFabricProfitMovements(orders)]);
    const visible = filterFabricProfits(entries, filters);
    const sellers = [...new Map(entries.map(row => [row.sellerId, { id: row.sellerId, name: row.sellerName, role: row.sellerRole }]).reverse()).values()].sort((a, b) => a.name.localeCompare(b.name));
    const limit = 50, sales = visible.slice(filters.offset, filters.offset + limit);
    res.json({ sales, summary: summarizeFabricProfits(visible), groups: groupFabricProfits(visible, filters.mode, filters.timeZone),
      sellers, totalCount: visible.length, offset: filters.offset, hasMore: filters.offset + sales.length < visible.length, nextOffset: filters.offset + sales.length });
  } catch (error) { sendError(res, error, 'loadProfitsFailed'); }
}

export async function listFabricMovements(req, res) {
  try {
    const { idAdmin } = await accessFor(req);
    const barcode = req.query.barcode ?? "";
    const offset = req.query.offset ?? "0";
    if (typeof barcode !== "string" || (barcode && !isFabricBarcode(barcode)) || typeof offset !== "string" || !/^\d{1,6}$/.test(offset)) throw fail("invalidHistoryQuery", 400);
    const start = Number(offset), limit = 50;
    // Read pending records first so archiving between the two reads cannot hide a record.
    const fabrics = await Fabric.find({ idAdmin }).select("movements").lean();
    const pending = fabrics.flatMap((fabric) => fabric.movements || []).filter((entry) => !barcode || entry.barcode === barcode);
    const archived = await FabricMovement.find({ idAdmin, ...(barcode ? { barcode } : {}) }).sort({ occurredAt: -1, _id: -1 }).limit(start + limit + pending.length + 1).lean();
    const unique = new Map([...archived, ...pending].map((entry) => [String(entry._id), entry]));
    const entries = [...unique.values()].sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt) || String(right._id).localeCompare(String(left._id)));
    const movements = entries.slice(start, start + limit);
    res.json({ movements: movements.map(publicMovement), hasMore: entries.length > start + limit, nextOffset: start + movements.length });
  } catch (error) { sendError(res, error, "loadMovementsFailed"); }
}
