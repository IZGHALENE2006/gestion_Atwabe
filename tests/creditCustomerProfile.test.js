import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import UserCredit from '../BackEnd/models/userCidit.js';
import Employee from '../BackEnd/models/EmployeModele.js';
import { creditActivity, creditDocument } from '../shared/creditDocuments.js';
import { validateCreditCustomerProfile } from '../shared/creditCustomerProfile.js';
import { creditCheckoutFixture, owner, otherOwner, employeeId, inactiveId, foreignEmployeeId } from './helpers/creditCheckoutFixture.js';

const admin = { id: owner, role: 'admin' }, employee = { id: employeeId, role: 'Employe', name: 'اسم مزوّر' };
const profile = (patch = {}) => ({ name: 'فاطمة الجديدة', phone: '0677777777', cin: 'AB777', email: 'fatima@example.com', ...patch });
let server, base;
const previousSecret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = 'credit-profile-tests'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const request = (path, { body, method = 'PUT', actor = admin } = {}) => fetch(base + path, { method, headers: { ...(actor ? { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const edit = (customer, body = profile(), options) => request('/usercridite/update/' + customer._id, { body: { version: customer.__v ?? 0, ...body }, ...options });
const stored = (f, customer = f.customer) => f.rows(UserCredit).find(row => String(row._id) === String(customer._id));
const ledger = user => JSON.stringify(Object.fromEntries(['idUser', 'clientId', 'createdBy', 'Total', 'Paye', 'Qauntite', 'produit', 'paymentHistory', 'creditInvoices', 'Date'].map(key => [key, user.toObject()[key]])));

test('editing identity updates only the profile and records the trusted actor without altering financial or owner fields', async t => {
  const f = creditCheckoutFixture(t), before = ledger(stored(f));
  const response = await edit(f.customer, { ...profile(), idUser: otherOwner, Total: 0, Paye: 0, produit: [], createdBy: { id: otherOwner }, profileUpdates: [], actor: { name: 'مزور' } });
  assert.equal(response.status, 200);
  const result = (await response.json()).user, row = stored(f);
  assert.equal(result.name, profile().name); assert.equal(result.phone, profile().phone); assert.equal(ledger(row), before);
  assert.equal(result.profileUpdates.length, 1); assert.equal(result.profileUpdates[0].actor.id, owner); assert.equal(result.profileUpdates[0].actor.name, 'صاحب المحل');
  assert.equal(result.profileUpdates[0].before.name, 'فاطمة'); assert.equal(result.profileUpdates[0].after.name, profile().name);
  const event = creditActivity(result).find(event => event.kind === 'profile'); assert.ok(event.date); assert.equal(event.actor.id, owner);
});

test('old invoice and payment customer snapshots survive profile edits; new documents use the updated identity', async t => {
  const f = creditCheckoutFixture(t);
  const response = await request('/usercridite/add-product/' + f.customer._id, { method: 'POST', body: { nom: 'قميص', prix: 200, Quantite: 1, Paiement: 50, requestId: randomUUID() } });
  assert.equal(response.status, 201); const first = await response.json();
  const invoice = creditDocument(first.user, first.document), payment = creditDocument(first.user, { kind: 'payment', payment: first.user.paymentHistory.at(-1) });
  const before = ledger(stored(f)); assert.equal((await edit(stored(f))).status, 200);
  const value = await (await request('/usercridite/get/' + f.customer._id, { method: 'GET' })).json();
  assert.deepEqual(creditDocument(value, first.document), invoice); assert.deepEqual(creditDocument(value, { kind: 'payment', payment: value.paymentHistory.at(-1) }), payment);
  assert.equal(ledger(stored(f)), before); assert.equal(creditDocument(value).customer.name, profile().name);
});

test('editing requires its own employee permission, works without details permission and rejects revoked or foreign access', async t => {
  const f = creditCheckoutFixture(t), staff = f.rows(Employee).find(row => String(row._id) === employeeId);
  staff.moduleAccess = ['credit']; staff.operationPermissions = { credit: ['add', 'addDebt', 'payment'] };
  assert.equal((await edit(f.customer, profile(), { actor: employee })).status, 403);
  staff.operationPermissions = { credit: ['update'] };
  assert.equal((await request('/usercridite/get/' + f.customer._id, { actor: employee, method: 'GET' })).status, 200);
  const response = await edit(f.customer, profile(), { actor: employee }); assert.equal(response.status, 200);
  assert.equal((await response.json()).user.profileUpdates[0].actor.name, 'خديجة');
  for (const actor of [null, { id: inactiveId, role: 'Employe' }, { id: foreignEmployeeId, role: 'Employe' }, { id: otherOwner, role: 'admin' }]) {
    const response = await edit(f.customer, profile({ name: 'اسم آخر' }), { actor }); assert.ok([401, 403, 404].includes(response.status));
  }
  staff.operationPermissions = { credit: [] }; assert.equal((await edit(f.customer, profile({ name: 'اسم آخر' }), { actor: employee })).status, 403);
  assert.equal(stored(f).profileUpdates.length, 1);
});

test('duplicate CIN and email are checked within the shop while keeping the same customer values is allowed', async t => {
  const f = creditCheckoutFixture(t);
  f.seed(UserCredit, { idUser: owner, name: 'آخر', email: 'used@example.com', cin: 'USED' });
  for (const patch of [{ email: 'USED@example.com' }, { cin: 'USED' }]) assert.equal((await edit(f.customer, profile(patch))).status, 400);
  f.seed(UserCredit, { idUser: otherOwner, ...profile() });
  assert.equal((await edit(f.customer)).status, 200);
  assert.equal((await edit(f.customer)).status, 200); assert.equal(stored(f).profileUpdates.length, 1);
  assert.equal((await edit(stored(f), profile({ name: 'اسم محدّث' }))).status, 200);
});

test('stale edits never overwrite concurrent payments and identical lost-response retries do not duplicate the audit', async t => {
  const f = creditCheckoutFixture(t);
  const payment = await request('/usercridite/add-payment/' + f.customer._id, { method: 'POST', body: { amount: 50, requestId: randomUUID() } }); assert.equal(payment.status, 200);
  assert.equal((await edit(f.customer)).status, 409); assert.equal(stored(f).Paye, 150); assert.equal(stored(f).name, 'فاطمة');
  const current = stored(f); assert.equal((await edit(current)).status, 200); assert.equal((await edit(current)).status, 200); assert.equal(stored(f).profileUpdates.length, 1);
});

test('simultaneous different edits and database optimistic conflicts cannot silently replace each other', async t => {
  const f = creditCheckoutFixture(t);
  const results = await Promise.all([edit(f.customer, profile({ name: 'الأول' })), edit(f.customer, profile({ name: 'الثاني' }))]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]); assert.equal(stored(f).profileUpdates.length, 1);
});

test('invalid identity fields or versions and missing accounts leave the ledger unchanged', async t => {
  const f = creditCheckoutFixture(t), before = ledger(stored(f));
  for (const patch of [{ name: '' }, { name: {} }, { name: 'x'.repeat(161) }, { phone: 'abc' }, { phone: { $ne: '' } }, { email: 'invalid' }, { cin: 'ab\ncd' }, { email: null }]) {
    assert.equal((await edit(f.customer, profile(patch))).status, 400);
  }
  for (const version of [undefined, null, -1, '0', 0.5]) assert.equal((await edit(f.customer, { ...profile(), version })).status, 409);
  assert.equal((await edit({ _id: '999999999999999999999999' })).status, 404); assert.equal((await edit({ _id: 'invalid' })).status, 404);
  assert.equal(ledger(stored(f)), before); assert.equal(stored(f).profileUpdates.length, 0);
  assert.deepEqual(validateCreditCustomerProfile(profile({ name: ' اسم ', phone: '', cin: '', email: ' TEST@EXAMPLE.COM ' })), profile({ name: 'اسم', phone: '', cin: '', email: 'test@example.com' }));
});
