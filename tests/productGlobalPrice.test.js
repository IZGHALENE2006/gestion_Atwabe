import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import { productBatches, receivedProductBatches, stockRetailValue, stockPriceRange } from '../shared/productBatches.js';
import { creditCheckoutFixture, owner, productIds } from './helpers/creditCheckoutFixture.js';
let server, base; const secret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = 'isolated-unified-price-tests'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; });
const request = async (route, body, method = 'POST') => { const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ id: owner, idAdmin: owner, role: 'admin' }, process.env.JWT_SECRET) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, data: await response.json() }; };
const restock = patch => ({ requestId: randomUUID(), quantite: 10, prix_achat: 12, prix_vente_base: 20, prix_gros_base: 18, frais_total: 20, ...patch });
const add = input => request('/Product/' + productIds[0] + '/restocks', input);
function fixture(t) { const f = creditCheckoutFixture(t); Object.assign(f.products()[0], { quantite: 10, prix_achat: 5, prix_vente: 10, prix_gros: 8, frais_total: 10, frais_quantite: 10, frais_unitaire: 1 }); return f; }
const sale = (f, route, cart, paid) => ({ requestId: randomUUID(), cart, amountPaid: paid ?? (route.endsWith('/credit') ? 0 : 200), customerId: String(f.customer._id) });

test('existing multi-price products expose the current common price without rewriting receipt history or stock', async t => {
  const f = fixture(t), input = restock(); await add(input);
  f.products()[0].prix_vente = 10; f.products()[0].prix_gros = 8;
  const before = f.products()[0].toObject();
  const result = await request('/Product/Get', undefined, 'GET'); assert.equal(result.status, 200);
  const product = result.data.find(row => row._id === productIds[0]);
  assert.equal(product.prix_vente, 22); assert.equal(product.prix_gros, 20);
  assert.deepEqual(product.stockBatches.map(row => row.prix_achat), [5, 12]);
  assert.deepEqual(f.products()[0].toObject(), before);
});

test('restocking applies its final retail and wholesale prices globally but preserves receipt costs, fees and quantities', async t => {
  const f = fixture(t), input = restock(), result = await add(input); assert.equal(result.status, 201);
  const product = f.products()[0], before = product.toObject();
  assert.equal(product.prix_vente, 22); assert.equal(product.prix_gros, 20); assert.equal(product.quantite, 20);
  assert.deepEqual(productBatches(product).map(batch => [batch.prix_vente, batch.prix_gros, batch.prix_achat, batch.frais_unitaire, batch.quantite]), [[22, 20, 5, 1, 10], [22, 20, 12, 2, 10]]);
  assert.deepEqual(receivedProductBatches(product).map(batch => batch.prix_vente), [10, 22]); assert.deepEqual(product.toObject(), before);
  assert.equal(stockRetailValue(product), 440); assert.deepEqual(stockPriceRange(product), { min: 22, max: 22 });
  assert.equal((await add(input)).status, 200); assert.equal(f.products()[0].quantite, 20);
  const later = restock({ prix_vente_base: 30, prix_gros_base: 25, frais_total: 0 }); assert.equal((await add(later)).status, 201);
  assert.equal((await add(input)).status, 200); assert.equal(f.products()[0].prix_vente, 30, 'retrying an old receipt must not restore its price');
});

for (const route of ['/addVentes', '/addVentes/credit']) test(route + ' charges the latest price for old and new stock and uses their distinct purchase costs and fees', async t => {
  const f = fixture(t), input = restock(); assert.equal((await add(input)).status, 201);
  const result = await request(route, sale(f, route, [{ id: productIds[0], batchId: 'initial', qty: 2, price: 0.01 }, { id: productIds[0], batchId: input.requestId, qty: 3, price: 0.01 }]));
  assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.facture.TotalPrix, 110);
  assert.deepEqual(result.data.facture.Product.map(row => row.price), [22, 22]); assert.deepEqual(result.data.lastVentes.map(row => row.profite), [32, 24]);
  assert.deepEqual(productBatches(f.products()[0]).map(row => row.quantite), [8, 7]);
  assert.deepEqual(receivedProductBatches(f.products()[0]).map(row => row.prix_vente), [10, 22], 'stock debits preserve original receipt data');
});

for (const route of ['/addVentes', '/addVentes/credit']) test(route + ' rejects an outdated displayed price and invalid expectations before any stock or sale writes', async t => {
  const f = fixture(t), cart = [{ id: productIds[0], batchId: 'initial', qty: 1, expectedUnitPrice: 10 }];
  await add(restock());
  assert.equal((await request(route, sale(f, route, cart))).status, 409);
  for (const expectedUnitPrice of [null, {}, true, -1, '', 'invalid', 1000000001]) {
    assert.equal((await request(route, sale(f, route, [{ ...cart[0], expectedUnitPrice }]))).status, 400);
  }
  assert.equal(f.products()[0].quantite, 20); assert.equal(f.actor().Facture.length, 0); assert.equal(f.account().Total, 300);
  const result = await request(route, sale(f, route, [{ ...cart[0], expectedUnitPrice: 22, price: 0.01 }]));
  assert.equal(result.status, 201); assert.equal(result.data.facture.TotalPrix, 22); assert.equal(result.data.lastVentes[0].profite, 16);
  assert.equal(f.products()[0].quantite, 19);
});

test('the latest selling price remains in force after selling out the newest batch', async t => {
  const f = fixture(t), input = restock(); await add(input);
  assert.equal((await request('/addVentes', sale(f, '/addVentes', [{ id: productIds[0], batchId: input.requestId, qty: 10 }], 220))).status, 201);
  assert.deepEqual(productBatches(f.products()[0]).map(row => row.quantite), [10, 0]); assert.deepEqual(stockPriceRange(f.products()[0]), { min: 22, max: 22 });
  const old = await request('/addVentes', sale(f, '/addVentes', [{ id: productIds[0], batchId: 'initial', qty: 1 }])); assert.equal(old.data.facture.TotalPrix, 22); assert.equal(old.data.lastVentes[0].profite, 16);
});

test('clearing wholesale on the latest restock disables it globally while zero remains a valid common wholesale price', async t => {
  const f = fixture(t); await add(restock({ prix_gros_base: '' })); assert.ok(productBatches(f.products()[0]).every(row => row.prix_gros === null));
  for (const route of ['/addVentes', '/addVentes/credit']) assert.equal((await request(route, sale(f, route, [{ id: productIds[0], batchId: 'initial', qty: 1, priceType: 'wholesale' }]))).status, 400);
  await add(restock({ prix_gros_base: 0, frais_total: 0 })); assert.ok(productBatches(f.products()[0]).every(row => row.prix_gros === 0));
  assert.equal(f.products()[0].quantite, 30);
});

for (const route of ['/addVentes', '/addVentes/credit']) test(route + ' completed receipts and profits remain unchanged after a later global price update', async t => {
  const f = fixture(t), body = sale(f, route, [{ id: productIds[0], qty: 1 }]);
  const old = await request(route, body); assert.equal(old.status, 201); assert.equal(old.data.facture.TotalPrix, 10); assert.equal(old.data.lastVentes[0].profite, 4);
  await add(restock()); const replay = await request(route, body); assert.equal(replay.status, 201); assert.deepEqual(replay.data.facture, old.data.facture); assert.deepEqual(replay.data.lastVentes, old.data.lastVentes);
  assert.equal(f.products()[0].quantite, 19); assert.equal(f.products()[0].prix_vente, 22);
});

for (const route of ['/addVentes', '/addVentes/credit']) test(route + ' detects repricing before a pending batch reservation and cancels without deducting stock', async t => {
  const f = fixture(t); await add(restock()); const body = sale(f, route, [{ id: productIds[0], batchId: 'initial', qty: 1 }]);
  f.controls.productBeforeCommit = true; assert.equal((await request(route, body)).status, 503);
  await add(restock({ prix_vente_base: 30 }));
  assert.equal((await request(route, body)).status, 400); assert.equal(f.products()[0].quantite, 30); assert.equal(f.actor().Facture.length, 0); assert.equal(f.account().Total, 300);
});

for (const route of ['/addVentes', '/addVentes/credit']) test(route + ' resumes a committed reservation at its captured price without repeating the debit after repricing', async t => {
  const f = fixture(t); await add(restock()); const body = sale(f, route, [{ id: productIds[0], batchId: 'initial', qty: 1 }]);
  f.controls.stockAfterCommit = true; assert.equal((await request(route, body)).status, 503);
  await add(restock({ prix_vente_base: 30 })); const result = await request(route, body); assert.equal(result.status, 201); assert.equal(result.data.facture.TotalPrix, 22); assert.equal(result.data.lastVentes[0].profite, 16);
  assert.equal(f.products()[0].quantite, 29); assert.equal(f.products()[0].prix_vente, 32); assert.deepEqual(productBatches(f.products()[0]).map(row => row.quantite), [9, 10, 10]);
});
