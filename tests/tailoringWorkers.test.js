import { moduleOperationPermissions } from "../shared/employeePermissions.js";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID, createHash } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import TailoringWorker from "../BackEnd/models/TailoringWorker.js";
import { WORKER_CATEGORIES, filterTailoringWorkers, validateTailoringWorker, workerCategories } from "../shared/workers.js";

const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
const admin = { id: owner, role: "admin" }, stranger = { id: otherOwner, role: "admin" };
const staffClaims = { id: employee, role: "Employe", idAdmin: otherOwner, action: { add: true, update: true } };
const previousSecret = process.env.JWT_SECRET;
let server, base;
before(async () => {
  process.env.JWT_SECRET = "tailoring-workers-tests";
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/tailoring-workers`;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});
const input = (patch = {}) => ({ name: "أمينة", phone: "+212 612 345 678", category: "machine", requestId: randomUUID(), ...patch });
const query = fn => ({ select() { return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } });
function setup(t) {
  const records = [];
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: false } };
  const accounts = new Set([owner, otherOwner]);
  t.mock.method(AdminModel, "findById", id => query(() => accounts.has(String(id)) ? { _id: id } : null));
  t.mock.method(EmployeModel, "findById", id => query(() => String(id) === employee ? staff : null));
  const find = t.mock.method(TailoringWorker, "find", scope => query(() => records.filter(row => String(row.idAdmin) === String(scope.idAdmin)).map(row => row.toObject()).sort((a, b) => b.createdAt - a.createdAt)));
  t.mock.method(TailoringWorker, "findOne", async scope => {
    const row = records.find(row => String(row.idAdmin) === String(scope.idAdmin) && (!scope._id || String(row._id) === String(scope._id).toLowerCase()) && (!scope.requestId || row.requestId === scope.requestId));
    return row ? new TailoringWorker(row.toObject()) : null;
  });
  const create = t.mock.method(TailoringWorker, "create", async value => {
    if (records.some(row => String(row.idAdmin) === String(value.idAdmin) && row.requestId === value.requestId)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const row = new TailoringWorker({ ...value, __v: 0, createdAt: new Date(), updatedAt: new Date() });
    await row.validate(); records.push(row); return row;
  });
  const save = t.mock.method(TailoringWorker.prototype, "save", async function () {
    const index = records.findIndex(row => String(row._id) === String(this._id));
    if (index < 0 || records[index].__v !== this.__v) throw Object.assign(new Error("Concurrent write"), { name: "VersionError" });
    await this.validate(); this.__v += 1; this.updatedAt = new Date(); records[index] = new TailoringWorker(this.toObject()); return this;
  });
  return { records, staff, accounts, find, create, save };
}
async function request({ body, actor = admin, suffix = "", method = body === undefined ? "GET" : "POST" } = {}) {
  const headers = actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(base + suffix, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const createWorker = async (body = input(), actor) => { const response = await request({ body, ...(actor ? { actor } : {}) }); assert.equal(response.status, 201); return response.json(); };

test("all six sections accept a worker name and phone and discard unrelated fields", () => {
  assert.deepEqual(WORKER_CATEGORIES, ["machine", "sfifa", "finishing", "brim", "trousers", "shirts", "mesbanto"]);
  for (const category of WORKER_CATEGORIES) assert.deepEqual(validateTailoringWorker(input({ name: "  أمينة  ", phone: " 0612345678 ", category, wage: 100 })), { name: "أمينة", phone: "0612345678", categories: [category] });
});

test("validation rejects missing fields, invalid phones, malformed categories and control characters", () => {
  for (const change of [{ name: "" }, { name: "  " }, { name: "x".repeat(161) }, { name: "name\nline" }, { name: {} }, { phone: "" }, { phone: "123" }, { phone: "abc123456" }, { phone: "1".repeat(21) }, { phone: "1 ".repeat(21) }, { category: "" }, { category: "other" }, { category: ["machine", "sfifa"] }]) {
    assert.throws(() => validateTailoringWorker(input(change)), /invalidWorker/);
  }
  for (const value of [null, [], "worker"]) assert.throws(() => validateTailoringWorker(value), /invalidWorker/);
});

test("search only shows the chosen section and matches formatted phones and French accents", () => {
  const rows = [input({ name: "Amélie", phone: "+212 612 345 678" }), input({ name: "أمينة", category: "sfifa" })];
  assert.equal(filterTailoringWorkers(rows, "machine", "amelie").length, 1);
  assert.equal(filterTailoringWorkers(rows, "machine", "612345678").length, 1);
  assert.equal(filterTailoringWorkers(rows, "machine", "أمينة").length, 0);
  assert.equal(filterTailoringWorkers(rows, "sfifa", "أمينة").length, 1);
  assert.equal(filterTailoringWorkers(rows, "finishing").length, 0);
});

test("all sections persist independently using trusted shop and actor identities", async t => {
  const f = setup(t);
  for (const category of WORKER_CATEGORIES) {
    const worker = await createWorker(input({ category, idAdmin: otherOwner, createdBy: employee, role: "admin" }));
    assert.equal(worker.category, category); assert.equal(worker.name, "أمينة"); assert.equal(worker.phone, "+212 612 345 678");
    assert.equal(worker.requestId, undefined); assert.equal(worker.requestFingerprint, undefined);
  }
  assert.equal(f.records.length, WORKER_CATEGORIES.length);
  assert.ok(f.records.every(row => String(row.idAdmin) === owner && String(row.createdBy) === owner));
  assert.ok(f.records.every(row => row.toObject().role === undefined));
});

test("listing is scoped to the current shop and retains every category list", async t => {
  setup(t);
  for (const category of WORKER_CATEGORIES) await createWorker(input({ category }));
  await createWorker(input({ name: "Other shop" }), stranger);
  const response = await request(); assert.equal(response.status, 200); const listed = await response.json();
  assert.equal(listed.workers.length, WORKER_CATEGORIES.length); assert.deepEqual(listed.permissions, moduleOperationPermissions('admin', { action: { add: true, update: true, delete: true } }, 'workers'));
  assert.ok(listed.workers.every(worker => worker.name === "أمينة"));
  const other = await (await request({ actor: stranger })).json(); assert.equal(other.workers.length, 1); assert.equal(other.workers[0].name, "Other shop");
});

test("employees use their stored shop and current add permission, ignoring JWT permissions", async t => {
  const f = setup(t);
  const worker = await createWorker(input({ category: "sfifa" }), staffClaims);
  assert.equal(worker.category, "sfifa"); assert.equal(String(f.records[0].idAdmin), owner); assert.equal(String(f.records[0].createdBy), employee);
  f.staff.action.add = false;
  const listed = await (await request({ actor: staffClaims })).json(); assert.deepEqual(listed.permissions, moduleOperationPermissions('Employe', { action: { add: false, update: false, delete: false } }, 'workers')); assert.equal(listed.workers.length, 1);
  assert.equal((await request({ body: input(), actor: staffClaims })).status, 403);
  assert.equal(f.records.length, 1);
});

test("inactive or missing accounts and unsupported roles cannot read or add workers", async t => {
  const f = setup(t); f.staff.isActive = false;
  for (const actor of [staffClaims, { id: owner, role: "visitor" }, { id: "444444444444444444444444", role: "admin" }]) {
    assert.equal((await request({ actor })).status, 403); assert.equal((await request({ actor, body: input() })).status, 403);
  }
  f.accounts.delete(owner); assert.equal((await request()).status, 403);
  assert.equal(f.records.length, 0);
});

test("requests without valid authentication never reach worker persistence", async t => {
  const f = setup(t);
  assert.equal((await request({ actor: null })).status, 401);
  assert.equal((await request({ actor: null, body: input() })).status, 401);
  assert.equal((await fetch(base, { headers: { Authorization: "Bearer bad-token" } })).status, 401);
  assert.equal(f.find.mock.callCount(), 0); assert.equal(f.create.mock.callCount(), 0);
});

test("invalid names, phones, categories and request IDs are rejected without saving", async t => {
  const f = setup(t);
  for (const body of [input({ name: "" }), input({ phone: "bad" }), input({ category: "other" }), input({ requestId: "bad" }), { ...input(), requestId: undefined }]) assert.equal((await request({ body })).status, 400);
  const invalid = await request({ body: input({ phone: "123" }) }); assert.equal((await invalid.json()).fields.phone, "invalidPhone");
  assert.equal(f.records.length, 0);
});

test("retries and double submissions save one worker, and changed retry payloads conflict", async t => {
  const f = setup(t), body = input();
  const responses = await Promise.all([request({ body }), request({ body })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  const workers = await Promise.all(responses.map(response => response.json())); assert.equal(workers[0]._id, workers[1]._id);
  const retry = await request({ body: { ...body, name: "  أمينة  " } }); assert.equal(retry.status, 200);
  for (const change of [{ name: "محمد" }, { phone: "0611111111" }, { category: "finishing" }]) assert.equal((await request({ body: { ...body, ...change } })).status, 409);
  assert.equal(f.records.length, 1);
  await createWorker(body, stranger); assert.equal(f.records.length, 2);
});

test("a failed save returns a stable error and permits a successful retry", async t => {
  const f = setup(t), body = input();
  f.create.mock.mockImplementationOnce(async () => { throw new Error("private database detail"); });
  const failed = await request({ body }); assert.equal(failed.status, 500); assert.deepEqual(await failed.json(), { message: "saveFailed" }); assert.equal(f.records.length, 0);
  await createWorker(body); assert.equal(f.records.length, 1);
  f.find.mock.mockImplementationOnce(() => query(() => { throw new Error("private read detail"); }));
  const unavailable = await request(); assert.equal(unavailable.status, 500); assert.deepEqual(await unavailable.json(), { message: "loadFailed" });
});

test("multi-section input is canonical and rejects an empty or invalid selection", () => {
  assert.deepEqual(validateTailoringWorker(input({ categories: ["brim", "machine", "sfifa"] })).categories, ["machine", "sfifa", "brim"]);
  for (const categories of [[], "machine", {}, ["other"], ["machine", "machine"], ["sfifa", null]]) assert.throws(() => validateTailoringWorker(input({ categories })), error => error.fields.categories === "invalidCategory");
  assert.deepEqual(workerCategories({ category: "sfifa" }), ["sfifa"]);
  assert.deepEqual(workerCategories({ category: "machine", categories: ["sfifa", "brim"] }), ["sfifa", "brim"]);
});

test("one worker appears in every selected section under the same ID", async t => {
  const f = setup(t), worker = await createWorker(input({ categories: ["sfifa", "machine"] }));
  assert.deepEqual(worker.categories, ["machine", "sfifa"]); assert.equal(worker.__v, 0);
  assert.equal(f.records.length, 1); assert.deepEqual([...f.records[0].categories], ["machine", "sfifa"]);
  const listed = await (await request()).json(); assert.equal(listed.workers.length, 1);
  for (const category of ["machine", "sfifa"]) {
    const found = filterTailoringWorkers(listed.workers, category, "612345678"); assert.equal(found.length, 1); assert.equal(found[0]._id, worker._id);
  }
  assert.equal(filterTailoringWorkers(listed.workers, "brim").length, 0);
});

test("retry identity treats different checkbox orders as the same worker", async t => {
  const f = setup(t), body = input({ categories: ["brim", "machine"] }), original = await createWorker(body);
  const retry = await request({ body: { ...body, categories: ["machine", "brim"] } });
  assert.equal(retry.status, 200); assert.equal((await retry.json())._id, original._id);
  assert.equal((await request({ body: { ...body, categories: ["machine", "sfifa"] } })).status, 409);
  assert.equal(f.records.length, 1);
});

test("editing sections adds and removes membership while preserving worker identity and actor", async t => {
  const f = setup(t), original = await createWorker(input({ categories: ["machine"] }));
  const update = await request({ suffix: `/${original._id}`, method: "PUT", body: input({ version: 0, categories: ["machine", "sfifa"], idAdmin: otherOwner, createdBy: employee }) });
  assert.equal(update.status, 200); const changed = await update.json();
  assert.equal(changed._id, original._id); assert.equal(changed.__v, 1); assert.deepEqual(changed.categories, ["machine", "sfifa"]);
  assert.equal(String(f.records[0].idAdmin), owner); assert.equal(String(f.records[0].createdBy), owner);
  const remove = await request({ suffix: `/${original._id}`, method: "PUT", body: input({ version: 1, categories: ["sfifa", "brim"] }) });
  assert.equal(remove.status, 200); const moved = await remove.json(); assert.equal(moved._id, original._id); assert.deepEqual(moved.categories, ["sfifa", "brim"]);
  assert.equal(f.records.length, 1); assert.equal(filterTailoringWorkers([moved], "machine").length, 0); assert.equal(filterTailoringWorkers([moved], "brim").length, 1);
});

test("old single-section records remain visible, retry safely and upgrade on edit", async t => {
  const f = setup(t), body = input();
  const legacy = new TailoringWorker({ ...body, idAdmin: owner, createdBy: owner, __v: 0, requestFingerprint: createHash("sha256").update(JSON.stringify({ name: body.name, phone: body.phone, category: body.category })).digest("hex"), createdAt: new Date() });
  await legacy.validate(); f.records.push(legacy);
  assert.equal(legacy.categories, undefined);
  const listed = await (await request()).json(); assert.deepEqual(listed.workers[0].categories, ["machine"]);
  assert.equal(legacy.categories, undefined);
  const retry = await request({ body }); assert.equal(retry.status, 200); assert.equal((await retry.json())._id, String(legacy._id)); assert.equal(f.records.length, 1);
  const update = await request({ suffix: `/${legacy._id}`, method: "PUT", body: input({ version: 0, categories: ["machine", "finishing"] }) });
  assert.equal(update.status, 200); const changed = await update.json(); assert.equal(changed._id, String(legacy._id)); assert.deepEqual(changed.categories, ["machine", "finishing"]); assert.equal(f.records.length, 1);
});

test("editing enforces current update permission and shop scope", async t => {
  const f = setup(t), original = await createWorker();
  const edit = { suffix: `/${original._id}`, method: "PUT", body: input({ version: 0, categories: ["machine", "sfifa"] }) };
  assert.equal((await request({ ...edit, actor: staffClaims })).status, 403);
  f.staff.action.add = false; f.staff.action.update = true;
  assert.equal((await request({ ...edit, actor: stranger })).status, 404);
  assert.equal((await request({ ...edit, suffix: "/invalid" })).status, 404);
  assert.equal((await request({ ...edit, actor: staffClaims })).status, 200);
  assert.equal(String(f.records[0].createdBy), owner); assert.equal(String(f.records[0].idAdmin), owner);
  f.staff.isActive = false;
  assert.equal((await request({ ...edit, actor: staffClaims, body: { ...edit.body, version: 1 } })).status, 403);
});

test("invalid or stale edits and failed saves leave persisted memberships unchanged", async t => {
  const f = setup(t), original = await createWorker();
  const edit = { suffix: `/${original._id}`, method: "PUT" };
  for (const version of [undefined, -1, true, "bad", 1]) assert.equal((await request({ ...edit, body: input({ version, categories: ["sfifa"] }) })).status, 409);
  assert.equal((await request({ ...edit, body: input({ version: 0, categories: [] }) })).status, 400);
  f.save.mock.mockImplementationOnce(async () => { throw new Error("private save detail"); });
  const failure = await request({ ...edit, body: input({ version: 0, categories: ["sfifa"] }) }); assert.equal(failure.status, 500); assert.deepEqual(await failure.json(), { message: "saveFailed" });
  assert.deepEqual([...f.records[0].categories], ["machine"]); assert.equal(f.records[0].__v, 0);
  const body = input({ version: 0, categories: ["machine", "brim"] });
  const responses = await Promise.all([request({ ...edit, body }), request({ ...edit, body })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]); assert.equal(f.records.length, 1); assert.equal(f.records[0].__v, 1);
});
