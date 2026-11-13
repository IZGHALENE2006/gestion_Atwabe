import { tailoringItemPricingSchema, tailoringAdjustmentsSchema } from "./tailoringPricingSchema.js";
import { quoteTailoringAdjustments, publicTailoringItemPricing, tailoringAllowsFourFille } from "../../shared/tailoringAdjustments.js";
import { SFIFA_METER_TYPES, sfifaQuantityUnits } from "../../shared/sfifaStock.js";
import mongoose from "mongoose";
import { createFabricSaleFinancials } from "../../shared/fabricProfits.js";
import { TAILORING_MEASUREMENT_FIELDS, TAILORING_MEASUREMENT_NOTES_LIMIT, tailoringMeasurement, validateTailoringMeasurementNotes } from "../../shared/tailoringMeasurements.js";
import { tailoringReceiptSchema } from './tailoringReceiptSchema.js';
import { SFIFA_STYLES, SFIFA_WIDTHS, TAILORING_SOURCES, TAILORING_GARMENT_TYPES, TAILORING_TROUSER_TYPES, validTailoringDate, tailoringMoneyCents, tailoringHasExpenses, tailoringFabricMeters, tailoringGarmentType, tailoringUsesSfifa } from "../../shared/tailoring.js";

import { DJELLABA_RATE_FIELDS, DJELLABA_SFIFA_COST_FIELDS, TROUSER_LABOR_RATE_FIELDS, validateDjellabaRates, djellabaItemCosts, djellabaCostsTotal, djellabaItemSalePrice, tailoringFabricCost } from "../../shared/tailoringCosts.js";

const costMoney = { type: Number, required: true, validate: value => tailoringMoneyCents(value) !== null };
const itemCostsSchema = new mongoose.Schema({ ...Object.fromEntries(["fabricUnitPrice", "fabricAmount", "sfifaAmount", "laborAmount", "totalAmount"].map(key => [key, { ...costMoney }])), sfifaCostAmount: { ...costMoney, required: false } }, { _id: false });
const fabricCostSchema = new mongoose.Schema(Object.fromEntries(["fabricUnitPrice", "fabricAmount"].map(key => [key, { ...costMoney }])), { _id: false });
const ratesSchema = new mongoose.Schema({ ...Object.fromEntries(DJELLABA_RATE_FIELDS.map(key => [key, { ...costMoney }])), ...Object.fromEntries(DJELLABA_SFIFA_COST_FIELDS.map(key => [key, { ...costMoney, required: false }])) }, { _id: false });
const costingSchema = new mongoose.Schema({ pricingVersion: { type: Number, enum: [2, 3] }, rates: { type: ratesSchema, required: true }, settingsVersion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }, calculatedAt: { type: Date, required: true } }, { _id: false });

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
const sfifaSelectionSchema = new mongoose.Schema({
  stockId: { type: mongoose.Schema.Types.ObjectId, required: true }, variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  family: String, code: Number, meters: { type: Number, required: true, validate: value => (sfifaQuantityUnits(value) ?? 0) > 0 }, meterType: { type: String, enum: SFIFA_METER_TYPES },
}, { _id: false });
const sfifaStockRowSchema = new mongoose.Schema({
  ...sfifaSelectionSchema.obj, lineId: { type: String, required: true }, width: { type: String, enum: SFIFA_WIDTHS, required: true }, family: { type: String, required: true }, code: Number,
}, { _id: false });
const sfifaSchema = new mongoose.Schema({
  stock: { type: sfifaSelectionSchema },
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
const fabricSaleSchema = new mongoose.Schema({
  occurredAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdByName: { type: String, default: '', maxlength: 120 },
  createdByRole: { type: String, enum: ['admin', 'Employe'], required: true },
  purchaseUnitPrice: { type: Number, min: 0, max: 1000000 },
  costAmount: { type: Number, min: 0, max: 1000000000000 },
  profitAmount: { type: Number, min: -1000000000000, max: 1000000000000 },
}, { _id: false });
const itemSchema = new mongoose.Schema({
  pricing: { type: tailoringItemPricingSchema },
  fabricPieceId: { type: mongoose.Schema.Types.ObjectId },
  fabricPieceBarcode: { type: String },
  fabricSale: { type: fabricSaleSchema },
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
  adjustments: { type: tailoringAdjustmentsSchema },
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Admin" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  creator: { type: new mongoose.Schema({ id: { type: mongoose.Schema.Types.ObjectId, required: true }, name: { type: String, default: "" }, role: { type: String, enum: ["admin", "Employe"], required: true } }, { _id: false }), immutable: true },
  garmentType: { type: String, enum: TAILORING_GARMENT_TYPES, immutable: true },
  stockOperation: { type: mongoose.Schema.Types.Mixed },
  fabricStock: { type: new mongoose.Schema({ version: { type: Number, enum: [1], required: true }, returnedAt: Date, rows: { type: [new mongoose.Schema({ fabricId: { type: mongoose.Schema.Types.ObjectId, required: true }, colorId: { type: mongoose.Schema.Types.ObjectId, required: true }, pieceId: { type: mongoose.Schema.Types.ObjectId, required: true }, barcode: { type: String, required: true }, meters: { type: Number, required: true, validate: value => tailoringFabricMeters(value) !== null } }, { _id: false })], required: true } }, { _id: false }) },
  sfifaStock: { type: new mongoose.Schema({ version: { type: Number, enum: [1], required: true }, returnedAt: Date, rows: { type: [sfifaStockRowSchema], required: true } }, { _id: false }) },
  fabricSalesVersion: { type: Number, enum: [1] },
  trouserCosting: { type: new mongoose.Schema({
    laborPrice: { ...costMoney, required: false },
    ...Object.fromEntries(TROUSER_LABOR_RATE_FIELDS.map(key => [key, { ...costMoney, required: function () { return this.laborPrice == null || TROUSER_LABOR_RATE_FIELDS.some(field => this[field] != null); } }])),
    settingsVersion: { type: Number, default: null, validate: value => value === null || Number.isSafeInteger(value) && value >= 0 }, calculatedAt: { type: Date, required: true },
  }, { _id: false }) },
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
  deliveryFabricItems: { type: [itemSchema], default: undefined },
}, { timestamps: true, optimisticConcurrency: true });
schema.pre("validate", function () {
  if (this.adjustments) {
    try {
      if (!tailoringAllowsFourFille(this.garmentType) && (this.adjustments.fourFilleUnitPrice !== 0 || this.items?.some(item => item.pricing?.fourFille))) throw new Error("4fille is unavailable for this garment");
      if (!this.items?.length || this.items.some(item => !item.pricing)) throw new Error("Missing piece pricing");
      const quote = quoteTailoringAdjustments(this.items.map(item => ({ price: item.pricing.basePrice, fourFille: item.pricing.fourFille, discount: item.pricing.discount })), this.adjustments.fourFilleUnitPrice, this.adjustments.discount);
      if (quote.totalPrice !== this.totalPrice || quote.adjustments.subtotal !== this.adjustments.subtotal || quote.adjustments.discountAmount !== this.adjustments.discountAmount || quote.items.some((item, i) => item.price !== this.items[i].price || JSON.stringify(item.pricing) !== JSON.stringify(publicTailoringItemPricing(this.items[i].pricing)))) throw new Error("Inconsistent pricing");
    } catch { this.invalidate("adjustments", "Invalid price adjustments"); }
  } else if (this.items?.some(item => item.pricing)) this.invalidate("adjustments", "Price adjustments are required");
  if (this.cancelledAt && (!this.cancelledBy || (!this.deliveredAt && !this.fabricStock && !this.sfifaStock) || (this.deliveredAt && !this.deliveryFinancials))) this.invalidate("cancelledAt", "Cancellation requires delivery, financial snapshot and actor");
  if (this.cancelledBy && !this.cancelledAt) this.invalidate("cancelledBy", "Cancellation date is required");
  if (this.trouserCosting && this.garmentType !== "trousers") this.invalidate("trouserCosting", "Trouser labor rates require a trouser order");
  if (this.deliveryFinancials && !this.deliveredAt) this.invalidate("deliveryFinancials", "Delivery is required for recognized profit");
  for (const [index, item] of (this.items || []).entries()) {
    if (!item.fabricCost) continue;
    const cost = tailoringFabricCost({ fabricMeters: item.fabricMeters, fabricUnitPrice: item.fabricCost.fabricUnitPrice });
    if (tailoringGarmentType(this) !== "trousers" || !cost || (item.fabricSource === "client" ? item.fabricCost.fabricUnitPrice !== 0 : !(item.fabricCost.fabricUnitPrice > 0)) || tailoringMoneyCents(cost.fabricAmount) !== tailoringMoneyCents(item.fabricCost.fabricAmount)) this.invalidate("items." + index + ".fabricCost", "Invalid fabric cost snapshot");
  }
  for (const [index, item] of (this.items || []).entries()) {
    if (!item.fabricSale) continue;
    if (!(this.costing?.pricingVersion >= 2 || this.fabricSalesVersion === 1 && this.garmentType === 'trousers') || item.fabricSource !== 'shop' || !(item.costs || item.fabricCost)) { this.invalidate('items.' + index + '.fabricSale', 'Shop cloth pricing snapshot required'); continue; }
    const expected = createFabricSaleFinancials(item.fabricMeters, item.fabricSale.purchaseUnitPrice, (item.costs || item.fabricCost).fabricAmount);
    if (['costAmount', 'profitAmount'].some(key => item.fabricSale[key] !== expected[key])) this.invalidate('items.' + index + '.fabricSale', 'Invalid cloth financial snapshot');
  }
  if (!this.costing) return;
  if (!tailoringUsesSfifa(this) || !this.items?.length) { this.invalidate("costing", "Invalid cost snapshot"); return; }
  if (this.costing.pricingVersion === 3) {
    try { validateDjellabaRates(this.costing.rates, this.garmentType, 3); }
    catch { this.invalidate("costing.rates", "Sfifa cost and sale rates are required"); }
  }
  const expected = this.items.map(item => {
    if (!item.costs || (item.fabricSource === "client" ? item.costs.fabricUnitPrice !== 0 : !(item.costs.fabricUnitPrice > 0))) return null;
    const calculated = djellabaItemCosts({ fabricMeters: item.fabricMeters, fabricUnitPrice: item.costs.fabricUnitPrice, sfifa: item.sfifa }, this.costing.rates, this.costing.pricingVersion);
    if (!calculated || Object.keys(calculated).some(key => tailoringMoneyCents(calculated[key]) !== tailoringMoneyCents(item.costs[key]))) return null;
    return calculated;
  });
  if (this.costing.pricingVersion >= 2 && this.items.some((item, index) => !expected[index] || tailoringMoneyCents(this.adjustments ? item.pricing?.basePrice : item.price) !== tailoringMoneyCents(djellabaItemSalePrice(expected[index])))) this.invalidate('items', 'Invalid automatic sale prices');
  const total = djellabaCostsTotal(expected);
  if (total === null || tailoringMoneyCents(total) !== tailoringMoneyCents(this.expenseAmount)) this.invalidate("expenseAmount", "Invalid cost snapshot");
});
schema.index({ idAdmin: 1, orderDate: -1, _id: -1 });
schema.index({ idAdmin: 1, requestId: 1 }, { unique: true });
export default mongoose.model("TailoringOrder", schema);
