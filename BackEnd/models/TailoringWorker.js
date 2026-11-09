import { tailoringMoneyCents } from "../../shared/tailoring.js";
import { validateWorkerPayment } from "../../shared/workerPayroll.js";
import mongoose from "mongoose";
import { WORKER_CATEGORIES } from "../../shared/workers.js";

const paymentSchema = new mongoose.Schema({
  requestId: { type: String, required: true, match: /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/ },
  type: { type: String, required: true, enum: ["settlement", "advance"] },
  amount: { type: Number, required: true, validate: value => tailoringMoneyCents(value) !== null && value > 0 },
  month: { type: String, required: true },
  paidOn: { type: String, required: true },
  note: { type: String, maxlength: 300, default: "" },
  createdAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdByName: { type: String, default: "", maxlength: 160 },
});
paymentSchema.pre("validate", function () {
  try { validateWorkerPayment(this, "9999-12-31"); }
  catch { this.invalidate("amount", "Invalid worker payment"); }
});
const schema = new mongoose.Schema({
  payments: { type: [paymentSchema], default: [] },
  deletedAt: { type: Date, default: undefined },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Admin" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, trim: true, required: true, maxlength: 160 },
  phone: { type: String, trim: true, required: true, maxlength: 40 },
  category: { type: String, enum: WORKER_CATEGORIES, required: function () { return !this.categories?.length; } },
  categories: { type: [{ type: String, enum: WORKER_CATEGORIES }], default: undefined, validate: values => values === undefined || (values.length > 0 && values.length <= WORKER_CATEGORIES.length && new Set(values).size === values.length) },
  requestId: { type: String, required: true },
  requestFingerprint: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.pre("validate", function () {
  if (new Set(this.payments.map(payment => payment.requestId)).size !== this.payments.length) this.invalidate("payments", "Repeated worker payment");
});
schema.index({ idAdmin: 1, "payments.requestId": 1 }, { unique: true, partialFilterExpression: { "payments.requestId": { $type: "string" } } });
schema.index({ idAdmin: 1, category: 1, createdAt: -1, _id: -1 });
schema.index({ idAdmin: 1, requestId: 1 }, { unique: true });
export default mongoose.model("TailoringWorker", schema);
