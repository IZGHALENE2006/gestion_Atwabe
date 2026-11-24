import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import Order from '../BackEnd/models/TailoringOrder.js';
import Credit from '../BackEnd/models/userCidit.js';
import { clientRegistrationFixture } from './helpers/clientRegistrationFixture.js';
import { garment, owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';

const original = process.env.JWT_SECRET, admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe', idAdmin: otherOwner };
let server, base;
before(async () => { process.env.JWT_SECRET = 'isolated-delivery-owner'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
async function request(path, body, actor = admin) { const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, data: await response.json() }; }
const create = (f, patch = {}) => request('/tailoring-orders', f.input({ registerClient: false, paidAmount: 75.25, ...patch }));
const deliver = (order, patch = {}, actor) => request('/tailoring-orders/' + order._id + '/deliver', { version: order.__v, deliverOnCredit: true, ...patch }, actor);
const account = f => [...f.credits.values()][0];

for (const type of ['djellaba', 'jabador', 'malakiya', 'shirts', 'trousers']) test(type + ': delivery registers the manual order owner and the exact remaining credit without a customer selection', async t => {
  const f = clientRegistrationFixture(t), made = await create(f, { garmentType: type, items: [garment({ price: 400, shirtType: 'عادي', trouserType: 'regular' })] }); assert.equal(made.status, 201, JSON.stringify(made.data)); assert.equal(f.clients.size, 0);
  const result = await deliver(made.data); assert.equal(result.status, 200, JSON.stringify(result.data)); const client = [...f.clients.values()][0];
  assert.equal(result.data.clientId, String(client._id)); assert.equal(client.name, made.data.clientName); assert.equal(client.phone, made.data.phone); assert.equal(String(client.createdFromTailoringOrderId), made.data._id); assert.ok(result.data.deliveredAt); assert.equal(result.data.garmentType, type); assert.equal(result.data.creditDelivery.remainingAmount, 324.75);
  assert.deepEqual([account(f).Total, account(f).Paye, account(f).creditInvoices.length, account(f).paymentHistory.length], [400, 75.25, 1, 1]); assert.equal(String(account(f).clientId), result.data.clientId); assert.equal(String(account(f).creditInvoices[0].line.tailoringOrderId), made.data._id); assert.equal(result.data.customerReceipt.clientName, made.data.customerReceipt.clientName);
  assert.equal((await deliver(made.data)).status, 200); assert.equal(f.clients.size, 1); assert.equal(f.credits.size, 1); assert.equal(account(f).creditInvoices.length, 1); assert.equal(account(f).Paye, 75.25);
  const directory = await request('/clients'); assert.equal(directory.status, 200); const row = directory.data.clients.find(row => row._id === result.data.clientId); assert.equal(row.creditRemainingAmount, 324.75); assert.equal(row.tailoringStats.delivered, 1); assert.equal(row.tailoringStats.byType[type].total, 1);
});
test('an already linked order keeps its client ID and original customer snapshot when the directory changes', async t => {
  const f = clientRegistrationFixture(t), client = f.seedClient(), made = await create(f, { clientId: String(client._id) }); client.name = 'الاسم المحدّث'; client.phone = '0688888888';
  const result = await deliver(made.data); assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.clientId, String(client._id)); assert.equal(result.data.clientName, made.data.clientName); assert.equal(result.data.phone, made.data.phone); assert.equal(f.clients.size, 1); assert.equal(String(account(f).clientId), String(client._id));
});
test('a manually entered owner reuses the unique normalized name and phone without changing the order data or requiring clients.add', async t => {
  const f = clientRegistrationFixture(t), client = f.seedClient({ name: 'عميل جديد', phone: '+212 677 777 777' }), made = await create(f, { clientName: 'عميل   جديد' });
  Object.assign(f.staff, { moduleAccess: ['tailoring'], operationPermissions: { tailoring: ['deliver', 'creditDelivery'] }, name: 'موظف التسليم' });
  const result = await deliver(made.data, {}, staff); assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.clientId, String(client._id)); assert.equal(result.data.clientName, made.data.clientName); assert.equal(result.data.phone, made.data.phone); assert.equal(f.clients.size, 1); assert.equal(account(f).creditInvoices[0].actor.name, 'موظف التسليم');
});
test('delivery cannot redirect either a linked or manual order to an arbitrary client', async t => {
  const f = clientRegistrationFixture(t), client = f.seedClient(), other = f.seedClient({ name: 'عميل آخر', phone: '0688888888' });
  for (const patch of [{ clientId: String(client._id) }, {}]) {
    const made = await create(f, patch), result = await deliver(made.data, { clientId: String(other._id) }); assert.equal(result.status, 409); assert.equal(result.data.message, 'creditOwnerFixed'); assert.equal(f.orders.get(made.data._id).deliveredAt, null); assert.equal(f.orders.get(made.data._id).creditDelivery, undefined);
  }
  assert.equal(f.credits.size, 0); assert.equal(f.clients.size, 2);
});
test('foreign client identities never match and a foreign administrator cannot deliver this order', async t => {
  const f = clientRegistrationFixture(t); f.seedClient({ idAdmin: otherOwner, createdBy: otherOwner }); const made = await create(f);
  assert.equal((await deliver(made.data, {}, { id: otherOwner, role: 'admin' })).status, 404); assert.equal(f.credits.size, 0);
  const result = await deliver(made.data); assert.equal(result.status, 200); assert.equal(f.clients.size, 2); assert.equal(String([...f.clients.values()].find(row => String(row._id) === result.data.clientId).idAdmin), owner);
});
test('ambiguous customer and credit matches stop before any registration, delivery or debt is committed', async t => {
  const f = clientRegistrationFixture(t); f.seedClient(); f.seedClient(); const made = await create(f); const result = await deliver(made.data); assert.equal(result.status, 409); assert.equal(result.data.message, 'creditOwnerAmbiguous'); assert.equal(f.credits.size, 0); assert.equal(f.orders.get(made.data._id).clientRegistration, undefined);
  f.clients.clear(); for (let i = 0; i < 2; i++) { const credit = new Credit({ idUser: owner, name: 'عميل جديد', phone: '0677777777', Total: 10, Paye: 0, Qauntite: 1, produit: [{ id: 'old' + i, nom: 'دين', prix: 10, Quantite: 1 }], __v: 0 }); f.credits.set(String(credit._id), credit); }
  const blocked = await deliver(made.data); assert.equal(blocked.status, 409); assert.equal(blocked.data.message, 'creditCustomerAmbiguous'); assert.equal(f.clients.size, 0); assert.equal(f.orders.get(made.data._id).deliveredAt, null);
});
test('new client creation needs its own current permission and credits retain the employee who delivered the order', async t => {
  const f = clientRegistrationFixture(t), made = await create(f); Object.assign(f.staff, { moduleAccess: ['tailoring'], operationPermissions: { tailoring: ['deliver', 'creditDelivery'] }, name: 'سلمى' });
  const denied = await deliver(made.data, {}, staff); assert.equal(denied.status, 403); assert.equal(denied.data.message, 'creditClientRegistrationForbidden'); assert.equal(f.clients.size, 0); assert.equal(f.credits.size, 0);
  f.staff.moduleAccess.push('clients'); f.staff.operationPermissions.clients = ['add']; const result = await deliver(made.data, {}, staff); assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(String([...f.clients.values()][0].createdBy), employee); assert.equal(account(f).creditInvoices[0].actor.name, 'سلمى'); assert.equal(account(f).creditInvoices[0].actor.role, 'Employe');
});
test('creditDelivery remains independent from ordinary delivery and zero advance is allowed', async t => {
  const f = clientRegistrationFixture(t), made = await create(f, { paidAmount: 0 }); Object.assign(f.staff, { moduleAccess: ['tailoring', 'clients'], operationPermissions: { tailoring: ['deliver'], clients: ['add'] } });
  assert.equal((await deliver(made.data, {}, staff)).status, 403); assert.equal(f.clients.size, 0); f.staff.operationPermissions.tailoring.push('creditDelivery');
  const result = await deliver(made.data, {}, staff); assert.equal(result.status, 200); assert.equal(result.data.creditDelivery.remainingAmount, 400); assert.equal(account(f).paymentHistory.length, 0);
  const regular = await create(f, { phone: '0699999999' }); assert.equal((await deliver(regular.data, { deliverOnCredit: false }, staff)).status, 200); assert.equal(f.clients.size, 1); assert.equal(account(f).creditInvoices.length, 1);
});
test('a fully paid credit request rejects before creating a client', async t => {
  const f = clientRegistrationFixture(t), made = await create(f, { paidAmount: 400 }); const result = await deliver(made.data); assert.equal(result.status, 400); assert.equal(result.data.message, 'creditDepositRequired'); assert.equal(f.clients.size, 0); assert.equal(f.credits.size, 0);
});
for (const fault of ['clientBefore', 'clientAfter', 'creditBefore', 'creditAfter', 'orderAfter']) test(fault + ': retry resumes the saved intent without duplicate clients, invoices, payments or profits', async t => {
  const f = clientRegistrationFixture(t), made = await create(f);
  if (fault.startsWith('client')) f.faults[fault] = true;
  if (fault.startsWith('credit')) { const save = Credit.prototype.save; let fail = true; t.mock.method(Credit.prototype, 'save', async function () { if (fail && fault === 'creditBefore') { fail = false; throw Error('Credit outage'); } const result = await save.call(this); if (fail && fault === 'creditAfter') { fail = false; throw Error('Lost credit acknowledgement'); } return result; }); }
  if (fault === 'orderAfter') { const save = Order.prototype.save; let fail = true; t.mock.method(Order.prototype, 'save', async function () { const result = await save.call(this); if (fail) { fail = false; throw Error('Lost order acknowledgement'); } return result; }); }
  const first = await deliver(made.data); assert.equal(first.status, fault === 'clientAfter' ? 200 : 500, JSON.stringify(first.data));
  const result = await deliver(made.data); assert.equal(result.status, 200, JSON.stringify(result.data)); assert.ok(result.data.deliveredAt); assert.equal(f.clients.size, 1); assert.equal(f.credits.size, 1); assert.equal(account(f).creditInvoices.length, 1); assert.equal(account(f).paymentHistory.length, 1); assert.equal(account(f).Total, 400); assert.equal(account(f).Paye, 75.25); assert.equal(result.data.deliveryFinancials.revenueAmount, 400);
});
test('simultaneous first deliveries for the same manual owner share one customer and one debt account', async t => {
  const f = clientRegistrationFixture(t), first = await create(f), second = await create(f); const results = await Promise.all([deliver(first.data), deliver(second.data)]); assert.deepEqual(results.map(result => result.status), [200, 200]); assert.equal(f.clients.size, 1); assert.equal(f.credits.size, 1); assert.equal(account(f).creditInvoices.length, 2); assert.equal(account(f).Total, 800); assert.equal(account(f).Paye, 150.5);
});
test('existing payment receipts survive delivery and subsequent credit payments and cancellation use the same balance', async t => {
  const f = clientRegistrationFixture(t), made = await create(f, { paidAmount: 0 }), paymentId = randomUUID();
  const paid = await request('/tailoring-orders/' + made.data._id + '/payments', { amount: 100, version: made.data.__v, requestId: paymentId }); assert.equal(paid.status, 200);
  const result = await deliver(paid.data); assert.equal(result.status, 200); assert.deepEqual(result.data.addedPayments[0], paid.data.paymentReceipt); assert.equal(account(f).Paye, 100);
  const payment = await request('/tailoring-orders/' + made.data._id + '/payments', { amount: 50, version: result.data.__v, requestId: randomUUID() }); assert.equal(payment.status, 200); assert.equal(payment.data.creditDelivery.remainingAmount, 250); assert.ok(payment.data.paymentReceipt.document);
  const cancelled = await request('/tailoring-orders/' + made.data._id + '/cancel', { version: payment.data.__v }); assert.equal(cancelled.status, 200); assert.equal(cancelled.data.creditDelivery.remainingAmount, 0); assert.equal(account(f).Total, 150); assert.equal(account(f).Paye, 150); assert.equal(f.clients.size, 1);
});
