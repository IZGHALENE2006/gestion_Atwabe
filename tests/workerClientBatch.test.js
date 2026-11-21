import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import { validateWorkerClientBatch, submitWorkerClientBatch, workerBatchLocked } from '../shared/workerClientBatch.js';
import { WORKER_CATEGORIES } from '../shared/workers.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { seedClientPrerequisites } from './helpers/clientWorkerFlowFixture.js';
import { owner, employee, otherOwner } from './helpers/djellabaCostsFixture.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';

const id = n => n.toString(16).padStart(24, '0');
const data = (patch = {}) => ({ unitWage: '5.25', quantity: '3.5', width: 'thin', family: 'customer', code: '', orderSelections: [1, 2].map(n => ({ orderId: id(n), lineIds: [id(n + 10)], unitWage: '', quantity: '' })), ...patch });
test('every client section builds separate order assignments with the existing validation and per-order wages', () => {
  for (const category of WORKER_CATEGORIES) {
    const value = data(); value.orderSelections[1].unitWage = '8.50'; value.orderSelections[1].lineIds.push(id(50));
    const before = structuredClone(value), inputs = validateWorkerClientBatch(value, category);
    assert.equal(inputs.length, 2); assert.equal(inputs[0].unitWage, 5.25); assert.equal(inputs[1].unitWage, 8.5);
    assert.deepEqual(inputs.map(row => row.quantity), category === 'sfifa' ? [3.5, 3.5] : [1, 2]);
    assert.ok(inputs.every(row => row.workType === 'client')); assert.deepEqual(value, before);
  }
});
test('sfifa keeps its own width, family and code and can use a different length for each order', () => {
  const value = data({ family: '01-30', code: 3 }); value.orderSelections[1].quantity = '4.125';
  const numbered = validateWorkerClientBatch(value, 'sfifa');
  assert.ok(numbered.every(row => row.sfifa.family === '01-30' && row.sfifa.code === 3));
  value.family = 'customer'; value.code = '';
  const inputs = validateWorkerClientBatch(value, 'sfifa'); assert.deepEqual(inputs.map(row => row.quantity), [3.5, 4.125]); assert.ok(inputs.every(row => row.sfifa.family === 'customer'));
});
test('selection limits, duplicate orders, missing pieces and invalid money report the exact card', () => {
  for (const orderSelections of [[], Array(51).fill(data().orderSelections[0]), [data().orderSelections[0], data().orderSelections[0]]]) assert.throws(() => validateWorkerClientBatch(data({ orderSelections }), 'machine'), error => error.fields.orderSelections === 'chooseOrders');
  const value = data(); value.orderSelections[1].lineIds = []; value.orderSelections[0].unitWage = '-1';
  assert.throws(() => validateWorkerClientBatch(value, 'machine'), error => error.fields['orderSelections.0.unitWage'] === 'invalidWage' && error.fields['orderSelections.1.lineIds'] === 'chooseGarments');
  assert.throws(() => validateWorkerClientBatch(data(), 'fake'));
});
test('a successful batch saves once per order and a replay skips all saved rows', async () => {
  const inputs = validateWorkerClientBatch(data(), 'machine'), ledger = new Map(), calls = [];
  const send = async (input, requestId) => { calls.push([input, requestId]); return { _id: input.orderId }; };
  assert.equal((await submitWorkerClientBatch(inputs, ledger, send)).complete, true);
  assert.equal((await submitWorkerClientBatch(inputs, ledger, send)).works.length, 2);
  assert.equal(calls.length, 2); assert.notEqual(calls[0][1], calls[1][1]); assert.ok([...ledger.values()].every(workerBatchLocked));
});
test('partial success remains visible, confirmed failures are editable, and retries never repeat successes', async () => {
  const ledger = new Map(), calls = []; let fail = true;
  const send = async (input, requestId) => { calls.push({ ...input, requestId }); if (input.orderId === id(2) && fail) throw { response: { status: 409, data: { message: 'garmentInProgress', blockers: [{ category: 'machine', workerName: 'عامل' }] } } }; return { _id: input.orderId }; };
  const first = await submitWorkerClientBatch(validateWorkerClientBatch(data(), 'machine'), ledger, send);
  assert.equal(first.complete, false); assert.equal(first.works.length, 1); assert.equal(workerBatchLocked(ledger.get(id(2))), false);
  const retry = data({ unitWage: '9' }); fail = false;
  const result = await submitWorkerClientBatch(validateWorkerClientBatch(retry, 'machine', ledger), ledger, send);
  assert.equal(result.complete, true); assert.equal(calls.length, 3); assert.equal(calls[2].unitWage, 9); assert.notEqual(calls[1].requestId, calls[2].requestId);
  assert.equal(result.works.length, 2);
});
test('lost responses freeze original lines, wage and request ID until the same request is confirmed', async () => {
  const ledger = new Map(), calls = []; let fail = true;
  const send = async (input, requestId) => { calls.push({ ...input, requestId }); if (input.orderId === id(2) && fail) throw new Error('Lost response after commit'); return { _id: input.orderId }; };
  await submitWorkerClientBatch(validateWorkerClientBatch(data(), 'machine'), ledger, send); assert.equal(ledger.get(id(2)).status, 'uncertain');
  const changed = data({ unitWage: 90 }); changed.orderSelections[1].lineIds = [id(99)];
  fail = false; await submitWorkerClientBatch(validateWorkerClientBatch(changed, 'machine', ledger), ledger, send);
  assert.deepEqual(calls[2], calls[1]); assert.equal(calls.length, 3);
});
test('server errors and pending acknowledgements remain retryable without losing request identities', async () => {
  for (const response of [{ status: 500, data: { message: 'saveWorkFailed' } }, { status: 409, data: { message: 'materialsPending' } }]) {
    const ledger = new Map(); await submitWorkerClientBatch(validateWorkerClientBatch(data(), 'machine'), ledger, async () => { throw { response }; });
    assert.ok([...ledger.values()].every(row => row.status === 'uncertain'));
  }
});

process.env.JWT_SECRET = 'isolated-multiple-client-work';
const { default: app } = await import('../BackEnd/app.js');
let server, origin;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const fixture = t => { const f = workerMaterialsFixture(t); f.worker.categories = [...WORKER_CATEGORIES]; return f; };
const form = orders => data({ orderSelections: orders.map(order => ({ orderId: String(order._id), lineIds: [order.items[0].lineId], unitWage: '', quantity: '' })) });
async function call(f, input, requestId, actor = { id: owner, role: 'admin' }) {
  const response = await fetch(origin + '/tailoring-workers/' + f.worker._id + '/work', { method: 'POST', headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, requestId }) });
  const body = await response.json(); if (!response.ok) throw { response: { status: response.status, data: body } }; return body;
}
for (const [category, type] of [['machine', 'djellaba'], ['finishing', 'jabador'], ['mesbanto', 'malakiya'], ['shirts', 'shirts'], ['trousers', 'trousers'], ['brim', 'djellaba']]) test(category + ' assigns several eligible customer orders through the actual API and keeps independent tracking', async t => {
  const f = fixture(t), orders = [f.seedGarmentOrder(type), f.seedGarmentOrder(type)];
  for (const order of orders) await seedClientPrerequisites(f, order, category);
  const before = f.records.length, inputs = validateWorkerClientBatch(form(orders), category), ledger = new Map();
  const result = await submitWorkerClientBatch(inputs, ledger, (input, requestId) => call(f, input, requestId));
  assert.equal(result.complete, true, JSON.stringify([...ledger.values()])); assert.equal(f.records.length, before + 2);
  assert.deepEqual(result.works.map(work => String(work.tailoring.orderId)).sort(), orders.map(order => String(order._id)).sort());
  assert.ok(result.works.every(work => work.quantity === 1 && work.unitWage === 5.25));
  for (const entry of ledger.values()) await call(f, entry.input, entry.requestId);
  assert.equal(f.records.length, before + 2);
});
test('actual API partial rejection and lost acknowledgement recover with no duplicate work or stage bypass', async t => {
  const f = fixture(t), first = f.seedGarmentOrder('djellaba'), second = f.seedGarmentOrder('djellaba'); await seedClientPrerequisites(f, first, 'finishing');
  const ledger = new Map(), inputs = validateWorkerClientBatch(form([first, second]), 'finishing');
  let result = await submitWorkerClientBatch(inputs, ledger, (input, requestId) => call(f, input, requestId)); assert.equal(result.complete, false); assert.equal(result.works.length, 1); assert.equal(ledger.get(String(second._id)).code, 'clientMachineRequired');
  await seedClientPrerequisites(f, second, 'finishing'); let lose = true;
  result = await submitWorkerClientBatch(inputs, ledger, async (input, requestId) => { const work = await call(f, input, requestId); if (lose) { lose = false; throw new Error('Lost response'); } return work; }); assert.equal(result.complete, false);
  result = await submitWorkerClientBatch(inputs, ledger, (input, requestId) => call(f, input, requestId)); assert.equal(result.complete, true);
  assert.equal(f.records.filter(row => row.category === 'finishing').length, 2);
});
test('sfifa can assign several customer orders with independent metres and wages without crediting inventory', async t => {
  const f = fixture(t), orders = [f.seedGarmentOrder('djellaba'), f.seedGarmentOrder('jabador')], value = form(orders);
  value.orderSelections[1].quantity = '4.125'; value.orderSelections[1].unitWage = '7';
  const before = f.stocks.reduce((sum, stock) => sum + stock.quantity, 0), ledger = new Map(), inputs = validateWorkerClientBatch(value, 'sfifa');
  const result = await submitWorkerClientBatch(inputs, ledger, (input, requestId) => call(f, input, requestId));
  assert.equal(result.complete, true, JSON.stringify([...ledger.values()])); assert.deepEqual(result.works.map(row => row.quantity), [3.5, 4.125]);
  assert.deepEqual(result.works.map(row => row.unitWage), [5.25, 7]); assert.equal(f.stocks.reduce((sum, stock) => sum + stock.quantity, 0), before);
  const count = f.stocks.reduce((sum, stock) => sum + (stock.production?.length || 0), 0);
  for (const entry of ledger.values()) await call(f, entry.input, entry.requestId);
  assert.equal(f.stocks.reduce((sum, stock) => sum + (stock.production?.length || 0), 0), count);
});
test('shop isolation and employee assignment rights are checked for every selected request', async t => {
  const f = fixture(t), inputs = validateWorkerClientBatch(form([f.seedGarmentOrder('djellaba'), f.seedGarmentOrder('djellaba', undefined, otherOwner)]), 'machine'), ledger = new Map();
  const result = await submitWorkerClientBatch(inputs, ledger, (input, requestId) => call(f, input, requestId)); assert.equal(result.works.length, 1); assert.equal(ledger.get(inputs[1].orderId).code, 'orderNotFound');
  f.staff.moduleAccess = ['workers']; f.staff.operationPermissions = { workers: [] };
  await assert.rejects(call(f, inputs[0], randomUUID(), { id: employee, role: 'Employe' }), error => error.response.status === 403);
  assert.equal(f.records.length, 1);
});
