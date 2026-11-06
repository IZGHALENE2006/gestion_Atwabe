import mongoose from 'mongoose';
export const productBatchSchema = new mongoose.Schema({
  batchId: { type: String, required: true }, number: { type: Number, required: true, min: 1 },
  requestHash: { type: String },
  barcode: { type: String, trim: true, default: undefined },
  initialQuantity: { type: Number, required: true, min: 0 }, quantite: { type: Number, required: true, min: 0 },
  prix_achat: { type: Number, required: true, min: 0 }, prix_vente: { type: Number, required: true, min: 0 },
  prix_gros: { type: Number, default: null, min: 0 },
  frais_total: { type: Number, default: 0, min: 0 }, frais_quantite: { type: Number, default: 0, min: 0 }, frais_unitaire: { type: Number, default: 0, min: 0 },
  fournisseur: { type: String, default: '' }, note: { type: String, default: '' }, receivedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId }, createdByName: String,
}, { _id: false });
