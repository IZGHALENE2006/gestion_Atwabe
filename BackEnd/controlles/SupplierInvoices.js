import mongoose from "mongoose";
import FournisseurModel from "../models/Fournisseur.js";
import ProductModel from "../models/productModel.js";
import { calculateSupplierInvoice, supplierDate, supplierPayment, summarizeSupplierInvoices, SupplierInvoiceError } from "../../shared/supplierInvoices.js";

const validId = (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
const validRequestId = (id) => typeof id === "string" && /^[\w-]{8,80}$/.test(id);

function scope(req) {
  if (!validId(req.params.id)) throw new SupplierInvoiceError("notFound");
  if (!req.user?.id) throw new SupplierInvoiceError("unauthorized");
  // Match the ownership used by the existing supplier list.
  return { _id: req.params.id, idAdmin: req.user.id };
}

function details(supplier) {
  const value = supplier.toObject();
  const invoices = (value.invoices || []).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || new Date(b.createdAt) - new Date(a.createdAt));
  const { invoices: _invoices, ...info } = value;
  return { supplier: info, invoices, summary: summarizeSupplierInvoices(invoices) };
}

const sendError = (res, error) => res.status(error instanceof SupplierInvoiceError
  ? error.message === "notFound" ? 404 : error.message === "unauthorized" ? 401 : 400
  : 500).json({ message: error instanceof SupplierInvoiceError ? error.message : "saveFailed" });

export const GetSupplierInvoices = async (req, res) => {
  try {
    const supplier = await FournisseurModel.findOne(scope(req));
    if (!supplier) return res.status(404).json({ message: "notFound" });
    return res.json(details(supplier));
  } catch (error) { return sendError(res, error); }
};

export const AddSupplierInvoice = async (req, res) => {
  try {
    const filter = scope(req);
    const { requestId, reference = "", invoiceDate, items, amountPaid = 0 } = req.body || {};
    if (!validRequestId(requestId)) throw new SupplierInvoiceError("invalidRequest");
    const supplier = await FournisseurModel.findOne(filter);
    if (!supplier) return res.status(404).json({ message: "notFound" });
    if (supplier.invoices.some((invoice) => invoice.requestId === requestId)) return res.json(details(supplier));
    if (typeof reference !== "string" || reference.trim().length > 80) throw new SupplierInvoiceError("invalidReference");
    const cleanReference = reference.trim();
    const date = supplierDate(invoiceDate);
    const totals = calculateSupplierInvoice(items, amountPaid);
    const productIds = [...new Set(totals.items.map((item) => item.productId).filter(Boolean))];
    if (productIds.length) {
      const products = await ProductModel.find({ _id: { $in: productIds }, idAdmin: req.user.idAdmin || req.user.id }).select("_id");
      if (products.length !== productIds.length) throw new SupplierInvoiceError("invalidProduct");
    }
    const invoice = {
      _id: new mongoose.Types.ObjectId(), requestId, reference: cleanReference,
      invoiceDate: date, supplierName: supplier.name,
      items: totals.items, total: totals.total, amountPaid: totals.amountPaid,
      payments: totals.amountPaid > 0 ? [{ requestId: `${requestId}-initial`, amount: totals.amountPaid, date, note: "" }] : [],
    };
    // One atomic document write prevents double submissions and keeps deletion
    // from orphaning a newly saved invoice. Products are never mutated here.
    const updated = await FournisseurModel.findOneAndUpdate({
      ...filter,
      "invoices.requestId": { $ne: requestId },
      ...(cleanReference ? { "invoices.reference": { $ne: cleanReference } } : {}),
    }, { $push: { invoices: invoice } }, { new: true, runValidators: true });
    if (updated) return res.status(201).json(details(updated));
    const current = await FournisseurModel.findOne(filter);
    if (!current) return res.status(404).json({ message: "notFound" });
    if (current.invoices.some((entry) => entry.requestId === requestId)) return res.json(details(current));
    return res.status(409).json({ message: "duplicateReference" });
  } catch (error) { return sendError(res, error); }
};

export const AddSupplierPayment = async (req, res) => {
  try {
    const filter = scope(req);
    const { invoiceId } = req.params;
    if (!validId(invoiceId)) throw new SupplierInvoiceError("notFound");
    const input = req.body || {};
    if (!validRequestId(input.requestId)) throw new SupplierInvoiceError("invalidRequest");
    const supplier = await FournisseurModel.findOne(filter);
    const invoice = supplier?.invoices.id(invoiceId);
    if (!invoice) return res.status(404).json({ message: "notFound" });
    const { requestId } = input;
    if (invoice.payments.some((payment) => payment.requestId === requestId)) return res.json(details(supplier));
    const { payment, amountPaid } = supplierPayment(invoice, { note: "", ...input });
    const updated = await FournisseurModel.findOneAndUpdate({
      ...filter,
      invoices: { $elemMatch: { _id: invoiceId, amountPaid: invoice.amountPaid, "payments.requestId": { $ne: requestId } } },
    }, {
      $set: { "invoices.$.amountPaid": amountPaid },
      $push: { "invoices.$.payments": { ...payment, requestId } },
    }, { new: true, runValidators: true });
    if (updated) return res.json(details(updated));
    const current = await FournisseurModel.findOne(filter);
    if (current?.invoices.id(invoiceId)?.payments.some((entry) => entry.requestId === requestId)) return res.json(details(current));
    return res.status(409).json({ message: "paymentConflict" });
  } catch (error) { return sendError(res, error); }
};
