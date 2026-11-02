import mongoose from 'mongoose';
import Admin from '../models/AdminModel.js';
import Employee from '../models/EmployeModele.js';
import SideExpense from '../models/SideExpense.js';
import { EXPENSE_REQUEST_PATTERN, currentExpenseMonth, expenseKind, expenseMonth, validateSideExpense } from '../../shared/sideExpenses.js';

const fail = (message, status) => Object.assign(new Error(message), { status });
const publicExpense = expense => ({ _id: expense._id, type: expense.type, otherName: expense.otherName, amountCents: expense.amountCents, month: expenseMonth(expense), monthEstimated: !expense.month, kind: expense.kind || expenseKind(expense.type), createdAt: expense.createdAt });
async function accessFor(req, adding = false) {
  if (!['admin', 'Employe'].includes(req.user?.role) || !mongoose.isObjectIdOrHexString(req.user?.id)) throw fail('forbidden', 403);
  const admin = req.user.role === 'admin';
  const account = await (admin ? Admin : Employee).findById(req.user.id).select('_id role idAdmin isActive action');
  if (!account || account.role !== req.user.role || (!admin && account.isActive !== true)) throw fail('forbidden', 403);
  const idAdmin = admin ? account._id : account.idAdmin;
  if (!mongoose.isObjectIdOrHexString(idAdmin) || (!admin && !(await Admin.findById(idAdmin).select('_id')))) throw fail('forbidden', 403);
  const permissions = { add: admin || account.action?.add === true };
  if (adding && !permissions.add) throw fail('forbidden', 403);
  return { idAdmin, createdBy: account._id, permissions };
}
function sendError(res, error, fallback) {
  if (error.message === 'invalidExpense') return res.status(400).json({ message: 'invalidExpense', fields: error.fields });
  return res.status(error.status || 500).json({ message: error.status ? error.message : fallback });
}

export async function listSideExpenses(req, res) {
  try {
    const { idAdmin, permissions } = await accessFor(req);
    const items = await SideExpense.find({ idAdmin }).sort({ createdAt: -1, _id: -1 }).lean();
    res.json({ items: items.map(publicExpense), permissions });
  } catch (error) { sendError(res, error, 'loadFailed'); }
}

export async function addSideExpense(req, res) {
  try {
    const { idAdmin, createdBy } = await accessFor(req, true);
    const input = validateSideExpense(req.body);
    const requestId = typeof req.body.requestId === 'string' ? req.body.requestId.toLowerCase() : '';
    if (!EXPENSE_REQUEST_PATTERN.test(requestId)) throw fail('invalidRequest', 400);
    const scope = { idAdmin, requestId };
    const replay = expense => {
      if (String(expense.createdBy) !== String(createdBy) || expense.type !== input.type || expense.otherName !== input.otherName || expense.amountCents !== input.amountCents || (input.month !== undefined && expenseMonth(expense) !== input.month)) throw fail('requestConflict', 409);
      return res.json(publicExpense(expense));
    };
    const previous = await SideExpense.findOne(scope);
    if (previous) return replay(previous);
    const month = input.month || currentExpenseMonth(), kind = expenseKind(input.type);
    const monthlyKey = kind === 'fixed' ? `${input.type}:${month}` : undefined;
    if (monthlyKey) {
      const history = await SideExpense.find({ idAdmin, type: input.type }).lean();
      if (history.some(expense => expenseMonth(expense) === month)) throw fail('fixedExpenseExists', 409);
    }
    try {
      const expense = await SideExpense.create({ ...input, ...scope, createdBy, month, kind, ...(monthlyKey ? { monthlyKey } : {}) });
      return res.status(201).json(publicExpense(expense));
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await SideExpense.findOne(scope);
      if (!existing) {
        if (monthlyKey && await SideExpense.findOne({ idAdmin, monthlyKey })) throw fail('fixedExpenseExists', 409);
        throw error;
      }
      return replay(existing);
    }
  } catch (error) { sendError(res, error, 'saveFailed'); }
}
