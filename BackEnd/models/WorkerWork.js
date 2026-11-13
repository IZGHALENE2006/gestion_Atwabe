import { SHOP_FLOW_GARMENTS, shopFlowSlot } from '../../shared/workerShopFlow.js';
import { WORKER_SFIFA_FAMILIES, SFIFA_CUSTOMER_FAMILY, workerSfifaCreditsStock } from '../../shared/workerSfifa.js';
import { tailoringMoneyCents } from "../../shared/tailoring.js";
import { workerCompletionEarning, workerPayrollMonthValid } from "../../shared/workerPayroll.js";
import mongoose from "mongoose";
import { workerMaterialOperationSchema, workerMaterialCancellationSchema, workerMaterialRowSchema } from './workerMaterialSchema.js';
import { supportsWorkerMaterialHistory, workerMaterialRows, workerHasPieceWages, workerPieceWageCents, WORKER_GARMENT_SIZES } from '../../shared/workerMaterials.js';
import { WORK_QUANTITY_LIMIT, WORK_TRACKING_CATEGORIES, WORK_TYPES, TROUSER_TYPES, workerWageCents, workerOrderGarmentTypes, workQuantityUnits } from "../../shared/workerWork.js";
import { SFIFA_STOCK_WIDTHS, sfifaCodeNumber } from "../../shared/sfifaStock.js";

import { TAILORING_SFIFA_GARMENT_TYPES, TAILORING_GARMENT_TYPES, tailoringGarmentType } from "../../shared/tailoring.js";

const requestPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
const validQuantity = function (value) { return workQuantityUnits(value, this.category ?? this.parent()?.category) !== null; };
const quantityField = min => ({ type: Number, required: true, min, max: WORK_QUANTITY_LIMIT, validate: validQuantity });
const sfifaSchema = new mongoose.Schema({
  width: { type: String, enum: SFIFA_STOCK_WIDTHS, required: true },
  family: { type: String, enum: WORKER_SFIFA_FAMILIES.map(family => family.value), required: true },
  code: { type: Number, required: function () { return this.family !== SFIFA_CUSTOMER_FAMILY; }, validate: function (value) { return this.family === SFIFA_CUSTOMER_FAMILY ? value === undefined : sfifaCodeNumber(value, this.family) !== null; } },
}, { _id: false });
const completionSchema = new mongoose.Schema({
  lineIds: { type: [String], default: undefined },
  stockCredited: { type: Boolean, default: undefined },
  earningAmount: { type: Number, default: undefined, validate: value => value === undefined || tailoringMoneyCents(value) !== null },
  earningMonth: { type: String, default: undefined, validate: value => value === undefined || workerPayrollMonthValid(value) },
  sequence: { type: Number, min: 1, validate: Number.isSafeInteger, default: undefined },
  requestId: { type: String, required: true, match: requestPattern },
  quantity: quantityField(0.001),
  before: quantityField(0.001),
  after: quantityField(0),
  date: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
});
const additionSchema = new mongoose.Schema({
  requestId: { type: String, required: true, match: requestPattern },
  sequence: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  quantity: quantityField(0.001), before: quantityField(0), after: quantityField(0.001),
  date: { type: Date, required: true }, createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  lineIds: { type: [String], default: undefined },
});
const garmentSchema = new mongoose.Schema({
  lineId: { type: String, required: true },
  fabricSource: { type: String, required: true },
  fabricType: { type: String, required: true },
  fabricColor: { type: String, default: "" },
  fabricReference: { type: String, default: "" },
  sfifa: { width: String, style: String, color1: String, color2: String, stock: { type: new mongoose.Schema({ stockId: mongoose.Schema.Types.ObjectId, variantId: mongoose.Schema.Types.ObjectId, meters: Number, meterType: String, family: String, code: Number }, { _id: false }) } },
  trouserType: { type: String, enum: TROUSER_TYPES, default: undefined },
  shirtType: { type: String, maxlength: 120, default: undefined },
}, { _id: false });
const tailoringSchema = new mongoose.Schema({
  garmentType: { type: String, enum: TAILORING_GARMENT_TYPES, default: undefined },
  orderId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "TailoringOrder" },
  lineIds: { type: [String], required: true },
  clientName: { type: String, required: true },
  phone: { type: String, required: true },
  barcode: { type: String, required: true },
  orderDate: { type: String, required: true },
  readyDate: { type: String, required: true },
  items: { type: [garmentSchema], required: true },
}, { _id: false });
const shopFlowSchema = new mongoose.Schema({
  originId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'WorkerWork' },
  sourceWorkId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'WorkerWork' },
  sourceCategory: { type: String, required: true, enum: ['machine', 'finishing'] },
  originWorkerName: { type: String, default: '' }, sourceWorkerName: { type: String, default: '' },
  materials: { type: [workerMaterialRowSchema], default: [] },
}, { _id: false });
const schema = new mongoose.Schema({
  shopFlow: { type: shopFlowSchema, default: undefined },
  shopFlowSlot: { type: String, default: undefined },
  shopTrouser: { type: new mongoose.Schema({
    fabricId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Fabric' },
    fabricType: { type: String, required: true, maxlength: 120 },
    fabricReference: { type: String, default: '', maxlength: 120 },
    size: { type: String, required: true, enum: WORKER_GARMENT_SIZES },
  }, { _id: false }), default: undefined },
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Admin" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  workerId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "TailoringWorker" },
  category: { type: String, enum: WORK_TRACKING_CATEGORIES, required: true },
  workType: { type: String, enum: WORK_TYPES, default: undefined },
  garmentType: { type: String, enum: TAILORING_SFIFA_GARMENT_TYPES, default: undefined },
  trouserType: { type: String, enum: TROUSER_TYPES, default: undefined },
  tailoring: { type: tailoringSchema, default: undefined },
  archivedTailoring: { type: tailoringSchema, default: undefined },
  deletedAt: { type: Date, default: undefined },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  productName: { type: String, required: true, trim: true, maxlength: 160 },
  sfifa: { type: sfifaSchema, default: undefined },
  materialOperations: { type: [workerMaterialOperationSchema], default: undefined },
  materialStatus: { type: String, enum: ['pending', 'ready', 'returning'], default: undefined },
  materialCancellation: { type: workerMaterialCancellationSchema, default: undefined },
  cancelledAt: { type: Date, default: undefined },
  unitWage: { type: Number, default: undefined, immutable: true, validate: value => value === undefined || tailoringMoneyCents(value) !== null },
  quantity: quantityField(0.001),
  initialQuantity: { ...quantityField(0.001), required: false, default: undefined },
  completedQuantity: { ...quantityField(0), default: 0 },
  completions: { type: [completionSchema], default: [] },
  additions: { type: [additionSchema], default: [] },
  requestId: { type: String, required: true, match: requestPattern },
  requestFingerprint: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.pre("validate", function () {
  if (this.shopFlow) {
    if (this.workType !== 'shop' || !['finishing', 'mesbanto'].includes(this.category) || !SHOP_FLOW_GARMENTS.includes(this.garmentType) || this.shopFlow.sourceCategory !== (this.category === 'finishing' ? 'machine' : 'finishing') || this.materialOperations?.length || this.additions.length || this.shopFlow.materials.length && this.shopFlow.materials.length !== this.quantity) this.invalidate('shopFlow', 'Invalid shop production stage');
    if (workerWageCents(this.unitWage, this.quantity, this.category) === null) this.invalidate('unitWage', 'Invalid shop stage wage');
    if (this.category === 'finishing' && String(this.shopFlow.sourceWorkId) !== String(this.shopFlow.originId)) this.invalidate('shopFlow', 'Finishing must follow its machine origin');
    if ((!this.deletedAt && this.shopFlowSlot !== shopFlowSlot(this.shopFlow.originId, this.category)) || (this.deletedAt && this.shopFlowSlot !== undefined)) this.invalidate('shopFlowSlot', 'Invalid shop production slot');
  } else if (this.shopFlowSlot !== undefined) this.invalidate('shopFlowSlot', 'Missing shop production link');
  if (this.materialOperations?.length) {
    const order = this.tailoring || this.archivedTailoring, rows = workerMaterialRows(this);
    if (!supportsWorkerMaterialHistory(this.category, this.workType, order ? tailoringGarmentType(order) : this.garmentType) || new Set(rows.map(row => row.lineId)).size !== rows.length || rows.length > this.quantity || (order && rows.some(row => !order.lineIds.includes(row.lineId)))) this.invalidate('materialOperations', 'Invalid garment materials');
  }
  const pieceWages = workerHasPieceWages(this), rows = workerMaterialRows(this), pricedEvents = [];
  if (pieceWages && (this.unitWage !== undefined || rows.length !== this.quantity || workerPieceWageCents(rows) === null)) this.invalidate('materialOperations', 'Invalid per-piece wages');
  let pricedCompleted = 0;
  for (const event of this.completions) {
    if (event.stockCredited !== undefined && (this.category !== "sfifa" || typeof event.stockCredited !== "boolean" || (event.stockCredited === false && workerSfifaCreditsStock(this)) || (event.stockCredited === true && this.sfifa?.family === SFIFA_CUSTOMER_FAMILY))) this.invalidate("completions", "Invalid completion stock effect");
    if (pieceWages) {
      try {
        const expected = workerCompletionEarning({ category: this.category, workType: this.workType, materials: rows, completions: pricedEvents }, event.quantity, event.date, event.lineIds);
        if (event.earningAmount !== expected.earningAmount || event.earningMonth !== expected.earningMonth) this.invalidate('completions', 'Inconsistent per-piece earnings');
      } catch { this.invalidate('completions', 'Invalid completed pieces'); }
    } else if (this.unitWage === undefined) {
      if (event.earningAmount !== undefined || event.earningMonth !== undefined) this.invalidate("completions", "Unpriced work cannot have earnings");
    } else {
      try {
        const expected = workerCompletionEarning({ category: this.category, unitWage: this.unitWage, completedQuantity: pricedCompleted }, event.quantity, event.date);
        if (event.earningAmount !== expected.earningAmount || event.earningMonth !== expected.earningMonth) this.invalidate("completions", "Inconsistent completion earnings");
      } catch { this.invalidate("completions", "Invalid completion earnings"); }
    }
    const scale = this.category === "sfifa" ? 1000 : 1;
    if (!pieceWages && event.lineIds !== undefined) this.invalidate('completions', 'Unexpected completed pieces');
    pricedEvents.push(event);
    pricedCompleted = Math.round((pricedCompleted + event.quantity) * scale) / scale;
  }
  const linked = Boolean(this.tailoring);
  const trouserClient = this.category === "trousers" && this.workType === "client";
  const shopTrouser = Boolean(this.shopTrouser);
  if (shopTrouser && (this.category !== 'trousers' || this.workType !== 'shop')) this.invalidate('shopTrouser', 'Shop trouser details require shop trouser work');
  if (((trouserClient || shopTrouser) && !TROUSER_TYPES.includes(this.trouserType)) || (!trouserClient && !shopTrouser && this.trouserType !== undefined)) this.invalidate("trouserType", "Trouser type must match trouser work");
  if ((this.workType === "client" && !["sfifa", "trousers", "brim"].includes(this.category) && !linked && !this.deletedAt) || (linked && this.workType !== "client")) this.invalidate("tailoring", "Client work must reference a matching tailoring order");
  if (this.garmentType !== undefined && ((this.category !== "machine" && !this.shopFlow) || this.workType === "client")) this.invalidate("garmentType", "Shop garment type must belong to machine work");
  if (linked && !workerOrderGarmentTypes(this.category).includes(tailoringGarmentType(this.tailoring))) this.invalidate("tailoring", "Order kind does not match worker section");
  if (linked && trouserClient && this.tailoring.items.some(item => item.trouserType !== this.trouserType)) this.invalidate("trouserType", "Assigned trousers must have one matching style");
  if (linked && this.tailoring && (!this.tailoring.lineIds.length || this.tailoring.lineIds.length > 50 || (this.category !== "sfifa" && this.tailoring.lineIds.length !== this.quantity) || new Set(this.tailoring.lineIds).size !== this.tailoring.lineIds.length || this.tailoring.items.length !== this.tailoring.lineIds.length || this.tailoring.items.some(item => !this.tailoring.lineIds.includes(item.lineId)))) this.invalidate("tailoring", "Garments must match the assigned quantity");
  if ((this.category === "sfifa") !== Boolean(this.sfifa)) this.invalidate("sfifa", "Sfifa details must match the work section");
  let remaining = workQuantityUnits(this.initialQuantity ?? this.quantity, this.category), added = 0, completed = 0;
  if (this.additions.length && this.initialQuantity === undefined) this.invalidate("initialQuantity", "Missing initial quantity");
  const seen = new Set();
  const events = [...this.completions.map((event, index) => ({ event, sequence: event.sequence ?? index + 1, addition: false })), ...this.additions.map(event => ({ event, sequence: event.sequence, addition: true }))].sort((a, b) => a.sequence - b.sequence);
  for (const [index, { event, sequence, addition }] of events.entries()) {
    const quantity = workQuantityUnits(event.quantity, this.category), after = workQuantityUnits(event.after, this.category), expected = remaining + (addition ? quantity : -quantity);
    if (sequence !== index + 1 || workQuantityUnits(event.before, this.category) !== remaining || after !== expected || seen.has(event.requestId)) this.invalidate("completions", "Invalid work history");
    if (addition) added += quantity; else completed += quantity;
    remaining = after; seen.add(event.requestId);
  }
  if (workQuantityUnits(this.quantity, this.category) !== workQuantityUnits(this.initialQuantity ?? this.quantity, this.category) + added || workQuantityUnits(this.completedQuantity, this.category) !== completed || workQuantityUnits(this.completedQuantity, this.category) !== workQuantityUnits(this.quantity, this.category) - remaining) this.invalidate("completedQuantity", "Invalid work quantities");
});
schema.index({ idAdmin: 1, workerId: 1, category: 1, createdAt: -1, _id: -1 });
schema.index({ idAdmin: 1, shopFlowSlot: 1 }, { unique: true, partialFilterExpression: { shopFlowSlot: { $type: 'string' } } });
schema.index({ idAdmin: 1, 'shopFlow.originId': 1 });
schema.index({ idAdmin: 1, requestId: 1 }, { unique: true });
schema.index({ idAdmin: 1, category: 1, "tailoring.orderId": 1, "tailoring.lineIds": 1 }, { unique: true, partialFilterExpression: { workType: "client", "tailoring.orderId": { $type: "objectId" } } });
export default mongoose.model("WorkerWork", schema);
