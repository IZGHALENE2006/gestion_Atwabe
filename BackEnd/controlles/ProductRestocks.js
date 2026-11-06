import Employee from '../models/EmployeModele.js';
import { canEmployeeOperation } from '../../shared/employeePermissions.js';
import { generatedProductBatchBarcode } from "../../shared/productBarcodes.js";
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import Product from '../models/productModel.js';
import Admin from '../models/AdminModel.js';
import { normalizeRestock, receivedProductBatches, hasProductBatches, batchFail } from '../../shared/productBatches.js';
import { productVersionScope } from '../utils/productStock.js';

export async function restockProduct(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw batchFail('productBatchUnavailable', 404);
    const input = normalizeRestock(req.body);
    const actor = await (req.user.role === 'admin' ? Admin : Employee).findById(req.user.id);
    if (!actor || !canEmployeeOperation(req.user.role, actor, 'products', 'restock')) throw batchFail('Forbidden', 403);
    const owner = req.user.role === 'admin' ? actor._id : actor.idAdmin;
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    for (let attempt = 0; attempt < 12; attempt++) {
      const product = await Product.findOne({ _id: req.params.id, idAdmin: owner });
      if (!product) throw batchFail('productBatchUnavailable', 404);
      const batches = receivedProductBatches(product);
      const previous = batches.find(batch => batch.batchId === input.requestId);
      if (previous) {
        if (previous.requestHash !== fingerprint) throw batchFail('productRestockRequestConflict', 409);
        return res.json(product);
      }
      if (!Number.isSafeInteger(Number(product.quantite)) || product.quantite < 0 || !Number.isSafeInteger(product.quantite + input.quantite)) throw batchFail('productRestockInvalidQuantity');
      if (batches.length >= 1000) throw batchFail('productRestockLimit');
      const { requestId, ...values } = input;
      const number = Math.max(...batches.map(batch => batch.number)) + 1;
      batches.push({ ...values, barcode: generatedProductBatchBarcode(product, number), batchId: requestId, number, initialQuantity: input.quantite,
        receivedAt: new Date(), createdBy: actor._id, createdByName: actor.name, requestHash: fingerprint });
      const saved = await Product.findOneAndUpdate({ _id: product._id, idAdmin: owner, ...productVersionScope(product), quantite: product.quantite,
        stockBatches: hasProductBatches(product) ? product.stockBatches : { $exists: false },
        prix_achat: product.prix_achat, prix_vente: product.prix_vente, prix_gros: product.prix_gros,
      }, { $set: { stockBatches: batches, prix_vente: input.prix_vente, prix_gros: input.prix_gros, dateupdate: new Date() }, $inc: { quantite: input.quantite, __v: 1 } }, { new: true, runValidators: true });
      if (saved) return res.status(201).json(saved);
    }
    throw batchFail('productBatchStockChanged', 409);
  } catch (error) {
    const validation = ['invalidPrice', 'invalidWholesalePrice', 'invalidFees', 'invalidFeeQuantity'].includes(error.message) || ['ValidationError', 'CastError'].includes(error.name);
    return res.status(error.status || (validation ? 400 : 500)).json({ message: error.status || validation ? error.message : 'productRestockFailed' });
  }
}
