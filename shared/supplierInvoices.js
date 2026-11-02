import { roundMoney } from "./saleTotals.js";

export class SupplierInvoiceError extends Error {}
const invalid = (key) => { throw new SupplierInvoiceError(key); };

function number(value, key) {
  if (!["string", "number"].includes(typeof value) || String(value).trim() === "") invalid(key);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000) invalid(key);
  return parsed;
}

export function supplierDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid("invalidDate");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid("invalidDate");
  return value;
}

export function localInvoiceDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calculateSupplierInvoice(items, paid = 0) {
  if (!Array.isArray(items) || !items.length || items.length > 200) invalid("invalidItems");
  const lines = items.map((item) => {
    if (!item || typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > 200) invalid("invalidName");
    const quantity = number(item.quantity, "invalidQuantity");
    if (quantity <= 0 || quantity > 1_000_000 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001) invalid("invalidQuantity");
    const unitPrice = roundMoney(number(item.unitPrice, "invalidPrice"));
    const total = roundMoney(quantity * unitPrice);
    if (total > 1_000_000_000) invalid("invalidTotal");
    const productId = item.productId || null;
    if (productId !== null && (typeof productId !== "string" || !/^[a-f\d]{24}$/i.test(productId))) invalid("invalidProduct");
    return { productId, name: item.name.trim(), quantity, unitPrice, total };
  });
  const total = roundMoney(lines.reduce((sum, line) => sum + line.total, 0));
  if (total > 1_000_000_000) invalid("invalidTotal");
  const amountPaid = roundMoney(number(paid, "invalidPayment"));
  if (amountPaid > total) invalid("overpayment");
  return { items: lines, total, amountPaid, remaining: roundMoney(total - amountPaid) };
}

export function supplierPayment(invoice, input) {
  const amount = roundMoney(number(input.amount, "invalidPayment"));
  if (amount <= 0) invalid("invalidPayment");
  const amountPaid = roundMoney(invoice.amountPaid + amount);
  if (amountPaid > invoice.total) invalid("overpayment");
  const date = supplierDate(input.date);
  if (typeof input.note !== "string" || input.note.trim().length > 1000) invalid("invalidNote");
  return { amountPaid, payment: { amount, date, note: input.note.trim() } };
}

export const supplierInvoiceStatus = (invoice) => Number(invoice.amountPaid) >= Number(invoice.total)
  ? "paid" : Number(invoice.amountPaid) > 0 ? "partial" : "unpaid";

export function summarizeSupplierInvoices(invoices) {
  const total = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.total, 0));
  const paid = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.amountPaid, 0));
  return { invoiceCount: invoices.length, total, paid, remaining: roundMoney(total - paid) };
}
