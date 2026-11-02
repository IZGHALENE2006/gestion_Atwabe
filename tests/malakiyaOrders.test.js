import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import { validateTailoringOrder } from "../shared/tailoring.js";
import { malakiyaFixture } from "./helpers/malakiyaFixture.js";
import { jabadorWorkerFixture as malakiyaWorkerFixture } from "./helpers/jabadorFixture.js";
import { tailoringProfitEntries, summarizeTailoringProfits, filterTailoringProfits, groupTailoringProfits, tailoringProfitPeriodKey } from "../shared/tailoringProfits.js";
import { owner, otherOwner, employee, garment, orderInput } from "./helpers/djellabaCostsFixture.js";
const previousDirectory = process.env.TAILORING_PHOTOS_DIRECTORY, previousSecret = process.env.JWT_SECRET;
const directory = await mkdtemp(path.join(tmpdir(), "malakiya-photos-")); process.env.TAILORING_PHOTOS_DIRECTORY = directory;
const { default: app } = await import("../BackEnd/app.js");
let server, base;
before(async () => { process.env.JWT_SECRET = "djellaba-costs-tests"; server = app.listen(0,"127.0.0.1"); await new Promise(resolve => server.once("listening",resolve)); base = "http://127.0.0.1:" + server.address().port + "/tailoring-orders"; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; if (previousDirectory === undefined) delete process.env.TAILORING_PHOTOS_DIRECTORY; else process.env.TAILORING_PHOTOS_DIRECTORY = previousDirectory; });
const admin = { id: owner, role: "admin" }, stranger = { id: otherOwner, role: "admin" }, staffClaims = { id: employee, role: "Employe", idAdmin: otherOwner, action: { update: true } };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=","base64");
async function request(method = "GET", suffix = "", body, { actor = admin, images } = {}) {
  const headers = actor ? { Authorization: "Bearer " + jwt.sign(actor,process.env.JWT_SECRET) } : {};
  let payload;
  if (body !== undefined) {
    if (images) { payload = new FormData(); for (const [key,value] of Object.entries(body)) payload.append(key, typeof value === "object" ? JSON.stringify(value) : String(value)); for (const bytes of images) payload.append("images",new Blob([bytes],{type:"image/png"}),"cloth.png"); }
    else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  }
  return fetch(base + suffix,{ method,headers,...(payload ? {body:payload}: {}) });
}
async function create(body, options) { const response = await request("POST","",body,options); const value = await response.json(); assert.equal(response.status,201,JSON.stringify(value)); return value; }
const shopItem = (fabric,patch) => garment({ fabricSource:"shop", fabricId:String(fabric._id), colorId:String(fabric.colors[0]._id), fabricUnitPrice:fabric.salePricePerMeter, fabricType:"FORGED",...patch });
const editBody = (order,patch) => ({ ...order, automaticCosting:true, costSettingsVersion:order.costing?.settingsVersion ?? 0, version:order.__v, items:order.items.map(item=>({...item,fabricUnitPrice:item.costs?.fabricUnitPrice ?? 0})), ...patch });

const malakiyaInput = patch => orderInput({ garmentType: "malakiya", ...patch });
const settingsPath = "/cost-settings?garment=malakiya";

test("malakiya prices start unconfigured and remain independent from djellaba prices", async t => {
  const f = malakiyaFixture(t); f.seedSettings(); f.seedJabadorSettings({ thinSfifaPrice: 7, thickSfifaPrice: 17, laborPrice: 27 });
  assert.equal((await (await request("GET", settingsPath)).json()).configured, false);
  const rates = { thinSfifaPrice: 15, thickSfifaPrice: 25, laborPrice: 40 };
  const response = await request("PUT", settingsPath, { rates, version: null });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).rates, rates);
  assert.equal(f.malakiyaSettings.get(owner).laborPrice, 40);
  assert.equal((await (await request("GET", "/cost-settings?garment=jabador")).json()).rates.laborPrice, 27);
  assert.equal((await (await request("GET", "/cost-settings")).json()).rates.laborPrice, 30);
  assert.equal((await (await request("GET", settingsPath, undefined, { actor: stranger })).json()).configured, false);
  f.staff.action.update = false;
  assert.equal((await request("PUT", settingsPath, { rates, version: 0 }, { actor: staffClaims })).status, 403);
  assert.equal((await request("PUT", settingsPath, { rates: { ...rates, laborPrice: 50 }, version: 9 })).status, 409);
  assert.equal((await request("GET", "/cost-settings?garment=shirts")).status, 400);
});

test("malakiya orders require sfifa and fabric metres just like djellabas", () => {
  assert.equal(validateTailoringOrder(malakiyaInput()).garmentType, "malakiya");
  for (const patch of [{ sfifa: undefined }, { sfifa: { width: "other", style: "fabric" } }, { fabricMeters: 0 }, { fabricMeters: "1.0001" }]) {
    assert.throws(() => validateTailoringOrder(malakiyaInput({ items: [garment(patch)] })), { message: "invalidOrder" });
  }
  assert.throws(() => validateTailoringOrder(malakiyaInput({ garmentType: "unknown" })), { message: "invalidOrder" });
});

test("multiple malakiyas preserve photos, barcodes and shop/client fabrics with trusted expenses", async t => {
  const f = malakiyaFixture(t); f.seedSettings(); f.seedMalakiyaSettings();
  const fabric = f.seedFabric(25);
  const body = malakiyaInput({ items: [shopItem(fabric, { fabricMeters: 2, imageIndex: 0 }), garment({ fabricMeters: 3, imageIndex: 1, sfifa: { width: "thick", style: "twoTone", color1: "أزرق", color2: "أبيض" } })], expenseAmount: 0, profitAmount: 99999 });
  const saved = await create(body, { images: [png, png] });
  assert.equal(saved.garmentType, "malakiya"); assert.equal(saved.totalPrice, 1000);
  assert.equal(saved.expenseAmount, 170); assert.equal(saved.profitAmount, 830);
  assert.deepEqual(saved.items.map(item => item.costs.totalAmount), [105, 65]);
  assert.deepEqual(saved.items.map(item => item.costs.fabricAmount), [50, 0]);
  assert.equal(saved.items[0].fabricType, fabric.type);
  assert.ok(saved.barcode); assert.ok(saved.items.every(item => item.hasPhoto));
  const photo = await request("GET", "/" + saved._id + "/items/" + saved.items[1].lineId + "/photo");
  assert.equal(photo.status, 200); assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);
  const list = await (await request()).json(); assert.equal(list.orders[0].expenseAmount, 170);
  assert.equal(list.orders[0].items.length, 2); assert.equal(list.orders[0].barcode, saved.barcode);
  const djellaba = await create(orderInput()); assert.equal(djellaba.expenseAmount, 40);
});

test("missing or stale malakiya prices fail without borrowing the djellaba settings", async t => {
  const f = malakiyaFixture(t); f.seedSettings();
  assert.equal((await request("POST", "", malakiyaInput())).status, 409); assert.equal(f.orders.size, 0);
  const rates = f.seedMalakiyaSettings(); rates.__v = 2;
  const response = await request("POST", "", malakiyaInput());
  assert.equal(response.status, 409); assert.equal((await response.json()).message, "costSettingsChanged");
  assert.equal(f.orders.size, 0);
});

test("edits and retries keep malakiya rates and cannot move an order to another section", async t => {
  const f = malakiyaFixture(t); f.seedMalakiyaSettings(); const fabric = f.seedFabric();
  const body = malakiyaInput({ items: [shopItem(fabric)] }), saved = await create(body);
  const rates = f.malakiyaSettings.get(owner); rates.thinSfifaPrice = 150; rates.laborPrice = 400; rates.__v++;
  fabric.salePricePerMeter = 250;
  let response = await request("POST", "", body); assert.equal(response.status, 200); assert.equal((await response.json()).expenseAmount, 105);
  response = await request("PUT", "/" + saved._id, editBody(saved, { items: saved.items.map(item => ({ ...item, fabricMeters: 3, fabricUnitPrice: 25 })) }));
  assert.equal(response.status, 200); const edited = await response.json(); assert.equal(edited.expenseAmount, 130); assert.equal(edited.barcode, saved.barcode);
  assert.equal(edited.items[0].lineId, saved.items[0].lineId); assert.equal(edited.costing.rates.laborPrice, 40);
  response = await request("PUT", "/" + saved._id, editBody(edited, { garmentType: "djellaba" }));
  assert.equal(response.status, 400); assert.equal((await response.json()).fields.garmentType, "garmentTypeLocked");
});

test("malakiya profit enters its register and the total only on delivery, once per order", async t => {
  const f = malakiyaFixture(t); f.seedMalakiyaSettings(); f.seedSettings();
  let order = await create(malakiyaInput());
  const djellaba = await create(orderInput());
  assert.equal(tailoringProfitEntries([order], "malakiya").length, 0);
  let response = await request("POST", "/" + order._id + "/payments", { amount: 50, requestId: randomUUID(), version: order.__v });
  assert.equal(response.status, 200); order = await response.json(); assert.equal(order.paidAmount, 150);
  response = await request("POST", "/" + order._id + "/deliver", { version: order.__v });
  assert.equal(response.status, 200); const delivered = await response.json();
  assert.deepEqual(delivered.deliveryFinancials, { revenueAmount: 500, expenseAmount: 55, garmentCount: 1 });
  assert.equal((await request("POST", "/" + order._id + "/deliver", { version: order.__v })).status, 200);
  const rows = (await (await request()).json()).orders;
  assert.equal(summarizeTailoringProfits(tailoringProfitEntries(rows, "malakiya")).profitAmount, 445);
  assert.equal(summarizeTailoringProfits(tailoringProfitEntries(rows, "all")).profitAmount, 445);
  assert.equal(tailoringProfitEntries(rows, "djellaba").length, 0);
  const day = tailoringProfitPeriodKey(delivered.deliveredAt), entries = tailoringProfitEntries(rows, "malakiya");
  for (const mode of ["day", "month", "year"]) assert.equal(filterTailoringProfits(entries, { mode, period: day.slice(0, mode === "day" ? 10 : mode === "month" ? 7 : 4) }).length, 1);
  assert.equal(groupTailoringProfits(entries, "year").length, 1);
  assert.equal(filterTailoringProfits(entries, { mode: "all", search: delivered.barcode }).length, 1);
  response = await request("PUT", "/" + order._id, editBody(delivered, { items: delivered.items.map(item => ({ ...item, price: 600, fabricUnitPrice: item.costs.fabricUnitPrice })) }));
  assert.equal(response.status, 200); const changed = await response.json();
  assert.equal(changed.totalPrice, 600); assert.equal(tailoringProfitEntries([changed], "malakiya")[0].profitAmount, 445);
  assert.equal(tailoringProfitEntries([djellaba], "all").length, 0);
});

test("malakiya creation, settings and updates keep current employee and shop permissions", async t => {
  const f = malakiyaFixture(t); f.seedMalakiyaSettings();
  const saved = await create(malakiyaInput(), { actor: staffClaims }); assert.equal(saved.createdBy, employee);
  assert.equal((await request("PUT", "/" + saved._id, editBody(saved), { actor: stranger })).status, 404);
  assert.equal((await (await request("GET", "", undefined, { actor: stranger })).json()).orders.length, 0);
  f.staff.action.update = false;
  assert.equal((await request("PUT", "/" + saved._id, editBody(saved), { actor: staffClaims })).status, 403);
  f.staff.action.add = false;
  assert.equal((await request("POST", "", malakiyaInput(), { actor: staffClaims })).status, 403);
});

test("workers accept malakiyas, keep their section and block another stage until completion", async t => {
  const f = malakiyaWorkerFixture(t);
  const malakiya = f.seedOrder(owner, { garmentType: "malakiya" });
  f.seedOrder(owner, { garmentType: "shirts", shirtType: "قميص", expenseAmount: 50 });
  const workerUrl = base.replace("/tailoring-orders", "/tailoring-workers/") + f.worker._id + "/work";
  const workerRequest = (method, suffix, body) => fetch(workerUrl + suffix, { method, headers: { Authorization: "Bearer " + jwt.sign(admin, process.env.JWT_SECRET), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const options = await (await workerRequest("GET", "/orders?category=machine")).json();
  assert.equal(options.orders.length, 1); assert.equal(options.orders[0].garmentType, "malakiya");
  const body = { category: "machine", workType: "client", orderId: String(malakiya._id), lineIds: malakiya.items.map(item => item.lineId), requestId: randomUUID() };
  let response = await workerRequest("POST", "", body); assert.equal(response.status, 201); const assigned = await response.json();
  assert.equal(assigned.tailoring.garmentType, "malakiya"); assert.equal(assigned.quantity, 2);
  response = await workerRequest("POST", "", { ...body, category: "finishing", requestId: randomUUID() });
  assert.equal(response.status, 409); assert.equal((await response.json()).message, "garmentInProgress");
  response = await workerRequest("POST", "/" + assigned._id + "/completions", { quantity: 2, version: assigned.__v, requestId: randomUUID() }); assert.equal(response.status, 201);
  assert.equal((await workerRequest("POST", "", { ...body, category: "finishing", requestId: randomUUID() })).status, 201);
});


