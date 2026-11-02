import TailoringOrder from "../models/TailoringOrder.js";
import TailoringWorker from "../models/TailoringWorker.js";
import WorkerWork from "../models/WorkerWork.js";
import SfifaStock from "../models/SfifaStock.js";
import { workerAccessFor } from "./TailoringWorkers.js";
import { remainingWorkQuantity } from "../../shared/workerWork.js";

export async function listTailoringTracking(req, res) {
  try {
    const { idAdmin } = await workerAccessFor(req);
    const orders = await TailoringOrder.find({ idAdmin }).select("_id").lean();
    if (!orders.length) return res.json({ orders: [] });
    const ids = orders.map(order => order._id), owned = new Set(ids.map(String));
    const [ordinary, stocks] = await Promise.all([
      WorkerWork.find({ idAdmin, workType: "client", "tailoring.orderId": { $in: ids } }).select("workerId category quantity completedQuantity completions.date tailoring createdAt updatedAt idAdmin workType").lean(),
      SfifaStock.find({ idAdmin, "production.tailoring.orderId": { $in: ids } }).select("production").lean(),
    ]);
    const works = [...ordinary, ...stocks.flatMap(stock => stock.production || [])].filter(work => !work.deletedAt && String(work.idAdmin) === String(idAdmin) && work.workType === "client" && owned.has(String(work.tailoring?.orderId)));
    const workerIds = [...new Set(works.map(work => String(work.workerId)))];
    const workers = workerIds.length ? await TailoringWorker.find({ idAdmin, _id: { $in: workerIds } }).select("_id name").lean() : [];
    const names = new Map(workers.map(worker => [String(worker._id), worker.name]));
    const grouped = new Map(ids.map(id => [String(id), []]));
    for (const work of works) grouped.get(String(work.tailoring.orderId)).push({
      workId: work._id, category: work.category, workerId: work.workerId,
      workerName: names.get(String(work.workerId)) || "", workerAvailable: names.has(String(work.workerId)),
      quantity: work.quantity, completedQuantity: work.completedQuantity, remainingQuantity: remainingWorkQuantity(work),
      assignedAt: work.createdAt, completedAt: remainingWorkQuantity(work) === 0 ? work.completions.at(-1)?.date || work.updatedAt : null,
      items: work.tailoring.items.map(item => ({ lineId: item.lineId, fabricType: item.fabricType, fabricColor: item.fabricColor || "" })),
      ...(work.category === "sfifa" ? { sfifa: { width: work.sfifa.width, family: work.sfifa.family, code: work.sfifa.code } } : {}),
    });
    res.json({ orders: [...grouped].map(([orderId, assignments]) => ({ orderId, assignments: assignments.sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt)) })) });
  } catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : "loadTrackingFailed" }); }
}
