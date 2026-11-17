import mongoose from 'mongoose';
import { moduleOperationPermissions } from '../../shared/employeePermissions.js';
import { WORKER_CATEGORIES, workerCategories } from '../../shared/workers.js';
import { workerOrderGarmentTypes } from '../../shared/workerWork.js';
import { tailoringGarmentType } from '../../shared/tailoring.js';
import TailoringOrder from '../models/TailoringOrder.js';
import TailoringWorker from '../models/TailoringWorker.js';
import { accessFor } from './TailoringOrders.js';
import { publicWorker } from './TailoringWorkers.js';
import { addWorkerWork, listWorkerOrderOptions } from './WorkerWork.js';

const fail = (message, status) => Object.assign(new Error(message), { status });
const identity = value => typeof value === 'string' && mongoose.isObjectIdOrHexString(value);
const sendError = (res, error) => res.status(error.status || 500).json({ message: error.status ? error.message : 'loadOrderAssignmentFailed' });
async function prepare(req, res) {
  const access = await accessFor(req, 'assign');
  if (!identity(req.params.id)) throw fail('orderNotFound', 404);
  const order = await TailoringOrder.findOne({ _id: req.params.id, idAdmin: access.idAdmin });
  if (!order) throw fail('orderNotFound', 404);
  if (order.cancelledAt) throw fail('orderCancelled', 409);
  if (order.deliveredAt) throw fail('orderAlreadyDelivered', 409);
  // This server-only context delegates assignment of this order, without granting
  // access to worker accounts, payroll, shop work or other worker operations.
  req.tailoringAssignmentAccess = { idAdmin: access.idAdmin, createdBy: access.createdBy,
    permissions: moduleOperationPermissions(req.user.role, req.employeeAccount, 'workers'), orderId: String(order._id) };
  res.set('Cache-Control', 'no-store');
  return { access, order };
}
export async function listOrderAssignmentWorkers(req, res) {
  try {
    const { access, order } = await prepare(req, res), garment = tailoringGarmentType(order);
    const workers = await TailoringWorker.find({ idAdmin: access.idAdmin }).select('_id name phone category categories deletedAt').sort({ name: 1, _id: 1 }).lean();
    res.json({ workers: workers.filter(worker => !worker.deletedAt && workerCategories(worker).some(category => workerOrderGarmentTypes(category).includes(garment))).map(publicWorker) });
  } catch (error) { sendError(res, error); }
}

export async function listOrderAssignmentOptions(req, res) {
  try {
    const { order } = await prepare(req, res), { workerId, category } = req.query;
    if (!identity(workerId)) throw fail('notFound', 404);
    if (!WORKER_CATEGORIES.includes(category) || !workerOrderGarmentTypes(category).includes(tailoringGarmentType(order))) throw fail('invalidWorkCategory', 400);
    req.params = { ...req.params, id: workerId };
    return await listWorkerOrderOptions(req, res);
  } catch (error) { sendError(res, error); }
}

export async function assignOrderWork(req, res) {
  try {
    const { order } = await prepare(req, res), input = req.body;
    if (!identity(input?.workerId)) throw fail('notFound', 404);
    if (input.workType !== 'client' || input.orderId !== String(order._id)) throw fail('invalidOrderAssignment', 400);
    if (!WORKER_CATEGORIES.includes(input.category) || !workerOrderGarmentTypes(input.category).includes(tailoringGarmentType(order))) throw fail('invalidWorkCategory', 400);
    req.params = { ...req.params, id: input.workerId };
    return await addWorkerWork(req, res);
  } catch (error) { sendError(res, error); }
}
