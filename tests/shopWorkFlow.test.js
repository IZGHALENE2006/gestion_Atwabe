import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { matches } from './helpers/modelMemory.js';
import { owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';
import { SHOP_FLOW_GARMENTS, shopWorkBarcode, shopPieceBarcode, shopPieceNumber } from '../shared/workerShopFlow.js';
import { validateWorkerWork } from '../shared/workerWork.js';
import { employeeCanRequest } from '../shared/employeePermissions.js';
let server, base; const secret = process.env.JWT_SECRET, admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe', idAdmin: otherOwner };
before(async () => { process.env.JWT_SECRET = 'isolated-shop-flow-tests'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; });
async function request(path, body, actor = admin, method = body ? 'POST' : 'GET') {
 const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, data: await response.json() };
}
const url = worker => '/tailoring-workers/' + worker._id + '/work';
function fixture(t) {
 const f = workerMaterialsFixture(t); f.worker.name = 'عامل الآلة'; f.finisher = f.seedWorker(owner, ['finishing']); f.finisher.name = 'عامل التصفية'; f.laundry = f.seedWorker(owner, ['mesbanto']); f.laundry.name = 'عامل المصبنة';
 t.mock.method(WorkerWork, 'findOne', async scope => { const row = f.records.find(row => matches(row, scope)); return row ? new WorkerWork(row.toObject()) : null; });
 return f;
}
async function checked(path, body, status = 201) { const response = await request(path, body); assert.equal(response.status, status, JSON.stringify(response)); return response.data; }
async function origin(f, garmentType = 'djellaba') {
 const ids = [randomUUID().replaceAll('-', '').slice(0, 24), randomUUID().replaceAll('-', '').slice(0, 24)];
 return checked(url(f.worker), { category: 'machine', workType: 'shop', garmentType, productName: 'عمل ' + garmentType, quantity: 2, materials: ids.map((id, i) => ({ ...f.selection(id), size: i ? 'XL' : 'M', unitWage: i ? 11 : 9 })), requestId: randomUUID() });
}
async function complete(worker, work, quantity = work.remainingQuantity, lineIds = work.materials?.slice(0, quantity).map(row => row.lineId)) {
 return checked(url(worker) + '/' + work._id + '/completions', { quantity, version: work.__v, requestId: randomUUID(), ...(lineIds ? { lineIds } : {}) });
}
const selection = (work, category = 'finishing', patch = {}) => ({ category, workType: 'shop', garmentType: work.garmentType, shopOriginId: work._id, unitWage: 5, requestId: randomUUID(), ...patch });
async function options(worker, category, garmentType = 'djellaba', actor = admin) { return request(url(worker) + '/shop-options?category=' + category + '&garmentType=' + garmentType, undefined, actor); }

test('all three shop garment types retain distinct per-piece barcodes and trusted piece data through finishing and laundry', async t => {
 const f = fixture(t);
 for (const type of SHOP_FLOW_GARMENTS) {
  let machine = await origin(f, type); assert.match(machine.shopBarcode, /^SW-[A-F0-9]{24}$/); assert.equal(machine.shopBarcode, shopWorkBarcode(machine));
  const pieceCodes = [1, 2].map(number => shopPieceBarcode(machine, number)); assert.equal(new Set(pieceCodes).size, 2); assert.ok(pieceCodes.every(Boolean));
  const read = await request(url(f.worker) + '?category=machine'); assert.deepEqual([1, 2].map(number => shopPieceBarcode(read.data.works.find(row => row._id === machine._id), number)), pieceCodes);
  machine = await complete(f.worker, machine); const stockBefore = JSON.stringify([f.fabrics, f.stocks]);
  const opts = await options(f.finisher, 'finishing', type); assert.equal(opts.status, 200); const option = opts.data.works.find(row => row._id === machine._id); assert.equal(option.available, true); assert.equal(option.materials[0].unitWage, undefined); assert.equal(option.materials[1].size, 'XL'); assert.deepEqual([1, 2].map(number => shopPieceBarcode(option, number)), pieceCodes);
  let finishing = await checked(url(f.finisher), selection(machine, 'finishing', { productName: 'FORGED', quantity: 900, shopFlow: { materials: [] } }));
  assert.equal(finishing.quantity, 2); assert.equal(finishing.productName, machine.productName); assert.equal(finishing.shopBarcode, machine.shopBarcode); assert.equal(finishing.shopFlow.originWorkerName, f.worker.name); assert.equal(finishing.shopFlow.materials[0].fabricType, f.fabric.type); assert.equal(finishing.materials, undefined); assert.equal(finishing.unitWage, 5);
  assert.deepEqual([1, 2].map(number => shopPieceBarcode(finishing, number)), pieceCodes);
  finishing = await complete(f.finisher, finishing); assert.equal(finishing.completions[0].earningAmount, 10);
  let laundry = await checked(url(f.laundry), selection(machine, 'mesbanto', { unitWage: 3 })); assert.equal(laundry.shopBarcode, machine.shopBarcode); assert.equal(laundry.shopFlow.sourceWorkId, finishing._id); assert.equal(laundry.shopFlow.sourceCategory, 'finishing'); assert.equal(laundry.shopFlow.materials.length, 2); assert.deepEqual([1, 2].map(number => shopPieceBarcode(laundry, number)), pieceCodes);
  laundry = await complete(f.laundry, laundry); assert.equal(laundry.completions[0].earningAmount, 6); assert.equal(JSON.stringify([f.fabrics, f.stocks]), stockBefore);
  const listing = await request(url(f.worker) + '?category=machine'), saved = listing.data.works.find(row => row._id === machine._id); assert.equal(saved.flow.done, true); assert.deepEqual(saved.flow.stages.map(row => [row.category, row.done]), [['machine', true], ['finishing', true], ['mesbanto', true]]);
 }
 const account = await request('/tailoring-workers/' + f.finisher._id + '/payroll'); assert.equal(account.data.totals.earned, 30);
});

test('incomplete machine and finishing work remain visible with reasons but cannot advance, including partially completed work', async t => {
 const f = fixture(t); let machine = await origin(f); const body = selection(machine);
 let result = await options(f.finisher, 'finishing'); assert.equal(result.data.works[0].available, false); assert.equal(result.data.works[0].reason, 'shopMachinePending');
 assert.equal((await request(url(f.finisher), body)).data.message, 'shopMachinePending');
 machine = await complete(f.worker, machine, 1); assert.equal((await request(url(f.finisher), body)).status, 409);
 machine = await complete(f.worker, machine, 1, [machine.materials[1].lineId]);
 assert.equal((await request(url(f.laundry), selection(machine, 'mesbanto'))).data.message, 'shopFinishingRequired');
 let finishing = await checked(url(f.finisher), body); finishing = await complete(f.finisher, finishing, 1);
 result = await options(f.laundry, 'mesbanto'); assert.equal(result.data.works[0].reason, 'shopFinishingPending'); assert.equal((await request(url(f.laundry), selection(machine, 'mesbanto'))).status, 409);
 finishing = await complete(f.finisher, finishing, 1); assert.equal(finishing.remainingQuantity, 0); assert.equal((await options(f.laundry, 'mesbanto')).data.works[0].available, true);
});

test('assignments are retryable, reject duplicates and conflicting retries, and serialize concurrent assignments to different workers', async t => {
 const f = fixture(t), machine = await complete(f.worker, await origin(f)), body = selection(machine), other = f.seedWorker(owner, ['finishing']);
 const results = await Promise.all([request(url(f.finisher), body), request(url(other), { ...body, requestId: randomUUID() })]); assert.deepEqual(results.map(row => row.status).sort(), [201, 409]);
 const saved = results[0].data; assert.equal((await request(url(f.finisher), body)).status, 200); assert.equal((await request(url(f.finisher), { ...body, unitWage: 6 })).data.message, 'workRequestConflict');
 assert.equal(f.records.filter(row => row.shopFlow).length, 1); assert.equal((await options(f.finisher, 'finishing')).data.works[0].reason, 'shopAlreadyAssigned'); assert.equal(saved.shopBarcode, machine.shopBarcode);
});

test('later stages block source increases, deletion and material cancellation; downstream quantities are fixed and deleting an assignment releases its slot', async t => {
 const f = fixture(t), machine = await complete(f.worker, await origin(f)); let finishing = await checked(url(f.finisher), selection(machine));
 const mutation = { version: machine.__v, requestId: randomUUID(), quantity: 1 };
 for (const [suffix, method] of [['/cancel', 'POST'], ['', 'DELETE'], ['/increases', 'POST']]) { const result = await request(url(f.worker) + '/' + machine._id + suffix, mutation, admin, method); assert.equal(result.status, 409); assert.equal(result.data.message, 'shopHasLaterStage'); }
 assert.equal((await request(url(f.finisher) + '/' + finishing._id + '/increases', { quantity: 1, version: finishing.__v, requestId: randomUUID() })).data.message, 'shopFlowFixedQuantity');
 finishing = await complete(f.finisher, finishing); let laundry = await checked(url(f.laundry), selection(machine, 'mesbanto'));
 assert.equal((await request(url(f.finisher) + '/' + finishing._id, { version: finishing.__v }, admin, 'DELETE')).data.message, 'shopHasLaterStage');
 const removed = await request(url(f.laundry) + '/' + laundry._id, { version: laundry.__v }, admin, 'DELETE'); assert.equal(removed.status, 200); const archived = f.records.find(row => String(row._id) === laundry._id); assert.ok(archived.deletedAt); assert.equal(archived.shopFlowSlot, undefined);
 laundry = await checked(url(f.laundry), selection(machine, 'mesbanto')); assert.notEqual(laundry._id, archived._id.toString()); assert.equal(laundry.shopBarcode, machine.shopBarcode);
});

test('shop selectors and assignments use current worker permissions and owner scope, without needing inventory module access', async t => {
 const f = fixture(t), machine = await complete(f.worker, await origin(f)); f.staff.moduleAccess = ['workers']; f.staff.operationPermissions = { workers: ['assign'] };
 assert.equal((await options(f.finisher, 'finishing', 'djellaba', staff)).status, 200);
 for (const permissions of [[], ['complete'], ['increase'], ['details']]) { f.staff.operationPermissions.workers = permissions; assert.equal((await options(f.finisher, 'finishing', 'djellaba', staff)).status, 403); assert.equal((await request(url(f.finisher), selection(machine), staff)).status, 403); }
 f.staff.operationPermissions.workers = ['assign']; assert.equal((await request(url(f.finisher), selection(machine), staff)).status, 201);
 const foreign = f.seedWorker(otherOwner, ['finishing']); const result = await request(url(foreign), selection(machine), { id: otherOwner, role: 'admin' }); assert.equal(result.status, 404); assert.equal(result.data.message, 'shopWorkNotFound');
 assert.equal(employeeCanRequest({ moduleAccess: ['workers'], operationPermissions: { workers: ['assign'] } }, 'GET', url(f.finisher) + '/shop-options'), true);
 assert.equal(employeeCanRequest({ moduleAccess: ['workers'], operationPermissions: { workers: ['increase'] } }, 'GET', url(f.finisher) + '/shop-options'), false);
});

test('invalid section, garment, identifiers and wages are rejected; client and older shop jobs keep their previous behavior', async t => {
 const f = fixture(t), machine = await complete(f.worker, await origin(f));
 for (const patch of [{ shopOriginId: 'bad' }, { garmentType: 'shirts' }, { workType: 'client' }, { category: 'brim' }, { unitWage: -1 }]) assert.throws(() => validateWorkerWork(selection(machine, 'finishing', patch)), error => error.message === 'invalidWork');
 assert.equal((await request(url(f.finisher), selection(machine, 'finishing', { garmentType: 'jabador' }))).status, 404);
 const tooLarge = await request(url(f.finisher), selection(machine, 'finishing', { unitWage: 999999999.99 })); assert.equal(tooLarge.status, 400); assert.equal(tooLarge.data.fields.unitWage, 'invalidWage');
 assert.equal((await request(url(f.worker) + '/shop-options?category=machine&garmentType=djellaba')).status, 400);
 const legacy = await checked(url(f.finisher), { category: 'finishing', workType: 'shop', productName: 'عمل قديم', quantity: 2, unitWage: 4, requestId: randomUUID() }); assert.equal(legacy.shopFlow, undefined); assert.equal((await complete(f.finisher, legacy)).completions[0].earningAmount, 8);
 const order = f.seedGarmentOrder('shirts'); const client = await checked(url(f.laundry), { category: 'mesbanto', workType: 'client', orderId: String(order._id), lineIds: [order.items[0].lineId], unitWage: 3, requestId: randomUUID() }); assert.equal(client.shopBarcode, undefined); assert.equal(client.shopFlow, undefined); assert.equal(client.tailoring.clientName, order.clientName);
});

test('stale material reservations and cancelled origin jobs cannot be transferred', async t => {
 const f = fixture(t); let machine = await complete(f.worker, await origin(f)); const saved = f.records.find(row => String(row._id) === machine._id); saved.materialStatus = 'pending';
 assert.equal((await request(url(f.finisher), selection(machine))).data.message, 'shopMachinePending'); saved.materialStatus = 'ready';
 const result = await request(url(f.worker) + '/' + machine._id + '/cancel', { version: machine.__v, requestId: randomUUID() }); assert.equal(result.status, 200); assert.equal((await options(f.finisher, 'finishing')).data.works.length, 0); assert.equal((await request(url(f.finisher), selection(machine))).status, 404);
});

test('model invariants preserve production links and a database unique slot protects against concurrent API processes', async t => {
 const f = fixture(t), machine = await complete(f.worker, await origin(f)), finishing = await checked(url(f.finisher), selection(machine)); const source = f.records.find(row => String(row._id) === finishing._id).toObject();
 for (const patch of [{ category: 'brim' }, { workType: 'client' }, { garmentType: 'shirts' }, { shopFlowSlot: 'forged' }, { quantity: 3 }, { shopFlow: { ...source.shopFlow, sourceCategory: 'finishing' } }]) await assert.rejects(new WorkerWork({ ...source, ...patch }).validate());
 const index = WorkerWork.schema.indexes().find(([keys]) => keys.shopFlowSlot); assert.equal(index[1].unique, true); assert.deepEqual(index[1].partialFilterExpression, { shopFlowSlot: { $type: 'string' } });
});


test('new pieces and partial completions keep old label identities, and scans resolve only existing pieces of the matching work', async t => {
 const f = fixture(t), machine = await origin(f), initialCodes = [1, 2].map(number => shopPieceBarcode(machine, number));
 const body = { version: machine.__v, quantity: 1, materials: [{ ...f.selection(randomUUID().replaceAll('-', '').slice(0, 24)), unitWage: 13, size: 'L' }], requestId: randomUUID() };
 const added = await checked(url(f.worker) + '/' + machine._id + '/increases', body); assert.equal(added.quantity, 3); assert.deepEqual([1, 2].map(number => shopPieceBarcode(added, number)), initialCodes); const thirdCode = shopPieceBarcode(added, 3); assert.ok(thirdCode); assert.ok(!initialCodes.includes(thirdCode));
 const retry = await checked(url(f.worker) + '/' + machine._id + '/increases', body, 200); assert.equal(shopPieceBarcode(retry, 3), thirdCode);
 const partial = await complete(f.worker, added, 1, [added.materials[1].lineId]); assert.deepEqual([1, 2].map(number => shopPieceBarcode(partial, number)), initialCodes);
 const other = await origin(f); assert.notEqual(shopPieceBarcode(other, 1), initialCodes[0]);
 assert.equal(shopPieceNumber(partial, '  ' + initialCodes[1].toLowerCase() + '  '), 2); assert.equal(shopPieceNumber(partial, thirdCode), 3); assert.equal(shopPieceNumber(other, thirdCode), null);
 for (const number of [0, -1, 1.5, 4, NaN, Infinity]) assert.equal(shopPieceBarcode(partial, number), '');
 for (const barcode of [machine.shopBarcode, initialCodes[0] + '0', thirdCode.replace(/003$/, '999'), 'unknown', null]) assert.equal(shopPieceNumber(partial, barcode), null);
 const client = { ...machine, workType: 'client', shopBarcode: undefined }; assert.equal(shopPieceBarcode(client, 1), '');
});
