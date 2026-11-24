import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { matches } from './helpers/modelMemory.js';
import { owner, employee, otherOwner } from './helpers/djellabaCostsFixture.js';
import { SHOP_FLOW_GARMENTS } from '../shared/workerShopFlow.js';
import { validateWorkerShopBatch, submitWorkerShopBatch } from '../shared/workerShopBatch.js';
import { workerBatchLocked } from '../shared/workerClientBatch.js';

const id = n => n.toString(16).padStart(24, '0');
const data = () => ({ unitWage: '5.25', shopSelections: [1, 2].map(n => ({ shopOriginId: id(n), lineIds: [id(n + 10)], unitWage: '' })) });
test('both shop transfer sections build independent assignments for every garment type without changing the form', () => {
  for (const category of ['finishing', 'mesbanto']) for (const type of SHOP_FLOW_GARMENTS) {
    const value = data(); value.shopSelections[1].unitWage = '8.50'; value.shopSelections[1].lineIds.push(id(50)); const before = structuredClone(value);
    const inputs = validateWorkerShopBatch(value, category, type);
    assert.deepEqual(inputs.map(row => row.unitWage), [5.25, 8.5]); assert.deepEqual(inputs.map(row => row.lineIds.length), [1, 2]);
    assert.ok(inputs.every(row => row.workType === 'shop' && row.category === category && row.garmentType === type)); assert.deepEqual(value, before);
  }
});
test('legacy whole-work selections stay supported, while empty exact-piece selections and duplicate origins are rejected', () => {
  const value = data(); delete value.shopSelections[0].lineIds; assert.equal(validateWorkerShopBatch(value, 'finishing', 'djellaba')[0].lineIds, undefined);
  for (const shopSelections of [[], Array(51).fill(data().shopSelections[0]), [data().shopSelections[0], data().shopSelections[0]]]) assert.throws(() => validateWorkerShopBatch({ ...data(), shopSelections }, 'mesbanto', 'jabador'), error => error.fields.shopSelections === 'chooseShopWork');
  value.shopSelections[0].lineIds = []; value.shopSelections[1].unitWage = '-1';
  assert.throws(() => validateWorkerShopBatch(value, 'finishing', 'malakiya'), error => error.fields['shopSelections.0.lineIds'] === 'chooseShopPieces' && error.fields['shopSelections.1.unitWage'] === 'invalidWage');
  for (const [category, type] of [['machine', 'djellaba'], ['mesbanto', 'trousers'], ['finishing', 'shirts']]) assert.throws(() => validateWorkerShopBatch(data(), category, type));
});
test('a lost shop acknowledgement retains exact original pieces, wage and request ID on retry, skipping saved origins', async () => {
  const value = data(), ledger = new Map(), calls = []; let lost = true;
  const send = async (input, requestId) => { calls.push({ ...input, requestId }); if (input.shopOriginId === id(2) && lost) { lost = false; throw Error('Lost response'); } return { _id: input.shopOriginId }; };
  assert.equal((await submitWorkerShopBatch(validateWorkerShopBatch(value, 'finishing', 'djellaba'), ledger, send)).complete, false);
  assert.ok([...ledger.values()].every(workerBatchLocked)); value.unitWage = '99'; value.shopSelections[1].lineIds = [id(99)];
  const retry = validateWorkerShopBatch(value, 'finishing', 'djellaba', ledger); assert.deepEqual(retry[1].lineIds, [id(12)]); assert.equal(retry[1].unitWage, 5.25);
  assert.equal((await submitWorkerShopBatch(retry, ledger, send)).complete, true); assert.equal(calls.length, 3); assert.equal(calls[1].requestId, calls[2].requestId); assert.deepEqual(calls[1], calls[2]);
});

let server, base; const secret = process.env.JWT_SECRET, admin = { id: owner, role: 'admin' };
before(async () => { process.env.JWT_SECRET = 'isolated-shop-batch-tests'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; });
const url = worker => '/tailoring-workers/' + worker._id + '/work';
async function request(path, body, actor = admin) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok) throw Object.assign(Error(result.message), { response: { status: response.status, data: result } }); return result;
}
function fixture(t) {
  const f = workerMaterialsFixture(t); f.finisher = f.seedWorker(owner, ['finishing']); f.laundry = f.seedWorker(owner, ['mesbanto']); f.fabric = f.seedFabric({ meters: 500 }); f.sfifa = f.seedSfifa({ quantity: 500 });
  t.mock.method(WorkerWork, 'findOne', async scope => { const row = f.records.find(row => matches(row, scope)); return row ? new WorkerWork(row.toObject()) : null; }); return f;
}
async function origin(f, garmentType = 'djellaba') {
  return request(url(f.worker), { category: 'machine', workType: 'shop', garmentType, productName: 'عمل ' + garmentType, quantity: 2, materials: [1, 2].map(() => ({ ...f.selection(randomUUID().replaceAll('-', '').slice(0, 24), 2, f.fabric, f.sfifa), unitWage: 9, size: 'M' })), requestId: randomUUID() });
}
const assign = (worker, input, requestId = randomUUID(), actor = admin) => request(url(worker), { ...input, requestId }, actor);
const transfer = (work, category, lineIds, unitWage = 4) => ({ category, workType: 'shop', garmentType: work.garmentType, shopOriginId: work._id, lineIds, unitWage });
const complete = (worker, work, lineIds) => request(url(worker) + '/' + work._id + '/completions', { quantity: lineIds.length, lineIds, version: work.__v, requestId: randomUUID() });
const options = (worker, category, type) => request(url(worker) + '/shop-options?category=' + category + '&garmentType=' + type);
const form = works => ({ unitWage: '4', shopSelections: works.map(work => ({ shopOriginId: work._id, lineIds: [work.materials[0].lineId], unitWage: '' })) });

for (const type of SHOP_FLOW_GARMENTS) test(type + ': machine pieces cannot bypass finishing; multiple partially completed works advance with their own sources and wages', async t => {
  const f = fixture(t), works = [await origin(f, type), await origin(f, type)];
  assert.deepEqual((await options(f.finisher, 'finishing', type)).works, []);
  for (let index = 0; index < works.length; index++) {
    works[index] = await complete(f.worker, works[index], [works[index].materials[0].lineId]);
    await assert.rejects(assign(f.laundry, transfer(works[index], 'mesbanto', [works[index].materials[0].lineId])), error => error.response.status === 409 && error.message === 'shopFinishingRequired');
  }
  assert.deepEqual((await options(f.laundry, 'mesbanto', type)).works, []);
  const before = JSON.stringify([f.fabrics, f.stocks]), value = form(works); value.shopSelections[1].unitWage = '7';
  const finishing = await submitWorkerShopBatch(validateWorkerShopBatch(value, 'finishing', type), new Map(), (input, requestId) => assign(f.finisher, input, requestId));
  assert.equal(finishing.complete, true); assert.deepEqual(finishing.works.map(work => [work.quantity, work.unitWage]), [[1, 4], [1, 7]]);
  assert.deepEqual((await options(f.laundry, 'mesbanto', type)).works, []);
  await assert.rejects(assign(f.laundry, transfer(works[0], 'mesbanto', value.shopSelections[0].lineIds)), error => error.message === 'shopFinishingPending');
  for (const work of finishing.works) await complete(f.finisher, work, work.shopFlow.lineIds);
  const ready = (await options(f.laundry, 'mesbanto', type)).works; assert.equal(ready.length, 2); assert.ok(ready.every(work => work.availableQuantity === 1 && work.pieces.filter(piece => piece.available).length === 1));
  const ledger = new Map(), inputs = validateWorkerShopBatch(value, 'mesbanto', type), laundry = await submitWorkerShopBatch(inputs, ledger, (input, requestId) => assign(f.laundry, input, requestId));
  assert.equal(laundry.complete, true); assert.deepEqual(laundry.works.map(work => work.shopFlow.sourceWorkId), finishing.works.map(work => work._id)); assert.ok(laundry.works.every(work => work.shopFlow.pieceNumbers[0] === 1 && work.quantity === 1));
  assert.equal((await submitWorkerShopBatch(inputs, ledger, (input, requestId) => assign(f.laundry, input, requestId))).works.length, 2);
  assert.equal(f.records.filter(work => work.category === 'mesbanto').length, 2); assert.equal(JSON.stringify([f.fabrics, f.stocks]), before); assert.deepEqual((await options(f.laundry, 'mesbanto', type)).works, []);
});
test('a stale shop batch can partially fail and retry after finishing without duplicating assignments or earned wages', async t => {
  const f = fixture(t), works = [await origin(f), await origin(f)];
  for (let index = 0; index < works.length; index++) works[index] = await complete(f.worker, works[index], [works[index].materials[0].lineId]);
  const first = await assign(f.finisher, transfer(works[0], 'finishing', [works[0].materials[0].lineId])); await complete(f.finisher, first, first.shopFlow.lineIds);
  const value = form(works), ledger = new Map(); let result = await submitWorkerShopBatch(validateWorkerShopBatch(value, 'mesbanto', 'djellaba'), ledger, (input, requestId) => assign(f.laundry, input, requestId));
  assert.equal(result.works.length, 1); assert.equal(ledger.get(works[1]._id).code, 'shopFinishingRequired');
  const second = await assign(f.finisher, transfer(works[1], 'finishing', [works[1].materials[0].lineId])); await complete(f.finisher, second, second.shopFlow.lineIds);
  let lost = true; const send = async (input, requestId) => { const work = await assign(f.laundry, input, requestId); if (lost) { lost = false; throw Error('lost response'); } return work; };
  result = await submitWorkerShopBatch(validateWorkerShopBatch(value, 'mesbanto', 'djellaba', ledger), ledger, send); assert.equal(result.complete, false);
  result = await submitWorkerShopBatch(validateWorkerShopBatch(value, 'mesbanto', 'djellaba', ledger), ledger, send); assert.equal(result.complete, true); assert.equal(f.records.filter(work => work.category === 'mesbanto').length, 2);
  for (const work of result.works) await complete(f.laundry, work, work.shopFlow.lineIds);
  const payroll = await request('/tailoring-workers/' + f.laundry._id + '/payroll'); assert.equal(payroll.totals.earned, 8);
});
test('each shop assignment respects employee rights and owner isolation', async t => {
  const f = fixture(t), machine = await origin(f); await complete(f.worker, machine, [machine.materials[0].lineId]);
  const input = transfer(machine, 'finishing', [machine.materials[0].lineId]); f.staff.moduleAccess = ['workers']; f.staff.operationPermissions = { workers: [] };
  await assert.rejects(assign(f.finisher, input, randomUUID(), { id: employee, role: 'Employe' }), error => error.response.status === 403);
  f.staff.operationPermissions.workers = ['assign']; const work = await assign(f.finisher, input, randomUUID(), { id: employee, role: 'Employe' }); assert.equal(String(f.records.find(row => String(row._id) === work._id).createdBy), employee);
  const foreign = f.seedWorker(otherOwner, ['finishing']); await assert.rejects(assign(foreign, input, randomUUID(), { id: otherOwner, role: 'admin' }), error => error.response.status === 404);
});
