import mongoose from "mongoose";
import { TAILORING_MEASUREMENT_FIELDS, TAILORING_MEASUREMENT_NOTES_LIMIT, tailoringMeasurement, validateTailoringMeasurementNotes } from "../../shared/tailoringMeasurements.js";
import { tailoringReceiptSchema } from './tailoringReceiptSchema.js';
import { SFIFA_STYLES, SFIFA_WIDTHS, TAILORING_SOURCES, TAILORING_GARMENT_TYPES, TAILORING_TROUSER_TYPES, validTailoringDate, tailoringMoneyCents, tailoringHasExpenses, tailoringFabricMeters, tailoringGarmentType, tailoringUsesSfifa } from "../../shared/tailoring.js";

import { DJELLABA_RATE_FIELDS, djellabaItemCosts, djellabaCostsTotal, tailoringFabricCost } from "../../shared/tailoringCosts.js";

const costMoney = { type: Number, required: true, validate: value => tailoringMoneyCents(value) !== null };
const itemCostsSchema = new mongoose.Schema(Object.fromEntries(["fabricUnitPrice", "fabricAmount", "sfifaAmount", "laborAmount", "totalAmount"].map(key => [key, { ...costMoney }])), { _id: false });
const fabricCostSchema = new mongoose.Schema(Object.fromEntries(["fabricUnitPrice", "fabricAmount"].map(key => [key, { ...costMoney }])), { _id: false });
const ratesSchema = new mongoose.Schema(Object.fromEntries(DJELLABA_RATE_FIELDS.map(key => [key, { ...costMoney }])), { _id: false });
const costingSchema = new mongoose.Schema({ rates: { type: ratesSchema, required: true }, settingsVersion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }, calculatedAt: { type: Date, required: true } }, { _id: false });

const deliveryFinancialsSchema = new mongoose.Schema({
  revenueAmount: { ...costMoney },
  expenseAmount: { type: Number, default: null, validate: value => value === null || tailoringMoneyCents(value) !== null },
  garmentCount: { type: Number, required: true, min: 1, max: 50, validate: Number.isSafeInteger },
}, { _id: false });
const actorSchema = new mongoose.Schema({
  id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, default: "" },
  role: { type: String, enum: ["admin", "Employe"], required: true },
}, { _id: false });
const sfifaSchema = new mongoose.Schema({
  width: { type: String, enum: SFIFA_WIDTHS, required: true },
  style: { type: String, enum: SFIFA_STYLES, required: true },
  color1: { type: String, maxlength: 120, default: "" },
  color2: { type: String, maxlength: 120, default: "" },
}, { _id: false });
const paymentReceiptSchema = new mongoose.Schema({
  document: { type: tailoringReceiptSchema },
  requestId: { type: String, required: true },
  amount: { type: Number, required: true, validate: value => tailoringMoneyCents(value) > 0 },
  paidAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  actor: { type: actorSchema },
}, { _id: false });
const measurementsSchema = new mongoose.Schema(Object.fromEntries(TAILORING_MEASUREMENT_FIELDS.map(key => [key, { type: Number, validate: value => tailoringMeasurement(value) !== null }])), { _id: false });
const measurementNotesField = () => ({ type: String, maxlength: TAILORING_MEASUREMENT_NOTES_LIMIT, validate: value => {
  try { validateTailoringMeasurementNotes(value); return true; } catch { return false; }
} });
const itemSchema = new mongoose.Schema({
  measurements: { type: measurementsSchema },
  measurementNotes: measurementNotesField(),
  lineId: { type: String, required: true, match: /^[a-f\d]{24}$/ },
  fabricMeters: { type: Number, validate: value => tailoringFabricMeters(value) !== null },
  costs: { type: itemCostsSchema },
  fabricCost: { type: fabricCostSchema },
  price: { type: Number, required: true, validate: value => tailoringMoneyCents(value) !== null },
  fabricSource: { type: String, enum: TAILORING_SOURCES, required: true },
  fabricType: { type: String, required: true, maxlength: 120 },
  fabricReference: { type: String, default: "", maxlength: 120 },
  fabricColor: { type: String, default: "", maxlength: 120 },
  fabricId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "Fabric" },
  colorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sfifa: { type: sfifaSchema, required: function () { return !tailoringHasExpenses(this.ownerDocument()); } },
  trouserType: { type: String, enum: TAILORING_TROUSER_TYPES, required: function () { return this.ownerDocument().garmentType === "trousers"; } },
  shirtType: { type: String, trim: true, minlength: 1, maxlength: 120, required: function () { return this.ownerDocument().garmentType === "shirts"; } },
  photo: { type: String, default: "", match: /^(?:[a-f\d-]{36}\.(?:jpg|png|webp))?$/ },
}, { _id: false });
const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Admin" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  creator: { type: new mongoose.Schema({ id: { type: mongoose.Schema.Types.ObjectId, required: true }, name: { type: String, default: "" }, role: { type: String, enum: ["admin", "Employe"], required: true } }, { _id: false }), immutable: true },
  garmentType: { type: String, enum: TAILORING_GARMENT_TYPES, immutable: true },
  trouserCosting: { type: new mongoose.Schema({ laborPrice: { type: Number, required: true, validate: value => tailoringMoneyCents(value) !== null }, settingsVersion: { type: Number, default: null, validate: value => value === null || Number.isSafeInteger(value) && value >= 0 }, calculatedAt: { type: Date, required: true } }, { _id: false }) },
  costing: { type: costingSchema },
  expenseAmount: { type: Number, required: function () { return tailoringHasExpenses(this); }, validate: value => tailoringMoneyCents(value) !== null },
  requestId: { type: String, required: true },
  requestFingerprint: { type: String, required: true },
  measurements: { type: measurementsSchema },
  measurementNotes: measurementNotesField(),
  clientName: { type: String, required: true, maxlength: 160 },
  phone: { type: String, required: true, maxlength: 40 },
  orderDate: { type: String, required: true, validate: validTailoringDate },
  readyDate: { type: String, required: true, validate: validTailoringDate },
  totalPrice: { type: Number, required: true, default: 0, validate: value => tailoringMoneyCents(value) !== null },
  paidAmount: { type: Number, required: true, default: 0, validate: function (value) {
    const paid = tailoringMoneyCents(value), total = tailoringMoneyCents(this.totalPrice);
    return paid !== null && total !== null && paid <= total;
  } },
  fabricSource: { type: String, enum: TAILORING_SOURCES, required: true },
  fabricType: { type: String, required: true, maxlength: 120 },
  fabricReference: { type: String, default: "", maxlength: 120 },
  fabricColor: { type: String, default: "", maxlength: 120 },
  fabricId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "Fabric" },
  colorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sfifa: { type: sfifaSchema, required: function () { return !tailoringHasExpenses(this); } },
  trouserType: { type: String, enum: TAILORING_TROUSER_TYPES, required: function () { return this.garmentType === "trousers"; } },
  shirtType: { type: String, trim: true, minlength: 1, maxlength: 120, required: function () { return this.garmentType === "shirts"; } },
  photo: { type: String, default: "", match: /^(?:[a-f\d-]{36}\.(?:jpg|png|webp))?$/ },
  deliveredAt: { type: Date, default: null },
  deliveryFinancials: { type: deliveryFinancialsSchema },
  deliveredBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  cancelledAt: { type: Date },
  cancelledBy: { type: actorSchema },
  paymentReceipts: { type: [paymentReceiptSchema], default: [] },
  customerReceipt: { type: tailoringReceiptSchema, immutable: true },
  items: { type: [itemSchema], default: undefined },
}, { timestamps: true, optimisticConcurrency: true });
schema.pre("validate", function () {
  if (this.cancelledAt && (!this.deliveredAt || !this.cancelledBy || !this.deliveryFinancials)) this.invalidate("cancelledAt", "Cancellation requires delivery, financial snapshot and actor");
  if (this.cancelledBy && !this.cancelledAt) this.invalidate("cancelledBy", "Cancellation date is required");
  if (this.trouserCosting && this.garmentType !== "trousers") this.invalidate("trouserCosting", "Trouser labor rates require a trouser order");
  if (this.deliveryFinancials && !this.deliveredAt) this.invalidate("deliveryFinancials", "Delivery is required for recognized profit");
  for (const [index, item] of (this.items || []).entries()) {
    if (!item.fabricCost) continue;
    const cost = tailoringFabricCost({ fabricMeters: item.fabricMeters, fabricUnitPrice: item.fabricCost.fabricUnitPrice });
    if (tailoringGarmentType(this) !== "trousers" || !cost || (item.fabricSource === "client" ? item.fabricCost.fabricUnitPrice !== 0 : !(item.fabricCost.fabricUnitPrice > 0)) || tailoringMoneyCents(cost.fabricAmount) !== tailoringMoneyCents(item.fabricCost.fabricAmount)) this.invalidate("items." + index + ".fabricCost", "Invalid fabric cost snapshot");
  }
  if (!this.costing) return;
  if (!tailoringUsesSfifa(this) || !this.items?.length) { this.invalidate("costing", "Invalid cost snapshot"); return; }
  const expected = this.items.map(item => {
    if (!item.costs || (item.fabricSource === "client" ? item.costs.fabricUnitPrice !== 0 : !(item.costs.fabricUnitPrice > 0))) return null;
    const calculated = djellabaItemCosts({ fabricMeters: item.fabricMeters, fabricUnitPrice: item.costs.fabricUnitPrice, sfifa: item.sfifa }, this.costing.rates);
    if (!calculated || Object.keys(calculated).some(key => tailoringMoneyCents(calculated[key]) !== tailoringMoneyCents(item.costs[key]))) return null;
    return calculated;
  });
  const total = djellabaCostsTotal(expected);
  if (total === null || tailoringMoneyCents(total) !== tailoringMoneyCents(this.expenseAmount)) this.invalidate("expenseAmount", "Invalid cost snapshot");
});
schema.index({ idAdmin: 1, orderDate: -1, _id: -1 });
schema.index({ idAdmin: 1, requestId: 1 }, { unique: true });
export default mongoose.model("TailoringOrder", schema);
