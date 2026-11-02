import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import app from "../BackEnd/app.js";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import Fabric from "../BackEnd/models/Fabric.js";
import FabricMovement from "../BackEnd/models/FabricMovement.js";
import { calculateFabricReduction, fabricTotals, generateFabricBarcode, validateFabric } from "../shared/fabrics.js";

const owner = "111111111111111111111111", foreignOwner = "222222222222222222222222", employee = "333333333333333333333333";
const claims = { id: owner, role: "admin" };
const staffClaims = { id: employee, role: "Employe", idAdmin: foreignOwner, action: { update: true } };
const first = generateFabricBarcode(), second = generateFabricBarcode(new Set([first])), third = generateFabricBarcode(new Set([first, second]));
const input = { type: "Coton", reference: "T-001", colors: [
  { name: "Bleu marine", number: "007", pieces: [{ meters: 30, barcode: first }, { meters: 47, barcode: second }] },
  { name: "Rouge", number: "008", pieces: [{ meters: 12, barcode: third }] },
] };
let server, base;
const previousSecret = process.env.JWT_SECRET;
before(async () => {
  process.env.JWT_SECRET = "fabric-reductions-test";
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/fabrics`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
const request = (suffix, body, actor = claims, method = body === undefined ? "GET" : "POST") => fetch(base + suffix, {
  method, headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const query = (fn) => ({
  cap: Infinity, select() { return this; }, sort() { return this; }, limit(value) { this.cap = value; return this; }, lean() { return this; },
  then(resolve, reject) { return Promise.resolve().then(fn).then((rows) => Array.isArray(rows) ? rows.slice(0, this.cap) : rows).then(resolve, reject); },
});

function setup(t) {
  const records = [], archive = [];
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { update: true } };
  const actor = t.mock.method(AdminModel, "findById", (id) => query(() => [owner, foreignOwner].includes(String(id)) ? { _id: String(id) } : null));
  t.mock.method(EmployeModel, "findById", (id) => query(() => String(id) === employee ? staff : null));
  const findOne = t.mock.method(Fabric, "findOne", async (scope) => {
    const document = records.find((row) => String(row._id) === String(scope._id).toLowerCase() && String(row.idAdmin) === String(scope.idAdmin));
    return document ? new Fabric(document.toObject()) : null;
  });
  t.mock.method(Fabric, "find", (scope) => query(() => records.filter((row) => String(row.idAdmin) === String(scope.idAdmin)).map((row) => row.toObject())));
  t.mock.method(Fabric, "exists", async (scope) => records.some((row) => String(row.idAdmin) === String(scope.idAdmin) && String(row._id) !== String(scope._id?.$ne) && row.colors.some((color) => color.pieces.some((piece) => scope["colors.pieces.barcode"].$in.includes(piece.barcode)))) ? { _id: records[0]._id } : null);
  const save = t.mock.method(Fabric.prototype, "save", async function () {
    await this.validate();
    const index = records.findIndex((row) => String(row._id) === String(this._id));
    if (index < 0 || records[index].__v !== this.__v) throw Object.assign(new Error("Concurrent write"), { name: "VersionError" });
    this.__v += 1;
    records[index] = new Fabric(this.toObject());
    return this;
  });
  const trim = t.mock.method(Fabric, "updateOne", async (scope, update) => {
    const document = records.find((row) => String(row._id) === String(scope._id) && String(row.idAdmin) === String(scope.idAdmin) && row.__v === scope.__v);
    if (!document) return { modifiedCount: 0 };
    const ids = new Set(update.$pull.movements._id.$in.map(String));
    document.movements = document.movements.filter((row) => !ids.has(String(row._id)));
    return { modifiedCount: 1 };
  });
  const remove = t.mock.method(Fabric, "deleteOne", async (scope) => {
    const index = records.findIndex((row) => String(row._id) === String(scope._id) && String(row.idAdmin) === String(scope.idAdmin) && row.__v === scope.__v);
    if (index < 0) return { deletedCount: 0 };
    records.splice(index, 1);
    return { deletedCount: 1 };
  });
  const bulk = t.mock.method(FabricMovement, "bulkWrite", async (operations) => {
    for (const operation of operations) {
      const value = operation.updateOne.update.$setOnInsert;
      assert.equal(String(operation.updateOne.filter.idAdmin), String(value.idAdmin));
      const document = new FabricMovement(value);
      await document.validate();
      if (!archive.some((row) => String(row._id) === String(value._id))) archive.push(document);
    }
    return { acknowledged: true };
  });
  const archiveFind = t.mock.method(FabricMovement, "find", (scope) => query(() => archive.filter((row) => String(row.idAdmin) === String(scope.idAdmin) && (!scope.barcode || row.barcode === scope.barcode))
    .map((row) => row.toObject()).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || String(b._id).localeCompare(String(a._id)))));
  t.mock.method(FabricMovement, "findOne", async (scope) => archive.find((row) => String(row.idAdmin) === String(scope.idAdmin) && String(row.fabricId) === String(scope.fabricId).toLowerCase() && row.requestId === scope.requestId) || null);
  const seed = (data = input, idAdmin = owner) => {
    const document = new Fabric({ ...validateFabric(data), idAdmin, createdBy: idAdmin, __v: 0 });
    records.push(document);
    return document;
  };
  return { records, archive, staff, actor, findOne, save, trim, remove, bulk, archiveFind, seed };
}
const suffix = (fabric, color = fabric.colors[0], piece = color.pieces[0]) => `/${fabric._id}/colors/${color._id}/pieces/${piece._id}/reductions`;
const payload = (fabric, meters = 20, piece = fabric.colors[0].pieces[0]) => ({ version: fabric.__v, meters, barcode: piece.barcode, requestId: randomUUID() });
const history = async (barcode = "", offset = 0, actor = claims) => {
  const response = await request(`/movements?barcode=${encodeURIComponent(barcode)}&offset=${offset}`, undefined, actor);
  assert.equal(response.status, 200);
  return response.json();
};

test("30m minus 20m leaves only the selected piece at 10m and records a server-dated snapshot", async (t) => {
  const f = setup(t), original = f.seed(), body = payload(original);
  const start = Date.now();
  const response = await request(suffix(original), { ...body, occurredAt: "2000-01-01", idAdmin: foreignOwner, createdBy: foreignOwner, remainingMeters: -100 });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.fabric.colors[0].pieces[0].meters, 10);
  assert.equal(result.fabric.colors[0].pieces[0].barcode, first);
  assert.deepEqual(result.fabric.colors[0].pieces[1], JSON.parse(JSON.stringify(original.colors[0].pieces[1])));
  assert.deepEqual(result.fabric.colors[1], JSON.parse(JSON.stringify(original.colors[1])));
  assert.equal(result.fabric.__v, 1);
  assert.equal(result.fabric.movements, undefined);
  assert.deepEqual(fabricTotals(result.fabric.colors), { quantity: 3, meters: 69 });
  const movement = result.movement;
  assert.deepEqual([movement.beforeMeters, movement.meters, movement.remainingMeters], [30, 20, 10]);
  assert.deepEqual([movement.type, movement.reference, movement.color, movement.colorNumber, movement.barcode], ["Coton", "T-001", "Bleu marine", "007", first]);
  assert.equal(movement.idAdmin, owner);
  assert.equal(movement.createdBy, owner);
  assert.ok(new Date(movement.occurredAt).getTime() >= start && new Date(movement.occurredAt).getTime() <= Date.now());
  assert.equal(f.records[0].movements.length, 0);
  const listed = await history(first);
  assert.deepEqual(listed.movements, [movement]);
  const fabrics = (await (await request("")).json()).fabrics;
  assert.equal(fabrics[0].colors[0].pieces[0].meters, 10);
  assert.equal(fabrics[0].movements, undefined);
});

test("multiple deductions record their dates and successive before / removed / remaining values", async (t) => {
  const f = setup(t), original = f.seed();
  assert.equal((await request(suffix(original), payload(original, "12,125"))).status, 201);
  const current = f.records[0];
  assert.equal((await request(suffix(current), payload(current, "0.001"))).status, 201);
  assert.equal(f.records[0].colors[0].pieces[0].meters, 17.874);
  const entries = (await history(first)).movements;
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((row) => [row.beforeMeters, row.meters, row.remainingMeters]), [[17.875, 0.001, 17.874], [30, 12.125, 17.875]]);
  assert.ok(entries.every((row) => !Number.isNaN(new Date(row.occurredAt).getTime())));
});

test("zero, negatives, excess precision, malformed quantities and over-selling do not change stock or history", async (t) => {
  const f = setup(t), original = f.seed();
  const before = JSON.stringify(f.records);
  for (const meters of [0, -1, "", null, true, {}, "1e2", "3 metres", "0.0001", 0.0001, "1,2,3", 1000001, 30.001, 31]) {
    const response = await request(suffix(original), payload(original, meters));
    assert.equal(response.status, [30.001, 31].includes(meters) ? 409 : 400, String(meters));
    assert.ok(["invalidReduction", "insufficientMeters"].includes((await response.json()).message));
  }
  assert.equal(JSON.stringify(f.records), before);
  assert.equal(f.archive.length, 0);
  assert.equal(f.save.mock.callCount(), 0);
});

test("selling the exact remaining length leaves a zero-metre exhausted piece with its barcode and history", async (t) => {
  const f = setup(t), original = f.seed({ type: "Lin", colors: [{ name: "Vert", pieces: [{ meters: 0.3, barcode: first }] }] });
  assert.equal((await request(suffix(original), payload(original, "0,1"))).status, 201);
  const current = f.records[0];
  assert.equal((await request(suffix(current), payload(current, "0.2"))).status, 201);
  assert.equal(f.records[0].colors[0].pieces[0].meters, 0);
  assert.equal(f.records[0].colors[0].pieces[0].barcode, first);
  assert.deepEqual(fabricTotals(f.records[0].colors), { quantity: 0, meters: 0 });
  assert.equal((await request(suffix(f.records[0]), payload(f.records[0], 0.001))).status, 409);
  assert.equal((await history(first)).movements.length, 2);
  const body = JSON.parse(JSON.stringify(f.records[0]));
  body.version = f.records[0].__v;
  body.type = "Lin fin";
  const updated = await request(`/${original._id}`, body, claims, "PUT");
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).colors[0].pieces[0].meters, 0);
  const zeroNewPiece = { type: "Coton", colors: [{ name: "Bleu", pieces: [{ meters: 0, barcode: second }] }] };
  assert.equal((await request("", zeroNewPiece)).status, 400);
});

test("repeating a successful request, including after deletion, cannot deduct twice", async (t) => {
  const f = setup(t), original = f.seed(), body = payload(original);
  const firstResult = await (await request(suffix(original), body)).json();
  const replay = await request(suffix(original), body);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).movement._id, firstResult.movement._id);
  assert.equal(f.records[0].colors[0].pieces[0].meters, 10);
  assert.equal(f.save.mock.callCount(), 1);
  assert.equal((await request(suffix(original), { ...body, meters: 15 })).status, 409);
  assert.equal((await request(`/${original._id}`, { version: 1 }, claims, "DELETE")).status, 200);
  const afterDelete = await request(suffix(original), body);
  assert.equal(afterDelete.status, 200);
  const result = await afterDelete.json();
  assert.equal(result.fabric, null);
  assert.equal(result.movement._id, firstResult.movement._id);
  assert.equal((await history(first)).movements.length, 1);
});

test("concurrent duplicate submissions produce one deduction and one history entry", async (t) => {
  const f = setup(t), original = f.seed(), body = payload(original, 5);
  const responses = await Promise.all([request(suffix(original), body), request(suffix(original), body)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  const results = await Promise.all(responses.map((response) => response.json()));
  assert.equal(results[0].movement._id, results[1].movement._id);
  assert.equal(f.records[0].colors[0].pieces[0].meters, 25);
  assert.equal((await history(first)).movements.length, 1);
});

test("two different concurrent requests cannot oversell through a stale stock version", async (t) => {
  const f = setup(t), original = f.seed();
  const responses = await Promise.all([request(suffix(original), payload(original, 20)), request(suffix(original), payload(original, 20))]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(f.records[0].colors[0].pieces[0].meters, 10);
  assert.equal((await history(first)).movements.length, 1);
});

test("failed stock saves change neither stock nor its dated record", async (t) => {
  const f = setup(t), original = f.seed();
  const before = JSON.stringify(f.records);
  f.save.mock.mockImplementation(async () => { throw new Error("Private persistence details"); });
  const response = await request(suffix(original), payload(original));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: "reductionFailed" });
  assert.equal(JSON.stringify(f.records), before);
  assert.equal(f.archive.length, 0);
  assert.equal(f.bulk.mock.callCount(), 0);
  assert.equal((await history()).movements.length, 0);
});

test("archive outages keep a durable dated record alongside stock and prevent deletion from losing it", async (t) => {
  const f = setup(t), original = f.seed(), body = payload(original);
  const originalBulk = f.bulk.mock.calls.length;
  const workingBulk = FabricMovement.bulkWrite;
  f.bulk.mock.mockImplementation(async () => { throw new Error("Archive unavailable"); });
  const response = await request(suffix(original), body);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(f.records[0].colors[0].pieces[0].meters, 10);
  assert.equal(f.records[0].movements.length, 1);
  assert.equal(f.archive.length, 0);
  assert.deepEqual((await history()).movements, [result.movement]);
  assert.equal((await request(suffix(original), body)).status, 200);
  assert.equal(f.save.mock.callCount(), 1);
  assert.equal((await request(`/${original._id}`, { version: 1 }, claims, "DELETE")).status, 500);
  assert.equal(f.remove.mock.callCount(), 0);
  assert.equal(f.records.length, 1);
  assert.ok(f.bulk.mock.callCount() > originalBulk);
  f.bulk.mock.restore();
  assert.notEqual(FabricMovement.bulkWrite, workingBulk);
  t.mock.method(FabricMovement, "bulkWrite", async (operations) => { operations.forEach((entry) => f.archive.push(new FabricMovement(entry.updateOne.update.$setOnInsert))); });
  assert.equal((await request(`/${original._id}`, { version: 1 }, claims, "DELETE")).status, 200);
  assert.equal(f.records.length, 0);
  assert.deepEqual((await history()).movements, [result.movement]);
});

test("overlap between pending and archived history is deduplicated and snapshots survive later edits", async (t) => {
  const f = setup(t), original = f.seed();
  f.trim.mock.mockImplementation(async () => { throw new Error("Trim unavailable"); });
  assert.equal((await request(suffix(original), payload(original))).status, 201);
  assert.equal(f.archive.length, 1);
  assert.equal(f.records[0].movements.length, 1);
  assert.equal((await history(first)).movements.length, 1);
  const body = JSON.parse(JSON.stringify(f.records[0]));
  body.version = 1; body.type = "Changed type"; body.colors[0].name = "Changed color"; body.colors[0].pieces[0].barcode = generateFabricBarcode(new Set([first, second, third]));
  assert.equal((await request(`/${original._id}`, body, claims, "PUT")).status, 200);
  const entry = (await history(first)).movements[0];
  assert.deepEqual([entry.type, entry.color, entry.barcode], ["Coton", "Bleu marine", first]);
});

test("shop scope and current employee update permissions are enforced before any deduction", async (t) => {
  const f = setup(t), original = f.seed(), foreign = f.seed(input, foreignOwner);
  assert.equal((await request(suffix(foreign), payload(foreign))).status, 404);
  assert.equal((await request(suffix(foreign), payload(foreign), staffClaims)).status, 404);
  f.staff.action.update = false;
  assert.equal((await request(suffix(original), payload(original), staffClaims)).status, 403);
  f.staff.isActive = false;
  assert.equal((await request(suffix(original), payload(original), staffClaims)).status, 403);
  assert.equal((await request("/movements", undefined, staffClaims)).status, 403);
  f.staff.isActive = true; f.staff.action.update = true;
  const response = await request(suffix(original), payload(original), staffClaims);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).movement.createdBy, employee);
  assert.equal((await history("", 0, staffClaims)).movements.length, 1);
  assert.equal((await history("", 0, { id: foreignOwner, role: "admin" })).movements.length, 0);
  assert.equal(f.save.mock.callCount(), 1);
});

test("authentication, valid identities, barcodes, request IDs and versions are required", async (t) => {
  const f = setup(t), original = f.seed(), body = payload(original);
  assert.equal((await request(suffix(original), body, null)).status, 401);
  assert.equal((await request("/movements", undefined, null)).status, 401);
  assert.equal(f.actor.mock.callCount(), 0);
  assert.equal((await request(suffix(original), body, { id: owner, role: "visitor" })).status, 403);
  for (const patch of [{ requestId: "" }, { requestId: {} }, { barcode: second }, { barcode: "123" }, { version: "0" }, { version: 1 }, { version: -1 }]) {
    assert.ok([400, 404, 409].includes((await request(suffix(original), { ...body, ...patch })).status));
  }
  for (const path of [suffix(original).replace(String(original._id), "bad-id"), suffix(original).replace(String(original.colors[0]._id), foreignOwner), suffix(original).replace(String(original.colors[0].pieces[0]._id), String(original.colors[1].pieces[0]._id))]) {
    assert.equal((await request(path, body)).status, 404);
  }
  assert.equal(f.save.mock.callCount(), 0);
});

test("history pagination and barcode filtering return dated records without gaps or duplicates", async (t) => {
  const f = setup(t), original = f.seed();
  for (let index = 0; index < 61; index += 1) f.archive.push(new FabricMovement({
    idAdmin: owner, createdBy: owner, fabricId: original._id, colorId: original.colors[0]._id, pieceId: original.colors[0].pieces[0]._id,
    requestId: randomUUID(), type: "Coton", color: "Bleu", barcode: index === 0 ? second : first,
    beforeMeters: 30, meters: 1, remainingMeters: 29, occurredAt: new Date(1700000000000 + index * 1000),
  }));
  original.movements.push(f.archive[60].toObject());
  const page1 = await history(first);
  assert.equal(page1.movements.length, 50); assert.equal(page1.hasMore, true); assert.equal(page1.nextOffset, 50);
  const page2 = await history(first, page1.nextOffset);
  assert.equal(page2.movements.length, 10); assert.equal(page2.hasMore, false);
  assert.equal(new Set([...page1.movements, ...page2.movements].map((row) => row._id)).size, 60);
  assert.equal((await history(second)).movements.length, 1);
  for (const path of ["/movements?barcode=123", "/movements?offset=-1", "/movements?offset=1.5", "/movements?offset=bad"]) assert.equal((await request(path)).status, 400);
});

test("archive read errors return a stable history error without touching stock", async (t) => {
  const f = setup(t); f.seed();
  f.archiveFind.mock.mockImplementation(() => query(() => { throw new Error("Private read details"); }));
  const response = await request("/movements");
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: "loadMovementsFailed" });
  assert.equal(f.save.mock.callCount(), 0);
});

test("decimal reduction arithmetic remains exact and no ledger indexes leak into the stock schema", () => {
  assert.deepEqual(calculateFabricReduction("0,1", 0.3), { meters: 0.1, remaining: 0.2 });
  assert.deepEqual(calculateFabricReduction(0.2, 0.2), { meters: 0.2, remaining: 0 });
  assert.throws(() => calculateFabricReduction(0.001, 0), { message: "insufficientMeters" });
  assert.ok(Fabric.schema.indexes().every(([index]) => Object.keys(index).every((key) => !key.startsWith("movements."))));
});
