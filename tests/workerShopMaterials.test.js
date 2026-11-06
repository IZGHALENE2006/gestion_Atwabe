import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import Fabric from '../BackEnd/models/Fabric.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';
import { validateWorkerWork, validateWorkerIncrease } from '../shared/workerWork.js';
import { resizeWorkerMaterialLines } from '../shared/workerMaterials.js';

let server, base;
const previousSecret = process.env.JWT_SECRET, admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe', idAdmin: otherOwner };
before(async () => { process.env.JWT_SECRET = 'isolated-worker-shop-materials'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
async function request(path, body, method = body ? 'POST' : 'GET', actor = admin) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const pathFor = f => `/tailoring-workers/${f.worker._id}/work`;
const lineId = () => randomUUID().replaceAll('-', '').slice(0, 24);
const assignment = (f, patch = {}) => ({ category: 'machine', workType: 'shop', garmentType: 'djellaba', productName: 'جلابيب المحل', quantity: 2, unitWage: 25, materials: [f.selection(lineId(), 2), f.selection(lineId(), 3.5)], requestId: randomUUID(), ...patch });
const assign = (f, body, actor) => request(pathFor(f), body, 'POST', actor);
const cancel = (f, work, patch = {}, actor) => request(`${pathFor(f)}/${work._id}/cancel`, { version: work.__v, requestId: randomUUID(), ...patch }, 'POST', actor);
const complete = (f, work, quantity = 1) => request(`${pathFor(f)}/${work._id}/completions`, { version: work.__v, requestId: randomUUID(), quantity });
const balance = f => [f.fabrics[0].colors[0].pieces[0].meters, f.stocks[0].quantity];

for (const garmentType of ['djellaba', 'jabador', 'malakiya']) test(`shop ${garmentType} reserves each piece's fabric and exactly 3 m sfifa without a customer order`, async t => {
  const f = workerMaterialsFixture(t), body = assignment(f, { garmentType });
  body.materials[0].meters = 2.125; body.materials[0].sfifaMeters = 99;
  const result = await assign(f, body); assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(result.data.workType, 'shop'); assert.equal(result.data.garmentType, garmentType); assert.equal(result.data.tailoring, undefined);
  assert.equal(result.data.materialStatus, 'ready'); assert.equal(result.data.materials.length, 2);
  assert.ok(result.data.materials.every(row => row.sfifaMeters === 3)); assert.deepEqual(balance(f), [14.375, 14]);
  assert.equal((await assign(f, body)).status, 200); assert.deepEqual(balance(f), [14.375, 14]);
  assert.equal((await cancel(f, result.data)).status, 200); assert.deepEqual(balance(f), [20, 20]);
});

test('shop pieces can choose different fabric stocks, coupons and sfifa widths', async t => {
  const f = workerMaterialsFixture(t), fabric = f.seedFabric({ meters: 30 }), sfifa = f.seedSfifa({ quantity: 15, width: 'thick' });
  const body = assignment(f); body.materials[1] = f.selection(body.materials[1].lineId, 4.25, fabric, sfifa, 1);
  const result = await assign(f, body); assert.equal(result.status, 201, JSON.stringify(result));
  assert.deepEqual(balance(f), [18, 17]); assert.equal(f.fabrics[1].colors[0].pieces[1].meters, 4.75); assert.equal(f.stocks[1].quantity, 12);
  assert.equal((await cancel(f, result.data)).status, 200); assert.deepEqual(balance(f), [20, 20]);
  assert.equal(f.fabrics[1].colors[0].pieces[1].meters, 9); assert.equal(f.stocks[1].quantity, 15);
});

for (const completed of [1, 2]) test(`cancelling shop work after ${completed} completed pieces returns all materials and preserves earned wages`, async t => {
  const f = workerMaterialsFixture(t), assigned = await assign(f, assignment(f));
  const done = await complete(f, assigned.data, completed); assert.equal(done.status, 201);
  const body = { version: done.data.__v, requestId: randomUUID() };
  const results = await Promise.all([request(`${pathFor(f)}/${done.data._id}/cancel`, body), request(`${pathFor(f)}/${done.data._id}/cancel`, body)]);
  assert.deepEqual(results.map(result => result.status), [200, 200]); assert.deepEqual(balance(f), [20, 20]);
  assert.equal(f.records[0].completedQuantity, completed); assert.equal(f.records[0].completions[0].earningAmount, completed * 25);
  const account = await request(`/tailoring-workers/${f.worker._id}/payroll`); assert.equal(account.status, 200);
  assert.equal(account.data.totals.earned, completed * 25); assert.equal(account.data.totals.due, completed * 25);
  assert.ok(f.records[0].cancelledAt); assert.equal((await request(pathFor(f) + '?category=machine')).data.works.length, 0);
  assert.equal((await complete(f, done.data)).status, 409);
});

test('shop increases consume the added pieces only, keep their wage and return every material on cancellation', async t => {
  const f = workerMaterialsFixture(t), first = await assign(f, assignment(f));
  const body = { quantity: 1, materials: [f.selection(lineId(), 1.125)], unitWage: 999, requestId: randomUUID(), version: first.data.__v };
  const path = `${pathFor(f)}/${first.data._id}/increases`, added = await request(path, body);
  assert.equal(added.status, 201, JSON.stringify(added)); assert.equal(added.data.quantity, 3); assert.equal(added.data.unitWage, 25);
  assert.equal(added.data.materials.length, 3); assert.deepEqual(balance(f), [13.375, 11]);
  assert.equal((await request(path, body)).status, 200); assert.deepEqual(balance(f), [13.375, 11]);
  assert.equal((await request(path, { ...body, materials: [{ ...body.materials[0], meters: 2 }] })).status, 409);
  const done = await complete(f, added.data, 3); assert.equal(done.status, 201);
  assert.equal((await cancel(f, done.data)).status, 200); assert.deepEqual(balance(f), [20, 20]);
  assert.equal(f.records[0].completions[0].earningAmount, 75);
});

test('shop material validation covers piece count, sections, duplicates, exact metres and cumulative demand', async t => {
  const f = workerMaterialsFixture(t), body = assignment(f);
  for (const patch of [{ materials: [] }, { quantity: 51 }, { materials: [body.materials[0], body.materials[0]] }, { materials: body.materials.map(row => ({ ...row, meters: 0.0001 })) }, { category: 'finishing' }, { garmentType: 'shirts' }]) {
    assert.equal((await assign(f, { ...body, ...patch })).status, 400, JSON.stringify(patch));
  }
  assert.equal(f.records.length, 0); assert.deepEqual(balance(f), [20, 20]);
  const shortage = assignment(f); shortage.materials.forEach(row => row.meters = 11);
  let response = await assign(f, shortage); assert.equal(response.status, 409); assert.equal(response.data.message, 'insufficientFabric');
  f.stocks[0].quantity = 5; f.stocks[0].variants[0].quantity = 5;
  response = await assign(f, body); assert.equal(response.status, 409); assert.equal(response.data.message, 'insufficientSfifa'); assert.equal(f.records.length, 0);
  assert.throws(() => validateWorkerWork({ ...body, materials: [{ ...body.materials[0], lineId: 'invalid' }, body.materials[1]] }), /invalidWork/);
  const priced = validateWorkerWork(body);
  assert.throws(() => validateWorkerIncrease({ quantity: 1, materials: [body.materials[0]] }, { ...priced, materials: priced.materials, completedQuantity: 0 }), /invalidWork/);
});

test('interrupted shop debits and acknowledgements resume once without leaking or doubling stock deductions', async t => {
  for (const fault of ['failBefore', 'failAfter', 'failWorkBefore', 'failWorkAfter']) {
    const f = workerMaterialsFixture(t), body = assignment(f); f.controls[fault] = fault.startsWith('failWork') ? true : 'sfifa';
    assert.equal((await assign(f, body)).status, 503, fault);
    const saved = await assign(f, body); assert.equal(saved.status, 200, JSON.stringify(saved));
    assert.deepEqual(balance(f), [14.5, 14]); assert.equal(f.records.length, 1);
    assert.equal((await cancel(f, saved.data)).status, 200); assert.deepEqual(balance(f), [20, 20]);
  }
});

test('failed shop increases compensate only their own debits and leave the original work usable', async t => {
  const f = workerMaterialsFixture(t), first = await assign(f, assignment(f));
  f.controls.afterWorkSave = () => { f.stocks[0].quantity = 1; f.stocks[0].variants[0].quantity = 1; };
  const path = `${pathFor(f)}/${first.data._id}/increases`;
  const body = { quantity: 1, materials: [f.selection(lineId(), 1)], requestId: randomUUID(), version: first.data.__v };
  const result = await request(path, body); assert.equal(result.status, 409); assert.equal(result.data.message, 'insufficientSfifa');
  assert.equal(f.records[0].quantity, 2); assert.equal(f.records[0].additions.length, 0); assert.deepEqual(balance(f), [14.5, 1]);
  assert.equal((await request(path, body)).status, 409); assert.deepEqual(balance(f), [14.5, 1]);
  assert.equal((await complete(f, { ...first.data, __v: f.records[0].__v })).status, 201);
});

test('concurrent shop assignment retries and competing jobs cannot double reserve or overdraw stock', async t => {
  const f = workerMaterialsFixture(t), body = assignment(f);
  const duplicates = await Promise.all([assign(f, body), assign(f, body)]);
  assert.deepEqual(duplicates.map(result => result.status).sort(), [200, 201]); assert.deepEqual(balance(f), [14.5, 14]);
  const jobs = [assignment(f), assignment(f)]; jobs.forEach(job => job.materials.forEach(row => row.meters = 5));
  const results = await Promise.all(jobs.map(job => assign(f, job)));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]); assert.deepEqual(balance(f), [4.5, 8]);
});

test('cancelling while initial shop stock reservation is running waits and never leaves a late debit', async t => {
  const f = workerMaterialsFixture(t), body = assignment(f), originalSave = Fabric.prototype.save;
  let release, reached;
  const blocked = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
  let first = true;
  t.mock.method(Fabric.prototype, 'save', async function () { const saved = await originalSave.call(this); if (first) { first = false; reached(); await gate; } return saved; });
  const assigning = assign(f, body);
  await blocked;
  const pending = (await request(pathFor(f) + '?category=machine')).data.works[0], cancelling = cancel(f, pending);
  release();
  const assigned = await assigning, cancelled = await cancelling;
  assert.equal(assigned.status, 201);
  if (cancelled.status === 409) assert.equal((await cancel(f, assigned.data)).status, 200); else assert.equal(cancelled.status, 200);
  assert.deepEqual(balance(f), [20, 20]); assert.ok(f.records[0].cancelledAt);
});

test('shop stock selectors and cancellations respect live worker permissions and stock ownership', async t => {
  const f = workerMaterialsFixture(t); f.staff.moduleAccess = ['workers']; f.staff.action.delete = true;
  assert.equal((await request(pathFor(f) + '/material-options', undefined, 'GET', staff)).status, 200);
  const result = await assign(f, assignment(f), staff); assert.equal(result.status, 201); assert.equal(String(f.records[0].createdBy), employee);
  const foreign = f.seedFabric({ idAdmin: otherOwner }), invalid = assignment(f); invalid.materials[0] = f.selection(invalid.materials[0].lineId, 2, foreign);
  assert.equal((await assign(f, invalid)).status, 409); assert.deepEqual(balance(f), [14.5, 14]);
  f.staff.action.delete = false; assert.equal((await cancel(f, result.data, {}, staff)).status, 403);
  f.staff.action.delete = true; assert.equal((await cancel(f, result.data, {}, staff)).status, 200);
  assert.equal(String(f.records[0].materialCancellation.createdBy), employee); assert.deepEqual(balance(f), [20, 20]);
});

test('completed shop work keeps its original stock entries available for a later full return', async t => {
  const f = workerMaterialsFixture(t), assigned = await assign(f, assignment(f)), done = await complete(f, assigned.data, 2);
  const fabric = f.fabrics[0], stock = f.stocks[0];
  assert.equal((await request(`/fabrics/${fabric._id}/colors/${fabric.colors[0]._id}/pieces/${fabric.colors[0].pieces[0]._id}`, { version: fabric.__v }, 'DELETE')).data.message, 'workerMaterialsInUse');
  assert.equal((await request(`/sfifa-stock/${stock._id}/variants/${stock.variants[0]._id}`, { version: stock.__v }, 'DELETE')).data.message, 'workerMaterialsInUse');
  assert.equal((await cancel(f, done.data)).status, 200); assert.deepEqual(balance(f), [20, 20]);
});

test('piece-count changes preserve existing selections and bound newly generated lines', () => {
  let next = 0; const id = () => String(++next).padStart(24, '0');
  const first = resizeWorkerMaterialLines([], '2', id), more = resizeWorkerMaterialLines(first, '3', id);
  assert.deepEqual(more.slice(0, 2), first); assert.equal(new Set(more).size, 3);
  for (const invalid of ['0', '51', '1.5', '', '1000000']) assert.equal(resizeWorkerMaterialLines(more, invalid, id), more);
  assert.deepEqual(resizeWorkerMaterialLines(more, '1', id), [first[0]]);
});

test('shop material snapshots retain the entered piece order', () => {
  const selection = lineId => ({ lineId, fabricId: '1'.repeat(24), colorId: '2'.repeat(24), pieceId: '3'.repeat(24), sfifaId: '4'.repeat(24), variantId: '5'.repeat(24), meters: 2 });
  const materials = [selection('f'.repeat(24)), selection('a'.repeat(24))];
  const result = validateWorkerWork({ category: 'machine', workType: 'shop', garmentType: 'djellaba', productName: 'دفعة', quantity: 2, materials });
  assert.deepEqual(result.materials.map(row => row.lineId), materials.map(row => row.lineId));
});

test('shop work still supports unnumbered sfifa stock and returns it to its original balance', async t => {
  const f = workerMaterialsFixture(t), legacy = f.seedSfifa({ legacy: true, width: 'thick', quantity: 7 });
  const body = assignment(f, { quantity: 1, materials: [f.selection(lineId(), 2, f.fabric, legacy)] });
  const result = await assign(f, body); assert.equal(result.status, 201);
  assert.equal(f.stocks[1].quantity, 4); assert.equal(f.stocks[1].unassignedQuantity, 4);
  assert.equal((await cancel(f, result.data)).status, 200);
  assert.equal(f.stocks[1].quantity, 7); assert.equal(f.stocks[1].unassignedQuantity, 7); assert.equal(f.stocks[0].quantity, 20);
});
