import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import TailoringWorker from "../BackEnd/models/TailoringWorker.js";
import WorkerWork from "../BackEnd/models/WorkerWork.js";
import SfifaStock from "../BackEnd/models/SfifaStock.js";
import { garmentWorkerFixture } from "./helpers/garmentWorkerFixture.js";
import { owner, otherOwner, employee, query } from "./helpers/djellabaCostsFixture.js";
import { WORKER_CATEGORIES } from "../shared/workers.js";
import { validateWorkerWork, workerWageCents } from "../shared/workerWork.js";
import { buildWorkerPayroll, validateWorkerPayment, workerCompletionEarning, workerPayrollMonth } from "../shared/workerPayroll.js";

let server, base;
const oldSecret = process.env.JWT_SECRET;
before(async () => {
  process.env.JWT_SECRET = "isolated-worker-payroll-tests";
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/tailoring-workers`;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
});
const actor = { id: owner, role: "admin" };
async function request(worker, suffix, body, identity = actor, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`${base}/${worker._id || worker}${suffix}`, { method, headers: { ...(identity ? { Authorization: `Bearer ${jwt.sign(identity, process.env.JWT_SECRET)}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
function fixture(t) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-03T12:00:00Z") });
  const f = garmentWorkerFixture(t), controls = {};
  f.worker.categories = WORKER_CATEGORIES;
  t.mock.method(TailoringWorker.prototype, "save", async function () {
    await this.validate();
    if (controls.failPayment) { controls.failPayment = false; throw new Error("private payment failure"); }
    const index = f.workers.findIndex(row => String(row._id) === String(this._id));
    if (index < 0 || f.workers[index].__v !== this.__v) throw Object.assign(new Error("stale"), { name: "VersionError" });
    this.__v += 1; f.workers[index] = new TailoringWorker(this.toObject()); return this;
  });
  const stocks = [];
  const same = (a, b) => String(a) === String(b);
  const matches = (row, scope) => Object.entries(scope).every(([key, value]) => key.includes(".") ? row[key.split(".")[0]]?.some(entry => same(entry[key.split(".")[1]], value)) : same(row[key], value));
  t.mock.method(SfifaStock, "find", scope => query(() => stocks.filter(row => matches(row, scope)).map(row => row.toObject())));
  t.mock.method(SfifaStock, "findOne", scope => query(() => { const row = stocks.find(row => matches(row, scope)); return row ? new SfifaStock(row.toObject()) : null; }));
  t.mock.method(SfifaStock.prototype, "save", async function () {
    await this.validate();
    if (controls.failStock) { controls.failStock = false; throw new Error("private stock failure"); }
    const index = stocks.findIndex(row => same(row._id, this._id));
    if (index >= 0 && stocks[index].__v !== this.__v) throw Object.assign(new Error("stale"), { name: "VersionError" });
    this.__v = (this.__v || 0) + 1;
    if (index < 0) stocks.push(new SfifaStock(this.toObject())); else stocks[index] = new SfifaStock(this.toObject());
    return this;
  });
  return { ...f, controls, stocks };
}
const job = extra => ({ category: "machine", workType: "shop", productName: "جلابيب المحل", garmentType: "djellaba", quantity: 10, unitWage: 50, requestId: randomUUID(), ...extra });
async function assign(f, extra) { const result = await request(f.worker, "/work", job(extra)); assert.equal(result.status, 201, JSON.stringify(result)); return result.data; }
const finish = (f, work, quantity, extra = {}) => request(f.worker, `/work/${work._id}/completions`, { quantity, version: work.__v, requestId: randomUUID(), ...extra });
const account = async f => { const result = await request(f.worker, "/payroll"); assert.equal(result.status, 200); return result.data; };
const payment = extra => ({ type: "settlement", month: "2026-11", paidOn: "2026-11-03", amount: 100, note: "", requestId: randomUUID(), ...extra });

test("linked client sfifa earns wages, releases its order on completion and can be paid without creating stock", async t => {
  const f = fixture(t), order = f.seedGarmentOrder("djellaba"), lineIds = [order.items[0].lineId];
  const work = await assign(f, { category: "sfifa", workType: "client", garmentType: undefined, quantity: 12, unitWage: 2.5, sfifa: { width: "thick", family: "01-30", code: 12 }, orderId: String(order._id), lineIds });
  const first = await finish(f, work, 4); assert.equal(first.status, 201);
  let ledger = await account(f); assert.equal(ledger.totals.earned, 10); assert.equal(ledger.totals.due, 10);
  let options = await request(f.worker, "/work/orders?category=machine&garmentType=djellaba"); assert.equal(options.status, 200);
  let garment = options.data.orders.find(row => row._id === String(order._id)).items.find(row => row.lineId === lineIds[0]);
  assert.equal(garment.available, false); assert.equal(garment.blockedBy[0].category, "sfifa");
  const last = await finish(f, first.data, 8); assert.equal(last.status, 201); assert.equal(last.data.remainingQuantity, 0);
  options = await request(f.worker, "/work/orders?category=machine&garmentType=djellaba");
  garment = options.data.orders.find(row => row._id === String(order._id)).items.find(row => row.lineId === lineIds[0]);
  assert.equal(garment.available, true); assert.deepEqual(garment.blockedBy, []);
  assert.equal(f.stocks[0].quantity, 0); assert.equal(f.stocks[0].variants.length, 0); assert.equal(f.stocks[0].receipts.length, 0);
  ledger = await account(f); assert.equal(ledger.totals.earned, 30); assert.equal(ledger.entries.length, 2);
  assert.equal((await request(f.worker, "/payments", payment({ amount: 10 }))).status, 201);
  const deleted = await request(f.worker, `/work/${work._id}`, { version: last.data.__v, requestId: randomUUID() }, actor, "DELETE");
  assert.equal(deleted.status, 200);
  ledger = await account(f); assert.deepEqual([ledger.totals.earned, ledger.totals.paid, ledger.totals.due], [30, 10, 20]);
  assert.equal(f.stocks[0].receipts.length, 0); assert.equal(f.stocks[0].quantity, 0);
});

test("wages validate precisely for every category and preserve client-order rates", async t => {
  const f = fixture(t);
  for (const category of WORKER_CATEGORIES.filter(value => value !== "sfifa")) {
    const work = await assign(f, { category, ...(category !== "machine" ? { garmentType: undefined } : {}), unitWage: "12,50" });
    assert.equal(work.unitWage, 12.5);
    const done = await finish(f, work, 2); assert.equal(done.status, 201); assert.equal(done.data.completions[0].earningAmount, 25);
  }
  const order = f.seedGarmentOrder("trousers");
  const linked = await assign(f, { category: "trousers", workType: "client", orderId: String(order._id), lineIds: order.items.map(item => item.lineId), unitWage: 20 });
  assert.equal(linked.unitWage, 20); assert.equal(linked.quantity, 2);
  for (const value of ["", -1, "1.234", Infinity, {}, "9999999999"]) assert.throws(() => validateWorkerWork(job({ unitWage: value })), error => error.fields.unitWage === "invalidWage");
  assert.equal(validateWorkerWork(job({ unitWage: 0 })).unitWage, 0);
});

test("assigning earns nothing; partial completions and increases earn only completed quantity", async t => {
  const f = fixture(t), work = await assign(f);
  assert.equal((await account(f)).totals.earned, 0);
  const body = { quantity: 4, version: work.__v, requestId: randomUUID(), earningAmount: 9999, earningMonth: "2000-01" };
  const done = await request(f.worker, `/work/${work._id}/completions`, body); assert.equal(done.status, 201);
  assert.equal(done.data.completions[0].earningAmount, 200); assert.equal(done.data.completions[0].earningMonth, "2026-11");
  assert.equal((await request(f.worker, `/work/${work._id}/completions`, body)).status, 200);
  const increased = await request(f.worker, `/work/${work._id}/increases`, { quantity: 2, unitWage: 999, version: done.data.__v, requestId: randomUUID() });
  assert.equal(increased.status, 201); assert.equal(increased.data.unitWage, 50); assert.equal((await account(f)).totals.earned, 200);
  assert.equal((await finish(f, increased.data, 8)).status, 201);
  const result = await account(f); assert.equal(result.totals.earned, 600); assert.equal(result.entries.length, 2);
});

test("old month balances remain distinct, while payment date and entitlement month differ", async t => {
  const f = fixture(t);
  t.mock.timers.setTime(Date.parse("2026-10-20T10:00:00Z"));
  const october = await assign(f); await finish(f, october, 10);
  t.mock.timers.setTime(Date.parse("2026-11-03T12:00:00Z"));
  const november = await assign(f); await finish(f, november, 2);
  const paid = await request(f.worker, "/payments", payment({ month: "2026-10", amount: 200 })); assert.equal(paid.status, 201);
  assert.equal(paid.data.payment.paidOn, "2026-11-03");
  const ledger = await account(f); const old = ledger.months.find(row => row.month === "2026-10");
  assert.deepEqual([old.earned, old.paid, old.due], [500, 200, 300]);
  assert.equal(ledger.months.find(row => row.month === "2026-11").due, 100); assert.equal(ledger.totals.due, 400);
});

test("settlements cannot exceed the selected month, advances work before completion and offset that month", async t => {
  const f = fixture(t);
  assert.equal((await request(f.worker, "/payments", payment())).status, 409);
  assert.equal((await request(f.worker, "/payments", payment({ type: "advance", amount: 150 }))).status, 201);
  let ledger = await account(f); assert.equal(ledger.totals.advance, 150); assert.equal(ledger.totals.due, 0);
  const work = await assign(f); await finish(f, work, 4);
  ledger = await account(f); assert.equal(ledger.totals.advance, 0); assert.equal(ledger.totals.due, 50);
  assert.equal((await request(f.worker, "/payments", payment({ amount: 51 }))).status, 409);
  assert.equal((await request(f.worker, "/payments", payment({ amount: 50 }))).status, 201);
  assert.equal((await account(f)).totals.due, 0);
});

test("advances for a different month cannot hide an old unpaid debt", async t => {
  const f = fixture(t);
  t.mock.timers.setTime(Date.parse("2026-10-20T10:00:00Z")); const work = await assign(f); await finish(f, work, 10);
  t.mock.timers.setTime(Date.parse("2026-11-03T12:00:00Z"));
  await request(f.worker, "/payments", payment({ type: "advance", amount: 600 }));
  const ledger = await account(f); assert.equal(ledger.totals.balance, -100); assert.equal(ledger.totals.due, 500); assert.equal(ledger.totals.advance, 600);
});

test("payment retries are idempotent, altered retries conflict, concurrent settlements do not overpay", async t => {
  const f = fixture(t), work = await assign(f); await finish(f, work, 4);
  const first = payment({ amount: 50 });
  const duplicate = await Promise.all([request(f.worker, "/payments", first), request(f.worker, "/payments", first)]);
  assert.deepEqual(duplicate.map(row => row.status).sort(), [200, 201]);
  assert.equal((await request(f.worker, "/payments", { ...first, amount: 51 })).status, 409);
  assert.equal((await account(f)).totals.paid, 50);
  const competing = await Promise.all([request(f.worker, "/payments", payment({ amount: 100 })), request(f.worker, "/payments", payment({ amount: 100 }))]);
  assert.deepEqual(competing.map(row => row.status).sort(), [201, 409]);
  assert.equal((await account(f)).totals.paid, 150);
});

test("failed payment saves leave no entry and the same request remains retryable", async t => {
  const f = fixture(t), input = payment({ type: "advance" }); f.controls.failPayment = true;
  const failed = await request(f.worker, "/payments", input); assert.equal(failed.status, 500); assert.equal(JSON.stringify(failed).includes("private"), false);
  assert.equal((await account(f)).entries.length, 0);
  assert.equal((await request(f.worker, "/payments", input)).status, 201);
  assert.equal((await request(f.worker, "/payments", input)).status, 200);
  assert.equal((await account(f)).entries.length, 1);
});

test("one account combines all departments but never combines workers or shops; permissions are current", async t => {
  const f = fixture(t), first = await assign(f), second = await assign(f, { category: "finishing", garmentType: undefined });
  await finish(f, first, 1); await finish(f, second, 2);
  const other = f.seedWorker(); const input = payment({ type: "advance" }); await request(other, "/payments", input);
  assert.equal((await account(f)).totals.earned, 150); assert.equal((await account(f)).totals.paid, 0);
  assert.equal((await request(f.worker, "/payroll", undefined, { id: otherOwner, role: "admin" })).status, 404);
  assert.equal((await request(f.worker, "/payroll", undefined, null)).status, 401);
  f.staff.action.update = false;
  const staff = { id: employee, role: "Employe", idAdmin: otherOwner, action: { update: true } };
  assert.equal((await request(f.worker, "/payments", payment({ type: "advance" }), staff)).status, 403);
  f.staff.action.update = true;
  assert.equal((await request(f.worker, "/payments", payment({ type: "advance" }), staff)).status, 201);
  f.staff.moduleAccess = ["cashier"];
  assert.equal((await request(f.worker, "/payroll", undefined, staff)).status, 403);
});

test("deleting completed ordinary and sfifa jobs preserves earnings and stock credits", async t => {
  const f = fixture(t);
  for (const details of [{}, { category: "sfifa", garmentType: undefined, quantity: 12, unitWage: 2.5, sfifa: { width: "thick", family: "01-30", code: 12 } }]) {
    const work = await assign(f, details), done = await finish(f, work, 4); assert.equal(done.status, 201);
    const removed = await request(f.worker, `/work/${work._id}`, { version: done.data.__v }, actor, "DELETE"); assert.equal(removed.status, 200);
  }
  const ledger = await account(f); assert.equal(ledger.totals.earned, 210); assert.equal(ledger.entries.filter(row => row.deletedWork).length, 2);
  assert.equal(f.stocks[0].quantity, 4);
});

test("sfifa completion writes stock, wages and receipt atomically and fractional rounding is cumulative", async t => {
  const f = fixture(t), work = await assign(f, { category: "sfifa", garmentType: undefined, quantity: 1, unitWage: 0.01, sfifa: { width: "thin", family: "01-30", code: 1 } });
  f.controls.failStock = true;
  const body = { quantity: 0.333, version: work.__v, requestId: randomUUID() };
  assert.equal((await request(f.worker, `/work/${work._id}/completions`, body)).status, 500);
  assert.equal((await account(f)).totals.earned, 0); assert.equal(f.stocks[0].quantity, 0);
  let done = await request(f.worker, `/work/${work._id}/completions`, body); assert.equal(done.status, 201);
  assert.equal((await request(f.worker, `/work/${work._id}/completions`, body)).status, 200);
  done = await finish(f, done.data, 0.333); assert.equal(done.status, 201);
  done = await finish(f, done.data, 0.334); assert.equal(done.status, 201);
  assert.equal(f.stocks[0].quantity, 1); assert.equal(f.stocks[0].receipts.length, 3);
  const ledger = await account(f); assert.equal(ledger.totals.earned, 0.01); assert.equal(ledger.entries.length, 3);
});

test("legacy unpriced completions are visible and excluded rather than inventing wages", async t => {
  const f = fixture(t), work = await assign(f, { unitWage: undefined }); await finish(f, work, 4);
  const ledger = await account(f); assert.equal(ledger.totals.earned, 0); assert.equal(ledger.totals.unpriced, 1); assert.equal(ledger.entries[0].amount, null);
});

test("money, date, month boundaries and model invariants reject invalid financial history", async t => {
  fixture(t);
  assert.equal(workerPayrollMonth("2026-10-31T23:30:00Z"), "2026-11");
  assert.equal(workerWageCents("12.50", "0.333", "sfifa"), 416);
  assert.equal(validateWorkerPayment(payment({ amount: "12,50" }), "2026-11-03").amount, 12.5);
  for (const extra of [{ amount: 0 }, { amount: -1 }, { amount: "1.001" }, { month: "2026-13" }, { paidOn: "2026-02-30" }, { paidOn: "2026-11-04" }, { type: "other" }, { note: "a\nb" }]) assert.throws(() => validateWorkerPayment(payment(extra), "2026-11-03"));
  assert.equal(workerCompletionEarning({ category: "sfifa", unitWage: 0.01, completedQuantity: 0.333 }, 0.333).earningAmount, 0.01);
  const work = new WorkerWork({ ...job(), idAdmin: owner, createdBy: owner, workerId: owner, requestFingerprint: "test", completedQuantity: 1, completions: [{ requestId: randomUUID(), quantity: 1, before: 10, after: 9, date: new Date(), createdBy: owner, earningAmount: 999, earningMonth: "2026-11" }] });
  await assert.rejects(work.validate());
  const months = buildWorkerPayroll([], []).months; assert.deepEqual(months, []);
});
