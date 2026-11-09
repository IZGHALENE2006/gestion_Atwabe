import { moduleOperationPermissions } from "../../shared/employeePermissions.js";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import AdminModel from "../models/AdminModel.js";
import EmployeModel from "../models/EmployeModele.js";
import TailoringWorker from "../models/TailoringWorker.js";
import { validateTailoringWorker, workerCategories } from "../../shared/workers.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
export const publicWorker = worker => {
  const categories = workerCategories(worker);
  return { _id: worker._id, name: worker.name, phone: worker.phone, category: categories[0], categories, ...(worker.deletedAt ? { deletedAt: worker.deletedAt } : {}), __v: worker.__v ?? 0, createdAt: worker.createdAt, updatedAt: worker.updatedAt };
};
const sendError = (res, error, fallback) => {
  if (error.message === "invalidWorker") return res.status(400).json({ message: "invalidWorker", fields: error.fields });
  if (error.name === "VersionError") return res.status(409).json({ message: "conflict" });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
};
export async function workerAccessFor(req, action) {
  if (!["admin", "Employe"].includes(req.user?.role)) throw fail("forbidden", 403);
  const admin = req.user.role === "admin";
  const actor = await (admin ? AdminModel : EmployeModel).findById(req.user.id).select("_id idAdmin isActive action moduleAccess operationPermissions");
  if (!actor || (!admin && !actor.isActive)) throw fail("forbidden", 403);
  const idAdmin = admin ? actor._id : actor.idAdmin;
  if (!mongoose.isObjectIdOrHexString(idAdmin)) throw fail("forbidden", 403);
  const permissions = moduleOperationPermissions(req.user.role, actor, 'workers');
  if (action && !(Array.isArray(action) ? action.some(key => permissions[key]) : permissions[action])) throw fail("forbidden", 403);
  return { idAdmin, createdBy: actor._id, permissions };
}
export async function listTailoringWorkers(req, res) {
  try {
    const { idAdmin, permissions } = await workerAccessFor(req);
    const workers = await TailoringWorker.find({ idAdmin }).sort({ createdAt: -1, _id: -1 }).lean();
    res.json({ workers: workers.filter(worker => !worker.deletedAt).map(publicWorker), deletedWorkers: workers.filter(worker => worker.deletedAt).map(publicWorker), permissions });
  } catch (error) { sendError(res, error, "loadFailed"); }
}
export async function addTailoringWorker(req, res) {
  let access, requestId, requestFingerprint, acceptedFingerprints;
  try {
    access = await workerAccessFor(req, "add");
    const input = validateTailoringWorker(req.body);
    requestId = typeof req.body.requestId === "string" ? req.body.requestId.toLowerCase() : "";
    if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(requestId)) throw fail("invalidRequest", 400);
    requestFingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    acceptedFingerprints = new Set([requestFingerprint]);
    if (input.categories.length === 1) acceptedFingerprints.add(createHash("sha256").update(JSON.stringify({ name: input.name, phone: input.phone, category: input.categories[0] })).digest("hex"));
    const existing = await TailoringWorker.findOne({ idAdmin: access.idAdmin, requestId });
    if (existing) {
      if (!acceptedFingerprints.has(existing.requestFingerprint)) throw fail("requestConflict", 409);
      if (existing.deletedAt) throw fail("workerDeleted", 409);
      return res.json(publicWorker(existing));
    }
    const worker = await TailoringWorker.create({ ...input, category: input.categories[0], idAdmin: access.idAdmin, createdBy: access.createdBy, requestId, requestFingerprint });
    res.status(201).json(publicWorker(worker));
  } catch (error) {
    if (error.code === 11000 && access && requestId) {
      try {
        const existing = await TailoringWorker.findOne({ idAdmin: access.idAdmin, requestId });
        if (existing?.deletedAt) return res.status(409).json({ message: "workerDeleted" });
        if (existing && acceptedFingerprints.has(existing.requestFingerprint)) return res.json(publicWorker(existing));
        if (existing) return res.status(409).json({ message: "requestConflict" });
      } catch { /* Return the stable save error below. */ }
    }
    sendError(res, error, "saveFailed");
  }
}

export async function updateTailoringWorker(req, res) {
  try {
    const { idAdmin } = await workerAccessFor(req, "update");
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
    const worker = await TailoringWorker.findOne({ _id: req.params.id, idAdmin });
    if (!worker) throw fail("notFound", 404);
    if (worker.deletedAt) throw fail("workerDeleted", 409);
    const rawVersion = req.body?.version;
    const version = typeof rawVersion === "number" ? rawVersion : /^\d+$/.test(rawVersion || "") ? Number(rawVersion) : NaN;
    if (!Number.isSafeInteger(version) || version !== (worker.__v ?? 0)) throw fail("conflict", 409);
    const input = validateTailoringWorker(req.body);
    worker.set({ ...input, category: input.categories[0] });
    await worker.save();
    res.json(publicWorker(worker));
  } catch (error) { sendError(res, error, "saveFailed"); }
}

export async function deleteTailoringWorker(req, res) {
  try {
    const { idAdmin, createdBy } = await workerAccessFor(req, "delete");
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
    const worker = await TailoringWorker.findOne({ _id: req.params.id, idAdmin });
    if (!worker) throw fail("notFound", 404);
    if (worker.deletedAt) return res.json(publicWorker(worker));
    const raw = req.body?.version;
    const version = typeof raw === "number" ? raw : /^\d+$/.test(raw || "") ? Number(raw) : NaN;
    if (!Number.isSafeInteger(version) || version !== (worker.__v ?? 0)) throw fail("conflict", 409);
    // Keep the account, outstanding work and material history available for settlement.
    worker.deletedAt = new Date(); worker.deletedBy = createdBy;
    await worker.save();
    res.json(publicWorker(worker));
  } catch (error) { sendError(res, error, "deleteFailed"); }
}
