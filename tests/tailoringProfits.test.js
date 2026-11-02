import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import { createTailoringDeliveryFinancials, tailoringDeliveryAmounts, tailoringProfitEntries, summarizeTailoringProfits, filterTailoringProfits, groupTailoringProfits, tailoringProfitPeriodKey } from "../shared/tailoringProfits.js";
import { validateTailoringOrder } from "../shared/tailoring.js";
import { djellabaFixture, owner, otherOwner, employee, garment, orderInput } from "./helpers/djellabaCostsFixture.js";
const { default: app } = await import("../BackEnd/app.js");
const previousSecret = process.env.JWT_SECRET;
let server, base;
before(async () => { process.env.JWT_SECRET = "tailoring-profit-tests"; server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = "http://127.0.0.1:" + server.address().port + "/tailoring-orders"; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
async function request(method = "GET", suffix = "", body, actor = { id: owner, role: "admin" }) {
  return fetch(base + suffix, { method, headers: { Authorization: "Bearer " + jwt.sign(actor, process.env.JWT_SECRET), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function create(body, actor) { const response = await request("POST", "", body, actor), value = await response.json(); assert.equal(response.status, 201, JSON.stringify(value)); return value; }
async function deliver(order, patch = {}) { const response = await request("POST", "/" + order._id + "/deliver", { version: order.__v, ...patch }), value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value; }
const manualInput = (type = "trousers", patch = {}) => {
  const result = orderInput({ garmentType: type, expenseAmount: 75, items: [garment({ trouserType: "regular", shirtType: "قميص عادي" })], ...patch }); delete result.automaticCosting; delete result.costSettingsVersion; return result;
};
const row = (id, patch) => ({ _id: id.repeat(24), clientName: "زبون " + id, phone: "0612345678", garmentType: "trousers", deliveredAt: "2026-10-27T10:00:00Z", totalPrice: 100, expenseAmount: 30, items: [{ lineId: "abcdefabcdefabcdefabcdef", price: 100, fabricType: "قطن" }], ...patch });

test("profit is recognized only for delivered orders and remains separated by garment section", () => {
  const rows = [row("1"), row("2", { deliveredAt: null }), row("3", { garmentType: "djellaba" }), row("4", { garmentType: "shirts" })];
  assert.equal(tailoringProfitEntries(rows, "trousers").length, 1); assert.equal(tailoringProfitEntries(rows, "djellaba").length, 1); assert.equal(tailoringProfitEntries(rows, "shirts").length, 1);
  assert.deepEqual(createTailoringDeliveryFinancials(rows[0]), { revenueAmount: 100, expenseAmount: 30, garmentCount: 1 });
  assert.equal(tailoringDeliveryAmounts(row("1", { deliveredAt: "bad date" })), null);
  assert.equal(tailoringDeliveryAmounts(row("1", { deliveredAt: null, deliveryFinancials: { revenueAmount: 100, expenseAmount: 0, garmentCount: 1 } })), null);
});

test("summaries use exact centimes, preserve losses and keep unknown legacy expenses out of profit", () => {
  const entries = tailoringProfitEntries([row("1", { totalPrice: 0.1, expenseAmount: 0 }), row("2", { totalPrice: 0.2, expenseAmount: 0.4 }), row("3", { totalPrice: 100, expenseAmount: undefined })], "trousers");
  assert.deepEqual(summarizeTailoringProfits(entries), { revenueAmount: 100.3, expenseAmount: 0.4, profitAmount: -0.1, orderCount: 3, garmentCount: 3, unknownCount: 1 });
  const unknown = summarizeTailoringProfits([entries.find(entry => entry.orderId === "3".repeat(24))]); assert.equal(unknown.profitAmount, null); assert.equal(unknown.expenseAmount, null);
  assert.equal(summarizeTailoringProfits([]).profitAmount, 0);
});

test("daily, monthly and yearly history uses delivery dates and supports barcode and client search", () => {
  const rows = [row("1", { deliveredAt: "2026-10-27T10:00:00Z", orderDate: "2025-01-01" }), row("2", { deliveredAt: "2026-10-01T10:00:00Z" }), row("3", { deliveredAt: "2026-09-30T10:00:00Z" }), row("4", { deliveredAt: "2025-12-31T10:00:00Z" })];
  const entries = tailoringProfitEntries(rows, "trousers"), options = { timeZone: "UTC" };
  assert.equal(filterTailoringProfits(entries, { ...options, mode: "day", period: "2026-10-27" }).length, 1);
  assert.equal(filterTailoringProfits(entries, { ...options, mode: "month", period: "2026-10" }).length, 2);
  assert.equal(filterTailoringProfits(entries, { ...options, mode: "year", period: "2026" }).length, 3);
  assert.equal(filterTailoringProfits(entries, { mode: "all" }).length, 4);
  assert.equal(filterTailoringProfits(entries, { mode: "all", search: entries[0].barcode }).length, 1);
  assert.equal(filterTailoringProfits(entries, { mode: "all", search: "زبون 2" }).length, 1);
  for (const [mode, period] of [["day", "2026-02-30"], ["month", "2026-13"], ["year", "26"], ["other", "2026"]]) assert.equal(filterTailoringProfits(entries, { mode, period }).length, 0);
  const groups = groupTailoringProfits(filterTailoringProfits(entries, { ...options, mode: "year", period: "2026" }), "year", "UTC"); assert.deepEqual(groups.map(group => [group.key, group.orderCount]), [["2026-10", 2], ["2026-09", 1]]);
  assert.deepEqual(groupTailoringProfits(entries, "all", "UTC").map(group => group.key), ["2026", "2025"]);
  assert.equal(tailoringProfitPeriodKey("2026-12-31T23:30:00Z", "day", "Europe/Paris"), "2027-01-01");
  assert.equal(tailoringProfitPeriodKey("2026-12-31T23:30:00Z", "day", "UTC"), "2026-12-31");
});

test("delivery atomically records server-side amounts and ignores forged profit figures", async t => {
  const f = djellabaFixture(t); f.seedSettings(); const pending = await create(orderInput({ deliveryFinancials: { revenueAmount: 1, expenseAmount: 0, garmentCount: 99 }, deliveredAt: "1900-01-01" }));
  assert.equal(pending.deliveryFinancials, undefined); assert.equal(tailoringProfitEntries((await (await request()).json()).orders, "djellaba").length, 0);
  const completed = await deliver(pending, { deliveryFinancials: { revenueAmount: 999, expenseAmount: 0 }, deliveredAt: "1900-01-01" });
  assert.deepEqual(completed.deliveryFinancials, { revenueAmount: 500, expenseAmount: 40, garmentCount: 1 });
  assert.equal(tailoringDeliveryAmounts(completed).profitAmount, 460); assert.equal(completed.paidAmount, 100); assert.equal(completed.remainingAmount, 400); assert.equal(f.orderSave.mock.callCount(), 1);
  const repeated = await deliver(pending); assert.equal(repeated.deliveredAt, completed.deliveredAt); assert.deepEqual(repeated.deliveryFinancials, completed.deliveryFinancials); assert.equal(f.orderSave.mock.callCount(), 1);
  const listed = (await (await request()).json()).orders; assert.equal(summarizeTailoringProfits(tailoringProfitEntries(listed, "djellaba")).profitAmount, 460);
});

test("later payments do not increase profit, duplicate delivery or move the historical date", async t => {
  djellabaFixture(t); const saved = await create(manualInput("shirts")); const completed = await deliver(saved);
  const response = await request("POST", "/" + saved._id + "/payments", { amount: 200, requestId: randomUUID(), version: completed.__v }); assert.equal(response.status, 200); const paid = await response.json();
  assert.equal(paid.paidAmount, 300); assert.equal(paid.deliveredAt, completed.deliveredAt); assert.deepEqual(paid.deliveryFinancials, completed.deliveryFinancials);
  assert.equal(summarizeTailoringProfits(tailoringProfitEntries([paid], "shirts")).profitAmount, 425);
});

test("changes after delivery cannot rewrite the recognized price, expense or garment count", async t => {
  const f = djellabaFixture(t); const saved = await create(manualInput()); const completed = await deliver(saved);
  const response = await request("PUT", "/" + completed._id, { ...validateTailoringOrder(completed), version: completed.__v, expenseAmount: 200, items: completed.items.map(item => ({ ...item, price: 700 })), deliveryFinancials: { revenueAmount: 9999, expenseAmount: 0, garmentCount: 99 } });
  assert.equal(response.status, 200); const changed = await response.json(); assert.equal(changed.totalPrice, 700); assert.equal(changed.expenseAmount, 200);
  assert.deepEqual(changed.deliveryFinancials, { revenueAmount: 500, expenseAmount: 75, garmentCount: 1 }); assert.equal(tailoringDeliveryAmounts(changed).profitAmount, 425);
  assert.deepEqual(f.orders.get(saved._id).deliveryFinancials.toObject(), completed.deliveryFinancials);
});

test("legacy deliveries retain their recorded costs and freeze prior figures before an edit", async t => {
  const f = djellabaFixture(t); const original = await create(manualInput()); const document = f.orders.get(original._id); document.deliveredAt = new Date("2025-04-03T11:00:00Z");
  let listed = (await (await request()).json()).orders[0]; assert.equal(listed.deliveryFinancials, undefined); assert.equal(tailoringDeliveryAmounts(listed).profitAmount, 425);
  const response = await request("PUT", "/" + original._id, { ...validateTailoringOrder(original), version: original.__v, expenseAmount: 125 }); assert.equal(response.status, 200); listed = await response.json();
  assert.deepEqual(listed.deliveryFinancials, { revenueAmount: 500, expenseAmount: 75, garmentCount: 1 }); assert.equal(tailoringDeliveryAmounts(listed).profitAmount, 425); assert.equal(listed.expenseAmount, 125); assert.equal(listed.deliveredAt, "2025-04-03T11:00:00.000Z");
  const oldBody = orderInput(); delete oldBody.automaticCosting; delete oldBody.costSettingsVersion; const old = await create(oldBody); const delivered = await deliver(old); assert.equal(delivered.deliveryFinancials.expenseAmount, null); assert.equal(tailoringDeliveryAmounts(delivered).profitAmount, null);
  f.seedSettings();
  const priced = await request("PUT", "/" + old._id, { ...orderInput({ items: delivered.items.map(item => ({ ...item, fabricMeters: 2, fabricUnitPrice: 0 })) }), version: delivered.__v }); assert.equal(priced.status, 200); const restored = await priced.json(); assert.equal(restored.deliveryFinancials.expenseAmount, 40); assert.equal(restored.deliveryFinancials.revenueAmount, 500); assert.equal(restored.deliveredAt, delivered.deliveredAt); assert.equal(tailoringDeliveryAmounts(restored).profitAmount, 460);
});

test("shop isolation, live employee permissions, failed and stale delivery writes preserve the ledger", async t => {
  const f = djellabaFixture(t), staff = { id: employee, role: "Employe", idAdmin: otherOwner };
  const original = await create(manualInput("trousers", { items: [garment({ trouserType: "regular" }), garment({ trouserType: "qandrissi", price: 100 })] }), staff);
  assert.equal((await request("POST", "/" + original._id + "/deliver", { version: 0 }, { id: otherOwner, role: "admin" })).status, 404);
  f.staff.action.update = false; assert.equal((await request("POST", "/" + original._id + "/deliver", { version: 0 }, staff)).status, 403); f.staff.action.update = true;
  f.faults.orderSave = true; assert.equal((await request("POST", "/" + original._id + "/deliver", { version: 0 }, staff)).status, 500); assert.equal(f.orders.get(original._id).deliveryFinancials, undefined); assert.equal(f.orders.get(original._id).deliveredAt, null);
  f.faults.orderSave = false; assert.equal((await request("POST", "/" + original._id + "/deliver", { version: 99 }, staff)).status, 409);
  const completed = await deliver(original); assert.equal(completed.deliveryFinancials.garmentCount, 2); assert.equal(tailoringDeliveryAmounts(completed).profitAmount, 525);
  const other = (await (await request("GET", "", undefined, { id: otherOwner, role: "admin" })).json()).orders; assert.equal(other.length, 0);
});

test("model validation rejects incomplete snapshots and profit recognition before delivery", async t => {
  const f = djellabaFixture(t); const original = await create(manualInput()), data = f.orders.get(original._id).toObject();
  for (const snapshot of [{ revenueAmount: -1, expenseAmount: 0, garmentCount: 1 }, { revenueAmount: 500, expenseAmount: "1.001", garmentCount: 1 }, { revenueAmount: 500, expenseAmount: 0, garmentCount: 0 }]) await assert.rejects(new TailoringOrder({ ...data, deliveredAt: new Date(), deliveryFinancials: snapshot }).validate());
  await assert.rejects(new TailoringOrder({ ...data, deliveryFinancials: { revenueAmount: 500, expenseAmount: 75, garmentCount: 1 } }).validate());
});


test("all-section profits combine delivered garments once, preserve snapshots and losses, and exclude unknown costs", () => {
  const rows = [
    row("1", { garmentType: undefined, totalPrice: 100, expenseAmount: 20 }),
    row("2", { totalPrice: 200, expenseAmount: 50 }),
    row("3", { garmentType: "shirts", totalPrice: 100, expenseAmount: 120 }),
    row("4", { deliveredAt: null }),
    row("5", { garmentType: "unsupported" }),
    row("6", { garmentType: "shirts", totalPrice: 75, expenseAmount: undefined }),
    row("7", { garmentType: "djellaba", totalPrice: 999, expenseAmount: 0, deliveryFinancials: { revenueAmount: 100, expenseAmount: 10, garmentCount: 2 }, deliveredAt: "2025-12-15T12:00:00Z" }),
  ];
  const entries = tailoringProfitEntries(rows, "all");
  assert.deepEqual(summarizeTailoringProfits(entries), { revenueAmount: 575, expenseAmount: 200, profitAmount: 300, orderCount: 5, garmentCount: 6, unknownCount: 1 });
  assert.deepEqual(["djellaba", "trousers", "shirts"].map(type => summarizeTailoringProfits(tailoringProfitEntries(rows, type)).profitAmount), [170, 150, -20]);
  const currentYear = filterTailoringProfits(entries, { mode: "year", period: "2026", timeZone: "UTC" });
  assert.equal(summarizeTailoringProfits(currentYear).profitAmount, 210);
  assert.deepEqual(groupTailoringProfits(entries, "all", "UTC").map(group => [group.key, group.profitAmount]), [["2026", 210], ["2025", 90]]);
  assert.equal(summarizeTailoringProfits(filterTailoringProfits(entries, { mode: "all", search: entries[0].barcode })).orderCount, 1);
});
