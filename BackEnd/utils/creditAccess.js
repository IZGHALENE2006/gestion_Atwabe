import mongoose from "mongoose";
import Admin from "../models/AdminModel.js";
import Employee from "../models/EmployeModele.js";

const forbidden = () => Object.assign(new Error("creditAccessDenied"), { status: 403 });
// Membership, active status and the actor's name come from the current account,
// never from submitted fields or the shop/name cached in an old JWT.
export async function creditAccessFor(req, { adminOnly = false } = {}) {
  // Every active employee can add customers, credit and payments for this shop.
  if (!["admin", "Employe"].includes(req.user?.role) || !mongoose.isObjectIdOrHexString(req.user?.id)) throw forbidden();
  const admin = req.user.role === "admin", model = admin ? Admin : Employee;
  const account = await model.findById(req.user.id);
  if (!account || account.role !== req.user.role || (!admin && account.isActive !== true) || (adminOnly && !admin)) throw forbidden();
  const ownerId = admin ? account._id : account.idAdmin;
  if (!mongoose.isObjectIdOrHexString(ownerId)) throw forbidden();
  if (!admin && !(await Admin.findById(ownerId))) throw forbidden();
  return { ownerId: String(ownerId), actor: { id: String(account._id), name: account.name || "", role: account.role } };
}
export function assertCreditActor(recordedActor, actor, ownerId) {
  // Before employee access existed, only the owner could create these records.
  if (String(recordedActor?.id || ownerId) !== actor.id || (recordedActor?.role && recordedActor.role !== actor.role)) throw Object.assign(new Error("creditActorConflict"), { status: 403 });
}
