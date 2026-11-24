import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import { buildSfifaInventoryReport } from '../shared/sfifaInventoryReport.js';
import { employeeCanRequest, canEmployeeOperation, validateEmployeePermissions } from '../shared/employeePermissions.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, employee, otherOwner } from './helpers/djellabaCostsFixture.js';

const row = (n, patch = {}) => ({ _id: String(n), width: 'thin', family: '01-30', code: n, quantity: .6, styleMeters: { single: .1, double: .2, gradient: .125 }, ...patch });
test('the report reconciles three color types and unclassified metres exactly without exposing stock internals', () => {
  const items = [row(3, { receipts: ['private'], production: ['private'], price: 30, idAdmin: owner }), row(1, { width: 'thick', quantity: .4, styleMeters: { single: .15, double: .125, gradient: .125 } })], before = structuredClone(items);
  const report = buildSfifaInventoryReport(items);
  assert.deepEqual(report.totals, { quantity: 1, thin: .6, thick: .4, single: .25, double: .325, gradient: .25, unclassifiedMeters: .175 });
  assert.equal(report.hasUnclassified, true); assert.equal(report.count, 2); assert.deepEqual(items, before);
  for (const item of report.rows) { assert.equal(Math.round((Object.values(item.styleMeters).reduce((a, b) => a + b, 0) + item.unclassifiedMeters) * 1000), Math.round(item.quantity * 1000)); for (const key of ['receipts', 'production', 'price', 'idAdmin']) assert.equal(item[key], undefined); }
});
test('available stock is the default and including registered zero balances changes counts without inventing stock or changing totals', () => {
  const items = [row(1, { quantity: 0, styleMeters: { single: 7 } }), row(2)], available = buildSfifaInventoryReport(items), all = buildSfifaInventoryReport(items, { includeUnavailable: true });
  assert.deepEqual(available.rows.map(item => item.code), [2]); assert.deepEqual(all.rows.map(item => item.code), [1, 2]); assert.equal(all.unavailableCount, 1); assert.equal(all.availableCount, 1); assert.deepEqual(all.totals, available.totals); assert.ok(Object.values(all.rows[0].styleMeters).every(value => value === 0));
  assert.equal(buildSfifaInventoryReport([items[0]]).count, 0); assert.equal(buildSfifaInventoryReport([], { includeUnavailable: true }).count, 0);
});
test('rows retain corrected width/family identities, numeric order and explicit legacy unknown types', () => {
  const report = buildSfifaInventoryReport([row(30), row(2), row(1, { family: '8080-8097', code: 8080 }), row(4, { family: '1426-1432', code: 1426 }), row(9, { width: 'thick', code: null, isUnassigned: true, styleMeters: undefined })]);
  assert.deepEqual(report.rows.map(item => item.code), [2, 30, 1426, 8080, null]); assert.equal(report.rows.at(-1).unclassifiedMeters, .6); assert.equal(report.rows.at(-1).isUnassigned, true);
});
test('invalid snapshots cannot silently become misleading zero balances', () => {
  for (const quantity of [NaN, -1, 'bad', '.1234', Infinity]) assert.throws(() => buildSfifaInventoryReport([row(1, { quantity })]));
  assert.throws(() => buildSfifaInventoryReport([row(1, { width: 'bad' })])); assert.throws(() => buildSfifaInventoryReport([], { includeUnavailable: 'yes' }));
});

let server, base; const original = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = 'isolated-sfifa-report'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
async function request(query = '', actor = { id: owner, role: 'admin' }) {
  const response = await fetch(base + '/sfifa-stock/report' + query, { headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) } }); return { status: response.status, data: await response.json() };
}
function fixture(t) {
  const f = workerMaterialsFixture(t); f.sfifa.variants[0].styleMeters = { single: 10, double: 6, gradient: 4 }; f.sfifa.variants.push({ code: 13, quantity: 0, styleMeters: { single: 0, double: 0, gradient: 0 } });
  const wide = f.seedSfifa({ quantity: 7.5, width: 'thick' }); wide.family = '8080-8097'; wide.variants[0].code = 8080; wide.variants[0].styleMeters = { single: 1.5, double: 2.5, gradient: 3.5 };
  f.seedSfifa({ quantity: 500, idAdmin: otherOwner }); return f;
}
test('the authenticated full report is owner scoped, current, complete and read only', async t => {
  const f = fixture(t), before = JSON.stringify(f.stocks); let result = await request(); assert.equal(result.status, 200); assert.ok(!Number.isNaN(Date.parse(result.data.issuedAt)));
  assert.equal(result.data.report.count, 2); assert.equal(result.data.report.totals.quantity, 27.5); assert.equal(result.data.report.hasUnclassified, false); assert.deepEqual(result.data.report.rows.map(item => item.code), [12, 8080]); assert.equal(JSON.stringify(f.stocks), before);
  result = await request('?includeUnavailable=1'); assert.equal(result.status, 200); assert.equal(result.data.report.count, 3); assert.equal(result.data.report.unavailableCount, 1);
  f.stocks[0].quantity = 17.875; f.stocks[0].variants[0].quantity = 17.875; f.stocks[0].variants[0].styleMeters.single = 7.875;
  result = await request(); assert.equal(result.data.report.totals.quantity, 25.375); assert.equal(result.data.report.rows[0].styleMeters.single, 7.875);
  for (const key of ['receipts', 'production', 'workerMaterialDebits', 'tailoringStockOperations', 'idAdmin']) assert.equal(result.data.report.rows[0][key], undefined);
});
test('legacy stock without a color type is explicitly unclassified and exhausted variants remain optional', async t => {
  const f = fixture(t); f.seedSfifa({ quantity: 1.125, legacy: true }); const result = await request(); assert.equal(result.status, 200); const legacy = result.data.report.rows.find(item => item.isUnassigned); assert.equal(legacy.quantity, 1.125); assert.equal(legacy.unclassifiedMeters, 1.125); assert.deepEqual(legacy.styleMeters, { single: 0, double: 0, gradient: 0 });
});
test('export uses its own current employee grant and rejects disabled accounts or forged token permissions', async t => {
  const f = fixture(t), actor = { id: employee, role: 'Employe', idAdmin: otherOwner, operationPermissions: { sfifa: ['download'] } }; f.staff.moduleAccess = ['sfifa']; f.staff.operationPermissions = { sfifa: ['details', 'labels'] };
  assert.equal((await request('', actor)).status, 403); assert.equal(employeeCanRequest(f.staff, 'GET', '/sfifa-stock/report'), false);
  f.staff.operationPermissions.sfifa = ['download']; assert.equal((await request('', actor)).status, 200); assert.equal(employeeCanRequest(f.staff, 'GET', '/sfifa-stock/report?includeUnavailable=1'), true); assert.equal(canEmployeeOperation('Employe', f.staff, 'sfifa', 'download'), true);
  assert.deepEqual(validateEmployeePermissions({ moduleAccess: ['sfifa'], operationPermissions: { sfifa: ['download'] } }).operationPermissions.sfifa, ['download']);
  f.staff.isActive = false; assert.equal((await request('', actor)).status, 403);
});
test('report options are explicit and invalid queries never change inventory', async t => {
  const f = fixture(t), before = JSON.stringify(f.stocks);
  for (const value of ['yes', 'true', '-1', '2', '']) { const result = await request('?includeUnavailable=' + value); assert.equal(result.status, 400); assert.equal(result.data.message, 'invalidReportOptions'); }
  assert.equal(JSON.stringify(f.stocks), before);
});
