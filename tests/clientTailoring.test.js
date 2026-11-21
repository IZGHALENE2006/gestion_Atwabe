import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import Client from '../BackEnd/models/Client.js';
import { clientRegistrationFixture } from './helpers/clientRegistrationFixture.js';
import { garment, query, owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';
import { clientTailoringStatistics } from '../shared/clientTailoringStats.js';
import { tailoringCreditInput } from '../shared/tailoringCredit.js';

const secret = process.env.JWT_SECRET, admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe', idAdmin: otherOwner };
let server, base;
before(async () => { process.env.JWT_SECRET = 'isolated-client-tailoring'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; });
async function request(path, body, actor = admin, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, data: await r.json() };
}
const create = (body, actor) => request('/tailoring-orders', body, actor);
const stats = async id => { const r = await request('/clients'); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.clients.find(client => client._id === id).tailoringStats; };

for (const type of ['djellaba', 'trousers', 'shirts', 'jabador', 'malakiya']) test(type + ': the checkbox saves one linked client with order data and counts a multi-piece order once', async t => {
  const f = clientRegistrationFixture(t), body = f.input({ garmentType: type, items: [0,1].map(() => garment({ shirtType: 'عادي', trouserType: 'regular', price: 400 })) });
  const r = await create(body); assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(f.clients.size, 1); assert.equal(f.orders.size, 1);
  const client = [...f.clients.values()][0]; assert.equal(r.data.clientId, String(client._id)); assert.equal(client.name, body.clientName); assert.equal(client.phone, body.phone); assert.equal(client.address, ''); assert.equal(String(client.createdFromTailoringOrderId), r.data._id); assert.equal(String(client.createdBy), owner);
  assert.equal(r.data.clientRegistration, undefined); assert.equal(r.data.customerReceipt.clientName, body.clientName);
  const replay = await create(body); assert.equal(replay.status, 200); assert.equal(f.clients.size, 1); assert.equal(f.orders.size, 1);
  const value = await stats(r.data.clientId); assert.deepEqual([value.total,value.active,value.cancelled,value.byType[type].total], [1,1,0,1]);
  const options = await request('/tailoring-orders/client-options'); assert.equal(options.data.clients[0]._id, r.data.clientId);
});

test('unchecked creation keeps the manual client and does not register it', async t => {
  const f = clientRegistrationFixture(t), r = await create(f.input({ registerClient: false })); assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(f.clients.size, 0); assert.equal(r.data.clientId, undefined);
});

test('matching name and normalized phone reuse a registered client, while ambiguous duplicates require explicit selection', async t => {
  const f = clientRegistrationFixture(t), client = f.seedClient();
  let r = await create(f.input({ phone: '+212 677 777 777', clientName: '  عميل  جديد  ' })); assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.clientId, String(client._id)); assert.equal(f.clients.size, 1);
  f.seedClient(); r = await create(f.input()); assert.equal(r.status, 409); assert.equal(r.data.message, 'clientRegistrationAmbiguous'); assert.equal(f.orders.size, 1);
});

test('registration cannot reuse another shop client or accept forged identity, creator or registration metadata', async t => {
  const f = clientRegistrationFixture(t), foreign = f.seedClient({ idAdmin: otherOwner });
  const r = await create(f.input({ createdBy: otherOwner, idAdmin: otherOwner, clientRegistration: { clientId: foreign._id, state: 'complete' } }));
  assert.equal(r.status, 201, JSON.stringify(r.data)); assert.notEqual(r.data.clientId, String(foreign._id)); const client = f.clients.get(r.data.clientId); assert.equal(String(client.idAdmin), owner); assert.equal(String(client.createdBy), owner);
});

test('invalid checkbox values and client fields cannot create a client or an order', async t => {
  const f = clientRegistrationFixture(t), client = f.seedClient();
  for (const patch of [{ registerClient: 'yes' }, { registerClient: {} }, { phone: 'abc' }, { clientName: '' }, { clientId: String(client._id) }]) assert.equal((await create(f.input(patch))).status, 400);
  assert.equal(f.clients.size, 1); assert.equal(f.orders.size, 0);
  assert.equal(tailoringCreditInput({ registerClient: 'true', clientId: '', deliverOnCredit: 'true' }).registerClient, true);
});

test('employees need the client creation grant and the stored actor owns the registration', async t => {
  const f = clientRegistrationFixture(t); f.staff.moduleAccess = ['tailoring']; f.staff.operationPermissions = { tailoring: ['add'], clients: ['add'] };
  assert.equal((await create(f.input(), staff)).status, 403); assert.equal(f.orders.size, 0); assert.equal(f.clients.size, 0);
  f.staff.moduleAccess.push('clients'); const r = await create(f.input(), staff); assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(String(f.clients.get(r.data.clientId).createdBy), employee);
});

test('a lost order acknowledgement after client creation resumes without duplicate clients or order counts', async t => {
  const f = clientRegistrationFixture(t), body = f.input(); f.faults.orderSave = true;
  assert.equal((await create(body)).status, 500); assert.equal(f.clients.size, 1); assert.equal(f.orders.size, 1);
  f.faults.orderSave = false; const r = await create(body); assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(f.clients.size, 1); assert.equal((await stats(r.data.clientId)).total, 1);
});

test('a client write outage leaves a durable order intent that a subsequent read can finish', async t => {
  const f = clientRegistrationFixture(t); f.faults.clientBefore = true; assert.equal((await create(f.input())).status, 500); assert.equal(f.clients.size, 0); assert.equal(f.orders.size, 1);
  const r = await request('/tailoring-orders'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(f.clients.size, 1); assert.equal((await stats(r.data.orders[0].clientId)).total, 1);
});

test('concurrent requests and distinct first orders for the same identity register one client', async t => {
  const f = clientRegistrationFixture(t), body = f.input(); let rows = await Promise.all([create(body), create(body)]); assert.deepEqual(rows.map(row => row.status).sort(), [200,201]); assert.equal(f.orders.size, 1); assert.equal(f.clients.size, 1);
  rows = await Promise.all([create(f.input()), create(f.input())]); assert.ok(rows.every(row => row.status === 201), JSON.stringify(rows)); assert.equal(f.clients.size, 1); assert.equal((await stats(rows[0].data.clientId)).total, 3);
});

test('a client registered between the list and identity lookup is reused rather than rejected', async t => {
  const f = clientRegistrationFixture(t), first = await create(f.input()); assert.equal(first.status, 201);
  t.mock.method(Client, 'find', () => query(() => []));
  const next = await create(f.input()); assert.equal(next.status, 201, JSON.stringify(next.data)); assert.equal(next.data.clientId, first.data.clientId); assert.equal(f.clients.size, 1); assert.equal(f.orders.size, 2);
});

test('a new client can be registered and delivered on credit without an advance in the same save', async t => {
  const f = clientRegistrationFixture(t), r = await create(f.input({ deliverOnCredit: true })); assert.equal(r.status, 201, JSON.stringify(r.data)); assert.ok(r.data.deliveredAt); assert.equal(r.data.creditDelivery.remainingAmount, 400); assert.equal(f.clients.size, 1); assert.equal(f.credits.size, 1); assert.equal((await stats(r.data.clientId)).delivered, 1);
});

test('registration waits for a pending stock reservation and a retry deducts the fabric only once', async t => {
  const f = clientRegistrationFixture(t, { stock: true }); f.controls.standalone = true; f.controls.failFabricBefore = true;
  const before = f.meters(), item = garment({ price: 100, fabricSource: 'shop', fabricId: String(f.fabric._id), colorId: String(f.fabric.colors[0]._id), fabricPieceId: String(f.fabric.colors[0].pieces[0]._id), fabricMeters: 2, fabricUnitPrice: 30 });
  const body = f.input({ garmentType: 'djellaba', automaticCosting: true, salePricingVersion: 3, costSettingsVersion: 0, deductFabricStock: true, items: [item] });
  const failed = await create(body); assert.equal(failed.status, 503, JSON.stringify(failed.data)); assert.equal(f.clients.size, 0); assert.equal(f.meters(), before);
  delete f.controls.failFabricBefore; const retry = await create(body); assert.equal(retry.status, 200, JSON.stringify(retry.data)); assert.equal(f.clients.size, 1); assert.equal(f.meters(), before - 2);
  assert.equal((await create(body)).status, 200); assert.equal(f.meters(), before - 2); assert.equal((await stats(retry.data.clientId)).total, 1);
});

test('editing an inline client allows an optional address and cancellation moves the count into cancelled', async t => {
  const f = clientRegistrationFixture(t), r = await create(f.input({ deliverOnCredit: true })); assert.equal(r.status, 201);
  let edited = await request('/clients/' + r.data.clientId, { type: 'person', name: 'الاسم المعدل', phone: '0677777777', address: '' }, admin, 'PUT'); assert.equal(edited.status, 200, JSON.stringify(edited.data));
  const cancel = await request('/tailoring-orders/' + r.data._id + '/cancel', { version: r.data.__v }); assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
  const value = await stats(r.data.clientId); assert.deepEqual([value.total,value.active,value.cancelled,value.byType.shirts.cancelled], [1,0,1,1]); assert.equal(f.clients.size, 1);
});

test('statistics prefer saved identities, count historical phone matches safely, and keep cancelled delivery separate', () => {
  const a = 'a', b = 'b', c = 'c';
  const clients = [{ _id: a, name: 'أمينة', phone: '0612345678' }, { _id: b, name: 'خديجة', phone: '0677777777' }, { _id: c, name: 'فاطمة', phone: '0677777777' }];
  const orders = [{ clientId: a, phone: '000000', garmentType: 'djellaba', items: [{},{}] }, { phone: '+212 612 345 678', garmentType: 'shirts', deliveredAt: new Date() }, { phone: '0677777777', clientName: 'خديجة', garmentType: 'trousers', deliveredAt: new Date(), cancelledAt: new Date() }, { phone: '0677777777', clientName: 'اسم غير محدد' }, { clientId: 'foreign', phone: '0612345678' }];
  const value = clientTailoringStatistics(clients, orders); assert.deepEqual([value.get(a).total,value.get(a).active,value.get(a).delivered], [2,1,1]); assert.deepEqual([value.get(b).total,value.get(b).delivered,value.get(b).cancelled], [1,0,1]); assert.equal(value.get(c).total, 0);
});

test('ordinary directory clients still require an address and cannot forge the tailoring origin', async t => {
  clientRegistrationFixture(t); const r = await request('/clients', { type: 'person', name: 'اسم', phone: '0612345678', createdFromTailoringOrderId: '111111111111111111111111' }); assert.equal(r.status, 400); assert.equal(r.data.fields.address, 'required');
  await assert.rejects(new Client({ idAdmin: owner, createdBy: owner, type: 'person', name: 'اسم', phone: '0612345678' }).validate());
});
