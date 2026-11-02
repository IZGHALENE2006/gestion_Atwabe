import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import Product from '../BackEnd/models/productModel.js';
import Admin from '../BackEnd/models/AdminModel.js';
import Employee from '../BackEnd/models/EmployeModele.js';
import CashCheckout from '../BackEnd/models/CashCheckout.js';
import Category from '../BackEnd/models/Category.js';
import SalesDocument from '../BackEnd/models/SalesDocument.js';
import mongoose from '../BackEnd/node_modules/mongoose/index.js';
import { addSalesDocument } from '../BackEnd/controlles/SalesDocuments.js';
import { productBatches, stockRetailValue, stockPriceRange } from '../shared/productBatches.js';
import { creditDocument } from '../shared/creditDocuments.js';
import { creditCheckoutFixture, owner, otherOwner, employeeId, productIds } from './helpers/creditCheckoutFixture.js';
import { memoryQuery } from './helpers/modelMemory.js';
let server, base;
const previousSecret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = 'product-batches-isolated-test'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const actor = { id: owner, idAdmin: owner, role: 'admin' };
const employee = { id: employeeId, idAdmin: owner, role: 'Employe' };
const headers = identity => ({ 'Content-Type': 'application/json', ...(identity ? { Authorization: 'Bearer ' + jwt.sign(identity, process.env.JWT_SECRET) } : {}) });
async function request(route, body, identity = actor, method = 'POST') { const response = await fetch(base + route, { method, headers: headers(identity), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, data: await response.json() }; }
const restockBody = patch => ({ requestId: randomUUID(), quantite: 10, prix_achat: 9, prix_vente_base: 13, prix_gros_base: 11, fournisseur: 'مورّد جديد', note: 'الدفعة الجديدة', ...patch });
const restock = (body, identity = actor, id = productIds[0]) => request('/Product/' + id + '/restocks', body, identity);
function fixture(t) { const f = creditCheckoutFixture(t), p = f.products()[0]; Object.assign(p, { name: 'منتج X', quantite: 20, prix_achat: 6, prix_vente: 10, prix_gros: 8, datecreate: new Date('2026-10-01T10:00:00Z'), fournisseur: 'المورّد الأول' }); return f; }
async function withBatches(t, patch) { const f = fixture(t), body = restockBody(patch), response = await restock(body); assert.equal(response.status, 201, JSON.stringify(response.data)); return { f, batchId: body.requestId, response, body }; }
const saleBody = (batchId, patch = {}) => ({ requestId: randomUUID(), amountPaid: 100, cart: [{ id: productIds[0], batchId: 'initial', qty: 2, price: 0.01 }, { id: productIds[0], batchId, qty: 3, price: 0.01 }], ...patch });
const quantities = f => productBatches(f.products()[0]).map(batch => batch.quantite);
const assertInvariant = f => { for (const product of f.products()) { assert.equal(productBatches(product).reduce((sum, batch) => sum + batch.quantite, 0), product.quantite); assert.ok(productBatches(product).every(batch => Number.isSafeInteger(batch.quantite) && batch.quantite >= 0)); } };

test('new restock price applies to all stock while receipt purchase costs and dated quantities remain independent', async t => {
  const { f, response } = await withBatches(t), p = f.products()[0];
  assert.equal(response.data.quantite, 30); assert.equal(f.products().length, 2); assert.deepEqual(quantities(f), [20, 10]);
  assert.deepEqual(p.stockBatches.map(batch => batch.prix_vente), [10, 13]); assert.deepEqual(p.stockBatches.map(batch => batch.prix_achat), [6, 9]);
  assert.equal(p.prix_vente, 13); assert.equal(stockRetailValue(p), 390); assert.deepEqual(stockPriceRange(p), { min: 13, max: 13 });
  assert.equal(p.stockBatches[0].receivedAt.toISOString(), '2026-10-01T10:00:00.000Z'); assert.ok(p.stockBatches[1].receivedAt instanceof Date);
  assert.equal(p.stockBatches[1].createdByName, 'صاحب المحل'); assert.equal(String(p.stockBatches[1].createdBy), owner); assert.equal(p.stockBatches[1].initialQuantity, 10); assertInvariant(f);
});
test('duplicate concurrent restocks and an ambiguous committed response preserve one addition and reject changed retries', async t => {
  const f = fixture(t), body = restockBody(); f.controls.restockAfterCommit = true;
  assert.equal((await restock(body)).status, 500);
  const responses = await Promise.all([restock(body), restock(body), restock(body)]); assert.ok(responses.every(response => response.status === 200));
  assert.deepEqual(quantities(f), [20, 10]); assert.equal(f.products()[0].quantite, 30);
  assert.equal((await restock({ ...body, quantite: 11 })).status, 409); assert.deepEqual(quantities(f), [20, 10]); assertInvariant(f);
});
test('invalid additions, foreign products and unauthorized actors never alter quantities or batches', async t => {
  const f = fixture(t);
  for (const patch of [{ quantite: 0 }, { quantite: -1 }, { quantite: 1.5 }, { quantite: true }, { quantite: 'bad' }, { prix_achat: -1 }, { prix_achat: true }, { prix_vente_base: '' }, { prix_gros_base: -1 }, { frais_total: -1 }, { requestId: 'bad' }, { note: {} }]) assert.equal((await restock(restockBody(patch))).status, 400, JSON.stringify(patch));
  assert.equal((await restock(restockBody(), employee)).status, 403); assert.equal((await restock(restockBody(), null)).status, 401);
  assert.equal((await restock(restockBody(), { id: otherOwner, idAdmin: otherOwner, role: 'admin' })).status, 404);
  assert.equal(f.products()[0].quantite, 20); assert.equal(f.products()[0].stockBatches, undefined); assertInvariant(f);
});
for (const identity of [actor, employee]) test(identity.role + ' cash sale selects two lots of one product and calculates exact prices, stock and profit', async t => {
  const { f, batchId } = await withBatches(t), body = saleBody(batchId), result = await request('/addVentes', body, identity);
  assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.facture.TotalPrix, 65); assert.equal(result.data.facture.PrixReture, 35);
  assert.deepEqual(result.data.facture.Product.map(line => [line.batchNumber, line.price, line.quantite]), [[1, 13, 2], [2, 13, 3]]); assert.deepEqual(result.data.lastVentes.map(line => line.profite), [14, 12]); assert.deepEqual(result.data.lastVentes.map(line => line.saleAmount), [26, 39]);
  assert.deepEqual(quantities(f), [18, 7]); assert.equal(f.products()[0].quantite, 25); assert.equal(result.data.facture.nameEmp, identity.role === 'admin' ? 'صاحب المحل' : 'خديجة');
  const seller = f.rows(identity.role === 'admin' ? Admin : Employee).find(row => String(row._id) === identity.id), reloaded = new (identity.role === 'admin' ? Admin : Employee)(seller.toObject());
  assert.equal(reloaded.Facture[0].Product[1].batchId, batchId); assert.equal(reloaded.ventes[1].batchNumber, 2);
  assert.equal((await request('/addVentes', body, identity)).status, 201); assert.equal(f.rows(CashCheckout).length, 1); assert.deepEqual(quantities(f), [18, 7]); assertInvariant(f);
});
for (const identity of [actor, employee]) test(identity.role + ' credit sale uses selected batch costs and retains lot details on the credit invoice', async t => {
  const { f, batchId } = await withBatches(t), result = await request('/addVentes/credit', saleBody(batchId, { customerId: String(f.customer._id), amountPaid: 10 }), identity);
  assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.facture.TotalPrix, 65); assert.equal(result.data.facture.remainingAmount, 55);
  assert.deepEqual(result.data.lastVentes.map(line => line.profite), [14, 12]); assert.deepEqual(quantities(f), [18, 7]);
  const document = creditDocument(result.data.creditUser, result.data.document); assert.deepEqual(document.lines.map(line => [line.batchNumber, line.prix]), [[1, 13], [2, 13]]); assertInvariant(f);
});
test('exhausting one lot never falls back to a differently priced lot even with enough total stock', async t => {
  const { f, batchId } = await withBatches(t);
  for (const route of ['/addVentes', '/addVentes/credit']) {
    const result = await request(route, saleBody(batchId, { customerId: String(f.customer._id), amountPaid: 0, cart: [{ id: productIds[0], batchId, qty: 11 }] }));
    assert.ok([400, 409].includes(result.status));
  }
  const sold = await request('/addVentes', saleBody(batchId, { amountPaid: 130, cart: [{ id: productIds[0], batchId, qty: 10 }] })); assert.equal(sold.status, 201);
  assert.equal((await request('/addVentes', saleBody(batchId, { cart: [{ id: productIds[0], batchId, qty: 1 }] }))).status, 400); assert.deepEqual(quantities(f), [20, 0]); assert.deepEqual(stockPriceRange(f.products()[0]), { min: 13, max: 13 }); assertInvariant(f);
});
test('missing, unknown or duplicate batch choices are rejected without sales, debt or stock writes', async t => {
  const { f, batchId } = await withBatches(t);
  for (const cart of [[{ id: productIds[0], qty: 1 }], [{ id: productIds[0], batchId: randomUUID(), qty: 1 }], [{ id: productIds[0], batchId: {}, qty: 1 }], [{ id: productIds[0], qty: 1 }, { id: productIds[0], batchId: 'initial', qty: 1 }], [{ id: productIds[0], batchId, qty: 1 }, { id: productIds[0], batchId, qty: 1 }]]) {
    for (const route of ['/addVentes', '/addVentes/credit']) assert.ok([400, 409].includes((await request(route, saleBody(batchId, { cart, customerId: String(f.customer._id), amountPaid: 0 }))).status));
  }
  assert.deepEqual(quantities(f), [20, 10]); assert.equal(f.actor().Facture.length, 0); assert.equal(f.account().Total, 300); assertInvariant(f);
});
test('concurrent sales cannot oversell a lot or consume stock from a different lot', async t => {
  const { f, batchId } = await withBatches(t), make = () => request('/addVentes', saleBody(batchId, { amountPaid: 200, cart: [{ id: productIds[0], batchId, qty: 8 }] }));
  const results = await Promise.all([make(), make()]); assert.deepEqual(results.map(row => row.status).sort(), [201, 400]); assert.deepEqual(quantities(f), [20, 2]); assert.equal(f.actor().Facture.length, 1); assertInvariant(f);
});
test('simultaneous sale and additions retain each quantity and the latest committed selling price', async t => {
  const f = fixture(t), additions = [restockBody(), restockBody({ quantite: 7, prix_vente_base: 15 })];
  const results = await Promise.all([restock(additions[0]), request('/addVentes', { requestId: randomUUID(), amountPaid: 30, cart: [{ id: productIds[0], batchId: 'initial', qty: 3 }] }), restock(additions[1])]);
  assert.equal(results[0].status, 201); assert.equal(results[2].status, 201); assert.ok([201, 400, 409].includes(results[1].status), JSON.stringify(results)); const sold = results[1].status === 201 ? 3 : 0; const p = f.products()[0]; assert.equal(p.quantite, 37 - sold); assert.equal(p.stockBatches.find(batch => batch.batchId === 'initial').quantite, 20 - sold); assert.equal(p.prix_vente, p.stockBatches.at(-1).prix_vente); assert.equal(p.stockBatches.find(batch => batch.batchId === additions[0].requestId).quantite, 10); assert.equal(p.stockBatches.find(batch => batch.batchId === additions[1].requestId).quantite, 7); assertInvariant(f);
});
for (const failure of ['stockAfterCommit', 'actorAfterCommit', 'journalAfterCommit']) test('cash checkout resumes an ambiguous ' + failure + ' without a repeated sale or batch debit', async t => {
  const { f, batchId } = await withBatches(t), body = saleBody(batchId); f.controls[failure] = true;
  assert.equal((await request('/addVentes', body)).status, 503); assert.equal((await request('/addVentes', body)).status, 201);
  assert.deepEqual(quantities(f), [18, 7]); assert.equal(f.actor().Facture.length, 1); assert.equal(f.actor().ventes.length, 2); assertInvariant(f);
});
test('a later stock rejection releases only the original checkout reservations and never creates an invoice', async t => {
  const { f, batchId } = await withBatches(t); f.controls.stockRace = true;
  const body = saleBody(batchId, { amountPaid: 500, cart: [{ id: productIds[0], batchId, qty: 2 }, { id: productIds[1], qty: 1 }] });
  const result = await request('/addVentes', body); assert.equal(result.status, 400); assert.deepEqual(quantities(f), [20, 10]); assert.equal(f.rows(CashCheckout)[0].status, 'cancelled'); assert.equal(f.actor().Facture.length, 0);
  assert.equal((await request('/addVentes', body)).status, 400); assert.deepEqual(quantities(f), [20, 10]); assertInvariant(f);
});
test('general edits preserve batch stock/prices and still allow product information and photo updates', async t => {
  const { f, batchId } = await withBatches(t); t.mock.method(Category, 'findOne', async () => ({ _id: '999999999999999999999999', name: 'ملابس' }));
  const body = { name: 'اسم جديد', barcode: f.products()[0].barcode, categorie: '999999999999999999999999', fournisseur: 'المحل' };
  assert.equal((await request('/Product/Update/' + productIds[0], { ...body, quantite: 99 }, actor, 'PUT')).status, 409);
  assert.equal((await request('/Product/Update/' + productIds[0], { ...body, prix_vente: 100 }, actor, 'PUT')).status, 409);
  const result = await request('/Product/Update/' + productIds[0], body, actor, 'PUT'); assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.name, 'اسم جديد'); assert.deepEqual(quantities(f), [20, 10]); assert.equal(f.products()[0].stockBatches[1].batchId, batchId); assert.equal(f.products()[0].stockBatches[1].prix_vente, 13); assertInvariant(f);
});
test('wholesale sale uses the current common price and each original cost and expense allocation', async t => {
  const { f, batchId } = await withBatches(t, { frais_total: 20, frais_quantite: 9999 });
  assert.equal(f.products()[0].stockBatches[1].frais_unitaire, 2); assert.equal(f.products()[0].stockBatches[1].frais_quantite, 10); assert.equal(f.products()[0].stockBatches[1].prix_vente, 15);
  const result = await request('/addVentes', saleBody(batchId, { cart: [{ id: productIds[0], batchId: 'initial', qty: 1, priceType: 'wholesale' }, { id: productIds[0], batchId, qty: 1, priceType: 'wholesale' }] }));
  assert.equal(result.status, 201); assert.equal(result.data.facture.TotalPrix, 26); assert.deepEqual(result.data.lastVentes.map(line => line.profite), [7, 2]); assertInvariant(f);
});
test('delivery and return stock notes debit and restore the selected lot, preserving transaction boundaries', async t => {
  const { f, batchId } = await withBatches(t), docs = [];
  t.mock.method(SalesDocument, 'findOne', scope => memoryQuery(() => docs.find(row => row.requestId === scope.requestId)));
  t.mock.method(SalesDocument, 'create', async ([value], options) => { assert.equal(options.session, session); const doc = new SalesDocument(value); await doc.validate(); docs.push(doc); return [doc]; });
  const session = { async withTransaction(action) { return action(); }, async endSession() {} }; t.mock.method(mongoose, 'startSession', async () => session);
  async function run(documentType) { const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(data) { this.data = data; return this; } }; await addSalesDocument({ user: actor, body: { requestId: randomUUID(), documentType, documentDate: '2026-10-28', updateStock: true, cart: [{ id: productIds[0], batchId, qty: 3 }] } }, res); return res; }
  const delivery = await run('delivery'); assert.equal(delivery.statusCode, 201, JSON.stringify(delivery.data)); assert.deepEqual(quantities(f), [20, 7]); assert.equal(delivery.data.Product[0].price, 13); assert.equal(delivery.data.Product[0].batchId, batchId);
  const returned = await run('return'); assert.equal(returned.statusCode, 201); assert.deepEqual(quantities(f), [20, 10]); assertInvariant(f);
});

for (const route of ['/addVentes', '/addVentes/credit']) test(route + ' rejects a changed legacy cost before reserving stock and preserves the prepared snapshot', async t => {
  const f = fixture(t), body = { requestId: randomUUID(), customerId: String(f.customer._id), amountPaid: route.endsWith('/credit') ? 0 : 10, cart: [{ id: productIds[0], batchId: 'initial', qty: 1 }] };
  f.controls.productBeforeCommit = true;
  assert.equal((await request(route, body)).status, 503);
  f.products()[0].prix_achat = 8; f.products()[0].__v += 1;
  const result = await request(route, body); assert.equal(result.status, 400, JSON.stringify(result.data));
  assert.equal(f.products()[0].quantite, 20); assert.equal(f.actor().Facture.length, 0); assert.equal(f.account().Total, 300); assertInvariant(f);
});
test('an ambiguous rollback resumes the cancellation and restores every selected batch exactly once', async t => {
  const { f, batchId } = await withBatches(t); f.controls.stockRace = true; f.controls.stockReleaseAfterCommit = true;
  const body = saleBody(batchId, { amountPaid: 500, cart: [{ id: productIds[0], batchId, qty: 2 }, { id: productIds[1], qty: 1 }] });
  assert.equal((await request('/addVentes', body)).status, 503); assert.equal(f.rows(CashCheckout)[0].status, 'cancelling');
  assert.equal((await request('/addVentes', body)).status, 400); assert.equal(f.rows(CashCheckout)[0].status, 'cancelled');
  assert.deepEqual(quantities(f), [20, 10]); assert.equal(f.actor().Facture.length, 0); assertInvariant(f);
});
