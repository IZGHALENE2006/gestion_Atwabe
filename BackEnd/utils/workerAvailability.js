import WorkerWork from "../models/WorkerWork.js";
import SfifaStock from "../models/SfifaStock.js";
import TailoringWorker from "../models/TailoringWorker.js";
import { remainingWorkQuantity, workerClientPreviousStage, workerWorkCompleted } from "../../shared/workerWork.js";
import { tailoringGarmentType } from "../../shared/tailoring.js";
import { resumeSfifaTransfer } from './sfifaWorkTransfers.js';

// Serialize linked assignments in this API process, including assignments saved
// inside sfifa stock. Always recheck committed work after acquiring the queue.
const orderQueues = new Map();
export async function withOrderAssignmentLock(idAdmin, orderId, commit) {
  if (!orderId) return commit();
  const key = `${idAdmin}:${orderId}`, previous = orderQueues.get(key);
  let release;
  const current = new Promise(resolve => { release = resolve; });
  orderQueues.set(key, current);
  await previous;
  try { return await commit(); }
  finally { release(); if (orderQueues.get(key) === current) orderQueues.delete(key); }
}

export async function loadClientAssignments(idAdmin, orderId) {
  const [ordinary, loaded] = await Promise.all([
    WorkerWork.find({ idAdmin, workType: "client", ...(orderId ? { "tailoring.orderId": orderId } : {}) }).select("idAdmin workType category workerId quantity completedQuantity deletedAt tailoring.orderId tailoring.lineIds").lean(),
    SfifaStock.find({ idAdmin }).select("production idAdmin").lean(),
  ]);
  let stocks = loaded;
  if (stocks.some(stock => stock.production?.some(work => work.relocatedAt))) {
    for (const stock of stocks) for (const work of stock.production || []) if (work.relocatedAt) await resumeSfifaTransfer(stock, work);
    stocks = await SfifaStock.find({ idAdmin }).select('production idAdmin').lean();
  }
  return [...ordinary, ...stocks.flatMap(stock => stock.production || [])].filter(work => !work.relocatedAt && !work.deletedAt && String(work.idAdmin) === String(idAdmin) && work.workType === "client" && work.tailoring && (!orderId || String(work.tailoring.orderId) === String(orderId)));
}

export function blockingAssignments(works, orderId, category, lineIds) {
  return works.filter(work => work.category !== category && (!orderId || String(work.tailoring.orderId) === String(orderId)) && remainingWorkQuantity({ ...work, completedQuantity: work.completedQuantity ?? 0 }) > 0 && (!lineIds || work.tailoring.lineIds.some(id => lineIds.includes(id))));
}

// A completed job unlocks only its own garments in the next customer stage.
// Shirts use their dedicated sewing section before laundry.
export function readyClientLineIds(works, order, category) {
  const previous = workerClientPreviousStage(category, tailoringGarmentType(order));
  if (!previous) return null;
  return new Set(works.filter(work => work.category === previous && String(work.tailoring?.orderId) === String(order._id) && workerWorkCompleted(work)).flatMap(work => work.tailoring.lineIds));
}

export function requireClientPreviousStage(works, order, category, lineIds) {
  const ready = readyClientLineIds(works, order, category);
  if (ready && lineIds.some(id => !ready.has(id))) {
    const previous = workerClientPreviousStage(category, tailoringGarmentType(order));
    throw Object.assign(new Error({ machine: "clientMachineRequired", finishing: "clientFinishingRequired", shirts: "clientShirtsRequired" }[previous]), { status: 409 });
  }
}

export async function describeBlockingAssignments(works, idAdmin) {
  if (!works.length) return [];
  const workerIds = [...new Set(works.map(work => String(work.workerId)))];
  const workers = await TailoringWorker.find({ idAdmin, _id: { $in: workerIds } }).select("_id name").lean();
  const names = new Map(workers.map(worker => [String(worker._id), worker.name]));
  return works.map(work => ({ orderId: String(work.tailoring.orderId), category: work.category, workerName: names.get(String(work.workerId)) || "", lineIds: work.tailoring.lineIds }));
}
