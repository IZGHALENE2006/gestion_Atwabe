import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import { creditDocument } from "../shared/creditDocuments.js";
import { creditCheckoutFixture, owner, otherOwner, productIds } from "./helpers/creditCheckoutFixture.js";
let server, base;
const previousSecret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = "credit-checkout-test"; server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const input = (f, patch = {}) => ({ requestId: randomUUID(), customerId: String(f.customer._id), cart: [{ id: productIds[0], qty: 2, priceType: "retail", price: 0.01 }, { id: productIds[1], qty: 1 }], discountType: "percent", discountValue: 10, amountPaid: 200, totalOrder: 0.01, ...patch });
const request = (body, actor = { id: owner, role: "admin" }) => fetch(`${base}/addVentes/credit`, { method: "POST", headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {}) }, body: JSON.stringify(body) });
const assertSingleSale = (f, expected = { total: 1200, paid: 300, remaining: 900 }) => {
  assert.equal(f.account().Total, expected.total); assert.equal(f.account().Paye, expected.paid); assert.equal(f.account().Total - f.account().Paye, expected.remaining);
  assert.equal(f.account().creditInvoices.length, 1); assert.equal(f.account().paymentHistory.length, expected.paid > 100 ? 1 : 0);
  assert.deepEqual(f.products().map(product => product.quantite), [8, 9]); assert.equal(f.actor().Facture.length, 1); assert.equal(f.actor().ventes.length, 2); assert.equal(f.operations()[0].status, "complete");
};
test("existing customer checkout uses trusted prices, discounts and net profit, deducts stock and produces one multi-product credit invoice", async t => {
  const f = creditCheckoutFixture(t), response = await request(input(f)); assert.equal(response.status, 201); const result = await response.json(); assertSingleSale(f);
  assert.equal(result.facture.saleType, "credit"); assert.equal(result.facture.TotalPrix, 900); assert.equal(result.facture.amountPaid, 200); assert.equal(result.facture.remainingAmount, 700); assert.equal(result.facture.PrixReture, 0);
  assert.equal(result.facture.discountAmount, 100); assert.equal(result.facture.Product.reduce((sum, line) => sum + line.TotalPrix, 0), 1000); assert.deepEqual(result.facture.Product.map(line => line.discountAmount), [0, 0]);
  assert.deepEqual(result.lastVentes.map(sale => sale.profite), [320, 80]);
  assert.deepEqual(result.lastVentes.map(sale => sale.saleAmount), [720, 180]);
  assert.ok(result.lastVentes.every(sale => String(sale.invoiceId) === String(result.facture._id)));
  assert.deepEqual(f.actor().ventes.map(sale => sale.saleAmount), [720, 180]);
  assert.deepEqual(result.creditUser.produit.slice(1).map(line => line.lineTotal), [720, 180]);
  const doc = creditDocument(result.creditUser, result.document); assert.equal(doc.lines.length, 2); assert.equal(doc.total, 900); assert.equal(doc.paid, 200); assert.equal(doc.remaining, 700);
  const receipt = creditDocument(result.creditUser, { kind: "payment", payment: result.creditUser.paymentHistory[0] }); assert.equal(receipt.remainingBefore, 1100); assert.equal(receipt.remaining, 900); assert.equal(receipt.amount, 200);
});
test("a new customer is registered by the same confirmation, with zero optional upfront payment", async t => {
  const f = creditCheckoutFixture(t), body = input(f, { customerId: undefined, newCustomer: { name: "  أمينة  ", phone: "0611111111", cin: "BB123", email: "USER@EXAMPLE.COM" }, amountPaid: "" });
  const response = await request(body); assert.equal(response.status, 201); const result = await response.json();
  assert.equal(f.accounts().length, 3); assert.equal(result.creditUser.name, "أمينة"); assert.equal(result.creditUser.email, "user@example.com"); assert.deepEqual(result.creditUser.summary, { total: 900, paid: 0, remaining: 900, totalQuantity: 3 }); assert.equal(result.creditUser.paymentHistory.length, 0);
  assert.equal((await request(body)).status, 201); assert.equal(f.accounts().length, 3); assert.equal(f.actor().Facture.length, 1);
});
test("concurrent duplicate confirmations and retries do not repeat stock, debt, initial payment or sales", async t => {
  const f = creditCheckoutFixture(t), body = input(f); const responses = await Promise.all([request(body), request(body), request(body)]); assert.ok(responses.every(response => response.status === 201));
  const references = await Promise.all(responses.map(async response => (await response.json()).document.reference)); assert.equal(new Set(references).size, 1); assertSingleSale(f);
  assert.equal((await request({ ...body, amountPaid: 100 })).status, 409); assertSingleSale(f);
});
for (const failedStage of ["stockAfterCommit", "creditBeforeSave", "creditAfterSave", "actorAfterCommit", "journalAfterCommit"]) test(`an ambiguous ${failedStage} failure resumes the original checkout exactly once`, async t => {
  const f = creditCheckoutFixture(t), body = input(f); f.controls[failedStage] = true;
  const failure = await request(body); assert.equal(failure.status, 503); assert.deepEqual(await failure.json(), { message: "creditCheckoutPending" });
  assert.equal((await request(body)).status, 201); assertSingleSale(f);
});
test("a lost response while creating a new customer resumes with the same account", async t => {
  const f = creditCheckoutFixture(t), body = input(f, { customerId: undefined, newCustomer: { name: "زبون جديد" } }); f.controls.newCustomerAfterCreate = true;
  assert.equal((await request(body)).status, 503); assert.equal((await request(body)).status, 201); assert.equal(f.accounts().length, 3); assert.equal(f.actor().Facture.length, 1); assert.deepEqual(f.products().map(row => row.quantite), [8, 9]);
});
test("a stock race releases only this operation's reservations and records neither debt nor a customer", async t => {
  const f = creditCheckoutFixture(t), body = input(f, { customerId: undefined, newCustomer: { name: "لن يضاف" } }); f.controls.stockRace = true;
  const response = await request(body); assert.equal(response.status, 400); assert.equal((await response.json()).message, "creditCheckoutStockChanged");
  assert.equal(f.products()[0].quantite, 10); assert.equal(f.accounts().length, 2); assert.equal(f.actor().Facture.length, 0); assert.equal(f.operations()[0].status, "cancelled");
  assert.equal((await request(body)).status, 400); assert.equal(f.products()[0].quantite, 10);
});
test("ownership, roles, duplicate customers, malformed carts and invalid upfront amounts cause no stock or credit writes", async t => {
  const f = creditCheckoutFixture(t);
  for (const actor of [null, { id: owner, role: "Employe" }, { id: otherOwner, role: "admin" }]) assert.ok([401, 403, 404].includes((await request(input(f), actor)).status));
  for (const patch of [{ customerId: String(f.foreignCustomer._id) }, { amountPaid: 901 }, { amountPaid: -1 }, { amountPaid: true }, { requestId: "invalid" }, { cart: [] }, { cart: [{ id: productIds[0], qty: 1 }, { id: productIds[0], qty: 1 }] }, { discountValue: 101 }, { customerId: undefined, newCustomer: { name: " " } }]) assert.ok([400, 404].includes((await request(input(f, patch))).status));
  f.account().cin = "TAKEN";
  assert.equal((await request(input(f, { customerId: undefined, newCustomer: { name: "Duplicate", cin: "TAKEN" } }))).status, 400);
  assert.deepEqual(f.products().map(row => row.quantite), [10, 10]); assert.equal(f.actor().Facture.length, 0); assert.equal(f.account().Total, 300); assert.equal(f.operations().length, 0);
});
test("discount cents, wholesale prices, full payment and fully discounted zero-value credit keep exact totals", async t => {
  const f = creditCheckoutFixture(t);
  const response = await request(input(f, { cart: [{ id: productIds[0], qty: 1, priceType: "wholesale" }, { id: productIds[1], qty: 1 }], discountType: "amount", discountValue: 0.01, amountPaid: 499.99 }));
  assert.equal(response.status, 201); const result = await response.json(); assert.equal(result.creditUser.Total, 799.99); assert.equal(result.creditUser.Paye, 599.99); assert.equal(result.creditUser.summary.remaining, 200); assert.equal(result.facture.remainingAmount, 0); assert.equal(result.facture.Product[0].price, 300);
  const free = await request(input(f, { discountValue: 100, amountPaid: 0 })); assert.equal(free.status, 201);
  const again = await fetch(`${base}/usercridite/get/${f.customer._id}`, { headers: { Authorization: `Bearer ${jwt.sign({ id: owner, role: "admin" }, process.env.JWT_SECRET)}` } }); assert.equal((await again.json()).Total, 799.99);
});

test("deleting a discounted credit line subtracts its net value and keeps the original checkout invoice printable", async t => {
  const f = creditCheckoutFixture(t), response = await request(input(f)), result = await response.json(), line = result.creditUser.produit[1];
  const deleted = await fetch(`${base}/usercridite/DeleteProduct/${f.customer._id}/${line.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${jwt.sign({ id: owner, role: "admin" }, process.env.JWT_SECRET)}` } });
  assert.equal(deleted.status, 200); const current = (await deleted.json()).user; assert.equal(current.Total, 480); assert.equal(current.Paye, 140);
  const invoice = creditDocument(current, result.document); assert.equal(invoice.total, 900); assert.equal(invoice.paid, 200); assert.equal(invoice.lines.length, 2);
});

test("a customer payment concurrent with a credit checkout retains both payments and the exact account balance", async t => {
  const f = creditCheckoutFixture(t), payment = fetch(`${base}/usercridite/add-payment/${f.customer._id}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id: owner, role: "admin" }, process.env.JWT_SECRET)}` }, body: JSON.stringify({ requestId: randomUUID(), amount: 50 }) });
  const responses = await Promise.all([request(input(f)), payment]); assert.deepEqual(responses.map(response => response.status), [201, 200]);
  assert.equal(f.account().Total, 1200); assert.equal(f.account().Paye, 350); assert.equal(f.account().paymentHistory.length, 2); assert.equal(f.account().Total - f.account().Paye, 850);
});
