import mongoose from "mongoose";
import TailoringWorker from "../models/TailoringWorker.js";
import WorkerWork from "../models/WorkerWork.js";
import SfifaStock from "../models/SfifaStock.js";
import AdminModel from "../models/AdminModel.js";
import EmployeModel from "../models/EmployeModele.js";
import { workerAccessFor, publicWorker } from "./TailoringWorkers.js";
import { buildWorkerPayroll, validateWorkerPayment } from "../../shared/workerPayroll.js";
import { tailoringMoneyCents } from "../../shared/tailoring.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
const paymentFields = payment => ({ amount: payment.amount, month: payment.month, paidOn: payment.paidOn, note: payment.note || "", type: payment.type });
const publicPayment = payment => ({ _id: payment._id, ...paymentFields(payment), createdAt: payment.createdAt, createdByName: payment.createdByName });
async function workerFor(req, idAdmin) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
  const worker = await TailoringWorker.findOne({ _id: req.params.id, idAdmin });
  if (!worker) throw fail("notFound", 404);
  return worker;
}
async function accountFor(worker, idAdmin) {
  const scope = { idAdmin, workerId: worker._id };
  const [works, stocks] = await Promise.all([
    WorkerWork.find(scope).select("productName category workType unitWage completions sfifa tailoring archivedTailoring deletedAt").lean(),
    SfifaStock.find({ idAdmin, "production.workerId": worker._id }).select("production").lean(),
  ]);
  const all = new Map(works.map(work => [String(work._id), work]));
  for (const stock of stocks) for (const work of stock.production || []) if (String(work.workerId) === String(worker._id)) all.set(String(work._id), work);
  // Deleted assignments retain their already earned amounts.
  return buildWorkerPayroll([...all.values()], worker.payments || []);
}
const sendError = (res, error, fallback) => {
  if (error.message === "invalidPayment") return res.status(400).json({ message: "invalidPayment", fields: error.fields });
  if (error.name === "VersionError" || error.code === 11000) return res.status(409).json({ message: "paymentConflict" });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
};
export async function getWorkerPayroll(req, res) {
  try {
    const { idAdmin, permissions } = await workerAccessFor(req), worker = await workerFor(req, idAdmin);
    res.json({ worker: publicWorker(worker), permissions, ...await accountFor(worker, idAdmin) });
  } catch (error) { sendError(res, error, "loadFailed"); }
}
export async function addWorkerPayment(req, res) {
  let access, requestId, input;
  const replay = worker => {
    const previous = worker.payments?.find(payment => payment.requestId === requestId);
    if (!previous) return null;
    if (JSON.stringify(paymentFields(previous)) !== JSON.stringify(input)) throw fail("paymentRequestConflict", 409);
    return previous;
  };
  try {
    access = await workerAccessFor(req, "update");
    const worker = await workerFor(req, access.idAdmin);
    requestId = typeof req.body?.requestId === "string" ? req.body.requestId.toLowerCase() : "";
    if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(requestId)) throw fail("invalidRequest", 400);
    input = validateWorkerPayment(req.body);
    const existing = replay(worker);
    if (existing) return res.json({ payment: publicPayment(existing) });
    if (input.type === "settlement") {
      const account = await accountFor(worker, access.idAdmin);
      const due = account.months.find(month => month.month === input.month)?.due || 0;
      if (tailoringMoneyCents(input.amount) > tailoringMoneyCents(due)) throw fail("paymentExceedsDue", 409);
    }
    const actor = await (req.user.role === "admin" ? AdminModel : EmployeModel).findById(access.createdBy).select("name");
    if (!worker.payments) worker.payments = [];
    worker.payments.push({ ...input, requestId, createdAt: new Date(), createdBy: access.createdBy, createdByName: actor?.name || "" });
    // Optimistic concurrency serializes payments, including two settlements of the same month.
    await worker.save();
    res.status(201).json({ payment: publicPayment(worker.payments.find(payment => payment.requestId === requestId)) });
  } catch (error) {
    if ((error.name === "VersionError" || error.code === 11000) && access && requestId && input) {
      try {
        const worker = await workerFor(req, access.idAdmin), previous = replay(worker);
        if (previous) return res.json({ payment: publicPayment(previous) });
      } catch (failure) { return sendError(res, failure, "saveFailed"); }
    }
    return sendError(res, error, "saveFailed");
  }
}
