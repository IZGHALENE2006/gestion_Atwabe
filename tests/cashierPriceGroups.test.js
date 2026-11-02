import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import { productBatches, batchRowKey } from '../shared/productBatches.js';
import { addCashierBatch, cashierCartRows, cashierBatchChoices, cashierAvailableQuantity, setCashierRowQuantity } from '../shared/cashierBatches.js';
import { creditCheckoutFixture, owner, productIds } from './helpers/creditCheckoutFixture.js';
const batch1 = 'initial', batch2 = '00000000-0000-4000-8000-000000000002', batch3 = '00000000-0000-4000-8000-000000000003';
const product = patch => ({ _id: productIds[0], name: 'منتج X', quantite: 9, stockBatches: [
  { batchId: batch1, number: 1, quantite: 2, initialQuantity: 2, prix_achat: 6, prix_vente: 10, prix_gros: 8, frais_unitaire: 0 },
  { batchId: batch2, number: 2, quantite: 3, initialQuantity: 3, prix_achat: 8, prix_vente: 10, prix_gros: 9, frais_unitaire: 0 },
  { batchId: batch3, number: 3, quantite: 4, initialQuantity: 4, prix_achat: 9, prix_vente: 13, prix_gros: 9, frais_unitaire: 0 },
], ...patch });

test('all old and new batches offer the latest selling price but remain separate choices', () => {
  const p = product(), before = structuredClone(p);
  assert.deepEqual(cashierBatchChoices(p).map(row => [row.batchId, row.price, row.quantite]), [[batch1, 13, 2], [batch2, 13, 3], [batch3, 13, 4]]);
  assert.deepEqual(cashierBatchChoices(p, 'wholesale').map(row => row.price), [9, 9, 9]);
  assert.deepEqual(productBatches(p).map(row => row.prix_achat), [6, 8, 9]); assert.deepEqual(p, before);
});

test('selecting a new batch consumes only that batch without automatically drawing older stock', () => {
  const p = product(), choice = cashierBatchChoices(p)[1], original = [], cart = addCashierBatch(original, p, choice, 3);
  assert.deepEqual(original, []); assert.deepEqual(cart.map(row => [row.batchId, row.qty]), [[batch2, 3]]);
  const rows = cashierCartRows(cart, [p]); assert.equal(rows.length, 1); assert.equal(rows[0].stockMax, 3); assert.equal(cashierAvailableQuantity(p, choice, cart), 0);
  assert.throws(() => addCashierBatch(cart, p, choice), /productBatchStockChanged/);
  assert.throws(() => addCashierBatch([], p, { price: 13, priceType: 'retail' }), /productBatchStockChanged/);
});

test('quantity controls stop at the selected lot and removing it preserves other same-priced batches', () => {
  const p = product(), choices = cashierBatchChoices(p); let cart = addCashierBatch([], p, choices[0]); const key = cashierCartRows(cart)[0].key;
  cart = setCashierRowQuantity(cart, p, key, 2); assert.deepEqual(cart.map(row => row.qty), [2]);
  assert.throws(() => setCashierRowQuantity(cart, p, key, 3), /productBatchStockChanged/);
  cart = addCashierBatch(cart, p, choices[1], 2); assert.equal(cashierCartRows(cart).length, 2);
  cart = setCashierRowQuantity(cart, p, key, 1); assert.deepEqual(cart.map(row => [row.batchId, row.qty]), [[batch1, 1], [batch2, 2]]);
  cart = setCashierRowQuantity(cart, p, key, 0); assert.deepEqual(cart.map(row => [row.batchId, row.qty]), [[batch2, 2]]);
});

test('switching retail and wholesale preserves the selected batch and shares its physical stock', () => {
  const p = product(), retail = cashierBatchChoices(p), wholesale = cashierBatchChoices(p, 'wholesale');
  let cart = addCashierBatch([], p, retail[1], 3); const key = cashierCartRows(cart)[0].key;
  cart = addCashierBatch(cart, p, wholesale[1], 3, key); assert.equal(cart.length, 1); assert.equal(cart[0].price, 9); assert.equal(cart[0].batchId, batch2);
  assert.equal(cashierAvailableQuantity(p, retail[1], cart), 0);
  assert.throws(() => addCashierBatch(cart, p, retail[0], 3), /productBatchStockChanged/); assert.equal(cart[0].qty, 3);
});

test('the same batch can have retail and wholesale rows without exceeding its combined stock', () => {
  const p = product(); let cart = addCashierBatch([], p, cashierBatchChoices(p)[0]); cart = addCashierBatch(cart, p, cashierBatchChoices(p, 'wholesale')[0]);
  assert.equal(cart.length, 2); assert.notEqual(batchRowKey(cart[0]), batchRowKey(cart[1]));
  assert.equal(cashierAvailableQuantity(p, cashierBatchChoices(p, 'wholesale')[0], cart), 0); assert.equal(cashierCartRows(cart, [p])[0].stockMax, 1);
});

test('legacy and zero prices work, and exhausted latest stock never restores an old sale price', () => {
  const legacy = product({ stockBatches: undefined, quantite: 3, prix_achat: 0, prix_vente: 0, prix_gros: 0 }); const choice = cashierBatchChoices(legacy)[0]; assert.equal(choice.price, 0); assert.equal(addCashierBatch([], legacy, choice)[0].batchId, batch1);
  const p = product(); p.stockBatches[2].quantite = 0; assert.deepEqual(cashierBatchChoices(p).map(row => row.price), [13, 13]);
  const other = { ...legacy, _id: productIds[1] }; assert.equal(cashierCartRows(addCashierBatch(addCashierBatch([], legacy, choice), other, cashierBatchChoices(other)[0])).length, 2);
});

let server, base; const previousSecret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = 'isolated-batch-choices-tests'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const request = async (route, body) => { const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ id: owner, idAdmin: owner, role: 'admin' }, process.env.JWT_SECRET) }, body: JSON.stringify(body) }); return { status: response.status, data: await response.json() }; };
for (const route of ['/addVentes', '/addVentes/credit']) test(route + ' uses the common selling price and the exact selected costs and quantities', async t => {
  const f = creditCheckoutFixture(t); Object.assign(f.products()[0], product()); const p = f.products()[0], choices = cashierBatchChoices(p);
  const cart = addCashierBatch(addCashierBatch([], p, choices[0], 2), p, choices[1], 2);
  assert.equal(cashierCartRows(cart).length, 2);
  const body = { requestId: randomUUID(), cart, amountPaid: route.endsWith('/credit') ? 0 : 60, customerId: String(f.customer._id) };
  const result = await request(route, body); assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.facture.TotalPrix, 52); assert.deepEqual(result.data.lastVentes.map(line => line.profite), [14, 10]);
  assert.deepEqual(productBatches(f.products()[0]).map(batch => batch.quantite), [0, 1, 4]); assert.equal(f.products()[0].quantite, 5);
  assert.equal((await request(route, body)).status, 201); assert.equal(f.products()[0].quantite, 5); assert.equal(f.actor().Facture.length, 1);
});
for (const route of ['/addVentes', '/addVentes/credit']) test(route + ' validates combined sale modes for the same batch', async t => {
  const f = creditCheckoutFixture(t); Object.assign(f.products()[0], product());
  const make = cart => ({ requestId: randomUUID(), cart, customerId: String(f.customer._id), amountPaid: route.endsWith('/credit') ? 0 : 50 });
  const bad = await request(route, make([{ id: productIds[0], batchId: batch1, priceType: 'retail', qty: 2 }, { id: productIds[0], batchId: batch1, priceType: 'wholesale', qty: 1 }])); assert.ok([400, 409].includes(bad.status)); assert.equal(f.products()[0].quantite, 9);
  const result = await request(route, make([{ id: productIds[0], batchId: batch1, priceType: 'retail', qty: 1 }, { id: productIds[0], batchId: batch1, priceType: 'wholesale', qty: 1 }])); assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.facture.TotalPrix, 22); assert.deepEqual(result.data.lastVentes.map(line => line.profite), [7, 3]); assert.deepEqual(productBatches(f.products()[0]).map(batch => batch.quantite), [0, 3, 4]);
});
