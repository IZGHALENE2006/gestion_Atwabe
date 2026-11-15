import { validateFabricSaleInput, calculateFabricSale, normalizeFabricNumber } from './fabricSales.js';
import { tailoringMoneyCents } from './tailoring.js';

export const fabricInvoiceFailure = (message, status = 400) => Object.assign(new Error(message), { status });
export const fabricInvoiceReference = id => 'FI-' + String(id).toUpperCase();
export const fabricInvoiceLineName = line => [line.type, line.color, line.colorNumber, line.barcode].filter(Boolean).join(' · ');
export function validateFabricInvoiceDiscount(raw) {
  if (raw === undefined) return { type: 'percent', value: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !['percent', 'amount'].includes(raw.type)) throw fabricInvoiceFailure('invalidInvoiceDiscount');
  const value = tailoringMoneyCents(normalizeFabricNumber(raw.value === '' ? 0 : raw.value));
  if (value === null || raw.type === 'percent' && value > 10000) throw fabricInvoiceFailure('invalidInvoiceDiscount');
  return { type: raw.type, value: value / 100 };
}
export function validateFabricInvoice(input = {}) {
  const fail = fabricInvoiceFailure;
  if (typeof input.requestId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(input.requestId)) throw fail('invalidInvoice');
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100) throw fail('invalidInvoice');
  const seen = new Set();
  const lines = input.lines.map(row => {
    if (!row || ['fabricId', 'colorId', 'pieceId'].some(key => typeof row[key] !== 'string' || !/^[a-f\d]{24}$/i.test(row[key]))) throw fail('invalidInvoice');
    const key = row.pieceId.toLowerCase(); if (seen.has(key)) throw fail('duplicateInvoicePiece'); seen.add(key);
    const sale = validateFabricSaleInput({ meters: row.meters, pricingMode: row.pricingMode, discountType: row.discountType, discountValue: row.discountValue === '' ? 0 : row.discountValue });
    const expected = tailoringMoneyCents(normalizeFabricNumber(row.expectedUnitPrice));
    if (expected === null) throw fail('invalidSalePrice');
    return { fabricId: row.fabricId.toLowerCase(), colorId: row.colorId.toLowerCase(), pieceId: key, ...sale, expectedUnitPrice: expected / 100 };
  });
  if (!['paid', 'credit'].includes(input.paymentMode)) throw fail('invalidInvoice');
  const amountPaid = input.paymentMode === 'paid' ? null : tailoringMoneyCents(normalizeFabricNumber(input.amountPaid ?? 0));
  if (input.paymentMode === 'credit' && amountPaid === null) throw fail('invalidInvoicePayment');
  const text = (value, max) => { if (value !== undefined && typeof value !== 'string') throw fail('invalidInvoiceCustomer'); const result = (value || '').trim(); if (result.length > max || [...result].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw fail('invalidInvoiceCustomer'); return result; };
  let customerId = '', newCustomer;
  if (input.paymentMode === 'credit') {
    if (input.customerId && input.newCustomer) throw fail('invalidInvoiceCustomer');
    if (input.customerId) { if (typeof input.customerId !== 'string' || !/^[a-f\d]{24}$/i.test(input.customerId)) throw fail('invalidInvoiceCustomer'); customerId = input.customerId.toLowerCase(); }
    else if (input.newCustomer && typeof input.newCustomer === 'object' && !Array.isArray(input.newCustomer)) {
      newCustomer = { name: text(input.newCustomer.name, 160), phone: text(input.newCustomer.phone, 40), email: text(input.newCustomer.email, 254).toLowerCase(), cin: text(input.newCustomer.cin, 80) };
      if (!newCustomer.name || newCustomer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) throw fail('invalidInvoiceCustomer');
    } else throw fail('invalidInvoiceCustomer');
  }
  // Keep the old normalized request shape so pending invoices from older clients
  // can still replay their original fingerprint.
  return { requestId: input.requestId.toLowerCase(), lines, paymentMode: input.paymentMode, amountPaid: amountPaid === null ? null : amountPaid / 100, customerId, ...(newCustomer ? { newCustomer } : {}), clientName: text(input.clientName, 160), phone: text(input.phone, 40), ...(input.invoiceDiscount !== undefined ? { invoiceDiscount: validateFabricInvoiceDiscount(input.invoiceDiscount) } : {}) };
}
export function applyFabricInvoiceDiscount(sales, rawDiscount) {
  const sum = key => sales.reduce((total, sale) => total + Math.round(sale[key] * 100), 0);
  const base = sum('total'), subtotal = sum('subtotal'), lineDiscount = sum('discountAmount');
  if (tailoringMoneyCents(subtotal / 100) === null) throw fabricInvoiceFailure('invalidInvoice');
  const discount = validateFabricInvoiceDiscount(rawDiscount), value = Math.round(discount.value * 100);
  const amount = discount.type === 'percent' ? Number((BigInt(base) * BigInt(value) + 5000n) / 10000n) : value;
  if (amount > base) throw fabricInvoiceFailure('invalidInvoiceDiscount');
  // Allocate proportionally in integer centimes. Largest remainders receive the
  // spare centimes, so sales, fabric profits and credit lines sum to the invoice.
  const allocations = sales.map((sale, index) => {
    const numerator = BigInt(Math.round(sale.total * 100)) * BigInt(amount);
    return { index, cents: base ? Number(numerator / BigInt(base)) : 0, remainder: base ? numerator % BigInt(base) : 0n };
  });
  let spare = amount - allocations.reduce((sum, row) => sum + row.cents, 0);
  for (const row of [...allocations].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) { if (spare-- <= 0) break; row.cents++; }
  const adjusted = rawDiscount === undefined ? sales : sales.map((sale, index) => ({ ...sale, lineDiscountAmount: sale.discountAmount, invoiceDiscountAmount: allocations[index].cents / 100, discountAmount: (Math.round(sale.discountAmount * 100) + allocations[index].cents) / 100, total: (Math.round(sale.total * 100) - allocations[index].cents) / 100 }));
  return { sales: adjusted, subtotal: subtotal / 100, lineDiscountAmount: lineDiscount / 100, afterLineDiscounts: base / 100, invoiceDiscount: discount, invoiceDiscountAmount: amount / 100, discountAmount: (lineDiscount + amount) / 100, total: (base - amount) / 100 };
}
export function fabricInvoiceTotals(lines, fabrics, invoiceDiscount) {
  return applyFabricInvoiceDiscount(lines.map(line => calculateFabricSale(line, fabrics.find(fabric => String(fabric._id) === line.fabricId))), invoiceDiscount);
}
