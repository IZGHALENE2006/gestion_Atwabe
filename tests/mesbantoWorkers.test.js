import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import { garmentWorkerFixture } from './helpers/garmentWorkerFixture.js';
import { owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';
import { TAILORING_GARMENT_TYPES } from '../shared/tailoring.js';
import { workerCategories } from '../shared/workers.js';
import { workerOrderGarmentTypes } from '../shared/workerWork.js';
let server, base; const previousSecret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = 'isolated-mesbanto-tests'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe', idAdmin: otherOwner };
async function request(path, body, identity = admin, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(identity ? { Authorization: 'Bearer ' + jwt.sign(identity, process.env.JWT_SECRET) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
const path = worker => '/tailoring-workers/' + worker._id + '/work';
const assignment = (order, patch = {}) => ({ category: 'mesbanto', workType: 'client', orderId: String(order._id), lineIds: order.items.map(item => item.lineId), requestId: randomUUID(), ...patch });
const assign = async (worker, input) => { const response = await request(path(worker), input); assert.equal(response.status, 201, JSON.stringify(response.data)); return response.data; };

test('Mesbanto workers can share other sections and have ordinary shop work with completion, increase and deletion', async t => {
  const f = garmentWorkerFixture(t);
  const response = await request('/tailoring-workers', { name: 'عامل المسبنطو', phone: '0612345678', categories: ['mesbanto', 'machine'], requestId: randomUUID() });
  assert.equal(response.status, 201, JSON.stringify(response.data)); const worker = response.data;
  assert.deepEqual(workerCategories(worker), ['machine', 'mesbanto']);
  const work = await assign(worker, { category: 'mesbanto', workType: 'shop', productName: 'ملابس المحل', quantity: 3, requestId: randomUUID() });
  let result = await request(path(worker) + '/' + work._id + '/completions', { quantity: 1, version: work.__v, requestId: randomUUID() }); assert.equal(result.status, 201); assert.equal(result.data.remainingQuantity, 2);
  result = await request(path(worker) + '/' + work._id + '/increases', { quantity: 2, version: result.data.__v, requestId: randomUUID() }); assert.equal(result.status, 201); assert.equal(result.data.quantity, 5); assert.equal(result.data.remainingQuantity, 4);
  const removed = await request(path(worker) + '/' + work._id, { version: result.data.__v }, admin, 'DELETE'); assert.equal(removed.status, 200);
  const current = await request(path(worker) + '?category=mesbanto'); assert.equal(current.status, 200); assert.equal(current.data.works.length, 0); assert.equal(f.records[0].completions.length, 1); assert.equal(f.records[0].additions.length, 1);
});
test('all five Fesla order types are available and filterable in Mesbanto while delivered and foreign orders stay unavailable', async t => {
  const f = garmentWorkerFixture(t), worker = f.seedWorker(owner, ['mesbanto']);
  const orders = TAILORING_GARMENT_TYPES.map(type => f.seedGarmentOrder(type));
  f.seedGarmentOrder('shirts', ['regular'], otherOwner); f.seedGarmentOrder('jabador', ['regular'], owner, { deliveredAt: new Date() });
  assert.deepEqual(workerOrderGarmentTypes('mesbanto'), TAILORING_GARMENT_TYPES);
  let response = await request(path(worker) + '/orders?category=mesbanto'); assert.equal(response.status, 200); assert.deepEqual(response.data.orders.map(order => order.garmentType).sort(), [...TAILORING_GARMENT_TYPES].sort());
  for (const order of orders) { response = await request(path(worker) + '/orders?category=mesbanto&garmentType=' + order.garmentType); assert.equal(response.status, 200); assert.equal(response.data.orders.length, 1); assert.equal(response.data.orders[0]._id, String(order._id)); }
  assert.equal((await request(path(worker) + '/orders?category=mesbanto&garmentType=unknown')).status, 400);
});
for (const type of TAILORING_GARMENT_TYPES) test('Mesbanto links ' + type + ' orders with trusted snapshots, tracking, completion, linked increase and deletion', async t => {
  const f = garmentWorkerFixture(t), worker = f.seedWorker(owner, ['mesbanto']), order = f.seedGarmentOrder(type);
  const input = assignment(order, { lineIds: [order.items[0].lineId], productName: 'مزور', quantity: 500, garmentType: 'wrong' });
  const work = await assign(worker, input); assert.equal(work.productName, order.clientName); assert.equal(work.quantity, 1); assert.equal(work.tailoring.garmentType, type);
  assert.equal((await request(path(worker), input)).status, 200); assert.equal((await request(path(worker), { ...input, requestId: randomUUID() })).status, 409);
  if (type === 'shirts') assert.equal(work.tailoring.items[0].shirtType, 'قميص رجالي 0');
  if (type === 'trousers') assert.equal(work.tailoring.items[0].trouserType, 'regular');
  let tracking = await request('/tailoring-orders/work-status'); let stage = tracking.data.orders.find(row => row.orderId === String(order._id)).assignments[0]; assert.equal(stage.category, 'mesbanto'); assert.equal(stage.workerId, String(worker._id)); assert.equal(stage.remainingQuantity, 1);
  let result = await request(path(worker) + '/' + work._id + '/completions', { quantity: 1, version: work.__v, requestId: randomUUID() }); assert.equal(result.status, 201); assert.equal(result.data.remainingQuantity, 0);
  result = await request(path(worker) + '/' + work._id + '/increases', { lineIds: [order.items[1].lineId], version: result.data.__v, requestId: randomUUID() }); assert.equal(result.status, 201); assert.equal(result.data.quantity, 2); assert.equal(result.data.remainingQuantity, 1); assert.equal(result.data.tailoring.items.length, 2);
  assert.equal((await request(path(worker) + '/' + work._id, { version: result.data.__v }, admin, 'DELETE')).status, 200);
  tracking = await request('/tailoring-orders/work-status'); assert.equal(tracking.data.orders.find(row => row.orderId === String(order._id)).assignments.length, 0); assert.ok(f.records.find(row => String(row._id) === work._id).archivedTailoring);
});
test('a garment cannot move into or out of Mesbanto until the current section finishes its work', async t => {
  const f = garmentWorkerFixture(t), mesbanto = f.seedWorker(owner, ['mesbanto']), finishing = f.seedWorker(owner, ['finishing']), order = f.seedGarmentOrder('jabador');
  const machine = await assign(f.worker, assignment(order, { category: 'machine' }));
  let response = await request(path(mesbanto), assignment(order)); assert.equal(response.status, 409); assert.equal(response.data.message, 'garmentInProgress'); assert.equal(response.data.blockers[0].category, 'machine');
  response = await request(path(f.worker) + '/' + machine._id + '/completions', { quantity: 2, version: machine.__v, requestId: randomUUID() }); assert.equal(response.status, 201);
  const work = await assign(mesbanto, assignment(order));
  response = await request(path(finishing), assignment(order, { category: 'finishing' })); assert.equal(response.status, 409); assert.equal(response.data.blockers[0].category, 'mesbanto');
  response = await request(path(mesbanto) + '/' + work._id + '/completions', { quantity: 2, version: work.__v, requestId: randomUUID() }); assert.equal(response.status, 201);
  assert.equal((await request(path(finishing), assignment(order, { category: 'finishing' }))).status, 201);
});
test('Mesbanto preserves shop ownership, section membership and live employee permissions', async t => {
  const f = garmentWorkerFixture(t), worker = f.seedWorker(owner, ['mesbanto']), order = f.seedGarmentOrder('shirts');
  assert.equal((await request(path(f.worker), assignment(order))).status, 409);
  assert.equal((await request(path(worker), assignment(f.seedGarmentOrder('shirts', ['regular'], otherOwner)))).status, 404);
  assert.equal((await request(path(worker), { category: 'mesbanto', workType: 'client', productName: 'يدوي', quantity: 2, requestId: randomUUID() })).status, 400);
  f.staff.action.add = false; assert.equal((await request(path(worker) + '/orders?category=mesbanto', undefined, staff)).status, 403); assert.equal((await request(path(worker), assignment(order), staff)).status, 403);
  f.staff.action.add = true; const work = await request(path(worker), assignment(order), staff); assert.equal(work.status, 201);
  f.staff.action.update = false; assert.equal((await request(path(worker) + '/' + work.data._id + '/completions', { quantity: 1, version: work.data.__v, requestId: randomUUID() }, staff)).status, 403);
  f.staff.action.delete = false; assert.equal((await request(path(worker) + '/' + work.data._id, { version: work.data.__v }, staff, 'DELETE')).status, 403);
  assert.equal((await request(path(worker) + '?category=mesbanto', undefined, staff)).status, 200); assert.equal((await request(path(worker) + '?category=mesbanto', undefined, null)).status, 401);
});
