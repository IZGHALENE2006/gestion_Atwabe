import mongoose from "mongoose";
import { INVOICE_TEXT_FIELDS, INVOICE_VISIBILITY_KEYS } from "../../shared/invoiceSettings.js";

export const invoiceSettingsSchema = new mongoose.Schema({
  ...Object.fromEntries(Object.entries(INVOICE_TEXT_FIELDS).map(([key, maxlength]) => [key, { type: String, trim: true, maxlength, default: "" }])),
  logo: { type: String, default: "" },
  visibility: Object.fromEntries(INVOICE_VISIBILITY_KEYS.map((key) => [key, { type: Boolean, default: true }])),
}, { _id: false });
