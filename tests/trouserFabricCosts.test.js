import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import { validateTailoringOrder } from "../shared/tailoring.js";
import { tailoringFabricCost, tailoringFabricCostsTotal } from "../shared/tailoringCosts.js";
import { djellabaFixture, owner, otherOwner, employee, garment } from "./helpers/djellabaCostsFixture.js";
const { default: app } = await import("../BackEnd/app.js");
const previousSecret = process.env.JWT_SECRET;
let server, base;
before(async () => { process.env.JWT_SECRET = "trouser-fabric-tests"; server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = "http://127.0.0.1:" + server.address().port + "/tailoring-orders"; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const trouser = patch => { const { sfifa: _sfifa, ...item } = garment({ trouserType: "regular", ...patch }); return item; };
const input = patch => ({ clientName: "زبون السراويل", phone: "0612345678", orderDate: "2026-10-27", readyDate: "2026-11-05", garmentType: "trousers", fabricCosting: true, paidAmount: 100, expenseAmount: 75, items: [trouser()], requestId: randomUUID(), ...patch });
const shopItem = (fabric, patch) => trouser({ fabricSource: "shop", fabricId: String(fabric._id), colorId: String(fabric.colors[0]._id), fabricUnitPrice: fabric.salePricePerMeter, ...patch });
const edit = (order, patch) => ({ ...validateTailoringOrder({ ...order, fabricCosting: true, items: order.items.map(item => ({ ...item, fabricUnitPrice: item.fabricCost?.fabricUnitPrice ?? 0 })) }), version: order.__v, ...patch });
async function request(method = "GET", suffix = "", body, { actor = { id: owner, role: "admin" }, multipart = false } = {}) {
  const headers = { Authorization: "Bearer " + jwt.sign(actor, process.env.JWT_SECRET) };
  let payload;
  if (body !== undefined) {
    if (multipart) { payload = new FormData(); for (const [key, value] of Object.entries(body)) payload.append(key, typeof value === "object" ? JSON.stringify(value) : String(value)); }
    else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  }
  return fetch(base + suffix, { method, headers, ...(payload ? { body: payload } : {}) });
}
async function create(body, options) { const response = await request("POST", "", body, options), saved = await response.json(); assert.equal(response.status, 201, JSON.stringify(saved)); return saved; }

test("fabric costs use exact centimes and validate metre precision", () => {
  assert.deepEqual(tailoringFabricCost({ fabricMeters: "2,125", fabricUnitPrice: "25.10" }), { fabricUnitPrice: 25.1, fabricAmount: 53.34 });
  assert.equal(tailoringFabricCost({ fabricMeters: "٠٫٠٠١", fabricUnitPrice: 5 }).fabricAmount, 0.01);
  assert.equal(tailoringFabricCostsTotal([{ fabricAmount: 0.1 }, { fabricAmount: 0.2 }]), 0.3);
  for (const costs of [undefined, [], [null], [{ fabricAmount: "" }]]) assert.equal(tailoringFabricCostsTotal(costs), null);
  for (const value of ["", 0, -1, "1.0001", "1e2", 1000001]) assert.equal(tailoringFabricCost({ fabricMeters: value, fabricUnitPrice: 25 }), null);
  assert.equal(tailoringFabricCost({ fabricMeters: 1000000, fabricUnitPrice: 1000000 }), null);
  for (const fabricMeters of ["", 0, "1.0001", {}]) assert.throws(() => validateTailoringOrder(input({ items: [trouser({ fabricMeters })] })), error => error.fields["items.0.fabricMeters"] === "invalidFabricMeters");
  assert.throws(() => validateTailoringOrder(input({ garmentType: "shirts" })), /invalidOrder/);
});

test("multiple trousers store metres and cloth costs while retaining the manually edited expenses", async t => {
  const f = djellabaFixture(t), fabric = f.seedFabric(), stock = JSON.stringify(fabric.colors);
  const saved = await create(input({ items: [shopItem(fabric, { fabricMeters: "2" }), shopItem(fabric, { fabricMeters: "1,5", trouserType: "qandrissi", price: 300 }), trouser({ fabricMeters: 3, fabricUnitPrice: 999, price: 200 })], expenseAmount: "112.50" }));
  assert.equal(saved.totalPrice, 1000); assert.equal(saved.expenseAmount, 112.5); assert.equal(saved.profitAmount, 887.5); assert.equal(saved.remainingAmount, 900);
  assert.deepEqual(saved.items.map(item => item.fabricMeters), [2, 1.5, 3]);
  assert.deepEqual(saved.items.map(item => item.fabricCost.fabricAmount), [50, 37.5, 0]);
  assert.equal(saved.items[2].fabricCost.fabricUnitPrice, 0); assert.equal(saved.items[1].trouserType, "qandrissi");
  assert.equal(saved.items[0].sfifa, undefined); assert.equal(saved.costing, undefined); assert.equal(saved.fabricCosting, undefined); assert.equal(JSON.stringify(fabric.colors), stock);
  const listed = (await (await request()).json()).orders[0]; assert.deepEqual(listed.items[0].fabricCost, saved.items[0].fabricCost); assert.equal(listed.expenseAmount, 112.5);
});

test("manual expenses can be lower than fabric cost, zero, or higher than the sale price", async t => {
  const f = djellabaFixture(t), fabric = f.seedFabric();
  for (const expenseAmount of [0, 10, 750]) { const saved = await create(input({ expenseAmount, items: [shopItem(fabric)] })); assert.equal(saved.expenseAmount, expenseAmount); assert.equal(saved.profitAmount, 500 - expenseAmount); assert.equal(saved.items[0].fabricCost.fabricAmount, 50); }
});

test("editing metres uses the saved price and keeps manual expenses after price changes or stock deletion", async t => {
  const f = djellabaFixture(t), fabric = f.seedFabric(); const saved = await create(input({ items: [shopItem(fabric)], expenseAmount: 80 }));
  fabric.salePricePerMeter = 99; f.fabrics.clear();
  const body = edit(saved); body.items[0].fabricMeters = 3;
  const response = await request("PUT", "/" + saved._id, body, { multipart: true }); assert.equal(response.status, 200, await response.clone().text()); const updated = await response.json();
  assert.equal(updated.items[0].fabricCost.fabricAmount, 75); assert.equal(updated.items[0].fabricCost.fabricUnitPrice, 25); assert.equal(updated.expenseAmount, 80); assert.equal(updated.profitAmount, 420); assert.equal(updated.barcode, saved.barcode);
  const changed = await request("PUT", "/" + saved._id, edit(updated, { expenseAmount: "95.25" })); assert.equal(changed.status, 200); assert.equal((await changed.json()).expenseAmount, 95.25);
  assert.equal((await request("PUT", "/" + saved._id, body)).status, 409);
});

test("unpriced, stale, foreign fabrics and invalid amounts fail without creating an order", async t => {
  const f = djellabaFixture(t), fabric = f.seedFabric(), body = input({ items: [shopItem(fabric)] });
  fabric.salePricePerMeter = 30; let response = await request("POST", "", body); assert.equal(response.status, 409); assert.equal((await response.json()).message, "fabricPriceChanged");
  fabric.salePricePerMeter = undefined; response = await request("POST", "", body); assert.equal(response.status, 409); assert.equal((await response.json()).message, "fabricPriceMissing");
  const foreign = f.seedFabric(25, otherOwner); assert.equal((await request("POST", "", input({ items: [shopItem(foreign)] }))).status, 404);
  for (const expenseAmount of ["", -1, "1.001"]) assert.equal((await request("POST", "", input({ expenseAmount }))).status, 400);
  assert.equal(f.orders.size, 0);
});

test("retrying a committed request returns the saved manual expense and cloth snapshot", async t => {
  const f = djellabaFixture(t), fabric = f.seedFabric(), body = input({ items: [shopItem(fabric)] }); const saved = await create(body);
  f.fabrics.clear(); const response = await request("POST", "", body); assert.equal(response.status, 200); const repeated = await response.json(); assert.equal(repeated._id, saved._id); assert.equal(repeated.expenseAmount, 75); assert.equal(f.orders.size, 1);
  assert.equal((await request("POST", "", { ...body, expenseAmount: 76 })).status, 409);
});

test("old trousers stay editable without inventing metres or dropping existing snapshots", async t => {
  const f = djellabaFixture(t); const body = input(); delete body.fabricCosting; delete body.items[0].fabricMeters; delete body.items[0].fabricUnitPrice;
  const legacy = await create(body); assert.equal(legacy.items[0].fabricMeters, undefined); assert.equal(legacy.items[0].fabricCost, undefined); assert.equal(legacy.expenseAmount, 75);
  let response = await request("PUT", "/" + legacy._id, { ...legacy, version: legacy.__v, expenseAmount: 90 }); assert.equal(response.status, 200); assert.equal((await response.json()).expenseAmount, 90);
  const saved = await create(input()); const oldClientEdit = { ...saved, version: saved.__v, expenseAmount: 100 };
  delete oldClientEdit.items[0].fabricCost; delete oldClientEdit.items[0].fabricMeters;
  response = await request("PUT", "/" + saved._id, oldClientEdit); assert.equal(response.status, 200); const kept = await response.json(); assert.equal(kept.items[0].fabricMeters, 2); assert.equal(kept.items[0].fabricCost.fabricAmount, 0); assert.equal(f.orders.size, 2);
});

test("payments, delivery and employee permissions preserve manual expenses and trusted fabric snapshots", async t => {
  const f = djellabaFixture(t); const saved = await create(input(), { actor: { id: employee, role: "Employe", idAdmin: otherOwner } });
  assert.equal(saved.idAdmin, owner); assert.equal(saved.createdBy, employee);
  let response = await request("POST", "/" + saved._id + "/payments", { amount: 25, requestId: randomUUID(), version: 0 }); assert.equal(response.status, 200); const paid = await response.json(); assert.equal(paid.expenseAmount, 75); assert.equal(paid.remainingAmount, 375);
  response = await request("POST", "/" + saved._id + "/deliver", { version: paid.__v }); assert.equal(response.status, 200); const delivered = await response.json(); assert.ok(delivered.deliveredAt); assert.equal(delivered.expenseAmount, 75); assert.equal(delivered.items[0].fabricMeters, 2);
  const stored = f.orders.get(saved._id).toObject(); stored.items[0].fabricCost.fabricAmount = 99; await assert.rejects(new TailoringOrder(stored).validate());
  f.staff.action.add = false; assert.equal((await request("POST", "", input(), { actor: { id: employee, role: "Employe" } })).status, 403);
});
