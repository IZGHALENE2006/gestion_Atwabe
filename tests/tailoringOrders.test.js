import { moduleOperationPermissions } from "../shared/employeePermissions.js";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import Fabric from "../BackEnd/models/Fabric.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import { filterTailoringOrders, validateTailoringOrder, validTailoringDate, tailoringMoneyCents, tailoringRemainingAmount, tailoringGarmentType, tailoringProfitAmount } from "../shared/tailoring.js";
import { generateFabricBarcode } from "../shared/fabrics.js";
import { normalizeTailoringBarcode, tailoringOrderBarcode } from "../shared/tailoringBarcode.js";

const previousDirectory = process.env.TAILORING_PHOTOS_DIRECTORY;
const photos = await mkdtemp(path.join(tmpdir(), "tailoring-photos-test-"));
process.env.TAILORING_PHOTOS_DIRECTORY = photos;
const { default: app } = await import("../BackEnd/app.js");
const { tailoringPhotoPath } = await import("../BackEnd/utils/tailoringPhotos.js");
const previousSecret = process.env.JWT_SECRET;
const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
const admin = { id: owner, role: "admin" }, stranger = { id: otherOwner, role: "admin" };
const staffClaims = { id: employee, role: "Employe", idAdmin: otherOwner, action: { add: true, update: true } };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=", "base64");
let server, base;
before(async () => {
  process.env.JWT_SECRET = "tailoring-tests";
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/tailoring-orders`;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  if (previousDirectory === undefined) delete process.env.TAILORING_PHOTOS_DIRECTORY; else process.env.TAILORING_PHOTOS_DIRECTORY = previousDirectory;
});
const input = (patch = {}) => ({ clientName: "أمينة", phone: "+212 612 345 678", orderDate: "2026-10-07", readyDate: "2026-10-20", totalPrice: 500, paidAmount: 200, fabricSource: "client", fabricType: "ساتان", fabricColor: "أزرق", sfifa: { width: "thin", style: "fabric" }, requestId: randomUUID(), ...patch });
const query = (fn) => ({ select() { return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } });
function setup(t) {
  const records = [], fabrics = [];
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: false } };
  t.mock.method(AdminModel, "findById", id => query(() => [owner, otherOwner].includes(String(id)) ? { _id: id } : null));
  t.mock.method(EmployeModel, "findById", id => query(() => String(id) === employee ? staff : null));
  t.mock.method(TailoringOrder, "find", scope => query(() => records.filter(row => String(row.idAdmin) === String(scope.idAdmin)).map(row => row.toObject()).sort((a, b) => b.orderDate.localeCompare(a.orderDate))));
  t.mock.method(TailoringOrder, "findOne", async scope => {
    const row = records.find(item => String(item.idAdmin) === String(scope.idAdmin) && (!scope._id || String(item._id) === String(scope._id).toLowerCase()) && (!scope.requestId || item.requestId === scope.requestId));
    return row ? new TailoringOrder(row.toObject()) : null;
  });
  const create = t.mock.method(TailoringOrder, "create", async value => {
    if (records.some(row => String(row.idAdmin) === String(value.idAdmin) && row.requestId === value.requestId)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const document = new TailoringOrder({ ...value, __v: 0, createdAt: new Date(), updatedAt: new Date() });
    await document.validate(); records.push(document); return document;
  });
  const save = t.mock.method(TailoringOrder.prototype, "save", async function () {
    const index = records.findIndex(row => String(row._id) === String(this._id));
    await this.validate();
    if (index < 0 || records[index].__v !== this.__v) throw Object.assign(new Error("Concurrent write"), { name: "VersionError" });
    this.__v += 1; this.updatedAt = new Date(); records[index] = new TailoringOrder(this.toObject()); return this;
  });
  t.mock.method(Fabric, "findOne", async scope => fabrics.find(row => String(row._id) === String(scope._id).toLowerCase() && String(row.idAdmin) === String(scope.idAdmin)) || null);
  const seedFabric = (idAdmin = owner) => {
    const document = new Fabric({ idAdmin, createdBy: idAdmin, type: "Coton", reference: "T-100", __v: 0, colors: [{ name: "Bleu", number: "007", pieces: [{ meters: 35, barcode: generateFabricBarcode() }] }] });
    fabrics.push(document); return document;
  };
  return { records, fabrics, staff, create, save, seedFabric };
}
async function request({ body, suffix = "", method = body === undefined ? "GET" : "POST", actor = admin, file, extraFile, multipart = Boolean(file) } = {}) {
  const headers = actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {};
  let payload;
  if (body !== undefined) {
    if (multipart) {
      payload = new FormData();
      for (const [key, value] of Object.entries(body)) payload.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      if (file) payload.append("image", new Blob([file.bytes || png], { type: file.type || "image/png" }), file.name || "fabric.png");
      if (extraFile) payload.append("image", new Blob([png], { type: "image/png" }), "second.png");
    } else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  }
  return fetch(base + suffix, { method, headers, ...(payload ? { body: payload } : {}) });
}
const createOrder = async (body = input(), options = {}) => { const response = await request({ body, ...options }); assert.equal(response.status, 201); return response.json(); };

test("order barcodes are unique full-ID CODE128 values and barcode search returns only the matching order", () => {
  const first = { ...input(), _id: "0123456789abcdef01234567" }, second = { ...input(), _id: "0123456789abcdef01234568" };
  const barcode = tailoringOrderBarcode(first);
  assert.equal(barcode, "FS-0123456789ABCDEF01234567");
  assert.equal(tailoringOrderBarcode(first._id.toUpperCase()), barcode);
  assert.notEqual(tailoringOrderBarcode(second), barcode);
  for (const value of [undefined, null, "", "bad", "0123456789abcdef0123456", "0123456789abcdef012345678", {}]) assert.equal(tailoringOrderBarcode(value), "");
  assert.equal(normalizeTailoringBarcode(` ${barcode.toLowerCase()}\r\n`), barcode);
  for (const value of [null, 123, "", "FS-0123", `${barcode}0`, barcode.slice(0, -1)]) assert.equal(normalizeTailoringBarcode(value), "");
  second.clientName = barcode;
  assert.deepEqual(filterTailoringOrders([first, second], barcode), [first]);
  assert.deepEqual(filterTailoringOrders([first, second], ` ${barcode.toLowerCase()}\r\n`, { barcodeOnly: true }), [first]);
  assert.deepEqual(filterTailoringOrders([first, second], "FS-FFFFFFFFFFFFFFFFFFFFFFFF", { barcodeOnly: true }), []);
  assert.deepEqual(filterTailoringOrders([first, second], "FS-0123", { barcodeOnly: true }), []);
  assert.deepEqual(filterTailoringOrders([first, second], first.phone, { barcodeOnly: true }), []);
  assert.deepEqual(filterTailoringOrders([first, second], "", { barcodeOnly: true }), [first, second]);
});

test("old orders expose stable barcodes to read-only employees without rewriting any record", async t => {
  const f = setup(t), legacy = new TailoringOrder({ ...validateTailoringOrder(input()), fabricId: null, colorId: null, idAdmin: owner, createdBy: owner, requestId: randomUUID(), requestFingerprint: "legacy", __v: 3 });
  await legacy.validate(); f.records.push(legacy); f.staff.action = { add: false, update: false };
  const before = legacy.toObject(), response = await request({ actor: staffClaims }); assert.equal(response.status, 200);
  const list = await response.json(); assert.equal(list.orders[0].barcode, tailoringOrderBarcode(legacy)); assert.deepEqual(list.permissions, moduleOperationPermissions('Employe', { action: { add: false, update: false } }, 'tailoring'));
  const again = await (await request()).json(); assert.equal(again.orders[0].barcode, list.orders[0].barcode);
  assert.equal(f.save.mock.callCount(), 0); assert.deepEqual(legacy.toObject(), before);
});

test("creation, retries and edits keep the same barcode and ignore caller-supplied barcode fields", async t => {
  const f = setup(t), body = input({ barcode: "FS-000000000000000000000000" });
  const created = await createOrder(body), barcode = created.barcode;
  assert.equal(barcode, tailoringOrderBarcode(created)); assert.notEqual(barcode, body.barcode);
  const repeated = await request({ body: { ...body, barcode: "FORGED" } }); assert.equal(repeated.status, 200); assert.equal((await repeated.json()).barcode, barcode); assert.equal(f.records.length, 1);
  const changed = await request({ suffix: `/${created._id}`, method: "PUT", body: { ...body, version: created.__v, clientName: "زبون آخر", paidAmount: 300, barcode: "FORGED" } });
  assert.equal(changed.status, 200); const updated = await changed.json(); assert.equal(updated.barcode, barcode); assert.equal(updated.remainingAmount, 200);
  const listed = await (await request()).json(); assert.equal(listed.orders[0].barcode, barcode);
  const other = await createOrder(input()); assert.notEqual(other.barcode, barcode);
  assert.equal(f.records[0].toObject().barcode, undefined);
});

test("money accepts zero and decimal commas and calculates the balance in centimes", () => {
  for (const [value, expected] of [[0, 0], ["0", 0], [" 500,25 ", 50025], ["0.30", 30], [999999999.99, 99999999999]]) assert.equal(tailoringMoneyCents(value), expected);
  const value = validateTailoringOrder(input({ totalPrice: "500,25", paidAmount: "200,10" }));
  assert.equal(value.totalPrice, 500.25); assert.equal(value.paidAmount, 200.1);
  assert.equal(tailoringRemainingAmount(0.3, 0.1), 0.2);
  assert.equal(tailoringRemainingAmount(500.25, 200.1), 300.15);
  assert.equal(tailoringRemainingAmount(500, 500), 0);
  assert.equal(validateTailoringOrder(input({ totalPrice: 0, paidAmount: 0 })).paidAmount, 0);
});

test("price and paid amounts reject negatives, excess precision, malformed values and overpayment", () => {
  for (const field of ["totalPrice", "paidAmount"]) {
    for (const value of [undefined, null, "", " ", -1, "-0.01", 1.001, "1,001", NaN, Infinity, {}, [], true, "1e2", "0x10", 1000000000]) {
      assert.throws(() => validateTailoringOrder(input({ [field]: value })), error => Boolean(error.fields[field]), `${field}: ${String(value)}`);
    }
  }
  assert.throws(() => validateTailoringOrder(input({ totalPrice: 0.3, paidAmount: 0.31 })), error => error.fields.paidAmount === "paidExceedsPrice");
  assert.equal(tailoringRemainingAmount(20, 21), null);
});

test("order creation and payment edits persist money and expose only the calculated balance", async t => {
  const f = setup(t), body = input({ totalPrice: "500,25", paidAmount: "200,10", remainingAmount: 9999 });
  const original = await createOrder(body, { multipart: true });
  assert.deepEqual([original.totalPrice, original.paidAmount, original.remainingAmount], [500.25, 200.1, 300.15]);
  assert.deepEqual([f.records[0].totalPrice, f.records[0].paidAmount], [500.25, 200.1]);
  assert.equal(f.records[0].toObject().remainingAmount, undefined);
  const update = await request({ suffix: `/${original._id}`, method: "PUT", multipart: true, body: { ...body, version: 0, paidAmount: "350,25" } });
  assert.equal(update.status, 200); const changed = await update.json();
  assert.deepEqual([changed.totalPrice, changed.paidAmount, changed.remainingAmount], [500.25, 350.25, 150]);
  const listed = await (await request()).json(); assert.equal(listed.orders[0].remainingAmount, 150);
  const fullyPaid = await request({ suffix: `/${original._id}`, method: "PUT", body: { ...body, version: 1, paidAmount: 500.25 } });
  assert.equal(fullyPaid.status, 200); assert.equal((await fullyPaid.json()).remainingAmount, 0);
});

test("zero payments survive multipart submission, including a photographed free order", async t => {
  const f = setup(t);
  const unpaid = await createOrder(input({ paidAmount: 0 }), { multipart: true });
  assert.equal(unpaid.paidAmount, 0); assert.equal(unpaid.remainingAmount, 500);
  const free = await createOrder(input({ totalPrice: 0, paidAmount: 0 }), { file: {} });
  assert.equal(free.totalPrice, 0); assert.equal(free.paidAmount, 0); assert.equal(free.remainingAmount, 0); assert.equal(free.hasPhoto, true);
  assert.equal(f.records.length, 2);
});

test("invalid payments fail without changing an order or creating uploaded photos", async t => {
  const f = setup(t), original = await createOrder(), before = (await readdir(photos)).sort();
  const create = await request({ body: input({ paidAmount: 501 }), file: {} });
  assert.equal(create.status, 400); assert.equal((await create.json()).fields.paidAmount, "paidExceedsPrice");
  for (const change of [{ totalPrice: -1 }, { paidAmount: -1 }, { totalPrice: "500.001" }, { totalPrice: 100 }, { paidAmount: 501 }]) {
    const edit = await request({ suffix: `/${original._id}`, method: "PUT", body: { ...input(), version: 0, ...change }, file: {} });
    assert.equal(edit.status, 400);
  }
  assert.equal(f.records.length, 1); assert.equal(f.records[0].__v, 0); assert.equal(f.records[0].paidAmount, 200);
  assert.deepEqual((await readdir(photos)).sort(), before);
});

test("money is part of retry identity while equivalent decimal spellings reuse the order", async t => {
  const f = setup(t), body = input({ totalPrice: "500,20", paidAmount: "200,00" });
  const original = await createOrder(body);
  const retry = await request({ body: { ...body, totalPrice: 500.2, paidAmount: 200 } });
  assert.equal(retry.status, 200); assert.equal((await retry.json())._id, original._id);
  for (const change of [{ totalPrice: 600 }, { paidAmount: 250 }]) assert.equal((await request({ body: { ...body, ...change } })).status, 409);
  assert.equal(f.records.length, 1); assert.equal(f.records[0].paidAmount, 200);
});

test("legacy orders with no money fields list safely and can receive a price and payment", async t => {
  const f = setup(t), original = await createOrder();
  f.records[0].set("totalPrice", undefined); f.records[0].set("paidAmount", undefined);
  const listed = await (await request()).json();
  assert.deepEqual([listed.orders[0].totalPrice, listed.orders[0].paidAmount, listed.orders[0].remainingAmount], [0, 0, 0]);
  const edit = await request({ suffix: `/${original._id}`, method: "PUT", body: { ...input(), version: 0, totalPrice: 300, paidAmount: 100 } });
  assert.equal(edit.status, 200); assert.equal((await edit.json()).remainingAmount, 200);
  const invalid = new TailoringOrder({ ...f.records[0].toObject(), totalPrice: 10, paidAmount: 11 });
  await assert.rejects(invalid.validate(), error => Boolean(error.errors.paidAmount));
});

test("dates validate real calendar days and enforce preparation after the order", () => {
  assert.equal(validTailoringDate("2024-02-29"), true);
  for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-10-07T00:00:00Z", "07/10/2026", "1899-01-01"]) assert.equal(validTailoringDate(date), false);
  assert.throws(() => validateTailoringOrder(input({ readyDate: "2026-10-06" })), error => error.fields.readyDate === "readyBeforeOrder");
  assert.equal(validateTailoringOrder(input({ readyDate: "2026-10-07" })).readyDate, "2026-10-07");
});
test("sfifa supports three color styles and keeps gradient color validation", () => {
  for (const width of ["thin", "thick"]) for (const style of ["fabric", "twoTone", "gradient"]) {
    const value = validateTailoringOrder(input({ sfifa: { width, style, color1: "ذهبي", color2: "أبيض" } }));
    assert.equal(value.sfifa.width, width); assert.equal(value.sfifa.style, style);
    assert.equal(value.sfifa.color1, style === "fabric" ? "" : "ذهبي");
  }
  for (const sfifa of [[{ width: "thin" }, { width: "thick" }], { width: ["thin", "thick"], style: "fabric" }, { width: "thin", style: "gradient" }, "{bad", { width: "thick", style: "unknown" }]) assert.throws(() => validateTailoringOrder(input({ sfifa })), /invalidOrder/);
});
test("client fields reject missing values, invalid phones, control characters and excessive lengths", () => {
  for (const change of [{ clientName: "" }, { clientName: "x".repeat(161) }, { phone: "abc" }, { phone: "123" }, { fabricType: "" }, { fabricType: "x\ny" }, { sfifa: { width: "thin", style: "gradient", color1: "x", color2: "" } }, { fabricSource: "unknown" }]) assert.throws(() => validateTailoringOrder(input(change)), /invalidOrder/);
  assert.equal(validateTailoringOrder(input({ clientName: "  أمينة  " })).clientName, "أمينة");
});
test("client fabric orders persist client data, dates and a single sfifa using trusted ownership", async t => {
  const f = setup(t), body = input({ idAdmin: otherOwner, createdBy: employee, photo: "../../secret", clientName: "  أمينة  " });
  const dto = await createOrder(body);
  assert.equal(dto.clientName, "أمينة"); assert.equal(dto.idAdmin, owner); assert.equal(dto.createdBy, owner);
  assert.equal(dto.fabricSource, "client"); assert.equal(dto.fabricId, null); assert.equal(dto.hasPhoto, false);
  assert.equal(dto.photo, undefined); assert.equal(dto.requestId, undefined); assert.equal(dto.requestFingerprint, undefined);
  assert.equal(f.records.length, 1); assert.equal(f.records[0].sfifa.width, "thin");
});
test("shop fabric type and color are resolved from the owning shop without reducing stock", async t => {
  const f = setup(t), fabric = f.seedFabric(), before = JSON.stringify(fabric);
  const dto = await createOrder(input({ fabricSource: "shop", fabricId: String(fabric._id), colorId: String(fabric.colors[0]._id), fabricType: "forged", fabricColor: "forged" }));
  assert.deepEqual([dto.fabricType, dto.fabricReference, dto.fabricColor], ["Coton", "T-100", "Bleu"]);
  assert.equal(JSON.stringify(fabric), before);
  const other = f.seedFabric(otherOwner);
  const bad = await request({ body: input({ fabricSource: "shop", fabricId: String(other._id) }) }); assert.equal(bad.status, 404);
  const color = await request({ body: input({ fabricSource: "shop", fabricId: String(fabric._id), colorId: String(other.colors[0]._id) }) }); assert.equal(color.status, 404);
  assert.equal(f.records.length, 1);
});
test("shop orders retain their fabric snapshot and remain editable after stock deletion", async t => {
  const f = setup(t), fabric = f.seedFabric();
  const body = input({ fabricSource: "shop", fabricId: String(fabric._id), colorId: String(fabric.colors[0]._id) });
  const order = await createOrder(body); f.fabrics.length = 0;
  const response = await request({ suffix: `/${order._id}`, method: "PUT", body: { ...body, version: order.__v, readyDate: "2026-10-25", fabricType: "forged" } });
  assert.equal(response.status, 200); const updated = await response.json(); assert.equal(updated.fabricType, "Coton"); assert.equal(updated.readyDate, "2026-10-25");
});
test("listing and access respect shop scope, current employee permissions and active accounts", async t => {
  const f = setup(t); await createOrder(); await createOrder(input({ clientName: "Other" }), { actor: stranger });
  const data = await (await request()).json(); assert.equal(data.orders.length, 1); assert.equal(data.orders[0].clientName, "أمينة");
  const employeeData = await (await request({ actor: staffClaims })).json(); assert.deepEqual(employeeData.permissions, moduleOperationPermissions('Employe', { action: { add: true, update: false } }, 'tailoring'));
  const staffOrder = await createOrder(input({ clientName: "Staff" }), { actor: staffClaims }); assert.equal(staffOrder.idAdmin, owner); assert.equal(staffOrder.createdBy, employee);
  const forbidden = await request({ suffix: `/${staffOrder._id}`, method: "PUT", actor: staffClaims, body: { ...input(), version: 0 } }); assert.equal(forbidden.status, 403);
  f.staff.action.add = false; assert.equal((await request({ actor: staffClaims, body: input() })).status, 403);
  f.staff.isActive = false; assert.equal((await request({ actor: staffClaims })).status, 403);
  assert.equal((await request({ actor: { id: owner, role: "visitor" } })).status, 403);
});
test("uploads persist as private photos and return only through authenticated owner-scoped routes", async t => {
  setup(t); const order = await createOrder(input(), { file: {} }); assert.equal(order.hasPhoto, true);
  const response = await request({ suffix: `/${order._id}/photo` }); assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /image\/png/); assert.match(response.headers.get("cache-control"), /private/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal((await request({ suffix: `/${order._id}/photo`, actor: stranger })).status, 404);
  assert.equal((await request({ suffix: `/${order._id}/photo`, actor: null })).status, 401);
  assert.equal((await request({ body: input(), file: {}, actor: null })).status, 401);
});
test("invalid, spoofed, oversized or multiple photos are rejected before saving records or files", async t => {
  const f = setup(t), before = (await readdir(photos)).sort();
  for (const [file, status] of [[{ type: "image/svg+xml" }, 400], [{ type: "image/png", bytes: Buffer.from("fake image") }, 400], [{ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }, 413]]) {
    const response = await request({ body: input(), file }); assert.equal(response.status, status);
  }
  assert.equal((await request({ body: input(), file: {}, extraFile: true })).status, 400);
  assert.equal(f.records.length, 0); assert.deepEqual((await readdir(photos)).sort(), before);
});
test("failed order creation removes the uploaded file and returns a stable error", async t => {
  const f = setup(t), before = (await readdir(photos)).sort(); f.create.mock.mockImplementationOnce(async () => { throw new Error("database detail"); });
  const response = await request({ body: input(), file: {} }); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { message: "saveFailed" });
  assert.deepEqual((await readdir(photos)).sort(), before); assert.equal(f.records.length, 0);
});
test("retries and concurrent submissions with the same request ID create only one order and photo", async t => {
  const f = setup(t), body = input(); const first = await createOrder(body, { file: {} });
  const retry = await request({ body, file: {} }); assert.equal(retry.status, 200); assert.equal((await retry.json())._id, first._id); assert.equal(f.records.length, 1);
  const changed = await request({ body: { ...body, clientName: "Changed" }, file: {} }); assert.equal(changed.status, 409);
  const concurrentBody = input({ clientName: "Concurrent" });
  const responses = await Promise.all([request({ body: concurrentBody, file: {} }), request({ body: concurrentBody, file: {} })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]); assert.equal(f.records.length, 2);
  const results = await Promise.all(responses.map(response => response.json())); assert.equal(results[0]._id, results[1]._id);
});
test("edits preserve actor ownership, enforce versions and reject cross-shop identities", async t => {
  const f = setup(t), original = await createOrder();
  const body = input({ readyDate: "2026-10-22", sfifa: { width: "thick", style: "gradient", color1: "أزرق", color2: "أبيض" }, version: original.__v, idAdmin: otherOwner });
  const response = await request({ body, suffix: `/${original._id}`, method: "PUT" }); assert.equal(response.status, 200); const saved = await response.json();
  assert.equal(saved.__v, 1); assert.equal(saved.idAdmin, owner); assert.equal(saved.createdBy, owner); assert.equal(saved.sfifa.width, "thick");
  assert.equal((await request({ body, suffix: `/${original._id}`, method: "PUT" })).status, 409);
  assert.equal((await request({ body: { ...body, version: 1 }, suffix: `/${original._id}`, method: "PUT", actor: stranger })).status, 404);
  assert.equal(f.records.length, 1);
});
test("photo edits retain, replace and remove photos only after the order save succeeds", async t => {
  const f = setup(t), body = input(), original = await createOrder(body, { file: {} }), firstPhoto = f.records[0].photo;
  const retained = await request({ body: { ...body, version: 0 }, suffix: `/${original._id}`, method: "PUT", multipart: true }); assert.equal(retained.status, 200); assert.equal(f.records[0].photo, firstPhoto);
  const replace = await request({ body: { ...body, version: 1 }, suffix: `/${original._id}`, method: "PUT", file: {} }); assert.equal(replace.status, 200);
  const secondPhoto = f.records[0].photo; assert.notEqual(secondPhoto, firstPhoto); await assert.rejects(readFile(path.join(photos, firstPhoto)), { code: "ENOENT" });
  const removed = await request({ body: { ...body, version: 2, removeImage: true }, suffix: `/${original._id}`, method: "PUT", multipart: true }); assert.equal(removed.status, 200); assert.equal((await removed.json()).hasPhoto, false); await assert.rejects(readFile(path.join(photos, secondPhoto)), { code: "ENOENT" });
  assert.equal((await request({ suffix: `/${original._id}/photo` })).status, 404);
});
test("failed photo edits keep the original photo and reclaim only the new candidate", async t => {
  const f = setup(t), body = input(), original = await createOrder(body, { file: {} }), before = (await readdir(photos)).sort(), previous = f.records[0].photo;
  f.save.mock.mockImplementationOnce(async () => { throw new Error("failed save"); });
  const response = await request({ body: { ...body, version: 0 }, suffix: `/${original._id}`, method: "PUT", file: {} }); assert.equal(response.status, 500);
  assert.equal(f.records[0].photo, previous); assert.equal(f.records[0].__v, 0); assert.deepEqual((await readdir(photos)).sort(), before); assert.deepEqual(await readFile(path.join(photos, previous)), png);
});
test("malformed dates, fabric selections, request IDs and invalid routes return validation errors", async t => {
  setup(t);
  for (const body of [input({ readyDate: "2026-02-31" }), input({ requestId: "bad" }), input({ fabricSource: "shop", fabricId: "bad" }), input({ sfifa: "bad JSON" })]) assert.equal((await request({ body })).status, 400);
  assert.equal((await request({ suffix: "/invalid/photo" })).status, 404);
  assert.equal((await request({ actor: null })).status, 401);
});
test("photo paths cannot escape their directory and search finds phone digits and dates", () => {
  for (const filename of ["../secret.png", "/tmp/secret.jpg", "x.png", "00000000-0000-0000-0000-000000000000.svg"]) assert.equal(tailoringPhotoPath(filename), null);
  const order = input({ fabricReference: "T-1" });
  assert.equal(filterTailoringOrders([order], "0612345678").length, 0);
  assert.equal(filterTailoringOrders([order], "612345678").length, 1);
  assert.equal(filterTailoringOrders([order], "2026-10-20").length, 1);
  assert.equal(filterTailoringOrders([order], "أمينة").length, 1);
});

test("additional payments add exact centimes, persist receipts and can settle the remaining balance", async t => {
  const f = setup(t), original = await createOrder(input({ totalPrice: "0.60", paidAmount: "0.10" }));
  const first = await request({ suffix: `/${original._id}/payments`, body: { amount: "0,20", requestId: randomUUID(), version: 0, paidAmount: 0, paidAt: "1900-01-01" } });
  assert.equal(first.status, 200); const updated = await first.json();
  assert.deepEqual([updated.paidAmount, updated.remainingAmount], [0.3, 0.3]);
  assert.equal(updated.addedPayments.length, 1); assert.equal(updated.addedPayments[0].amount, 0.2);
  assert.ok(new Date(updated.addedPayments[0].paidAt).getFullYear() >= 2026);
  assert.equal(updated.paymentReceipts, undefined); assert.equal(updated.addedPayments[0].requestId, undefined);
  assert.equal(String(f.records[0].paymentReceipts[0].createdBy), owner);
  const finish = await request({ suffix: `/${original._id}/payments`, body: { amount: "0.30", requestId: randomUUID(), version: updated.__v } });
  assert.equal(finish.status, 200); const paid = await finish.json();
  assert.deepEqual([paid.paidAmount, paid.remainingAmount, paid.addedPayments.length], [0.6, 0, 2]);
  const listed = await (await request()).json(); assert.equal(listed.orders[0].paidAmount, 0.6); assert.equal(listed.orders[0].addedPayments.length, 2);
});

test("retries of a payment return the saved result and never charge it twice", async t => {
  const f = setup(t), original = await createOrder(), body = { amount: "300", requestId: randomUUID(), version: 0 };
  const first = await request({ suffix: `/${original._id}/payments`, body }); assert.equal(first.status, 200);
  const repeated = await request({ suffix: `/${original._id}/payments`, body }); assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).paidAmount, 500); assert.equal(f.records[0].paymentReceipts.length, 1); assert.equal(f.save.mock.callCount(), 1);
  const changed = await request({ suffix: `/${original._id}/payments`, body: { ...body, amount: 200 } });
  assert.equal(changed.status, 409); assert.equal((await changed.json()).message, "requestConflict"); assert.equal(f.records[0].paidAmount, 500);
});

test("invalid or excessive additional payments leave the amount and receipts unchanged", async t => {
  const f = setup(t), original = await createOrder();
  for (const amount of [undefined, null, "", " ", "0", 0, -1, "1.001", "1e2", {}, [], true, "300.01", "999999999.99"]) {
    const response = await request({ suffix: `/${original._id}/payments`, body: { amount, requestId: randomUUID(), version: 0 } });
    assert.equal(response.status, 400, String(amount));
  }
  for (const requestId of [undefined, "bad", {}, "11111111-1111-1111-1111-111111111111"]) {
    const response = await request({ suffix: `/${original._id}/payments`, body: { amount: 1, requestId, version: 0 } }); assert.equal(response.status, 400);
  }
  assert.equal(f.records[0].paidAmount, 200); assert.equal(f.records[0].paymentReceipts.length, 0); assert.equal(f.save.mock.callCount(), 0);
});

test("concurrent payments cannot overwrite money or bypass the remaining amount", async t => {
  const f = setup(t), original = await createOrder();
  const bodies = [0, 1].map(() => ({ amount: 200, requestId: randomUUID(), version: 0 }));
  const responses = await Promise.all(bodies.map(body => request({ suffix: `/${original._id}/payments`, body })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(f.records[0].paidAmount, 400); assert.equal(f.records[0].paymentReceipts.length, 1);
  const rejected = bodies[responses.findIndex(response => response.status === 409)];
  const retry = await request({ suffix: `/${original._id}/payments`, body: { ...rejected, version: 1 } });
  assert.equal(retry.status, 400); assert.equal((await retry.json()).message, "paymentExceedsRemaining"); assert.equal(f.records[0].paidAmount, 400);
});

test("delivery is dated once, survives reload and permits later payments while preserving the balance", async t => {
  const f = setup(t), body = input({ deliveredAt: "1900-01-01", deliveredBy: otherOwner, paymentReceipts: [{ amount: 100 }] }), original = await createOrder(body);
  assert.equal(original.deliveredAt, null); assert.deepEqual(original.addedPayments, []);
  const delivered = await request({ suffix: `/${original._id}/deliver`, body: { version: 0, deliveredAt: "1900-01-01", paidAmount: 500 } });
  assert.equal(delivered.status, 200); const completed = await delivered.json();
  assert.ok(new Date(completed.deliveredAt).getFullYear() >= 2026); assert.equal(completed.deliveredBy, undefined);
  assert.deepEqual([completed.paidAmount, completed.remainingAmount], [200, 300]); assert.equal(String(f.records[0].deliveredBy), owner);
  const repeated = await request({ suffix: `/${original._id}/deliver`, body: { version: 0 } }); assert.equal(repeated.status, 200); assert.equal((await repeated.json()).deliveredAt, completed.deliveredAt); assert.equal(f.save.mock.callCount(), 1);
  const payment = await request({ suffix: `/${original._id}/payments`, body: { amount: 100, requestId: randomUUID(), version: completed.__v } }); assert.equal(payment.status, 200);
  const paid = await payment.json(); assert.equal(paid.deliveredAt, completed.deliveredAt); assert.equal(paid.paidAmount, 300);
  const listed = await (await request()).json(); assert.equal(listed.orders[0].deliveredAt, completed.deliveredAt);
});

test("delivery and payment actions require current update permission and isolate each owner's orders", async t => {
  const f = setup(t), original = await createOrder();
  for (const action of ["payments", "deliver"]) {
    const body = { amount: 10, requestId: randomUUID(), version: 0 };
    for (const [actor, expected] of [[null, 401], [staffClaims, 403], [stranger, 404]]) {
      const response = await request({ suffix: `/${original._id}/${action}`, body, actor }); assert.equal(response.status, expected);
    }
    const invalid = await request({ suffix: `/bad/${action}`, body }); assert.equal(invalid.status, 404);
  }
  assert.equal(f.save.mock.callCount(), 0);
  f.staff.action.update = true;
  const paid = await request({ suffix: `/${original._id}/payments`, actor: staffClaims, body: { amount: 10, requestId: randomUUID(), version: 0 } }); assert.equal(paid.status, 200);
  const delivered = await request({ suffix: `/${original._id}/deliver`, actor: staffClaims, body: { version: 1 } }); assert.equal(delivered.status, 200);
  assert.equal(String(f.records[0].deliveredBy), employee); assert.equal(String(f.records[0].paymentReceipts[0].createdBy), employee);
});

test("stale actions and stale editor submissions cannot undo payments or delivery", async t => {
  const f = setup(t), body = input(), original = await createOrder(body);
  for (const version of [undefined, null, true, -1, "", "bad", 2]) {
    const response = await request({ suffix: `/${original._id}/deliver`, body: { version } }); assert.equal(response.status, 409);
  }
  const paid = await request({ suffix: `/${original._id}/payments`, body: { amount: 25, requestId: randomUUID(), version: 0 } }); assert.equal(paid.status, 200);
  const staleDelivery = await request({ suffix: `/${original._id}/deliver`, body: { version: 0 } }); assert.equal(staleDelivery.status, 409);
  const staleEdit = await request({ suffix: `/${original._id}`, method: "PUT", body: { ...body, version: 0 } }); assert.equal(staleEdit.status, 409); assert.equal(f.records[0].paidAmount, 225);
  const completed = await request({ suffix: `/${original._id}/deliver`, body: { version: 1 } }); assert.equal(completed.status, 200);
  const timestamp = (await completed.json()).deliveredAt;
  const edited = await request({ suffix: `/${original._id}`, method: "PUT", body: { ...body, paidAmount: 225, version: 2, clientName: "Updated", deliveredAt: null, paymentReceipts: [] } }); assert.equal(edited.status, 200);
  const final = await edited.json(); assert.equal(final.deliveredAt, timestamp); assert.equal(final.addedPayments.length, 1); assert.equal(final.paidAmount, 225);
});

const garment = (patch = {}) => ({ lineId: randomUUID().replaceAll("-", "").slice(0, 24), price: "500", fabricSource: "client", fabricType: "ساتان", fabricColor: "أزرق", sfifa: { width: "thin", style: "fabric" }, ...patch });
async function itemsRequest(body, images = [], { id = "", actor = admin, legacyImage = false } = {}) {
  const payload = new FormData();
  for (const [key, value] of Object.entries(body)) payload.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  for (const bytes of images) payload.append(legacyImage ? "image" : "images", new Blob([bytes], { type: "image/png" }), "garment.png");
  return fetch(base + (id ? `/${id}` : ""), { method: id ? "PUT" : "POST", headers: actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {}, body: payload });
}
test("multiple garments validate independently and their exact prices determine the order total", () => {
  const items = [garment({ price: "500,20" }), garment({ price: "300.10", sfifa: { width: "thick", style: "twoTone", color1: "ذهبي", color2: "أبيض" } }), garment({ price: "0.05" })];
  const value = validateTailoringOrder(input({ items, totalPrice: -100, paidAmount: "200.25" }));
  assert.equal(value.totalPrice, 800.35); assert.equal(value.paidAmount, 200.25); assert.equal(tailoringRemainingAmount(value.totalPrice, value.paidAmount), 600.1);
  assert.equal(value.items.length, 3); assert.equal(value.items[1].sfifa.color1, "ذهبي");
  assert.throws(() => validateTailoringOrder(input({ items: [garment({ price: "1.001" })] })), error => error.fields["items.0.price"] === "invalidMoney");
  assert.throws(() => validateTailoringOrder(input({ items: [garment({ sfifa: { width: "thick", style: "gradient" } })] })), error => Boolean(error.fields["items.0.sfifa.color1"]));
  for (const bad of [[], {}, "broken", Array.from({ length: 51 }, () => garment())]) assert.throws(() => validateTailoringOrder(input({ items: bad })), error => error.fields.items === "invalidItems");
  assert.throws(() => validateTailoringOrder(input({ items: [items[0], items[0]] })), error => error.fields["items.1.lineId"] === "invalidItem");
  assert.throws(() => validateTailoringOrder(input({ items: [garment({ price: 10 })], paidAmount: 11 })), error => error.fields.paidAmount === "paidExceedsPrice");
  assert.throws(() => validateTailoringOrder(input({ items: [garment({ price: 999999999.99 }), garment({ price: 1 })] })), error => error.fields.totalPrice === "invalidMoney");
});
test("a multi-garment order resolves each shop fabric and exposes all garments without changing stock", async t => {
  const f = setup(t), fabric = f.seedFabric();
  const items = [garment({ price: 400 }), garment({ price: 350.25, fabricSource: "shop", fabricId: String(fabric._id), colorId: String(fabric.colors[0]._id), fabricType: "FORGED", fabricColor: "FORGED" })];
  const created = await createOrder(input({ items, totalPrice: 1, paidAmount: 100 }));
  assert.equal(created.totalPrice, 750.25); assert.equal(created.remainingAmount, 650.25); assert.equal(created.items.length, 2);
  assert.equal(created.items[1].fabricType, "Coton"); assert.equal(created.items[1].fabricColor, "Bleu"); assert.equal(created.items[1].fabricReference, "T-100");
  assert.equal(fabric.colors[0].pieces[0].meters, 35); assert.equal(f.records[0].items.length, 2);
  f.fabrics.length = 0;
  const changed = await request({ method: "PUT", suffix: `/${created._id}`, body: input({ items: created.items, version: 0, clientName: "Changed", paidAmount: 100 }) });
  assert.equal(changed.status, 200); assert.equal((await changed.json()).items[1].fabricType, "Coton");
});
test("garment photos stay private and are served only for their own order and line", async t => {
  const f = setup(t), items = [garment({ imageIndex: 1 }), garment({ imageIndex: 0, fabricType: "مخمل" })];
  const response = await itemsRequest(input({ items }), [png, png]); assert.equal(response.status, 201);
  const created = await response.json(); assert.ok(created.items.every(item => item.hasPhoto)); assert.ok(created.items.every(item => item.photo === undefined));
  assert.notEqual(f.records[0].items[0].photo, f.records[0].items[1].photo);
  for (const item of items) {
    const own = await request({ suffix: `/${created._id}/items/${item.lineId}/photo` }); assert.equal(own.status, 200); assert.deepEqual(Buffer.from(await own.arrayBuffer()), png);
    const other = await request({ suffix: `/${created._id}/items/${item.lineId}/photo`, actor: stranger }); assert.equal(other.status, 404);
  }
  const missing = await request({ suffix: `/${created._id}/items/000000000000000000000000/photo` }); assert.equal(missing.status, 404);
});
test("photo mappings reject duplicate, missing or unrelated uploads before storing any order or photo", async t => {
  const f = setup(t), before = await readdir(photos);
  const cases = [ [[garment({ imageIndex: 0 }), garment({ imageIndex: 0 })], [png]], [[garment({ imageIndex: 1 })], [png]], [[garment()], [png]], [[garment({ imageIndex: 0 })], []], [[garment({ removeImage: "true" })], []] ];
  for (const [items, images] of cases) { const response = await itemsRequest(input({ items }), images); assert.equal(response.status, 400); }
  const mixed = await itemsRequest(input({ items: [garment()] }), [png], { legacyImage: true }); assert.equal(mixed.status, 400);
  assert.equal(f.records.length, 0); assert.deepEqual(await readdir(photos), before);
});
test("editing, reordering and removing garments keeps the correct photos and deletes only removed files", async t => {
  const f = setup(t), items = [garment({ imageIndex: 0 }), garment({ imageIndex: 1, price: 300 })];
  const original = await (await itemsRequest(input({ items }), [png, png])).json();
  const [firstPhoto, secondPhoto] = f.records[0].items.map(item => item.photo);
  const reversed = [original.items[1], original.items[0]];
  const reorder = await itemsRequest(input({ items: reversed, version: 0 }), [], { id: original._id }); assert.equal(reorder.status, 200);
  const reordered = await reorder.json(); assert.equal(f.records[0].items[0].photo, secondPhoto); assert.equal(f.records[0].items[1].photo, firstPhoto);
  const remove = await itemsRequest(input({ items: [reordered.items[0]], version: 1 }), [], { id: original._id }); assert.equal(remove.status, 200);
  assert.ok((await readdir(photos)).includes(secondPhoto)); assert.ok(!(await readdir(photos)).includes(firstPhoto)); assert.equal((await remove.json()).totalPrice, 300);
  const failedBefore = await readdir(photos);
  t.mock.method(TailoringOrder.prototype, "save", async () => { throw new Error("Database unavailable"); });
  const fail = await itemsRequest(input({ items: [{ ...reordered.items[0], imageIndex: 0 }], version: 2 }), [png], { id: original._id }); assert.equal(fail.status, 500);
  assert.deepEqual(await readdir(photos), failedBefore); assert.equal(f.records[0].items[0].photo, secondPhoto);
});
test("old single-garment orders become editable multi-garment orders without losing photos, payments or delivery", async t => {
  const f = setup(t), original = await createOrder(input(), { file: {} });
  const oldPhoto = f.records[0].photo;
  await request({ suffix: `/${original._id}/payments`, body: { amount: 50, requestId: randomUUID(), version: 0 } });
  const delivered = await (await request({ suffix: `/${original._id}/deliver`, body: { version: 1 } })).json();
  const items = [delivered.items[0], garment({ price: 300, fabricType: "مخمل" })];
  const change = await itemsRequest(input({ items, paidAmount: 250, version: 2 }), [], { id: original._id }); assert.equal(change.status, 200);
  const multi = await change.json(); assert.equal(multi.items.length, 2); assert.equal(multi.totalPrice, 800); assert.equal(multi.remainingAmount, 550); assert.equal(multi.deliveredAt, delivered.deliveredAt); assert.equal(multi.addedPayments.length, 1);
  assert.equal(f.records[0].items[0].photo, oldPhoto); assert.equal(multi.barcode, original.barcode);
  const oldWriter = await request({ suffix: `/${original._id}`, method: "PUT", body: input({ version: 3 }) }); assert.equal(oldWriter.status, 400); assert.equal((await oldWriter.json()).message, "itemsRequired"); assert.equal(f.records[0].items.length, 2);
  const payment = await request({ suffix: `/${original._id}/payments`, body: { amount: 100, requestId: randomUUID(), version: 3 } }); assert.equal(payment.status, 200); assert.equal((await payment.json()).remainingAmount, 450);
});
test("multi-garment creation retries are stable and general search includes every garment", async t => {
  const f = setup(t), items = [garment(), garment({ fabricType: "مخمل خاص", fabricColor: "بنفسجي", price: 300 })], body = input({ items });
  const created = await createOrder(body);
  const repeat = await request({ body: { ...body, totalPrice: 42 } }); assert.equal(repeat.status, 200); assert.equal((await repeat.json())._id, created._id); assert.equal(f.records.length, 1);
  const changed = await request({ body: { ...body, items: [items[0], { ...items[1], price: 301 }] } }); assert.equal(changed.status, 409);
  assert.deepEqual(filterTailoringOrders([created], "مخمل خاص"), [created]); assert.deepEqual(filterTailoringOrders([created], "بنفسجي"), [created]);
  assert.deepEqual(filterTailoringOrders([created], created.barcode, { barcodeOnly: true }), [created]);
});


const trouser = (patch = {}) => ({ lineId: randomUUID().replaceAll("-", "").slice(0, 24), price: "200", trouserType: "regular", fabricSource: "client", fabricType: "قطن", fabricColor: "أزرق", ...patch });
const trouserOrder = (patch = {}) => input({ garmentType: "trousers", items: [trouser()], paidAmount: "50", expenseAmount: "40", ...patch });

test("trousers support multiple independent types and exact order costs without sfifa or trusted browser totals", async t => {
  const f = setup(t);
  const body = trouserOrder({ items: [trouser({ price: "200.10", sfifa: { width: "forged" } }), trouser({ price: "300,20", trouserType: "qandrissi" })], expenseAmount: "100,05", paidAmount: "75.05", totalPrice: 1, profitAmount: 9999 });
  const order = await createOrder(body, { multipart: true });
  assert.equal(order.garmentType, "trousers");
  assert.deepEqual(order.items.map(item => item.trouserType), ["regular", "qandrissi"]);
  assert.equal(order.totalPrice, 500.3); assert.equal(order.expenseAmount, 100.05); assert.equal(order.profitAmount, 400.25);
  assert.equal(order.paidAmount, 75.05); assert.equal(order.remainingAmount, 425.25);
  assert.equal(Object.hasOwn(order, "sfifa"), false); assert.ok(order.items.every(item => !Object.hasOwn(item, "sfifa")));
  assert.equal(f.records[0].toObject().profitAmount, undefined);
  assert.equal((await (await request()).json()).orders[0].profitAmount, 400.25);
  assert.equal(filterTailoringOrders([order], order.barcode)[0]._id, order._id);
});

test("trouser costs and garment prices can be edited while the barcode and line identities remain stable", async t => {
  setup(t); const original = await createOrder(trouserOrder());
  const response = await itemsRequest(trouserOrder({ items: original.items, expenseAmount: "250.25", version: original.__v }), [], { id: original._id });
  assert.equal(response.status, 200); const updated = await response.json();
  assert.equal(updated.expenseAmount, 250.25); assert.equal(updated.profitAmount, -50.25);
  assert.equal(updated.remainingAmount, 150); assert.equal(updated.items[0].lineId, original.items[0].lineId); assert.equal(updated.barcode, original.barcode);
  const changed = await itemsRequest(trouserOrder({ items: [{ ...updated.items[0], price: "300.50", trouserType: "qandrissi" }], expenseAmount: updated.expenseAmount, version: updated.__v }), [], { id: updated._id });
  assert.equal(changed.status, 200); const final = await changed.json();
  assert.equal(final.profitAmount, 50.25); assert.equal(final.items[0].trouserType, "qandrissi");
  assert.equal(final.remainingAmount, 250.5);
});

test("payments and delivery affect the trouser balance without altering order expenses or profit", async t => {
  const f = setup(t); const original = await createOrder(trouserOrder());
  const payment = { amount: "25.15", version: original.__v, requestId: randomUUID() };
  let response = await request({ suffix: "/" + original._id + "/payments", body: payment });
  assert.equal(response.status, 200); const paid = await response.json();
  assert.equal(paid.remainingAmount, 124.85); assert.equal(paid.profitAmount, 160); assert.equal(paid.expenseAmount, 40);
  assert.equal((await request({ suffix: "/" + original._id + "/payments", body: payment })).status, 200);
  assert.equal(f.records[0].paymentReceipts.length, 1);
  response = await request({ suffix: "/" + original._id + "/deliver", body: { version: paid.__v } });
  assert.equal(response.status, 200); const delivered = await response.json();
  assert.ok(delivered.deliveredAt); assert.equal(delivered.profitAmount, 160); assert.equal(delivered.remainingAmount, 124.85);
});

test("trouser creation retries do not duplicate orders and changed costs or types cannot reuse a request", async t => {
  const f = setup(t), body = trouserOrder(); const created = await createOrder(body);
  const retry = await request({ body }); assert.equal(retry.status, 200); assert.equal((await retry.json())._id, created._id);
  for (const patch of [{ expenseAmount: 41 }, { items: [{ ...body.items[0], trouserType: "qandrissi" }] }]) {
    const response = await request({ body: { ...body, ...patch } }); assert.equal(response.status, 409); assert.equal((await response.json()).message, "requestConflict");
  }
  assert.equal(f.records.length, 1);
});

test("invalid trousers, costs and garment counts are rejected without changing any stored order", async t => {
  const f = setup(t), valid = trouserOrder(); const original = await createOrder(valid); const before = JSON.stringify(f.records);
  const invalid = [
    ...[undefined, "", " ", null, true, {}, -1, "1.001", "1e2"].map(expenseAmount => ({ expenseAmount })),
    ...[undefined, "", "wrong", {}, "regular,qandrissi"].map(trouserType => ({ items: [trouser({ trouserType })] })),
    { garmentType: "wrong" }, { garmentType: {} }, { items: [] }, { items: [valid.items[0], valid.items[0]] },
    { items: Array.from({ length: 51 }, () => trouser()) }, { paidAmount: 201 },
  ];
  for (const patch of invalid) {
    for (const method of ["POST", "PUT"]) {
      const response = await request({ method, suffix: method === "PUT" ? "/" + original._id : "", body: { ...valid, ...patch, requestId: randomUUID(), version: 0 } });
      assert.equal(response.status, 400, JSON.stringify(patch)); assert.equal((await response.json()).message, "invalidOrder");
    }
    assert.equal(JSON.stringify(f.records), before);
  }
  assert.equal(f.save.mock.callCount(), 0);
  assert.equal(tailoringProfitAmount("0.30", "0.10"), 0.2);
  assert.equal(tailoringProfitAmount(10, 20), -10);
  assert.equal(tailoringProfitAmount(10, ""), null);
});

test("legacy djellabas stay in their section and cannot become trousers through an edit", async t => {
  const f = setup(t), old = await createOrder();
  assert.equal(old.garmentType, "djellaba"); assert.equal(tailoringGarmentType(f.records[0]), "djellaba");
  assert.equal(f.records[0].garmentType, undefined); assert.equal(old.expenseAmount, undefined); assert.equal(old.profitAmount, undefined);
  const trousers = await createOrder(trouserOrder());
  for (const [order, body] of [[old, trouserOrder()], [trousers, input({ items: [garment()] })]]) {
    const response = await request({ method: "PUT", suffix: "/" + order._id, body: { ...body, version: order.__v } });
    assert.equal(response.status, 400); assert.equal((await response.json()).fields.garmentType, "garmentTypeLocked");
  }
  assert.equal(f.save.mock.callCount(), 0);
});

test("trouser photos stay private, follow each line through reordering and do not expose filenames", async t => {
  const f = setup(t), body = trouserOrder({ items: [trouser({ imageIndex: 0 }), trouser({ price: 100, trouserType: "qandrissi" })] });
  const response = await itemsRequest(body, [png]); assert.equal(response.status, 201); const original = await response.json();
  assert.equal(original.items[0].hasPhoto, true); assert.equal(original.items[0].photo, undefined); assert.equal(original.items[1].hasPhoto, false);
  const line = original.items[0].lineId, filename = f.records[0].items[0].photo;
  assert.equal((await request({ suffix: "/" + original._id + "/items/" + line + "/photo", actor: stranger })).status, 404);
  const edit = await itemsRequest(trouserOrder({ items: [...original.items].reverse(), version: 0 }), [], { id: original._id });
  assert.equal(edit.status, 200); assert.equal(f.records[0].items[1].photo, filename);
  assert.equal((await request({ suffix: "/" + original._id + "/items/" + line + "/photo" })).status, 200);
});

test("trouser orders use the same current account and owning shop permissions", async t => {
  const f = setup(t); const order = await createOrder(trouserOrder(), { actor: staffClaims });
  assert.equal(order.createdBy, employee); assert.equal(order.idAdmin, owner);
  assert.equal((await (await request({ actor: staffClaims })).json()).orders[0].garmentType, "trousers");
  assert.equal((await request({ method: "PUT", suffix: "/" + order._id, actor: stranger, body: { ...trouserOrder(), version: 0 } })).status, 404);
  assert.equal((await request({ method: "PUT", suffix: "/" + order._id, actor: staffClaims, body: { ...trouserOrder(), version: 0 } })).status, 403);
  f.staff.action.add = false;
  assert.equal((await request({ actor: staffClaims, body: trouserOrder() })).status, 403);
  assert.equal((await request({ actor: null, body: trouserOrder() })).status, 401);
  assert.equal(f.save.mock.callCount(), 0);
});


test("the full trousers form can create and edit its mirrored fields and existing photo over multipart", async t => {
  const f=setup(t), raw=trouserOrder({items:[trouser({imageIndex:0})]});
  const response=await itemsRequest({...validateTailoringOrder(raw),requestId:raw.requestId},[png]);
  assert.equal(response.status,201);const original=await response.json();const photo=f.records[0].items[0].photo;
  const value=validateTailoringOrder({...original,expenseAmount:"45.50"});
  const edited=await itemsRequest({...value,version:0,removeImage:false},[],{id:original._id});
  assert.equal(edited.status,200);const order=await edited.json();
  assert.equal(order.expenseAmount,45.5);assert.equal(order.profitAmount,154.5);assert.equal(order.barcode,original.barcode);
  assert.equal(f.records[0].items[0].photo,photo);
});


const shirt = (patch = {}) => ({ lineId: randomUUID().replaceAll("-", "").slice(0, 24), price: "200", shirtType: "قميص رجالي", fabricSource: "client", fabricType: "قطن", fabricColor: "أزرق", ...patch });
const shirtOrder = (patch = {}) => input({ garmentType: "shirts", items: [shirt()], paidAmount: "50", expenseAmount: "40", ...patch });

test("shirt orders store free text types per garment and exact costs without sfifa or trouser types", async t => {
  const f = setup(t);
  const body = shirtOrder({ items: [shirt({ price: "150.10", shirtType: " قميص رجالي ", sfifa: { width: "forged" }, trouserType: "regular" }), shirt({ price: "100,20", shirtType: "قميص أطفال" })], expenseAmount: "60,05", paidAmount: "75.05", totalPrice: 1, profitAmount: 9999 });
  const order = await createOrder(body, { multipart: true });
  assert.equal(order.garmentType, "shirts");assert.equal(order.shirtType,"قميص رجالي");
  assert.deepEqual(order.items.map(item => item.shirtType), ["قميص رجالي", "قميص أطفال"]);
  assert.equal(order.totalPrice,250.3);assert.equal(order.expenseAmount,60.05);assert.equal(order.profitAmount,190.25);assert.equal(order.remainingAmount,175.25);
  assert.equal(order.sfifa,undefined);assert.equal(order.trouserType,undefined);assert.ok(order.items.every(item=>item.sfifa===undefined&&item.trouserType===undefined));
  assert.equal(f.records[0].toObject().profitAmount,undefined);
  const listed=(await (await request()).json()).orders[0];assert.equal(listed.items[1].shirtType,"قميص أطفال");
  assert.equal(filterTailoringOrders([listed],"أطفال")[0]._id,order._id);assert.equal(filterTailoringOrders([listed],order.barcode)[0]._id,order._id);
});

test("shirt type and cost validation rejects invalid data before changing a stored order", async t => {
  const f=setup(t),body=shirtOrder(),original=await createOrder(body),before=JSON.stringify(f.records);
  const invalid=[...[undefined,""," ",{},true,123,"x".repeat(121),"نوع\u0000قميص"].map(shirtType=>({items:[shirt({shirtType})]})),...[undefined,"",{},true,-1,"1.001"].map(expenseAmount=>({expenseAmount}))];
  for(const patch of invalid){for(const method of ["POST","PUT"]){const response=await request({method,suffix:method==="PUT"?"/"+original._id:"",body:{...body,...patch,version:0,requestId:randomUUID()}});assert.equal(response.status,400,JSON.stringify(patch));assert.equal((await response.json()).message,"invalidOrder");}assert.equal(JSON.stringify(f.records),before);}
  assert.equal(f.save.mock.callCount(),0);
  const free=validateTailoringOrder(shirtOrder({items:[shirt({price:0})],expenseAmount:0,paidAmount:0}));assert.equal(free.totalPrice,0);assert.equal(free.expenseAmount,0);
});

test("full shirt multipart forms preserve each private photo and barcode through edits and reordering", async t => {
  const f=setup(t),body=shirtOrder({items:[shirt({imageIndex:0}),shirt({shirtType:"قميص نسائي",price:100})]});
  const response=await itemsRequest({...validateTailoringOrder(body),requestId:body.requestId},[png]);assert.equal(response.status,201);const original=await response.json();
  const photo=f.records[0].items[0].photo,line=original.items[0].lineId;
  const items=[original.items[1],{...original.items[0],shirtType:"قميص جديد",price:"300.50"}];
  const payload=validateTailoringOrder(shirtOrder({items,expenseAmount:"50.25"}));
  const changed=await itemsRequest({...payload,version:0,removeImage:false},[],{id:original._id});assert.equal(changed.status,200);const edited=await changed.json();
  assert.equal(edited.items[1].lineId,line);assert.equal(edited.items[1].shirtType,"قميص جديد");assert.equal(f.records[0].items[1].photo,photo);assert.equal(edited.barcode,original.barcode);
  assert.equal(edited.shirtType,"قميص نسائي");assert.equal(edited.totalPrice,400.5);assert.equal(edited.profitAmount,350.25);assert.equal(edited.remainingAmount,350.5);
  assert.equal((await request({suffix:"/"+original._id+"/items/"+line+"/photo"})).status,200);
  assert.equal((await request({suffix:"/"+original._id+"/items/"+line+"/photo",actor:stranger})).status,404);
});

test("shirt creation retries preserve identity and reject changed type or expenses", async t => {
  const f=setup(t),body=shirtOrder(),original=await createOrder(body);
  const retry=await request({body});assert.equal(retry.status,200);assert.equal((await retry.json())._id,original._id);
  for(const patch of [{expenseAmount:41},{items:[{...body.items[0],shirtType:"قميص مختلف"}]}]){const response=await request({body:{...body,...patch}});assert.equal(response.status,409);assert.equal((await response.json()).message,"requestConflict");}
  assert.equal(f.records.length,1);
});

test("shirt payments and delivery preserve costs and profit under existing permissions", async t => {
  const f=setup(t),original=await createOrder(shirtOrder(),{actor:staffClaims});assert.equal(original.createdBy,employee);
  assert.equal((await request({suffix:"/"+original._id+"/payments",actor:staffClaims,body:{amount:25,version:0,requestId:randomUUID()}})).status,403);
  const response=await request({suffix:"/"+original._id+"/payments",body:{amount:"25.15",version:0,requestId:randomUUID()}});assert.equal(response.status,200);const paid=await response.json();
  assert.equal(paid.remainingAmount,124.85);assert.equal(paid.profitAmount,160);assert.equal(paid.expenseAmount,40);
  const delivery=await request({suffix:"/"+original._id+"/deliver",body:{version:paid.__v}});assert.equal(delivery.status,200);const delivered=await delivery.json();assert.ok(delivered.deliveredAt);assert.equal(delivered.profitAmount,160);
  const foreign=await request({method:"PUT",suffix:"/"+original._id,actor:stranger,body:{...shirtOrder(),version:delivered.__v}});assert.equal(foreign.status,404);
  f.staff.action.add=false;assert.equal((await request({body:shirtOrder(),actor:staffClaims})).status,403);
});

test("shirt orders cannot change sections and existing trousers keep their original retry fingerprint", async t => {
  const f=setup(t),original=await createOrder(shirtOrder());
  const change=await request({method:"PUT",suffix:"/"+original._id,body:{...trouserOrder(),version:0}});assert.equal(change.status,400);assert.equal((await change.json()).fields.garmentType,"garmentTypeLocked");
  const oldBody={"clientName":"أمينة","phone":"0612345678","orderDate":"2026-10-27","readyDate":"2026-11-05","garmentType":"trousers","expenseAmount":40,"paidAmount":50,"items":[{"lineId":"1234567890abcdef12345678","price":200,"trouserType":"regular","fabricSource":"client","fabricType":"قطن","fabricColor":"أزرق"}],"requestId":"11111111-1111-4111-8111-111111111111"};
  const legacyValue=validateTailoringOrder(oldBody);
  const legacy=new TailoringOrder({...legacyValue,fabricId:null,colorId:null,items:legacyValue.items.map(item=>({...item,fabricId:null,colorId:null})),idAdmin:owner,createdBy:owner,requestId:oldBody.requestId,requestFingerprint:"0e3089d4154740443a689c49d6d20a22e5719de2537a82c6e5f863b615c8a22d",__v:0});await legacy.validate();f.records.push(legacy);
  const retry=await request({body:oldBody});assert.equal(retry.status,200);assert.equal((await retry.json())._id,String(legacy._id));assert.equal(f.create.mock.callCount(),1);
});

test("two-tone colors are optional independently for single and multiple garment orders", async t => {
  setup(t);
  for (const width of ["thin", "thick"]) for (const colors of [{}, {color1: "ذهبي"}, {color2: "أبيض"}, {color1: " ", color2: " "}]) {
    const sfifa = {width, style: "twoTone", ...colors};
    const single = validateTailoringOrder(input({sfifa}));
    assert.equal(single.sfifa.color1, (colors.color1 || "").trim());
    assert.equal(single.sfifa.color2, (colors.color2 || "").trim());
    const response = await request({body: input({paidAmount: 0, items: [garment({sfifa})]})});
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const order = await response.json();
    assert.equal(order.items[0].sfifa.color1, single.sfifa.color1);
    assert.equal(order.items[0].sfifa.color2, single.sfifa.color2);
  }
});
test("optional two-tone colors still reject malformed values and invalid text", () => {
  for (const key of ["color1", "color2"]) for (const value of [123, {}, "x".repeat(121), "a\nb"]) {
    assert.throws(() => validateTailoringOrder(input({sfifa:{width:"thin",style:"twoTone",[key]:value}})), error => Boolean(error.fields["sfifa."+key]));
  }
});
