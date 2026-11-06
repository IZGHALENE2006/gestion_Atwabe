import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner } from './helpers/djellabaCostsFixture.js';

let server, base;
const previousSecret = process.env.JWT_SECRET, admin = { id: owner, role: 'admin' };
before(async () => { process.env.JWT_SECRET = 'isolated-worker-piece-wages'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
async function request(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${jwt.sign(admin, process.env.JWT_SECRET)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
const id = () => randomUUID().replaceAll('-', '').slice(0, 24);
const pathFor = f => `/tailoring-workers/${f.worker._id}/work`;
const selection = (f, wage = 10.25, meters = 2) => ({ ...f.selection(id(), meters), unitWage: wage });
const job = (f, patch = {}) => ({ category: 'machine', workType: 'shop', garmentType: 'djellaba', productName: 'الجلابيب', quantity: 2, materials: [selection(f, 10.25), selection(f, 25.5, 3.5)], requestId: randomUUID(), ...patch });
async function assign(f, body = job(f)) { const result = await request(pathFor(f), body); assert.equal(result.status, 201, JSON.stringify(result)); return result.data; }
const completeBody = (work, lineIds, patch = {}) => ({ quantity: lineIds.length, lineIds, version: work.__v, requestId: randomUUID(), ...patch });
const complete = (f, work, body) => request(`${pathFor(f)}/${work._id}/completions`, body);
const balance = f => [f.fabrics[0].colors[0].pieces[0].meters, f.stocks[0].quantity];
const account = async f => { const result = await request(`/tailoring-workers/${f.worker._id}/payroll`); assert.equal(result.status, 200); return result.data; };

for (const garmentType of ['djellaba', 'jabador', 'malakiya']) test(`${garmentType} stores independent per-piece wages and still reserves its material quantities`, async t => {
  const f = workerMaterialsFixture(t), body = job(f, { garmentType }); body.materials[0].unitWage = '10,25';
  const work = await assign(f, body); assert.equal(work.unitWage, undefined);
  assert.deepEqual(work.materials.map(row => row.unitWage), [10.25, 25.5]); assert.deepEqual(work.materials.map(row => row.lineId), body.materials.map(row => row.lineId));
  assert.deepEqual(balance(f), [14.5, 14]); assert.equal((await account(f)).totals.earned, 0);
  assert.equal((await request(pathFor(f), body)).status, 200); assert.deepEqual(balance(f), [14.5, 14]);
});

test('completing the more expensive piece first earns only its own wage, then the other piece adds its exact wage', async t => {
  const f = workerMaterialsFixture(t), work = await assign(f), [first, second] = work.materials;
  const done = await complete(f, work, completeBody(work, [second.lineId], { earningAmount: 999, earningMonth: '2000-01' }));
  assert.equal(done.status, 201, JSON.stringify(done)); assert.equal(done.data.completions[0].earningAmount, 25.5);
  assert.deepEqual(done.data.completions[0].lineIds, [second.lineId]);
  let ledger = await account(f); assert.equal(ledger.totals.earned, 25.5); assert.equal(ledger.totals.unpriced, 0); assert.equal(ledger.entries[0].pieceWages, true);
  const finished = await complete(f, done.data, completeBody(done.data, [first.lineId])); assert.equal(finished.status, 201);
  assert.equal(finished.data.completions[1].earningAmount, 10.25); assert.equal(finished.data.remainingQuantity, 0);
  ledger = await account(f); assert.equal(ledger.totals.earned, 35.75); assert.equal(ledger.totals.due, 35.75); assert.deepEqual(balance(f), [14.5, 14]);
});

test('duplicate completion retries cannot pay twice, and a changed piece selection conflicts even at the same quantity', async t => {
  const f = workerMaterialsFixture(t), work = await assign(f), body = completeBody(work, [work.materials[1].lineId]);
  const results = await Promise.all([complete(f, work, body), complete(f, work, body)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
  assert.equal((await complete(f, work, body)).status, 200);
  const changed = await complete(f, work, { ...body, lineIds: [work.materials[0].lineId] });
  assert.equal(changed.status, 409); assert.equal(changed.data.message, 'workRequestConflict');
  assert.equal((await account(f)).totals.earned, 25.5); assert.equal(f.records[0].completions.length, 1);
});

test('completion retries normalize selection order and distinct stale completions cannot overpay', async t => {
  const f = workerMaterialsFixture(t), work = await assign(f), ids = work.materials.map(row => row.lineId);
  const body = completeBody(work, ids), done = await complete(f, work, body); assert.equal(done.status, 201);
  assert.equal((await complete(f, work, { ...body, lineIds: [...ids].reverse() })).status, 200);
  assert.equal((await account(f)).totals.earned, 35.75);
  const other = await assign(f), responses = await Promise.all(other.materials.map(row => complete(f, other, completeBody(other, [row.lineId]))));
  assert.deepEqual(responses.map(result => result.status).sort(), [201, 409]);
  const current = responses.find(result => result.status === 201).data;
  const completedIds = new Set(current.completions.flatMap(event => event.lineIds));
  const remaining = current.materials.find(row => !completedIds.has(row.lineId));
  assert.equal((await complete(f, current, completeBody(current, [remaining.lineId]))).status, 201);
  assert.equal((await account(f)).totals.earned, 71.5);
});

test('piece selection rejects missing, duplicate, foreign, already completed and mismatched pieces', async t => {
  const f = workerMaterialsFixture(t), work = await assign(f), ids = work.materials.map(row => row.lineId);
  for (const patch of [{ lineIds: undefined, quantity: 1 }, { lineIds: [id()], quantity: 1 }, { lineIds: [ids[0], ids[0]], quantity: 2 }, { lineIds: [ids[0]], quantity: 2 }, { lineIds: ['invalid'], quantity: 1 }]) {
    const result = await complete(f, work, completeBody(work, ids, patch)); assert.equal(result.status, 400, JSON.stringify(result));
  }
  assert.equal(f.records[0].completedQuantity, 0); assert.equal((await account(f)).totals.earned, 0);
  const done = await complete(f, work, completeBody(work, [ids[1]])); assert.equal(done.status, 201);
  const again = await complete(f, done.data, completeBody(done.data, [ids[1]])); assert.equal(again.status, 400);
  assert.equal((await account(f)).totals.earned, 25.5);
});

test('invalid or partial wages are rejected before reserving stock; zero wages remain priced', async t => {
  const f = workerMaterialsFixture(t);
  for (const wage of [undefined, '', null, -1, '1.234', '1e2', true, 1000000000]) {
    const body = job(f); body.materials[1].unitWage = wage;
    const result = await request(pathFor(f), body); assert.equal(result.status, 400, JSON.stringify({ wage, result }));
  }
  const mixed = await request(pathFor(f), job(f, { unitWage: 10 })); assert.equal(mixed.status, 400);
  const overflow = job(f); overflow.materials.forEach(row => row.unitWage = 999999999.99);
  assert.equal((await request(pathFor(f), overflow)).status, 400);
  assert.deepEqual(balance(f), [20, 20]); assert.equal(f.records.length, 0);
  const free = job(f); free.materials.forEach(row => row.unitWage = 0);
  const work = await assign(f, free), done = await complete(f, work, completeBody(work, work.materials.map(row => row.lineId)));
  assert.equal(done.status, 201); assert.equal(done.data.completions[0].earningAmount, 0);
  assert.equal((await account(f)).totals.unpriced, 0);
});

test('increases retain each old wage, require new per-piece wages and include wage changes in retry identity', async t => {
  const f = workerMaterialsFixture(t), work = await assign(f), path = `${pathFor(f)}/${work._id}/increases`;
  const body = { quantity: 1, materials: [selection(f, 40, 1.125)], unitWage: 999, requestId: randomUUID(), version: work.__v };
  const missing = { ...body, materials: body.materials.map(row => { const copy = { ...row }; delete copy.unitWage; return copy; }) };
  assert.equal((await request(path, missing)).status, 400);
  const added = await request(path, body); assert.equal(added.status, 201, JSON.stringify(added));
  assert.deepEqual(added.data.materials.map(row => row.unitWage), [10.25, 25.5, 40]); assert.equal(added.data.unitWage, undefined);
  assert.equal((await request(path, body)).status, 200);
  assert.equal((await request(path, { ...body, materials: [{ ...body.materials[0], unitWage: 45 }] })).status, 409);
  const done = await complete(f, added.data, completeBody(added.data, added.data.materials.map(row => row.lineId)));
  assert.equal(done.status, 201); assert.equal(done.data.completions[0].earningAmount, 75.75); assert.equal((await account(f)).totals.due, 75.75);
});

test('uniform legacy work cannot be switched to per-piece wages by an increase', async t => {
  const f = workerMaterialsFixture(t), body = job(f, { unitWage: 20 }); body.materials.forEach(row => { delete row.unitWage; });
  const work = await assign(f, body);
  const invalid = await request(`${pathFor(f)}/${work._id}/increases`, { quantity: 1, materials: [selection(f, 30)], requestId: randomUUID(), version: work.__v });
  assert.equal(invalid.status, 400); assert.equal(f.records[0].quantity, 2); assert.equal(f.records[0].unitWage, 20);
});

test('cancellation returns every material while retaining the exact completed piece wage in payroll', async t => {
  const f = workerMaterialsFixture(t), work = await assign(f), done = await complete(f, work, completeBody(work, [work.materials[1].lineId]));
  const body = { version: done.data.__v, requestId: randomUUID() }, path = `${pathFor(f)}/${work._id}/cancel`;
  assert.equal((await request(path, body)).status, 200); assert.equal((await request(path, body)).status, 200);
  assert.deepEqual(balance(f), [20, 20]); assert.equal((await account(f)).totals.earned, 25.5); assert.equal((await account(f)).totals.due, 25.5);
  assert.equal(f.records[0].completions[0].lineIds[0], work.materials[1].lineId);
});

test('interrupted assignment remains retryable with its original per-piece wages and one stock debit', async t => {
  const f = workerMaterialsFixture(t), body = job(f); f.controls.failAfter = 'sfifa';
  assert.equal((await request(pathFor(f), body)).status, 503);
  const result = await request(pathFor(f), body); assert.equal(result.status, 200, JSON.stringify(result));
  assert.deepEqual(result.data.materials.map(row => row.unitWage), [10.25, 25.5]); assert.deepEqual(balance(f), [14.5, 14]);
  assert.equal((await complete(f, result.data, completeBody(result.data, [result.data.materials[1].lineId]))).status, 201);
  assert.equal((await account(f)).totals.earned, 25.5);
});

test('model validation protects historical piece selections and computed earnings', async t => {
  const f = workerMaterialsFixture(t), work = await assign(f), done = await complete(f, work, completeBody(work, [work.materials[1].lineId])); assert.equal(done.status, 201);
  for (const mutate of [row => { row.completions[0].earningAmount = 999; }, row => { row.completions[0].lineIds = undefined; }, row => { row.completions[0].lineIds = [id()]; }, row => { row.materialOperations[0].rows[1].unitWage = 99; }, row => { row.materialOperations[0].rows[0].unitWage = undefined; }, row => { row.unitWage = 20; }]) {
    const corrupt = new WorkerWork(f.records[0].toObject()); mutate(corrupt); await assert.rejects(corrupt.validate());
  }
});
