import mongoose from "mongoose";
import { DJELLABA_RATE_FIELDS } from "../../shared/tailoringCosts.js";
import { tailoringMoneyCents } from "../../shared/tailoring.js";
const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, ref: "Admin" },
  ...Object.fromEntries(DJELLABA_RATE_FIELDS.map(key => [key, { type: Number, required: true, validate: value => tailoringMoneyCents(value) !== null }])),
  updatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, optimisticConcurrency: true });
export default mongoose.model("DjellabaCostSettings", schema);
