import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true }, requestId: { type: String, required: true },
  fingerprint: { type: String, required: true },
  status: { type: String, enum: ['prepared', 'cancelling', 'complete', 'cancelled'], default: 'prepared' },
  plan: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });
schema.index({ idAdmin: 1, requestId: 1 }, { unique: true });
export default mongoose.model('CashCheckout', schema);
