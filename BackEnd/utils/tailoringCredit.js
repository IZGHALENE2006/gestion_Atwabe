import { createHash } from 'node:crypto';
import Client from '../models/Client.js';
import UserCredit from '../models/userCidit.js';
import Order from '../models/TailoringOrder.js';
import { mutateCredit, creditReceipt } from '../controlles/UserCridite.js';
import { matchingClientCredits, creditDeliveryDepositValid } from '../../shared/tailoringCredit.js';
import { creditInvoiceBalances } from '../../shared/creditInvoiceBalances.js';
import { creditCustomer, creditPaymentReference } from '../../shared/creditDocuments.js';
import { createTailoringDeliveryFinancials } from '../../shared/tailoringProfits.js';
import { createTailoringReceipt } from '../../shared/tailoringReceipts.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const cents = value => Math.round(Number(value || 0) * 100);
export async function resolveTailoringClient(value, owner, current) {
  const id = value.clientId === undefined ? current?.clientId : value.clientId;
  if (!id) return value;
  const client = await Client.findOne({ _id: id, idAdmin: owner });
  if (!client) throw fail('chooseCreditClient', 404);
  return { ...value, clientId: client._id, clientName: client.name, phone: client.phone };
}
export async function prepareTailoringCredit(order, access, registeringClient) {
  if (!access.permissions.creditDelivery || !access.permissions.deliver) throw fail('forbidden', 403);
  if (!order.clientId) throw fail('chooseCreditClient', 400);
  if (!creditDeliveryDepositValid(order.totalPrice, order.paidAmount)) throw fail('creditDepositRequired', 400);
  const client = await Client.findOne({ _id: order.clientId, idAdmin: access.idAdmin }) || registeringClient;
  if (!client) throw fail('chooseCreditClient', 404);
  const accounts = await UserCredit.find({ idUser: access.idAdmin });
  const matches = matchingClientCredits(client, accounts);
  if (matches.length > 1) throw fail('creditCustomerAmbiguous');
  return { accountId: matches[0]?._id || client._id, clientId: client._id, state: 'prepared', total: order.totalPrice, initialPaid: order.paidAmount, preparedAt: new Date(), actor: access.creator, customer: { name: client.name, phone: client.phone, cin: client.cin || '' } };
}
async function ensureAccount(order) {
  const plan = order.creditDelivery, scope = { _id: plan.accountId, idUser: order.idAdmin };
  if (await UserCredit.findOne(scope)) return;
  try { await UserCredit.create({ ...scope, ...(plan.customer.toObject?.() || plan.customer), clientId: plan.clientId, createdBy: plan.actor }); }
  catch (error) { if (!await UserCredit.findOne(scope)) throw error; }
}
async function recordDebt(order) {
  const plan = order.creditDelivery, invoiceId = String(order._id);
  await ensureAccount(order);
  await mutateCredit(plan.accountId, order.idAdmin, user => {
    if (user.creditInvoices.some(invoice => invoice.id === invoiceId)) return { unchanged: true };
    if (user.clientId && String(user.clientId) !== String(plan.clientId)) throw fail('creditCustomerAmbiguous');
    user.clientId = plan.clientId;
    const paidBefore = user.Paye;
    const line = { id: invoiceId, invoiceId, tailoringOrderId: order._id, actor: plan.actor, nom: 'طلب فصالة · FS-' + invoiceId.toUpperCase(), prix: plan.total, Quantite: 1, lineTotal: plan.total, Paiement: plan.initialPaid, Date: plan.preparedAt };
    user.Total = (cents(user.Total) + cents(plan.total)) / 100; user.Paye = (cents(user.Paye) + cents(plan.initialPaid)) / 100; user.Qauntite += 1;
    user.produit.push(line);
    user.creditInvoices.push({ id: invoiceId, origin: 'tailoring', actor: plan.actor, Date: plan.preparedAt, customer: creditCustomer(user), line, total: plan.total, paid: plan.initialPaid, remaining: (cents(plan.total) - cents(plan.initialPaid)) / 100 });
    if (plan.initialPaid > 0) user.paymentHistory.push(creditReceipt(user, plan.initialPaid, { paidBefore, date: plan.preparedAt, source: 'initial', invoiceId, actor: plan.actor }));
    return {};
  });
}
async function cancelDebt(order) {
  const invoiceId = String(order._id);
  await mutateCredit(order.creditDelivery.accountId, order.idAdmin, user => {
    const invoice = user.creditInvoices.find(row => row.id === invoiceId);
    if (!invoice) throw fail('creditAccountUnavailable');
    if (invoice.cancelledAt) return { unchanged: true };
    const remaining = creditInvoiceBalances(user).get(invoiceId)?.remaining;
    if (remaining === undefined) throw fail('creditAccountUnavailable');
    // Keep money already received and the original receipt. Only cancel the debt
    // still owed; prior payments must never become available a second time.
    const line = user.produit.find(row => row.invoiceId === invoiceId);
    line.lineTotal = (cents(order.creditDelivery.total) - cents(remaining)) / 100; line.prix = line.lineTotal;
    user.Total = (cents(user.Total) - cents(remaining)) / 100;
    invoice.cancelledAt = order.cancelledAt; invoice.cancelledBy = order.cancelledBy; invoice.cancelledPaid = line.lineTotal;
    return {};
  });
}
export async function finishTailoringCredit(initial) {
  let order = initial;
  if (!order?.creditDelivery || order.stockOperation) return order;
  for (let attempt = 0; attempt < 5; attempt++) {
    const plan = order.creditDelivery;
    if (plan.state === 'prepared') {
      await recordDebt(order);
      order.deliveryFinancials = createTailoringDeliveryFinancials(order);
      if (order.costing?.pricingVersion >= 2 || order.fabricSalesVersion === 1) order.deliveryFabricItems = order.items.map(item => item.toObject());
      order.deliveredAt = plan.preparedAt; order.deliveredBy = plan.actor.id; plan.state = 'complete';
    } else if (order.cancelledAt && plan.state !== 'cancelled') {
      await cancelDebt(order); plan.state = 'cancelled';
    } else return order;
    try { await order.save(); return order; }
    catch (error) {
      if (error.name !== 'VersionError' || attempt === 4) throw error;
      order = await Order.findOne({ _id: order._id, idAdmin: order.idAdmin });
      if (!order) throw fail('notFound', 404);
    }
  }
}
export async function clientCreditSummaries(clients, owner) {
  const accounts = await UserCredit.find({ idUser: owner });
  return clients.map(client => {
    const matches = matchingClientCredits(client, accounts);
    const remaining = matches.reduce((sum, account) => {
      const total = cents(account.Total) || account.produit.reduce((value, line) => value + cents(line.lineTotal ?? line.prix * line.Quantite), 0);
      const paid = cents(account.Paye) || account.produit.reduce((value, line) => value + cents(line.Paiement), 0);
      return sum + Math.max(0, total - paid);
    }, 0) / 100;
    return { ...(client.toObject?.() || client), creditRemainingAmount: remaining, creditUserId: matches.length === 1 ? String(matches[0]._id) : '', creditAmbiguous: matches.length > 1 };
  });
}
export async function publicTailoringCreditOrder(base, source) {
  const plan = source.creditDelivery;
  if (!plan) return base;
  const account = await UserCredit.findOne({ _id: plan.accountId, idUser: source.idAdmin });
  const invoice = account?.creditInvoices.find(row => row.id === String(source._id));
  const balance = account ? creditInvoiceBalances(account).get(String(source._id)) : null;
  if (!invoice || !balance) throw fail('creditAccountUnavailable');
  let paid = plan.initialPaid;
  const addedPayments = balance.payments.map(payment => {
    paid = (cents(paid) + cents(payment.allocatedAmount)) / 100;
    const reference = creditPaymentReference(account._id, payment, 0);
    return { amount: payment.allocatedAmount, paidAt: payment.Date, actor: payment.actor, reference, creditPaymentId: payment.id, document: createTailoringReceipt({ ...base, paidAmount: paid }, { kind: 'payment', reference, issuedAt: payment.Date, paymentAmount: payment.allocatedAmount }) };
  });
  const paidAmount = invoice.cancelledAt ? invoice.cancelledPaid : (cents(plan.total) - cents(balance.remaining)) / 100;
  return { ...base, paidAmount, remainingAmount: (cents(base.totalPrice) - cents(paidAmount)) / 100, addedPayments: [...base.addedPayments, ...addedPayments], creditDelivery: { accountId: String(plan.accountId), state: plan.state, initialAmount: (cents(plan.total) - cents(plan.initialPaid)) / 100, remainingAmount: invoice.cancelledAt ? 0 : balance.remaining } };
}
export async function payTailoringCredit(order, amount, requestId, actor) {
  const hash = createHash('sha256').update(JSON.stringify({ orderId: String(order._id), amount, actorId: String(actor.id) })).digest('hex');
  let paymentId;
  await mutateCredit(order.creditDelivery.accountId, order.idAdmin, user => {
    const previous = user.paymentHistory.find(row => row.requestId === requestId);
    if (previous) { if (previous.requestFingerprint !== hash) throw fail('requestConflict'); paymentId = previous.id; return { unchanged: true }; }
    if (user.creditInvoices.some(row => row.requestId === requestId)) throw fail('requestConflict');
    if (order.cancelledAt) throw fail('orderCancelled');
    const balance = creditInvoiceBalances(user).get(String(order._id));
    if (!balance || amount > cents(balance.remaining) || amount > cents(user.Total) - cents(user.Paye)) throw fail('paymentExceedsRemaining', 400);
    const paidBefore = user.Paye;
    user.Paye = (cents(paidBefore) + amount) / 100;
    const payment = creditReceipt(user, amount / 100, { paidBefore, date: new Date(), source: 'payment', invoiceId: String(order._id), actor, requestId, fingerprint: hash });
    paymentId = payment.id; user.paymentHistory.push(payment); return {};
  });
  return paymentId;
}
