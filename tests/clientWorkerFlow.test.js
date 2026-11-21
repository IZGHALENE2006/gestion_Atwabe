import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, employee, otherOwner } from './helpers/djellabaCostsFixture.js';
import { seedCompletedClientStage } from './helpers/clientWorkerFlowFixture.js';
import { WORKER_CATEGORIES } from '../shared/workers.js';
import { workerOrderGarmentTypes } from '../shared/workerWork.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';

let server, base;
const previousSecret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = 'isolated-customer-worker-flow'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe' };
async function request(path, body, actor = admin) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
function fixture(t) { const f = workerMaterialsFixture(t); f.worker.categories = ['machine', 'finishing', 'mesbanto', 'shirts', 'trousers', 'sfifa']; return f; }
const path = f => '/tailoring-workers/' + f.worker._id + '/work';
const input = (order, category, lineIds = order.items.map(item => item.lineId)) => ({ workType: 'client', category, orderId: String(order._id), lineIds, unitWage: 3, requestId: randomUUID() });
async function assign(f, order, category, lineIds) { const r = await request(path(f), input(order, category, lineIds)); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data; }
async function complete(f, work, quantity = work.quantity) { const r = await request(path(f) + '/' + work._id + '/completions', { quantity, version: work.__v, requestId: randomUUID() }); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data; }
async function choices(f, category) { const r = await request(path(f) + '/orders?category=' + category); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.orders; }

for (const type of ['djellaba', 'jabador', 'malakiya']) test(type + ': customers must follow machine, finishing and laundry per garment', async t => {
  const f = fixture(t), order = f.seedGarmentOrder(type), first = [order.items[0].lineId], second = [order.items[1].lineId];
  assert.deepEqual(await choices(f, 'finishing'), []); assert.deepEqual(await choices(f, 'mesbanto'), []);
  let r = await request(path(f), input(order, 'finishing', first)); assert.equal(r.status, 409); assert.equal(r.data.message, 'clientMachineRequired');
  r = await request(path(f), input(order, 'mesbanto', first)); assert.equal(r.status, 409); assert.equal(r.data.message, 'clientFinishingRequired');
  const machine = await assign(f, order, 'machine', first);
  assert.deepEqual(await choices(f, 'finishing'), []); assert.deepEqual(await choices(f, 'mesbanto'), []);
  await complete(f, machine);
  let options = await choices(f, 'finishing'); assert.deepEqual(options[0].items.map(item => item.lineId), first); assert.equal(options[0].items[0].available, true);
  assert.deepEqual(await choices(f, 'mesbanto'), []);
  r = await request(path(f), input(order, 'mesbanto', first)); assert.equal(r.status, 409); assert.equal(r.data.message, 'clientFinishingRequired');
  r = await request(path(f), input(order, 'finishing')); assert.equal(r.status, 409); assert.equal(r.data.message, 'clientMachineRequired');
  const finishing = await assign(f, order, 'finishing', first); assert.deepEqual(await choices(f, 'mesbanto'), []);
  await complete(f, finishing);
  options = await choices(f, 'mesbanto'); assert.deepEqual(options[0].items.map(item => item.lineId), first);
  r = await request(path(f), input(order, 'mesbanto', second)); assert.equal(r.status, 409); assert.equal(r.data.message, 'clientFinishingRequired');
  await assign(f, order, 'mesbanto', first); assert.deepEqual(await choices(f, 'mesbanto'), []);
  assert.equal(f.fabric.colors[0].pieces[0].meters, 20); assert.equal(f.sfifa.quantity, 20);
});

test('partial numeric customer completion cannot unlock unspecified garments', async t => {
  const f = fixture(t), order = f.seedGarmentOrder('djellaba');
  let machine = await assign(f, order, 'machine'); machine = await complete(f, machine, 1);
  assert.deepEqual(await choices(f, 'finishing'), []);
  await complete(f, machine, 1); let finishing = await assign(f, order, 'finishing'); finishing = await complete(f, finishing, 1);
  assert.deepEqual(await choices(f, 'mesbanto'), []);
  await complete(f, finishing, 1); assert.equal((await choices(f, 'mesbanto'))[0].items.length, 2);
});

test('trousers stay exclusively in their section while shirts reach laundry after their dedicated section', async t => {
  const f = fixture(t), trousers = f.seedGarmentOrder('trousers'), shirt = f.seedGarmentOrder('shirts');
  assert.deepEqual(WORKER_CATEGORIES.filter(category => workerOrderGarmentTypes(category).includes('trousers')), ['trousers']);
  assert.deepEqual(await choices(f, 'mesbanto'), []);
  let rejected = await request(path(f), input(trousers, 'mesbanto')); assert.equal(rejected.status, 404); assert.equal(f.records.length, 0);
  rejected = await request(path(f) + '/orders?category=mesbanto&garmentType=trousers'); assert.equal(rejected.status, 400);
  for (const category of WORKER_CATEGORIES.filter(category => category !== 'trousers')) {
    rejected = await request('/tailoring-orders/' + trousers._id + '/assignments', { ...input(trousers, category), workerId: String(f.worker._id) }); assert.equal(rejected.status, 400);
  }
  rejected = await request('/tailoring-orders/' + trousers._id + '/assignment-options?workerId=' + f.worker._id + '&category=mesbanto'); assert.equal(rejected.status, 400);
  const laundryOnly = f.seedWorker(owner, ['mesbanto']), trouserOnly = f.seedWorker(owner, ['trousers']);
  const workers = await request('/tailoring-orders/' + trousers._id + '/assignment-workers'); assert.equal(workers.status, 200);
  assert.equal(workers.data.workers.some(worker => worker._id === String(laundryOnly._id)), false); assert.equal(workers.data.workers.some(worker => worker._id === String(trouserOnly._id)), true);
  await assign(f, trousers, 'trousers');
  let r = await request(path(f), input(shirt, 'mesbanto')); assert.equal(r.status, 409); assert.equal(r.data.message, 'clientShirtsRequired');
  const work = await assign(f, shirt, 'shirts'); assert.deepEqual(await choices(f, 'mesbanto'), []);
  await complete(f, work); const options = await choices(f, 'mesbanto'); assert.equal(options[0].garmentType, 'shirts');
  await assign(f, shirt, 'mesbanto');
});

test('existing laundry trouser history remains valid without allowing new laundry trouser records', async t => {
  const f = fixture(t), trousers = f.seedGarmentOrder('trousers'), work = await assign(f, trousers, 'trousers');
  const old = { ...f.records.find(row => String(row._id) === work._id).toObject(), category: 'mesbanto', trouserType: undefined };
  await WorkerWork.hydrate(old).validate();
  await assert.rejects(new WorkerWork(old).validate(), error => Boolean(error.errors.tailoring));
});

test('order actions and increases enforce the same prerequisite with no partial write', async t => {
  const f = fixture(t), order = f.seedGarmentOrder('djellaba'), first = [order.items[0].lineId], second = [order.items[1].lineId];
  const direct = (category, lineIds) => request('/tailoring-orders/' + order._id + '/assignments', { ...input(order, category, lineIds), workerId: String(f.worker._id) });
  let r = await direct('finishing', first); assert.equal(r.status, 409); assert.equal(r.data.message, 'clientMachineRequired'); assert.equal(f.records.length, 0);
  const machine = await assign(f, order, 'machine', first); await complete(f, machine);
  let finishing = await assign(f, order, 'finishing', first);
  r = await request(path(f) + '/' + finishing._id + '/increases', { lineIds: second, version: finishing.__v, requestId: randomUUID() });
  assert.equal(r.status, 409); assert.equal(r.data.message, 'clientMachineRequired'); assert.equal(f.records.find(row => String(row._id) === finishing._id).quantity, 1);
  finishing = await complete(f, finishing); r = await direct('mesbanto', first); assert.equal(r.status, 201);
  const replay = await request('/tailoring-orders/' + order._id + '/assignments', { ...input(order, 'mesbanto', first), workerId: String(f.worker._id) }); assert.equal(replay.status, 409);
  const options = await request('/tailoring-orders/' + order._id + '/assignment-options?workerId=' + f.worker._id + '&category=mesbanto'); assert.equal(options.status, 200); assert.deepEqual(options.data.orders, []);
});

test('only completed active customer predecessors for this order and owner qualify', async t => {
  const f = fixture(t), order = f.seedGarmentOrder('djellaba'), other = f.seedGarmentOrder('djellaba'), foreign = f.seedGarmentOrder('djellaba', undefined, otherOwner);
  await seedCompletedClientStage(f, other, 'machine'); await seedCompletedClientStage(f, foreign, 'machine');
  const deleted = await seedCompletedClientStage(f, order, 'machine'); deleted.deletedAt = new Date();
  const orders = await choices(f, 'finishing'); assert.deepEqual(orders.map(row => row._id), [String(other._id)]);
  const r = await request(path(f), input(order, 'finishing')); assert.equal(r.status, 409); assert.equal(r.data.message, 'clientMachineRequired');
});

test('live employee grants cannot bypass customer stage requirements', async t => {
  const f = fixture(t), order = f.seedGarmentOrder('malakiya');
  f.staff.moduleAccess = ['tailoring']; f.staff.operationPermissions = { tailoring: ['assign'] };
  let r = await request('/tailoring-orders/' + order._id + '/assignments', { ...input(order, 'mesbanto'), workerId: String(f.worker._id) }, staff);
  assert.equal(r.status, 409); assert.equal(r.data.message, 'clientFinishingRequired'); assert.equal(f.records.length, 0);
  f.staff.operationPermissions.tailoring = []; r = await request('/tailoring-orders/' + order._id + '/assignments', { ...input(order, 'machine'), workerId: String(f.worker._id) }, staff); assert.equal(r.status, 403);
});
