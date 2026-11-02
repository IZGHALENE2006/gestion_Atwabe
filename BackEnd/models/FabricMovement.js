import mongoose from "mongoose";
import { FABRIC_LIMITS, isFabricBarcode } from "../../shared/fabrics.js";

export const fabricMovementSchema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  fabricId: { type: mongoose.Schema.Types.ObjectId, required: true },
  colorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  pieceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  requestId: { type: String, required: true },
  type: { type: String, required: true, maxlength: FABRIC_LIMITS.text },
  reference: { type: String, default: "", maxlength: FABRIC_LIMITS.text },
  color: { type: String, required: true, maxlength: FABRIC_LIMITS.text },
  colorNumber: { type: String, default: "", maxlength: FABRIC_LIMITS.text },
  barcode: { type: String, required: true, validate: isFabricBarcode },
  beforeMeters: { type: Number, required: true, min: 0, max: FABRIC_LIMITS.meters },
  meters: { type: Number, required: true, min: 0.001, max: FABRIC_LIMITS.meters },
  remainingMeters: { type: Number, required: true, min: 0, max: FABRIC_LIMITS.meters },
  occurredAt: { type: Date, required: true },
});

const archiveSchema = fabricMovementSchema.clone();
archiveSchema.index({ idAdmin: 1, occurredAt: -1, _id: -1 });
archiveSchema.index({ idAdmin: 1, barcode: 1, occurredAt: -1 });
archiveSchema.index({ idAdmin: 1, fabricId: 1, requestId: 1 }, { unique: true });
export default mongoose.model("FabricMovement", archiveSchema);
