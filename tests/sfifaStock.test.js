import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import SfifaStock from "../BackEnd/models/SfifaStock.js";
import TailoringWorker from "../BackEnd/models/TailoringWorker.js";
import { SFIFA_STOCK_FAMILIES, SFIFA_STOCK_WIDTHS, filterSfifaStock, formatSfifaCode, normalizeSfifaBarcode, sfifaStockBarcode, sfifaCodeNumber, sfifaQuantityUnits, sfifaStockTotals, validateSfifaStock } from "../shared/sfifaStock.js";

const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
const admin = { id: owner, role: "admin" }, stranger = { id: otherOwner, role: "admin" }, staffClaims = { id: employee, role: "Employe", idAdmin: otherOwner, action: { add: true, update: true, delete: true } };
const previousSecret = process.env.JWT_SECRET;
let server, base;
before(async () => {
  process.env.JWT_SECRET = "sfifa-stock-tests";
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/sfifa-stock`;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});
const query = fn => ({ select() { return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } });
const input = (patch = {}) => ({ width: "thin", family: "01-30", code: SFIFA_STOCK_FAMILIES.find(family => family.value === (patch.family || "01-30"))?.min ?? 1, quantity: 10, requestId: randomUUID(), ...patch });
function setup(t) {
  const records = [], workers = [], accounts = new Set([owner, otherOwner]);
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: true, delete: true } };
  t.mock.method(AdminModel, "findById", id => query(() => accounts.has(String(id)) ? { _id: id } : null));
  t.mock.method(EmployeModel, "findById", id => query(() => String(id) === employee ? staff : null));
  t.mock.method(TailoringWorker, "find", scope => query(() => workers.filter(worker => String(worker.idAdmin) === String(scope.idAdmin) && scope._id.$in.includes(String(worker._id)))));
  const matches = (row, scope) => String(row.idAdmin) === String(scope.idAdmin) && (!scope._id || String(row._id) === String(scope._id).toLowerCase()) && (!scope.width || row.width === scope.width) && (!scope.family || row.family === scope.family) && (!scope["receipts.requestId"] || row.receipts.some(receipt => receipt.requestId === scope["receipts.requestId"]));
  const find = t.mock.method(SfifaStock, "find", scope => query(() => records.filter(row => matches(row, scope)).map(row => row.toObject())));
  t.mock.method(SfifaStock, "findOne", async scope => { const row = records.find(row => matches(row, scope)); return row ? new SfifaStock(row.toObject()) : null; });
  const ensureUnique = row => {
    if (records.some(other => String(other._id) !== String(row._id) && String(other.idAdmin) === String(row.idAdmin) && ((other.width === row.width && other.family === row.family) || other.receipts.some(receipt => row.receipts.some(candidate => candidate.requestId === receipt.requestId))))) throw Object.assign(new Error("duplicate"), { code: 11000 });
  };
  const create = t.mock.method(SfifaStock, "create", async value => {
    const row = new SfifaStock({ ...value, __v: 0, createdAt: new Date(), updatedAt: new Date() }); await row.validate(); ensureUnique(row); records.push(row); return row;
  });
  const save = t.mock.method(SfifaStock.prototype, "save", async function () {
    await this.validate(); const index = records.findIndex(row => String(row._id) === String(this._id));
    if (index < 0 || records[index].__v !== this.__v) throw Object.assign(new Error("Concurrent write"), { name: "VersionError" });
    ensureUnique(this); this.__v += 1; this.updatedAt = new Date(); records[index] = new SfifaStock(this.toObject()); return this;
  });
  return { records, workers, accounts, staff, find, create, save };
}
async function request({ body, suffix = "", method = body === undefined ? "GET" : "POST", actor = admin } = {}) {
  const headers = actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(base + suffix, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const add = async (body = input(), actor) => { const response = await request({ body, ...(actor === undefined ? {} : { actor }) }); assert.equal(response.status, 201); return response.json(); };

test("sfifa has exactly two widths and the three requested family labels, preserving 01", () => {
  assert.deepEqual(SFIFA_STOCK_WIDTHS, ["thin", "thick"]);
  assert.deepEqual(SFIFA_STOCK_FAMILIES.map(family => family.label), ["01 -- 30", "1426 -- 1432", "8080 -- 8097"]);
  assert.throws(() => validateSfifaStock(input({ family: "1-30" })), error => error.fields.family === "invalidFamily");
  for (const width of SFIFA_STOCK_WIDTHS) for (const family of SFIFA_STOCK_FAMILIES) assert.equal(validateSfifaStock(input({ width, family: family.value })).family, family.value);
});

test("quantities accept decimal commas and exact thousandths, with zero only for balance correction", () => {
  assert.equal(sfifaQuantityUnits("0,125"), 125); assert.equal(sfifaQuantityUnits(0.3), 300);
  assert.equal(validateSfifaStock(input({ quantity: "10,250" })).quantity, 10.25);
  assert.throws(() => validateSfifaStock(input({ quantity: 0 })), /invalidStock/);
  assert.equal(validateSfifaStock(input({ quantity: 0 }), { allowZero: true }).quantity, 0);
  for (const quantity of [undefined, null, "", -1, true, {}, [], NaN, Infinity, "1e2", "1.0001", "0,0001", 1000001]) assert.throws(() => validateSfifaStock(input({ quantity })), /invalidStock/);
});

test("six stock combinations persist independently with trusted owner and actor identities", async t => {
  const f = setup(t);
  for (const width of SFIFA_STOCK_WIDTHS) for (const family of SFIFA_STOCK_FAMILIES) {
    const stock = await add(input({ width, family: family.value, idAdmin: otherOwner, createdBy: employee, receipts: [] }));
    assert.equal(stock.width, width); assert.equal(stock.family, family.value); assert.equal(stock.quantity, 10);
    assert.equal(stock.receipts, undefined); assert.equal(stock.idAdmin, undefined); assert.equal(stock.requestId, undefined);
  }
  assert.equal(f.records.length, 6); assert.ok(f.records.every(row => String(row.idAdmin) === owner && String(row.createdBy) === owner));
  const listed = await (await request()).json(); assert.equal(listed.items.length, 6); assert.deepEqual(listed.permissions, { add: true, update: true, delete: true });
});

test("restocking a combination increases one balance and preserves decimal precision", async t => {
  const f = setup(t), first = await add(input({ quantity: "0,1" })), next = await add(input({ quantity: "0,2" }));
  assert.equal(next._id, first._id); assert.equal(next.quantity, 0.3); assert.equal(f.records.length, 1); assert.equal(f.records[0].receipts.length, 2);
  const other = await add(input({ width: "thick", quantity: 4 })); assert.notEqual(other._id, first._id); assert.equal(f.records[0].quantity, 0.3);
});

test("lost-response retries and repeated clicks never add the same receipt twice", async t => {
  const f = setup(t), body = input(); const first = await add(body);
  const retry = await request({ body: { ...body, quantity: "10,000" } }); assert.equal(retry.status, 200); assert.equal((await retry.json())._id, first._id);
  assert.equal(f.records[0].quantity, 10); assert.equal(f.records[0].receipts.length, 1);
  for (const change of [{ quantity: 11 }, { width: "thick" }, { family: "1426-1432", code: 1426 }]) assert.equal((await request({ body: { ...body, ...change } })).status, 409);
  assert.equal(f.records.length, 1);
});

test("concurrent restocks create one row, sum distinct receipts and deduplicate shared receipts", async t => {
  const f = setup(t), duplicate = input();
  const first = await Promise.all([request({ body: duplicate }), request({ body: duplicate })]); assert.deepEqual(first.map(response => response.status).sort(), [200, 201]); assert.equal(f.records[0].quantity, 10);
  const additions = await Promise.all([request({ body: input({ quantity: 5 }) }), request({ body: input({ quantity: 7 }) })]); assert.deepEqual(additions.map(response => response.status), [201, 201]); assert.equal(f.records[0].quantity, 22); assert.equal(f.records[0].receipts.length, 3);
  const same = input({ quantity: 3 }); const repeat = await Promise.all([request({ body: same }), request({ body: same })]); assert.deepEqual(repeat.map(response => response.status).sort(), [200, 201]); assert.equal(f.records[0].quantity, 25); assert.equal(f.records[0].receipts.length, 4); assert.equal(f.records.length, 1);
  const newFamily = await Promise.all([request({ body: input({ family: "1426-1432", quantity: 4 }) }), request({ body: input({ family: "1426-1432", quantity: 6 }) })]); assert.deepEqual(newFamily.map(response => response.status), [201, 201]); assert.equal(f.records.find(row => row.family === "1426-1432").quantity, 10);
});

test("a request ID cannot be reused for different concurrent combinations", async t => {
  const f = setup(t), body = input();
  const results = await Promise.all([request({ body }), request({ body: { ...body, width: "thick" } })]);
  assert.deepEqual(results.map(response => response.status).sort(), [201, 409]); assert.equal(f.records.length, 1); assert.equal(f.records[0].quantity, 10);
});

test("stock correction replaces the balance, permits zero and retains receipt retry identity", async t => {
  const f = setup(t), body = input(), stock = await add(body);
  const corrected = await request({ suffix: `/${stock.parentId}/variants/${stock._id}`, method: "PUT", body: { quantity: 3.5, version: 0, width: "thick", family: "8080-8097", idAdmin: otherOwner } });
  assert.equal(corrected.status, 200); const current = await corrected.json(); assert.equal(current.quantity, 3.5); assert.equal(current.width, "thin"); assert.equal(current.family, "01-30"); assert.equal(current.__v, 1);
  const zero = await request({ suffix: `/${stock.parentId}/variants/${stock._id}`, method: "PUT", body: { quantity: 0, version: 1 } }); assert.equal(zero.status, 200); assert.equal((await zero.json()).quantity, 0);
  const retry = await request({ body }); assert.equal(retry.status, 200); assert.equal((await retry.json()).quantity, 0); assert.equal(f.records[0].receipts.length, 1);
});

test("stale or invalid corrections cannot overwrite current stock", async t => {
  const f = setup(t), stock = await add();
  for (const version of [undefined, -1, true, "bad", 1]) assert.equal((await request({ suffix: `/${stock.parentId}/variants/${stock._id}`, method: "PUT", body: { quantity: 0, version } })).status, 409);
  for (const quantity of [-1, "bad", "1.0001"]) assert.equal((await request({ suffix: `/${stock.parentId}/variants/${stock._id}`, method: "PUT", body: { quantity, version: 0 } })).status, 400);
  await add(input({ quantity: 5 }));
  assert.equal((await request({ suffix: `/${stock.parentId}/variants/${stock._id}`, method: "PUT", body: { quantity: 0, version: 0 } })).status, 409); assert.equal(f.records[0].quantity, 15);
});

test("listing and receipt identities are isolated between shops", async t => {
  setup(t); const body = input(); const own = await add(body); const other = await add(body, stranger);
  assert.notEqual(own._id, other._id);
  assert.equal((await (await request()).json()).items.length, 1); assert.equal((await (await request({ actor: stranger })).json()).items.length, 1);
  assert.equal((await request({ suffix: `/${other.parentId}/variants/${other._id}`, method: "PUT", body: { quantity: 0, version: 0 } })).status, 404);
});

test("current employee permissions control restock and correction independently", async t => {
  const f = setup(t), stock = await add(); f.staff.action.add = false; f.staff.action.update = false;
  assert.equal((await request({ body: input(), actor: staffClaims })).status, 403);
  assert.equal((await request({ suffix: `/${stock.parentId}/variants/${stock._id}`, method: "PUT", body: { quantity: 2, version: 0 }, actor: staffClaims })).status, 403);
  const listed = await (await request({ actor: staffClaims })).json(); assert.deepEqual(listed.permissions, { add: false, update: false, delete: true });
  f.staff.action.add = true; await add(input({ quantity: 5 }), staffClaims); assert.equal(String(f.records[0].receipts[1].createdBy), employee); assert.equal(String(f.records[0].idAdmin), owner);
  f.staff.isActive = false; assert.equal((await request({ actor: staffClaims })).status, 403);
});

test("missing authentication, unsupported roles and removed accounts cannot access stock", async t => {
  const f = setup(t);
  for (const [actor, status] of [[null, 401], [{ id: owner, role: "visitor" }, 403], [{ id: "444444444444444444444444", role: "admin" }, 403]]) {
    assert.equal((await request({ actor })).status, status); assert.equal((await request({ body: input(), actor })).status, status);
  }
  f.accounts.delete(owner); assert.equal((await request()).status, 403); assert.equal(f.records.length, 0);
});

test("invalid widths, families, quantities and request IDs are rejected before saving", async t => {
  const f = setup(t);
  for (const change of [{ width: "other" }, { family: "1-30" }, { family: "unknown" }, { quantity: 0 }, { quantity: -1 }, { quantity: "bad" }, { requestId: "bad" }]) assert.equal((await request({ body: input(change) })).status, 400);
  assert.equal((await request({ suffix: "/invalid", method: "PUT", body: { quantity: 0, version: 0 } })).status, 404); assert.equal(f.records.length, 0);
});

test("overflow and failed writes do not change quantity or append a receipt", async t => {
  const f = setup(t), body = input();
  f.create.mock.mockImplementationOnce(async () => { throw new Error("private database detail"); }); const failedCreate = await request({ body }); assert.equal(failedCreate.status, 500); assert.deepEqual(await failedCreate.json(), { message: "saveFailed" });
  await add(body); const addition = input({ quantity: 3 }); f.save.mock.mockImplementationOnce(async () => { throw new Error("private save detail"); });
  const failed = await request({ body: addition }); assert.equal(failed.status, 500); assert.equal(f.records[0].quantity, 10); assert.equal(f.records[0].receipts.length, 1); await add(addition); assert.equal(f.records[0].quantity, 13);
  const max = await add(input({ width: "thick", quantity: 1000000 })); const overflow = await request({ body: input({ width: "thick", quantity: 0.001 }) }); assert.equal(overflow.status, 400); assert.equal((await overflow.json()).fields.quantity, "quantityLimit"); assert.equal(f.records.find(row => String(row._id) === max.parentId).quantity, 1000000);
  f.find.mock.mockImplementationOnce(() => query(() => { throw new Error("private read detail"); })); const unavailable = await request(); assert.equal(unavailable.status, 500); assert.deepEqual(await unavailable.json(), { message: "loadFailed" });
});

test("the number must fall inside its selected family, including every boundary", () => {
  for (const family of SFIFA_STOCK_FAMILIES) {
    for (const code of [family.min, family.max]) assert.equal(validateSfifaStock(input({ family: family.value, code })).code, code);
    for (const code of [family.min - 1, family.max + 1, "", "1.5", {}, undefined]) assert.throws(() => validateSfifaStock(input({ family: family.value, code })), error => error.fields.code === "invalidCode");
  }
  assert.equal(sfifaCodeNumber("01", "01-30"), 1); assert.equal(formatSfifaCode(1, "01-30"), "01");
  assert.equal(formatSfifaCode(12, "01-30"), "12"); assert.equal(formatSfifaCode(1426, "1426-1432"), "1426");
});

test("different numbers in one family have independent balances and share fresh versions", async t => {
  const f = setup(t), twelve = await add(input({ code: 12, quantity: 10 })), thirteen = await add(input({ code: 13, quantity: 20 }));
  assert.notEqual(twelve._id, thirteen._id); assert.equal(twelve.parentId, thirteen.parentId); assert.equal(f.records.length, 1);
  const increased = await add(input({ code: 12, quantity: 5 })); assert.equal(increased._id, twelve._id); assert.equal(increased.quantity, 15);
  assert.equal(increased.items.find(row => row.code === 13).quantity, 20); assert.ok(increased.items.every(row => row.__v === increased.__v));
  const sibling = increased.items.find(row => row.code === 13);
  const corrected = await request({ suffix: `/${sibling.parentId}/variants/${sibling._id}`, method: "PUT", body: { quantity: 3, version: sibling.__v } });
  assert.equal(corrected.status, 200); const result = await corrected.json(); assert.equal(result.quantity, 3); assert.equal(result.items.find(row => row.code === 12).quantity, 15); assert.equal(f.records[0].quantity, 18);
  const listed = await (await request()).json(); assert.equal(listed.items.length, 2); assert.equal(listed.items.some(row => row.isUnassigned), false);
});

test("equivalent number spellings restock one item and request identity includes the number", async t => {
  const f = setup(t), body = input({ code: "01" }), first = await add(body);
  const retry = await request({ body: { ...body, code: 1 } }); assert.equal(retry.status, 200); assert.equal((await retry.json())._id, first._id);
  assert.equal((await request({ body: { ...body, code: 2 } })).status, 409);
  const next = await add(input({ code: 1, quantity: 2 })); assert.equal(next._id, first._id); assert.equal(next.quantity, 12); assert.equal(f.records[0].variants.length, 1);
});

test("quantity limits apply per number while a family may hold several full balances", async t => {
  const f = setup(t); await add(input({ code: 12, quantity: 1000000 })); await add(input({ code: 13, quantity: 1000000 }));
  assert.equal(f.records[0].quantity, 2000000); await f.records[0].validate();
  const listed = await (await request()).json(); assert.deepEqual(sfifaStockTotals(listed.items), { total: 2000000, thick: 0, thin: 2000000 });
});

test("filters combine width, family and exact number, while totals include all recorded stock", () => {
  const rows = [{ width: "thin", family: "01-30", code: 1, quantity: 0.1 }, { width: "thin", family: "01-30", code: 12, quantity: 0.2 }, { width: "thick", family: "01-30", code: 12, quantity: 5 }, { width: "thick", family: "1426-1432", code: 1426, quantity: 7 }];
  assert.deepEqual(sfifaStockTotals(rows), { total: 12.3, thick: 12, thin: 0.3 });
  assert.equal(filterSfifaStock(rows, { width: "thin" }).length, 2);
  assert.equal(filterSfifaStock(rows, { family: "1426-1432" }).length, 1);
  assert.equal(filterSfifaStock(rows, { code: "01" }).length, 1);
  assert.equal(filterSfifaStock(rows, { width: "thin", family: "01-30", code: "12" }).length, 1);
  assert.equal(filterSfifaStock(rows, { width: "thin", family: "1426-1432" }).length, 0);
  assert.equal(filterSfifaStock(rows, { code: "bad" }).length, 0);
});

function seedLegacy(f, quantity = 10) {
  const row = new SfifaStock({ idAdmin: owner, createdBy: owner, width: "thin", family: "01-30", quantity, receipts: [{ requestId: randomUUID(), quantity: Math.max(quantity, 1), createdBy: owner, date: new Date() }], __v: 0, createdAt: new Date(), updatedAt: new Date() });
  f.records.push(row); return row;
}
test("old family balances remain intact and are never assigned a made-up number", async t => {
  const f = setup(t), legacy = seedLegacy(f); await legacy.validate();
  const listed = await (await request()).json(); assert.equal(listed.items.length, 1); assert.equal(listed.items[0].isUnassigned, true); assert.equal(listed.items[0].code, null); assert.equal(listed.items[0].quantity, 10); assert.equal(legacy.variants, undefined);
  await add(input({ code: 12, quantity: 5 }));
  const updated = await (await request()).json(); assert.equal(updated.items.length, 2); assert.equal(updated.items.find(row => row.isUnassigned).quantity, 10); assert.equal(updated.items.find(row => row.code === 12).quantity, 5); assert.equal(f.records[0].quantity, 15);
  assert.deepEqual(sfifaStockTotals(updated.items), { total: 15, thick: 0, thin: 15 });
});

test("old balances can be allocated to chosen numbers in parts without changing the total", async t => {
  const f = setup(t), legacy = seedLegacy(f);
  const partial = await request({ suffix: `/${legacy._id}`, method: "PUT", body: { code: 12, quantity: 4, version: 0 } });
  assert.equal(partial.status, 200); const first = await partial.json(); assert.equal(first.quantity, 4); assert.equal(first.items.find(row => row.isUnassigned).quantity, 6); assert.equal(f.records[0].quantity, 10);
  const remaining = await request({ suffix: `/${legacy._id}`, method: "PUT", body: { code: 13, quantity: 6, version: first.__v } });
  assert.equal(remaining.status, 200); const result = await remaining.json(); assert.equal(result.items.length, 2); assert.equal(result.items.some(row => row.isUnassigned), false); assert.equal(f.records[0].unassignedQuantity, 0); assert.equal(f.records[0].quantity, 10);
  assert.deepEqual(result.items.map(row => row.code).sort(), [12, 13]); assert.equal(sfifaStockTotals(result.items).total, 10);
  assert.equal((await request({ suffix: `/${legacy._id}`, method: "PUT", body: { code: 13, quantity: 6, version: first.__v } })).status, 409);
});

test("allocation validates availability, ranges and owner scope; zero legacy balances can receive a number", async t => {
  const f = setup(t), legacy = seedLegacy(f);
  for (const change of [{ quantity: 11 }, { code: 31 }, { quantity: 0 }]) assert.equal((await request({ suffix: `/${legacy._id}`, method: "PUT", body: { code: 12, quantity: 10, version: 0, ...change } })).status, 400);
  assert.equal((await request({ suffix: `/${legacy._id}`, method: "PUT", body: { code: 12, quantity: 10, version: 0 }, actor: stranger })).status, 404);
  assert.equal(f.records[0].quantity, 10); assert.equal(f.records[0].variants, undefined);
  const zero = new SfifaStock({ ...legacy.toObject(), _id: undefined, width: "thick", quantity: 0, receipts: [], __v: 0 }); f.records.push(zero);
  const result = await request({ suffix: `/${zero._id}`, method: "PUT", body: { code: 1, quantity: 0, version: 0 } }); assert.equal(result.status, 200); const value = await result.json(); assert.equal(value.code, 1); assert.equal(value.quantity, 0); assert.equal(value.items.length, 1); assert.equal(value.items[0].isUnassigned, false);
});

test("a number from another parent cannot be edited and the model checks the aggregate", async t => {
  const f = setup(t), first = await add(input({ code: 12 })), second = await add(input({ width: "thick", code: 12 }));
  assert.equal((await request({ suffix: `/${first.parentId}/variants/${second._id}`, method: "PUT", body: { quantity: 0, version: first.__v } })).status, 404);
  const corrupt = new SfifaStock(f.records[0].toObject()); corrupt.quantity = 99; await assert.rejects(corrupt.validate());
  const duplicate = new SfifaStock(f.records[0].toObject()); duplicate.variants.push({ code: 12, quantity: 0 }); await assert.rejects(duplicate.validate());
});

const variantPath = stock => `/${stock.parentId}/variants/${stock._id}`;
const restock = (stock, body, actor) => request({ suffix: variantPath(stock) + "/restock", body, ...(actor === undefined ? {} : { actor }) });
const remove = (stock, version = stock.__v, actor) => request({ suffix: stock.isUnassigned ? `/${stock.parentId}` : variantPath(stock), method: "DELETE", body: { version }, ...(actor === undefined ? {} : { actor }) });

test("each stock number has a stable full-ID barcode, including existing rows, and exact barcode filtering", async t => {
  setup(t); const first = await add(input({ code: 12 })), second = await add(input({ width: "thick", code: 12 }));
  assert.equal(first.barcode, "SF-" + first._id.toUpperCase()); assert.notEqual(first.barcode, second.barcode);
  assert.equal(normalizeSfifaBarcode("  " + first.barcode.toLowerCase() + "  "), first.barcode);
  for (const bad of [null, "bad", "SF-1234", "FS-" + first._id, first._id]) assert.equal(normalizeSfifaBarcode(bad), "");
  assert.equal(sfifaStockBarcode("bad"), "");
  const response = await restock(first, { quantity: 3, requestId: randomUUID() }); assert.equal(response.status, 201); const next = await response.json();
  assert.equal(next.barcode, first.barcode); assert.equal(next.quantity, 13);
  const rows = (await (await request()).json()).items;
  assert.equal(filterSfifaStock(rows, { barcode: first.barcode.toLowerCase() })[0]._id, first._id);
  assert.equal(filterSfifaStock(rows, { barcode: first.barcode.slice(0, -1) }).length, 0);
  assert.equal(filterSfifaStock(rows, { barcode: first.barcode, width: "thick" }).length, 0);
});

test("per-row restock uses its stored identity, adds exact meters and never trusts submitted type or number", async t => {
  const f = setup(t), first = await add(input({ code: 12, quantity: "0,1" })); await add(input({ code: 13, quantity: 7 }));
  const response = await restock(first, { quantity: "0,2", requestId: randomUUID(), code: 13, width: "thick", family: "8080-8097", idAdmin: otherOwner });
  assert.equal(response.status, 201); const value = await response.json(); assert.equal(value.code, 12); assert.equal(value.width, "thin"); assert.equal(value.quantity, 0.3);
  assert.equal(value.items.find(row => row.code === 13).quantity, 7); assert.equal(f.records[0].quantity, 7.3);
  assert.equal(f.records[0].receipts.at(-1).code, 12); assert.equal(String(f.records[0].receipts.at(-1).createdBy), owner);
});

test("per-row restock deduplicates retries and simultaneous clicks while summing independent deliveries", async t => {
  const f = setup(t), first = await add(input({ quantity: 10 })), body = { quantity: 3, requestId: randomUUID() };
  const repeated = await Promise.all([restock(first, body), restock(first, body)]); assert.deepEqual(repeated.map(row => row.status).sort(), [200, 201]);
  assert.equal(f.records[0].quantity, 13); assert.equal(f.records[0].receipts.length, 2);
  assert.equal((await restock(first, body)).status, 200); assert.equal((await restock(first, { ...body, quantity: 4 })).status, 409);
  const separate = await Promise.all([restock(first, { quantity: "0,1", requestId: randomUUID() }), restock(first, { quantity: "0,2", requestId: randomUUID() })]);
  assert.deepEqual(separate.map(row => row.status), [201, 201]); assert.equal(f.records[0].quantity, 13.3);
  const second = await add(input({ code: 2 })); assert.equal((await restock(second, body)).status, 409);
});

test("per-row restock checks current add permissions, ownership, limits and failed writes without changing stock", async t => {
  const f = setup(t), first = await add(input({ quantity: 1000000 })), body = { quantity: 1, requestId: randomUUID() };
  assert.equal((await restock(first, body)).status, 400);
  for (const quantity of [0, -1, "bad", "0.0001"]) assert.equal((await restock(first, { ...body, quantity })).status, 400);
  assert.equal((await restock(first, { ...body, requestId: "bad" })).status, 400);
  assert.equal((await restock(first, body, stranger)).status, 404); f.staff.action.add = false; assert.equal((await restock(first, body, staffClaims)).status, 403);
  const second = await add(input({ width: "thick" }));
  f.save.mock.mockImplementationOnce(async () => { throw new Error("private write failure"); });
  const failed = await restock(second, body); assert.equal(failed.status, 500); assert.deepEqual(await failed.json(), { message: "saveFailed" });
  assert.equal(f.records[1].quantity, 10); assert.equal(f.records[1].receipts.length, 1);
});

test("deleting one number removes its meters, retains sibling balances and receipt retries, and never leaves a phantom row", async t => {
  const f = setup(t), body = input({ code: 12, quantity: 3 }), first = await add(body), second = await add(input({ code: 13, quantity: 7 }));
  const stale = await remove(first); assert.equal(stale.status, 409); assert.equal(f.records[0].quantity, 10);
  const deleted = await remove(first, second.__v); assert.equal(deleted.status, 200); const value = await deleted.json();
  assert.equal(value.parentId, first.parentId); assert.equal(value.items.length, 1); assert.equal(value.items[0].code, 13); assert.equal(value.items[0].quantity, 7);
  assert.equal(f.records[0].quantity, 7); assert.equal(f.records[0].receipts.length, 2);
  assert.equal((await remove(first, second.__v)).status, 200); assert.equal(f.records[0].quantity, 7);
  const replay = await request({ body }); assert.equal(replay.status, 200); assert.equal(f.records[0].quantity, 7); assert.equal((await replay.json()).items.length, 1);
  assert.equal((await restock(first, { quantity: 3, requestId: randomUUID() })).status, 404);
  const sibling = value.items[0]; assert.equal((await remove(sibling)).status, 200);
  assert.deepEqual((await (await request()).json()).items, []); assert.equal(f.records[0].quantity, 0); assert.equal(f.records.length, 1);
  await f.records[0].validate();
  const recreated = await add(input({ code: 12, quantity: 2 })); assert.notEqual(recreated._id, first._id); assert.equal(recreated.quantity, 2);
});

test("delete validates permission, ownership and fresh balance; failed deletions preserve all data", async t => {
  const f = setup(t), first = await add();
  assert.equal((await remove(first, 0, stranger)).status, 404); f.staff.action.delete = false;
  assert.equal((await remove(first, 0, staffClaims)).status, 403); assert.equal((await (await request({ actor: staffClaims })).json()).permissions.delete, false);
  for (const version of [null, -1, true, "bad", 1]) assert.equal((await remove(first, version)).status, 409);
  f.save.mock.mockImplementationOnce(async () => { throw new Error("private delete failure"); });
  assert.equal((await remove(first)).status, 500); assert.equal(f.records[0].quantity, 10); assert.equal(f.records[0].variants.length, 1);
  const newMeters = await restock(first, { quantity: 3, requestId: randomUUID() }); assert.equal(newMeters.status, 201);
  assert.equal((await remove(first)).status, 409); assert.equal(f.records[0].quantity, 13);
});

test("unassigned legacy stock can be removed without deleting numbered balances or history", async t => {
  const f = setup(t), legacy = seedLegacy(f, 8); const added = await add(input({ code: 12, quantity: 3 }));
  const unassigned = added.items.find(row => row.isUnassigned), response = await remove(unassigned); assert.equal(response.status, 200);
  const value = await response.json(); assert.equal(value.items.length, 1); assert.equal(value.items[0].code, 12); assert.equal(f.records[0].quantity, 3); assert.equal(f.records[0].receipts.length, legacy.receipts.length + 1);
});

const history = (stock, actor) => request({ suffix: stock.isUnassigned ? `/${stock.parentId}/history` : variantPath(stock) + "/history", ...(actor === undefined ? {} : { actor }) });

test("history lists initial and later manual additions newest first, without counting balance corrections as deliveries", async t => {
  const f = setup(t), stock = await add(input({ code: 12, quantity: "0,1" }));
  await restock(stock, { quantity: "0,2", requestId: randomUUID(), date: "2000-01-01", workerName: "forged" });
  await add(input({ code: 13, quantity: 7 })); await add(input({ width: "thick", code: 12, quantity: 9 }));
  f.records[0].receipts[0].date = new Date("2026-10-21T10:00:00Z"); f.records[0].receipts[1].date = new Date("2026-10-22T14:30:00Z");
  const corrected = await request({ suffix: variantPath(stock), method: "PUT", body: { quantity: 2, version: f.records[0].__v } }); assert.equal(corrected.status, 200);
  const response = await history(stock); assert.equal(response.status, 200); const value = await response.json();
  assert.equal(value.entries.length, 2); assert.deepEqual(value.entries.map(row => row.quantity), [0.2, 0.1]);
  assert.equal(value.entries[0].date, "2026-10-22T14:30:00.000Z"); assert.ok(value.entries.every(row => row.source === "manual" && row.workerName === ""));
  assert.ok(value.entries.every(row => Object.keys(row).sort().join() === "date,quantity,source,workerName")); assert.equal(value.hasUnassignedHistory, false);
  const retry = f.records[0].receipts[1]; assert.equal((await restock(stock, { quantity: 0.2, requestId: retry.requestId })).status, 200);
  assert.equal((await (await history(stock)).json()).entries.length, 2);
});

test("read-only staff can view history, while shop ownership, active accounts and valid stock identities remain required", async t => {
  const f = setup(t), stock = await add(); f.staff.action = { add: false, update: false, delete: false };
  assert.equal((await history(stock, staffClaims)).status, 200); assert.equal((await history(stock, stranger)).status, 404); assert.equal((await history(stock, null)).status, 401);
  f.staff.isActive = false; assert.equal((await history(stock, staffClaims)).status, 403);
  for(const suffix of ["/bad/history", `/${stock.parentId}/variants/bad/history`, `/${stock.parentId}/variants/444444444444444444444444/history`, `/${stock.parentId}/history`]) assert.equal((await request({suffix})).status,404);
  f.accounts.delete(owner); assert.equal((await history(stock)).status, 403);
});

test("legacy receipts without numbers stay unassigned, with a note when a numbered history cannot include them", async t => {
  const f = setup(t), legacy = seedLegacy(f, 8), old = (await (await request()).json()).items[0];
  const before = await (await history(old)).json(); assert.equal(before.entries.length, 1); assert.equal(before.entries[0].quantity, 8); assert.equal(before.entries[0].source, "manual");
  const allocated = await request({ suffix: `/${legacy._id}`, method: "PUT", body: { code: 12, quantity: 3, version: 0 } }); assert.equal(allocated.status, 200);
  const row = await allocated.json(), value = await (await history(row)).json(); assert.deepEqual(value.entries, []); assert.equal(value.hasUnassignedHistory, true);
});

test("history resolves old worker names only within the owning shop and does not expose private receipt identities", async t => {
  const f = setup(t), stock = await add();
  const workerId = "444444444444444444444444", foreignId = "555555555555555555555555";
  f.workers.push({ _id: workerId, idAdmin: owner, name: "خديجة" }, { _id: foreignId, idAdmin: otherOwner, name: "private other shop worker" });
  f.records[0].receipts.push({ requestId: randomUUID(), code: 1, quantity: 3, workerId, date: new Date(), createdBy: owner });
  f.records[0].receipts.push({ requestId: randomUUID(), code: 1, quantity: 2, workerId: foreignId, date: new Date(), createdBy: owner });
  const entries = (await (await history(stock)).json()).entries;
  assert.equal(entries.filter(row => row.source === "worker").length, 2); assert.ok(entries.some(row => row.workerName === "خديجة")); assert.ok(entries.some(row => row.source === "worker" && row.workerName === ""));
  assert.equal(JSON.stringify(entries).includes("private"), false); assert.equal(JSON.stringify(entries).includes(workerId), false);
  assert.equal(JSON.stringify(entries).includes("requestId"), false);
});
