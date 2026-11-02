import mongoose from 'mongoose';
import { EXPENSE_REQUEST_PATTERN, MAX_EXPENSE_CENTS, SIDE_EXPENSE_TYPES, expenseKind, validExpenseMonth } from '../../shared/sideExpenses.js';

const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  requestId: { type: String, required: true, match: EXPENSE_REQUEST_PATTERN, immutable: true },
  type: { type: String, required: true, enum: SIDE_EXPENSE_TYPES, immutable: true },
  otherName: { type: String, trim: true, maxlength: 120, default: '', required() { return this.type === 'other'; }, immutable: true },
  amountCents: { type: Number, required: true, min: 1, max: MAX_EXPENSE_CENTS, validate: Number.isSafeInteger, immutable: true },
  month: { type: String, default: undefined, validate: value => value === undefined || validExpenseMonth(value), immutable: true },
  kind: { type: String, enum: ['fixed', 'variable'], default: undefined, immutable: true },
  monthlyKey: { type: String, default: undefined, immutable: true, required() { return Boolean(this.month) && expenseKind(this.type) === 'fixed'; } },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ idAdmin: 1, requestId: 1 }, { unique: true });
schema.index({ idAdmin: 1, createdAt: -1, _id: -1 });
schema.index({ idAdmin: 1, monthlyKey: 1 }, { unique: true, partialFilterExpression: { monthlyKey: { $type: 'string' } } });
export default mongoose.model('SideExpense', schema);
