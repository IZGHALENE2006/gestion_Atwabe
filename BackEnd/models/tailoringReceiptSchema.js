import { tailoringItemPricingSchema, tailoringAdjustmentsSchema } from './tailoringPricingSchema.js';
import mongoose from 'mongoose';
import { TAILORING_GARMENT_TYPES, TAILORING_SOURCES, SFIFA_WIDTHS, SFIFA_STYLES, tailoringMoneyCents } from '../../shared/tailoring.js';
const money = { type: Number, required: true, validate: value => tailoringMoneyCents(value) !== null };
const sfifa = new mongoose.Schema({ width: { type: String, enum: SFIFA_WIDTHS }, style: { type: String, enum: SFIFA_STYLES }, color1: String, color2: String }, { _id: false });
const item = new mongoose.Schema({
  pricing: { type: tailoringItemPricingSchema },
  number: { type: Number, required: true }, price: { ...money }, fabricSource: { type: String, enum: TAILORING_SOURCES, required: true },
  fabricType: { type: String, required: true }, fabricReference: String, fabricColor: String, fabricMeters: Number,
  trouserType: String, shirtType: String, sfifa: { type: sfifa },
}, { _id: false });
export const tailoringReceiptSchema = new mongoose.Schema({
  adjustments: { type: tailoringAdjustmentsSchema },
  kind: { type: String, enum: ['order', 'payment'], required: true }, reference: { type: String, required: true },
  orderBarcode: { type: String, required: true }, issuedAt: { type: Date, required: true }, historical: { type: Boolean, required: true },
  garmentType: { type: String, enum: TAILORING_GARMENT_TYPES, required: true }, clientName: { type: String, required: true }, phone: { type: String, required: true },
  orderDate: { type: String, required: true }, readyDate: { type: String, required: true },
  totalPrice: { ...money }, paidAmount: { ...money }, remainingAmount: { ...money }, paymentAmount: { ...money, required: function () { return this.kind === 'payment'; } },
  items: { type: [item], required: true },
}, { _id: false });
