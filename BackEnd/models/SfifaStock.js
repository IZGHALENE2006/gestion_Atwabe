import mongoose from "mongoose";
import WorkerWork from "./WorkerWork.js";
import { SFIFA_STOCK_FAMILIES, SFIFA_STOCK_GROUP_LIMIT, SFIFA_STOCK_LIMIT, SFIFA_STOCK_WIDTHS, sfifaCodeNumber, sfifaQuantityUnits } from "../../shared/sfifaStock.js";

const receiptSchema = new mongoose.Schema({
  requestId: { type: String, required: true, match: /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/ },
  quantity: { type: Number, required: true, validate: value => sfifaQuantityUnits(value) !== null && value > 0 },
  code: { type: Number, default: undefined },
  workId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: "TailoringWorker", default: undefined },
  workerName: { type: String, trim: true, maxlength: 160, default: undefined },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  date: { type: Date, required: true },
}, { _id: false });
const variantSchema = new mongoose.Schema({
  code: { type: Number, required: true, validate: Number.isSafeInteger },
  quantity: { type: Number, required: true, min: 0, max: SFIFA_STOCK_LIMIT, validate: value => sfifaQuantityUnits(value) !== null },
});
// Production and stock share one optimistic write, including on standalone MongoDB.
const productionSchema = WorkerWork.schema.clone();
productionSchema.clearIndexes();
productionSchema.set("excludeIndexes", true);
const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Admin" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  width: { type: String, enum: SFIFA_STOCK_WIDTHS, required: true },
  family: { type: String, enum: SFIFA_STOCK_FAMILIES.map(family => family.value), required: true },
  quantity: { type: Number, required: true, min: 0, max: SFIFA_STOCK_GROUP_LIMIT, validate: value => sfifaQuantityUnits(value, { max: SFIFA_STOCK_GROUP_LIMIT }) !== null },
  unassignedQuantity: { type: Number, default: undefined, min: 0, max: SFIFA_STOCK_LIMIT, validate: value => value === undefined || sfifaQuantityUnits(value) !== null },
  variants: { type: [variantSchema], default: undefined },
  receipts: { type: [receiptSchema], default: [] },
  production: { type: [productionSchema], default: undefined },
}, { timestamps: true, optimisticConcurrency: true });
schema.pre("validate", function () {
  const requests = new Set();
  const receipts = new Map(this.receipts.map(receipt => [receipt.requestId, receipt]));
  for (const work of this.production || []) {
    if (work.category !== "sfifa" || work.sfifa?.width !== this.width || work.sfifa?.family !== this.family || String(work.idAdmin) !== String(this.idAdmin) || requests.has(work.requestId)) this.invalidate("production", "Invalid sfifa production work");
    requests.add(work.requestId);
    for (const event of work.completions) {
      const receipt = receipts.get(event.requestId);
      if (!receipt || String(receipt.workId) !== String(work._id) || String(receipt.workerId) !== String(work.workerId) || receipt.code !== work.sfifa?.code || receipt.quantity !== event.quantity) this.invalidate("production", "Missing or inconsistent production receipt");
    }
  }
  if (new Set(this.receipts.map(receipt => receipt.requestId)).size !== this.receipts.length) this.invalidate("receipts", "Repeated stock receipt");
  for (const receipt of this.receipts) if (receipt.code !== undefined && sfifaCodeNumber(receipt.code, this.family) === null) this.invalidate("receipts", "Invalid sfifa number");
  if (this.variants !== undefined) {
    if (this.unassignedQuantity === undefined) this.invalidate("unassignedQuantity", "Missing unassigned balance");
    const codes = new Set();
    let total = sfifaQuantityUnits(this.unassignedQuantity) ?? 0;
    for (const variant of this.variants) {
      if (sfifaCodeNumber(variant.code, this.family) === null || codes.has(variant.code)) this.invalidate("variants", "Invalid or repeated sfifa number");
      codes.add(variant.code); total += sfifaQuantityUnits(variant.quantity) ?? 0;
    }
    if (total !== sfifaQuantityUnits(this.quantity, { max: SFIFA_STOCK_GROUP_LIMIT })) this.invalidate("quantity", "Inconsistent sfifa balance");
  }
});
schema.index({ idAdmin: 1, width: 1, family: 1 }, { unique: true });
schema.index({ idAdmin: 1, "receipts.requestId": 1 }, { unique: true, partialFilterExpression: { "receipts.requestId": { $type: "string" } } });
schema.index({ idAdmin: 1, "production.requestId": 1 }, { unique: true, partialFilterExpression: { "production.requestId": { $type: "string" } } });
schema.index({ idAdmin: 1, "production.workerId": 1 });
export default mongoose.model("SfifaStock", schema);
