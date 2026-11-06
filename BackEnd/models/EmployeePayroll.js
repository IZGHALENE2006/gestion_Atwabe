import mongoose from 'mongoose';

export const employeeCompensationSchema = new mongoose.Schema({
  type: { type: String, enum: ['monthly', 'profitShare'], required: true },
  effectiveMonth: { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/, required: true },
  monthlyAmount: { type: Number, min: 0, max: 1e9, required: true },
}, { _id: false });
const planSchema = new mongoose.Schema({
  ...employeeCompensationSchema.obj,
  createdAt: { type: Date, required: true }, createdByName: String,
}, { _id: false });
const paymentSchema = new mongoose.Schema({
  requestId: { type: String, required: true },
  month: { type: String, required: true }, amount: { type: Number, min: 0.01, required: true },
  paidOn: { type: String, required: true }, note: String,
  reference: { type: String, required: true }, createdAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true }, createdByName: String,
  employeeName: { type: String, required: true }, employeePhone: String, employeeCin: String,
  compensationType: { type: String, enum: ['monthly', 'profitShare'], required: true },
  earned: { type: Number, required: true }, profit: { type: Number, required: true },
  paidBefore: { type: Number, required: true }, paidAfter: { type: Number, required: true }, remaining: { type: Number, required: true },
});
const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Employes' },
  plans: { type: [planSchema], default: [] }, payments: { type: [paymentSchema], default: [] },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ idAdmin: 1, employeeId: 1 }, { unique: true });
export default mongoose.model('EmployeePayroll', schema);
