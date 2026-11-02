import mongoose from "mongoose";
import { NON_INVOICE_DOCUMENT_TYPES } from "../../shared/salesDocuments.js";

const salesDocumentSchema = new mongoose.Schema({
  idAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdByRole: { type: String, enum: ["admin", "Employe"], required: true },
  requestId: { type: String, required: true },
  requestHash: { type: String, required: true, select: false },
  documentType: { type: String, enum: NON_INVOICE_DOCUMENT_TYPES, required: true },
  reference: { type: String, required: true },
  documentDate: { type: String, required: true },
  DateFacture: { type: Date, required: true },
  nameEmp: { type: String, required: true },
  clientName: { type: String, trim: true, maxlength: 160, default: "" },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
  note: { type: String, trim: true, maxlength: 1000, default: "" },
  stockUpdated: { type: Boolean, required: true, default: false },
  Product: [{
    _id: false,
    idProduct: { type: mongoose.Schema.Types.ObjectId, ref: "Products", required: true },
    batchId: String, batchNumber: Number,
    code: String, name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantite: { type: Number, required: true, min: 1 },
    subtotal: Number, TotalPrix: Number, totalHT: Number, totalTTC: Number,
    discountType: { type: String, enum: ["percent", "amount"] },
    discountValue: Number, discountAmount: Number,
    vatRate: { type: Number, min: 0, max: 100 }, vatAmount: Number,
  }],
  TotalQauntite: Number, subtotal: Number, TotalPrix: Number,
  totalHT: Number, vatRate: Number, vatAmount: Number,
  discountAmount: Number, lineDiscountAmount: Number, orderDiscountAmount: Number,
}, { timestamps: true });

salesDocumentSchema.index({ idAdmin: 1, createdBy: 1, requestId: 1 }, { unique: true });
salesDocumentSchema.index({ idAdmin: 1, DateFacture: -1 });

export default mongoose.model("SalesDocument", salesDocumentSchema);
