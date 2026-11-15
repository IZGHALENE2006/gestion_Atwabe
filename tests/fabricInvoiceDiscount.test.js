import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFabricInvoiceDiscount, validateFabricInvoiceDiscount } from '../shared/fabricInvoices.js';
import { fabricInvoiceDocument, fabricInvoicePDFData } from '../shared/fabricInvoiceDocuments.js';
import { invoicePresentation } from '../src/composent/Facture/invoicePresentation.js';

const sale = (total, discountAmount = 0) => ({ subtotal: (Math.round(total * 100) + Math.round(discountAmount * 100)) / 100, discountAmount, discountType: 'amount', discountValue: discountAmount, unitPrice: 1, pricingMode: 'retail', total });
const centsSum = (rows, key) => rows.reduce((sum, row) => sum + Math.round(row[key] * 100), 0);

test('invoice discounts accept blank zero and local numerals but reject invalid types, precision and ranges', () => {
  assert.deepEqual(validateFabricInvoiceDiscount({ type: 'percent', value: '١٢٫٥٠' }), { type: 'percent', value: 12.5 });
  assert.deepEqual(validateFabricInvoiceDiscount({ type: 'amount', value: '3,25' }), { type: 'amount', value: 3.25 });
  assert.deepEqual(validateFabricInvoiceDiscount({ type: 'amount', value: '' }), { type: 'amount', value: 0 });
  for (const value of [null, [], true, {}, { type: 'other', value: 1 }, { type: 'percent', value: 100.01 }, { type: 'percent', value: -1 }, { type: 'amount', value: '0.001' }, { type: 'amount', value: Infinity }, { type: 'amount', value: {} }]) assert.throws(() => validateFabricInvoiceDiscount(value), /invalidInvoiceDiscount/);
});

test('whole-invoice percentage is rounded once after line discounts', () => {
  const result = applyFabricInvoiceDiscount([sale(54, 6), sale(50, 6.25)], { type: 'percent', value: 10 });
  assert.equal(result.subtotal, 116.25); assert.equal(result.lineDiscountAmount, 12.25); assert.equal(result.afterLineDiscounts, 104); assert.equal(result.invoiceDiscountAmount, 10.4); assert.equal(result.discountAmount, 22.65); assert.equal(result.total, 93.6);
  assert.deepEqual(result.sales.map(row => [row.lineDiscountAmount, row.invoiceDiscountAmount, row.total]), [[6, 5.4, 48.6], [6.25, 5, 45]]);
});

test('fixed discount uses proportional largest remainders without losing or inventing a centime', () => {
  const result = applyFabricInvoiceDiscount([sale(0.01), sale(0.01), sale(0.01)], { type: 'amount', value: 0.02 });
  assert.deepEqual(result.sales.map(row => row.invoiceDiscountAmount), [0.01, 0.01, 0]);
  assert.deepEqual(result.sales.map(row => row.total), [0, 0, 0.01]); assert.equal(result.total, 0.01);
  assert.equal(centsSum(result.sales, 'discountAmount'), 2); assert.equal(centsSum(result.sales, 'total'), 1);
});

test('zero-priced lines never absorb a discount and a full discount safely produces a zero invoice', () => {
  for (const discount of [{ type: 'percent', value: 100 }, { type: 'amount', value: 7.41 }]) {
    const result = applyFabricInvoiceDiscount([sale(0, 5), sale(7.41)], discount);
    assert.deepEqual(result.sales.map(row => row.invoiceDiscountAmount), [0, 7.41]); assert.equal(result.total, 0); assert.equal(result.discountAmount, 12.41);
  }
  assert.equal(applyFabricInvoiceDiscount([sale(0, 5)], { type: 'percent', value: 100 }).total, 0);
  assert.throws(() => applyFabricInvoiceDiscount([sale(4, 5)], { type: 'amount', value: 4.01 }), /invalidInvoiceDiscount/);
});

test('centime totals remain conserved across varying invoice sizes, percentages and amounts', () => {
  for (let count = 1; count <= 100; count++) {
    const sales = Array.from({ length: count }, (_, index) => sale(((index * 7919 + count * 37) % 100000 + 1) / 100, (index % 11) / 100));
    const base = centsSum(sales, 'total');
    for (const discount of [{ type: 'percent', value: 33.33 }, { type: 'amount', value: Math.floor(base * 0.17) / 100 }]) {
      const result = applyFabricInvoiceDiscount(sales, discount);
      assert.equal(centsSum(result.sales, 'total'), Math.round(result.total * 100));
      assert.equal(centsSum(result.sales, 'invoiceDiscountAmount'), Math.round(result.invoiceDiscountAmount * 100));
      assert.equal(centsSum(result.sales, 'discountAmount'), Math.round(result.discountAmount * 100));
      assert.equal(centsSum(result.sales, 'total') + centsSum(result.sales, 'discountAmount'), centsSum(sales, 'subtotal'));
      assert.ok(result.sales.every(row => row.total >= 0));
    }
  }
});

test('invoice printing and PDF apply the whole discount once while showing line discounts separately', () => {
  const totals = applyFabricInvoiceDiscount([sale(54, 6), sale(50, 6.25)], { type: 'percent', value: 10 });
  const invoice = { ...totals, lines: totals.sales.map((row, index) => ({ ...row, type: 'Tissu', color: 'Bleu', barcode: String(index), meters: 1 })), reference: 'FI-TEST', date: '2026-11-15', actor: { name: 'Employee' }, customer: { name: 'Client' }, paidAmount: 20, remaining: 73.6 };
  const document = fabricInvoiceDocument(invoice), pdf = fabricInvoicePDFData(invoice);
  assert.deepEqual(document.lines.map(row => row.lineTotal), [54, 50]); assert.deepEqual(document.lines.map(row => row.discountAmount), [6, 6.25]);
  assert.deepEqual(document.discountSummary.map(row => row.value), [116.25, 12.25, 10.4]); assert.equal(document.total, 93.6); assert.equal(document.remaining, 73.6);
  const presentation = invoicePresentation(pdf, {}, key => key);
  assert.equal(presentation.totals.total, 93.6); assert.equal(presentation.totals.orderDiscountAmount, 10.4); assert.equal(presentation.totals.lineDiscountAmount, 12.25);
  assert.ok(presentation.rows.find(row => row.key === 'discount').label.includes('10%')); assert.equal(presentation.rows.find(row => row.key === 'discount').value, '-10.40 DH');
  assert.equal(presentation.productRows[0].amount, '54.00 DH'); assert.equal(presentation.rows.find(row => row.key === 'remaining').value, '73.60 DH');
  assert.doesNotMatch(JSON.stringify({ document, pdf }), /purchaseUnitPrice|costAmount|profitAmount/);
});
