import mongoose from 'mongoose';
import { tailoringMoneyCents } from '../../shared/tailoring.js';
const money = { type: Number, required: true, validate: value => tailoringMoneyCents(value) !== null };
const discount = new mongoose.Schema({ type: { type: String, enum: ['amount', 'percent'], required: true }, value: { ...money } }, { _id: false });
export const tailoringItemPricingSchema = new mongoose.Schema({
  basePrice: { ...money }, fourFille: { type: Boolean, required: true }, fourFilleAmount: { ...money }, grossPrice: { ...money }, discount: { type: discount, required: true }, discountAmount: { ...money },
}, { _id: false });
export const tailoringAdjustmentsSchema = new mongoose.Schema({
  version: { type: Number, enum: [1], required: true }, fourFilleUnitPrice: { ...money },
  settingsVersion: { type: Number, default: null, validate: value => value === null || Number.isSafeInteger(value) && value >= 0 },
  subtotal: { ...money }, discount: { type: discount, required: true }, discountAmount: { ...money },
}, { _id: false });
