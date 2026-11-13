import { validateFabricSaleInput, calculateFabricSale, normalizeFabricNumber } from './fabricSales.js';
import { tailoringMoneyCents } from './tailoring.js';

export const fabricInvoiceFailure = (message, status = 400) => Object.assign(new Error(message), { status });
export const fabricInvoiceReference = id => 'FI-' + String(id).toUpperCase();
export const fabricInvoiceLineName = line => [line.type, line.color, line.colorNumber, line.barcode].filter(Boolean).join(' · ');
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
  return { requestId: input.requestId.toLowerCase(), lines, paymentMode: input.paymentMode, amountPaid: amountPaid === null ? null : amountPaid / 100, customerId, ...(newCustomer ? { newCustomer } : {}), clientName: text(input.clientName, 160), phone: text(input.phone, 40) };
}
export function fabricInvoiceTotals(lines, fabrics) {
  const sales = lines.map(line => calculateFabricSale(line, fabrics.find(fabric => String(fabric._id) === line.fabricId)));
  const sum = key => sales.reduce((total, sale) => total + Math.round(sale[key] * 100), 0) / 100;
  const total = sum('total'); if (tailoringMoneyCents(total) === null) throw fabricInvoiceFailure('invalidInvoice');
  return { sales, subtotal: sum('subtotal'), discountAmount: sum('discountAmount'), total };
}
