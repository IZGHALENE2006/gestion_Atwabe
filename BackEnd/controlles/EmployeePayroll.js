import mongoose from 'mongoose';
import Employee from '../models/EmployeModele.js';
import Admin from '../models/AdminModel.js';
import Payroll from '../models/EmployeePayroll.js';
import { buildEmployeePayroll, validateCompensation, validateEmployeePayment, payrollMonth, payrollCents } from '../../shared/employeePayroll.js';

const fail = (message, status) => Object.assign(new Error(message), { status });
async function employeeFor(req) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw fail('employeePayrollNotFound', 404);
  const employee = await Employee.findOne({ _id: req.params.id, idAdmin: req.user.id }).select('name phone cin isActive compensation ventes');
  if (!employee) throw fail('employeePayrollNotFound', 404);
  return employee;
}
async function accountFor(req, employee) {
  const scope = { idAdmin: req.user.id, employeeId: employee._id };
  let account = await Payroll.findOne(scope);
  if (account) return account;
  const plans = employee.compensation ? [{ ...employee.compensation.toObject(), createdAt: new Date(), createdByName: '' }] : [];
  try { account = await Payroll.create({ ...scope, plans }); }
  catch (error) { if (error.code !== 11000) throw error; account = await Payroll.findOne(scope); }
  return account;
}
const publicPayment = payment => {
  const row = payment.toObject ? payment.toObject() : payment;
  const data = { ...row }; delete data.requestId; delete data.createdBy;
  return data;
};
const errorResponse = (res, error) => res.status(error.name === 'VersionError' || error.code === 11000 ? 409 : error.status || 500).json({ message: error.name === 'VersionError' || error.code === 11000 ? 'employeePayrollConflict' : error.status ? error.message : 'employeePayrollFailed', ...(error.fields ? { fields: error.fields } : {}) });
export async function getEmployeePayroll(req, res) {
  try {
    const employee = await employeeFor(req), account = await accountFor(req, employee);
    const month = req.query.month || payrollMonth();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw fail('employeePaymentInvalid', 400);
    res.json({ employee: { _id: employee._id, name: employee.name, phone: employee.phone, cin: employee.cin, isActive: employee.isActive }, plans: account.plans, ...buildEmployeePayroll(account.plans, employee.ventes, account.payments), payments: account.payments.map(publicPayment).reverse(), sales: employee.ventes.filter(sale => sale.DateVante != null && payrollMonth(sale.DateVante) === month).map(sale => ({ _id: sale._id, name: sale.name, quantity: sale.quantite, profit: sale.profite ?? null, date: sale.DateVante, saleType: sale.saleType || 'cash', invoiceId: sale.invoiceId })) });
  } catch (error) { errorResponse(res, error); }
}
export async function setEmployeeCompensation(req, res) {
  try {
    const employee = await employeeFor(req), input = validateCompensation(req.body), account = await accountFor(req, employee);
    // A new agreement applies to a future month; prior monthly balances stay intact.
    if (account.plans.length && input.effectiveMonth <= payrollMonth()) throw fail('employeeCompensationPast', 409);
    if (account.plans.some(plan => plan.effectiveMonth === input.effectiveMonth)) throw fail('employeeCompensationExists', 409);
    const actor = await Admin.findById(req.user.id).select('name');
    account.plans.push({ ...input, createdAt: new Date(), createdByName: actor?.name || '' });
    await account.save();
    res.status(201).json({ plans: account.plans });
  } catch (error) { errorResponse(res, error); }
}
export async function addEmployeePayment(req, res) {
  let account, input, requestId;
  const previous = source => {
    const payment = source.payments.find(item => item.requestId === requestId);
    if (!payment) return null;
    if (['month', 'amount', 'paidOn', 'note'].some(key => payment[key] !== input[key])) throw fail('employeePaymentRequestConflict', 409);
    return payment;
  };
  try {
    const employee = await employeeFor(req);
    input = validateEmployeePayment(req.body);
    requestId = typeof req.body?.requestId === 'string' ? req.body.requestId.toLowerCase() : '';
    if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(requestId)) throw fail('employeePaymentInvalid', 400);
    account = await accountFor(req, employee);
    const replay = previous(account);
    if (replay) return res.json({ payment: publicPayment(replay) });
    const row = buildEmployeePayroll(account.plans, employee.ventes, account.payments).months.find(item => item.month === input.month);
    if (!row || payrollCents(input.amount) > Math.round(row.due * 100)) throw fail('employeePaymentExceedsDue', 409);
    if (row.type === 'profitShare' && row.unpriced) throw fail('employeeProfitMissing', 409);
    const actor = await Admin.findById(req.user.id).select('name');
    const id = new mongoose.Types.ObjectId();
    account.payments.push({ _id: id, requestId, ...input, reference: `EP-${input.month.replace('-', '')}-${String(id).toUpperCase()}`, createdAt: new Date(), createdBy: req.user.id, createdByName: actor?.name || '', employeeName: employee.name, employeePhone: employee.phone || '', employeeCin: employee.cin || '', compensationType: row.type, earned: row.earned, profit: row.profit, paidBefore: row.paid, paidAfter: (Math.round(row.paid * 100) + payrollCents(input.amount)) / 100, remaining: (Math.round(row.due * 100) - payrollCents(input.amount)) / 100 });
    await account.save();
    res.status(201).json({ payment: publicPayment(account.payments.find(item => item.requestId === requestId)) });
  } catch (error) {
    if (error.name === 'VersionError' && account && input && requestId) {
      try { const fresh = await Payroll.findById(account._id), replay = fresh && previous(fresh); if (replay) return res.json({ payment: publicPayment(replay) }); }
      catch (failure) { return errorResponse(res, failure); }
    }
    errorResponse(res, error);
  }
}
