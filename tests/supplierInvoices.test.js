import test from "node:test";
import assert from "node:assert/strict";
import { calculateSupplierInvoice, supplierDate, supplierPayment, supplierInvoiceStatus } from "../shared/supplierInvoices.js";
import Supplier from "../BackEnd/models/Fournisseur.js";
import Product from "../BackEnd/models/productModel.js";
import { AddSupplierInvoice, AddSupplierPayment, GetSupplierInvoices } from "../BackEnd/controlles/SupplierInvoices.js";
import { DeleteFournisseur } from "../BackEnd/controlles/Fournisseur.js";
import app from "../BackEnd/app.js";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";

const owner = "111111111111111111111111";
const otherOwner = "222222222222222222222222";
const supplierA = "333333333333333333333333";
const supplierB = "444444444444444444444444";
const foreignSupplier = "555555555555555555555555";
const productId = "666666666666666666666666";
const invoiceInput = {
  requestId: "invoice-request-001", reference: "FR-2026-001", invoiceDate: "2026-09-29",
  items: [{ name: "زيت الزيتون", quantity: 3, unitPrice: 20.15 }], amountPaid: 20,
};

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

function setup(t) {
  const records = new Map([
    [supplierA, new Supplier({ _id: supplierA, idAdmin: owner, name: "مورد ألف" })],
    [supplierB, new Supplier({ _id: supplierB, idAdmin: owner, name: "Supplier B" })],
    [foreignSupplier, new Supplier({ _id: foreignSupplier, idAdmin: otherOwner, name: "Private supplier" })],
  ]);
  const clone = (doc) => doc ? new Supplier(doc.toObject()) : null;
  const match = (filter) => {
    const doc = records.get(String(filter._id));
    return doc && String(doc.idAdmin) === String(filter.idAdmin) ? doc : null;
  };
  const writes = [];
  const context = { records, writes, beforeWrite: null };
  t.mock.method(Supplier, "findOne", async (filter) => clone(match(filter)));
  t.mock.method(Supplier, "findOneAndUpdate", async (filter, update) => {
    if (context.beforeWrite) { const action = context.beforeWrite; context.beforeWrite = null; action(); }
    const doc = match(filter);
    if (!doc) return null;
    if (update.$push.invoices) {
      if (doc.invoices.some((invoice) => invoice.requestId === filter["invoices.requestId"].$ne)) return null;
      if (filter["invoices.reference"] && doc.invoices.some((invoice) => invoice.reference === filter["invoices.reference"].$ne)) return null;
      doc.invoices.push(update.$push.invoices);
    } else {
      const condition = filter.invoices.$elemMatch;
      const invoice = doc.invoices.id(condition._id);
      if (!invoice || invoice.amountPaid !== condition.amountPaid || invoice.payments.some((payment) => payment.requestId === condition["payments.requestId"].$ne)) return null;
      invoice.amountPaid = update.$set["invoices.$.amountPaid"];
      invoice.payments.push(update.$push["invoices.$.payments"]);
    }
    await doc.validate();
    writes.push({ filter, update });
    return clone(doc);
  });
  t.mock.method(Supplier, "findOneAndDelete", async (filter) => {
    const doc = match(filter);
    assert.deepEqual(filter["invoices.0"], { $exists: false });
    if (!doc || doc.invoices.length) return null;
    records.delete(String(doc._id)); return clone(doc);
  });
  t.mock.method(Product, "find", (filter) => ({ select: async () => filter.idAdmin === owner && filter._id.$in.every((id) => id === productId) ? [{ _id: productId }] : [] }));
  for (const method of ["updateOne", "findOneAndUpdate", "bulkWrite"]) t.mock.method(Product, method, () => { throw new Error("Supplier invoices must not change stock"); });
  context.run = async (handler, body = invoiceInput, supplierId = supplierA, invoiceId, ownerId = owner) => {
    const res = response();
    await handler({ params: { id: supplierId, invoiceId }, body, user: { id: ownerId, idAdmin: ownerId } }, res);
    return res;
  };
  return context;
}

test("purchase totals round cents, support fractional quantities and zero upfront payment", () => {
  const result = calculateSupplierInvoice([{ name: " زيت ", quantity: 2.5, unitPrice: 10.1 }, { name: "Café", quantity: 3, unitPrice: 0.1 }]);
  assert.equal(result.total, 25.55);
  assert.equal(result.remaining, 25.55);
  assert.equal(result.amountPaid, 0);
  assert.equal(result.items[0].name, "زيت");
  assert.equal(supplierInvoiceStatus(result), "unpaid");
  assert.equal(supplierInvoiceStatus({ total: 20, amountPaid: 5 }), "partial");
  assert.equal(supplierInvoiceStatus({ total: 20, amountPaid: 20 }), "paid");
});

test("date-only values reject impossible calendar dates without timezone shifts", () => {
  assert.equal(supplierDate("2024-02-29"), "2024-02-29");
  for (const date of ["2026-02-29", "2026-04-31", "", "2026-13-01", "2026-09-29T00:00:00Z"]) assert.throws(() => supplierDate(date), /invalidDate/);
});

test("invoice creation persists snapshot names, line totals and initial payment; ignores forged totals", async (t) => {
  const context = setup(t);
  const result = await context.run(AddSupplierInvoice, { ...invoiceInput, supplierName: "Wrong supplier", total: 0.01, remaining: 999, items: [{ ...invoiceInput.items[0], productId, total: 999 }] });
  assert.equal(result.statusCode, 201);
  const invoice = result.payload.invoices[0];
  assert.equal(invoice.total, 60.45);
  assert.equal(invoice.items[0].total, 60.45);
  assert.equal(invoice.supplierName, "مورد ألف");
  assert.equal(invoice.payments[0].amount, 20);
  assert.equal(invoice.payments[0].date, "2026-09-29");
  assert.ok(invoice._id);
  assert.deepEqual(result.payload.summary, { invoiceCount: 1, total: 60.45, paid: 20, remaining: 40.45 });
  assert.equal(context.writes.length, 1);
  const reloaded = await context.run(GetSupplierInvoices);
  assert.equal(reloaded.payload.invoices[0].total, 60.45);
});

test("each supplier only returns its own invoices, and other accounts cannot read or write them", async (t) => {
  const context = setup(t);
  await context.run(AddSupplierInvoice);
  assert.equal((await context.run(GetSupplierInvoices, {}, supplierB)).payload.invoices.length, 0);
  for (const handler of [GetSupplierInvoices, AddSupplierInvoice]) {
    assert.equal((await context.run(handler, invoiceInput, foreignSupplier)).statusCode, 404);
    assert.equal((await context.run(handler, invoiceInput, supplierA, undefined, otherOwner)).statusCode, 404);
  }
  assert.equal(context.records.get(foreignSupplier).invoices.length, 0);
  assert.equal(context.writes.length, 1);
});

test("retries and duplicate invoice references cannot insert the same invoice twice", async (t) => {
  const context = setup(t);
  await context.run(AddSupplierInvoice);
  assert.equal((await context.run(AddSupplierInvoice)).statusCode, 200);
  const duplicate = await context.run(AddSupplierInvoice, { ...invoiceInput, requestId: "another-request" });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.payload.message, "duplicateReference");
  assert.equal(context.records.get(supplierA).invoices.length, 1);
  assert.equal((await context.run(AddSupplierInvoice, invoiceInput, supplierB)).statusCode, 201);
});

for (const [label, patch] of [
  ["empty lines", { items: [] }], ["zero quantity", { items: [{ ...invoiceInput.items[0], quantity: 0 }] }],
  ["negative price", { items: [{ ...invoiceInput.items[0], unitPrice: -1 }] }], ["invalid price", { items: [{ ...invoiceInput.items[0], unitPrice: "abc" }] }],
  ["empty name", { items: [{ ...invoiceInput.items[0], name: " " }] }], ["overpayment", { amountPaid: 61 }],
  ["negative payment", { amountPaid: -5 }], ["impossible date", { invoiceDate: "2026-02-30" }],
  ["foreign product", { items: [{ ...invoiceInput.items[0], productId: foreignSupplier }] }],
  ["object payment", { amountPaid: {} }], ["invalid request ID", { requestId: "" }],
]) test(`rejects ${label} before saving`, async (t) => {
  const context = setup(t);
  const result = await context.run(AddSupplierInvoice, { ...invoiceInput, ...patch });
  assert.equal(result.statusCode, 400);
  assert.equal(context.writes.length, 0);
});

test("later payments update the balance and history once, including settlement to zero", async (t) => {
  const context = setup(t);
  const created = await context.run(AddSupplierInvoice);
  const id = String(created.payload.invoices[0]._id);
  const payment = { requestId: "payment-request-001", amount: 10.2, date: "2026-09-30", note: " Cash " };
  let result = await context.run(AddSupplierPayment, payment, supplierA, id);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.summary.paid, 30.2);
  assert.equal(result.payload.summary.remaining, 30.25);
  assert.equal(result.payload.invoices[0].payments[1].note, "Cash");
  await context.run(AddSupplierPayment, payment, supplierA, id);
  assert.equal(context.records.get(supplierA).invoices[0].payments.length, 2);
  result = await context.run(AddSupplierPayment, { ...payment, requestId: "payment-request-002", amount: 30.25 }, supplierA, id);
  assert.equal(result.payload.summary.remaining, 0);
  assert.equal(supplierInvoiceStatus(result.payload.invoices[0]), "paid");
  assert.equal((await context.run(AddSupplierPayment, { ...payment, requestId: "payment-request-003", amount: 0.01 }, supplierA, id)).statusCode, 400);
});

test("payments cannot be added through another supplier or account", async (t) => {
  const context = setup(t);
  const created = await context.run(AddSupplierInvoice);
  const id = String(created.payload.invoices[0]._id);
  const payment = { requestId: "payment-request-001", amount: 1, date: "2026-09-30" };
  assert.equal((await context.run(AddSupplierPayment, payment, supplierB, id)).statusCode, 404);
  assert.equal((await context.run(AddSupplierPayment, payment, supplierA, id, otherOwner)).statusCode, 404);
  assert.equal(context.writes.length, 1);
});

test("concurrent payments cannot overwrite each other or exceed the balance", async (t) => {
  const context = setup(t);
  const created = await context.run(AddSupplierInvoice);
  const id = String(created.payload.invoices[0]._id);
  context.beforeWrite = () => {
    const invoice = context.records.get(supplierA).invoices.id(id);
    invoice.amountPaid = 50;
    invoice.payments.push({ requestId: "other-payment", amount: 30, date: "2026-09-30" });
  };
  const result = await context.run(AddSupplierPayment, { requestId: "payment-request-001", amount: 25, date: "2026-09-30" }, supplierA, id);
  assert.equal(result.statusCode, 409);
  assert.equal(result.payload.message, "paymentConflict");
  assert.equal(context.records.get(supplierA).invoices[0].amountPaid, 50);
});

test("suppliers with invoice history cannot be deleted; unrelated account deletion is denied", async (t) => {
  const context = setup(t);
  await context.run(AddSupplierInvoice);
  assert.equal((await context.run(DeleteFournisseur)).statusCode, 409);
  assert.equal((await context.run(DeleteFournisseur, {}, foreignSupplier)).statusCode, 404);
  assert.equal((await context.run(DeleteFournisseur, {}, supplierB)).statusCode, 201);
  assert.ok(context.records.has(supplierA));
});

test("payment validation rejects zero, negative and excessive amounts", () => {
  for (const amount of [0, -1, "", null, 11]) assert.throws(() => supplierPayment({ total: 20, amountPaid: 10 }, { amount, date: "2026-09-30", note: "" }));
});

test("supplier invoice HTTP routes require authentication and use supplier-specific persistence", async (t) => {
  setup(t);
  t.mock.method(jwt, "verify", () => ({ id: owner, idAdmin: owner }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/Fournisseur`;
  assert.equal((await fetch(`${base}/${supplierA}/invoices`)).status, 401);
  const saved = await fetch(`${base}/${supplierA}/invoices`, { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify(invoiceInput) });
  assert.equal(saved.status, 201);
  const data = await saved.json();
  assert.equal(data.summary.remaining, 40.45);
  const other = await fetch(`${base}/${supplierB}/invoices`, { headers: { Authorization: "Bearer test-token" } });
  assert.equal((await other.json()).invoices.length, 0);
});
