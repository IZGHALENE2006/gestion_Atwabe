import { ensureSfifaStyleBalances, changeSfifaTypeBalance, sfifaTargetSummary } from '../utils/sfifaStyleBalances.js';
import { protectTailoringSfifaDeletion } from '../utils/tailoringSfifaStock.js';
import { moduleOperationPermissions } from "../../shared/employeePermissions.js";
import mongoose from "mongoose";
import AdminModel from "../models/AdminModel.js";
import EmployeModel from "../models/EmployeModele.js";
import SfifaStock from "../models/SfifaStock.js";
import TailoringWorker from "../models/TailoringWorker.js";
import { protectWorkerMaterialDeletion } from '../utils/workerMaterials.js';
import { SFIFA_METER_TYPES, SFIFA_STOCK_GROUP_LIMIT, SFIFA_STOCK_LIMIT, SFIFA_STOCK_SCALE, sfifaQuantityUnits, sfifaStockBarcode, validateSfifaClassification, validateSfifaStock } from "../../shared/sfifaStock.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
const sameStyleMeters = (left, right) => left === undefined && right === undefined || Boolean(left && right && SFIFA_METER_TYPES.every(key => left[key] === right[key]));
const groupUnits = quantity => sfifaQuantityUnits(quantity, { max: SFIFA_STOCK_GROUP_LIMIT });
const publicRows = stock => {
  const base = { parentId: stock._id, width: stock.width, family: stock.family, __v: stock.__v ?? 0, createdAt: stock.createdAt, updatedAt: stock.updatedAt };
  const variants = stock.variants || [], unassigned = stock.unassignedQuantity ?? stock.quantity;
  const rows = variants.map(variant => ({ ...base, _id: variant._id, code: variant.code, quantity: variant.quantity, ...(variant.styleMeters ? sfifaTargetSummary(stock, variant._id) : {}), barcode: sfifaStockBarcode(variant), isUnassigned: false }));
  if (unassigned > 0 || (stock.variants === undefined && !stock.production?.length)) rows.push({ ...base, _id: stock._id, code: null, quantity: unassigned, ...(stock.unassignedStyleMeters ? sfifaTargetSummary(stock, stock._id) : {}), barcode: sfifaStockBarcode(stock), isUnassigned: true });
  return rows;
};
const publicMutation = (stock, code) => {
  const items = publicRows(stock);
  return { parentId: stock._id, ...items.find(item => !item.isUnassigned && item.code === code), items };
};
const prepareStock = stock => {
  if (stock.unassignedQuantity === undefined) stock.unassignedQuantity = stock.quantity;
  if (stock.variants === undefined) stock.variants = [];
};
const requireVersion = (body, stock) => {
  const raw = body?.version, version = typeof raw === "number" ? raw : /^\d+$/.test(raw || "") ? Number(raw) : NaN;
  if (!Number.isSafeInteger(version) || version !== stock.__v) throw fail("stockConflict", 409);
};
const quantityLimit = () => Object.assign(fail("invalidStock", 400), { fields: { quantity: "quantityLimit" } });
const sendError = (res, error, fallback = "saveFailed") => {
  if (error.message === "invalidStock") return res.status(400).json({ message: "invalidStock", fields: error.fields });
  if (error.name === "VersionError") return res.status(409).json({ message: "stockConflict" });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
};
async function accessFor(req, action) {
  if (!["admin", "Employe"].includes(req.user?.role)) throw fail("forbidden", 403);
  const admin = req.user.role === "admin";
  const actor = await (admin ? AdminModel : EmployeModel).findById(req.user.id).select("_id idAdmin isActive action moduleAccess operationPermissions");
  if (!actor || (!admin && !actor.isActive)) throw fail("forbidden", 403);
  const idAdmin = admin ? actor._id : actor.idAdmin;
  if (!mongoose.isObjectIdOrHexString(idAdmin)) throw fail("forbidden", 403);
  const permissions = moduleOperationPermissions(req.user.role, actor, 'sfifa');
  if (action && !(Array.isArray(action) ? action.some(key => permissions[key]) : permissions[action])) throw fail("forbidden", 403);
  return { idAdmin, createdBy: actor._id, permissions };
}
export async function listSfifaStock(req, res) {
  try {
    const { idAdmin, permissions } = await accessFor(req);
    const items = await SfifaStock.find({ idAdmin }).sort({ width: 1, family: 1 }).lean();
    res.json({ items: items.flatMap(publicRows), permissions });
  } catch (error) { sendError(res, error, "loadFailed"); }
}
export async function getSfifaStockDetails(req, res) {
  try {
    const { idAdmin } = await accessFor(req, 'details');
    if (!mongoose.isObjectIdOrHexString(req.params.id) || req.params.variantId && !mongoose.isObjectIdOrHexString(req.params.variantId)) throw fail('notFound', 404);
    const stock = await SfifaStock.findOne({ _id: req.params.id, idAdmin });
    if (!stock) throw fail('notFound', 404);
    await ensureSfifaStyleBalances(stock);
    const item = publicRows(stock).find(row => req.params.variantId ? String(row._id) === req.params.variantId.toLowerCase() && !row.isUnassigned : row.isUnassigned);
    if (!item) throw fail('notFound', 404);
    res.json({ item: { ...item, ...sfifaTargetSummary(stock, item._id) } });
  } catch (error) { sendError(res, error, 'loadDetailsFailed'); }
}
export async function addSfifaStock(req, res) {
  try {
    const { idAdmin, createdBy } = await accessFor(req, "add");
    const input = validateSfifaStock(req.body);
    const requestId = typeof req.body.requestId === "string" ? req.body.requestId.toLowerCase() : "";
    if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(requestId)) throw fail("invalidRequest", 400);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const processed = await SfifaStock.findOne({ idAdmin, "receipts.requestId": requestId });
        if (processed) {
          const receipt = processed.receipts.find(entry => entry.requestId === requestId);
          if (processed.width !== input.width || processed.family !== input.family || receipt.code !== input.code || receipt.quantity !== input.quantity || !sameStyleMeters(receipt.styleMeters, input.styleMeters)) throw fail("requestConflict", 409);
          return res.json(publicMutation(processed, input.code));
        }
        const existing = await SfifaStock.findOne({ idAdmin, width: input.width, family: input.family });
        const receipt = { requestId, quantity: input.quantity, code: input.code, ...(input.styleMeters ? { styleMeters: input.styleMeters } : {}), createdBy, date: new Date() };
        if (existing) {
          const previous = existing.receipts.find(entry => entry.requestId === requestId);
          if (previous) {
            if (previous.code !== input.code || previous.quantity !== input.quantity || !sameStyleMeters(previous.styleMeters, input.styleMeters)) throw fail("requestConflict", 409);
            return res.json(publicMutation(existing, input.code));
          }
          prepareStock(existing);
          await ensureSfifaStyleBalances(existing);
          const variant = existing.variants.find(entry => entry.code === input.code);
          const quantity = sfifaQuantityUnits(variant?.quantity || 0) + sfifaQuantityUnits(input.quantity);
          if (quantity > SFIFA_STOCK_LIMIT * SFIFA_STOCK_SCALE) throw quantityLimit();
          if (!variant) existing.variants.push({ code: input.code, quantity: 0, styleMeters: { single: 0, double: 0, gradient: 0 } });
          const target = existing.variants.find(row => row.code === input.code);
          for (const key of SFIFA_METER_TYPES) target.styleMeters[key] = Math.round((target.styleMeters[key] + (input.styleMeters?.[key] || 0)) * 1000) / 1000;
          target.quantity = quantity / SFIFA_STOCK_SCALE;
          existing.quantity = (groupUnits(existing.quantity) + sfifaQuantityUnits(input.quantity)) / SFIFA_STOCK_SCALE;
          existing.receipts.push(receipt);
          await existing.save();
          return res.status(201).json(publicMutation(existing, input.code));
        }
        const stock = await SfifaStock.create({ width: input.width, family: input.family, quantity: input.quantity, unassignedQuantity: 0, variants: [{ code: input.code, quantity: input.quantity, styleMeters: input.styleMeters || { single: 0, double: 0, gradient: 0 } }], unassignedStyleMeters: { single: 0, double: 0, gradient: 0 }, idAdmin, createdBy, receipts: [receipt] });
        return res.status(201).json(publicMutation(stock, input.code));
      } catch (error) {
        if (error.name !== "VersionError" && error.code !== 11000) throw error;
        if (attempt === 3) throw fail("stockConflict", 409);
      }
    }
  } catch (error) { sendError(res, error); }
}
export async function updateSfifaStock(req, res) {
  try {
    const { idAdmin } = await accessFor(req, "update");
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
    const stock = await SfifaStock.findOne({ _id: req.params.id, idAdmin });
    if (!stock) throw fail("notFound", 404);
    requireVersion(req.body, stock);
    prepareStock(stock);
    await ensureSfifaStyleBalances(stock);
    const input = validateSfifaClassification({ width: stock.width, family: stock.family, code: req.body?.code, quantity: req.body?.quantity }, stock.unassignedQuantity);
    const variant = stock.variants.find(entry => entry.code === input.code);
    const quantity = sfifaQuantityUnits(variant?.quantity || 0) + sfifaQuantityUnits(input.quantity);
    if (quantity > SFIFA_STOCK_LIMIT * SFIFA_STOCK_SCALE) throw quantityLimit();
    if (variant) variant.quantity = quantity / SFIFA_STOCK_SCALE;
    else stock.variants.push({ code: input.code, quantity: input.quantity });
    changeSfifaTypeBalance(stock, stock._id, -sfifaQuantityUnits(input.quantity));
    stock.unassignedQuantity = (sfifaQuantityUnits(stock.unassignedQuantity) - sfifaQuantityUnits(input.quantity)) / SFIFA_STOCK_SCALE;
    await stock.save();
    res.json(publicMutation(stock, input.code));
  } catch (error) { sendError(res, error); }
}

export async function updateSfifaVariant(req, res) {
  try {
    const { idAdmin } = await accessFor(req, "update");
    if (!mongoose.isObjectIdOrHexString(req.params.id) || !mongoose.isObjectIdOrHexString(req.params.variantId)) throw fail("notFound", 404);
    const stock = await SfifaStock.findOne({ _id: req.params.id, idAdmin });
    if (!stock) throw fail("notFound", 404);
    requireVersion(req.body, stock);
    const variant = stock.variants?.find(entry => String(entry._id) === req.params.variantId.toLowerCase());
    if (!variant) throw fail("notFound", 404);
    await ensureSfifaStyleBalances(stock);
    const input = validateSfifaStock({ width: stock.width, family: stock.family, code: variant.code, quantity: req.body?.quantity }, { allowZero: true });
    changeSfifaTypeBalance(stock, variant._id, sfifaQuantityUnits(input.quantity) - sfifaQuantityUnits(variant.quantity));
    stock.quantity = (groupUnits(stock.quantity) - sfifaQuantityUnits(variant.quantity) + sfifaQuantityUnits(input.quantity)) / SFIFA_STOCK_SCALE;
    variant.quantity = input.quantity;
    await stock.save();
    res.json(publicMutation(stock, input.code));
  } catch (error) { sendError(res, error); }
}

// Keep receipts and worker production when removing a visible stock entry.
export async function deleteSfifaStock(req, res) {
  try {
    const { idAdmin } = await accessFor(req, "delete");
    if (!mongoose.isObjectIdOrHexString(req.params.id) || (req.params.variantId && !mongoose.isObjectIdOrHexString(req.params.variantId))) throw fail("notFound", 404);
    const stock = await SfifaStock.findOne({ _id: req.params.id, idAdmin });
    if (!stock) throw fail("notFound", 404);
    const variant = req.params.variantId ? stock.variants?.find(entry => String(entry._id) === req.params.variantId.toLowerCase()) : null;
    if (req.params.variantId && !variant) return res.json({ parentId: stock._id, items: publicRows(stock) });
    if (!req.params.variantId && stock.unassignedQuantity === 0 && stock.variants !== undefined) return res.json({ parentId: stock._id, items: publicRows(stock) });
    requireVersion(req.body, stock);
    prepareStock(stock);
    const removed = variant ? variant.quantity : stock.unassignedQuantity;
    await protectTailoringSfifaDeletion(stock, new Set([String(variant?._id || stock._id)]));
    await protectWorkerMaterialDeletion(stock, new Set([String(variant?._id || stock._id)]), 'sfifa');
    if (variant) stock.variants = stock.variants.filter(entry => String(entry._id) !== String(variant._id));
    else { stock.unassignedQuantity = 0; stock.unassignedStyleMeters = { single: 0, double: 0, gradient: 0 }; }
    stock.quantity = (groupUnits(stock.quantity) - sfifaQuantityUnits(removed)) / SFIFA_STOCK_SCALE;
    await stock.save();
    res.json({ parentId: stock._id, items: publicRows(stock) });
  } catch (error) { sendError(res, error); }
}

export async function restockSfifaVariant(req, res) {
  try {
    const { idAdmin, createdBy } = await accessFor(req, "restock");
    if (!mongoose.isObjectIdOrHexString(req.params.id) || !mongoose.isObjectIdOrHexString(req.params.variantId)) throw fail("notFound", 404);
    const requestId = typeof req.body.requestId === "string" ? req.body.requestId.toLowerCase() : "";
    if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(requestId)) throw fail("invalidRequest", 400);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const stock = await SfifaStock.findOne({ _id: req.params.id, idAdmin });
        const variant = stock?.variants?.find(entry => String(entry._id) === req.params.variantId.toLowerCase());
        if (!variant) throw fail("notFound", 404);
        const input = validateSfifaStock({ width: stock.width, family: stock.family, code: variant.code, quantity: req.body.quantity });
        const processed = await SfifaStock.findOne({ idAdmin, "receipts.requestId": requestId });
        if (processed) {
          const receipt = processed.receipts.find(entry => entry.requestId === requestId);
          if (String(processed._id) !== String(stock._id) || receipt.workId || receipt.code !== variant.code || receipt.quantity !== input.quantity || receipt.styleMeters !== undefined) throw fail("requestConflict", 409);
          return res.json(publicMutation(processed, variant.code));
        }
        await ensureSfifaStyleBalances(stock);
        const units = sfifaQuantityUnits(variant.quantity) + sfifaQuantityUnits(input.quantity);
        if (units > SFIFA_STOCK_LIMIT * SFIFA_STOCK_SCALE) throw quantityLimit();
        variant.quantity = units / SFIFA_STOCK_SCALE;
        stock.quantity = (groupUnits(stock.quantity) + sfifaQuantityUnits(input.quantity)) / SFIFA_STOCK_SCALE;
        stock.receipts.push({ requestId, code: variant.code, quantity: input.quantity, createdBy, date: new Date() });
        await stock.save();
        return res.status(201).json(publicMutation(stock, variant.code));
      } catch (error) {
        if (error.name !== "VersionError" && error.code !== 11000) throw error;
        if (attempt === 3) throw fail("stockConflict", 409);
      }
    }
  } catch (error) { sendError(res, error); }
}

export async function listSfifaRestocks(req, res) {
  try {
    const { idAdmin } = await accessFor(req);
    if (!mongoose.isObjectIdOrHexString(req.params.id) || (req.params.variantId && !mongoose.isObjectIdOrHexString(req.params.variantId))) throw fail("notFound", 404);
    const stock = await SfifaStock.findOne({ _id: req.params.id, idAdmin });
    if (!stock) throw fail("notFound", 404);
    const row = publicRows(stock).find(item => req.params.variantId ? String(item._id) === req.params.variantId.toLowerCase() && !item.isUnassigned : item.isUnassigned);
    if (!row) throw fail("notFound", 404);
    const receipts = stock.receipts.filter(receipt => row.isUnassigned ? receipt.code === undefined || receipt.code === null : receipt.code === row.code);
    const workerIdFor = receipt => receipt.workerId || stock.production?.find(work => String(work._id) === String(receipt.workId))?.workerId;
    const workerIds = [...new Set(receipts.filter(receipt => !receipt.workerName).map(workerIdFor).filter(Boolean).map(String))];
    const workers = workerIds.length ? await TailoringWorker.find({ idAdmin, _id: { $in: workerIds } }).select("_id name").lean() : [];
    const names = new Map(workers.map(worker => [String(worker._id), worker.name]));
    const entries = receipts.map((receipt, index) => ({
      index, date: receipt.date, quantity: receipt.quantity,
      source: receipt.workerId || receipt.workId ? "worker" : "manual",
      workerName: receipt.workerId || receipt.workId ? receipt.workerName || names.get(String(workerIdFor(receipt))) || "" : "",
      ...(receipt.styleMeters ? { styleMeters: Object.fromEntries(SFIFA_METER_TYPES.map(key => [key, receipt.styleMeters[key]])) } : {}),
    })).sort((a, b) => new Date(b.date) - new Date(a.date) || b.index - a.index).map(entry => ({ date: entry.date, quantity: entry.quantity, source: entry.source, workerName: entry.workerName, ...(entry.styleMeters ? { styleMeters: entry.styleMeters } : {}) }));
    res.json({ entries, hasUnassignedHistory: !row.isUnassigned && stock.receipts.some(receipt => receipt.code === undefined || receipt.code === null) });
  } catch (error) { sendError(res, error, "loadHistoryFailed"); }
}
