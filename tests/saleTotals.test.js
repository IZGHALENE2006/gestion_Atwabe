import test from "node:test";
import assert from "node:assert/strict";
import { allocateDiscount, calculateCartTotals, calculateSaleTotals, getInvoiceTotals, getInvoiceVatBreakdown, roundMoney } from "../shared/saleTotals.js";

test("percentage and fixed discounts calculate the payable total", () => {
  assert.deepEqual(calculateSaleTotals(250, "percent", "10"), {
    subtotal: 250, discountType: "percent", discountValue: 10, discountAmount: 25, total: 225,
  });
  assert.equal(calculateSaleTotals(250, "amount", "30").total, 220);
  assert.equal(calculateSaleTotals(250, "percent", "").total, 250);
  assert.equal(calculateSaleTotals(250, "percent", 100).total, 0);
  assert.equal(calculateSaleTotals(250, "amount", 250).total, 0);
});

test("different product VAT rates apply after both discounts and reconcile HT, tax and TTC", () => {
  const totals = calculateCartTotals([
    { price: 100, qty: 2, vatRate: "20", discountType: "percent", discountValue: 10 },
    { price: 50, qty: 2, vatRate: 10, discountType: "amount", discountValue: 10 },
    { price: 10, qty: 1, vatRate: 0 },
  ], "percent", 10);
  assert.equal(totals.vatRate, undefined);
  assert.equal(totals.totalHT, 252);
  assert.equal(totals.vatAmount, 40.5);
  assert.equal(totals.total, 292.5);
  assert.deepEqual(totals.lines.map((line) => [line.totalHT, line.vatAmount, line.totalTTC]), [[162, 32.4, 194.4], [81, 8.1, 89.1], [9, 0, 9]]);
  assert.deepEqual(totals.vatBreakdown, [
    { vatRate: 0, baseHT: 9, vatAmount: 0 },
    { vatRate: 10, baseHT: 81, vatAmount: 8.1 },
    { vatRate: 20, baseHT: 162, vatAmount: 32.4 },
  ]);
});

test("explicit zero VAT overrides the legacy invoice rate and invalid line rates identify the product", () => {
  assert.equal(calculateCartTotals([{ price: 10, qty: 1, vatRate: 0 }, { price: 10, qty: 1 }], "percent", 0, 20).total, 22);
  for (const vatRate of [-1, 100.01, "bad", "", " ", null, true, [], {}, Infinity, NaN]) {
    assert.throws(() => calculateCartTotals([{ price: 10, qty: 1 }, { price: 10, qty: 1, vatRate }]), (error) => error.message === "invalidVatRate" && error.lineIndex === 1);
  }
});

test("VAT rounding allocates every cent and free lines never receive tax", () => {
  const totals = calculateCartTotals([
    { price: 0.05, qty: 1, vatRate: 10 }, { price: 0.05, qty: 1, vatRate: 10 },
    { price: 100, qty: 1, vatRate: 20, discountValue: 100 },
  ]);
  assert.equal(totals.vatAmount, 0.01);
  assert.equal(totals.total, 0.11);
  assert.equal(roundMoney(totals.lines.reduce((sum, line) => sum + line.vatAmount, 0)), 0.01);
  assert.equal(totals.lines[2].vatAmount, 0);
  assert.equal(roundMoney(totals.lines.reduce((sum, line) => sum + line.totalTTC, 0)), totals.total);
});

test("saved mixed-rate and old single-rate tax summaries use their stored money", () => {
  const invoice = { TotalPrix: 175, totalHT: 150, vatAmount: 25, Product: [
    { vatRate: 20, totalHT: 100, vatAmount: 20 }, { vatRate: 10, totalHT: 50, vatAmount: 5 },
  ] };
  assert.equal(getInvoiceTotals(invoice).hasVat, true);
  assert.equal(getInvoiceTotals(invoice).vatRate, null);
  assert.deepEqual(getInvoiceVatBreakdown(invoice), [{ vatRate: 10, baseHT: 50, vatAmount: 5 }, { vatRate: 20, baseHT: 100, vatAmount: 20 }]);
  assert.deepEqual(getInvoiceVatBreakdown({ TotalPrix: 108, totalHT: 90, vatRate: 20, vatAmount: 18, Product: [{ TotalPrix: 100 }] }), [{ vatRate: 20, baseHT: 90, vatAmount: 18 }]);
  assert.deepEqual(getInvoiceVatBreakdown({ TotalPrix: 100, Product: [{ TotalPrix: 100 }] }), []);
});

test("discount and change calculations round to cents", () => {
  assert.equal(calculateSaleTotals(19.99, "percent", 12.5).discountAmount, 2.5);
  assert.equal(calculateSaleTotals(19.99, "percent", 12.5).total, 17.49);
  assert.equal(calculateSaleTotals(10.05, "percent", 10).discountAmount, 1.01);
  assert.equal(roundMoney(20 - 17.49), 2.51);
});

test("invalid and excessive discounts are rejected, including after the cart shrinks", () => {
  for (const value of [-1, NaN, Infinity, "bad", null, {}, true]) {
    assert.throws(() => calculateSaleTotals(100, "amount", value), /invalidDiscount/);
  }
  assert.throws(() => calculateSaleTotals(100, "other", 1), /invalidDiscount/);
  assert.throws(() => calculateSaleTotals(100, "percent", 100.01), /discountPercentageExceeded/);
  assert.equal(calculateSaleTotals(100, "amount", 80).total, 20);
  assert.throws(() => calculateSaleTotals(50, "amount", 80), /discountAmountExceeded/);
  assert.throws(() => calculateSaleTotals(0, "amount", 1), /discountAmountExceeded/);
});

test("proportional discount allocation preserves every cent, including free products", () => {
  assert.deepEqual(allocateDiscount([80, 20], 10), [8, 2]);
  const shares = allocateDiscount([0.01, 0.01, 0.01, 0], 0.02);
  assert.equal(roundMoney(shares.reduce((sum, share) => sum + share, 0)), 0.02);
  assert.equal(shares[3], 0);
  assert.deepEqual(allocateDiscount([0, 0], 0), [0, 0]);
});

test("old invoices retain their totals and received cash", () => {
  assert.deepEqual(getInvoiceTotals({ TotalPrix: 80, totalOrder: 80, PrixReture: 20 }), {
    subtotal: 80, discountType: "percent", discountValue: 0, discountAmount: 0,
    lineDiscountAmount: 0, orderDiscountAmount: 0,
    hasVat: false, vatRate: 0, vatAmount: 0, totalHT: 80,
    total: 80, paid: 100, change: 20,
  });
});

test("each product keeps its own percentage or DH discount", () => {
  const totals = calculateCartTotals([
    { price: 40, qty: 2, discountType: "percent", discountValue: 10 },
    { price: 20, qty: 1, discountType: "amount", discountValue: 5 },
  ]);
  assert.equal(totals.subtotal, 100);
  assert.deepEqual(totals.lines.map((line) => line.total), [72, 15]);
  assert.equal(totals.lineDiscountAmount, 13);
  assert.equal(totals.orderDiscountAmount, 0);
  assert.equal(totals.total, 87);
});

test("DH discount applies once to its product line and cannot exceed that line", () => {
  assert.equal(calculateCartTotals([{ price: 40, qty: 2, discountType: "amount", discountValue: 10 }]).total, 70);
  assert.throws(() => calculateCartTotals([
    { price: 40, qty: 2 },
    { price: 20, qty: 1, discountType: "amount", discountValue: 21 },
  ]), (error) => error.message === "discountAmountExceeded" && error.lineIndex === 1);
});

test("line discounts compose with the existing cashier order discount", () => {
  const totals = calculateCartTotals([
    { price: 40, qty: 2, discountType: "percent", discountValue: 10 },
    { price: 20, qty: 1, discountType: "amount", discountValue: 5 },
  ], "percent", 10);
  assert.equal(totals.orderDiscountAmount, 8.7);
  assert.equal(totals.discountAmount, 21.7);
  assert.equal(totals.total, 78.3);
});

test("invalid quantities cannot be saved as invoice lines", () => {
  for (const qty of [0, -1, 1.5, "", "bad"]) {
    assert.throws(() => calculateCartTotals([{ price: 40, qty }]), /invalidQuantity/);
  }
});

test("discounted and fully discounted invoices retain explicit zero values", () => {
  const totals = getInvoiceTotals({
    subtotal: 100, TotalPrix: 0, totalOrder: 0, amountPaid: 0, PrixReture: 0,
    discountType: "percent", discountValue: 100, discountAmount: 100,
  });
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.total, 0);
  assert.equal(totals.paid, 0);
  assert.equal(totals.discountAmount, 100);
});

test("TVA is added after product and invoice discounts without changing HT line totals", () => {
  const totals = calculateCartTotals([
    { price: 40, qty: 2, discountType: "percent", discountValue: 10 },
    { price: 20, qty: 1, discountType: "amount", discountValue: 5 },
  ], "percent", 10, "20");
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.discountAmount, 21.7);
  assert.equal(totals.totalHT, 78.3);
  assert.equal(totals.vatRate, 20);
  assert.equal(totals.vatAmount, 15.66);
  assert.equal(totals.total, 93.96);
  assert.deepEqual(totals.lines.map((line) => line.total), [72, 15]);
});

test("TVA accepts decimal rates and rounds once on the invoice net total", () => {
  const totals = calculateCartTotals([{ price: 0.05, qty: 3 }], "percent", 0, "10");
  assert.equal(totals.vatAmount, 0.02);
  assert.equal(totals.total, 0.17);
  assert.equal(calculateCartTotals([{ price: 19.99, qty: 1 }], "percent", 0, "7.5").vatAmount, 1.5);
  assert.equal(calculateCartTotals([{ price: 100, qty: 1 }], "percent", 100, 20).vatAmount, 0);
  assert.equal(calculateCartTotals([{ price: 100, qty: 1 }], "percent", 0, 0).total, 100);
});

test("TVA rejects invalid rates and leaves the saved tax snapshot unchanged", () => {
  for (const rate of [-1, 100.01, "bad", "", " ", null, true, [], {}, NaN, Infinity]) {
    assert.throws(() => calculateCartTotals([{ price: 100, qty: 1 }], "percent", 0, rate), /invalidVatRate/);
  }
  const totals = getInvoiceTotals({
    TotalPrix: 108, totalHT: 90, vatRate: 20, vatAmount: 18, discountAmount: 10,
    amountPaid: 120, PrixReture: 12,
  });
  assert.equal(totals.hasVat, true);
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.totalHT, 90);
  assert.equal(totals.vatAmount, 18);
  assert.equal(totals.total, 108);
  assert.equal(totals.paid, 120);
  assert.equal(totals.change, 12);
  assert.equal(getInvoiceTotals({ TotalPrix: 100, totalHT: 100, vatRate: 0, vatAmount: 0 }).hasVat, true);
});
