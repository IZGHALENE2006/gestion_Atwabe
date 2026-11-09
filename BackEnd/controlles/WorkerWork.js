import { isShopFlowOrigin, shopFlowOriginId, shopWorkBarcode, SHOP_FLOW_GARMENTS } from '../../shared/workerShopFlow.js';
import { loadShopFlowWorks, shopFlowNames, publicShopOption, resolveShopFlow, requireNoLaterShopStage, attachShopFlowState } from '../utils/workerShopFlow.js';
import { workerCompletionEarning } from "../../shared/workerPayroll.js";
import Fabric from '../models/Fabric.js';
import SfifaStock from '../models/SfifaStock.js';
import { usesWorkerMaterials, supportsWorkerMaterialHistory, workerMaterialInputKey, workerMaterialRows, workerPieceSelectionKey } from '../../shared/workerMaterials.js';
import { archiveWorkerAssignment, makeWorkerMaterialOperation, requireWorkerMaterialsReady, resolveWorkerMaterials, resumeWorkerMaterials } from '../utils/workerMaterials.js';
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import TailoringWorker from "../models/TailoringWorker.js";
import WorkerWork from "../models/WorkerWork.js";
import TailoringOrder from "../models/TailoringOrder.js";
import { tailoringOrderItems, tailoringGarmentType } from "../../shared/tailoring.js";
import { tailoringOrderBarcode } from "../../shared/tailoringBarcode.js";
import { workerAccessFor, publicWorker } from "./TailoringWorkers.js";
import { workerCategories } from "../../shared/workers.js";
import { WORK_TRACKING_CATEGORIES, workerOrderGarmentTypes, applyWorkerIncrease, nextWorkSequence, workerWorkType, remainingWorkQuantity, validateWorkerCompletion, validateWorkerIncrease, validateWorkerWork } from "../../shared/workerWork.js";
import { assignSfifaWork, changeSfifaWork, completeSfifaWork, findSfifaWork, listSfifaWork } from "../utils/sfifaProduction.js";

import { loadClientAssignments, blockingAssignments, describeBlockingAssignments, withOrderAssignmentLock } from "../utils/workerAvailability.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
const sameCompletion = (event, quantity, body) => event?.quantity === quantity && (event.lineIds === undefined || workerPieceSelectionKey(event.lineIds) === workerPieceSelectionKey(body?.lineIds));
const workLockKey = work => (shopFlowOriginId(work) ? `shop-flow:${shopFlowOriginId(work)}` : undefined) || (work.tailoring || work.archivedTailoring)?.orderId || (usesWorkerMaterials(work.category, work.workType, work.garmentType) ? `worker-material:${work.requestId}` : undefined);
const publicWork = work => ({
  ...(shopWorkBarcode(work) ? { shopBarcode: shopWorkBarcode(work) } : {}),
  ...(work.shopFlow ? { shopFlow: work.shopFlow } : {}),
  ...(work.flow ? { flow: work.flow } : {}),
  ...(work.materialOperations?.length || work.materialCancellation ? { materials: workerMaterialRows(work), materialStatus: work.materialStatus, ...(work.cancelledAt ? { cancelledAt: work.cancelledAt } : {}) } : {}),
  ...(work.unitWage !== undefined ? { unitWage: work.unitWage } : {}),
  _id: work._id, productName: work.productName, category: work.category, quantity: work.quantity,
  ...(work.garmentType ? { garmentType: work.garmentType } : {}),
  workType: workerWorkType(work), ...(work.tailoring ? { tailoring: work.tailoring } : {}),
  ...(work.category === "trousers" && work.trouserType ? { trouserType: work.trouserType } : {}),
  ...(work.shopTrouser ? { shopTrouser: work.shopTrouser } : {}),
  completedQuantity: work.completedQuantity, remainingQuantity: remainingWorkQuantity(work),
  ...(work.category === "sfifa" ? { sfifa: { width: work.sfifa.width, family: work.sfifa.family, code: work.sfifa.code } } : {}),
  __v: work.__v ?? 0, createdAt: work.createdAt, updatedAt: work.updatedAt,
  completions: work.completions.map(event => ({ _id: event._id, quantity: event.quantity, before: event.before, after: event.after, date: event.date, ...(event.lineIds ? { lineIds: event.lineIds } : {}), ...(event.earningAmount !== undefined ? { earningAmount: event.earningAmount, earningMonth: event.earningMonth } : {}) })),
  additions: (work.additions || []).map(event => ({ _id: event._id, quantity: event.quantity, before: event.before, after: event.after, date: event.date, ...(event.lineIds ? { lineIds: event.lineIds } : {}) })),
});
const sendError = (res, error, fallback = "saveWorkFailed") => {
  if (error.message === "invalidWork") return res.status(400).json({ message: "invalidWork", fields: error.fields });
  if (error.message === "garmentInProgress") return res.status(409).json({ message: "garmentInProgress", blockers: error.blockers });
  if (error.name === "VersionError" || error.code === 11000) return res.status(409).json({ message: "workConflict" });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
};
const requestIdFor = input => {
  const value = typeof input?.requestId === "string" ? input.requestId.toLowerCase() : "";
  if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(value)) throw fail("invalidRequest", 400);
  return value;
};
async function workerFor(req, idAdmin) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
  const worker = await TailoringWorker.findOne({ _id: req.params.id, idAdmin });
  if (!worker) throw fail("notFound", 404);
  return worker;
}
const garmentSnapshot = item => ({ lineId: item.lineId, fabricSource: item.fabricSource, fabricType: item.fabricType, fabricColor: item.fabricColor || "", fabricReference: item.fabricReference || "", ...(item.sfifa?.width ? { sfifa: { width: item.sfifa.width, style: item.sfifa.style, color1: item.sfifa.color1 || "", color2: item.sfifa.color2 || "" } } : {}), ...(item.trouserType ? { trouserType: item.trouserType } : {}), ...(item.shirtType ? { shirtType: item.shirtType } : {}) });
const assignedLines = (works, orderId) => new Set(works.filter(work => work.workType === "client" && String(work.tailoring?.orderId) === String(orderId)).flatMap(work => work.tailoring.lineIds));
async function resolveClientWork(input, idAdmin) {
  const order = await TailoringOrder.findOne({ _id: input.orderId, idAdmin });
  if (!order || !workerOrderGarmentTypes(input.category).includes(tailoringGarmentType(order))) throw fail("orderNotFound", 404);
  if (order.deliveredAt) throw fail("orderAlreadyDelivered", 409);
  const items = tailoringOrderItems(order).filter(item => input.lineIds.includes(item.lineId));
  if (items.length !== input.lineIds.length) throw fail("orderGarmentsChanged", 409);
  const trouserType = input.category === "trousers" ? items[0]?.trouserType : undefined;
  if (input.category === "trousers" && items.some(item => item.trouserType !== trouserType)) throw Object.assign(fail("invalidWork", 400), { fields: { lineIds: "mixedTrouserTypes" } });
  const works = await loadClientAssignments(idAdmin, order._id);
  const assigned = assignedLines(input.category === "sfifa" ? [] : works.filter(work => work.category === input.category), order._id);
  if (input.lineIds.some(id => assigned.has(id))) throw fail("garmentAlreadyAssigned", 409);
  const pending = blockingAssignments(works, order._id, input.category, input.lineIds);
  if (pending.length) {
    const blockers = (await describeBlockingAssignments(pending, idAdmin)).map(({ category, workerName, lineIds }) => ({ category, workerName, lineIds }));
    throw Object.assign(fail("garmentInProgress", 409), { blockers });
  }
  return { ...(input.unitWage !== undefined ? { unitWage: input.unitWage } : {}), workType: "client", category: input.category, ...(trouserType ? { trouserType } : {}), productName: input.category === "sfifa" ? "Sfifa" : order.clientName, quantity: input.category === "sfifa" ? input.quantity : items.length, ...(input.category === "sfifa" ? { sfifa: input.sfifa } : {}), tailoring: { garmentType: tailoringGarmentType(order), orderId: order._id, lineIds: input.lineIds, clientName: order.clientName, phone: order.phone, barcode: tailoringOrderBarcode(order), orderDate: order.orderDate, readyDate: order.readyDate, items: items.map(garmentSnapshot) } };
}
export async function listWorkerOrderOptions(req, res) {
  try {
    const { idAdmin } = await workerAccessFor(req, ["assign", "increase"]);
    const worker = await workerFor(req, idAdmin), category = req.query.category;
    if (!WORK_TRACKING_CATEGORIES.includes(category)) throw fail("invalidWorkCategory", 400);
    if (!workerCategories(worker).includes(category)) throw fail("workerSectionChanged", 409);
    const requestedType = req.query.garmentType;
    if (requestedType !== undefined && (typeof requestedType !== "string" || !workerOrderGarmentTypes(category).includes(requestedType))) throw fail("invalidWorkCategory", 400);
    const [orders, works] = await Promise.all([
      TailoringOrder.find({ idAdmin }).select("clientName phone orderDate readyDate deliveredAt garmentType items fabricSource fabricType fabricReference fabricColor sfifa totalPrice trouserType shirtType").sort({ orderDate: -1, createdAt: -1 }).lean(),
      loadClientAssignments(idAdmin),
    ]);
    const blockers = await describeBlockingAssignments(blockingAssignments(works, undefined, category), idAdmin);
    res.json({ orders: orders.filter(order => !order.deliveredAt && workerOrderGarmentTypes(category).includes(tailoringGarmentType(order)) && (!requestedType || tailoringGarmentType(order) === requestedType)).map(order => {
      const assigned = assignedLines(category === "sfifa" ? [] : works.filter(work => work.category === category), order._id);
      return { _id: order._id, garmentType: tailoringGarmentType(order), clientName: order.clientName, phone: order.phone, barcode: tailoringOrderBarcode(order), readyDate: order.readyDate, items: tailoringOrderItems(order).map((item, index) => {
        const blockedBy = assigned.has(item.lineId) ? [] : blockers.filter(blocker => blocker.orderId === String(order._id) && blocker.lineIds.includes(item.lineId)).map(({ category, workerName }) => ({ category, workerName }));
        return { ...garmentSnapshot(item), number: index + 1, available: !assigned.has(item.lineId) && !blockedBy.length, blockedBy };
      }) };
    }).filter(order => order.items.some(item => item.available || item.blockedBy.length)) });
  } catch (error) { sendError(res, error, "loadOrdersFailed"); }
}
export async function listWorkerShopOptions(req, res) {
  try {
    const { idAdmin } = await workerAccessFor(req, 'assign'), worker = await workerFor(req, idAdmin);
    const { category, garmentType } = req.query;
    if (worker.deletedAt) throw fail('workerDeleted', 409);
    if (!['finishing', 'mesbanto'].includes(category) || !SHOP_FLOW_GARMENTS.includes(garmentType)) throw fail('invalidShopSection', 400);
    if (!workerCategories(worker).includes(category)) throw fail('workerSectionChanged', 409);
    const works = await loadShopFlowWorks(idAdmin), names = await shopFlowNames(works, idAdmin);
    res.json({ works: works.filter(work => !work.deletedAt && isShopFlowOrigin(work) && work.garmentType === garmentType).map(work => publicShopOption(work, works, names, category)) });
  } catch (error) { sendError(res, error, 'loadShopWorkFailed'); }
}
export async function listWorkerWork(req, res) {
  try {
    const { idAdmin, permissions } = await workerAccessFor(req);
    const worker = await workerFor(req, idAdmin);
    const category = req.query.category;
    if (!WORK_TRACKING_CATEGORIES.includes(category)) throw fail("invalidWorkCategory", 400);
    const works = category === "sfifa" ? await listSfifaWork(idAdmin, worker._id) : await WorkerWork.find({ idAdmin, workerId: worker._id, category }).sort({ createdAt: -1, _id: -1 }).lean();
    res.json({ worker: publicWorker(worker), category, works: (await attachShopFlowState(works.filter(work => !work.deletedAt), idAdmin)).map(publicWork), permissions, canAssign: !worker.deletedAt && workerCategories(worker).includes(category) });
  } catch (error) { sendError(res, error, "loadWorkFailed"); }
}
export async function listWorkerMaterialOptions(req, res) {
  try {
    const { idAdmin } = await workerAccessFor(req, ["assign", "increase"]), worker = await workerFor(req, idAdmin);
    if (!workerCategories(worker).includes('machine')) throw fail('workerSectionChanged', 409);
    const [fabrics, sfifa] = await Promise.all([Fabric.find({ idAdmin }).select('type reference colors').lean(), SfifaStock.find({ idAdmin }).select('width family variants quantity unassignedQuantity').lean()]);
    res.json({ fabrics: fabrics.map(fabric => ({ _id: fabric._id, type: fabric.type, reference: fabric.reference, colors: fabric.colors })), sfifa: sfifa.flatMap(stock => [...(stock.variants || []).map(variant => ({ _id: variant._id, parentId: stock._id, width: stock.width, family: stock.family, code: variant.code, quantity: variant.quantity })), ...((stock.unassignedQuantity ?? stock.quantity) > 0 ? [{ _id: stock._id, parentId: stock._id, width: stock.width, family: stock.family, quantity: stock.unassignedQuantity ?? stock.quantity }] : [])]) });
  } catch (error) { sendError(res, error, 'loadMaterialsFailed'); }
}
export async function listWorkerFabricOptions(req, res) {
  try {
    const { idAdmin } = await workerAccessFor(req, ['assign', 'increase']), worker = await workerFor(req, idAdmin);
    if (worker.deletedAt) throw fail('workerDeleted', 409);
    if (!workerCategories(worker).includes('trousers')) throw fail('workerSectionChanged', 409);
    const fabrics = await Fabric.find({ idAdmin }).select('type reference').sort({ type: 1, _id: 1 }).lean();
    res.json({ fabrics: fabrics.map(fabric => ({ _id: fabric._id, type: fabric.type, reference: fabric.reference || '' })) });
  } catch (error) { sendError(res, error, 'loadMaterialsFailed'); }
}
async function resolveShopTrouser(input, idAdmin) {
  const fabric = await Fabric.findOne({ _id: input.shopTrouser.fabricId, idAdmin });
  if (!fabric) throw fail('materialStockUnavailable', 409);
  return { ...input, productName: fabric.type, shopTrouser: { ...input.shopTrouser, fabricType: fabric.type, fabricReference: fabric.reference || '' } };
}
export async function addWorkerWork(req, res) {
  let access, requestId, fingerprint, input;
  try {
    access = await workerAccessFor(req, "assign");
    const worker = await workerFor(req, access.idAdmin);
    if (worker.deletedAt) throw fail("workerDeleted", 409);
    requestId = requestIdFor(req.body);
    // Honor an exact retry of an older unlinked trouser assignment; new client work requires an order.
    const legacy = req.body?.category === "trousers" && req.body?.workType === "client" && !req.body.orderId
      ? await WorkerWork.findOne({ idAdmin: access.idAdmin, requestId }) : null;
    input = validateWorkerWork(req.body, { allowLegacyTrouserClient: Boolean(legacy && legacy.category === "trousers" && legacy.workType === "client" && !legacy.tailoring) });
    fingerprint = createHash("sha256").update(JSON.stringify({ ...input, workerId: String(worker._id) })).digest("hex");
    return await withOrderAssignmentLock(access.idAdmin, (input.shopOriginId ? `shop-flow:${input.shopOriginId}` : undefined) || input.orderId || (input.materials ? `worker-material:${requestId}` : undefined), async () => {
      if (input.category === "sfifa") {
        const saved = await assignSfifaWork({ input, ...access, workerId: worker._id, requestId, fingerprint, canAssign: workerCategories(worker).includes("sfifa"), resolveInput: input.orderId ? () => resolveClientWork(input, access.idAdmin) : undefined });
        return res.status(saved.status).json(publicWork(saved.work));
      }
      const existing = await WorkerWork.findOne({ idAdmin: access.idAdmin, requestId });
      if (existing) {
        if (existing.deletedAt) throw fail("workDeleted", 409);
        if (existing.requestFingerprint !== fingerprint) throw fail("workRequestConflict", 409);
        await resumeWorkerMaterials(existing);
        return res.json(publicWork(existing));
      }
      if (!workerCategories(worker).includes(input.category)) throw fail("workerSectionChanged", 409);
      const details = input.shopOriginId ? await resolveShopFlow(input, access.idAdmin) : input.orderId ? await resolveClientWork(input, access.idAdmin) : input.shopTrouser ? await resolveShopTrouser(input, access.idAdmin) : input;
      const rows = input.materials ? await resolveWorkerMaterials(input.materials, details, access.idAdmin) : null;
      const work = await WorkerWork.create({ ...details, ...(rows ? { materialStatus: 'pending', materialOperations: [makeWorkerMaterialOperation('assign', requestId, rows, access.createdBy)] } : {}), workerId: worker._id, idAdmin: access.idAdmin, createdBy: access.createdBy, requestId, requestFingerprint: fingerprint });
      await resumeWorkerMaterials(work);
      res.status(201).json(publicWork(work));
    });
  } catch (error) {
    if (error.code === 11000 && access && requestId) {
      try {
        const existing = await WorkerWork.findOne({ idAdmin: access.idAdmin, requestId });
        if (existing?.deletedAt) return res.status(409).json({ message: "workDeleted" });
        if (existing?.requestFingerprint === fingerprint) { await resumeWorkerMaterials(existing); return res.json(publicWork(existing)); }
        if (existing) return res.status(409).json({ message: "workRequestConflict" });
      } catch { /* Return the stable save error below. */ }
    }
    if (error.code === 11000 && input?.shopOriginId) return res.status(409).json({ message: 'shopAlreadyAssigned' });
    if (error.code === 11000 && input?.workType === "client") return res.status(409).json({ message: "garmentAlreadyAssigned" });
    sendError(res, error);
  }
}
export async function completeWorkerWork(req, res) {
  let scope, requestId, quantity;
  try {
    const access = await workerAccessFor(req, "complete");
    const worker = await workerFor(req, access.idAdmin);
    if (!mongoose.isObjectIdOrHexString(req.params.workId)) throw fail("workNotFound", 404);
    scope = { _id: req.params.workId, workerId: worker._id, idAdmin: access.idAdmin };
    const work = await WorkerWork.findOne(scope) || await findSfifaWork(scope);
    if (!work) throw fail("workNotFound", 404);
    if (work.deletedAt) throw fail("workDeleted", 409);
    requestId = requestIdFor(req.body);
    ({ quantity } = validateWorkerCompletion(req.body, undefined, work.category));
    if (work.additions?.some(event => event.requestId === requestId)) throw fail("workRequestConflict", 409);
    const previous = work.completions.find(event => event.requestId === requestId);
    if (previous) {
      if (!sameCompletion(previous, quantity, req.body)) throw fail("workRequestConflict", 409);
      return res.json(publicWork(work));
    }
    if (work.category === "sfifa") {
      const saved = await completeSfifaWork({ scope, body: req.body, requestId, quantity, createdBy: access.createdBy, workerName: worker.name });
      return res.status(saved.status).json(publicWork(saved.work));
    }
    requireWorkerMaterialsReady(work);
    const rawVersion = req.body?.version;
    const version = typeof rawVersion === "number" ? rawVersion : /^\d+$/.test(rawVersion || "") ? Number(rawVersion) : NaN;
    if (!Number.isSafeInteger(version) || version !== work.__v) throw fail("workConflict", 409);
    const remaining = work.quantity - work.completedQuantity;
    const { lineIds } = validateWorkerCompletion(req.body, remaining, work.category, work);
    const date = new Date(), earning = workerCompletionEarning(work, quantity, date, lineIds);
    work.completedQuantity += quantity;
    work.completions.push({ requestId, quantity, before: remaining, after: remaining - quantity, ...(lineIds ? { lineIds } : {}), ...earning, date, createdBy: access.createdBy, sequence: nextWorkSequence(work) });
    await work.save();
    res.status(201).json(publicWork(work));
  } catch (error) {
    if (error.name === "VersionError" && scope && requestId) {
      try {
        const work = await WorkerWork.findOne(scope);
        const event = work?.completions.find(entry => entry.requestId === requestId);
        if (work?.deletedAt) return res.status(409).json({ message: "workDeleted" });
        if (sameCompletion(event, quantity, req.body)) return res.json(publicWork(work));
        if (event) return res.status(409).json({ message: "workRequestConflict" });
      } catch { /* Return the stable conflict below. */ }
    }
    sendError(res, error);
  }
}

const readWork = async scope => await WorkerWork.findOne(scope) || await findSfifaWork(scope);
const requireWorkVersion = (body, work) => {
  const raw = body?.version, version = typeof raw === "number" ? raw : /^\d+$/.test(raw || "") ? Number(raw) : NaN;
  if (!Number.isSafeInteger(version) || version !== work.__v) throw fail("workConflict", 409);
};
const workScopeFor = (req, worker, idAdmin) => {
  if (!mongoose.isObjectIdOrHexString(req.params.workId)) throw fail("workNotFound", 404);
  return { _id: req.params.workId, workerId: worker._id, idAdmin };
};

export async function increaseWorkerWork(req, res) {
  let scope, replay;
  try {
    const access = await workerAccessFor(req, "increase"), worker = await workerFor(req, access.idAdmin);
    scope = workScopeFor(req, worker, access.idAdmin);
    const requestId = requestIdFor(req.body), original = await readWork(scope);
    if (!original) throw fail("workNotFound", 404);
    replay = work => {
      if (work.deletedAt) throw fail("workDeleted", 409);
      if (work.completions.some(event => event.requestId === requestId)) throw fail("workRequestConflict", 409);
      const operation = work.materialOperations?.find(operation => operation.requestId === requestId);
      if (operation?.state === 'failed') throw fail(operation.failureCode, 409);
      const previous = work.additions?.find(event => event.requestId === requestId);
      if (!previous) return false;
      const input = validateWorkerIncrease(req.body, work, { checkLimits: false });
      if (previous.quantity !== input.quantity || JSON.stringify(previous.lineIds ? [...previous.lineIds].sort() : []) !== JSON.stringify(input.lineIds || [])) throw fail("workRequestConflict", 409);
      if (workerMaterialInputKey(operation?.rows) !== workerMaterialInputKey(input.materials)) throw fail('workRequestConflict', 409);
      return true;
    };
    const mutate = async work => {
      if (work.shopFlow) throw fail('shopFlowFixedQuantity', 409);
      await requireNoLaterShopStage(work, access.idAdmin);
      requireWorkerMaterialsReady(work);
      if (worker.deletedAt) throw fail("workerDeleted", 409);
      if (!workerCategories(worker).includes(work.category)) throw fail("workerSectionChanged", 409);
      const input = validateWorkerIncrease(req.body, work);
      const details = input.lineIds ? await resolveClientWork({ category: work.category, workType: "client", orderId: String(work.tailoring.orderId), lineIds: input.lineIds }, access.idAdmin) : null;
      const rows = input.materials ? await resolveWorkerMaterials(input.materials, details || work, access.idAdmin) : null;
      if (details && work.category === "trousers" && details.trouserType !== work.trouserType) throw Object.assign(fail("invalidWork", 400), { fields: { lineIds: "mixedTrouserTypes" } });
      applyWorkerIncrease(work, input, requestId, access.createdBy);
      if (details) {
        work.tailoring.lineIds = [...work.tailoring.lineIds, ...details.tailoring.lineIds].sort();
        work.tailoring.items.push(...details.tailoring.items);
      }
      if (rows) { work.materialOperations ||= []; work.materialOperations.push(makeWorkerMaterialOperation('increase', requestId, rows, access.createdBy)); work.materialStatus = 'pending'; }
    };
    return await withOrderAssignmentLock(access.idAdmin, workLockKey(original), async () => {
      if (original.category === "sfifa") {
        const saved = await changeSfifaWork({ scope, body: req.body, replay, mutate });
        return res.status(saved.status).json(publicWork(saved.work));
      }
      const work = await readWork(scope);
      if (!work) throw fail("workNotFound", 404);
      if (replay(work)) { await resumeWorkerMaterials(work); return res.json(publicWork(work)); }
      requireWorkVersion(req.body, work);
      await mutate(work); await work.save(); await resumeWorkerMaterials(work);
      return res.status(201).json(publicWork(work));
    });
  } catch (error) {
    if (error.name === "VersionError" && scope && replay) {
      try { const work = await readWork(scope); if (work && replay(work)) return res.json(publicWork(work)); }
      catch (failure) { return sendError(res, failure); }
    }
    return sendError(res, error);
  }
}

export async function deleteWorkerWork(req, res) {
  try {
    const access = await workerAccessFor(req, "deleteWork"), worker = await workerFor(req, access.idAdmin);
    const scope = workScopeFor(req, worker, access.idAdmin), original = await readWork(scope);
    if (!original) throw fail("workNotFound", 404);
    if (original.deletedAt) return res.json({ _id: original._id, deleted: true, ...(original.cancelledAt ? { cancelled: true } : {}) });
    if (original.materialOperations?.length && !original.deletedAt) return cancelWorkerWork(req, res);
    requireWorkerMaterialsReady(original);
    const result = work => res.json({ _id: work._id, deleted: true });
    const mutate = work => archiveWorkerAssignment(work, access.createdBy);
    return await withOrderAssignmentLock(access.idAdmin, workLockKey(original), async () => {
      if (original.category === "sfifa") {
        const saved = await changeSfifaWork({ scope, body: req.body, replay: work => Boolean(work.deletedAt), mutate });
        return result(saved.work);
      }
      const work = await readWork(scope);
      if (!work) throw fail("workNotFound", 404);
      if (work.deletedAt) return result(work);
      await requireNoLaterShopStage(work, access.idAdmin);
      requireWorkVersion(req.body, work); mutate(work); await work.save();
      return result(work);
    });
  } catch (error) { return sendError(res, error); }
}

export async function resumeWorkerWorkMaterials(req, res) {
  try {
    const access = await workerAccessFor(req), worker = await workerFor(req, access.idAdmin), scope = workScopeFor(req, worker, access.idAdmin);
    const original = await WorkerWork.findOne(scope);
    if (!original) throw fail('workNotFound', 404);
    await workerAccessFor(req, 'resume');
    return await withOrderAssignmentLock(access.idAdmin, workLockKey(original), async () => {
      const work = await WorkerWork.findOne(scope);
      if (work.deletedAt) return res.json({ _id: work._id, deleted: true, cancelled: Boolean(work.cancelledAt) });
      await resumeWorkerMaterials(work);
      return res.json(work.deletedAt ? { _id: work._id, deleted: true, cancelled: Boolean(work.cancelledAt) } : publicWork(work));
    });
  } catch (error) { sendError(res, error); }
}
export async function cancelWorkerWork(req, res) {
  try {
    const access = await workerAccessFor(req, 'cancelWork'), worker = await workerFor(req, access.idAdmin), scope = workScopeFor(req, worker, access.idAdmin);
    const original = await WorkerWork.findOne(scope);
    if (!original) throw fail('workNotFound', 404);
    return await withOrderAssignmentLock(access.idAdmin, workLockKey(original), async () => {
      const work = await WorkerWork.findOne(scope);
      if (work.cancelledAt) return res.json({ _id: work._id, deleted: true, cancelled: true });
      if (work.deletedAt) throw fail('workDeleted', 409);
      const kind = work.tailoring ? tailoringGarmentType(work.tailoring) : work.garmentType;
      // Previously saved client debits can still be returned when deleting that work.
      if (!usesWorkerMaterials(work.category, work.workType, kind) && !(work.materialOperations?.length && supportsWorkerMaterialHistory(work.category, work.workType, kind))) throw fail('invalidMaterialSection', 400);
      await requireNoLaterShopStage(work, access.idAdmin);
      if (work.materialStatus !== 'returning') {
        requireWorkVersion(req.body, work);
        work.materialCancellation = { requestId: requestIdFor(req.body), createdBy: access.createdBy, date: new Date() };
        work.materialStatus = 'returning'; await work.save();
      }
      await resumeWorkerMaterials(work);
      return res.json({ _id: work._id, deleted: true, cancelled: true });
    });
  } catch (error) { sendError(res, error); }
}
