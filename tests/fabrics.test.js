import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import app from "../BackEnd/app.js";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import Fabric from "../BackEnd/models/Fabric.js";
import { FABRIC_LIMITS, fabricTotals, filterFabrics, findFabricPieces, generateFabricBarcode, isFabricBarcode, validateFabric } from "../shared/fabrics.js";

const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
const claims = { id: owner, role: "admin" };
const employeeClaims = { id: employee, idAdmin: otherOwner, role: "Employe", action: { add: true } };
const first = generateFabricBarcode(), second = generateFabricBarcode(new Set([first])), third = generateFabricBarcode(new Set([first, second]));
const input = {
  type: "  Coton  ", reference: " T-001 ",
  colors: [
    { name: " Bleu marine ", number: " 007 ", pieces: [{ meters: "35", barcode: first }, { meters: "47", barcode: second }] },
    { name: "Rouge", number: "008", pieces: [{ meters: "12,375", barcode: third }] },
  ],
};
const secret = process.env.JWT_SECRET;
let server, base;
before(async () => {
  process.env.JWT_SECRET = "fabric-test-secret";
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/fabrics`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secret;
});
const request = (method = "GET", body, auth = claims, suffix = "") => fetch(base + suffix, {
  method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${jwt.sign(auth, process.env.JWT_SECRET)}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const query = (fn) => ({ select() { return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } });
function setup(t) {
  const actors = new Map([[owner, { _id: owner }], [otherOwner, { _id: otherOwner }]]);
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: true, delete: true } };
  const records = [];
  const readActor = t.mock.method(AdminModel, "findById", (id) => query(() => actors.get(String(id))));
  t.mock.method(EmployeModel, "findById", (id) => query(() => String(id) === employee ? staff : null));
  t.mock.method(Fabric, "find", (scope) => query(() => records.filter((doc) => String(doc.idAdmin) === String(scope.idAdmin)).map((doc) => doc.toObject())));
  const exists = t.mock.method(Fabric, "exists", async (scope) => records.some((doc) => String(doc.idAdmin) === String(scope.idAdmin) && (!scope._id?.$ne || String(doc._id) !== String(scope._id.$ne)) && doc.colors.some((color) => color.pieces.some((piece) => scope["colors.pieces.barcode"].$in.includes(piece.barcode)))) ? { _id: records[0]._id } : null);
  const findOne = t.mock.method(Fabric, "findOne", async (scope) => {
    const document = records.find((doc) => String(doc._id) === String(scope._id) && String(doc.idAdmin) === String(scope.idAdmin));
    return document ? new Fabric(document.toObject()) : null;
  });
  const save = t.mock.method(Fabric.prototype, "save", async function () {
    const index = records.findIndex((doc) => String(doc._id) === String(this._id));
    if (index < 0 || this.__v !== records[index].__v) throw Object.assign(new Error("Concurrent update"), { name: "VersionError" });
    await this.validate();
    this.__v += 1;
    records[index] = new Fabric(this.toObject());
    return this;
  });
  const create = t.mock.method(Fabric, "create", async (data) => {
    const document = new Fabric({ ...data, __v: 0 });
    await document.validate();
    records.push(document);
    return document;
  });
  const deleteOne = t.mock.method(Fabric, "deleteOne", async (scope) => {
    const index = records.findIndex((doc) => String(doc._id) === String(scope._id) && String(doc.idAdmin) === String(scope.idAdmin) && doc.__v === scope.__v);
    if (index < 0) return { deletedCount: 0 };
    records.splice(index, 1);
    return { deletedCount: 1 };
  });
  const seed = (idAdmin = owner, data = input) => {
    const document = new Fabric({ ...validateFabric(data), idAdmin, createdBy: idAdmin, __v: 0 });
    records.push(document);
    return document;
  };
  return { actors, staff, records, readActor, exists, create, findOne, save, deleteOne, seed };
}

test("one fabric preserves multiple colors and independently barcoded 35m / 47m pieces after reload", async (t) => {
  setup(t);
  const response = await request("POST", input);
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.type, "Coton");
  assert.equal(saved.reference, "T-001");
  assert.equal(saved.colors[0].name, "Bleu marine");
  assert.equal(saved.colors[0].number, "007");
  assert.deepEqual(saved.colors[0].pieces.map(({ meters, barcode }) => ({ meters, barcode })), [{ meters: 35, barcode: first }, { meters: 47, barcode: second }]);
  assert.equal(saved.colors[1].pieces[0].meters, 12.375);
  assert.deepEqual(fabricTotals([saved.colors[0]]), { quantity: 2, meters: 82 });
  assert.deepEqual(fabricTotals(saved.colors), { quantity: 3, meters: 94.375 });
  const list = await (await request()).json();
  assert.deepEqual(list.fabrics, [saved]);
  assert.deepEqual(list.permissions, { add: true, update: true, delete: true });
});

test("optional numbers can be empty and quantity comes from physical pieces", async (t) => {
  setup(t);
  const response = await request("POST", { type: "Satin", colors: [{ name: "أزرق", pieces: [{ meters: 0.001, barcode: first }] }], quantity: 100 });
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.reference, "");
  assert.equal(saved.colors[0].number, "");
  assert.equal(saved.quantity, undefined);
  assert.deepEqual(fabricTotals(saved.colors), { quantity: 1, meters: 0.001 });
});

test("ownership, document IDs and creation metadata cannot be supplied by the browser", async (t) => {
  setup(t);
  const response = await request("POST", { ...input, _id: otherOwner, idAdmin: otherOwner, createdBy: otherOwner, createdAt: "2000-01-01", colors: input.colors.map((color) => ({ ...color, _id: otherOwner, pieces: color.pieces.map((piece) => ({ ...piece, _id: otherOwner })) })) });
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.idAdmin, owner);
  assert.equal(saved.createdBy, owner);
  assert.notEqual(saved._id, otherOwner);
  assert.notEqual(saved.colors[0]._id, otherOwner);
  assert.notEqual(saved.colors[0].pieces[0]._id, otherOwner);
  assert.notEqual(saved.createdAt, "2000-01-01");
});

test("each shop sees only its fabrics and may use a barcode present in another shop", async (t) => {
  const f = setup(t);
  f.seed(otherOwner);
  assert.deepEqual((await (await request()).json()).fabrics, []);
  assert.equal((await request("POST", input)).status, 201);
  const list = await (await request()).json();
  assert.equal(list.fabrics.length, 1);
  assert.equal(list.fabrics[0].idAdmin, owner);
});

test("duplicate piece barcodes across fabrics are rejected without saving", async (t) => {
  const f = setup(t);
  f.seed();
  const response = await request("POST", { ...input, type: "Satin" });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { message: "duplicateBarcode" });
  assert.equal(f.create.mock.callCount(), 0);
});

test("a barcode collision detected by the database during a concurrent save returns a conflict", async (t) => {
  const f = setup(t);
  f.create.mock.mockImplementation(async () => { throw Object.assign(new Error("Index details"), { code: 11000 }); });
  const response = await request("POST", input);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { message: "duplicateBarcode" });
});

test("employee permissions and owner are read from the current account", async (t) => {
  const f = setup(t);
  f.seed(otherOwner);
  const response = await request("POST", input, employeeClaims);
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.idAdmin, owner);
  assert.equal(saved.createdBy, employee);
  const list = await (await request("GET", undefined, employeeClaims)).json();
  assert.equal(list.fabrics.length, 1);
  assert.equal(list.fabrics[0].idAdmin, owner);
  f.staff.action.add = false;
  assert.deepEqual((await (await request("GET", undefined, employeeClaims)).json()).permissions, { add: false, update: true, delete: true });
  assert.equal((await request("POST", input, employeeClaims)).status, 403);
  f.staff.isActive = false;
  assert.equal((await request("GET", undefined, employeeClaims)).status, 403);
  assert.equal((await request("POST", input, employeeClaims)).status, 403);
  assert.equal(f.create.mock.callCount(), 1);
});

test("authentication and a current supported account are required", async (t) => {
  const f = setup(t);
  for (const method of ["GET", "POST"]) assert.equal((await request(method, method === "POST" ? input : undefined, null)).status, 401);
  assert.equal(f.readActor.mock.callCount(), 0);
  assert.equal((await request("POST", input, { id: owner, role: "visitor" })).status, 403);
  f.actors.delete(owner);
  assert.equal((await request()).status, 403);
  assert.equal(f.create.mock.callCount(), 0);
});

for (const [name, patch, field] of [
  ["empty type", { type: " " }, "type"],
  ["object type", { type: { $ne: "" } }, "type"],
  ["long reference", { reference: "x".repeat(121) }, "reference"],
  ["missing colors", { colors: [] }, "colors"],
  ["invalid color", { colors: [null] }, "colors.0"],
  ["empty color", { colors: [{ ...input.colors[0], name: "" }] }, "colors.0.name"],
  ["numeric color number", { colors: [{ ...input.colors[0], number: 7 }] }, "colors.0.number"],
  ["missing pieces", { colors: [{ ...input.colors[0], pieces: [] }] }, "colors.0.pieces"],
  ["duplicate barcode in a color", { colors: [{ ...input.colors[0], pieces: [{ meters: 35, barcode: first }, { meters: 47, barcode: first }] }] }, "colors.0.pieces.1.barcode"],
  ["duplicate barcode across colors", { colors: [input.colors[0], { ...input.colors[1], pieces: [{ meters: 1, barcode: first }] }] }, "colors.1.pieces.0.barcode"],
  ["duplicate color and reference", { colors: [input.colors[0], { ...input.colors[0], pieces: [{ meters: 1, barcode: third }] }] }, "colors.1.name"],
]) test(`${name} is rejected before persistence`, async (t) => {
  const f = setup(t);
  const response = await request("POST", { ...input, ...patch });
  assert.equal(response.status, 400);
  assert.ok((await response.json()).fields[field]);
  assert.equal(f.create.mock.callCount(), 0);
  assert.equal(f.exists.mock.callCount(), 0);
});

test("zero, negative, malformed, excessive and overprecise lengths are rejected", async (t) => {
  const f = setup(t);
  for (const meters of [0, -1, "", null, true, {}, "35 meters", "1e2", "1,2,3", "0.0001", 0.0001, FABRIC_LIMITS.meters + 1]) {
    const response = await request("POST", { type: "Lin", colors: [{ name: "Bleu", pieces: [{ meters, barcode: first }] }] });
    assert.equal(response.status, 400, String(meters));
    assert.equal((await response.json()).fields["colors.0.pieces.0.meters"], "invalidMeters");
  }
  assert.equal(f.create.mock.callCount(), 0);
});

test("invalid EAN checksums cannot be saved", async (t) => {
  const f = setup(t);
  for (const barcode of ["", "abc", 2123456789012, first.slice(0, 12) + ((Number(first[12]) + 1) % 10)]) {
    const response = await request("POST", { type: "Lin", colors: [{ name: "Bleu", pieces: [{ meters: 5, barcode }] }] });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).fields["colors.0.pieces.0.barcode"], "invalidBarcode");
  }
  assert.equal(f.create.mock.callCount(), 0);
});

test("piece limits apply across all colors and duplicate color names may have distinct numbers", () => {
  const used = new Set();
  const pieces = Array.from({ length: 501 }, () => { const barcode = generateFabricBarcode(used); used.add(barcode); return { meters: 1, barcode }; });
  const colors = [{ name: "Bleu", number: "01", pieces: pieces.slice(0, 250) }, { name: "Bleu", number: "02", pieces: pieces.slice(250) }];
  assert.throws(() => validateFabric({ type: "Coton", colors }), (error) => error.fields.colors === "tooManyPieces");
  colors[1].pieces.pop();
  assert.equal(fabricTotals(validateFabric({ type: "Coton", colors }).colors).quantity, 500);
});

test("generated codes are unique, scannable EAN13 values and decimal totals stay exact", () => {
  const used = new Set();
  for (let index = 0; index < 1000; index += 1) {
    const code = generateFabricBarcode(used);
    assert.equal(isFabricBarcode(code), true);
    assert.equal(used.has(code), false);
    used.add(code);
  }
  assert.equal(isFabricBarcode(2123456789012), false);
  assert.deepEqual(fabricTotals([{ pieces: [{ meters: 0.1 }, { meters: 0.2 }] }]), { quantity: 2, meters: 0.3 });
});

test("search finds types, color numbers, accented names, Arabic and individual piece barcodes", () => {
  const fabric = validateFabric(input);
  const other = { type: "Étoffe", reference: "T-002", colors: [{ name: "أزرق", number: "009", pieces: [{ meters: 8, barcode: "different" }] }] };
  const fabrics = [fabric, other];
  for (const search of ["coton", "t-001", "marine", "007", second]) assert.deepEqual(filterFabrics(fabrics, search), [fabric]);
  for (const search of ["etoffe", "أزرق", "009"]) assert.deepEqual(filterFabrics(fabrics, search), [other]);
  assert.deepEqual(filterFabrics(fabrics, "absent"), []);
});

test("database failures preserve a stable error code without exposing internal details", async (t) => {
  const f = setup(t);
  f.create.mock.mockImplementation(async () => { throw new Error("Internal database details"); });
  const response = await request("POST", input);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: "saveFailed" });
});

const updatePayload = (fabric) => ({ ...JSON.parse(JSON.stringify(fabric)), version: fabric.__v });

test("editing a fabric updates fields, colors and meters while preserving existing IDs and barcodes", async (t) => {
  const f = setup(t);
  const original = f.seed();
  const payload = updatePayload(original);
  payload.type = "Lin";
  payload.reference = "T-002";
  payload.colors[0].name = "Vert";
  payload.colors[0].number = "009";
  payload.colors[0].pieces[0].meters = "37";
  const newCode = generateFabricBarcode(new Set([first, second, third]));
  payload.colors[0].pieces.push({ meters: 10, barcode: newCode });
  const whiteCode = generateFabricBarcode(new Set([first, second, third, newCode]));
  payload.colors.push({ name: "Blanc", number: "010", pieces: [{ meters: 5, barcode: whiteCode }] });
  const response = await request("PUT", payload, claims, `/${original._id}`);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved._id, String(original._id));
  assert.equal(saved.type, "Lin");
  assert.equal(saved.reference, "T-002");
  assert.equal(saved.colors[0]._id, String(original.colors[0]._id));
  assert.equal(saved.colors[0].name, "Vert");
  assert.equal(saved.colors[0].number, "009");
  assert.deepEqual(saved.colors[0].pieces.slice(0, 2).map(({ _id, barcode }) => ({ _id, barcode })), original.colors[0].pieces.map((piece) => ({ _id: String(piece._id), barcode: piece.barcode })));
  assert.equal(saved.colors[0].pieces[0].meters, 37);
  assert.deepEqual(fabricTotals(saved.colors), { quantity: 5, meters: 111.375 });
  assert.equal(saved.__v, 1);
  assert.equal(f.create.mock.callCount(), 0);
  const reloaded = (await (await request()).json()).fabrics;
  assert.equal(reloaded.length, 1);
  assert.deepEqual(reloaded[0], saved);
});

test("removing colors and pieces on update recalculates quantities without changing the remaining barcode", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const payload = updatePayload(fabric);
  payload.colors = [{ ...payload.colors[0], pieces: [payload.colors[0].pieces[0]] }];
  const response = await request("PUT", payload, claims, `/${fabric._id}`);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(fabricTotals(saved.colors), { quantity: 1, meters: 35 });
  assert.equal(saved.colors[0].pieces[0].barcode, first);
  assert.equal(saved.colors[0].pieces[0]._id, String(fabric.colors[0].pieces[0]._id));
});

test("unchanged barcodes are permitted on update and legacy payloads recover piece IDs by barcode", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const response = await request("PUT", { ...input, type: "Satin" }, claims, `/${fabric._id}`);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(saved.colors.map((color) => color._id), fabric.colors.map((color) => String(color._id)));
  assert.deepEqual(saved.colors.flatMap((color) => color.pieces.map((piece) => piece._id)), fabric.colors.flatMap((color) => color.pieces.map((piece) => String(piece._id))));
});

test("an explicitly regenerated barcode preserves the physical piece ID", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const payload = updatePayload(fabric);
  const newCode = generateFabricBarcode(new Set([first, second, third]));
  payload.colors[0].pieces[0].barcode = newCode;
  const response = await request("PUT", payload, claims, `/${fabric._id}`);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.colors[0].pieces[0].barcode, newCode);
  assert.equal(saved.colors[0].pieces[0]._id, String(fabric.colors[0].pieces[0]._id));
});

test("updates cannot transfer fabric ownership or creation metadata", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const response = await request("PUT", { ...updatePayload(fabric), idAdmin: otherOwner, createdBy: otherOwner, _id: otherOwner, createdAt: "2000-01-01", __v: 999 }, claims, `/${fabric._id}`);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.idAdmin, owner);
  assert.equal(saved.createdBy, owner);
  assert.equal(saved._id, String(fabric._id));
  assert.notEqual(saved.createdAt, "2000-01-01");
  assert.equal(saved.__v, 1);
});

test("another shop's fabric, missing IDs and malformed IDs cannot be updated", async (t) => {
  const f = setup(t);
  const foreign = f.seed(otherOwner);
  for (const id of [String(foreign._id), "invalid-id", employee]) {
    const response = await request("PUT", input, claims, `/${id}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: "notFound" });
  }
  assert.equal(f.save.mock.callCount(), 0);
});

test("a barcode from another fabric in the same shop cannot be assigned during update", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const reserved = generateFabricBarcode(new Set([first, second, third]));
  f.seed(owner, { type: "Satin", colors: [{ name: "Bleu", pieces: [{ meters: 10, barcode: reserved }] }] });
  const before = JSON.stringify(f.records);
  const payload = updatePayload(fabric);
  payload.colors[0].pieces[0].barcode = reserved;
  const response = await request("PUT", payload, claims, `/${fabric._id}`);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { message: "duplicateBarcode" });
  assert.equal(JSON.stringify(f.records), before);
  assert.equal(f.save.mock.callCount(), 0);
});

test("invalid update input leaves the persisted stock unchanged", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const before = JSON.stringify(f.records);
  for (const mutate of [
    (payload) => { payload.type = ""; },
    (payload) => { payload.colors[0].pieces[0].meters = -1; },
    (payload) => { payload.colors[0].pieces[1].barcode = first; },
    (payload) => { payload.colors = []; },
  ]) {
    const payload = updatePayload(fabric); mutate(payload);
    const response = await request("PUT", payload, claims, `/${fabric._id}`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, "invalidFabric");
    assert.equal(JSON.stringify(f.records), before);
  }
  assert.equal(f.save.mock.callCount(), 0);
});

test("foreign and repeated embedded IDs are rejected before saving", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const foreign = f.seed(otherOwner);
  for (const mutate of [
    (payload) => { payload.colors[0]._id = String(foreign.colors[0]._id); },
    (payload) => { payload.colors[0].pieces[0]._id = String(foreign.colors[0].pieces[0]._id); },
    (payload) => { payload.colors[0].pieces[1]._id = payload.colors[0].pieces[0]._id; },
    (payload) => { payload.colors[1]._id = payload.colors[0]._id; },
    (payload) => { payload.colors[0]._id = { $ne: "" }; },
  ]) {
    const payload = updatePayload(fabric); mutate(payload);
    const response = await request("PUT", payload, claims, `/${fabric._id}`);
    assert.equal(response.status, 400);
    assert.ok(Object.values((await response.json()).fields).includes("invalidIdentity"));
  }
  assert.equal(f.save.mock.callCount(), 0);
});

test("employee add and update permissions are independent and evaluated from the current account", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  f.staff.action.update = false;
  assert.deepEqual((await (await request("GET", undefined, employeeClaims)).json()).permissions, { add: true, update: false, delete: true });
  assert.equal((await request("PUT", updatePayload(fabric), { ...employeeClaims, action: { update: true } }, `/${fabric._id}`)).status, 403);
  f.staff.action = { add: false, update: true };
  assert.equal((await request("POST", input, employeeClaims)).status, 403);
  assert.equal((await request("PUT", { ...updatePayload(fabric), type: "Employé" }, employeeClaims, `/${fabric._id}`)).status, 200);
  assert.equal(f.records[0].type, "Employé");
  f.staff.isActive = false;
  assert.equal((await request("PUT", input, employeeClaims, `/${fabric._id}`)).status, 403);
  assert.equal(f.save.mock.callCount(), 1);
});

test("update authentication is required before any database access", async (t) => {
  const f = setup(t);
  assert.equal((await request("PUT", input, null, `/${employee}`)).status, 401);
  assert.equal(f.readActor.mock.callCount(), 0);
  assert.equal(f.findOne.mock.callCount(), 0);
});

test("a stale form cannot overwrite a fabric saved by another editor", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const firstEdit = updatePayload(fabric);
  firstEdit.colors[0].pieces[0].meters = 34;
  assert.equal((await request("PUT", firstEdit, claims, `/${fabric._id}`)).status, 200);
  const stale = updatePayload(fabric);
  stale.colors[0].pieces[0].meters = 40;
  const response = await request("PUT", stale, claims, `/${fabric._id}`);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { message: "conflict" });
  assert.equal(f.records[0].colors[0].pieces[0].meters, 34);
  assert.equal(f.save.mock.callCount(), 1);
});

test("a concurrent database save conflict returns a stable error without overwriting stock", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  f.save.mock.mockImplementation(async () => { throw Object.assign(new Error("Internal version details"), { name: "VersionError" }); });
  const response = await request("PUT", updatePayload(fabric), claims, `/${fabric._id}`);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { message: "conflict" });
  assert.equal(f.records[0].__v, 0);
});

test("database update failures return saveFailed and retain the original record", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  f.save.mock.mockImplementation(async () => { throw new Error("Internal database details"); });
  const response = await request("PUT", { ...updatePayload(fabric), type: "Failed edit" }, claims, `/${fabric._id}`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: "saveFailed" });
  assert.equal(f.records[0].type, "Coton");
});

const deletePaths = (fabric) => [
  `/${fabric._id}`,
  `/${fabric._id}/colors/${fabric.colors[0]._id}`,
  `/${fabric._id}/colors/${fabric.colors[0]._id}/pieces/${fabric.colors[0].pieces[0]._id}`,
];
const deleteRequest = (fabric, suffix, auth = claims, body = { version: fabric.__v }) => request("DELETE", body, auth, suffix);

test("deleting one piece preserves sibling colors, piece IDs and barcodes after reload", async (t) => {
  const f = setup(t);
  const original = f.seed();
  const response = await deleteRequest(original, deletePaths(original)[2]);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.fabricId, String(original._id));
  assert.equal(result.fabric.__v, 1);
  assert.deepEqual(fabricTotals(result.fabric.colors), { quantity: 2, meters: 59.375 });
  assert.deepEqual(result.fabric.colors[0].pieces.map((piece) => ({ id: piece._id, barcode: piece.barcode })), [{ id: String(original.colors[0].pieces[1]._id), barcode: second }]);
  assert.deepEqual(result.fabric.colors[1], JSON.parse(JSON.stringify(original.colors[1])));
  assert.deepEqual((await (await request()).json()).fabrics, [result.fabric]);
  assert.equal(f.deleteOne.mock.callCount(), 0);
});

test("deleting a color removes all of its pieces and retains the other color", async (t) => {
  const f = setup(t);
  const original = f.seed();
  const response = await deleteRequest(original, deletePaths(original)[1]);
  assert.equal(response.status, 200);
  const { fabric } = await response.json();
  assert.deepEqual(fabric.colors, [JSON.parse(JSON.stringify(original.colors[1]))]);
  assert.deepEqual(fabricTotals(fabric.colors), { quantity: 1, meters: 12.375 });
  assert.equal(fabric.__v, 1);
});

test("deleting the last piece of a color also removes the empty color", async (t) => {
  const f = setup(t);
  const original = f.seed();
  const color = original.colors[1];
  const response = await deleteRequest(original, `/${original._id}/colors/${color._id}/pieces/${color.pieces[0]._id}`);
  assert.equal(response.status, 200);
  const { fabric } = await response.json();
  assert.deepEqual(fabric.colors, [JSON.parse(JSON.stringify(original.colors[0]))]);
  assert.deepEqual(fabricTotals(fabric.colors), { quantity: 2, meters: 82 });
  assert.equal(f.deleteOne.mock.callCount(), 0);
});

for (const kind of ["color", "piece"]) test(`deleting the last ${kind} removes the empty fabric without saving invalid stock`, async (t) => {
  const f = setup(t);
  const original = f.seed(owner, { type: "Satin", colors: [{ name: "Blanc", pieces: [{ meters: 7, barcode: first }] }] });
  const response = await deleteRequest(original, deletePaths(original)[kind === "color" ? 1 : 2]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { fabricId: String(original._id), fabric: null });
  assert.equal((await (await request()).json()).fabrics.length, 0);
  assert.equal(f.save.mock.callCount(), 0);
  assert.equal(f.deleteOne.mock.callCount(), 1);
});

test("deleting a fabric removes its entire stock and keeps other fabrics and shops", async (t) => {
  const f = setup(t);
  const original = f.seed();
  const ownOther = f.seed(owner, { type: "Lin", colors: [{ name: "Vert", pieces: [{ meters: 8, barcode: generateFabricBarcode(new Set([first, second, third])) }] }] });
  const foreign = f.seed(otherOwner);
  const response = await deleteRequest(original, deletePaths(original)[0]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { fabricId: String(original._id), fabric: null });
  assert.deepEqual(f.records.map((entry) => String(entry._id)), [String(ownOther._id), String(foreign._id)]);
  assert.deepEqual((await (await request()).json()).fabrics.map((entry) => entry._id), [String(ownOther._id)]);
  assert.equal((await deleteRequest(original, deletePaths(original)[0])).status, 404);
  assert.equal(f.deleteOne.mock.callCount(), 1);
});

test("another shop's fabric cannot be deleted at any level even with forged ownership claims", async (t) => {
  const f = setup(t);
  const foreign = f.seed(otherOwner);
  const before = JSON.stringify(f.records);
  for (const suffix of deletePaths(foreign)) {
    assert.equal((await deleteRequest(foreign, suffix)).status, 404);
    assert.equal((await deleteRequest(foreign, suffix, employeeClaims)).status, 404);
  }
  assert.equal(JSON.stringify(f.records), before);
  assert.equal(f.save.mock.callCount(), 0);
  assert.equal(f.deleteOne.mock.callCount(), 0);
});

test("missing, malformed and mismatched color or piece IDs do not delete any stock", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const foreign = f.seed(otherOwner);
  const prefix = `/${fabric._id}/colors/${fabric.colors[0]._id}`;
  const before = JSON.stringify(f.records);
  for (const suffix of [
    "/bad-id", `/${employee}`, `/${fabric._id}/colors/bad-id`,
    `/${fabric._id}/colors/${employee}`, `/${fabric._id}/colors/${foreign.colors[0]._id}`,
    `${prefix}/pieces/bad-id`, `${prefix}/pieces/${employee}`,
    `${prefix}/pieces/${fabric.colors[1].pieces[0]._id}`, `${prefix}/pieces/${foreign.colors[0].pieces[0]._id}`,
  ]) {
    const response = await deleteRequest(fabric, suffix);
    assert.equal(response.status, 404, suffix);
    assert.deepEqual(await response.json(), { message: "notFound" });
  }
  assert.equal(JSON.stringify(f.records), before);
  assert.equal(f.save.mock.callCount(), 0);
  assert.equal(f.deleteOne.mock.callCount(), 0);
});

test("delete permission is independent of add and update and cannot be granted through JWT claims", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  f.staff.action.delete = false;
  assert.deepEqual((await (await request("GET", undefined, employeeClaims)).json()).permissions, { add: true, update: true, delete: false });
  for (const suffix of deletePaths(fabric)) assert.equal((await deleteRequest(fabric, suffix, { ...employeeClaims, action: { delete: true } })).status, 403);
  f.staff.action = { add: false, update: false, delete: true };
  assert.deepEqual((await (await request("GET", undefined, employeeClaims)).json()).permissions, { add: false, update: false, delete: true });
  assert.equal((await deleteRequest(fabric, deletePaths(fabric)[2], employeeClaims)).status, 200);
  assert.equal(f.records[0].colors[0].pieces[0].barcode, second);
  assert.equal(f.save.mock.callCount(), 1);
});

test("unauthenticated, inactive and unsupported accounts cannot delete at any level", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  for (const suffix of deletePaths(fabric)) assert.equal((await deleteRequest(fabric, suffix, null)).status, 401);
  assert.equal(f.readActor.mock.callCount(), 0);
  f.staff.isActive = false;
  for (const suffix of deletePaths(fabric)) {
    assert.equal((await deleteRequest(fabric, suffix, employeeClaims)).status, 403);
    assert.equal((await deleteRequest(fabric, suffix, { id: owner, role: "visitor" })).status, 403);
  }
  f.actors.delete(owner);
  assert.equal((await deleteRequest(fabric, deletePaths(fabric)[0])).status, 403);
  assert.equal(f.findOne.mock.callCount(), 0);
  assert.equal(f.deleteOne.mock.callCount(), 0);
});

test("a missing, malformed or stale version cannot delete stock at any level", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  for (const suffix of deletePaths(fabric)) {
    for (const body of [{}, { version: "0" }, { version: null }, { version: -1 }, { version: 0.5 }, { version: 1 }]) {
      const response = await deleteRequest(fabric, suffix, claims, body);
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { message: "conflict" });
    }
  }
  const response = await request("PUT", { ...updatePayload(fabric), type: "Updated" }, claims, `/${fabric._id}`);
  assert.equal(response.status, 200);
  for (const suffix of deletePaths(fabric)) assert.equal((await deleteRequest(fabric, suffix)).status, 409);
  assert.equal(f.records[0].type, "Updated");
  assert.equal(f.deleteOne.mock.callCount(), 0);
  assert.equal(f.save.mock.callCount(), 1);
});

test("a concurrent write prevents both full-fabric and last-piece deletion", async (t) => {
  const f = setup(t);
  const fabric = f.seed(owner, { type: "Satin", colors: [{ name: "Blanc", pieces: [{ meters: 7, barcode: first }] }] });
  f.deleteOne.mock.mockImplementation(async (scope) => {
    assert.equal(scope.idAdmin, owner);
    assert.equal(String(scope._id), String(fabric._id));
    assert.equal(scope.__v, 0);
    return { deletedCount: 0 };
  });
  for (const suffix of deletePaths(fabric)) {
    const response = await deleteRequest(fabric, suffix);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { message: "conflict" });
  }
  assert.deepEqual(fabricTotals(f.records[0].colors), { quantity: 1, meters: 7 });
  assert.equal(f.save.mock.callCount(), 0);
});

test("concurrent embedded deletion conflicts keep siblings intact", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const before = JSON.stringify(f.records);
  f.save.mock.mockImplementation(async () => { throw Object.assign(new Error("Concurrent details"), { name: "VersionError" }); });
  for (const suffix of deletePaths(fabric).slice(1)) {
    const response = await deleteRequest(fabric, suffix);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { message: "conflict" });
  }
  assert.equal(JSON.stringify(f.records), before);
});

test("database deletion failures return deleteFailed without exposing details or changing shown stock", async (t) => {
  const f = setup(t);
  const fabric = f.seed();
  const before = JSON.stringify(f.records);
  f.save.mock.mockImplementation(async () => { throw new Error("Private database details"); });
  f.deleteOne.mock.mockImplementation(async () => { throw new Error("Private database details"); });
  for (const suffix of deletePaths(fabric)) {
    const response = await deleteRequest(fabric, suffix);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: "deleteFailed" });
  }
  assert.equal(JSON.stringify(f.records), before);
});

test("update permission cannot bypass delete permission through the edit form", async (t) => {
  const f = setup(t);
  const original = f.seed();
  f.staff.action.delete = false;
  const edit = updatePayload(original);
  edit.type = "Satin";
  edit.colors[0].pieces[0].meters = 36;
  edit.colors[0].pieces.push({ meters: 5, barcode: generateFabricBarcode(new Set([first, second, third])) });
  assert.equal((await request("PUT", edit, employeeClaims, `/${original._id}`)).status, 200);
  const current = f.records[0];
  const before = JSON.stringify(f.records);
  for (const mutate of [
    (payload) => { payload.colors.pop(); },
    (payload) => { payload.colors[0].pieces.shift(); },
  ]) {
    const payload = updatePayload(current);
    mutate(payload);
    const response = await request("PUT", payload, employeeClaims, `/${current._id}`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: "forbidden" });
    assert.equal(JSON.stringify(f.records), before);
  }
  assert.equal(f.save.mock.callCount(), 1);
});


test("a type's sale price persists once and is shared by every color and barcode result", async (t) => {
  setup(t);
  const response = await request("POST", {
    ...input, salePricePerMeter: "٢٥٫٥٠",
    colors: input.colors.map((color) => ({ ...color, salePricePerMeter: 999, pieces: color.pieces.map((piece) => ({ ...piece, salePricePerMeter: 777 })) })),
  });
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.salePricePerMeter, 25.5);
  assert.deepEqual(fabricTotals(saved.colors), { quantity: 3, meters: 94.375 });
  const { fabrics } = await (await request()).json();
  assert.equal(fabrics[0].salePricePerMeter, 25.5);
  for (const color of fabrics[0].colors) {
    assert.equal(Object.hasOwn(color, "salePricePerMeter"), false);
    for (const piece of color.pieces) {
      assert.equal(Object.hasOwn(piece, "salePricePerMeter"), false);
      const [match] = findFabricPieces(fabrics, piece.barcode);
      assert.equal(match.fabric.salePricePerMeter, 25.5);
      assert.equal(match.piece.barcode, piece.barcode);
    }
  }
});

test("editing a type price preserves its stock and old clients cannot erase it by omission", async (t) => {
  const f = setup(t);
  const original = f.seed(owner, { ...input, salePricePerMeter: 25.5 });
  const stock = JSON.parse(JSON.stringify(original.colors));
  let response = await request("PUT", { ...updatePayload(original), salePricePerMeter: "40,75" }, claims, "/" + original._id);
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.salePricePerMeter, 40.75);
  assert.deepEqual(updated.colors, stock);
  const oldClient = updatePayload(f.records[0]);
  delete oldClient.salePricePerMeter;
  response = await request("PUT", oldClient, claims, "/" + original._id);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).salePricePerMeter, 40.75);
  assert.equal((await (await request()).json()).fabrics[0].salePricePerMeter, 40.75);
});

test("legacy unpriced stock remains usable without a fabricated zero price", async (t) => {
  const f = setup(t);
  const original = f.seed();
  await original.validate();
  assert.equal(Object.hasOwn(original.toObject(), "salePricePerMeter"), false);
  const response = await request("PUT", updatePayload(original), claims, "/" + original._id);
  assert.equal(response.status, 200);
  assert.equal(Object.hasOwn(await response.json(), "salePricePerMeter"), false);
  assert.throws(() => validateFabric(input, { requirePrice: true }), (error) => error.fields.salePricePerMeter === "required");
  for (const price of [0.01, "25,50", "۲۵٫۵۰", FABRIC_LIMITS.pricePerMeter]) {
    assert.ok(validateFabric({ ...input, salePricePerMeter: price }, { requirePrice: true }).salePricePerMeter > 0);
  }
});

test("invalid type prices fail before persistence and never change stock or the saved price", async (t) => {
  const f = setup(t);
  const original = f.seed(owner, { ...input, salePricePerMeter: 25.5 });
  const before = JSON.stringify(f.records);
  for (const price of ["", " ", null, true, [], {}, "-1", 0, -1, "0.001", 12.345, "1e2", "20 DH", "1,2,3", FABRIC_LIMITS.pricePerMeter + 0.01]) {
    const payload = { ...updatePayload(original), salePricePerMeter: price };
    assert.throws(() => validateFabric(payload), (error) => error.fields.salePricePerMeter === "invalidPrice", String(price));
    for (const method of ["POST", "PUT"]) {
      const response = await request(method, payload, claims, method === "PUT" ? "/" + original._id : "");
      assert.equal(response.status, 400, method + ": " + JSON.stringify(price));
      assert.equal((await response.json()).fields.salePricePerMeter, "invalidPrice");
    }
    assert.equal(JSON.stringify(f.records), before);
  }
  assert.equal(f.create.mock.callCount(), 0);
  assert.equal(f.save.mock.callCount(), 0);
});
