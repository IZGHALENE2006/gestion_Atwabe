import { randomUUID } from "node:crypto";
import { djellabaFixture, owner, otherOwner, employee } from "./djellabaCostsFixture.js";
import JabadorCostSettings from "../../BackEnd/models/JabadorCostSettings.js";
import AdminModel from "../../BackEnd/models/AdminModel.js";
import EmployeModel from "../../BackEnd/models/EmployeModele.js";
import TailoringWorker from "../../BackEnd/models/TailoringWorker.js";
import WorkerWork from "../../BackEnd/models/WorkerWork.js";
import SfifaStock from "../../BackEnd/models/SfifaStock.js";
import TailoringOrder from "../../BackEnd/models/TailoringOrder.js";
import { validateTailoringOrder } from "../../shared/tailoring.js";
import { query } from "./djellabaCostsFixture.js";
export function jabadorFixture(t) {
  const fixture = djellabaFixture(t), jabadorSettings = new Map();
  t.mock.method(JabadorCostSettings, "findOne", async scope => jabadorSettings.has(String(scope.idAdmin)) ? new JabadorCostSettings(jabadorSettings.get(String(scope.idAdmin)).toObject()) : null);
  t.mock.method(JabadorCostSettings, "create", async value => {
    if (jabadorSettings.has(String(value.idAdmin))) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const row = new JabadorCostSettings({ ...value, __v: 0 }); await row.validate(); jabadorSettings.set(String(value.idAdmin), row); return row;
  });
  t.mock.method(JabadorCostSettings.prototype, "save", async function () {
    const old = jabadorSettings.get(String(this.idAdmin)); await this.validate();
    if (!old || old.__v !== this.__v) throw Object.assign(new Error("Conflict"), { name: "VersionError" });
    this.__v += 1; jabadorSettings.set(String(this.idAdmin), new JabadorCostSettings(this.toObject())); return this;
  });
  const seedJabadorSettings = (rates = { thinSfifaPrice: 15, thickSfifaPrice: 25, laborPrice: 40 }, idAdmin = owner) => {
    const row = new JabadorCostSettings({ ...rates, idAdmin, updatedBy: idAdmin, __v: 0 }); jabadorSettings.set(String(idAdmin), row); return row;
  };
  return { ...fixture, jabadorSettings, seedJabadorSettings };
}
export function jabadorWorkerFixture(t) {
  t.mock.method(SfifaStock, "findOne", async () => null);
  t.mock.method(SfifaStock, "find", () => query(() => []));
  const workers = [], records = [], orders = [], accounts = new Set([owner, otherOwner]);
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: true } };
  t.mock.method(AdminModel, "findById", id => query(() => accounts.has(String(id)) ? { _id: id } : null));
  t.mock.method(EmployeModel, "findById", id => query(() => String(id) === employee ? staff : null));
  const seedWorker = (idAdmin = owner, categories = ["machine", "sfifa", "finishing", "brim"]) => {
    const row = new TailoringWorker({ name: "أمينة", phone: "0612345678", categories, idAdmin, createdBy: idAdmin, requestId: randomUUID(), requestFingerprint: "test", __v: 0 });
    workers.push(row); return row;
  };
  const worker = seedWorker();
  const seedOrder = (idAdmin = owner, patch = {}) => {
    const items = [0, 1].map(index => ({ lineId: randomUUID().replaceAll("-", "").slice(0, 24), price: 500, fabricSource: "client", fabricType: index ? "مخمل" : "ساتان", fabricColor: index ? "أخضر" : "أزرق", sfifa: { width: index ? "thick" : "thin", style: "fabric" } }));
    const row = new TailoringOrder({ ...validateTailoringOrder({ clientName: "فاطمة", phone: "0612345678", orderDate: "2026-10-22", readyDate: "2026-11-04", paidAmount: 200, items }), idAdmin, createdBy: idAdmin, requestId: randomUUID(), requestFingerprint: "test", __v: 0, ...patch });
    orders.push(row); return row;
  };
  t.mock.method(TailoringOrder, "find", scope => query(() => orders.filter(row => String(row.idAdmin) === String(scope.idAdmin)).map(row => row.toObject())));
  t.mock.method(TailoringOrder, "findOne", async scope => { const row = orders.find(row => String(row.idAdmin) === String(scope.idAdmin) && String(row._id) === String(scope._id).toLowerCase()); return row ? new TailoringOrder(row.toObject()) : null; });
  t.mock.method(TailoringWorker, "findOne", async scope => { const row = workers.find(row => String(row._id) === String(scope._id).toLowerCase() && String(row.idAdmin) === String(scope.idAdmin)); return row ? new TailoringWorker(row.toObject()) : null; });
  t.mock.method(TailoringWorker, "find", scope => query(() => workers.filter(worker => String(worker.idAdmin) === String(scope.idAdmin) && scope._id.$in.includes(String(worker._id)))));
  const matches = (row, scope) => String(row.idAdmin) === String(scope.idAdmin) && (!scope._id || String(row._id) === String(scope._id).toLowerCase()) && (!scope.workerId || String(row.workerId) === String(scope.workerId)) && (!scope.category || row.category === scope.category) && (!scope.requestId || row.requestId === scope.requestId);
  const find = t.mock.method(WorkerWork, "find", scope => query(() => records.filter(row => matches(row, scope)).map(row => row.toObject()).sort((a, b) => b.createdAt - a.createdAt)));
  t.mock.method(WorkerWork, "findOne", async scope => { const row = records.find(row => matches(row, scope)); return row ? new WorkerWork(row.toObject()) : null; });
  const create = t.mock.method(WorkerWork, "create", async value => {
    const row = new WorkerWork({ ...value, __v: 0, createdAt: new Date(), updatedAt: new Date() }); await row.validate();
    if (records.some(record => String(record.idAdmin) === String(value.idAdmin) && record.requestId === value.requestId)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    if (value.workType === "client" && value.tailoring && records.some(record => record.workType === "client" && String(record.idAdmin) === String(value.idAdmin) && record.category === value.category && String(record.tailoring?.orderId) === String(value.tailoring.orderId) && record.tailoring.lineIds.some(id => value.tailoring.lineIds.includes(id)))) throw Object.assign(new Error("duplicate garment"), { code: 11000 });
    records.push(row); return row;
  });
  const save = t.mock.method(WorkerWork.prototype, "save", async function () {
    await this.validate();
    const index = records.findIndex(row => String(row._id) === String(this._id));
    if (index < 0 || records[index].__v !== this.__v) throw Object.assign(new Error("Concurrent write"), { name: "VersionError" });
    this.__v += 1; this.updatedAt = new Date(); records[index] = new WorkerWork(this.toObject()); return this;
  });
  return { worker, workers, records, orders, accounts, staff, seedWorker, seedOrder, find, create, save };
}
