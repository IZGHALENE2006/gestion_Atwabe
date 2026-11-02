import { randomUUID } from "node:crypto";
import AdminModel from "../../BackEnd/models/AdminModel.js";
import EmployeModel from "../../BackEnd/models/EmployeModele.js";
import TailoringOrder from "../../BackEnd/models/TailoringOrder.js";
import DjellabaCostSettings from "../../BackEnd/models/DjellabaCostSettings.js";
import Fabric from "../../BackEnd/models/Fabric.js";
import WorkerWork from "../../BackEnd/models/WorkerWork.js";
import SfifaStock from "../../BackEnd/models/SfifaStock.js";
import { generateFabricBarcode } from "../../shared/fabrics.js";
export const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
export const query = fn => ({ select() { return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } });
export const garment = patch => ({ lineId: randomUUID().replaceAll("-", "").slice(0,24), price: 500, fabricSource: "client", fabricType: "قطن", fabricMeters: "2", fabricUnitPrice: 0, sfifa: { width: "thin", style: "fabric" }, ...patch });
export const orderInput = patch => ({ clientName: "أمينة", phone: "0612345678", orderDate: "2026-10-27", readyDate: "2026-11-05", garmentType: "djellaba", automaticCosting: true, costSettingsVersion: 0, paidAmount: 100, items: [garment()], requestId: randomUUID(), ...patch });
export function djellabaFixture(t) {
  const orders = new Map(), settings = new Map(), fabrics = new Map();
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: true } }, faults = {};
  t.mock.method(AdminModel, "findById", id => query(() => [owner, otherOwner].includes(String(id)) ? { _id: String(id) } : null));
  t.mock.method(EmployeModel, "findById", id => query(() => String(id) === employee ? staff : null));
  t.mock.method(TailoringOrder, "find", scope => query(() => [...orders.values()].filter(row => String(row.idAdmin) === String(scope.idAdmin)).map(row => row.toObject())));
  t.mock.method(TailoringOrder, "findOne", async scope => {
    const row = [...orders.values()].find(row => String(row.idAdmin) === String(scope.idAdmin) && (!scope._id || String(row._id) === String(scope._id)) && (!scope.requestId || row.requestId === scope.requestId));
    return row ? new TailoringOrder(row.toObject()) : null;
  });
  const orderCreate = t.mock.method(TailoringOrder, "create", async value => {
    if ([...orders.values()].some(row => String(row.idAdmin) === String(value.idAdmin) && row.requestId === value.requestId)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const document = new TailoringOrder({ ...value, __v: 0, createdAt: new Date(), updatedAt: new Date() });
    await document.validate(); orders.set(String(document._id), document); return document;
  });
  const orderSave = t.mock.method(TailoringOrder.prototype, "save", async function () {
    if (faults.orderSave) throw new Error("Internal order write details");
    const old = orders.get(String(this._id)); await this.validate();
    if (!old || old.__v !== this.__v) throw Object.assign(new Error("Concurrent write"), { name: "VersionError" });
    this.__v += 1; this.updatedAt = new Date(); orders.set(String(this._id), new TailoringOrder(this.toObject())); return this;
  });
  t.mock.method(DjellabaCostSettings, "findOne", async scope => settings.has(String(scope.idAdmin)) ? new DjellabaCostSettings(settings.get(String(scope.idAdmin)).toObject()) : null);
  t.mock.method(DjellabaCostSettings, "create", async value => {
    if (settings.has(String(value.idAdmin))) throw Object.assign(new Error("duplicate"), { code: 11000 });
    const document = new DjellabaCostSettings({ ...value, __v: 0 }); await document.validate(); settings.set(String(value.idAdmin), document); return document;
  });
  t.mock.method(DjellabaCostSettings.prototype, "save", async function () {
    if (faults.settingsSave) throw new Error("Internal settings write details");
    const old = settings.get(String(this.idAdmin)); await this.validate();
    if (!old || old.__v !== this.__v) throw Object.assign(new Error("Concurrent settings write"), { name: "VersionError" });
    this.__v += 1; settings.set(String(this.idAdmin), new DjellabaCostSettings(this.toObject())); return this;
  });
  t.mock.method(Fabric, "findOne", async scope => {
    const row = fabrics.get(String(scope._id)); return row && String(row.idAdmin) === String(scope.idAdmin) ? row : null;
  });
  t.mock.method(Fabric, "find", scope => query(() => [...fabrics.values()].filter(row => String(row.idAdmin) === String(scope.idAdmin)).map(row => row.toObject())));
  t.mock.method(WorkerWork, "find", () => query(() => [])); t.mock.method(SfifaStock, "find", () => query(() => []));
  const seedFabric = (price = 25, idAdmin = owner) => {
    const row = new Fabric({ idAdmin, createdBy: idAdmin, type: "قطن المحل", reference: "T-001", salePricePerMeter: price, colors: [{ name: "أزرق", pieces: [{ meters: 35, barcode: generateFabricBarcode() }] }, { name: "أبيض", pieces: [{ meters: 47, barcode: generateFabricBarcode() }] }] });
    fabrics.set(String(row._id),row); return row;
  };
  const seedSettings = (rates = { thinSfifaPrice: 10, thickSfifaPrice: 20, laborPrice: 30 }, idAdmin = owner) => {
    const row = new DjellabaCostSettings({ ...rates, idAdmin, updatedBy: idAdmin, __v: 0 }); settings.set(String(idAdmin), row); return row;
  };
  return { orders, settings, fabrics, staff, faults, orderCreate, orderSave, seedFabric, seedSettings };
}
