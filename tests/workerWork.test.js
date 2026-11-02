import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID, createHash } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import TailoringWorker from "../BackEnd/models/TailoringWorker.js";
import WorkerWork from "../BackEnd/models/WorkerWork.js";
import SfifaStock from "../BackEnd/models/SfifaStock.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import { validateTailoringOrder } from "../shared/tailoring.js";
import { WORK_TRACKING_CATEGORIES, parseWorkQuantity, trouserWorkTotals, validateWorkerCompletion, validateWorkerWork } from "../shared/workerWork.js";

const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
const admin = { id: owner, role: "admin" }, stranger = { id: otherOwner, role: "admin" }, staffClaims = { id: employee, role: "Employe", idAdmin: otherOwner, action: { add: true, update: true } };
const previousSecret = process.env.JWT_SECRET;
let server, base;
before(async () => {
  process.env.JWT_SECRET = "worker-work-tests";
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/tailoring-workers`;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});
const query = fn => ({ select() { return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } });
const input = (patch = {}) => ({ productName: "جلابة", quantity: 30, category: "machine", requestId: randomUUID(), ...patch });
function setup(t) {
  t.mock.method(SfifaStock, "findOne", async () => null);
  t.mock.method(SfifaStock, "find", () => query(() => []));
  const workers = [], records = [], orders = [], accounts = new Set([owner, otherOwner]);
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: true } };
  t.mock.method(AdminModel, "findById", id => query(() => accounts.has(String(id)) ? { _id: id } : null));
  t.mock.method(EmployeModel, "findById", id => query(() => String(id) === employee ? staff : null));
  const seedWorker = (idAdmin = owner, categories = ["machine", "sfifa", "finishing", "brim"]) => {
    const row = new TailoringWorker({ name: "أمينة", phone: "0612345678", categories, idAdmin, createdBy: idAdmin, requestId: randomUUID(), requestFingerprint: "test", __v: 0 });
    workers.push(row); return row;
  };
  const worker = seedWorker();
  const seedOrder = (idAdmin = owner, patch = {}) => {
    const items = [0, 1].map(index => ({ lineId: randomUUID().replaceAll("-", "").slice(0, 24), price: 500, fabricSource: "client", fabricType: index ? "مخمل" : "ساتان", fabricColor: index ? "أخضر" : "أزرق", sfifa: { width: index ? "thick" : "thin", style: "fabric" } }));
    const row = new TailoringOrder({ ...validateTailoringOrder({ clientName: "فاطمة", phone: "0612345678", orderDate: "2026-10-22", readyDate: "2026-11-04", paidAmount: 200, items }), idAdmin, createdBy: idAdmin, requestId: randomUUID(), requestFingerprint: "test", __v: 0, ...patch });
    orders.push(row); return row;
  };
  t.mock.method(TailoringOrder, "find", scope => query(() => orders.filter(row => String(row.idAdmin) === String(scope.idAdmin)).map(row => row.toObject())));
  t.mock.method(TailoringOrder, "findOne", async scope => { const row = orders.find(row => String(row.idAdmin) === String(scope.idAdmin) && String(row._id) === String(scope._id).toLowerCase()); return row ? new TailoringOrder(row.toObject()) : null; });
  t.mock.method(TailoringWorker, "findOne", async scope => { const row = workers.find(row => String(row._id) === String(scope._id).toLowerCase() && String(row.idAdmin) === String(scope.idAdmin)); return row ? new TailoringWorker(row.toObject()) : null; });
  t.mock.method(TailoringWorker, "find", scope => query(() => workers.filter(worker => String(worker.idAdmin) === String(scope.idAdmin) && scope._id.$in.includes(String(worker._id)))));
  const matches = (row, scope) => String(row.idAdmin) === String(scope.idAdmin) && (!scope._id || String(row._id) === String(scope._id).toLowerCase()) && (!scope.workerId || String(row.workerId) === String(scope.workerId)) && (!scope.category || row.category === scope.category) && (!scope.requestId || row.requestId === scope.requestId);
  const find = t.mock.method(WorkerWork, "find", scope => query(() => records.filter(row => matches(row, scope)).map(row => row.toObject()).sort((a, b) => b.createdAt - a.createdAt)));
  t.mock.method(WorkerWork, "findOne", async scope => { const row = records.find(row => matches(row, scope)); return row ? new WorkerWork(row.toObject()) : null; });
  const create = t.mock.method(WorkerWork, "create", async value => {
    const row = new WorkerWork({ ...value, __v: 0, createdAt: new Date(), updatedAt: new Date() }); await row.validate();
    if (records.some(record => String(record.idAdmin) === String(value.idAdmin) && record.requestId === value.requestId)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    if (value.workType === "client" && value.tailoring && records.some(record => record.workType === "client" && String(record.idAdmin) === String(value.idAdmin) && record.category === value.category && String(record.tailoring?.orderId) === String(value.tailoring.orderId) && record.tailoring.lineIds.some(id => value.tailoring.lineIds.includes(id)))) throw Object.assign(new Error("duplicate garment"), { code: 11000 });
    records.push(row); return row;
  });
  const save = t.mock.method(WorkerWork.prototype, "save", async function () {
    await this.validate();
    const index = records.findIndex(row => String(row._id) === String(this._id));
    if (index < 0 || records[index].__v !== this.__v) throw Object.assign(new Error("Concurrent write"), { name: "VersionError" });
    this.__v += 1; this.updatedAt = new Date(); records[index] = new WorkerWork(this.toObject()); return this;
  });
  return { worker, workers, records, orders, accounts, staff, seedWorker, seedOrder, find, create, save };
}
async function request(worker, { body, suffix = "", method = body === undefined ? "GET" : "POST", actor = admin, category = "machine" } = {}) {
  const headers = actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const id = typeof worker === "string" ? worker : String(worker._id);
  return fetch(`${base}/${id}/work${suffix}${method === "GET" ? `?category=${encodeURIComponent(category)}` : ""}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const seedLegacyWork = async (fixture, worker, body) => {
  const input = validateWorkerWork(body, { allowLegacyTrouserClient: true });
  const requestFingerprint = createHash("sha256").update(JSON.stringify({ ...input, workerId: String(worker._id) })).digest("hex");
  const row = await fixture.create({ ...input, workerId: worker._id, idAdmin: owner, createdBy: owner, requestId: body.requestId, requestFingerprint });
  return { ...JSON.parse(JSON.stringify(row)), remainingQuantity: row.quantity };
};
const assign = async (worker, body = input(), actor) => { const response = await request(worker, { body, ...(actor === undefined ? {} : { actor }) }); assert.equal(response.status, 201); return response.json(); };
const completionBody = (work, quantity, patch = {}) => ({ quantity, requestId: randomUUID(), version: work.__v, ...patch });
const complete = (worker, work, body, actor) => request(worker, { suffix: `/${work._id}/completions`, body, ...(actor === undefined ? {} : { actor }) });

const increaseBody = (work, quantity, patch = {}) => ({ quantity, version: work.__v, requestId: randomUUID(), ...patch });
const increase = (worker, work, body, actor) => request(worker, { suffix: `/${work._id}/increases`, body, ...(actor ? { actor } : {}) });
const remove = (worker, work, actor) => request(worker, { suffix: `/${work._id}`, method: "DELETE", body: { version: work.__v }, ...(actor ? { actor } : {}) });

test("ordinary sections increase 3 by 2 without rewriting earlier completions", async t => {
  const f = setup(t), worker = f.seedWorker(owner, ["machine", "finishing", "brim", "trousers"]);
  for (const category of ["machine", "finishing", "brim", "trousers"]) {
    const work = await assign(worker, input({ category, quantity: 3, workType: "shop" }));
    const completed = await (await complete(worker, work, completionBody(work, 1))).json();
    const response = await increase(worker, completed, increaseBody(completed, 2)); assert.equal(response.status, 201);
    const added = await response.json(); assert.deepEqual([added.quantity, added.completedQuantity, added.remainingQuantity], [5, 1, 4]);
    assert.deepEqual([added.completions[0].before, added.completions[0].after], [3, 2]);
    assert.deepEqual([added.additions[0].before, added.additions[0].after], [2, 4]);
    assert.ok(new Date(added.additions[0].date).getTime() > Date.now() - 10000);
    assert.equal((await complete(worker, added, completionBody(added, 4))).status, 201);
  }
});
test("increases reopen completed trousers and preserve their type statistics", async t => {
  const f = setup(t), worker = f.seedWorker(owner, ["trousers"]);
  const work = await seedLegacyWork(f, worker, input({ category: "trousers", workType: "client", trouserType: "regular", quantity: 3 }));
  const finished = await (await complete(worker, work, completionBody(work, 3))).json();
  const response = await increase(worker, finished, increaseBody(finished, 2)); assert.equal(response.status, 201);
  assert.deepEqual(trouserWorkTotals([await response.json()]), { regular: { quantity: 5, completedQuantity: 3, remainingQuantity: 2 }, qandrissi: { quantity: 0, completedQuantity: 0, remainingQuantity: 0 } });
});
test("retries and concurrent duplicates add once and reject different stale inputs", async t => {
  const f = setup(t), work = await assign(f.worker, input({ quantity: 3 })), body = increaseBody(work, 2);
  const responses = await Promise.all([increase(f.worker, work, body), increase(f.worker, work, body)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  assert.equal(f.records[0].quantity, 5); assert.equal(f.records[0].additions.length, 1);
  assert.equal((await increase(f.worker, work, body)).status, 200);
  assert.equal((await increase(f.worker, work, { ...body, quantity: 1 })).status, 409);
  assert.equal((await increase(f.worker, work, increaseBody(work, 1))).status, 409);
});
test("linked increases derive their count from extra garments in the same order", async t => {
  const f = setup(t), order = f.seedOrder();
  const work = await assign(f.worker, clientInput(order, { lineIds: [order.items[0].lineId] }));
  const body = increaseBody(work, 999, { lineIds: [order.items[1].lineId] });
  const response = await increase(f.worker, work, body); assert.equal(response.status, 201);
  const added = await response.json(); assert.equal(added.quantity, 2); assert.equal(added.tailoring.items.length, 2); assert.equal(added.additions[0].quantity, 1);
  assert.equal((await increase(f.worker, work, body)).status, 200);
  assert.equal((await increase(f.worker, added, increaseBody(added, 1, { lineIds: [order.items[0].lineId] }))).status, 409);
});
test("delete hides work and preserves history while rejecting stale completion and assignment retries", async t => {
  const f = setup(t), assignment = input({ quantity: 3 }), work = await assign(f.worker, assignment);
  const completed = await (await complete(f.worker, work, completionBody(work, 1))).json();
  assert.equal((await remove(f.worker, completed)).status, 200); assert.equal((await remove(f.worker, work)).status, 200);
  assert.equal((await (await request(f.worker)).json()).works.length, 0);
  assert.ok(f.records[0].deletedAt); assert.equal(f.records[0].completions.length, 1);
  assert.equal((await complete(f.worker, completed, completionBody(completed, 1))).status, 409);
  assert.equal((await increase(f.worker, completed, increaseBody(completed, 1))).status, 409);
  assert.equal((await request(f.worker, { body: assignment })).status, 409);
});
test("deleting linked work releases its garments and preserves the archived order", async t => {
  const f = setup(t), order = f.seedOrder(), work = await assign(f.worker, clientInput(order));
  assert.equal((await remove(f.worker, work)).status, 200);
  assert.equal(f.records[0].tailoring, undefined); assert.equal(String(f.records[0].archivedTailoring.orderId), String(order._id));
  assert.equal((await assign(f.seedWorker(), clientInput(order))).tailoring.items.length, 2);
});
test("changes enforce permissions, ownership, limits and fresh versions", async t => {
  const f = setup(t), work = await assign(f.worker, input({ quantity: 3 })); f.staff.action.add = false;
  assert.equal((await increase(f.worker, work, increaseBody(work, 2), staffClaims)).status, 403);
  assert.equal((await remove(f.worker, work, staffClaims)).status, 403);
  assert.equal((await remove(f.worker, work, stranger)).status, 404);
  assert.equal((await remove(f.worker, { ...work, __v: 9 })).status, 409);
  for (const quantity of [0, -1, 1.5, "bad", 1000000]) assert.equal((await increase(f.worker, work, increaseBody(work, quantity))).status, 400);
  f.staff.action.delete = true; assert.equal((await remove(f.worker, work, staffClaims)).status, 200);
  assert.equal(String(f.records[0].deletedBy), employee);
});
test("failed increase writes leave quantity and history unchanged and allow retry", async t => {
  const f = setup(t), work = await assign(f.worker, input({ quantity: 3 })), body = increaseBody(work, 2);
  f.save.mock.mockImplementationOnce(async () => { throw new Error("failed write"); });
  assert.equal((await increase(f.worker, work, body)).status, 500); assert.equal(f.records[0].quantity, 3); assert.equal(f.records[0].additions.length, 0);
  assert.equal((await increase(f.worker, work, body)).status, 201);
});

test("new client trousers require an existing order while legacy normalization remains available for retries", () => {
  assert.throws(() => validateWorkerWork(input({ category: "trousers", workType: "client", productName: "محمد", trouserType: "regular" })), error => error.fields.orderId === "chooseOrder");
  const selected = validateWorkerWork(input({ category: "trousers", workType: "client", orderId: otherOwner, lineIds: [owner] }));
  assert.deepEqual(selected, { workType: "client", orderId: otherOwner, lineIds: [owner], quantity: 1, category: "trousers" });
  assert.equal(validateWorkerWork(input({ category: "trousers", workType: "client", trouserType: "regular", productName: "محمد" }), { allowLegacyTrouserClient: true }).trouserType, "regular");
});

test("trousers keep sale work, regular clients and qandrissi clients independent after completion and reload", async t => {
  const f = setup(t), worker = f.seedWorker(owner, ["trousers"]);
  const normal = await seedLegacyWork(f, worker, input({ category: "trousers", workType: "client", trouserType: "regular", productName: "محمد", quantity: 12 }));
  const qandrissi = await seedLegacyWork(f, worker, input({ category: "trousers", workType: "client", trouserType: "qandrissi", productName: "علي", quantity: 7 }));
  await assign(worker, input({ category: "trousers", workType: "shop", productName: "سراويل للبيع", quantity: 50 }));
  assert.equal(normal.tailoring, undefined); assert.equal(normal.trouserType, "regular"); assert.equal(qandrissi.trouserType, "qandrissi");
  const done = await complete(worker, normal, completionBody(normal, 4)); assert.equal(done.status, 201);
  const completed = await done.json(); assert.equal(completed.trouserType, "regular"); assert.equal(completed.remainingQuantity, 8);
  assert.equal((await complete(worker, qandrissi, completionBody(qandrissi, 2))).status, 201);
  const list = await (await request(worker, { category: "trousers" })).json();
  assert.equal(list.works.length, 3);
  assert.deepEqual(trouserWorkTotals(list.works), {
    regular: { quantity: 12, completedQuantity: 4, remainingQuantity: 8 },
    qandrissi: { quantity: 7, completedQuantity: 2, remainingQuantity: 5 },
  });
  const replay = await request(worker, { body: { ...input({ category: "trousers", workType: "client", trouserType: "qandrissi", productName: "محمد", quantity: 12 }), requestId: f.records[0].requestId } });
  assert.equal(replay.status, 409);
  assert.equal((await request(worker, { suffix: "/orders", category: "trousers" })).status, 200);
  const corrupt = new WorkerWork(f.records[0].toObject()); corrupt.trouserType = undefined;
  await assert.rejects(corrupt.validate());
});

test("trouser statistics start at zero and ignore shop work and other sections", () => {
  const empty = { regular: { quantity: 0, completedQuantity: 0, remainingQuantity: 0 }, qandrissi: { quantity: 0, completedQuantity: 0, remainingQuantity: 0 } };
  assert.deepEqual(trouserWorkTotals([]), empty);
  assert.deepEqual(trouserWorkTotals([{ category: "machine", workType: "client", trouserType: "regular", quantity: 100, completedQuantity: 50 }, { category: "trousers", workType: "shop", trouserType: "qandrissi", quantity: 20, completedQuantity: 10 }]), empty);
});

test("legacy trouser work retains completion permissions", async t => {
  const f = setup(t), worker = f.seedWorker(owner, ["trousers"]);
  const work = await seedLegacyWork(f, worker, input({ category: "trousers", workType: "client", trouserType: "regular", productName: "محمد", quantity: 3 }));
  assert.equal((await complete(worker, work, completionBody(work, 4))).status, 400);
  f.staff.action.update = false;
  assert.equal((await complete(worker, work, completionBody(work, 1), staffClaims)).status, 403);
  assert.equal(f.records[0].completedQuantity, 0);
});

test("ordinary work uses whole pieces while sfifa requires its meter and number details", () => {
  assert.deepEqual(WORK_TRACKING_CATEGORIES, ["machine", "sfifa", "finishing", "brim", "trousers", "shirts", "mesbanto"]);
  assert.equal(parseWorkQuantity(" 030 "), 30); assert.equal(parseWorkQuantity(1000000), 1000000);
  for (const value of [undefined, null, "", " ", 0, -1, 1.5, "1.5", "1,5", "1e2", "-2", NaN, Infinity, true, {}, [], 1000001]) assert.equal(parseWorkQuantity(value), null);
  assert.throws(() => validateWorkerWork(input({ productName: "" })), error => error.fields.productName === "required");
  for (const productName of ["x".repeat(161), "x\ny"]) assert.throws(() => validateWorkerWork(input({ productName })), /invalidWork/);
  assert.throws(() => validateWorkerWork(input({ category: "sfifa" })), error => error.fields.width === "invalidWidth");
  assert.throws(() => validateWorkerCompletion({ quantity: 11 }, 10), error => error.fields.quantity === "exceedsRemaining");
});

test("assigning work persists its product and quantity under trusted worker, actor and shop", async t => {
  const f = setup(t), work = await assign(f.worker, input({ productName: "  جلابة زرقاء  ", quantity: "30", idAdmin: otherOwner, workerId: otherOwner, createdBy: employee, completedQuantity: 25, remainingQuantity: 5 }));
  assert.equal(work.productName, "جلابة زرقاء"); assert.equal(work.quantity, 30); assert.equal(work.completedQuantity, 0); assert.equal(work.remainingQuantity, 30); assert.deepEqual(work.completions, []);
  assert.equal(work.requestId, undefined); assert.equal(work.requestFingerprint, undefined); assert.equal(work.idAdmin, undefined);
  assert.equal(String(f.records[0].idAdmin), owner); assert.equal(String(f.records[0].createdBy), owner); assert.equal(String(f.records[0].workerId), String(f.worker._id));
});

test("completing 20 of 30 leaves 10, records a server-dated history and can finish the remainder", async t => {
  const f = setup(t), work = await assign(f.worker), start = Date.now();
  const response = await complete(f.worker, work, completionBody(work, 20, { date: "2000-01-01", before: 1000, after: 0, quantityTotal: 200 }));
  assert.equal(response.status, 201); const partial = await response.json();
  assert.deepEqual([partial.quantity, partial.completedQuantity, partial.remainingQuantity], [30, 20, 10]);
  assert.equal(partial.completions.length, 1); assert.deepEqual([partial.completions[0].quantity, partial.completions[0].before, partial.completions[0].after], [20, 30, 10]);
  assert.ok(new Date(partial.completions[0].date).getTime() >= start); assert.ok(new Date(partial.completions[0].date).getTime() <= Date.now());
  assert.equal(partial.completions[0].requestId, undefined); assert.equal(partial.completions[0].createdBy, undefined);
  const finishedResponse = await complete(f.worker, partial, completionBody(partial, 10)); assert.equal(finishedResponse.status, 201); const finished = await finishedResponse.json();
  assert.deepEqual([finished.quantity, finished.completedQuantity, finished.remainingQuantity], [30, 30, 0]); assert.equal(finished.completions.length, 2);
  const excess = await complete(f.worker, finished, completionBody(finished, 1)); assert.equal(excess.status, 400); assert.equal((await excess.json()).fields.quantity, "exceedsRemaining");
  assert.equal(f.records[0].completions.length, 2);
});

test("each delivery is independent and work lists are scoped by worker, section and shop", async t => {
  const f = setup(t), otherWorker = f.seedWorker(), foreign = f.seedWorker(otherOwner);
  const machine = await assign(f.worker), second = await assign(f.worker), brim = await assign(f.worker, input({ category: "brim", quantity: 12 }));
  await assign(otherWorker); await assign(foreign, input(), stranger);
  assert.notEqual(machine._id, second._id);
  const listed = await (await request(f.worker)).json(); assert.equal(listed.works.length, 2); assert.equal(listed.worker._id, String(f.worker._id)); assert.equal(listed.canAssign, true);
  const brimList = await (await request(f.worker, { category: "brim" })).json(); assert.equal(brimList.works.length, 1); assert.equal(brimList.works[0]._id, brim._id);
  assert.equal((await request(foreign)).status, 404); assert.equal((await request(f.worker, { actor: stranger })).status, 404);
  assert.equal((await complete(otherWorker, machine, completionBody(machine, 1))).status, 404);
  await complete(f.worker, machine, completionBody(machine, 10));
  assert.equal(f.records.find(row => String(row._id) === second._id).completedQuantity, 0); assert.equal(f.records.find(row => String(row._id) === brim._id).completedQuantity, 0);
});

test("assignment requires current section membership while historical work remains accessible", async t => {
  const f = setup(t), work = await assign(f.worker);
  f.worker.categories = ["brim"];
  assert.equal((await request(f.worker, { body: input() })).status, 409);
  const listed = await (await request(f.worker)).json(); assert.equal(listed.canAssign, false); assert.equal(listed.works.length, 1);
  assert.equal((await complete(f.worker, work, completionBody(work, 5))).status, 201);
  assert.equal((await request(f.worker, { body: input({ category: "sfifa" }) })).status, 400);
  assert.equal((await request(f.worker, { category: "sfifa" })).status, 200);
});

test("legacy single-category workers can receive work without rewriting their record", async t => {
  const f = setup(t); f.worker.categories = undefined; f.worker.category = "machine";
  await assign(f.worker); assert.equal(f.worker.categories, undefined);
  const listed = await (await request(f.worker)).json(); assert.deepEqual(listed.worker.categories, ["machine"]); assert.equal(listed.works.length, 1);
});

test("current add and update permissions are independent and employee identity comes from storage", async t => {
  const f = setup(t), work = await assign(f.worker); f.staff.action.add = false; f.staff.action.update = false;
  assert.equal((await request(f.worker, { body: input(), actor: staffClaims })).status, 403);
  assert.equal((await complete(f.worker, work, completionBody(work, 10), staffClaims)).status, 403);
  f.staff.action.update = true;
  assert.equal((await complete(f.worker, work, completionBody(work, 10), staffClaims)).status, 201);
  assert.equal(String(f.records[0].completions[0].createdBy), employee); assert.equal(String(f.records[0].createdBy), owner); assert.equal(String(f.records[0].idAdmin), owner);
  const listed = await (await request(f.worker, { actor: staffClaims })).json(); assert.deepEqual(listed.permissions, { add: false, update: true, delete: false });
  f.staff.isActive = false; assert.equal((await request(f.worker, { actor: staffClaims })).status, 403);
});

test("unauthenticated, unsupported and removed accounts cannot read or mutate work", async t => {
  const f = setup(t), work = await assign(f.worker);
  for (const [actor, status] of [[null, 401], [{ id: owner, role: "visitor" }, 403], [{ id: "444444444444444444444444", role: "admin" }, 403]]) {
    assert.equal((await request(f.worker, { actor })).status, status);
    assert.equal((await request(f.worker, { actor, body: input() })).status, status);
    assert.equal((await complete(f.worker, work, completionBody(work, 1), actor)).status, status);
  }
  f.accounts.delete(owner); assert.equal((await request(f.worker)).status, 403); assert.equal(f.records[0].completedQuantity, 0);
});

test("assignment retries and concurrent duplicates create one work and changed payloads conflict", async t => {
  const f = setup(t), body = input();
  const responses = await Promise.all([request(f.worker, { body }), request(f.worker, { body })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]); const values = await Promise.all(responses.map(response => response.json())); assert.equal(values[0]._id, values[1]._id); assert.equal(f.records.length, 1);
  for (const change of [{ quantity: 40 }, { productName: "قميص" }, { category: "brim" }]) assert.equal((await request(f.worker, { body: { ...body, ...change } })).status, 409);
  const secondWorker = f.seedWorker(); assert.equal((await request(secondWorker, { body })).status, 409);
  f.worker.categories = ["brim"]; assert.equal((await request(f.worker, { body })).status, 200);
});

test("completion retries return the committed result even with a stale version or zero remainder", async t => {
  const f = setup(t), work = await assign(f.worker), body = completionBody(work, 20);
  const first = await complete(f.worker, work, body); assert.equal(first.status, 201); const partial = await first.json();
  const retry = await complete(f.worker, work, body); assert.equal(retry.status, 200); assert.equal((await retry.json()).remainingQuantity, 10); assert.equal(f.records[0].completions.length, 1);
  assert.equal((await complete(f.worker, work, { ...body, quantity: 19 })).status, 409);
  assert.equal((await complete(f.worker, partial, completionBody(partial, 10))).status, 201);
  const afterFinish = await complete(f.worker, work, body); assert.equal(afterFinish.status, 200); assert.equal((await afterFinish.json()).remainingQuantity, 0); assert.equal(f.records[0].completions.length, 2);
});

test("concurrent completion duplicates are idempotent and distinct stale submissions cannot over-deduct", async t => {
  const f = setup(t), work = await assign(f.worker), body = completionBody(work, 20);
  const duplicate = await Promise.all([complete(f.worker, work, body), complete(f.worker, work, body)]);
  assert.deepEqual(duplicate.map(response => response.status).sort(), [200, 201]); assert.equal(f.records[0].completedQuantity, 20); assert.equal(f.records[0].completions.length, 1);
  const next = await assign(f.worker);
  const distinct = await Promise.all([complete(f.worker, next, completionBody(next, 20)), complete(f.worker, next, completionBody(next, 20))]);
  assert.deepEqual(distinct.map(response => response.status).sort(), [201, 409]); assert.equal(f.records[1].completedQuantity, 20); assert.equal(f.records[1].completions.length, 1);
});

test("invalid quantities, versions, request IDs and routes do not mutate remaining work", async t => {
  const f = setup(t), work = await assign(f.worker);
  for (const quantity of [0, -1, 1.5, "bad", 31]) assert.equal((await complete(f.worker, work, completionBody(work, quantity))).status, 400);
  for (const version of [undefined, -1, true, "bad", 1]) assert.equal((await complete(f.worker, work, completionBody(work, 1, { version }))).status, 409);
  assert.equal((await complete(f.worker, work, completionBody(work, 1, { requestId: "bad" }))).status, 400);
  assert.equal((await request(f.worker, { body: input({ requestId: "bad" }) })).status, 400);
  assert.equal((await request("invalid", { body: input() })).status, 404);
  assert.equal((await request(f.worker, { suffix: "/invalid/completions", body: completionBody(work, 1) })).status, 404);
  assert.equal(f.records[0].completedQuantity, 0); assert.equal(f.records[0].completions.length, 0); assert.equal(f.records[0].__v, 0);
});

test("save failures leave both quantities and completion history unchanged and can be retried", async t => {
  const f = setup(t), assignment = input();
  f.create.mock.mockImplementationOnce(async () => { throw new Error("private database detail"); });
  const failedCreate = await request(f.worker, { body: assignment }); assert.equal(failedCreate.status, 500); assert.deepEqual(await failedCreate.json(), { message: "saveWorkFailed" }); assert.equal(f.records.length, 0);
  const work = await assign(f.worker, assignment), body = completionBody(work, 20);
  f.save.mock.mockImplementationOnce(async () => { throw new Error("private save detail"); });
  const failed = await complete(f.worker, work, body); assert.equal(failed.status, 500); assert.deepEqual(await failed.json(), { message: "saveWorkFailed" });
  assert.equal(f.records[0].completedQuantity, 0); assert.equal(f.records[0].completions.length, 0);
  assert.equal((await complete(f.worker, work, body)).status, 201);
  f.find.mock.mockImplementationOnce(() => query(() => { throw new Error("private read detail"); }));
  const unavailable = await request(f.worker); assert.equal(unavailable.status, 500); assert.deepEqual(await unavailable.json(), { message: "loadWorkFailed" });
});

test("the model rejects completion totals or history that do not match the assigned quantity", async t => {
  const f = setup(t), work = await assign(f.worker);
  await assert.rejects(new WorkerWork({ ...f.records[0].toObject(), completedQuantity: 10 }).validate());
  await complete(f.worker, work, completionBody(work, 20));
  const corrupt = new WorkerWork(f.records[0].toObject()); corrupt.completions[0].after = 11;
  await assert.rejects(corrupt.validate());
  const duplicate = new WorkerWork(f.records[0].toObject()); duplicate.completedQuantity = 25; duplicate.completions.push({ ...duplicate.completions[0].toObject(), quantity: 5, before: 10, after: 5 });
  await assert.rejects(duplicate.validate());
});

const clientInput = (order, patch = {}) => ({ workType: "client", orderId: String(order._id), lineIds: order.items.map(item => item.lineId), category: "machine", requestId: randomUUID(), ...patch });
test("client work derives its quantity and garment details from the selected order", async t => {
  const f = setup(t), order = f.seedOrder();
  const work = await assign(f.worker, clientInput(order, { productName: "FORGED", quantity: 999, tailoring: { clientName: "FORGED" } }));
  assert.equal(work.workType, "client"); assert.equal(work.quantity, 2); assert.equal(work.productName, order.clientName);
  assert.equal(work.tailoring.orderId, String(order._id)); assert.equal(work.tailoring.items[1].fabricType, "مخمل"); assert.equal(work.tailoring.items[1].sfifa.width, "thick");
  assert.equal(work.tailoring.items[0].price, undefined); assert.equal(work.tailoring.items[0].photo, undefined); assert.equal(work.tailoring.paidAmount, undefined);
  assert.equal(work.tailoring.barcode, "FS-" + String(order._id).toUpperCase());
  const partial = await complete(f.worker, work, completionBody(work, 1)); assert.equal(partial.status, 201);
  const updated = await partial.json(); assert.equal(updated.remainingQuantity, 1); assert.equal(updated.tailoring.items.length, 2); assert.equal(updated.completions.length, 1);
  assert.equal(order.paidAmount, 200); assert.equal(order.deliveredAt, null);
});
test("legacy and explicit shop work remain separate from client work without rewriting old records", async t => {
  const f = setup(t), legacy = await assign(f.worker), shop = await assign(f.worker, input({ workType: "shop", quantity: 5 })), order = f.seedOrder();
  const client = await assign(f.worker, clientInput(order));
  const listed = await (await request(f.worker)).json();
  assert.equal(listed.works.find(work => work._id === legacy._id).workType, "shop"); assert.equal(listed.works.find(work => work._id === shop._id).workType, "shop"); assert.equal(listed.works.find(work => work._id === client._id).workType, "client");
  assert.equal(f.records[0].workType, undefined); assert.equal(f.save.mock.callCount(), 0);
});
test("order choices include only the owning shop's undelivered orders with available garments", async t => {
  const f = setup(t), order = f.seedOrder(), delivered = f.seedOrder(owner, { deliveredAt: new Date() }), foreign = f.seedOrder(otherOwner);
  const first = await (await request(f.worker, { suffix: "/orders" })).json(); assert.deepEqual(first.orders.map(row => row._id), [String(order._id)]);
  assert.equal(first.orders[0].items[0].available, true); assert.equal(first.orders[0].items[0].number, 1);
  assert.equal(first.orders[0].totalPrice, undefined); assert.equal(first.orders[0].items[0].photo, undefined);
  await assign(f.worker, clientInput(order, { lineIds: [order.items[0].lineId] }));
  const second = await (await request(f.worker, { suffix: "/orders" })).json(); assert.equal(second.orders[0].items[0].available, false); assert.equal(second.orders[0].items[1].available, true);
  const otherWorker = f.seedWorker(); await assign(otherWorker, clientInput(order, { lineIds: [order.items[1].lineId] }));
  assert.equal((await (await request(f.worker, { suffix: "/orders" })).json()).orders.length, 0);
  assert.equal((await request(f.worker, { body: clientInput(delivered) })).status, 409);
  assert.equal((await request(f.worker, { body: clientInput(foreign) })).status, 404);
});
test("one garment can pass through different sections but cannot be assigned twice in the same section", async t => {
  const f = setup(t), order = f.seedOrder(), otherWorker = f.seedWorker(), body = clientInput(order, { lineIds: [order.items[0].lineId] });
  const first = await assign(f.worker, body);
  const duplicate = await request(otherWorker, { body: { ...body, requestId: randomUUID() } }); assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).message, "garmentAlreadyAssigned");
  assert.equal((await complete(f.worker, first, completionBody(first, 1))).status, 201);
  const finishing = await assign(otherWorker, { ...body, category: "finishing", requestId: randomUUID() });
  assert.equal((await complete(otherWorker, finishing, completionBody(finishing, 1))).status, 201);
  await assign(otherWorker, { ...body, category: "brim", requestId: randomUUID() });
  const replay = await request(f.worker, { body }); assert.equal(replay.status, 200); assert.equal((await replay.json())._id, first._id);
  assert.equal(f.records.length, 3);
});
test("concurrent assignments of the same garment allow only one worker to receive it", async t => {
  const f = setup(t), order = f.seedOrder(), secondWorker = f.seedWorker();
  const responses = await Promise.all([f.worker, secondWorker].map(worker => request(worker, { body: clientInput(order, { lineIds: [order.items[0].lineId] }) })));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]); assert.equal(f.records.length, 1);
});
test("order assignment retries retain their original snapshot after the source order changes or disappears", async t => {
  const f = setup(t), order = f.seedOrder(), body = clientInput(order), first = await assign(f.worker, body);
  order.clientName = "Changed"; order.items[0].fabricType = "Changed"; order.deliveredAt = new Date();
  const retry = await request(f.worker, { body: { ...body, lineIds: [...body.lineIds].reverse() } }); assert.equal(retry.status, 200); assert.equal((await retry.json()).tailoring.items[0].fabricType, first.tailoring.items[0].fabricType);
  f.orders.length = 0;
  const finished = await complete(f.worker, first, completionBody(first, 2)); assert.equal(finished.status, 201); assert.equal((await finished.json()).remainingQuantity, 0);
  const list = await (await request(f.worker)).json(); assert.equal(list.works[0].tailoring.clientName, first.tailoring.clientName);
});
test("invalid order selections, worker membership and current permissions cannot create client work", async t => {
  const f = setup(t), order = f.seedOrder();
  for (const patch of [{ orderId: "bad" }, { lineIds: [] }, { lineIds: [order.items[0].lineId, order.items[0].lineId] }, { workType: "bad" }]) assert.equal((await request(f.worker, { body: clientInput(order, patch) })).status, 400);
  assert.equal((await request(f.worker, { body: clientInput(order, { lineIds: ["000000000000000000000000"] }) })).status, 409);
  f.staff.action.add = false;
  assert.equal((await request(f.worker, { suffix: "/orders", actor: staffClaims })).status, 403); assert.equal((await request(f.worker, { body: clientInput(order), actor: staffClaims })).status, 403);
  assert.equal((await request(f.worker, { suffix: "/orders", actor: stranger })).status, 404);
  f.worker.categories = ["brim"];
  assert.equal((await request(f.worker, { suffix: "/orders" })).status, 409); assert.equal((await request(f.worker, { body: clientInput(order) })).status, 409); assert.equal(f.records.length, 0);
});


test("trouser orders cannot enter djellaba worker selectors or sfifa assignments", async t => {
  const f = setup(t), djellaba = f.seedOrder();
  const trousers = f.seedOrder(owner, { garmentType: "trousers", trouserType: "regular", expenseAmount: 20, sfifa: undefined, items: djellaba.items.map(item => ({ ...item.toObject(), sfifa: undefined, trouserType: "regular" })) });
  for (const category of ["machine", "finishing", "brim", "sfifa"]) {
    const response = await request(f.worker, { category, suffix: "/orders" }); assert.equal(response.status, 200);
    const { orders } = await response.json(); assert.deepEqual(orders.map(order => order._id), [String(djellaba._id)]);
    const body = clientInput(trousers, { category, ...(category === "sfifa" ? { quantity: 2, sfifa: { width: "thin", family: "01-30", code: 1 } } : {}) });
    const rejected = await request(f.worker, { body }); assert.equal(rejected.status, 404); assert.equal((await rejected.json()).message, "orderNotFound");
  }
});


test("shirt orders stay out of djellaba worker options and sfifa work", async t => {
  const f=setup(t),djellaba=f.seedOrder();
  const shirts=f.seedOrder(owner,{garmentType:"shirts",shirtType:"قميص رجالي",expenseAmount:20,sfifa:undefined,items:djellaba.items.map(item=>({...item.toObject(),sfifa:undefined,shirtType:"قميص رجالي"}))});
  for(const category of ["machine","finishing","brim","sfifa"]){
    const response=await request(f.worker,{category,suffix:"/orders"});assert.equal(response.status,200);assert.deepEqual((await response.json()).orders.map(order=>order._id),[String(djellaba._id)]);
    const body=clientInput(shirts,{category,...(category==="sfifa"?{quantity:2,sfifa:{width:"thin",family:"01-30",code:1}}:{})});
    const rejected=await request(f.worker,{body});assert.equal(rejected.status,404);assert.equal((await rejected.json()).message,"orderNotFound");
  }
});
