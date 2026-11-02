import mongoose from "mongoose";
import { WORK_QUANTITY_LIMIT, WORK_TRACKING_CATEGORIES, WORK_TYPES, TROUSER_TYPES, workerOrderGarmentTypes, workQuantityUnits } from "../../shared/workerWork.js";
import { SFIFA_STOCK_FAMILIES, SFIFA_STOCK_WIDTHS, sfifaCodeNumber } from "../../shared/sfifaStock.js";

import { TAILORING_SFIFA_GARMENT_TYPES, TAILORING_GARMENT_TYPES, tailoringGarmentType } from "../../shared/tailoring.js";

const requestPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
const validQuantity = function (value) { return workQuantityUnits(value, this.category ?? this.parent()?.category) !== null; };
const quantityField = min => ({ type: Number, required: true, min, max: WORK_QUANTITY_LIMIT, validate: validQuantity });
const sfifaSchema = new mongoose.Schema({
  width: { type: String, enum: SFIFA_STOCK_WIDTHS, required: true },
  family: { type: String, enum: SFIFA_STOCK_FAMILIES.map(family => family.value), required: true },
  code: { type: Number, required: true, validate: function (value) { return sfifaCodeNumber(value, this.family) !== null; } },
}, { _id: false });
const completionSchema = new mongoose.Schema({
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
  sfifa: { width: String, style: String, color1: String, color2: String },
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
const schema = new mongoose.Schema({
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
  quantity: quantityField(0.001),
  initialQuantity: { ...quantityField(0.001), required: false, default: undefined },
  completedQuantity: { ...quantityField(0), default: 0 },
  completions: { type: [completionSchema], default: [] },
  additions: { type: [additionSchema], default: [] },
  requestId: { type: String, required: true, match: requestPattern },
  requestFingerprint: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.pre("validate", function () {
  const linked = Boolean(this.tailoring);
  const trouserClient = this.category === "trousers" && this.workType === "client";
  if ((trouserClient && !TROUSER_TYPES.includes(this.trouserType)) || (!trouserClient && this.trouserType !== undefined)) this.invalidate("trouserType", "Trouser type must match client trouser work");
  if ((this.workType === "client" && !["sfifa", "trousers"].includes(this.category) && !linked && !this.deletedAt) || (linked && this.workType !== "client")) this.invalidate("tailoring", "Client work must reference a matching tailoring order");
  if (this.garmentType !== undefined && (this.category !== "machine" || this.workType === "client")) this.invalidate("garmentType", "Shop garment type must belong to machine work");
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
schema.index({ idAdmin: 1, requestId: 1 }, { unique: true });
schema.index({ idAdmin: 1, category: 1, "tailoring.orderId": 1, "tailoring.lineIds": 1 }, { unique: true, partialFilterExpression: { workType: "client", "tailoring.orderId": { $type: "objectId" } } });
export default mongoose.model("WorkerWork", schema);
