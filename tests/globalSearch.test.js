import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import { globalSearchFixture, searchOwner, searchOther, searchEmployee } from './helpers/globalSearchFixture.js';
import { searchApplication, searchRegex } from '../BackEnd/utils/globalSearch.js';
import { searchText, searchPages, allowedSearchGroups } from '../shared/globalSearch.js';
import { employeeCanRequest } from '../shared/employeePermissions.js';
import { shopPieceBarcode } from '../shared/workerShopFlow.js';
import { tailoringOrderBarcode } from '../shared/tailoringBarcode.js';
import { sfifaStockBarcode } from '../shared/sfifaStock.js';
import { generatedProductBatchBarcode } from '../shared/productBarcodes.js';
process.env.JWT_SECRET = 'isolated-global-search-tests';
let server, origin;
before(async () => { const { default: app } = await import('../BackEnd/app.js'); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = 'http://127.0.0.1:' + server.address().port; });
after(async () => { await new Promise(resolve => server.close(resolve)); });
const run = (query, patch = {}) => searchApplication({ owner: searchOwner, actorId: searchOwner, role: 'admin', query, ...patch });
const group = (result, key) => result.groups.find(entry => entry.key === key);
async function request(path, role = 'admin', id = searchOwner) {
  const response = await fetch(origin + path, { headers: role ? { Authorization: 'Bearer ' + jwt.sign({ id, role }, process.env.JWT_SECRET) } : {} });
  return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
}

test('searches all data groups using bounded owner-scoped reads and safe public summaries', async t => {
  const f = globalSearchFixture(t), result = await run('نور');
  for (const key of ['products', 'fabrics', 'tailoring', 'workers', 'work', 'credit', 'employees', 'clients', 'categories', 'suppliers', 'expenses', 'invoices']) assert.ok(group(result, key).items.length > 0, key);
  for (const call of f.calls) {
    if (call.scope) { assert.equal(String(call.scope.idAdmin || call.scope.idUser), searchOwner); assert.ok(call.limit <= 14); assert.equal(call.timeout, 3000); }
    if (call.pipeline) { assert.ok(call.pipeline[0].$match); assert.equal(call.options.maxTimeMS, 3000); }
  }
  assert.doesNotMatch(JSON.stringify(result), /secret-password|never-return|prix_achat|payments|password/);
  assert.ok(result.groups.every(entry => !entry.error));
});
test('does not expose records owned by another shop', async t => {
  const f = globalSearchFixture(t);
  for (const [Model, rows] of f.rows) for (const row of [...rows]) f.seed(Model, { ...row, _id: '8' + row._id.slice(1), idAdmin: searchOther, idUser: searchOther });
  const result = await run('نور');
  assert.ok(result.groups.flatMap(entry => entry.items).every(entry => !entry.id.startsWith('8')));
});
test('employee search queries only visible modules and immediately follows live permission changes', async t => {
  const f = globalSearchFixture(t); let result = await request('/search?q=' + encodeURIComponent('نور'), 'Employe', searchEmployee);
  assert.equal(result.status, 200); assert.deepEqual(result.data.availableGroups, ['products']); assert.deepEqual(result.data.groups.map(entry => entry.key), ['products']);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].model, 'Products');
  f.employee.moduleAccess = ['credit']; f.calls.length = 0;
  result = await request('/search?q=' + encodeURIComponent('نور'), 'Employe', searchEmployee);
  assert.deepEqual(result.data.availableGroups, ['credit']); assert.ok(group(result.data, 'credit').items[0].path.includes('/UserCridit?'));
  result = await request('/search?q=' + encodeURIComponent('نور') + '&group=employees', 'Employe', searchEmployee);
  assert.deepEqual(result.data.groups, []);
  f.employee.isActive = false; assert.equal((await request('/search?q=test', 'Employe', searchEmployee)).status, 403);
});
test('authentication, query validation, literal patterns and no-store responses', async t => {
  globalSearchFixture(t);
  assert.equal((await request('/search?q=test', null)).status, 401);
  for (const suffix of ['', '?q=a', '?q[x]=test', '?q=a&q=b', '?q=' + 'a'.repeat(121), '?q=test&group=unknown', '?q=test&group[]=products', '?q=%00test']) assert.equal((await request('/search' + suffix)).status, 400, suffix);
  const result = await request('/search?q=' + encodeURIComponent('.*')); assert.equal(result.status, 200); assert.equal(result.cache, 'no-store'); assert.equal(result.data.groups.flatMap(entry => entry.items).length, 0);
  assert.equal(employeeCanRequest({ moduleAccess: [] }, 'GET', '/search'), true); assert.equal(employeeCanRequest({}, 'POST', '/search'), false);
});
test('normalizes Arabic spelling, diacritics, Arabic numerals, Latin accents and formatted phones', async t => {
  const f = globalSearchFixture(t); f.product.name = 'إبْرَة Café';
  assert.equal(searchText('إِبْرَة ٠١'), 'ابره 01');
  assert.equal(group(await run('ابرة cafe'), 'products').items.length, 1);
  assert.equal(group(await run('٠٦١٢٣٤٥٦٧٨'), 'tailoring').items[0].id, f.order._id);
  for (const literal of ['.*', '[a-z]', '(a+)+', '$where', 'a|b', '\\']) { assert.equal(searchRegex(literal).test(literal), true); assert.equal(searchRegex(literal).test('anything'), false); }
});
test('matches garment and worker section keywords, including multiple keywords across fields', async t => {
  const f = globalSearchFixture(t);
  assert.equal(group(await run('جلابة نور'), 'tailoring').items[0].id, f.order._id);
  assert.equal(group(await run('آلة نور'), 'workers').items[0].id, f.worker._id);
  assert.equal(group(await run('الماء'), 'expenses').items[0].titleKey, 'sideExpenses.types.water');
});
test('product receipt barcodes return the exact batch balance, including deterministic legacy codes', async t => {
  const f = globalSearchFixture(t), barcode = generatedProductBatchBarcode(f.product, 2), found = group(await run(barcode), 'products').items;
  assert.equal(found.length, 1); assert.equal(found[0].barcode, barcode); assert.equal(found[0].facts.find(entry => entry.label === 'batchQuantity').value, 3);
  assert.equal(group(await run(generatedProductBatchBarcode(f.product, 7)), 'products').items.length, 0);
  delete f.product.stockBatches; f.product.barcode = '';
  assert.equal(group(await run(generatedProductBatchBarcode(f.product, 1)), 'products').items[0].id, f.product._id);
});
test('fabric barcode identifies only that coupon and carries its color and meter balance to navigation', async t => {
  const f = globalSearchFixture(t), found = group(await run('2345678901234'), 'fabrics').items;
  assert.equal(found.length, 1); assert.equal(found[0].facts.find(entry => entry.label === 'meters').value, 47); assert.equal(found[0].barcode, '2345678901234');
  assert.equal(new URL(found[0].path, 'http://test').searchParams.get('piece'), '2345678901234'); assert.equal(new URL(found[0].path, 'http://test').searchParams.get('record'), f.fabric._id);
});
test('tailoring and sfifa stable barcode searches work for existing records', async t => {
  const f = globalSearchFixture(t);
  assert.equal(group(await run(tailoringOrderBarcode(f.order)), 'tailoring').items[0].id, f.order._id);
  const barcode = sfifaStockBarcode(f.stock.variants[1]), found = group(await run(barcode), 'sfifa').items;
  assert.equal(found.length, 1); assert.equal(found[0].barcode, barcode); assert.equal(found[0].facts.find(entry => entry.label === 'meters').value, 8);
  assert.equal(group(await run('01'), 'sfifa').items.length, 1);
});
test('individual garment barcode finds its original job and subsequent stages without renumbering', async t => {
  const f = globalSearchFixture(t); f.seed(f.models.WorkerWork, { ...f.work, _id: '710000000000000000000001', category: 'finishing', shopFlow: { originId: f.work._id } });
  const code = shopPieceBarcode(f.work, 2), found = group(await run(code), 'work').items;
  assert.equal(found.length, 2); assert.ok(found.every(row => row.barcode === code && row.facts.some(entry => entry.label === 'piece' && entry.value === 2)));
  assert.equal(group(await run(code.slice(0, -3) + '003'), 'work').items.length, 0);
});
test('customer-owned debts are searchable by purchased product as well as customer name', async t => {
  const f = globalSearchFixture(t), result = await run('زربية');
  assert.equal(group(result, 'credit').items[0].id, f.credit._id); assert.equal(group(result, 'credit').items[0].facts.find(entry => entry.label === 'remaining').value, 75);
});
test('sfifa jobs embedded in stock appear under work search without exposing stock receipts', async t => {
  const f = globalSearchFixture(t); f.stock.production.push({ _id: '720000000000000000000001', idAdmin: f.oid(searchOwner), workerId: f.worker._id, productName: 'سفيفة نور', category: 'sfifa', workType: 'client', quantity: 12, completedQuantity: 4 });
  const found = group(await run('نور'), 'work').items;
  assert.equal(found.length, 2); assert.ok(found.some(row => row.path.includes('/sfifa/workers/')));
});
test('invoice search includes old dates, while employees see only their own documents', async t => {
  const f = globalSearchFixture(t);
  const all = group(await run('نور'), 'invoices').items; assert.equal(all.length, 3);
  f.employee.moduleAccess = ['invoices'];
  const own = await request('/search?q=' + encodeURIComponent('نور') + '&group=invoices', 'Employe', searchEmployee);
  assert.equal(own.status, 200); assert.equal(group(own.data, 'invoices').items.length, 2); assert.ok(group(own.data, 'invoices').items.every(row => row.facts.find(entry => entry.label === 'employee').value === f.employee.name));
});
test('group limits indicate more results and failures remain visible without discarding other groups', async t => {
  const f = globalSearchFixture(t); for (let i = 0; i < 30; i++) f.seed(f.models.Product, { name: 'نور ' + i, quantite: i });
  let result = await run('نور'); assert.equal(group(result, 'products').items.length, 6); assert.equal(group(result, 'products').hasMore, true);
  result = await run('نور', { group: 'products', limit: 24 }); assert.equal(group(result, 'products').items.length, 24); assert.equal(result.groups.length, 1);
  f.failures.add(f.models.Product); result = await run('نور'); assert.equal(group(result, 'products').error, true); assert.ok(group(result, 'workers').items.length);
});
test('navigation search includes permissions, both languages and only accessible destinations', () => {
  assert.ok(searchPages('صلاحيات', 'admin', {}).some(row => row.path.includes('/employees/')));
  assert.ok(searchPages('permissions', 'admin', {}).some(row => row.path.includes('/employees/')));
  assert.ok(searchPages('سراويل', 'admin', {}).some(row => row.path.includes('garment=trousers')));
  assert.equal(searchPages('صلاحيات', 'Employe', { moduleAccess: ['products'] }).length, 0);
  assert.deepEqual(allowedSearchGroups('Employe', { moduleAccess: [] }), []);
});
