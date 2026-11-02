import mongoose from "mongoose";
import AdminModel from "../models/AdminModel.js";
import EmployeModel from "../models/EmployeModele.js";
import Client from "../models/Client.js";
import { validateClient } from "../../shared/clients.js";

const fail = (message, status) => Object.assign(new Error(message), { status });
async function accessFor(req, action) {
  if (!["admin", "Employe"].includes(req.user?.role)) throw fail("forbidden", 403);
  const admin = req.user.role === "admin";
  const actor = await (admin ? AdminModel : EmployeModel).findById(req.user.id).select("_id idAdmin isActive action");
  if (!actor || (!admin && !actor.isActive)) throw fail("forbidden", 403);
  const idAdmin = admin ? actor._id : actor.idAdmin;
  if (!mongoose.isValidObjectId(idAdmin)) throw fail("forbidden", 403);
  const permissions = { add: admin || actor.action?.add === true, update: admin || actor.action?.update === true };
  if (action && !permissions[action]) throw fail("forbidden", 403);
  return { idAdmin, createdBy: actor._id, permissions };
}

function sendError(res, error, fallback) {
  if (error.message === "invalidClient") return res.status(400).json({ message: "invalidClient", fields: error.fields });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
}

export async function listClients(req, res) {
  try {
    const { idAdmin, permissions } = await accessFor(req);
    const clients = await Client.find({ idAdmin }).sort({ name: 1, _id: 1 }).lean();
    res.json({ clients, permissions });
  } catch (error) { sendError(res, error, "loadFailed"); }
}

export async function addClient(req, res) {
  try {
    const { idAdmin, createdBy } = await accessFor(req, "add");
    const input = validateClient(req.body);
    const client = await Client.create({ ...input, idAdmin, createdBy });
    res.status(201).json(client);
  } catch (error) { sendError(res, error, "saveFailed"); }
}

export async function updateClient(req, res) {
  try {
    const { idAdmin } = await accessFor(req, "update");
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail("notFound", 404);
    const input = validateClient(req.body);
    const client = await Client.findOneAndUpdate({ _id: req.params.id, idAdmin }, { $set: input }, { new: true, runValidators: true });
    if (!client) throw fail("notFound", 404);
    res.json(client);
  } catch (error) { sendError(res, error, "saveFailed"); }
}
