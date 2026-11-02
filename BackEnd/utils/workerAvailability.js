import WorkerWork from "../models/WorkerWork.js";
import SfifaStock from "../models/SfifaStock.js";
import TailoringWorker from "../models/TailoringWorker.js";
import { remainingWorkQuantity } from "../../shared/workerWork.js";

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
  const [ordinary, stocks] = await Promise.all([
    WorkerWork.find({ idAdmin, workType: "client", ...(orderId ? { "tailoring.orderId": orderId } : {}) }).select("idAdmin workType category workerId quantity completedQuantity tailoring.orderId tailoring.lineIds").lean(),
    SfifaStock.find({ idAdmin }).select("production").lean(),
  ]);
  return [...ordinary, ...stocks.flatMap(stock => stock.production || [])].filter(work => !work.deletedAt && String(work.idAdmin) === String(idAdmin) && work.workType === "client" && work.tailoring && (!orderId || String(work.tailoring.orderId) === String(orderId)));
}

export function blockingAssignments(works, orderId, category, lineIds) {
  return works.filter(work => work.category !== category && (!orderId || String(work.tailoring.orderId) === String(orderId)) && remainingWorkQuantity({ ...work, completedQuantity: work.completedQuantity ?? 0 }) > 0 && (!lineIds || work.tailoring.lineIds.some(id => lineIds.includes(id))));
}

export async function describeBlockingAssignments(works, idAdmin) {
  if (!works.length) return [];
  const workerIds = [...new Set(works.map(work => String(work.workerId)))];
  const workers = await TailoringWorker.find({ idAdmin, _id: { $in: workerIds } }).select("_id name").lean();
  const names = new Map(workers.map(worker => [String(worker._id), worker.name]));
  return works.map(work => ({ orderId: String(work.tailoring.orderId), category: work.category, workerName: names.get(String(work.workerId)) || "", lineIds: work.tailoring.lineIds }));
}
