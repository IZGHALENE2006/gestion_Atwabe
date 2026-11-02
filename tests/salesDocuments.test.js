import { matches as stockMatches, update as stockUpdate } from './helpers/modelMemory.js';
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "../BackEnd/node_modules/mongoose/index.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import ProductModel from "../BackEnd/models/productModel.js";
import SalesDocument from "../BackEnd/models/SalesDocument.js";
import { addSalesDocument, listSalesDocuments } from "../BackEnd/controlles/SalesDocuments.js";
import { filterSalesDocuments } from "../shared/salesDocuments.js";

const adminId = "111111111111111111111111", employeeId = "222222222222222222222222";
const ids = ["333333333333333333333333", "444444444444444444444444"];
const query = (fn) => ({ select() { return this; }, session() { return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } });
const matches = (doc, scope) => Object.entries(scope).every(([key, value]) => String(doc[key]) === String(value));

function fixture(t, role = "admin") {
  const actor = { _id: role === "admin" ? adminId : employeeId, idAdmin: adminId, name: "Alice", isActive: true, ventes: [], Facture: [] };
  const products = ids.map((_id, i) => ({ _id, idAdmin: adminId, name: `Product ${i}`, barcode: `CODE${i}`, prix_vente: i ? 20 : 40, quantite: 10 }));
  const documents = [];
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
  t.mock.method(AdminModel, "findById", () => query(() => role === "admin" ? actor : null));
  t.mock.method(EmployeModel, "findById", () => query(() => role === "Employe" ? actor : null));
  t.mock.method(ProductModel, "findOne", (scope) => query(() => products.find((product) => matches(product, scope))));
  t.mock.method(SalesDocument, "findOne", (scope) => query(() => documents.find((document) => matches(document, scope))));
  const find = t.mock.method(SalesDocument, "find", (scope) => query(() => documents.filter((document) => matches(document, scope))));
  const create = t.mock.method(SalesDocument, "create", async ([data]) => {
    const document = new SalesDocument(data);
    await document.validate();
    documents.push(document.toObject());
    return [document];
  });
  const update = t.mock.method(ProductModel, 'findOneAndUpdate', async (scope, changes, options) => {
    assert.equal(options.session, session, 'Stock writes participate in the document transaction');
    const product = products.find(item => stockMatches(item, scope));
    if (!product) return null;
    stockUpdate(product, changes); return product;
  });
  const session = { async withTransaction(callback) {
    const snapshots = structuredClone(products), before = documents.length;
    try { return await callback(); } catch (error) {
      products.forEach((product, index) => { for (const key of Object.keys(product)) delete product[key]; Object.assign(product, snapshots[index]); });
      documents.splice(before);
      throw error;
    }
  }, async endSession() {} };
  const startSession = t.mock.method(mongoose, "startSession", async () => session);
  const body = { documentType: "delivery", documentDate: "2026-10-04", requestId: "12345678-1234-1234-1234-123456789012", clientName: " Client ", cart: [{ id: ids[0], qty: 2, vatRate: 20 }, { id: ids[1], qty: 1, vatRate: 10 }] };
  const user = { id: actor._id, role, idAdmin: "aaaaaaaaaaaaaaaaaaaaaaaa" }; // Ownership comes from the actor, not a stale token.
  return { actor, products, documents, res, create, update, startSession, session, find, body,
    run: (overrides = {}) => addSalesDocument({ user, body: { ...body, ...overrides } }, res),
    list: () => listSalesDocuments({ user }, res),
  };
}

for (const role of ["admin", "Employe"]) for (const documentType of ["delivery", "return", "quote", "credit"]) {
  test(`${role} ${documentType} defaults to a printable document with no stock or sale movement`, async (t) => {
    const f = fixture(t, role);
    f.products[0].quantite = 0;
    await f.run({ documentType, TotalPrix: 1, amountPaid: 99, cart: [{ id: ids[0], qty: 2, vatRate: 20, price: 0.01 }] });
    assert.equal(f.res.statusCode, 201);
    const saved = f.res.payload;
    assert.equal(saved.TotalPrix, 96);
    assert.equal(saved.Product[0].price, 40);
    assert.equal(saved.Product[0].code, "CODE0");
    assert.equal(saved.stockUpdated, false);
    assert.equal(saved.documentType, documentType);
    assert.match(saved.reference, new RegExp("^" + { delivery: "BL", return: "BR", quote: "DEV", credit: "AV" }[documentType] + "-2026-"));
    assert.equal(saved.clientName, "Client");
    assert.equal(saved.amountPaid, undefined);
    assert.equal(saved.requestHash, undefined);
    assert.equal(saved.requestId, undefined);
    assert.equal(f.update.mock.callCount(), 0);
    assert.equal(f.startSession.mock.callCount(), 0);
    assert.deepEqual(f.products.map((p) => p.quantite), [0, 10]);
    assert.deepEqual(f.actor.ventes, []);
    assert.deepEqual(f.actor.Facture, []);
    await f.list();
    assert.equal(f.res.payload.length, 1);
    assert.equal(f.res.payload[0].reference, saved.reference);
    await f.run({ documentType, TotalPrix: 1, amountPaid: 99, cart: [{ id: ids[0], qty: 2, vatRate: 20, price: 0.01 }] });
    assert.equal(f.res.statusCode, 200);
    assert.equal(f.documents.length, 1);
    assert.equal(f.update.mock.callCount(), 0);
  });

  if (["delivery", "return"].includes(documentType)) test(`${role} ${documentType} updates stock once and keeps per-line tax snapshots`, async (t) => {
    const f = fixture(t, role);
    await f.run({ documentType, updateStock: true });
    assert.equal(f.res.statusCode, 201);
    const saved = f.res.payload;
    assert.deepEqual(f.products.map((p) => p.quantite), documentType === "delivery" ? [8, 9] : [12, 11]);
    assert.equal(saved.TotalPrix, 118);
    assert.equal(saved.totalHT, 100);
    assert.equal(saved.vatAmount, 18);
    assert.equal(saved.vatRate, undefined);
    assert.equal(saved.stockUpdated, true);
    assert.deepEqual(saved.Product.map((p) => [p.vatRate, p.totalHT, p.vatAmount]), [[20, 80, 16], [10, 20, 2]]);
    await f.run({ documentType, updateStock: true });
    assert.equal(f.res.statusCode, 200);
    assert.equal(String(f.res.payload._id), String(saved._id));
    assert.equal(f.update.mock.callCount(), 2);
    assert.equal(f.create.mock.callCount(), 1);
    assert.deepEqual(f.actor.ventes, []);
  });
}

for (const documentType of ["quote", "credit"]) test(documentType + " rejects forged stock updates before any write", async (t) => {
  const f = fixture(t);
  await f.run({ documentType, updateStock: true });
  assert.equal(f.res.statusCode, 400);
  assert.equal(f.res.payload.message, "stockNotSupported");
  assert.equal(f.update.mock.callCount(), 0);
  assert.equal(f.create.mock.callCount(), 0);
  assert.equal(f.startSession.mock.callCount(), 0);
});

test("reusing a saved request for different quantities is rejected", async (t) => {
  const f = fixture(t);
  await f.run({ updateStock: true });
  await f.run({ updateStock: true, cart: [{ id: ids[0], qty: 5 }] });
  assert.equal(f.res.statusCode, 409);
  assert.equal(f.res.payload.message, "requestConflict");
  assert.deepEqual(f.products.map((p) => p.quantite), [8, 9]);
  assert.equal(f.documents.length, 1);
});

test("a concurrent duplicate save returns the original note and rolls back the second movement", async (t) => {
  const f = fixture(t);
  await f.run({ updateStock: true });
  const first = f.documents[0];
  let reads = 0;
  t.mock.method(SalesDocument, "findOne", () => query(() => ++reads <= 2 ? null : first));
  f.create.mock.mockImplementation(async () => { throw Object.assign(new Error("Duplicate key"), { code: 11000 }); });
  await f.run({ updateStock: true });
  assert.equal(f.res.statusCode, 200);
  assert.equal(String(f.res.payload._id), String(first._id));
  assert.deepEqual(f.products.map((p) => p.quantite), [8, 9]);
  assert.equal(f.documents.length, 1);
});

test("delivery with insufficient stock on a later line rolls back earlier stock writes", async (t) => {
  const f = fixture(t);
  f.products[1].quantite = 0;
  await f.run({ updateStock: true });
  assert.equal(f.res.statusCode, 409);
  assert.equal(f.res.payload.message, "insufficientStock");
  assert.deepEqual(f.products.map((p) => p.quantite), [10, 0]);
  assert.equal(f.documents.length, 0);
});

test("document write failure rolls back all stock movements", async (t) => {
  const f = fixture(t);
  f.create.mock.mockImplementation(async () => { throw new Error("Write failed"); });
  await f.run({ updateStock: true });
  assert.equal(f.res.statusCode, 500);
  assert.deepEqual(f.products.map((p) => p.quantite), [10, 10]);
  assert.equal(f.documents.length, 0);
});

test("a transaction retry does not retain movements from an aborted attempt", async (t) => {
  const f = fixture(t);
  f.session.withTransaction = async (callback) => {
    await callback();
    f.products.forEach((p) => { p.quantite = 10; });
    f.documents.splice(0);
    return callback();
  };
  await f.run({ updateStock: true });
  assert.equal(f.res.statusCode, 201);
  assert.deepEqual(f.products.map((p) => p.quantite), [8, 9]);
  assert.equal(f.documents.length, 1);
});

test("unsupported transactions fail before changing stock or storing the note", async (t) => {
  const f = fixture(t);
  f.session.withTransaction = async () => { throw Object.assign(new Error("Transaction numbers are only allowed on a replica set member"), { code: 20 }); };
  await f.run({ updateStock: true });
  assert.equal(f.res.payload.message, "stockUnavailable");
  assert.equal(f.update.mock.callCount(), 0);
  assert.equal(f.documents.length, 0);
});

test("return can replenish an empty stock", async (t) => {
  const f = fixture(t);
  f.products[0].quantite = 0;
  await f.run({ documentType: "return", updateStock: true });
  assert.equal(f.res.statusCode, 201);
  assert.equal(f.products[0].quantite, 2);
});

test("foreign products are rejected before any stock write", async (t) => {
  const f = fixture(t);
  f.products[1].idAdmin = "aaaaaaaaaaaaaaaaaaaaaaaa";
  await f.run({ updateStock: true });
  assert.equal(f.res.statusCode, 404);
  assert.equal(f.update.mock.callCount(), 0);
  assert.equal(f.documents.length, 0);
});

for (const role of ["admin", "Employe"]) test(`${role} listing respects shop and employee boundaries`, async (t) => {
  const f = fixture(t, role);
  f.documents.push({ idAdmin: adminId, createdBy: employeeId }, { idAdmin: adminId, createdBy: adminId }, { idAdmin: "aaaaaaaaaaaaaaaaaaaaaaaa", createdBy: employeeId });
  await f.list();
  assert.equal(f.res.payload.length, role === "admin" ? 2 : 1);
  assert.deepEqual(f.find.mock.calls[0].arguments[0], { idAdmin: adminId, ...(role === "Employe" ? { createdBy: employeeId } : {}) });
});

test("deactivated employees cannot create notes", async (t) => {
  const f = fixture(t, "Employe");
  f.actor.isActive = false;
  await f.run({ updateStock: true });
  assert.equal(f.res.statusCode, 403);
  assert.equal(f.documents.length, 0);
});

for (const invalid of [
  { documentType: "invoice" }, { updateStock: "true" }, { documentDate: "2026-02-30" },
  { requestId: "" }, { cart: [] }, { cart: [{ id: ids[0], qty: 0 }] },
  { cart: [{ id: ids[0], qty: 1.5 }] }, { cart: [{ id: ids[0], qty: true }] },
  { cart: [{ id: ids[0], qty: 1 }, { id: ids[0], qty: 1 }] },
  { cart: [{ id: ids[0], qty: 1, vatRate: 101 }] },
  { cart: [{ id: ids[0], qty: 1, vatRate: null }] },
  { cart: [{ id: ids[0], qty: 1, discountValue: 101 }] },
]) test(`invalid document input is rejected without writes: ${JSON.stringify(invalid)}`, async (t) => {
  const f = fixture(t);
  await f.run({ updateStock: true, ...invalid });
  assert.equal(f.res.statusCode, 400);
  assert.equal(f.update.mock.callCount(), 0);
  assert.equal(f.create.mock.callCount(), 0);
});

test("type filters retain legacy invoices and select delivery and return notes separately", () => {
  const documents = [{ _id: "legacy" }, { documentType: "delivery" }, { documentType: "return" }, { documentType: "quote" }, { documentType: "credit" }];
  assert.deepEqual(filterSalesDocuments(documents, "invoice"), [documents[0]]);
  assert.deepEqual(filterSalesDocuments(documents, "delivery"), [documents[1]]);
  assert.deepEqual(filterSalesDocuments(documents, "return"), [documents[2]]);
  assert.deepEqual(filterSalesDocuments(documents, "quote"), [documents[3]]);
  assert.deepEqual(filterSalesDocuments(documents, "credit"), [documents[4]]);
  assert.equal(filterSalesDocuments(documents).length, 5);
});
