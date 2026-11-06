import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import Fabric from '../BackEnd/models/Fabric.js';
import SfifaStock from '../BackEnd/models/SfifaStock.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner } from './helpers/djellabaCostsFixture.js';
import { usesWorkerMaterials } from '../shared/workerMaterials.js';

let server, base;
const oldSecret = process.env.JWT_SECRET, admin = { id: owner, role: 'admin' };
before(async () => { process.env.JWT_SECRET = 'isolated-restored-client-work'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
async function request(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${jwt.sign(admin, process.env.JWT_SECRET)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const pathFor = f => `/tailoring-workers/${f.worker._id}/work`;
const assignment = (order, lineIds = order.items.map(item => item.lineId)) => ({ category: 'machine', workType: 'client', orderId: String(order._id), lineIds, unitWage: 25, requestId: randomUUID() });
const balance = f => [f.fabrics[0].colors[0].pieces[0].meters, f.stocks[0].quantity];
const finish = (f, work) => request(`${pathFor(f)}/${work._id}/completions`, { version: work.__v, requestId: randomUUID(), quantity: 1 });

for (const kind of ['djellaba', 'jabador', 'malakiya']) test(`client ${kind} uses its tailoring order without selecting or deducting stock`, async t => {
  const f = workerMaterialsFixture(t), order = f.seedGarmentOrder(kind), body = assignment(order);
  assert.equal(usesWorkerMaterials('machine', 'client', kind), false); assert.equal(usesWorkerMaterials('machine', 'shop', kind), true);
  const result = await request(pathFor(f), body); assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(result.data.quantity, 2); assert.equal(result.data.tailoring.orderId, String(order._id)); assert.equal(result.data.materials, undefined);
  assert.equal(result.data.materialStatus, undefined); assert.equal(f.records[0].materialOperations, undefined);
  assert.deepEqual(balance(f), [20, 20]); assert.equal(Fabric.prototype.save.mock.callCount(), 0); assert.equal(SfifaStock.prototype.save.mock.callCount(), 0);
  assert.equal((await request(pathFor(f), body)).status, 200); assert.deepEqual(balance(f), [20, 20]);
});

test('client completion, increases and deletion keep their previous behavior and never affect material stock', async t => {
  const f = workerMaterialsFixture(t), order = f.seedGarmentOrder('djellaba', ['regular', 'regular', 'regular']);
  const first = await request(pathFor(f), assignment(order, [order.items[0].lineId])); assert.equal(first.status, 201);
  const done = await finish(f, first.data); assert.equal(done.status, 201); assert.equal(done.data.completions[0].earningAmount, 25);
  const body = { lineIds: [order.items[1].lineId], requestId: randomUUID(), version: done.data.__v };
  const added = await request(`${pathFor(f)}/${first.data._id}/increases`, body); assert.equal(added.status, 201, JSON.stringify(added));
  assert.equal(added.data.quantity, 2); assert.equal(added.data.materials, undefined);
  assert.equal((await request(`${pathFor(f)}/${first.data._id}/increases`, body)).status, 200);
  const removed = await request(`${pathFor(f)}/${first.data._id}`, { version: added.data.__v, requestId: randomUUID() }, 'DELETE');
  assert.equal(removed.status, 200); assert.equal(removed.data.deleted, true); assert.equal(removed.data.cancelled, undefined);
  assert.deepEqual(balance(f), [20, 20]); assert.equal(f.records[0].completions[0].earningAmount, 25);
  assert.equal(f.records[0].materialCancellation, undefined); assert.ok(f.records[0].archivedTailoring);
});

test('even an outdated client form cannot initiate a new stock deduction', async t => {
  const f = workerMaterialsFixture(t), order = f.seedGarmentOrder(), body = assignment(order);
  const materials = body.lineIds.map(id => f.selection(id));
  let result = await request(pathFor(f), { ...body, materials });
  assert.equal(result.status, 400); assert.equal(result.data.fields.materials, 'invalidMaterialSection'); assert.equal(f.records.length, 0);
  const assigned = await request(pathFor(f), assignment(order, [order.items[0].lineId])); assert.equal(assigned.status, 201);
  result = await request(`${pathFor(f)}/${assigned.data._id}/increases`, { lineIds: [order.items[1].lineId], materials: [f.selection(order.items[1].lineId)], requestId: randomUUID(), version: assigned.data.__v });
  assert.equal(result.status, 400); assert.equal(result.data.fields.materials, 'invalidMaterialSection'); assert.deepEqual(balance(f), [20, 20]);
});

test('client assignment succeeds without sufficient shop fabric or sfifa stock', async t => {
  const f = workerMaterialsFixture(t); f.fabrics[0].colors[0].pieces[0].meters = 0; f.stocks[0].quantity = 0; f.stocks[0].variants[0].quantity = 0;
  f.controls.failBefore = 'sfifa';
  const assigned = await request(pathFor(f), assignment(f.seedGarmentOrder())); assert.equal(assigned.status, 201);
  assert.equal((await finish(f, assigned.data)).status, 201); assert.deepEqual(balance(f), [0, 0]); assert.equal(f.controls.failBefore, 'sfifa');
});

async function legacyClientWork(f) {
  const order = f.seedGarmentOrder('djellaba', ['regular', 'regular', 'regular']);
  const assigned = await request(pathFor(f), assignment(order, [order.items[0].lineId])); assert.equal(assigned.status, 201);
  const work = f.records[0], selected = f.selection(order.items[0].lineId);
  const row = { ...selected, sfifaMeters: 3, fabricType: f.fabric.type, fabricColor: f.fabric.colors[0].name, pieceBarcode: f.fabric.colors[0].pieces[0].barcode, sfifaWidth: f.sfifa.width, sfifaFamily: f.sfifa.family, sfifaCode: 12 };
  work.materialOperations = [{ kind: 'assign', state: 'committed', requestId: work.requestId, rows: [row], date: new Date(), createdBy: owner }];
  work.materialStatus = 'ready';
  const debit = { operationId: `${work._id}:${work.requestId}`, workId: work._id, date: new Date() };
  f.fabrics[0].colors[0].pieces[0].meters = 18; f.fabrics[0].workerMaterialDebits = [debit];
  f.stocks[0].quantity = 17; f.stocks[0].variants[0].quantity = 17; f.stocks[0].workerMaterialDebits = [debit];
  await work.validate();
  return { order, work: (await request(pathFor(f) + '?category=machine')).data.works[0] };
}

test('previously saved client material history remains readable and permits normal completion and stock-free increases', async t => {
  const f = workerMaterialsFixture(t), legacy = await legacyClientWork(f);
  const done = await finish(f, legacy.work); assert.equal(done.status, 201, JSON.stringify(done));
  assert.equal(done.data.completions[0].earningAmount, 25);
  const added = await request(`${pathFor(f)}/${legacy.work._id}/increases`, { lineIds: [legacy.order.items[1].lineId], requestId: randomUUID(), version: done.data.__v });
  assert.equal(added.status, 201, JSON.stringify(added)); assert.equal(added.data.quantity, 2);
  assert.equal(added.data.materials.length, 1); assert.deepEqual(balance(f), [18, 17]);
  assert.equal(f.records[0].materialOperations.length, 1);
});

test('deleting legacy client work safely returns only its already-recorded debits once and preserves wages', async t => {
  const f = workerMaterialsFixture(t), legacy = await legacyClientWork(f), done = await finish(f, legacy.work);
  const path = `${pathFor(f)}/${legacy.work._id}`, body = { version: done.data.__v, requestId: randomUUID() };
  const removed = await request(path, body, 'DELETE'); assert.equal(removed.status, 200, JSON.stringify(removed));
  assert.deepEqual(balance(f), [20, 20]); assert.equal(f.records[0].completions[0].earningAmount, 25);
  const repeated = await request(path, body, 'DELETE'); assert.equal(repeated.status, 200); assert.deepEqual(balance(f), [20, 20]);
});