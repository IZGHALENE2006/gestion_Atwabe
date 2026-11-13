import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true }, requestId: { type: String, required: true }, fingerprint: { type: String, required: true },
  status: { type: String, enum: ['prepared', 'reserved', 'cancelling', 'cancelled', 'complete'], default: 'prepared' },
  plan: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ idAdmin: 1, requestId: 1 }, { unique: true });
schema.index({ idAdmin: 1, createdAt: -1 });
export default mongoose.model('FabricInvoice', schema);
