import { creditAccessFor, assertCreditActor } from "../utils/creditAccess.js";
import UserCriditModele from "../models/userCidit.js";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { creditCustomer, creditInvoiceReference, creditPaymentReference } from "../../shared/creditDocuments.js";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round2 = (value) => Number(toNumber(value).toFixed(2));

const hydrateLegacyTotals = (user) => {
  const products = Array.isArray(user.produit) ? user.produit : [];
  const computedTotal = products.reduce(
    (sum, p) => sum + toNumber(p.lineTotal ?? toNumber(p.prix) * toNumber(p.Quantite, 1)),
    0
  );
  const computedPaid = products.reduce((sum, p) => sum + toNumber(p.Paiement), 0);
  const computedQty = products.reduce((sum, p) => sum + toNumber(p.Quantite, 1), 0);

  if (!toNumber(user.Total) && computedTotal > 0) {
    user.Total = round2(computedTotal);
  }
  if (!toNumber(user.Paye) && computedPaid > 0) {
    user.Paye = round2(computedPaid);
  }
  if (!toNumber(user.Qauntite) && computedQty > 0) {
    user.Qauntite = computedQty;
  }
};

export const buildCreditPayload = (userDoc) => {
  const user =
    typeof userDoc.toObject === "function" ? userDoc.toObject() : userDoc;

  const total = round2(user.Total);
  const paid = round2(user.Paye);
  const remaining = round2(Math.max(total - paid, 0));
  const totalQuantity = toNumber(user.Qauntite);

  const produit = (user.produit || []).map((item) => {
    const qty = toNumber(item.Quantite, 1);
    const unitPrice = round2(item.prix);
    const upfront = round2(item.Paiement);
    const lineTotal = round2(item.lineTotal ?? unitPrice * qty);
    const lineRemaining = round2(Math.max(lineTotal - upfront, 0));

    return {
      ...item,
      Quantite: qty,
      prix: unitPrice,
      Paiement: upfront,
      lineTotal,
      lineRemaining,
    };
  });

  const paymentHistory = (user.paymentHistory || []).map((payment, index) => {
    const value = { ...payment, amount: round2(payment.amount), reference: creditPaymentReference(user._id, payment, index) };
    delete value.requestId; delete value.requestFingerprint;
    return value;
  });
  const creditInvoices = (user.creditInvoices || []).map(invoice => {
    const value = { ...invoice, reference: creditInvoiceReference(invoice) };
    delete value.requestId; delete value.requestFingerprint;
    return value;
  });

  return {
    ...user,
    produit,
    paymentHistory,
    creditInvoices,
    summary: {
      total,
      paid,
      remaining,
      totalQuantity,
    },
  };
};

const creditFailure = (message, status) => Object.assign(new Error(message), { status });
const creditFingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const creditRequestId = input => {
  if (input?.requestId == null) return "";
  const value = typeof input.requestId === "string" ? input.requestId.toLowerCase() : "";
  if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(value)) throw creditFailure("creditInvalidRequest", 400);
  return value;
};
export async function mutateCredit(id, ownerId, change) {
  if (!mongoose.isObjectIdOrHexString(id)) throw creditFailure("User not found", 404);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const user = await UserCriditModele.findOne({ _id: id, idUser: ownerId });
    if (!user) throw creditFailure("User not found", 404);
    hydrateLegacyTotals(user);
    const result = change(user);
    try { if (!result.unchanged) await user.save(); return { ...result, user }; }
    catch (error) { if (error.name !== "VersionError") throw error; if (attempt === 3) throw creditFailure("creditConflict", 409); }
  }
}
const sendCreditWriteError = (res, error) => res.status(error.status || 500).json({ message: error.status ? error.message : "creditSaveFailed" });
export function creditReceipt(user, amount, { paidBefore, date, source, invoiceId, actor, note = "", requestId, fingerprint }) {
  const total = round2(user.Total), paidAfter = round2(paidBefore + amount);
  return { id: new mongoose.Types.ObjectId().toString(), amount, note, Date: date, source, ...(actor ? { actor } : {}), ...(invoiceId ? { invoiceId } : {}), ...(requestId ? { requestId, requestFingerprint: fingerprint } : {}), balanceSnapshot: { total, paidBefore, paidAfter, remainingBefore: round2(Math.max(total - paidBefore, 0)), remainingAfter: round2(Math.max(total - paidAfter, 0)), customer: creditCustomer(user) } };
}

// Add User Cridite
export const AddUserCridite = async (req, res) => {
  const { name, cin, email, phone } = req.body || {};

  try {
    const { ownerId, actor } = await creditAccessFor(req);
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if ([cin, email, phone].some(value => value != null && typeof value !== "string")) throw creditFailure("creditCheckoutCustomerInvalid", 400);
    const safeEmail = (email || "").trim().toLowerCase();
    const safeCin = (cin || "").trim();

    if (safeEmail) {
      const checkEmail = await UserCriditModele.findOne({
        idUser: ownerId,
        email: safeEmail,
      });
      if (checkEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    if (safeCin) {
      const checkCin = await UserCriditModele.findOne({
        idUser: ownerId,
        cin: safeCin,
      });
      if (checkCin) {
        return res.status(400).json({ message: "CIN already exists" });
      }
    }

    const newUser = await UserCriditModele.create({
      idUser: ownerId,
      createdBy: actor,
      name: name.trim(),
      cin: safeCin,
      email: safeEmail,
      phone: (phone || "").trim(),
    });

    return res.status(201).json({
      message: "User created successfully",
      user: buildCreditPayload(newUser),
    });
  } catch (error) {
    return sendCreditWriteError(res, error);
  }
};

// Get all users on credit
export const AllUserCridite = async (req, res) => {
  try {
    const { ownerId } = await creditAccessFor(req);

    const users = await UserCriditModele.find({ idUser: ownerId }).sort({
      createdAt: -1,
    });

    const payload = users.map((user) => {
      hydrateLegacyTotals(user);
      return buildCreditPayload(user);
    });

    return res.json(payload);
  } catch (error) {
    return sendCreditWriteError(res, error);
  }
};

// Get single user credit details
export const GetUserCriditeById = async (req, res) => {
  const { id } = req.params;

  try {
    const { ownerId } = await creditAccessFor(req);

    const userCredit = await UserCriditModele.findOne({
      _id: id,
      idUser: ownerId,
    });

    if (!userCredit) {
      return res.status(404).json({ message: "User not found" });
    }

    hydrateLegacyTotals(userCredit);
    return res.json(buildCreditPayload(userCredit));
  } catch (error) {
    return sendCreditWriteError(res, error);
  }
};

// Add a new credit item and retain its invoice even if the item is later removed.
export const AddCreditProduct = async (req, res) => {
  try {
    const { ownerId, actor } = await creditAccessFor(req);
    if (!ownerId) throw creditFailure("Unauthorized", 401);
    const { nom, prix, Quantite, Paiement, productId } = req.body || {};
    const safeName = typeof nom === "string" ? nom.trim() : "";
    const safeQty = Math.max(1, Math.floor(toNumber(Quantite, 1))), safePrice = round2(toNumber(prix)), safeUpfront = round2(Math.max(0, toNumber(Paiement)));
    const lineTotal = round2(safeQty * safePrice);
    if (!safeName) throw creditFailure("Product name is required", 400);
    if (safePrice <= 0) throw creditFailure("Price must be greater than 0", 400);
    if (safeUpfront > lineTotal) throw creditFailure("Paid amount cannot exceed credit line total", 400);
    const requestId = creditRequestId(req.body), fingerprint = creditFingerprint({ nom: safeName, prix: safePrice, Quantite: safeQty, Paiement: safeUpfront, productId: productId || "" });
    const result = await mutateCredit(req.params.id, ownerId, user => {
      const previous = requestId && user.creditInvoices.find(invoice => invoice.requestId === requestId);
      if (previous) {
        assertCreditActor(previous.actor, actor, ownerId);
        if (previous.requestFingerprint !== fingerprint) throw creditFailure("creditRequestConflict", 409);
        return { unchanged: true, document: { kind: "invoice", reference: creditInvoiceReference(previous) } };
      }
      if (requestId && user.paymentHistory.some(payment => payment.requestId === requestId)) throw creditFailure("creditRequestConflict", 409);
      const date = new Date(), invoiceId = new mongoose.Types.ObjectId().toString(), paidBefore = round2(user.Paye);
      const line = { id: productId || new mongoose.Types.ObjectId().toString().slice(-8).toUpperCase(), invoiceId, actor, nom: safeName, prix: safePrice, Quantite: safeQty, Paiement: safeUpfront, Date: date };
      user.produit.push(line);
      user.Total = round2(toNumber(user.Total) + lineTotal); user.Paye = round2(paidBefore + safeUpfront); user.Qauntite = toNumber(user.Qauntite) + safeQty;
      const invoice = { id: invoiceId, actor, origin: "manual", ...(requestId ? { requestId, requestFingerprint: fingerprint } : {}), Date: date, customer: creditCustomer(user), line, total: lineTotal, paid: safeUpfront, remaining: round2(lineTotal - safeUpfront) };
      user.creditInvoices.push(invoice);
      if (safeUpfront > 0) user.paymentHistory.push(creditReceipt(user, safeUpfront, { paidBefore, date, source: "initial", invoiceId, actor }));
      return { document: { kind: "invoice", reference: creditInvoiceReference(invoice) } };
    });
    return res.status(result.unchanged ? 200 : 201).json({ message: "Credit product added successfully", user: buildCreditPayload(result.user), document: result.document });
  } catch (error) { sendCreditWriteError(res, error); }
};

// The payment, historical balance and receipt commit in the same user document.
export const AddUserPayment = async (req, res) => {
  try {
    const { ownerId, actor } = await creditAccessFor(req);
    if (!ownerId) throw creditFailure("Unauthorized", 401);
    const safeAmount = round2(toNumber(req.body?.amount)), note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (safeAmount <= 0) throw creditFailure("Payment must be greater than 0", 400);
    const requestId = creditRequestId(req.body), fingerprint = creditFingerprint({ amount: safeAmount, note });
    const result = await mutateCredit(req.params.id, ownerId, user => {
      const previous = requestId && user.paymentHistory.find(payment => payment.requestId === requestId);
      if (previous) {
        assertCreditActor(previous.actor, actor, ownerId);
        if (previous.requestFingerprint !== fingerprint) throw creditFailure("creditRequestConflict", 409);
        return { unchanged: true, document: { kind: "payment", reference: creditPaymentReference(user._id, previous, user.paymentHistory.indexOf(previous)) } };
      }
      if (requestId && user.creditInvoices.some(invoice => invoice.requestId === requestId)) throw creditFailure("creditRequestConflict", 409);
      const paidBefore = round2(user.Paye), remainingBefore = round2(Math.max(toNumber(user.Total) - paidBefore, 0));
      if (safeAmount > remainingBefore) throw creditFailure(`Payment exceeds remaining amount (${remainingBefore} DH)`, 400);
      const payment = creditReceipt(user, safeAmount, { paidBefore, date: new Date(), source: "payment", actor, note, requestId, fingerprint });
      user.Paye = round2(paidBefore + safeAmount); user.paymentHistory.push(payment);
      return { document: { kind: "payment", reference: creditPaymentReference(user._id, payment, user.paymentHistory.length - 1) } };
    });
    return res.json({ message: "Payment added successfully", user: buildCreditPayload(result.user), document: result.document });
  } catch (error) { sendCreditWriteError(res, error); }
};

export const DeleteCreditProduct = async (req, res) => {
  try {
    const { ownerId } = await creditAccessFor(req);
    if (!ownerId) throw creditFailure("Unauthorized", 401);
    const result = await mutateCredit(req.params.id, ownerId, user => {
      const index = user.produit.findIndex(item => item.id === req.params.productId);
      if (index === -1) throw creditFailure("Credit product not found", 404);
      if (user.produit[index].fabricInvoiceId) throw creditFailure('fabricInvoiceLinked', 409);
      const line = user.produit[index], lineTotal = round2(line.lineTotal ?? toNumber(line.prix) * toNumber(line.Quantite, 1)), upfront = round2(toNumber(line.Paiement)), qty = Math.max(1, Math.floor(toNumber(line.Quantite, 1)));
      user.produit.splice(index, 1); user.Total = round2(Math.max(toNumber(user.Total) - lineTotal, 0)); user.Paye = Math.min(round2(Math.max(toNumber(user.Paye) - upfront, 0)), user.Total); user.Qauntite = Math.max(toNumber(user.Qauntite) - qty, 0);
      return {};
    });
    return res.json({ message: "Credit product removed", user: buildCreditPayload(result.user) });
  } catch (error) { sendCreditWriteError(res, error); }
};

// Delete User Cridite
export const DeleteUsercridite = async (req, res) => {
  const { id } = req.params;
  try {
    const { ownerId } = await creditAccessFor(req);
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const linked = await UserCriditModele.findOne({ _id: id, idUser: ownerId });
    if (linked?.creditInvoices.some(invoice => invoice.origin === 'fabric')) throw creditFailure('fabricInvoiceLinked', 409);
    const deleted = await UserCriditModele.findOneAndDelete({
      _id: id,
      idUser: ownerId,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Not Found" });
    }

    return res.json(deleted);
  } catch (err) {
    return sendCreditWriteError(res, err);
  }
};
