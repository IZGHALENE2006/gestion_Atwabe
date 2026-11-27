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
before(async () => { process.env.JWT_SECRET = 'isolated-delivery-payment'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
async function request(path, body, actor = admin) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
const create = (f, patch = {}) => request('/tailoring-orders', f.input({ registerClient: false, paidAmount: 200, items: [garment({ price: 500, shirtType: 'عادي' })], ...patch }));
const deliveryBody = (order, patch = {}) => ({ version: order.__v, deliverOnCredit: false, paymentAmount: 300, requestId: randomUUID(), ...patch });
const deliver = (order, body, actor) => request('/tailoring-orders/' + order._id + '/deliver', body, actor);
const stored = (f, order) => f.orders.get(order._id);

for (const type of ['djellaba', 'jabador', 'malakiya', 'shirts', 'trousers']) test(type + ': collecting the remaining amount and delivering commit one audited payment and immutable receipt', async t => {
  const f = clientRegistrationFixture(t), made = await create(f, { garmentType: type, items: [garment({ price: 500, shirtType: 'عادي', trouserType: 'regular' })] }); assert.equal(made.status, 201, JSON.stringify(made.data));
  f.staff.name = 'الموظف أحمد'; f.staff.moduleAccess = ['tailoring']; f.staff.operationPermissions = { tailoring: ['view', 'deliver', 'payment'] };
  const body = deliveryBody(made.data), result = await deliver(made.data, { ...body, actor: { name: 'مزور' }, paidAmount: 99999 }, staff);
  assert.equal(result.status, 200, JSON.stringify(result.data)); assert.ok(result.data.deliveredAt); assert.equal(result.data.paidAmount, 500); assert.equal(result.data.remainingAmount, 0);
  assert.equal(result.data.paymentReceipt.amount, 300); assert.equal(result.data.paymentReceipt.actor.name, 'الموظف أحمد'); assert.equal(result.data.paymentReceipt.actor.id, employee); assert.ok(result.data.paymentReceipt.paidAt);
  assert.equal(result.data.paymentReceipt.document.paymentAmount, 300); assert.equal(result.data.paymentReceipt.document.paidAmount, 500); assert.equal(result.data.paymentReceipt.document.remainingAmount, 0);
  assert.equal(result.data.customerReceipt.paidAmount, 200); assert.equal(result.data.deliveryFinancials.revenueAmount, 500); assert.equal(result.data.addedPayments.length, 1); assert.ok(!Object.hasOwn(result.data, 'deliveryPayment'));
  const repeated = await deliver(made.data, body, staff); assert.equal(repeated.status, 200); assert.deepEqual(repeated.data.paymentReceipt, result.data.paymentReceipt); assert.equal(repeated.data.deliveredAt, result.data.deliveredAt);
  assert.equal(stored(f, made.data).paymentReceipts.length, 1); assert.equal(f.credits.size, 0);
});

test('zero and partial ordinary collection keep the exact unpaid balance without a zero receipt', async t => {
  const f = clientRegistrationFixture(t);
  for (const amount of [0, '50,25']) {
    const made = await create(f), result = await deliver(made.data, deliveryBody(made.data, { paymentAmount: amount }));
    assert.equal(result.status, 200, JSON.stringify(result.data)); const expected = amount === 0 ? 0 : 50.25;
    assert.equal(result.data.paidAmount, 200 + expected); assert.equal(result.data.remainingAmount, 300 - expected); assert.equal(result.data.addedPayments.length, expected ? 1 : 0); assert.equal(Boolean(result.data.paymentReceipt), expected > 0); assert.ok(result.data.deliveredAt);
  }
});

test('delivery with a partial payment transfers only the new remaining balance to the original owner’s credit account', async t => {
  const f = clientRegistrationFixture(t), made = await create(f), body = deliveryBody(made.data, { paymentAmount: '50,25', deliverOnCredit: true });
  const result = await deliver(made.data, body); assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.paidAmount, 250.25); assert.equal(result.data.remainingAmount, 249.75); assert.equal(result.data.creditDelivery.remainingAmount, 249.75); assert.equal(result.data.paymentReceipt.amount, 50.25);
  const account = [...f.credits.values()][0]; assert.deepEqual([account.Total, account.Paye, account.creditInvoices.length, account.paymentHistory.length], [500, 250.25, 1, 1]);
  const repeated = await deliver(made.data, body); assert.equal(repeated.status, 200); assert.deepEqual(repeated.data.paymentReceipt, result.data.paymentReceipt); assert.equal([...f.credits.values()][0].Paye, 250.25); assert.equal(stored(f, made.data).paymentReceipts.length, 1);
  const paid = await request('/tailoring-orders/' + made.data._id + '/payments', { amount: 49.75, requestId: randomUUID(), version: result.data.__v }); assert.equal(paid.status, 200); assert.equal(paid.data.remainingAmount, 200); assert.equal(paid.data.addedPayments.length, 2); assert.deepEqual(paid.data.addedPayments[0], result.data.paymentReceipt);
});

test('zero deposit delivery on credit preserves the existing credit flow', async t => {
  const f = clientRegistrationFixture(t), made = await create(f), result = await deliver(made.data, deliveryBody(made.data, { paymentAmount: 0, deliverOnCredit: true }));
  assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.remainingAmount, 300); assert.equal(result.data.addedPayments.length, 0); assert.equal(result.data.creditDelivery.remainingAmount, 300);
});

test('invalid amounts, invalid request IDs, reused payment IDs and overpayments cannot deliver or change money', async t => {
  const f = clientRegistrationFixture(t), made = await create(f);
  for (const amount of ['', -1, '0.001', {}, 300.01]) {
    const result = await deliver(made.data, deliveryBody(made.data, { paymentAmount: amount })); assert.equal(result.status, 400, JSON.stringify(result.data)); assert.equal(stored(f, made.data).paidAmount, 200); assert.equal(stored(f, made.data).deliveredAt, null); assert.equal(stored(f, made.data).paymentReceipts.length, 0);
  }
  assert.equal((await deliver(made.data, deliveryBody(made.data, { requestId: 'bad' }))).status, 400);
  const requestId = randomUUID(), paid = await request('/tailoring-orders/' + made.data._id + '/payments', { amount: 10, requestId, version: made.data.__v }); assert.equal(paid.status, 200);
  const reused = await deliver(paid.data, deliveryBody(paid.data, { requestId, paymentAmount: 10 })); assert.equal(reused.status, 409); assert.equal(reused.data.message, 'requestConflict'); assert.equal(stored(f, made.data).paidAmount, 210); assert.equal(stored(f, made.data).deliveredAt, null);
});

test('employee needs the payment operation to collect money; delivering without collection needs only delivery permission', async t => {
  const f = clientRegistrationFixture(t), made = await create(f); f.staff.moduleAccess = ['tailoring']; f.staff.operationPermissions = { tailoring: ['view', 'deliver'] };
  assert.equal((await deliver(made.data, deliveryBody(made.data), staff)).status, 403); assert.equal(stored(f, made.data).paidAmount, 200);
  const result = await deliver(made.data, deliveryBody(made.data, { paymentAmount: 0 }), staff); assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.remainingAmount, 300);
});

test('wrong owner, stale version and full collection with credit enabled reject without committing the payment', async t => {
  const f = clientRegistrationFixture(t), made = await create(f);
  assert.equal((await deliver(made.data, deliveryBody(made.data), { id: otherOwner, role: 'admin' })).status, 404);
  assert.equal((await deliver(made.data, deliveryBody(made.data, { version: made.data.__v + 1 }))).status, 409);
  assert.equal((await deliver(made.data, deliveryBody(made.data, { deliverOnCredit: true }))).status, 400);
  assert.equal(stored(f, made.data).paidAmount, 200); assert.equal(stored(f, made.data).paymentReceipts.length, 0); assert.equal(f.clients.size, 0); assert.equal(f.credits.size, 0);
});

for (const fault of ['orderBefore', 'orderAfter', 'clientBefore', 'creditBefore', 'creditAfter']) test(fault + ': delivery retry recovers exactly one payment, receipt and delivery', async t => {
  const f = clientRegistrationFixture(t), made = await create(f), credit = !fault.startsWith('order'), body = deliveryBody(made.data, { paymentAmount: credit ? 50 : 300, deliverOnCredit: credit });
  if (fault === 'clientBefore') f.faults.clientBefore = true;
  if (fault.startsWith('order')) {
    const save = Order.prototype.save; let fail = true;
    t.mock.method(Order.prototype, 'save', async function () { if (fail && fault === 'orderBefore') { fail = false; throw Error('Isolated order outage'); } const result = await save.call(this); if (fail) { fail = false; throw Error('Isolated lost order acknowledgement'); } return result; });
  }
  if (fault.startsWith('credit')) {
    const save = Credit.prototype.save; let fail = true;
    t.mock.method(Credit.prototype, 'save', async function () { if (fail && fault === 'creditBefore') { fail = false; throw Error('Isolated credit outage'); } const result = await save.call(this); if (fail) { fail = false; throw Error('Isolated lost credit acknowledgement'); } return result; });
  }
  assert.equal((await deliver(made.data, body)).status, 500);
  const result = await deliver(made.data, body); assert.equal(result.status, 200, JSON.stringify(result.data)); assert.ok(result.data.deliveredAt); assert.equal(result.data.paidAmount, credit ? 250 : 500); assert.equal(result.data.paymentReceipt.amount, credit ? 50 : 300); assert.equal(stored(f, made.data).paymentReceipts.length, 1);
  if (credit) assert.deepEqual([[...f.credits.values()][0].Total, [...f.credits.values()][0].Paye], [500, 250]);
});

test('concurrent deliveries cannot collect twice and changed retries cannot silently add or change payments', async t => {
  const f = clientRegistrationFixture(t), made = await create(f), body = deliveryBody(made.data);
  const results = await Promise.all([deliver(made.data, body), deliver(made.data, body)]); assert.ok(results.some(row => row.status === 200)); assert.ok(results.every(row => [200, 409].includes(row.status)));
  const repeated = await deliver(made.data, body); assert.equal(repeated.status, 200);
  for (const patch of [{ paymentAmount: 50 }, { deliverOnCredit: true }, { requestId: randomUUID() }]) assert.equal((await deliver(made.data, { ...body, ...patch })).status, 409);
  assert.equal(stored(f, made.data).paidAmount, 500); assert.equal(stored(f, made.data).paymentReceipts.length, 1);
});
