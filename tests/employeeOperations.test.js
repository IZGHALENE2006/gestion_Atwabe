import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import Employee from "../BackEnd/models/EmployeModele.js";
import Fabric from "../BackEnd/models/Fabric.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import { generateFabricBarcode } from "../shared/fabrics.js";
import { EMPLOYEE_MODULES, EMPLOYEE_OPERATIONS, canEmployeeOperation, employeePermissionValue, employeeCanRequest, validateEmployeePermissions, canOpenEmployeePage } from "../shared/employeePermissions.js";
import { creditCheckoutFixture, owner, employeeId, otherOwner, productIds } from "./helpers/creditCheckoutFixture.js";
import { workerMaterialsFixture } from "./helpers/workerMaterialsFixture.js";
import { employee as workerStaffId } from "./helpers/djellabaCostsFixture.js";

process.env.JWT_SECRET = "isolated-granular-operations";
const { default: app } = await import("../BackEnd/app.js");
let server, base;
before(async () => { server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.closeAllConnections(); server.close(); });
const permission = (module, operations) => ({ moduleAccess: [module], action: { add: true, update: true, delete: true }, operationPermissions: { [module]: operations } });
const request = async (path, body, method = body === undefined ? "GET" : "POST", actor = { id: employeeId, role: "Employe", idAdmin: otherOwner, operationPermissions: Object.fromEntries(EMPLOYEE_MODULES.map(module => [module, EMPLOYEE_OPERATIONS[module]])) }) => {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
};
const admin = { id: owner, role: "admin" }, workerStaff = { id: workerStaffId, role: "Employe" };
const writes = [
  ["workers", "advance", "POST", "/tailoring-workers/id/payments", { type: "advance" }],
  ["products", "add", "POST", "/Product/Add"], ["products", "update", "PUT", "/Product/Update/id"], ["products", "delete", "DELETE", "/Product/Delete/id"], ["products", "restock", "POST", "/Product/id/restocks"],
  ["categories", "add", "POST", "/Category/Add"], ["categories", "update", "PATCH", "/Category/Update/id"], ["categories", "delete", "DELETE", "/Category/Delete/id"],
  ["credit", "add", "POST", "/usercridite/add"], ["credit", "addDebt", "POST", "/usercridite/add-product/id"], ["credit", "payment", "POST", "/usercridite/add-payment/id"], ["credit", "deleteDebt", "DELETE", "/usercridite/DeleteProduct/id/line"], ["credit", "delete", "DELETE", "/usercridite/Delete/id"],
  ["tailoring", "add", "POST", "/tailoring-orders"], ["tailoring", "update", "PUT", "/tailoring-orders/id"], ["tailoring", "payment", "POST", "/tailoring-orders/id/payments"], ["tailoring", "deliver", "POST", "/tailoring-orders/id/deliver"], ["tailoring", "cancel", "POST", "/tailoring-orders/id/cancel"], ["tailoring", "settings", "PUT", "/tailoring-orders/cost-settings"],
  ["workers", "add", "POST", "/tailoring-workers"], ["workers", "delete", "DELETE", "/tailoring-workers/id"], ["workers", "update", "PUT", "/tailoring-workers/id"], ["workers", "assign", "POST", "/tailoring-workers/id/work"], ["workers", "complete", "POST", "/tailoring-workers/id/work/job/completions"], ["workers", "increase", "POST", "/tailoring-workers/id/work/job/increases"], ["workers", "deleteWork", "DELETE", "/tailoring-workers/id/work/job"], ["workers", "cancelWork", "POST", "/tailoring-workers/id/work/job/cancel"], ["workers", "resume", "POST", "/tailoring-workers/id/work/job/materials/resume"], ["workers", "pay", "POST", "/tailoring-workers/id/payments"],
  ["sfifa", "add", "POST", "/sfifa-stock"], ["sfifa", "update", "PUT", "/sfifa-stock/id/variants/variant"], ["sfifa", "restock", "POST", "/sfifa-stock/id/variants/variant/restock"], ["sfifa", "delete", "DELETE", "/sfifa-stock/id/variants/variant"],
  ["fabrics", "add", "POST", "/fabrics"], ["fabrics", "update", "PUT", "/fabrics/id"], ["fabrics", "delete", "DELETE", "/fabrics/id"], ["fabrics", "deleteColor", "DELETE", "/fabrics/id/colors/color"], ["fabrics", "deletePiece", "DELETE", "/fabrics/id/colors/color/pieces/piece"], ["fabrics", "reduce", "POST", "/fabrics/id/colors/color/pieces/piece/reductions"],
  ["clients", "add", "POST", "/clients"], ["clients", "update", "PUT", "/clients/id"], ["expenses", "add", "POST", "/side-expenses"], ["cashier", "sell", "POST", "/addVentes"],
  ...Object.entries({ invoice: "addInvoice", quote: "addQuote", delivery: "addDelivery", return: "addReturn", credit: "addCreditNote" }).map(([documentType, operation]) => ["invoices", operation, "POST", documentType === "invoice" ? "/addVentes" : "/sales-documents", documentType === "invoice" ? { invoiceOrigin: "manual" } : { documentType }]),
];
for (const [module, operation, method, path, body] of writes) test(`${module}.${operation} authorizes its operation independently`, () => {
  assert.equal(employeeCanRequest(permission(module, module === "workers" && ["pay", "advance"].includes(operation) ? ["financials", operation] : [operation]), method, path, body), true);
  assert.equal(employeeCanRequest(permission(module, []), method, path, body), false);
  assert.equal(employeeCanRequest({ ...permission(module, [operation]), moduleAccess: [] }, method, path, body), false);
  for (const other of EMPLOYEE_OPERATIONS[module].filter(key => key !== operation && !(module === "fabrics" && operation === "update" && ["addColor", "addPiece"].includes(key)))) assert.equal(employeeCanRequest(permission(module, [other]), method, path, body), false, `${other} must not authorize ${operation}`);
});
test("explicit operation sets deny absent grants even when legacy global flags are true", () => {
  for (const module of EMPLOYEE_MODULES) for (const operation of EMPLOYEE_OPERATIONS[module]) {
    assert.equal(canEmployeeOperation("Employe", permission(module, []), module, operation), false);
    assert.equal(canEmployeeOperation("Employe", permission(module, module === "workers" && ["payroll", "pay", "advance", "download"].includes(operation) ? ["financials", operation] : [operation]), module, operation), true);
    assert.equal(canEmployeeOperation("admin", { moduleAccess: [] }, module, operation), true);
  }
  assert.equal(canEmployeeOperation("Employe", permission("products", ["add"]), "credit", "add"), false);
});
test("cash and credit checkout enforce separate rights, including new customers and initial payments", () => {
  const user = { moduleAccess: ["cashier", "credit"], operationPermissions: { cashier: ["creditSale"], credit: ["addDebt"] } };
  assert.equal(employeeCanRequest(user, "POST", "/addVentes/credit", { customerId: "existing" }), true);
  assert.equal(employeeCanRequest(user, "POST", "/addVentes", {}), false);
  assert.equal(employeeCanRequest(user, "POST", "/addVentes/credit", { newCustomer: { name: "new" } }), false);
  assert.equal(employeeCanRequest(user, "POST", "/addVentes/credit", { amountPaid: 1 }), false);
  user.operationPermissions.credit.push("payment", "add");
  assert.equal(employeeCanRequest(user, "POST", "/addVentes/credit", { newCustomer: { name: "new" }, amountPaid: 1 }), true);
  assert.equal(employeeCanRequest(user, "POST", "/usercridite/add-product/id", { Paiement: 1 }), true);
  user.operationPermissions.credit = ["addDebt"];
  assert.equal(employeeCanRequest(user, "POST", "/usercridite/add-product/id", { Paiement: 1 }), false);
  user.moduleAccess.push("invoices"); user.operationPermissions.invoices = ["addInvoice"];
  user.operationPermissions.cashier = [];
  assert.equal(employeeCanRequest(user, "POST", "/addVentes/credit", { invoiceOrigin: "manual" }), false);
});
test("discount, wholesale and document stock movements need their own grant", () => {
  for (const [module, operation, url, initial] of [["cashier", "sell", "/addVentes", {}], ["invoices", "addDelivery", "/sales-documents", { documentType: "delivery" }]]) {
    const user = permission(module, [operation]);
    assert.equal(employeeCanRequest(user, "POST", url, { ...initial, discountValue: 1 }), false);
    assert.equal(employeeCanRequest(user, "POST", url, { ...initial, cart: [{ discountValue: 1 }] }), false);
    assert.equal(employeeCanRequest(user, "POST", url, { ...initial, cart: [{ priceType: "wholesale" }] }), false);
    user.operationPermissions[module].push("discount", "wholesale");
    assert.equal(employeeCanRequest(user, "POST", url, { ...initial, discountValue: 1, cart: [{ priceType: "wholesale" }] }), true);
  }
  const user = permission("invoices", ["addDelivery"]);
  assert.equal(employeeCanRequest(user, "POST", "/sales-documents", { documentType: "delivery", updateStock: true }), false);
  user.operationPermissions.invoices.push("stockMove");
  assert.equal(employeeCanRequest(user, "POST", "/sales-documents", { documentType: "delivery", updateStock: true }), true);
});
test("history endpoints and direct page links respect their specific grants", () => {
  assert.equal(employeeCanRequest(permission("sfifa", []), "GET", "/sfifa-stock/id/history"), false);
  assert.equal(employeeCanRequest(permission("sfifa", ["history"]), "GET", "/sfifa-stock/id/history"), true);
  assert.equal(employeeCanRequest(permission("fabrics", []), "GET", "/fabrics/movements"), false);
  assert.equal(employeeCanRequest(permission("workers", []), "GET", "/tailoring-workers/id/payroll"), false);
  assert.equal(employeeCanRequest(permission("workers", ["financials", "pay"]), "GET", "/tailoring-workers/id/payroll"), true);
  assert.equal(employeeCanRequest(permission("workers", ["increase"]), "GET", "/tailoring-workers/id/work/orders"), true);
  assert.equal(employeeCanRequest(permission("cashier", ["sell"]), "GET", "/Product/Get"), true);
  assert.equal(employeeCanRequest(permission("cashier", ["sell"]), "POST", "/Product/Add"), false);
  assert.equal(canOpenEmployeePage("Employe", permission("tailoring", []), "/Home/Fesla?view=profits"), false);
  assert.equal(canOpenEmployeePage("Employe", permission("invoices", ["addQuote"]), "/Home/Facture/new?type=quote"), true);
  assert.equal(canOpenEmployeePage("Employe", permission("invoices", ["addQuote"]), "/Home/Facture/new?type=invoice"), false);
  assert.equal(canOpenEmployeePage("Employe", permission("credit", []), "/Home/cridit/add"), false);
});
test("permission validation rejects unknown, duplicate, cross-module and malformed operations", () => {
  for (const operationPermissions of [null, [], { admin: ["add"] }, { workers: ["sell"] }, { workers: ["complete", "complete"] }, { workers: "complete" }, { workers: [true] }]) assert.throws(() => validateEmployeePermissions({ moduleAccess: ["workers"], operationPermissions }));
  const validated = validateEmployeePermissions({ moduleAccess: ["workers"], operationPermissions: { workers: ["complete"] }, action: { update: true }, role: "admin" });
  assert.deepEqual(validated.operationPermissions.workers, ["complete"]);
  assert.equal(validated.action.update, false);
  assert.equal(Object.hasOwn(validated, "role"), false);
});
test("legacy conversion and model serialization preserve independent empty and populated grants", async () => {
  const legacy = { moduleAccess: ["workers", "products"], action: { add: true, update: false, delete: false } };
  const migrated = employeePermissionValue(legacy);
  assert.ok(migrated.operationPermissions.workers.includes("assign"));
  assert.equal(migrated.operationPermissions.workers.includes("complete"), false);
  assert.equal(migrated.operationPermissions.products.includes("restock"), false);
  for (const operations of [[], ["complete"]]) {
    const value = validateEmployeePermissions({ moduleAccess: ["workers"], operationPermissions: { workers: operations } });
    const account = new Employee({ ...value, isActive: true }); await account.validate();
    const reloaded = new Employee(JSON.parse(JSON.stringify(account)));
    assert.deepEqual(employeePermissionValue(reloaded).operationPermissions.workers, operations);
    assert.equal(canEmployeeOperation("Employe", reloaded, "workers", "pay"), false);
  }
});
test("credit payment can be granted alone, with trusted staff identity and immediate revocation", async t => {
  const f = creditCheckoutFixture(t), employee = f.rows(Employee).find(row => String(row._id) === employeeId);
  Object.assign(employee, permission("credit", ["payment"]));
  let response = await request(`/usercridite/add-payment/${f.customer._id}`, { amount: 25, note: "دفعة", requestId: randomUUID() });
  assert.equal(response.status, 200, JSON.stringify(response));
  assert.equal(f.account().paymentHistory.at(-1).actor.name, "خديجة");
  assert.equal(String(f.account().paymentHistory.at(-1).actor.id), employeeId);
  assert.equal((await request("/usercridite/add", { name: "ممنوع" })).status, 403);
  assert.equal((await request(`/usercridite/add-product/${f.customer._id}`, { nom: "ممنوع", prix: 20, Quantite: 1 })).status, 403);
  employee.operationPermissions.credit = [];
  assert.equal((await request(`/usercridite/add-payment/${f.customer._id}`, { amount: 10, requestId: randomUUID() })).status, 403);
  assert.equal(f.account().paymentHistory.length, 1);
});
test("worker completion does not grant assignment, worker editing, increases, payments or cancellation", async t => {
  const f = workerMaterialsFixture(t); Object.assign(f.staff, permission("workers", ["complete"]));
  const url = `/tailoring-workers/${f.worker._id}/work`;
  const assigned = await request(url, { category: "finishing", workType: "shop", productName: "عمل مستقل", quantity: 3, unitWage: 20, requestId: randomUUID() }, "POST", admin);
  assert.equal(assigned.status, 201, JSON.stringify(assigned));
  const work = assigned.data;
  const completed = await request(`${url}/${work._id}/completions`, { quantity: 1, version: work.__v, requestId: randomUUID() }, "POST", workerStaff);
  assert.equal(completed.status, 201, JSON.stringify(completed)); assert.equal(completed.data.remainingQuantity, 2); assert.equal(completed.data.completions[0].earningAmount, undefined);
  assert.equal(f.records[0].completions[0].earningAmount, 20);
  for (const [path, method] of [[url, "POST"], [`${url}/${work._id}/increases`, "POST"], [`${url}/${work._id}/cancel`, "POST"], [`/tailoring-workers/${f.worker._id}/payments`, "POST"], [`/tailoring-workers/${f.worker._id}`, "PUT"]]) assert.equal((await request(path, {}, method, workerStaff)).status, 403);
  f.staff.operationPermissions.workers = [];
  assert.equal((await request(`${url}/${work._id}/completions`, { quantity: 1, version: completed.data.__v, requestId: randomUUID() }, "POST", workerStaff)).status, 403);
  assert.equal(f.records[0].completedQuantity, 1);
});
test("product restock permission works for employees without product edit or creation", async t => {
  const f = creditCheckoutFixture(t), employee = f.rows(Employee).find(row => String(row._id) === employeeId);
  Object.assign(employee, permission("products", ["restock"]));
  const response = await request(`/Product/${productIds[0]}/restocks`, { requestId: randomUUID(), quantite: 2, prix_achat: 220, prix_vente: 450, prix_gros: 350, frais_total: 0, frais_quantite: 2 });
  assert.equal(response.status, 201, JSON.stringify(response));
  assert.equal(f.products()[0].quantite, 12); assert.equal(f.products()[0].stockBatches.at(-1).createdByName, "خديجة");
  assert.equal(String(f.products()[0].idAdmin), owner);
  assert.equal((await request(`/Product/Update/${productIds[0]}`, {}, "PUT")).status, 403);
  assert.equal((await request("/Product/Add", {})).status, 403);
});
test("owner permission edits persist the operation matrix and stale employee profile updates cannot replace it", async t => {
  const f = creditCheckoutFixture(t), path = `/Employe/${employeeId}/permissions`;
  const body = { moduleAccess: ["sfifa", "workers"], operationPermissions: { sfifa: ["restock"], workers: ["complete"] } };
  const saved = await request(path, body, "PUT", admin);
  assert.equal(saved.status, 200, JSON.stringify(saved));
  assert.deepEqual(saved.data.operationPermissions.workers, ["complete"]);
  assert.deepEqual(saved.data.operationPermissions.sfifa, ["restock"]);
  assert.equal((await request(path, { moduleAccess: [], operationPermissions: {} }, "PUT")).status, 403);
  const me = await request("/user/getMe");
  assert.deepEqual(me.data.user.operationPermissions.workers, ["complete"]);
  assert.equal(f.rows(Employee).find(row => String(row._id) === employeeId).action.update, false);
});
test("adding fabric colours or coupons does not grant editing existing metres or prices", async t => {
  const f = workerMaterialsFixture(t); f.fabric.salePricePerMeter = 50;
  t.mock.method(Fabric, "exists", async () => false);
  Object.assign(f.staff, permission("fabrics", ["addColor"]));
  const url = `/fabrics/${f.fabric._id}`;
  const input = () => ({ ...JSON.parse(JSON.stringify(f.fabrics[0])), version: f.fabrics[0].__v });
  const colour = input(); colour.colors.push({ name: "أحمر", number: "02", pieces: [{ meters: 8, barcode: generateFabricBarcode() }] });
  let response = await request(url, colour, "PUT", workerStaff);
  assert.equal(response.status, 200, JSON.stringify(response)); assert.equal(f.fabrics[0].colors.length, 2);
  const changed = input(); changed.colors[0].pieces[0].meters = 100;
  assert.equal((await request(url, changed, "PUT", workerStaff)).status, 403);
  const price = input(); price.salePricePerMeter = 100;
  assert.equal((await request(url, price, "PUT", workerStaff)).status, 403);
  const coupon = input(); coupon.colors[0].pieces.push({ meters: 5, barcode: generateFabricBarcode() });
  assert.equal((await request(url, coupon, "PUT", workerStaff)).status, 403);
  f.staff.operationPermissions.fabrics = ["addPiece"];
  response = await request(url, coupon, "PUT", workerStaff);
  assert.equal(response.status, 200, JSON.stringify(response)); assert.equal(f.fabrics[0].colors[0].pieces.length, 3);
});
test("tailoring payment is independent of order editing, delivery and initial paid-amount changes", async t => {
  const f = workerMaterialsFixture(t), order = f.seedGarmentOrder("shirts");
  t.mock.method(TailoringOrder.prototype, "save", async function () {
    const index = f.orders.findIndex(row => String(row._id) === String(this._id));
    await this.validate();
    if (index < 0 || f.orders[index].__v !== this.__v) throw Object.assign(new Error("Conflict"), { name: "VersionError" });
    this.__v++; f.orders[index] = new TailoringOrder(this.toObject()); return this;
  });
  Object.assign(f.staff, permission("tailoring", ["update"]));
  const input = { ...JSON.parse(JSON.stringify(order)), version: order.__v, paidAmount: 5 };
  let response = await request(`/tailoring-orders/${order._id}`, input, "PUT", workerStaff);
  assert.equal(response.status, 403, JSON.stringify(response));
  f.staff.operationPermissions.tailoring = ["payment"];
  response = await request(`/tailoring-orders/${order._id}/payments`, { amount: 5, version: order.__v, requestId: randomUUID() }, "POST", workerStaff);
  assert.equal(response.status, 200, JSON.stringify(response)); assert.equal(response.data.paidAmount, 5);
  assert.equal((await request(`/tailoring-orders/${order._id}/deliver`, { version: response.data.__v }, "POST", workerStaff)).status, 403);
  assert.equal((await request(`/tailoring-orders/${order._id}`, input, "PUT", workerStaff)).status, 403);
  const create = { ...input, requestId: randomUUID() }; delete create.version;
  f.staff.operationPermissions.tailoring = ["add"];
  assert.equal((await request("/tailoring-orders", create, "POST", workerStaff)).status, 403);
});
