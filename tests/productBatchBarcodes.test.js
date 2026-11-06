import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import JsBarcode from "jsbarcode";
import app from "../BackEnd/app.js";
import Product from "../BackEnd/models/productModel.js";
import Category from "../BackEnd/models/Category.js";
import { creditCheckoutFixture, owner, otherOwner, employeeId, productIds } from "./helpers/creditCheckoutFixture.js";
import { generatedProductBatchBarcode, isProductBatchBarcode } from "../shared/productBarcodes.js";
import { productBatches, receivedProductBatches } from "../shared/productBatches.js";
import { addCashierBatch, cashierBatchChoices, cashierBarcodeMatches } from "../shared/cashierBatches.js";

let server, base;
const oldSecret = process.env.JWT_SECRET, actor = { id: owner, idAdmin: owner, role: "admin" };
before(async () => { process.env.JWT_SECRET = "isolated-batch-barcode-tests"; server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
async function request(route, body, identity = actor, method = body ? "POST" : "GET") {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(identity ? { Authorization: "Bearer " + jwt.sign(identity, process.env.JWT_SECRET) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
function fixture(t) {
  const f = creditCheckoutFixture(t), product = f.products()[0];
  Object.assign(product, { name: "منتج بالدفعات", quantite: 20, prix_achat: 6, prix_vente: 10, prix_gros: 8, barcode: "0001234567890" });
  t.mock.method(Category, "findOne", async () => ({ _id: "999999999999999999999999", name: "ملابس" }));
  return f;
}
const addition = patch => ({ requestId: randomUUID(), quantite: 10, prix_achat: 9, prix_vente_base: 30, prix_gros_base: 25, ...patch });
const restock = input => request(`/Product/${productIds[0]}/restocks`, input);

test("batch barcodes retain the full product identity, remain distinct and encode as CODE128", () => {
  const codes = new Set();
  for (const id of ["000000000000000000000001", productIds[0], productIds[1], "ffffffffffffffffffffffff"]) {
    for (const number of [1, 2, 10, 1000]) {
      const code = generatedProductBatchBarcode({ _id: id }, number);
      assert.equal(isProductBatchBarcode(code), true); assert.equal(code.length, 34); assert.equal(codes.has(code), false); codes.add(code);
      const target = {}; JsBarcode(target, code, { format: "CODE128" }); assert.ok(target.encodings.length > 0);
      assert.equal(generatedProductBatchBarcode({ _id: id }, number), code);
    }
  }
});

test("new receipts persist independent server-generated codes and retries keep exactly the same code", async t => {
  const f = fixture(t), input = addition({ barcode: "forged" }); f.controls.restockAfterCommit = true;
  assert.equal((await restock(input)).status, 500);
  const savedCode = f.products()[0].stockBatches[1].barcode;
  assert.equal(isProductBatchBarcode(savedCode), true); assert.notEqual(savedCode, "forged");
  const retried = await restock(input); assert.equal(retried.status, 200); assert.equal(retried.data.stockBatches[1].barcode, savedCode);
  const product = f.products()[0]; assert.equal(product.stockBatches[0].barcode, "0001234567890");
  assert.deepEqual(product.stockBatches.map(batch => batch.quantite), [20, 10]);
  const next = await restock(addition({ prix_achat: 12 })); assert.equal(next.status, 201);
  assert.equal(new Set(productBatches(next.data).map(batch => batch.barcode)).size, 3);
  assert.deepEqual(productBatches(next.data).map(batch => batch.prix_vente), [30, 30, 30]);
  const reloaded = new Product(f.products()[0].toObject()); assert.equal(reloaded.stockBatches[1].barcode, savedCode);
});

test("legacy lots receive stable codes on read and become stored without modifying quantities or historical costs", async t => {
  const f = fixture(t), p = f.products()[0];
  p.stockBatches = [{ batchId: "initial", number: 1, initialQuantity: 20, quantite: 8, prix_achat: 6, prix_vente: 10 }, { batchId: randomUUID(), number: 2, initialQuantity: 10, quantite: 10, prix_achat: 9, prix_vente: 30 }]; p.quantite = 18;
  const before = productBatches(p), response = await request("/Product/Get"); assert.equal(response.status, 200);
  const shown = response.data.find(row => row._id === productIds[0]); assert.deepEqual(shown.stockBatches.map(batch => batch.barcode), before.map(batch => batch.barcode));
  assert.equal(p.stockBatches[1].barcode, undefined);
  assert.equal((await restock(addition())).status, 201);
  const batches = receivedProductBatches(f.products()[0]); assert.deepEqual(batches.slice(0, 2).map(batch => batch.barcode), before.map(batch => batch.barcode)); assert.deepEqual(batches.map(batch => batch.quantite), [8, 10, 10]); assert.deepEqual(batches.map(batch => batch.prix_achat), [6, 9, 9]);
});

test("changing a product's general barcode preserves old initial labels and prevents reusing that alias on another product", async t => {
  const f = fixture(t), oldCode = f.products()[0].barcode; await restock(addition());
  const updated = await request(`/Product/Update/${productIds[0]}`, { name: "اسم جديد", categorie: "999999999999999999999999", barcode: "NEW-GENERAL-CODE" }, actor, "PUT"); assert.equal(updated.status, 200, JSON.stringify(updated));
  assert.equal(updated.data.stockBatches[0].barcode, oldCode); assert.equal(cashierBarcodeMatches([updated.data], oldCode)[0].batch.batchId, "initial");
  const input = { name: "منتج آخر", quantite: 1, prix_achat: 1, prix_vente: 2, categorie: "999999999999999999999999", barcode: oldCode };
  const duplicate = await request("/Product/Add", input); assert.equal(duplicate.status, 400); assert.equal(duplicate.data.message, "Barcode already exists");
  const reserved = await request("/Product/Add", { ...input, barcode: generatedProductBatchBarcode(f.products()[0], 3) }); assert.equal(reserved.status, 400); assert.equal(reserved.data.message, "productBatchBarcodeReserved");
});

test("exact lookup preserves leading zeros, identifies the original lot, and never merges equal-priced lots", async t => {
  const f = fixture(t); await restock(addition()); await restock(addition());
  const p = f.products()[0], batches = productBatches(p);
  assert.equal(cashierBarcodeMatches([p], "0001234567890")[0].batch.batchId, "initial");
  assert.equal(cashierBarcodeMatches([p], "1234567890").length, 0);
  const match = cashierBarcodeMatches([p], `  ${batches[2].barcode.toLowerCase()}  `); assert.equal(match.length, 1); assert.equal(match[0].batch.batchId, batches[2].batchId);
  const choice = cashierBatchChoices(p).find(row => row.batchId === match[0].batch.batchId), cart = addCashierBatch([], p, choice);
  assert.equal(cart[0].batchId, batches[2].batchId); assert.equal(cart[0].price, 30); assert.equal(cashierBatchChoices(p).length, 3);
});

test("exhausted and ambiguous codes remain explicit instead of falling through to another lot", async t => {
  const f = fixture(t); await restock(addition()); const p = f.products()[0]; p.stockBatches[1].quantite = 0; p.quantite = 20;
  const code = p.stockBatches[1].barcode, match = cashierBarcodeMatches([p], code);
  assert.equal(match.length, 1); assert.equal(match[0].batch.quantite, 0); assert.equal(cashierBatchChoices(p).find(row => row.batchId === match[0].batch.batchId), undefined);
  assert.throws(() => addCashierBatch([], p, { batchId: match[0].batch.batchId, priceType: "retail", price: 30 }), /productBatchStockChanged/);
  const other = { ...p.toObject(), _id: productIds[1] }; assert.equal(cashierBarcodeMatches([p, other], code).length, 2);
});

for (const route of ["/addVentes", "/addVentes/credit"]) test(`${route} deducts only the scanned lot and retains its own cost, barcode and profit`, async t => {
  const f = fixture(t); const added = await restock(addition()), code = added.data.stockBatches[1].barcode;
  const { product, batch } = cashierBarcodeMatches(f.products(), code)[0];
  const body = { requestId: randomUUID(), amountPaid: route.endsWith("credit") ? 0 : 60, customerId: String(f.customer._id), cart: [{ id: String(product._id), batchId: batch.batchId, priceType: "retail", expectedUnitPrice: 30, qty: 2, barcode: "forged" }] };
  const sold = await request(route, body); assert.equal(sold.status, 201, JSON.stringify(sold));
  assert.equal(sold.data.facture.Product[0].batchId, batch.batchId); assert.equal(sold.data.facture.Product[0].code, code); assert.equal(sold.data.lastVentes[0].profite, 42);
  assert.deepEqual(productBatches(f.products()[0]).map(row => row.quantite), [20, 8]);
  assert.equal((await request(route, body)).status, 201); assert.deepEqual(productBatches(f.products()[0]).map(row => row.quantite), [20, 8]);
  assert.equal((await request(`/Product/${productIds[0]}/restocks`, addition(), { id: employeeId, role: "Employe", idAdmin: owner })).status, 403);
  assert.equal((await request(`/Product/${productIds[0]}/restocks`, addition(), { id: otherOwner, role: "admin", idAdmin: otherOwner })).status, 404);
});
