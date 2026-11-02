import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, unlink, rmdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import Fabric from "../BackEnd/models/Fabric.js";
import { generateFabricBarcode, validateFabric } from "../shared/fabrics.js";

const originalSecret = process.env.JWT_SECRET, originalDirectory = process.env.FABRIC_PHOTOS_DIRECTORY;
const directory = await mkdtemp(fileURLToPath(new URL("./qa-fabric-photos-", import.meta.url)));
process.env.FABRIC_PHOTOS_DIRECTORY = directory;
process.env.JWT_SECRET = "isolated-fabric-photos-tests";
const { default: app } = await import("../BackEnd/app.js");
const { fabricPhotoPath } = await import("../BackEnd/utils/fabricPhotos.js");
const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
const claims = { id: owner, role: "admin" }, employeeClaims = { id: employee, idAdmin: otherOwner, role: "Employe" };
const input = { type: "قطن", reference: "T001", salePricePerMeter: 25.5, colors: [{ name: "أزرق", pieces: [{ meters: 35, barcode: generateFabricBarcode() }, { meters: 47, barcode: generateFabricBarcode() }] }] };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let server, base;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = "http://127.0.0.1:" + server.address().port + "/fabrics";
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  for (const filename of await readdir(directory)) await unlink(directory + "/" + filename);
  await rmdir(directory);
  if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
  if (originalDirectory === undefined) delete process.env.FABRIC_PHOTOS_DIRECTORY; else process.env.FABRIC_PHOTOS_DIRECTORY = originalDirectory;
});
function form(data = input, bytes = png, type = "image/png", name = "fabric.png") {
  const body = new FormData(); body.append("data", JSON.stringify(data));
  if (bytes) body.append("image", new Blob([bytes], { type }), name);
  return body;
}
const request = (method = "GET", body, auth = claims, suffix = "") => fetch(base + suffix, {
  method, headers: { ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(auth ? { Authorization: "Bearer " + jwt.sign(auth, process.env.JWT_SECRET) } : {}) },
  ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
});
const payload = fabric => ({ ...JSON.parse(JSON.stringify(fabric)), version: fabric.__v });
async function added() { const response = await request("POST", form()); assert.equal(response.status, 201); return response.json(); }
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


test("a type photo persists, stays private, and leaves every piece and barcode unchanged", async t => {
  const f = setup(t);
  const saved = await added();
  assert.equal(saved.hasPhoto, true);
  assert.equal(Object.hasOwn(saved, "photo"), false);
  assert.equal(saved.salePricePerMeter, 25.5);
  assert.deepEqual(saved.colors[0].pieces.map(({ meters, barcode }) => ({ meters, barcode })), input.colors[0].pieces);
  assert.equal(saved.colors.some(color => Object.hasOwn(color, "photo")), false);
  const stored = f.records[0].photo;
  assert.match(stored, /^[a-f\d-]+\.png$/);
  assert.deepEqual(await readFile(fabricPhotoPath(stored)), png);
  const list = await (await request()).json();
  assert.deepEqual(list.fabrics, [saved]);
  const photo = await request("GET", undefined, claims, "/" + saved._id + "/photo");
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/png");
  assert.equal(photo.headers.get("cache-control"), "private, no-store");
  assert.equal(photo.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);
});

test("legacy JSON edits preserve a saved photo, while legacy stock can remain without a photo", async t => {
  const f = setup(t);
  const saved = await added(), filename = f.records[0].photo;
  const response = await request("PUT", { ...payload(saved), type: "كتان", photo: "../../other.png", hasPhoto: false }, claims, "/" + saved._id);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).hasPhoto, true);
  assert.equal(f.records[0].photo, filename);
  assert.deepEqual(await readFile(fabricPhotoPath(filename)), png);
  const legacy = f.seed(otherOwner);
  assert.equal((await (await request("GET", undefined, { id: otherOwner, role: "admin" })).json()).fabrics[0].hasPhoto, false);
  assert.equal((await request("GET", undefined, { id: otherOwner, role: "admin" }, "/" + legacy._id + "/photo")).status, 404);
});

test("replacing and removing a photo clean up only the previous file after a successful save", async t => {
  const f = setup(t);
  let saved = await added();
  const first = f.records[0].photo, stock = JSON.stringify(saved.colors);
  let response = await request("PUT", form(payload(saved)), claims, "/" + saved._id);
  assert.equal(response.status, 200); saved = await response.json();
  const second = f.records[0].photo;
  assert.notEqual(second, first);
  await assert.rejects(readFile(fabricPhotoPath(first)), { code: "ENOENT" });
  assert.deepEqual(await readFile(fabricPhotoPath(second)), png);
  assert.equal(JSON.stringify(saved.colors), stock);
  response = await request("PUT", { ...payload(saved), removePhoto: true }, claims, "/" + saved._id);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).hasPhoto, false);
  assert.equal(f.records[0].photo, "");
  await assert.rejects(readFile(fabricPhotoPath(second)), { code: "ENOENT" });
  assert.equal((await request("GET", undefined, claims, "/" + saved._id + "/photo")).status, 404);
});

test("failed and concurrent saves preserve the previous photo and remove the new candidate", async t => {
  const f = setup(t);
  const saved = await added(), filename = f.records[0].photo, before = await readdir(directory);
  for (const error of [Object.assign(new Error("Race"), { name: "VersionError" }), new Error("Database unavailable")]) {
    f.save.mock.mockImplementation(async () => { throw error; });
    const response = await request("PUT", form(payload(saved)), claims, "/" + saved._id);
    assert.equal(response.status, error.name === "VersionError" ? 409 : 500);
    assert.equal(f.records[0].photo, filename);
    assert.deepEqual(await readFile(fabricPhotoPath(filename)), png);
    assert.deepEqual(await readdir(directory), before);
  }
  f.create.mock.mockImplementation(async () => { throw new Error("Create unavailable"); });
  const otherInput = { ...input, colors: [{ name: "أبيض", pieces: [{ meters: 2, barcode: generateFabricBarcode() }] }] };
  assert.equal((await request("POST", form(otherInput))).status, 500);
  assert.deepEqual(await readdir(directory), before);
});

test("stale forms, invalid stock and duplicate barcodes never create stray files", async t => {
  const f = setup(t);
  const saved = await added(), before = await readdir(directory), record = JSON.stringify(f.records);
  for (const [data, expected] of [[{ ...payload(saved), version: 99 }, 409], [{ ...payload(saved), type: "" }, 400]]) {
    assert.equal((await request("PUT", form(data), claims, "/" + saved._id)).status, expected);
    assert.deepEqual(await readdir(directory), before);
    assert.equal(JSON.stringify(f.records), record);
  }
  assert.equal((await request("POST", form())).status, 409);
  assert.deepEqual(await readdir(directory), before);
});

test("photo reads and writes enforce current shop ownership and employee permissions", async t => {
  const f = setup(t);
  const saved = await added(), url = "/" + saved._id + "/photo", before = await readdir(directory);
  assert.equal((await request("GET", undefined, null, url)).status, 401);
  assert.equal((await request("GET", undefined, { id: otherOwner, role: "admin" }, url)).status, 404);
  assert.equal((await request("GET", undefined, employeeClaims, url)).status, 200);
  f.staff.action.update = false;
  assert.equal((await request("PUT", form(payload(saved)), employeeClaims, "/" + saved._id)).status, 403);
  f.staff.action.add = false;
  // Access is checked before trying to interpret an unsupported image.
  assert.equal((await request("POST", form(input, Buffer.from("<svg/>"), "image/svg+xml"), employeeClaims)).status, 403);
  f.staff.isActive = false;
  assert.equal((await request("GET", undefined, employeeClaims, url)).status, 403);
  assert.equal((await request("PUT", form(payload(saved)), { id: otherOwner, role: "admin" }, "/" + saved._id)).status, 404);
  assert.deepEqual(await readdir(directory), before);
  assert.equal(f.save.mock.callCount(), 0);
});

test("unsupported, spoofed, excessive and malformed uploads fail without saving stock or files", async t => {
  const f = setup(t), before = await readdir(directory);
  const extra = form(); extra.append("image", new Blob([png], { type: "image/png" }), "second.png");
  const broken = new FormData(); broken.append("data", "{"); broken.append("image", new Blob([png], { type: "image/png" }), "fabric.png");
  for (const [body, expected] of [
    [form(input, Buffer.from("<svg/>"), "image/svg+xml"), 400],
    [form(input, Buffer.from("spoofed PNG")), 400],
    [form(input, Buffer.alloc(5 * 1024 * 1024 + 1)), 413],
    [form({ ...input, removePhoto: "true" }), 400],
    [extra, 400], [broken, 400],
  ]) {
    assert.equal((await request("POST", body)).status, expected);
    assert.deepEqual(await readdir(directory), before);
  }
  assert.equal(f.records.length, 0);
  assert.equal(f.create.mock.callCount(), 0);
  assert.equal(fabricPhotoPath("../../private.png"), null);
  assert.equal(fabricPhotoPath("fabric.svg"), null);
});

test("deleting a type or its last piece removes the photo; partial deletions preserve it", async t => {
  const f = setup(t);
  let saved = await added();
  const filename = f.records[0].photo;
  let suffix = "/" + saved._id + "/colors/" + saved.colors[0]._id + "/pieces/" + saved.colors[0].pieces[0]._id;
  let response = await request("DELETE", { version: saved.__v }, claims, suffix);
  assert.equal(response.status, 200); saved = (await response.json()).fabric;
  assert.equal(saved.hasPhoto, true);
  assert.deepEqual(await readFile(fabricPhotoPath(filename)), png);
  suffix = "/" + saved._id + "/colors/" + saved.colors[0]._id + "/pieces/" + saved.colors[0].pieces[0]._id;
  response = await request("DELETE", { version: saved.__v }, claims, suffix);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).fabric, null);
  await assert.rejects(readFile(fabricPhotoPath(filename)), { code: "ENOENT" });
  saved = await added();
  const next = f.records[0].photo;
  assert.equal((await request("DELETE", { version: saved.__v }, claims, "/" + saved._id)).status, 200);
  await assert.rejects(readFile(fabricPhotoPath(next)), { code: "ENOENT" });
});

test("a maximum-sized fabric can upload its photo without truncating colors or piece identities", async t => {
  setup(t);
  const used = new Set();
  const colors = Array.from({ length: 100 }, (_, i) => ({ name: "نوع ".repeat(20) + i, number: "مرجع ".repeat(15) + i, pieces: Array.from({ length: 5 }, () => { const barcode = generateFabricBarcode(used); used.add(barcode); return { meters: 35, barcode }; }) }));
  const response = await request("POST", form({ ...input, colors }));
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.hasPhoto, true);
  assert.equal(saved.colors.length, 100);
  assert.equal(saved.colors.flatMap(color => color.pieces).length, 500);
  assert.equal((await request("PUT", form(payload(saved)), claims, "/" + saved._id)).status, 200);
});
