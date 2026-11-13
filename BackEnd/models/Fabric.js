import mongoose from "mongoose";
import { FABRIC_LIMITS, validateFabric } from "../../shared/fabrics.js";
import { fabricMovementSchema } from "./FabricMovement.js";
import { workerMaterialDebitSchema } from './workerMaterialSchema.js';

const pieceSchema = new mongoose.Schema({
  meters: { type: Number, required: true, min: 0, max: FABRIC_LIMITS.meters },
  barcode: { type: String, required: true, trim: true },
});
const colorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: FABRIC_LIMITS.text },
  number: { type: String, trim: true, maxlength: FABRIC_LIMITS.text, default: "" },
  pieces: { type: [pieceSchema], required: true },
});
const fabricSchema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Admin" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, required: true, trim: true, maxlength: FABRIC_LIMITS.text },
  reference: { type: String, trim: true, maxlength: FABRIC_LIMITS.text, default: "" },
  purchasePricePerMeter: { type: Number, min: 0, max: FABRIC_LIMITS.pricePerMeter },
  wholesalePricePerMeter: { type: Number, min: 0.01, max: FABRIC_LIMITS.pricePerMeter },
  salePricePerMeter: { type: Number, min: 0.01, max: FABRIC_LIMITS.pricePerMeter },
  photo: { type: String, default: "" },
  colors: { type: [colorSchema], required: true },
  movements: { type: [fabricMovementSchema], default: [] },
  invoiceDebits: { type: [new mongoose.Schema({ invoiceId: { type: mongoose.Schema.Types.ObjectId, required: true }, recordedAt: Date, returnedAt: Date, rows: { type: [new mongoose.Schema({ colorId: mongoose.Schema.Types.ObjectId, pieceId: mongoose.Schema.Types.ObjectId, barcode: String, meters: Number, beforeMeters: Number, remainingMeters: Number }, { _id: false })], required: true } }, { _id: false })], default: undefined },
  tailoringStockOperations: { type: [new mongoose.Schema({ operationId: { type: String, required: true }, orderId: { type: mongoose.Schema.Types.ObjectId, required: true }, date: { type: Date, required: true }, returnedAt: Date }, { _id: false })], default: undefined },
  tailoringOrderIds: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
  workerMaterialDebits: { type: [workerMaterialDebitSchema], default: undefined },
}, { timestamps: true, optimisticConcurrency: true });

fabricSchema.pre("validate", function () {
  validateFabric(this.toObject(), { allowZeroMeters: true });
});
fabricSchema.index({ idAdmin: 1, createdAt: -1 });
fabricSchema.index({ idAdmin: 1, "colors.pieces.barcode": 1 }, { unique: true });
export default mongoose.model("Fabric", fabricSchema);
