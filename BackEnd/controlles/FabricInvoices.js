import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import Invoice from '../models/FabricInvoice.js';
import Fabric from '../models/Fabric.js';
import UserCredit from '../models/userCidit.js';
import Employee from '../models/EmployeModele.js';
import { fabricAccessFor } from './Fabrics.js';
import { mutateCredit, creditReceipt } from './UserCridite.js';
import { canEmployeeOperation } from '../../shared/employeeOperations.js';
import { createFabricSaleFinancials } from '../../shared/fabricProfits.js';
import { creditCustomer } from '../../shared/creditDocuments.js';
import { creditInvoiceBalances } from '../../shared/creditInvoiceBalances.js';
import { validateFabricInvoice, fabricInvoiceTotals, fabricInvoiceFailure as fail, fabricInvoiceReference, fabricInvoiceLineName } from '../../shared/fabricInvoices.js';
import { tailoringMoneyCents } from '../../shared/tailoring.js';
import { changeInvoiceFabric } from '../utils/fabricInvoiceStock.js';

const locks = new Map();
async function locked(owner, fn) {
  const key = String(owner), previous = locks.get(key) || Promise.resolve(); let unlock;
  const next = new Promise(resolve => { unlock = resolve; }); locks.set(key, next); await previous;
  try { return await fn(); } finally { unlock(); if (locks.get(key) === next) locks.delete(key); }
}
const id = () => new mongoose.Types.ObjectId().toString();
const fingerprint = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');
const replyError = (res, error, pending = false) => res.status(pending ? 503 : error.status || 500).json({ message: pending ? 'invoicePending' : error.status ? error.message : 'invoiceFailed' });
async function creditPermission(req, action) {
  if (req.user.role !== 'admin' && !canEmployeeOperation('Employe', await Employee.findById(req.user.id), 'credit', action)) throw fail('forbidden', 403);
}
async function salePermissions(req, access, input) {
  if (!access.permissions.sell || input.lines.some(line => line.pricingMode === 'wholesale') && !access.permissions.wholesale || input.lines.some(line => line.discountValue > 0) && !access.permissions.discount) throw fail('forbidden', 403);
  if (input.paymentMode === 'credit') {
    if (!access.permissions.creditSale) throw fail('forbidden', 403);
    await creditPermission(req, 'addDebt'); if (input.newCustomer) await creditPermission(req, 'add'); if (input.amountPaid > 0) await creditPermission(req, 'payment');
  }
}
async function prepare(input, access, actor) {
  let customer = { name: input.clientName, phone: input.phone }, customerId = '';
  if (input.paymentMode === 'credit') {
    if (input.customerId) { const account = await UserCredit.findOne({ _id: input.customerId, idUser: access.idAdmin }); if (!account) throw fail('invalidInvoiceCustomer', 404); customer = creditCustomer(account); customerId = String(account._id); }
    else {
      for (const key of ['email', 'cin']) if (input.newCustomer[key] && await UserCredit.findOne({ idUser: access.idAdmin, [key]: input.newCustomer[key] })) throw fail('invoiceCustomerExists', 409);
      customer = { ...input.newCustomer }; customerId = id();
    }
  }
  const fabrics = [];
  for (const fabricId of new Set(input.lines.map(line => line.fabricId))) { const fabric = await Fabric.findOne({ _id: fabricId, idAdmin: access.idAdmin }); if (!fabric) throw fail('notFound', 404); fabrics.push(fabric); }
  const totals = fabricInvoiceTotals(input.lines, fabrics);
  const paidAmount = input.paymentMode === 'paid' ? totals.total : input.amountPaid;
  if (paidAmount > totals.total) throw fail('invalidInvoicePayment');
  const lines = input.lines.map((line, index) => {
    const fabric = fabrics.find(row => String(row._id) === line.fabricId), color = fabric.colors.id(line.colorId), piece = color?.pieces.id(line.pieceId), sale = totals.sales[index];
    if (!piece) throw fail('notFound', 404); if (Math.round(piece.meters * 1000) < Math.round(line.meters * 1000)) throw fail('insufficientMeters', 409);
    if (line.expectedUnitPrice !== sale.unitPrice) throw fail('invoicePriceChanged', 409);
    return { fabricId: line.fabricId, colorId: line.colorId, pieceId: line.pieceId, movementId: id(), type: fabric.type, reference: fabric.reference, color: color.name, colorNumber: color.number, barcode: piece.barcode, meters: line.meters,
      sale: { ...sale, ...createFabricSaleFinancials(line.meters, fabric.purchasePricePerMeter, sale.total) } };
  });
  return Invoice.create({ idAdmin: access.idAdmin, requestId: input.requestId, fingerprint: fingerprint(input), plan: { actor, customer, customerId, ...(input.newCustomer ? { newCustomer: input.newCustomer } : {}), date: new Date().toISOString(), lines, subtotal: totals.subtotal, discountAmount: totals.discountAmount, total: totals.total, paidAmount, paymentMode: input.paymentMode } });
}
async function recordCredit(operation) {
  const p = operation.plan; if (!p.customerId) return;
  if (p.newCustomer && !await UserCredit.findOne({ _id: p.customerId, idUser: operation.idAdmin })) {
    try { await UserCredit.create({ _id: p.customerId, idUser: operation.idAdmin, ...p.newCustomer, createdBy: p.actor }); }
    catch (error) { if (error.code !== 11000 || !await UserCredit.findOne({ _id: p.customerId, idUser: operation.idAdmin })) throw error; }
  }
  await mutateCredit(p.customerId, operation.idAdmin, user => {
    if (user.creditInvoices.some(row => row.id === String(operation._id))) return { unchanged: true };
    let unallocated = Math.round(p.paidAmount * 100);
    const lines = p.lines.map((line, index) => {
      const cents = Math.round(line.sale.total * 100), paid = index === p.lines.length - 1 ? unallocated : Math.min(unallocated, cents); unallocated -= paid;
      return { id: line.movementId, invoiceId: String(operation._id), fabricInvoiceId: operation._id, unit: 'meter', nom: fabricInvoiceLineName(line), prix: line.sale.unitPrice, Quantite: line.meters, lineTotal: line.sale.total, discountAmount: line.sale.discountAmount, Paiement: paid / 100, Date: p.date, actor: p.actor };
    });
    const paidBefore = Number(user.Paye);
    user.Total = (Math.round(user.Total * 100) + Math.round(p.total * 100)) / 100; user.Paye = (Math.round(user.Paye * 100) + Math.round(p.paidAmount * 100)) / 100;
    user.Qauntite = Math.round((user.Qauntite + p.lines.reduce((sum, line) => sum + line.meters, 0)) * 1000) / 1000;
    user.produit.push(...lines); user.creditInvoices.push({ id: String(operation._id), origin: 'fabric', actor: p.actor, Date: p.date, customer: p.customer, lines, total: p.total, paid: p.paidAmount, remaining: (Math.round(p.total * 100) - Math.round(p.paidAmount * 100)) / 100 });
    if (p.paidAmount > 0) user.paymentHistory.push(creditReceipt(user, p.paidAmount, { paidBefore, date: new Date(p.date), source: 'initial', invoiceId: String(operation._id), actor: p.actor }));
    return {};
  });
}
async function finish(operation) {
  const scope = { _id: operation._id, idAdmin: operation.idAdmin }, fabricIds = [...new Set(operation.plan.lines.map(line => line.fabricId))];
  if (operation.status === 'prepared') {
    try { for (const fabricId of fabricIds) await changeInvoiceFabric(operation, fabricId, 'reserve'); }
    catch (error) {
      if (['notFound', 'insufficientMeters', 'invoiceCancelled'].includes(error.message)) { await Invoice.updateOne({ ...scope, status: 'prepared' }, { $set: { status: 'cancelling' } }); }
      else throw error;
    }
    await Invoice.updateOne({ ...scope, status: 'prepared' }, { $set: { status: 'reserved' } }); operation = await Invoice.findOne(scope);
  }
  if (operation.status === 'cancelling') {
    for (const fabricId of fabricIds) {
      // An unreserved fabric may already have been deleted; only committed debits need restoring.
      if (await Fabric.findOne({ _id: fabricId, idAdmin: operation.idAdmin })) await changeInvoiceFabric(operation, fabricId, 'return');
    }
    await Invoice.updateOne({ ...scope, status: 'cancelling' }, { $set: { status: 'cancelled' } }); operation = await Invoice.findOne(scope);
  }
  if (operation.status === 'cancelled') throw fail('invoiceCancelled', 409);
  if (operation.status === 'reserved') {
    await recordCredit(operation);
    for (const fabricId of fabricIds) await changeInvoiceFabric(operation, fabricId, 'record');
    await Invoice.updateOne({ ...scope, status: 'reserved' }, { $set: { status: 'complete' } }); operation = await Invoice.findOne(scope);
  }
  return operation;
}
async function publicInvoice(operation) {
  const p = operation.plan, lines = p.lines.map(line => ({ ...Object.fromEntries(['fabricId', 'colorId', 'pieceId', 'type', 'reference', 'color', 'colorNumber', 'barcode', 'meters'].map(key => [key, line[key]])), ...Object.fromEntries(['pricingMode', 'unitPrice', 'subtotal', 'discountAmount', 'discountType', 'discountValue', 'total'].map(key => [key, line.sale[key]])) }));
  const account = p.customerId ? await UserCredit.findOne({ _id: p.customerId, idUser: operation.idAdmin }) : null;
  const balance = account ? creditInvoiceBalances(account).get(String(operation._id)) : null;
  const payments = p.paidAmount > 0 ? [{ id: 'initial', amount: p.paidAmount, Date: p.date, actor: p.actor }] : [];
  payments.push(...(balance?.payments || []).map(payment => ({ id: payment.id, amount: payment.allocatedAmount, Date: payment.Date, actor: payment.actor })));
  let paid = 0;
  const receipts = payments.map(payment => {
    const before = paid; paid = (Math.round(paid * 100) + Math.round(payment.amount * 100)) / 100;
    return { ...payment, document: { kind: 'payment', historical: true, reference: fabricInvoiceReference(operation._id) + '-P' + payment.id, date: payment.Date, customer: p.customer, actor: payment.actor, total: p.total, amount: payment.amount, paidBefore: before, paid, remainingBefore: (Math.round(p.total * 100) - Math.round(before * 100)) / 100, remaining: (Math.round(p.total * 100) - Math.round(paid * 100)) / 100 } };
  });
  const remaining = balance?.remaining ?? (Math.round(p.total * 100) - Math.round(p.paidAmount * 100)) / 100;
  return { _id: String(operation._id), reference: fabricInvoiceReference(operation._id), status: operation.status, date: p.date, actor: p.actor, customer: p.customer, creditUserId: p.customerId, paymentMode: p.paymentMode, lines, subtotal: p.subtotal, discountAmount: p.discountAmount, total: p.total, paidAmount: (Math.round(p.total * 100) - Math.round(remaining * 100)) / 100, remaining, payments: receipts, accountUnavailable: Boolean(p.customerId && !account) };
}
export async function createFabricInvoice(req, res) {
  let operation;
  try {
    const access = await fabricAccessFor(req, 'addInvoice'), input = validateFabricInvoice(req.body); await salePermissions(req, access, input);
    const output = await locked(access.idAdmin, async () => {
      operation = await Invoice.findOne({ idAdmin: access.idAdmin, requestId: input.requestId });
      if (operation && (operation.fingerprint !== fingerprint(input) || String(operation.plan.actor.id) !== String(access.createdBy))) throw fail('requestConflict', 409);
      if (!operation) operation = await prepare(input, access, { id: String(access.createdBy), name: access.createdByName, role: req.user.role });
      return publicInvoice(await finish(operation));
    }); res.status(201).json({ invoice: output });
  } catch (error) { replyError(res, error, Boolean(operation && !error.status)); }
}
export async function listFabricInvoices(req, res) {
  try { const { idAdmin } = await fabricAccessFor(req, 'invoiceHistory'); const rows = await Invoice.find({ idAdmin }).sort({ createdAt: -1 }); res.json({ invoices: await Promise.all(rows.map(publicInvoice)) }); }
  catch (error) { replyError(res, error); }
}
export async function resumeFabricInvoice(req, res) {
  try {
    const access = await fabricAccessFor(req, 'addInvoice');
    const invoice = await locked(access.idAdmin, async () => {
      const operation = await Invoice.findOne({ _id: req.params.id, idAdmin: access.idAdmin }); if (!operation) throw fail('notFound', 404);
      if (req.user.role !== 'admin' && String(operation.plan.actor.id) !== String(access.createdBy)) throw fail('forbidden', 403);
      await salePermissions(req, access, { ...operation.plan, amountPaid: operation.plan.paidAmount, lines: operation.plan.lines.map(line => line.sale) });
      return publicInvoice(await finish(operation));
    }); res.json({ invoice });
  } catch (error) { replyError(res, error); }
}
export async function payFabricInvoice(req, res) {
  try {
    const access = await fabricAccessFor(req, 'invoicePayment'); await creditPermission(req, 'payment');
    const operation = await Invoice.findOne({ _id: req.params.id, idAdmin: access.idAdmin });
    if (!operation || operation.status !== 'complete' || !operation.plan.customerId) throw fail('notFound', 404);
    const amount = tailoringMoneyCents(req.body?.amount), requestId = typeof req.body?.requestId === 'string' ? req.body.requestId.toLowerCase() : req.body?.requestId;
    if (amount === null || amount <= 0 || typeof requestId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(requestId)) throw fail('invalidInvoicePayment');
    const hash = fingerprint({ invoiceId: String(operation._id), amount }), actor = { id: access.createdBy, name: access.createdByName, role: req.user.role };
    let paymentId;
    await mutateCredit(operation.plan.customerId, access.idAdmin, user => {
      const previous = user.paymentHistory.find(payment => payment.requestId === requestId);
      if (previous) { if (previous.requestFingerprint !== hash || String(previous.actor?.id) !== String(actor.id)) throw fail('requestConflict', 409); paymentId = previous.id; return { unchanged: true }; }
      if (user.creditInvoices.some(invoice => invoice.requestId === requestId)) throw fail('requestConflict', 409);
      const balance = creditInvoiceBalances(user).get(String(operation._id));
      if (!balance || amount > Math.round(balance.remaining * 100) || amount > Math.round((user.Total - user.Paye) * 100)) throw fail('invalidInvoicePayment');
      const paidBefore = user.Paye; user.Paye = (Math.round(paidBefore * 100) + amount) / 100;
      const payment = creditReceipt(user, amount / 100, { paidBefore, date: new Date(), source: 'payment', invoiceId: String(operation._id), actor, requestId, fingerprint: hash }); paymentId = payment.id; user.paymentHistory.push(payment);
      return {};
    }); const invoice = await publicInvoice(operation); res.json({ invoice, payment: invoice.payments.find(row => row.id === paymentId) });
  } catch (error) { replyError(res, error); }
}
export async function fabricInvoiceCustomers(req, res) {
  try { const { idAdmin } = await fabricAccessFor(req, 'addInvoice'); await creditPermission(req, 'addDebt'); const rows = await UserCredit.find({ idUser: idAdmin }).select('_id name phone').sort({ name: 1 }); res.json({ customers: rows.map(row => ({ _id: row._id, name: row.name, phone: row.phone })) }); }
  catch (error) { replyError(res, error); }
}
