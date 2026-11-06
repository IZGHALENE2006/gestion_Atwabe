import { isProductBatchBarcode } from "../../shared/productBarcodes.js";
import { hasProductBatches, receivedProductBatches, productBatches, batchFail } from '../../shared/productBatches.js';
import { productVersionScope } from '../utils/productStock.js';
import ProductModel from '../models/productModel.js';
import CategoryModel from '../models/Category.js';
import { deleteProductImage, saveProductImage } from '../utils/productImages.js';
import { resolveProductFees } from '../../shared/productFees.js';
import { roundMoney } from '../../shared/saleTotals.js';

const errorStatus = (error) => error.status || (['ValidationError', 'CastError'].includes(error.name) || ['invalidWholesalePrice', 'invalidPrice', 'invalidFees', 'invalidFeeQuantity'].includes(error.message) ? 400 : 500);
const publicProduct = product => {
  const value = product.toObject ? product.toObject() : { ...product };
  if (hasProductBatches(product)) {
    value.stockBatches = receivedProductBatches(product);
    const latest = productBatches(product).at(-1);
    value.prix_vente = latest.prix_vente;
    value.prix_gros = latest.prix_gros;
  }
  return value;
};
const withCategory = (product, category) => ({
  ...publicProduct(product),
  categorie: { _id: category._id, name: category.name },
});

export const CreateProduct = async (req, res) => {
  let uploadedImage = '';
  try {
    const { name, quantite, barcode, prix_achat, categorie, fournisseur, datecreate, status } = req.body;
    const cleanBarcode = String(barcode || '').trim();
    const pricing = resolveProductFees(req.body);
    const category = await CategoryModel.findOne({ _id: categorie, idAdmin: req.user.idAdmin });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    if (!cleanBarcode) return res.status(400).json({ message: 'Barcode is required' });
    if (isProductBatchBarcode(cleanBarcode)) throw batchFail('productBatchBarcodeReserved');
    const barcodeExists = await ProductModel.findOne({ idAdmin: req.user.idAdmin, $or: [{ barcode: cleanBarcode }, { 'stockBatches.barcode': cleanBarcode }] });
    if (barcodeExists) return res.status(400).json({ message: 'Barcode already exists' });

    uploadedImage = await saveProductImage(req.file);
    const product = await ProductModel.create({
      idAdmin: req.user.idAdmin, name, quantite: Number(quantite), barcode: cleanBarcode,
      prix_achat, ...pricing, profite: roundMoney(pricing.prix_vente - Number(prix_achat) - pricing.frais_unitaire),
      categorie: category._id, fournisseur, datecreate, status, image: uploadedImage,
    });
    uploadedImage = '';
    return res.status(201).json(withCategory(product, category));
  } catch (error) {
    await deleteProductImage(uploadedImage);
    return res.status(errorStatus(error)).json({ message: error.message });
  }
};

export const AllProduct = async (req, res) => {
  try {
    const products = await ProductModel.find({ idAdmin: req.user.idAdmin }).populate('categorie', 'name');
    res.status(200).json(products.map(publicProduct));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const DeleteProduct = async (req, res) => {
  try {
    const product = await ProductModel.findOneAndDelete({ _id: req.params.id, idAdmin: req.user.idAdmin });
    if (!product) return res.status(404).json({ message: 'Not Found' });
    await deleteProductImage(product.image);
    return res.status(200).json(product);
  } catch (error) {
    return res.status(errorStatus(error)).json({ message: error.message });
  }
};

export const UpdateProduit = async (req, res) => {
  let uploadedImage = '';
  try {
    const filter = { _id: req.params.id, idAdmin: req.user.idAdmin };
    const currentProduct = await ProductModel.findOne(filter);
    if (!currentProduct) return res.status(404).json({ message: 'Not Found' });
    const { name, quantite, prix_achat, categorie, fournisseur, barcode, removeImage } = req.body;
    const pricing = resolveProductFees(req.body, currentProduct);
    if (hasProductBatches(currentProduct) && ((quantite !== undefined && Number(quantite) !== currentProduct.quantite) ||
      (prix_achat !== undefined && Number(prix_achat) !== currentProduct.prix_achat) ||
      Object.keys(pricing).some(key => pricing[key] !== currentProduct[key]))) throw batchFail('productBatchEditLocked', 409);
    const cleanBarcode = String(barcode || '').trim();
    const category = await CategoryModel.findOne({ _id: categorie, idAdmin: req.user.idAdmin });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    if (!cleanBarcode) return res.status(400).json({ message: 'Barcode is required' });
    if (cleanBarcode !== currentProduct.barcode && isProductBatchBarcode(cleanBarcode)) throw batchFail('productBatchBarcodeReserved');
    const barcodeExists = await ProductModel.findOne({
      idAdmin: req.user.idAdmin, $or: [{ barcode: cleanBarcode }, { 'stockBatches.barcode': cleanBarcode }], _id: { $ne: req.params.id },
    });
    if (barcodeExists) return res.status(400).json({ message: 'Barcode already exists' });

    const update = {
      name, quantite: Number(quantite), barcode: cleanBarcode, prix_achat, ...pricing,
      profite: roundMoney(pricing.prix_vente - Number(prix_achat) - pricing.frais_unitaire), categorie: category._id, fournisseur,
      dateupdate: new Date(),
    };
    if (hasProductBatches(currentProduct)) {
      update.stockBatches = receivedProductBatches(currentProduct);
      for (const key of ['quantite', 'prix_achat', 'prix_vente', 'prix_gros', 'frais_total', 'frais_quantite', 'frais_unitaire', 'profite']) delete update[key];
    }
    if (req.file) {
      uploadedImage = await saveProductImage(req.file);
      update.image = uploadedImage;
    } else if (removeImage === true || removeImage === 'true') {
      update.image = '';
    }
    const product = await ProductModel.findOneAndUpdate({ ...filter, ...productVersionScope(currentProduct), quantite: currentProduct.quantite, stockBatches: hasProductBatches(currentProduct) ? currentProduct.stockBatches : { $exists: false } }, { $set: update, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (!product) {
      await deleteProductImage(uploadedImage);
      return res.status(409).json({ message: 'productBatchStockChanged' });
    }
    uploadedImage = '';
    if (Object.hasOwn(update, 'image') && currentProduct.image !== update.image) {
      await deleteProductImage(currentProduct.image);
    }
    return res.status(200).json(withCategory(product, category));
  } catch (error) {
    await deleteProductImage(uploadedImage);
    return res.status(errorStatus(error)).json({ message: error.message });
  }
};
