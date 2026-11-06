import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "../BackEnd/node_modules/mongoose/index.js";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import TailoringWorker from "../BackEnd/models/TailoringWorker.js";
import WorkerWork from "../BackEnd/models/WorkerWork.js";
import SfifaStock from "../BackEnd/models/SfifaStock.js";
import { remainingWorkQuantity, validateWorkerWork, validateWorkerCompletion, workerWorkTotals } from "../shared/workerWork.js";

const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
const admin = { id: owner, role: "admin" }, stranger = { id: otherOwner, role: "admin" }, staffClaims = { id: employee, role: "Employe", idAdmin: otherOwner, action: { add: true, update: true } };
const previousSecret = process.env.JWT_SECRET;
let server, base;
before(async () => {
  process.env.JWT_SECRET = "sfifa-production-tests";
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});
const query = fn => ({ transaction: null, select() { return this; }, session(value) { this.transaction = value; return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(() => fn(this.transaction)).then(resolve, reject); } });
const input = (patch = {}) => ({ category: "sfifa", quantity: 12, sfifa: { width: "thick", family: "01-30", code: 12 }, requestId: randomUUID(), ...patch });
function setup(t) {
  const workers = [], stocks = [], accounts = new Set([owner, otherOwner]);
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: true } };
  const controls = { failSave: false, conflictOnce: false, duplicateGroup: false, failList: false };
  const same = (a, b) => String(a) === String(b);
  const matches = (row, scope) => Object.entries(scope).every(([key, value]) => {
    if (key.includes(".")) { const [list, field] = key.split("."); return row[list]?.some(item => same(item[field], value)); }
    return same(row[key], value);
  });
  t.mock.method(AdminModel, "findById", id => query(() => accounts.has(String(id)) ? { _id: id } : null));
  t.mock.method(EmployeModel, "findById", id => query(() => String(id) === employee ? staff : null));
  const seedWorker = (idAdmin = owner, categories = ["sfifa", "machine"]) => {
    const row = new TailoringWorker({ name: "أمينة", phone: "0612345678", categories, idAdmin, createdBy: idAdmin, requestId: randomUUID(), requestFingerprint: "test", __v: 0 }); workers.push(row); return row;
  };
  const worker = seedWorker();
  t.mock.method(TailoringWorker, "findOne", scope => query(() => { const row = workers.find(row => matches(row, scope)); return row ? new TailoringWorker(row.toObject()) : null; }));
  t.mock.method(TailoringWorker, "find", scope => query(() => workers.filter(worker => same(worker.idAdmin, scope.idAdmin) && scope._id.$in.includes(String(worker._id)))));
  t.mock.method(WorkerWork, "findOne", () => query(() => null));
  t.mock.method(WorkerWork, "find", () => query(() => []));
  t.mock.method(WorkerWork, "create", async () => { throw new Error("Sfifa must share its stock document"); });
  t.mock.method(WorkerWork.prototype, "save", async () => { throw new Error("Sfifa must share its stock document"); });
  t.mock.method(SfifaStock, "findOne", scope => query(() => { const row = stocks.find(row => matches(row, scope)); return row ? new SfifaStock(row.toObject()) : null; }));
  t.mock.method(SfifaStock, "find", scope => query(() => { if (controls.failList) throw new Error("private read failure"); return stocks.filter(row => matches(row, scope)).map(row => row.toObject()); }));
  const saveStock = t.mock.method(SfifaStock.prototype, "save", async function () {
    await this.validate();
    if (controls.failSave) { controls.failSave = false; throw new Error("private stock failure"); }
    if (controls.conflictOnce) { controls.conflictOnce = false; throw Object.assign(new Error("concurrent write"), { name: "VersionError" }); }
    if (controls.duplicateGroup) { controls.duplicateGroup = false; throw Object.assign(new Error("concurrent parent"), { code: 11000 }); }
    const index = stocks.findIndex(row => same(row._id, this._id));
    if (index >= 0 && stocks[index].__v !== this.__v) throw Object.assign(new Error("stale"), { name: "VersionError" });
    for (const row of stocks.filter(row => same(row.idAdmin, this.idAdmin) && !same(row._id, this._id))) {
      if ((row.width === this.width && row.family === this.family) || (row.production || []).some(work => (this.production || []).some(other => other.requestId === work.requestId)) || row.receipts.some(receipt => this.receipts.some(other => other.requestId === receipt.requestId))) throw Object.assign(new Error("duplicate"), { code: 11000 });
    }
    this.__v = index < 0 ? 0 : this.__v + 1; this.createdAt ||= new Date(); this.updatedAt = new Date();
    if (index < 0) stocks.push(new SfifaStock(this.toObject())); else stocks[index] = new SfifaStock(this.toObject());
    return this;
  });
  const startSession = t.mock.method(mongoose, "startSession", async () => { throw new Error("Standalone MongoDB: transactions must not be used"); });
  const seedStock = ({ width = "thick", family = "01-30", code = 12, quantity = 10, idAdmin = owner, legacy = false } = {}) => {
    let row = stocks.find(row => row.width === width && row.family === family && same(row.idAdmin, idAdmin));
    const value = { width, family, quantity, idAdmin, createdBy: idAdmin, __v: row?.__v ?? 0, unassignedQuantity: legacy ? undefined : 0, variants: legacy ? undefined : [{ code, quantity }] };
    if (row) row.set(value); else { row = new SfifaStock(value); stocks.push(row); } return row;
  };
  return { worker, workers, get records() { return stocks.flatMap(row => row.production || []); }, stocks, accounts, staff, controls, seedWorker, seedStock, startSession, saveStock };
}
async function request(path, { body, method = body === undefined ? "GET" : "POST", actor = admin } = {}) {
  return fetch(`${base}${path}`, { method, headers: { ...(actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const workPath = worker => `/tailoring-workers/${worker._id}/work`;
const assign = async (worker, body = input(), actor) => { const response = await request(workPath(worker), { body, ...(actor === undefined ? {} : { actor }) }); assert.equal(response.status, 201); return response.json(); };
const completionBody = (work, quantity, patch = {}) => ({ quantity, requestId: randomUUID(), version: work.__v, ...patch });
const complete = (worker, work, body, actor) => request(`${workPath(worker)}/${work._id}/completions`, { body, ...(actor === undefined ? {} : { actor }) });

test("sfifa assignments validate specific family numbers and exact fractional meters", () => {
  assert.deepEqual(validateWorkerWork(input({ quantity: "2,125", sfifa: { width: "thin", family: "01-30", code: "01" } })), { productName: "Sfifa", quantity: 2.125, category: "sfifa", sfifa: { width: "thin", family: "01-30", code: 1 } });
  for (const [family, codes] of [["01-30", [1, 30]], ["1426-1432", [1426, 1432]], ["8080-8097", [8080, 8097]]]) for (const code of codes) assert.equal(validateWorkerWork(input({ sfifa: { width: "thick", family, code } })).sfifa.code, code);
  for (const quantity of [0, -1, "0.0001", "1e2", true, 1000001]) assert.throws(() => validateWorkerWork(input({ quantity })), error => error.fields.quantity === "invalidMeters");
  for (const sfifa of [{}, { width: "other", family: "01-30", code: 1 }, { width: "thin", family: "1426-1432", code: 12 }]) assert.throws(() => validateWorkerWork(input({ sfifa })), /invalidWork/);
  assert.throws(() => validateWorkerCompletion({ quantity: 0.201 }, 0.2, "sfifa"), error => error.fields.quantity === "exceedsRemainingMeters");
  assert.equal(remainingWorkQuantity({ quantity: 0.3, completedQuantity: 0.1, category: "sfifa" }), 0.2);
  assert.deepEqual(workerWorkTotals([{ quantity: 0.1, completedQuantity: 0, category: "sfifa" }, { quantity: 0.2, completedQuantity: 0.1, category: "sfifa" }], "sfifa"), { quantity: 0.3, completedQuantity: 0.1, remainingQuantity: 0.2 });
});

test("assigning 12 m does not change stock; completing 4 m leaves 8 m and adds exactly 4 m", async t => {
  const f = setup(t), work = await assign(f.worker, input({ idAdmin: otherOwner, sfifa: { width: "thick", family: "01-30", code: "012" } }));
  assert.deepEqual(work.sfifa, { width: "thick", family: "01-30", code: 12 }); assert.equal(f.stocks[0].quantity, 0); assert.equal(f.stocks[0].variants.length, 0); assert.equal(f.startSession.mock.callCount(), 0);
  const beforeProduction = await (await request("/sfifa-stock")).json(); assert.deepEqual(beforeProduction.items, []);
  const start = Date.now(), response = await complete(f.worker, work, completionBody(work, 4, { date: "2000-01-01", sfifa: { width: "thin", family: "8080-8097", code: 8080 } }));
  assert.equal(response.status, 201); const done = await response.json();
  assert.deepEqual([done.quantity, done.completedQuantity, done.remainingQuantity], [12, 4, 8]);
  assert.deepEqual([f.stocks[0].width, f.stocks[0].family, f.stocks[0].variants[0].code, f.stocks[0].variants[0].quantity, f.stocks[0].quantity], ["thick", "01-30", 12, 4, 4]);
  const receipt = f.stocks[0].receipts[0]; assert.equal(String(receipt.workId), work._id); assert.equal(String(receipt.workerId), String(f.worker._id)); assert.equal(String(f.stocks[0].idAdmin), owner);
  assert.ok(new Date(done.completions[0].date).getTime() >= start); assert.equal(receipt.date.toISOString(), done.completions[0].date);
  assert.deepEqual([done.completions[0].before, done.completions[0].after], [12, 8]); assert.equal(done.completions[0].requestId, undefined);
  const list = await (await request(`${workPath(f.worker)}?category=sfifa`)).json(); assert.equal(list.works[0].remainingQuantity, 8);
  const stockList = await (await request("/sfifa-stock")).json(); assert.equal(stockList.items[0].code, 12); assert.equal(stockList.items[0].quantity, 4);
});

test("production increases an existing matching number and preserves other numbers, widths and legacy stock", async t => {
  const f = setup(t); f.seedStock(); f.seedStock({ width: "thin", quantity: 20 }); f.seedStock({ family: "1426-1432", code: 1426, quantity: 3 });
  const work = await assign(f.worker), done = await complete(f.worker, work, completionBody(work, 4)); assert.equal(done.status, 201);
  assert.deepEqual(f.stocks.map(row => row.quantity), [14, 20, 3]);
  const second = await assign(f.worker, input({ sfifa: { width: "thick", family: "01-30", code: 13 } })); await complete(f.worker, second, completionBody(second, 2.5));
  assert.equal(f.stocks[0].quantity, 16.5); assert.deepEqual(f.stocks[0].variants.map(row => [row.code, row.quantity]), [[12, 14], [13, 2.5]]);
  const legacy = f.seedStock({ width: "thin", family: "8080-8097", quantity: 7, legacy: true });
  const third = await assign(f.worker, input({ sfifa: { width: "thin", family: "8080-8097", code: 8081 } })); assert.equal((await complete(f.worker, third, completionBody(third, 1.125))).status, 201);
  const preserved = f.stocks.find(row => String(row._id) === String(legacy._id)); assert.equal(preserved.unassignedQuantity, 7); assert.equal(preserved.quantity, 8.125); assert.equal(preserved.variants[0].quantity, 1.125);
});

test("fractional completions finish exactly without rounding drift and cannot exceed remaining meters", async t => {
  const f = setup(t), work = await assign(f.worker, input({ quantity: 0.3 }));
  const first = await complete(f.worker, work, completionBody(work, "0,1")); assert.equal(first.status, 201); const partial = await first.json(); assert.equal(partial.remainingQuantity, 0.2);
  const tooMuch = await complete(f.worker, partial, completionBody(partial, 0.201)); assert.equal(tooMuch.status, 400); assert.equal((await tooMuch.json()).fields.quantity, "exceedsRemainingMeters");
  const second = await complete(f.worker, partial, completionBody(partial, 0.2)); assert.equal(second.status, 201); const done = await second.json(); assert.equal(done.remainingQuantity, 0); assert.equal(done.completedQuantity, 0.3); assert.equal(f.stocks[0].quantity, 0.3);
  assert.equal((await complete(f.worker, done, completionBody(done, 0.001))).status, 400); assert.equal(f.stocks[0].receipts.length, 2);
});

test("lost-response retries and concurrent duplicate completions add meters only once", async t => {
  const f = setup(t), work = await assign(f.worker), body = completionBody(work, 4);
  const responses = await Promise.all([complete(f.worker, work, body), complete(f.worker, work, body)]); assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]);
  assert.equal(f.records[0].completedQuantity, 4); assert.equal(f.stocks[0].quantity, 4); assert.equal(f.stocks[0].receipts.length, 1);
  assert.equal((await complete(f.worker, work, body)).status, 200); assert.equal((await complete(f.worker, work, { ...body, quantity: 3 })).status, 409);
  const partial = await responses[0].json(); await complete(f.worker, partial, completionBody(partial, 8)); assert.equal((await complete(f.worker, work, body)).status, 200); assert.equal(f.stocks[0].quantity, 12);
});

test("different stale completions cannot over-deduct, while independent workers can share one stock number", async t => {
  const f = setup(t), work = await assign(f.worker), other = f.seedWorker(), second = await assign(other);
  const results = await Promise.all([complete(f.worker, work, completionBody(work, 10)), complete(f.worker, work, completionBody(work, 10))]); assert.deepEqual(results.map(row => row.status).sort(), [201, 409]); assert.equal(f.stocks[0].quantity, 10);
  assert.equal((await complete(other, second, completionBody(second, 2.5))).status, 201); assert.equal(f.stocks[0].quantity, 12.5); assert.equal(f.records[1].completedQuantity, 2.5);
});

test("one failed atomic save changes neither stock nor work and the same request remains retryable", async t => {
  const f = setup(t), work = await assign(f.worker), body = completionBody(work, 4), before = f.saveStock.mock.callCount();
  f.controls.failSave = true; const response = await complete(f.worker, work, body); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { message: "saveWorkFailed" });
  assert.equal(f.records[0].completedQuantity, 0); assert.equal(f.records[0].completions.length, 0); assert.equal(f.stocks[0].quantity, 0); assert.equal(f.stocks[0].receipts.length, 0);
  assert.equal(f.saveStock.mock.callCount(), before + 1);
  assert.equal((await complete(f.worker, work, body)).status, 201); assert.equal(f.stocks[0].quantity, 4); assert.equal(f.startSession.mock.callCount(), 0);
});

test("optimistic write and concurrent parent retries restart from committed state", async t => {
  const f = setup(t); f.controls.duplicateGroup = true; const work = await assign(f.worker); f.controls.conflictOnce = true;
  assert.equal((await complete(f.worker, work, completionBody(work, 4))).status, 201); assert.equal(f.stocks[0].quantity, 4); assert.equal(f.stocks[0].receipts.length, 1); assert.equal(f.records[0].completions.length, 1);
});

test("stock limits leave both work and stock unchanged", async t => {
  const f = setup(t), work = await assign(f.worker); f.seedStock({ quantity: 1000000 });
  const limit = await complete(f.worker, work, completionBody(work, 1)); assert.equal(limit.status, 409); assert.deepEqual(await limit.json(), { message: "sfifaStockLimit" }); assert.equal(f.records[0].completedQuantity, 0); assert.equal(f.stocks[0].quantity, 1000000); assert.equal(f.stocks[0].receipts.length, 0);
});

test("current permissions and owner/worker scope protect automatic stock credits", async t => {
  const f = setup(t), work = await assign(f.worker), otherWorker = f.seedWorker(), foreign = f.seedWorker(otherOwner), foreignWork = await assign(foreign, input(), stranger);
  for (const actor of [null, { id: owner, role: "visitor" }, stranger]) assert.ok([401, 403, 404].includes((await complete(f.worker, work, completionBody(work, 1), actor)).status));
  assert.equal((await complete(otherWorker, work, completionBody(work, 1))).status, 404); assert.equal((await complete(foreign, foreignWork, completionBody(foreignWork, 1))).status, 404);
  f.staff.action.add = false; f.staff.action.update = false; assert.equal((await complete(f.worker, work, completionBody(work, 1), staffClaims)).status, 403);
  f.staff.action.update = true; assert.equal((await complete(f.worker, work, completionBody(work, 1), staffClaims)).status, 201); assert.equal(String(f.stocks[0].receipts[0].createdBy), employee); assert.equal(String(f.stocks[0].idAdmin), owner);
  f.staff.isActive = false; assert.equal((await request(`${workPath(f.worker)}?category=sfifa`, { actor: staffClaims })).status, 403);
});

test("assignment membership and request identity include the complete sfifa selection", async t => {
  const f = setup(t), body = input(), work = await assign(f.worker, body);
  assert.equal((await request(workPath(f.worker), { body })).status, 200);
  for (const patch of [{ quantity: 13 }, { sfifa: { ...body.sfifa, width: "thin" } }, { sfifa: { ...body.sfifa, code: 13 } }]) assert.equal((await request(workPath(f.worker), { body: { ...body, ...patch } })).status, 409);
  f.worker.categories = ["machine"]; assert.equal((await request(workPath(f.worker), { body: input() })).status, 409);
  const historical = await (await request(`${workPath(f.worker)}?category=sfifa`)).json(); assert.equal(historical.canAssign, false); assert.equal(historical.works.length, 1);
  assert.equal((await complete(f.worker, work, completionBody(work, 4))).status, 201);
});

test("a completion UUID already used for another stock receipt cannot credit or deduct again", async t => {
  const f = setup(t), work = await assign(f.worker), second = await assign(f.worker), body = completionBody(work, 4);
  assert.equal((await complete(f.worker, work, body)).status, 201);
  const response = await complete(f.worker, second, { ...body, version: second.__v }); assert.equal(response.status, 409); assert.equal((await response.json()).message, "workRequestConflict"); assert.equal(f.records[1].completedQuantity, 0); assert.equal(f.stocks[0].quantity, 4);
});

test("the model rejects invalid sfifa identities, excess decimal precision and inconsistent histories", async t => {
  const f = setup(t), work = await assign(f.worker, input({ quantity: 0.3 }));
  for (const patch of [{ sfifa: undefined }, { sfifa: { width: "thin", family: "01-30", code: 31 } }, { quantity: 0.0001 }, { completedQuantity: 0.1 }]) await assert.rejects(new WorkerWork({ ...f.records[0].toObject(), ...patch }).validate());
  const response = await complete(f.worker, work, completionBody(work, 0.1)); assert.equal(response.status, 201); const corrupt = new WorkerWork(f.records[0].toObject()); corrupt.completions[0].after = 0.199; await assert.rejects(corrupt.validate());
  const missingReceipt = new SfifaStock(f.stocks[0].toObject()); missingReceipt.receipts = []; await assert.rejects(missingReceipt.validate());
});

test("manual stock corrections and restocks preserve the worker history and independent work versions", async t => {
  const f = setup(t), work = await assign(f.worker), body = completionBody(work, 4);
  const partial = await (await complete(f.worker, work, body)).json();
  let stock = f.stocks[0]; const variant = stock.variants[0];
  const corrected = await request(`/sfifa-stock/${stock._id}/variants/${variant._id}`, { method: "PUT", body: { quantity: 2, version: stock.__v } }); assert.equal(corrected.status, 200);
  const added = await request("/sfifa-stock", { body: { width: "thick", family: "01-30", code: 12, quantity: 3, requestId: randomUUID() } }); assert.equal(added.status, 201);
  stock = f.stocks[0]; assert.equal(stock.quantity, 5); assert.equal(stock.production[0].__v, partial.__v); assert.equal(stock.production[0].completions.length, 1);
  const next = await complete(f.worker, partial, completionBody(partial, 1)); assert.equal(next.status, 201); assert.equal((await next.json()).remainingQuantity, 7); assert.equal(f.stocks[0].quantity, 6);
  assert.equal(f.stocks[0].production[0].completions.length, 2);
});

test("concurrent assignment retries and assignments to different families keep one work per request", async t => {
  const f = setup(t), body = input();
  const responses = await Promise.all([request(workPath(f.worker), { body }), request(workPath(f.worker), { body })]); assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]); assert.equal(f.records.length, 1);
  const changed = await request(workPath(f.worker), { body: { ...body, sfifa: { width: "thin", family: "1426-1432", code: 1426 } } }); assert.equal(changed.status, 409); assert.equal(f.records.length, 1);
});

test("stock deletion preserves worker production and old completion receipts; new work restores only new meters", async t => {
  const f = setup(t), work = await assign(f.worker), body = completionBody(work, 4);
  const completed = await complete(f.worker, work, body); assert.equal(completed.status, 201); const partial = await completed.json();
  const stock = (await (await request("/sfifa-stock")).json()).items[0];
  const removed = await request(`/sfifa-stock/${stock.parentId}/variants/${stock._id}`, { method: "DELETE", body: { version: stock.__v } }); assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).items, []); assert.equal(f.stocks[0].quantity, 0); assert.equal(f.records.length, 1); assert.equal(f.records[0].completedQuantity, 4); assert.equal(f.stocks[0].receipts.length, 1);
  assert.equal((await complete(f.worker, work, body)).status, 200); assert.equal(f.stocks[0].quantity, 0);
  const next = await complete(f.worker, partial, completionBody(partial, 2)); assert.equal(next.status, 201); assert.equal(f.stocks[0].quantity, 2); assert.equal(f.records[0].completedQuantity, 6);
  const visible = (await (await request("/sfifa-stock")).json()).items; assert.equal(visible.length, 1); assert.equal(visible[0].quantity, 2); assert.notEqual(visible[0]._id, stock._id);
  await f.stocks[0].validate();
});

const stockHistory = stock => request(`/sfifa-stock/${stock.parentId}/variants/${stock._id}/history`);

test("client sfifa records partial and full completion with wages but no stock or stock receipt", async t => {
  const f = setup(t), work = await assign(f.worker, input({ workType: "client", unitWage: 2.5 }));
  const response = await complete(f.worker, work, completionBody(work, 4)); assert.equal(response.status, 201);
  const partial = await response.json();
  assert.deepEqual([partial.completedQuantity, partial.remainingQuantity, partial.completions[0].earningAmount], [4, 8, 10]);
  assert.equal(f.records[0].completions[0].stockCredited, false);
  assert.equal(f.stocks[0].quantity, 0); assert.deepEqual(f.stocks[0].variants.toObject(), []); assert.equal(f.stocks[0].receipts.length, 0);
  const last = await complete(f.worker, partial, completionBody(partial, 8)); assert.equal(last.status, 201);
  const done = await last.json(); assert.deepEqual([done.completedQuantity, done.remainingQuantity], [12, 0]);
  assert.equal(done.completions.reduce((sum, event) => sum + event.earningAmount, 0), 30);
  assert.equal(f.stocks[0].quantity, 0); assert.equal(f.stocks[0].receipts.length, 0);
  assert.deepEqual((await (await request("/sfifa-stock")).json()).items, []);
  const listed = await (await request(`${workPath(f.worker)}?category=sfifa`)).json();
  assert.equal(listed.works[0].workType, "client"); assert.equal(listed.works[0].completions.length, 2);
});

test("only shop work increases shared sfifa stock and its restock history", async t => {
  const f = setup(t); f.seedStock({ quantity: 10 });
  const shop = await assign(f.worker, input({ workType: "shop" }));
  assert.equal((await complete(f.worker, shop, completionBody(shop, 4, { workType: "client", stockCredited: false }))).status, 201);
  assert.equal(f.records[0].completions[0].stockCredited, true);
  for (const code of [12, 13]) {
    const client = await assign(f.worker, input({ workType: "client", sfifa: { width: "thick", family: "01-30", code } }));
    assert.equal((await complete(f.worker, client, completionBody(client, 12, { workType: "shop", stockCredited: true }))).status, 201);
  }
  assert.equal(f.stocks[0].quantity, 14); assert.deepEqual(f.stocks[0].variants.map(row => [row.code, row.quantity]), [[12, 14]]);
  assert.equal(f.stocks[0].receipts.length, 1);
  const visible = (await (await request("/sfifa-stock")).json()).items;
  assert.equal(visible.length, 1); const history = await (await stockHistory(visible[0])).json();
  assert.equal(history.entries.length, 1); assert.equal(history.entries[0].quantity, 4); assert.equal(history.entries[0].source, "worker");
});

test("client completion ignores stock capacity and preserves unnumbered legacy inventory", async t => {
  const f = setup(t);
  for (const legacy of [false, true]) {
    const family = legacy ? "8080-8097" : "01-30", code = legacy ? 8080 : 12;
    const seeded = f.seedStock({ family, code, quantity: legacy ? 7 : 1000000, legacy });
    const work = await assign(f.worker, input({ workType: "client", sfifa: { width: "thick", family, code } }));
    assert.equal((await complete(f.worker, work, completionBody(work, 4))).status, 201);
    const stock = f.stocks.find(row => String(row._id) === String(seeded._id));
    assert.equal(stock.quantity, legacy ? 7 : 1000000); assert.equal(stock.receipts.length, 0);
    if (legacy) { assert.equal(stock.variants, undefined); assert.equal(stock.unassignedQuantity, undefined); }
    else assert.equal(stock.variants[0].quantity, 1000000);
  }
});

test("failed saves and duplicate retries record client completion and wages exactly once", async t => {
  const f = setup(t), work = await assign(f.worker, input({ workType: "client", unitWage: 2.5 })), body = completionBody(work, 4);
  f.controls.failSave = true;
  assert.equal((await complete(f.worker, work, body)).status, 500);
  assert.equal(f.records[0].completedQuantity, 0); assert.equal(f.records[0].completions.length, 0);
  const responses = await Promise.all([complete(f.worker, work, body), complete(f.worker, work, body)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  assert.equal((await complete(f.worker, work, body)).status, 200);
  assert.equal((await complete(f.worker, work, { ...body, quantity: 3 })).status, 409);
  assert.equal(f.records[0].completedQuantity, 4); assert.equal(f.records[0].completions.length, 1);
  assert.equal(f.records[0].completions[0].earningAmount, 10);
  assert.equal(f.stocks[0].quantity, 0); assert.equal(f.stocks[0].receipts.length, 0);
});

test("legacy client stock receipts remain valid while later client completions do not credit inventory", async t => {
  const f = setup(t), work = await assign(f.worker);
  const partial = await (await complete(f.worker, work, completionBody(work, 4))).json();
  f.records[0].workType = "client"; f.records[0].completions[0].stockCredited = undefined;
  await f.stocks[0].validate();
  const corrupt = new SfifaStock(f.stocks[0].toObject()); corrupt.receipts = [];
  await assert.rejects(corrupt.validate());
  assert.equal((await complete(f.worker, partial, completionBody(partial, 8))).status, 201);
  assert.equal(f.stocks[0].quantity, 4); assert.equal(f.stocks[0].receipts.length, 1);
  assert.deepEqual(f.records[0].completions.map(event => event.stockCredited), [undefined, false]);
  await f.stocks[0].validate();
  const creditedClient = new SfifaStock(f.stocks[0].toObject()); creditedClient.production[0].completions[0].stockCredited = false;
  await assert.rejects(creditedClient.validate());
  const missingMarker = new SfifaStock(f.stocks[0].toObject()); missingMarker.production[0].completions[1].stockCredited = undefined;
  await assert.rejects(missingMarker.validate());
  const falseShop = new SfifaStock(f.stocks[0].toObject()); falseShop.production[0].workType = "shop";
  await assert.rejects(falseShop.validate());
});

test("history distinguishes manual restocks from worker production and saves the trusted worker name with each completion", async t => {
  const f = setup(t), work = await assign(f.worker), body = completionBody(work, 4, { workerName: "forged name" });
  const completed = await complete(f.worker, work, body); assert.equal(completed.status, 201);
  const stock = (await (await request("/sfifa-stock")).json()).items[0];
  const manual = await request("/sfifa-stock", { body: { width: "thick", family: "01-30", code: 12, quantity: 3, requestId: randomUUID() } }); assert.equal(manual.status, 201);
  let entries = (await (await stockHistory(stock)).json()).entries;
  assert.equal(entries.length, 2); assert.equal(entries.find(row => row.source === "worker").quantity, 4); assert.equal(entries.find(row => row.source === "worker").workerName, "أمينة");
  assert.equal(entries.find(row => row.source === "manual").quantity, 3); assert.equal(entries.find(row => row.source === "manual").workerName, "");
  assert.equal(f.stocks[0].receipts[0].workerName, "أمينة");
  f.worker.name = "اسم جديد"; entries = (await (await stockHistory(stock)).json()).entries;
  assert.equal(entries.find(row => row.source === "worker").workerName, "أمينة");
  f.workers.length = 0; entries = (await (await stockHistory(stock)).json()).entries;
  assert.equal(entries.find(row => row.source === "worker").workerName, "أمينة");
});

test("previous worker receipts gain a name from their worker, and remain identified as production if the worker is unavailable", async t => {
  const f = setup(t), work = await assign(f.worker), body = completionBody(work, "0,125");
  assert.equal((await complete(f.worker, work, body)).status, 201);
  const stock = (await (await request("/sfifa-stock")).json()).items[0];
  f.stocks[0].receipts[0].workerName = undefined;
  let entries = (await (await stockHistory(stock)).json()).entries;
  assert.equal(entries[0].source, "worker"); assert.equal(entries[0].workerName, "أمينة"); assert.equal(entries[0].quantity, 0.125);
  assert.equal((await complete(f.worker, work, body)).status, 200); assert.equal((await (await stockHistory(stock)).json()).entries.length, 1);
  f.workers.length = 0; entries = (await (await stockHistory(stock)).json()).entries;
  assert.equal(entries[0].source, "worker"); assert.equal(entries[0].workerName, "");
});
