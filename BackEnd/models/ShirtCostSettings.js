import mongoose from 'mongoose';
import { tailoringMoneyCents } from '../../shared/tailoring.js';
const schema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, ref: 'Admin' },
  fourFillePrice: { type: Number, default: 0, validate: value => tailoringMoneyCents(value) !== null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, optimisticConcurrency: true });
export default mongoose.model('ShirtCostSettings', schema);
