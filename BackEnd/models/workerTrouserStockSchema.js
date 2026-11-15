import mongoose from 'mongoose';
import { trouserMeterUnits } from '../../shared/workerShopTrousers.js';

const id = () => ({ type: mongoose.Schema.Types.ObjectId, required: true });
export const trouserStockOperationSchema = new mongoose.Schema({
  requestId: { type: String, required: true },
  kind: { type: String, enum: ['assign', 'increase'], required: true },
  state: { type: String, enum: ['reserving', 'rollingBack', 'committed', 'failed'], required: true },
  rows: { type: [new mongoose.Schema({ colorId: id(), pieceId: id(), barcode: { type: String, required: true }, meters: { type: Number, required: true, validate: value => trouserMeterUnits(value) !== null && value > 0 } }, { _id: false })], required: true },
  failureCode: { type: String, default: undefined },
  createdBy: id(), date: { type: Date, required: true },
}, { _id: false });
