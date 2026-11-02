import { creditActorSchema } from "./creditActor.js";
import mongoose from "mongoose";
import { creditRound } from "../../shared/creditDocuments.js";
const requestFields = { requestId: { type: String, default: undefined }, requestFingerprint: { type: String, default: undefined } };
const customerSchema = new mongoose.Schema({ name: String, phone: String, cin: String }, { _id: false });
const moneyField = { type: Number, required: true, min: 0 };
const balanceSchema = new mongoose.Schema({ total: moneyField, paidBefore: moneyField, paidAfter: moneyField, remainingBefore: moneyField, remainingAfter: moneyField, customer: { type: customerSchema, required: true } }, { _id: false });

const CreditProductSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () =>
        new mongoose.Types.ObjectId().toString().slice(-8).toUpperCase(),
    },
    actor: { type: creditActorSchema, default: undefined },
    invoiceId: { type: String, default: undefined },
    batchId: String, batchNumber: Number,
    productId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    lineTotal: { type: Number, min: 0, default: undefined },
    discountAmount: { type: Number, min: 0, default: undefined },
    nom: {
      type: String,
      required: true,
      trim: true,
    },
    prix: {
      type: Number,
      required: true,
      min: 0,
    },
    Paiement: {
      type: Number,
      default: 0,
      min: 0,
    },
    Quantite: {
      type: Number,
      default: 1,
      min: 1,
    },
    Date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const PaymentSchema = new mongoose.Schema(
  {
    id: { type: String, default: undefined },
    actor: { type: creditActorSchema, default: undefined },
    ...requestFields,
    source: { type: String, enum: ["initial", "payment"], default: undefined },
    invoiceId: { type: String, default: undefined },
    balanceSnapshot: { type: balanceSchema, default: undefined },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    Date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

PaymentSchema.pre("validate", function () {
  const b = this.balanceSnapshot;
  if (b && (creditRound(b.paidBefore + this.amount) !== creditRound(b.paidAfter) || creditRound(Math.max(b.total - b.paidBefore, 0)) !== creditRound(b.remainingBefore) || creditRound(Math.max(b.total - b.paidAfter, 0)) !== creditRound(b.remainingAfter))) this.invalidate("balanceSnapshot", "Inconsistent payment receipt");
});
const invoiceSchema = new mongoose.Schema({ id: { type: String, required: true }, ...requestFields, actor: { type: creditActorSchema, default: undefined }, origin: { type: String, enum: ["manual", "cashier"], default: undefined }, Date: { type: Date, required: true }, customer: { type: customerSchema, required: true }, line: { type: CreditProductSchema, default: undefined }, lines: { type: [CreditProductSchema], default: undefined }, total: moneyField, paid: moneyField, remaining: moneyField }, { _id: false });
invoiceSchema.pre("validate", function () { if (!this.line && !this.lines?.length) this.invalidate("lines", "Invoice purchases are required"); });

const UserCriditShema = new mongoose.Schema(
  {
    createdBy: { type: creditActorSchema, default: undefined },
    idUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    cin: {
      type: String,
      default: "",
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    Qauntite: {
      type: Number,
      default: 0,
      min: 0,
    },
    Total: {
      type: Number,
      default: 0,
      min: 0,
    },
    Paye: {
      type: Number,
      default: 0,
      min: 0,
    },
    Date: {
      type: Date,
      default: Date.now,
    },
    produit: {
      type: [CreditProductSchema],
      default: [],
    },
    creditInvoices: { type: [invoiceSchema], default: [] },
    paymentHistory: {
      type: [PaymentSchema],
      default: [],
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

const UserCriditModele = mongoose.model("UserCridit", UserCriditShema);
export default UserCriditModele;
