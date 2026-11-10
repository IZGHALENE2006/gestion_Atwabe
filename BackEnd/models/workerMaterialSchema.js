import mongoose from 'mongoose';
import { WORKER_SFIFA_METERS, WORKER_GARMENT_SIZES } from '../../shared/workerMaterials.js';
import { SFIFA_METER_TYPES, sfifaQuantityUnits } from '../../shared/sfifaStock.js';
import { tailoringMoneyCents } from '../../shared/tailoring.js';

const id = () => ({ type: mongoose.Schema.Types.ObjectId, required: true });
export const workerMaterialDebitSchema = new mongoose.Schema({
  operationId: { type: String, required: true }, workId: id(),
  date: { type: Date, required: true }, returnedAt: { type: Date, default: undefined },
}, { _id: false });
export const workerMaterialRowSchema = new mongoose.Schema({
  size: { type: String, enum: WORKER_GARMENT_SIZES, default: undefined },
  unitWage: { type: Number, default: undefined, validate: value => value === undefined || tailoringMoneyCents(value) !== null },
  lineId: { type: String, required: true }, fabricId: id(), colorId: id(), pieceId: id(), sfifaId: id(), variantId: id(),
  meters: { type: Number, required: true, validate: value => sfifaQuantityUnits(value) !== null && value > 0 },
  sfifaMeters: { type: Number, required: true, enum: [WORKER_SFIFA_METERS] },
  fabricType: { type: String, required: true }, fabricColor: { type: String, required: true }, fabricReference: String,
  pieceBarcode: { type: String, required: true }, sfifaWidth: { type: String, required: true },
  sfifaFamily: { type: String, required: true }, sfifaCode: { type: Number, default: undefined },
  sfifaStyle: { type: String, enum: SFIFA_METER_TYPES, default: undefined },
}, { _id: false });
export const workerMaterialOperationSchema = new mongoose.Schema({
  requestId: { type: String, required: true }, kind: { type: String, required: true, enum: ['assign', 'increase'] },
  state: { type: String, required: true, enum: ['reserving', 'rollingBack', 'committed', 'failed'] },
  rows: { type: [workerMaterialRowSchema], required: true }, failureCode: { type: String, default: undefined },
  createdBy: id(), date: { type: Date, required: true },
}, { _id: false });
export const workerMaterialCancellationSchema = new mongoose.Schema({
  requestId: { type: String, required: true }, createdBy: id(), date: { type: Date, required: true },
}, { _id: false });
