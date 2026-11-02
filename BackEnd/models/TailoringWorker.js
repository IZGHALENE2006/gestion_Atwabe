import mongoose from "mongoose";
import { WORKER_CATEGORIES } from "../../shared/workers.js";

const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Admin" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, trim: true, required: true, maxlength: 160 },
  phone: { type: String, trim: true, required: true, maxlength: 40 },
  category: { type: String, enum: WORKER_CATEGORIES, required: function () { return !this.categories?.length; } },
  categories: { type: [{ type: String, enum: WORKER_CATEGORIES }], default: undefined, validate: values => values === undefined || (values.length > 0 && values.length <= WORKER_CATEGORIES.length && new Set(values).size === values.length) },
  requestId: { type: String, required: true },
  requestFingerprint: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ idAdmin: 1, category: 1, createdAt: -1, _id: -1 });
schema.index({ idAdmin: 1, requestId: 1 }, { unique: true });
export default mongoose.model("TailoringWorker", schema);
