import mongoose from "mongoose";
import { tailoringMoneyCents } from "../../shared/tailoring.js";
import { TROUSER_LABOR_RATE_FIELDS } from "../../shared/tailoringCosts.js";
const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, ref: "Admin" },
  laborPrice: { type: Number, validate: value => tailoringMoneyCents(value) !== null },
  ...Object.fromEntries(TROUSER_LABOR_RATE_FIELDS.map(key => [key, { type: Number, required: function () { return this.laborPrice == null || TROUSER_LABOR_RATE_FIELDS.some(field => this[field] != null); }, validate: value => tailoringMoneyCents(value) !== null }])),
  updatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, optimisticConcurrency: true });
export default mongoose.model("TrouserCostSettings", schema);
