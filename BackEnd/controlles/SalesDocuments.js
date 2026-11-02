import { selectProductBatch, batchRowKey, validBatchId } from '../../shared/productBatches.js';
import { groupProductStock, changeProductStock } from '../utils/productStock.js';
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import AdminModel from "../models/AdminModel.js";
import EmployeModel from "../models/EmployeModele.js";
import ProductModel from "../models/productModel.js";
import SalesDocument from "../models/SalesDocument.js";
import { NON_INVOICE_DOCUMENT_TYPES, STOCK_DOCUMENT_TYPES, DOCUMENT_PREFIXES } from "../../shared/salesDocuments.js";
import { calculateCartTotals } from "../../shared/saleTotals.js";
import { getProductSalePrice } from "../../shared/productPricing.js";
import { normalizeDocumentClientId, resolveDocumentClient } from "../utils/documentClient.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

async function actorFor(request) {
  if (!["admin", "Employe"].includes(request.user?.role)) throw fail("unauthorized", 403);
  const admin = request.user.role === "admin";
  const actor = await (admin ? AdminModel : EmployeModel).findById(request.user.id).select("_id name idAdmin isActive");
  if (!actor || (!admin && actor.isActive === false)) throw fail("unauthorized", 403);
  const owner = admin ? actor._id : actor.idAdmin;
  if (!mongoose.isValidObjectId(owner)) throw fail("unauthorized", 403);
  return { idAdmin: owner, createdBy: actor._id, createdByRole: admin ? "admin" : "Employe", nameEmp: actor.name };
}

function validatedInput(body = {}) {
  const clientId = normalizeDocumentClientId(body.clientId);
  const { documentType, clientName = "", note = "", documentDate, requestId, updateStock = false, cart } = body;
  if (!NON_INVOICE_DOCUMENT_TYPES.includes(documentType)) throw fail("invalidDocumentType");
  if (typeof clientName !== "string" || clientName.trim().length > 160) throw fail("invalidClientName");
  if (typeof note !== "string" || note.trim().length > 1000) throw fail("invalidNote");
  if (typeof updateStock !== "boolean") throw fail("invalidStockOption");
  if (updateStock && !STOCK_DOCUMENT_TYPES.includes(documentType)) throw fail("stockNotSupported");
  if (typeof documentDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) throw fail("invalidDate");
  const date = new Date(`${documentDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== documentDate) throw fail("invalidDate");
  if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestId)) throw fail("invalidRequest");
  if (!Array.isArray(cart) || cart.length < 1 || cart.length > 200) throw fail("invalidItems");
  const ids = new Set();
  const lines = cart.map((item) => {
    if (!item || !mongoose.isValidObjectId(item.id) || ids.has(batchRowKey({ id: item.id, batchId: item.batchId })) || (item.batchId !== undefined && !validBatchId(item.batchId))) throw fail("invalidItems");
    if (!["number", "string"].includes(typeof item.qty) || !Number.isSafeInteger(Number(item.qty)) || Number(item.qty) < 1) throw fail("invalidQuantity");
    ids.add(batchRowKey({ id: item.id, batchId: item.batchId }));
    return { id: String(item.id), ...(item.batchId !== undefined ? { batchId: item.batchId } : {}), qty: Number(item.qty), discountType: item.discountType ?? "percent", discountValue: item.discountValue ?? 0, vatRate: item.vatRate === undefined ? 0 : item.vatRate };
  });
  if (!Number.isSafeInteger(lines.reduce((sum, line) => sum + line.qty, 0))) throw fail("invalidQuantity");
  return { documentType, clientName: clientName.trim(), note: note.trim(), documentDate, requestId, updateStock, cart: lines, ...(clientId ? { clientId } : {}) };
}

const publicDocument = (document) => {
  const value = document.toObject ? document.toObject() : { ...document };
  delete value.requestHash;
  delete value.requestId;
  return value;
};

export async function listSalesDocuments(req, res) {
  try {
    const actor = await actorFor(req);
    const scope = { idAdmin: actor.idAdmin, ...(actor.createdByRole === "admin" ? {} : { createdBy: actor.createdBy }) };
    const documents = await SalesDocument.find(scope).sort({ DateFacture: -1, _id: -1 }).lean();
    res.json(documents.map(publicDocument));
  } catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : "loadFailed" }); }
}

export async function addSalesDocument(req, res) {
  let session, scope, hash;
  try {
    const input = validatedInput(req.body);
    const actor = await actorFor(req);
    scope = { idAdmin: actor.idAdmin, createdBy: actor.createdBy, requestId: input.requestId };
    hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const existingFor = async (transaction) => {
      let query = SalesDocument.findOne(scope).select("+requestHash");
      if (transaction) query = query.session(transaction);
      const existing = await query;
      if (existing && existing.requestHash !== hash) throw fail("requestConflict", 409);
      return existing;
    };
    const previous = await existingFor();
    if (previous) return res.status(200).json(publicDocument(previous));

    const save = async (transaction) => {
      if (transaction) {
        const existing = await existingFor(transaction);
        if (existing) return existing;
      }
      const client = await resolveDocumentClient(input, actor.idAdmin, transaction);
      const lines = [];
      for (const item of input.cart) {
        let query = ProductModel.findOne({ _id: item.id, idAdmin: actor.idAdmin });
        if (transaction) query = query.session(transaction);
        const product = await query;
        if (!product) throw fail("productNotFound", 404);
        const batch = selectProductBatch(product, item.batchId);
        lines.push({ ...item, product, batch, price: getProductSalePrice(batch, 'retail') });
      }
      let totals;
      try { totals = calculateCartTotals(lines); } catch (error) { throw fail(error.message); }
      if (![totals.total, totals.totalHT, totals.vatAmount].every(Number.isFinite)) throw fail("invalidItems");
      if (input.updateStock) {
        for (const stock of groupProductStock(lines)) {
          try { await changeProductStock(stock, actor.idAdmin, { add: input.documentType === 'return', session: transaction }); }
          catch (error) { if (error.status) throw fail(input.documentType === 'delivery' ? 'insufficientStock' : 'invalidQuantity', 409); throw error; }
        }
      }
      const _id = new mongoose.Types.ObjectId();
      const document = {
        ...actor, _id, requestId: input.requestId, requestHash: hash,
        documentType: input.documentType,
        reference: `${DOCUMENT_PREFIXES[input.documentType]}-${input.documentDate.slice(0, 4)}-${String(_id).slice(-8).toUpperCase()}`,
        documentDate: input.documentDate, DateFacture: new Date(`${input.documentDate}T12:00:00Z`),
        ...client, note: input.note, stockUpdated: input.updateStock,
        Product: lines.map((line, index) => ({
          ...totals.lines[index], idProduct: line.product._id, code: String(line.product.barcode || ""),
          batchId: line.batch.batchId, batchNumber: line.batch.number, name: line.product.name, price: line.price, quantite: line.qty, TotalPrix: totals.lines[index].total,
        })),
        TotalQauntite: lines.reduce((sum, line) => sum + line.qty, 0),
        subtotal: totals.subtotal, totalHT: totals.totalHT, vatRate: totals.vatRate, vatAmount: totals.vatAmount,
        TotalPrix: totals.total, discountAmount: totals.discountAmount,
        lineDiscountAmount: totals.lineDiscountAmount, orderDiscountAmount: totals.orderDiscountAmount,
      };
      const [saved] = await SalesDocument.create([document], transaction ? { session: transaction } : {});
      return saved;
    };
    let document;
    if (input.updateStock) {
      session = await mongoose.startSession();
      // Stock movements and the note commit together, including retries and failures.
      document = await session.withTransaction(() => save(session));
    } else document = await save();
    res.status(201).json(publicDocument(document));
  } catch (error) {
    if (error.code === 11000 && scope) {
      const existing = await SalesDocument.findOne(scope).select("+requestHash");
      if (existing?.requestHash === hash) return res.status(200).json(publicDocument(existing));
      return res.status(409).json({ message: "requestConflict" });
    }
    const unsupportedTransactions = error.code === 20 || /Transaction numbers are only allowed|does not support retryable writes/i.test(error.message);
    res.status(error.status || 500).json({ message: unsupportedTransactions ? "stockUnavailable" : error.status ? error.message : "saveFailed" });
  } finally { if (session) await session.endSession(); }
}
