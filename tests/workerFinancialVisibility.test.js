import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, employee } from './helpers/djellabaCostsFixture.js';
import { employeeCanRequest, moduleOperationPermissions } from '../shared/employeePermissions.js';
import { workerHasPieceWages } from '../shared/workerMaterials.js';
import { validateWorkerCompletion } from '../shared/workerWork.js';
import { getWorkerPayroll, addWorkerPayment } from '../BackEnd/controlles/WorkerPayroll.js';

const secret = process.env.JWT_SECRET;
let server, base;
before(async () => {
  process.env.JWT_SECRET = 'isolated-worker-financial-visibility';
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
});
const admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe' };
const operations = ['assign', 'complete', 'increase', 'details', 'resume', 'payroll', 'pay', 'advance', 'download'];
function fixture(t) {
  const f = workerMaterialsFixture(t);
  f.worker.categories = ['machine', 'sfifa', 'brim', 'finishing', 'trousers', 'shirts', 'mesbanto'];
  f.staff.moduleAccess = ['workers']; f.staff.operationPermissions = { workers: [...operations] };
  return f;
}
const workPath = f => '/tailoring-workers/' + f.worker._id + '/work';
async function request(url, body, actor = staff, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(base + url, { method, headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, data: await r.json() };
}
function noMoney(data) {
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!['unitWage', 'earningAmount', 'earningMonth', 'payments', 'totals', 'entries'].includes(key), 'Leaked financial field: ' + key);
      walk(child);
    }
  }; walk(data);
}
const job = (patch = {}) => ({ category: 'brim', workType: 'shop', quantity: 3, unitWage: 50, requestId: randomUUID(), ...patch });

test('financial visibility is off for existing employees and requires an explicit current grant', () => {
  const old = { action: { add: true, update: true, delete: true } };
  const denied = moduleOperationPermissions('Employe', old, 'workers');
  for (const key of ['financials', 'payroll', 'pay', 'advance', 'download']) assert.equal(denied[key], false);
  assert.equal(denied.complete, true); assert.equal(denied.assign, true);
  for (const key of ['payroll', 'pay', 'advance', 'download']) {
    const user = { moduleAccess: ['workers'], operationPermissions: { workers: [key] } };
    assert.equal(employeeCanRequest(user, 'GET', '/tailoring-workers/id/payroll'), false);
    user.operationPermissions.workers.push('financials');
    assert.equal(employeeCanRequest(user, 'GET', '/tailoring-workers/id/payroll'), true);
  }
});

test('assignment, completion, retries, increases and lists hide all existing wages and earnings', async t => {
  const f = fixture(t), body = job();
  let r = await request(workPath(f), body); assert.equal(r.status, 201); noMoney(r.data);
  const assigned = r.data;
  r = await request(workPath(f), body); assert.equal(r.status, 200); noMoney(r.data);
  const completion = { quantity: 1, version: assigned.__v, requestId: randomUUID() };
  r = await request(workPath(f) + '/' + assigned._id + '/completions', completion); assert.equal(r.status, 201); noMoney(r.data);
  r = await request(workPath(f) + '/' + assigned._id + '/completions', completion); assert.equal(r.status, 200); noMoney(r.data);
  r = await request(workPath(f) + '/' + assigned._id + '/increases', { quantity: 2, version: r.data.__v, requestId: randomUUID() }); assert.equal(r.status, 201); noMoney(r.data);
  r = await request(workPath(f) + '?category=brim'); assert.equal(r.status, 200); noMoney(r.data.works); assert.equal(r.data.works[0].remainingQuantity, 4);
  const own = await request(workPath(f) + '?category=brim', undefined, admin);
  assert.equal(own.data.works[0].unitWage, 50); assert.equal(own.data.works[0].completions[0].earningAmount, 50);
  f.staff.operationPermissions.workers.push('financials');
  r = await request(workPath(f) + '?category=brim'); assert.equal(r.data.works[0].unitWage, 50);
  f.staff.operationPermissions.workers = [...operations];
  r = await request(workPath(f) + '?category=brim'); noMoney(r.data.works);
});

test('hiding per-piece wages preserves piece completion and authoritative payroll calculations', async t => {
  const f = fixture(t), rows = [10, 25].map(wage => ({ ...f.selection(randomUUID().replaceAll('-', '').slice(0, 24)), unitWage: wage }));
  const body = job({ category: 'machine', garmentType: 'djellaba', productName: 'الجلابيب', quantity: 2, unitWage: undefined, materials: rows });
  let r = await request(workPath(f), body); assert.equal(r.status, 201); noMoney(r.data);
  const work = r.data; assert.equal(work.pieceCompletion, true); assert.equal(workerHasPieceWages(work), true);
  const completion = { quantity: 1, lineIds: [rows[1].lineId], version: work.__v, requestId: randomUUID() };
  assert.deepEqual(validateWorkerCompletion(completion, work.remainingQuantity, work.category, work).lineIds, completion.lineIds);
  r = await request(workPath(f) + '/' + work._id + '/completions', completion); assert.equal(r.status, 201); noMoney(r.data); assert.equal(r.data.completedQuantity, 1);
  const account = await request('/tailoring-workers/' + f.worker._id + '/payroll', undefined, admin);
  assert.equal(account.status, 200); assert.equal(account.data.totals.earned, 25);
});

test('sfifa embedded production hides wages without changing completed metres', async t => {
  const f = fixture(t), body = job({ category: 'sfifa', quantity: 12, unitWage: 2.5, sfifa: { width: 'thin', family: '01-30', code: 12 } });
  let r = await request(workPath(f), body); assert.equal(r.status, 201); noMoney(r.data);
  r = await request(workPath(f) + '/' + r.data._id + '/completions', { quantity: 4, version: r.data.__v, requestId: randomUUID() });
  assert.equal(r.status, 201); noMoney(r.data); assert.equal(r.data.remainingQuantity, 8);
  r = await request(workPath(f) + '?category=sfifa'); assert.equal(r.status, 200); noMoney(r.data.works);
});

test('financial endpoints and direct controllers deny reports and payments until financial access is granted', async t => {
  const f = fixture(t), url = '/tailoring-workers/' + f.worker._id;
  const payment = { type: 'advance', amount: 10, month: '2026-11', paidOn: '2026-11-03', requestId: randomUUID() };
  assert.equal((await request(url + '/payroll')).status, 403);
  assert.equal((await request(url + '/payments', payment)).status, 403);
  for (const controller of [getWorkerPayroll, addWorkerPayment]) {
    const response = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await controller({ user: staff, params: { id: String(f.worker._id) }, body: payment }, response);
    assert.equal(response.code, 403); assert.deepEqual(response.data, { message: 'forbidden' });
  }
  f.staff.operationPermissions.workers.push('financials');
  let r = await request(url + '/payroll'); assert.equal(r.status, 200); assert.equal(r.data.totals.paid, 0);
  // Revocation applies on the next request, with the same JWT.
  f.staff.operationPermissions.workers = [...operations];
  assert.equal((await request(url + '/payroll')).status, 403);
  assert.equal((await request(url + '/payments', payment)).status, 403);
});
