import mongoose from "mongoose";
import { tailoringMoneyCents } from "../../shared/tailoring.js";
const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, ref: "Admin" },
  laborPrice: { type: Number, required: true, validate: value => tailoringMoneyCents(value) !== null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, optimisticConcurrency: true });
export default mongoose.model("TrouserCostSettings", schema);
