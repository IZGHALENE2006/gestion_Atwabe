import test from "node:test";
import assert from "node:assert/strict";
import { saleRevenue, salesWithRevenue, summarizeSales, salesPeriodKey } from "../shared/salesRevenue.js";
const date = "2026-10-24T10:00:00Z";
const sale = patch => ({ idProduct: "a", price: 20, quantite: 1, profite: 5, DateVante: date, ...patch });
const invoice = patch => ({ _id: "invoice", DateFacture: "2026-10-24T10:00:01Z", TotalPrix: 20, Product: [{ idProduct: "a", price: 20, quantite: 1, TotalPrix: 20 }], ...patch });
test("a 20 DH sale adds 20 DH to revenue and 5 DH to profit without counting either twice", () => {
  assert.equal(saleRevenue(sale({})), 20); assert.deepEqual(summarizeSales([sale({ saleAmount: 20 })]), { revenue: 20, profit: 5, quantity: 1, records: 1, legacyCount: 0 });
});
test("saved net revenue includes quantity, discounts and VAT, and preserves zero sales or negative profit", () => {
  const values = [sale({ price: 20, quantite: 3, saleAmount: 54, profite: 9 }), sale({ saleAmount: 0, profite: -15 }), sale({ saleAmount: 24, profite: 5 })];
  assert.deepEqual(summarizeSales(values), { revenue: 78, profit: -1, quantity: 5, records: 3, legacyCount: 0 });
  assert.equal(summarizeSales([sale({ saleAmount: 0.1 }), sale({ saleAmount: 0.2 })]).revenue, 0.3);
});
test("complete legacy sales arrays recover actual invoice totals after discounts and ignore customer cash/change", () => {
  const account = { ventes: [sale({}), sale({ idProduct: "b", price: 10, quantite: 2, profite: 4 })], Facture: [invoice({ TotalPrix: 36, amountPaid: 50, PrixReture: 14, Product: [{ idProduct: "a", price: 20, quantite: 1, TotalPrix: 20 }, { idProduct: "b", price: 10, quantite: 2, TotalPrix: 20 }] })] }, before = structuredClone(account);
  const rows = salesWithRevenue(account); assert.deepEqual(rows.map(row => row.saleAmount), [18, 18]); assert.equal(summarizeSales(rows).revenue, 36); assert.ok(rows.every(row => row.saleAmountSource === "invoice")); assert.deepEqual(account, before);
});
test("linked invoices recover mixed-rate VAT per product and allocated order discounts exactly", () => {
  const account = { ventes: [sale({ idProduct: "b", invoiceId: "invoice", price: 50 }), sale({ invoiceId: "invoice", price: 100 })], Facture: [invoice({ TotalPrix: 175, Product: [{ idProduct: "a", price: 100, quantite: 1, totalTTC: 120, TotalPrix: 100 }, { idProduct: "b", price: 50, quantite: 1, totalTTC: 55, TotalPrix: 50 }] })] };
  assert.deepEqual(salesWithRevenue(account).map(row => row.saleAmount), [55, 120]);
});
test("incomplete or ambiguous legacy histories never shift another invoice's discount onto an unrelated sale", () => {
  const account = { ventes: [sale({ idProduct: "missing" }), sale({})], Facture: [invoice({ TotalPrix: 10 })] };
  const rows = salesWithRevenue(account); assert.deepEqual(rows.map(row => row.saleAmount), [20, 20]); assert.ok(rows.every(row => row.saleAmountSource === "legacy")); assert.equal(summarizeSales(rows).legacyCount, 2);
  const exact = salesWithRevenue({ ventes: [sale({})], Facture: [invoice({ DateFacture: date, TotalPrix: 10 }), invoice({ _id: "other", DateFacture: date, TotalPrix: 15 })] }); assert.equal(exact[0].saleAmount, 20); assert.equal(exact[0].saleAmountSource, "legacy");
});
test("a known stored sale does not let an extra legacy row reuse its invoice evidence", () => {
  const rows = salesWithRevenue({ ventes: [sale({ invoiceId: "invoice", saleAmount: 10 }), sale({})], Facture: [invoice({ DateFacture: date, TotalPrix: 10 })] }); assert.equal(rows[1].saleAmount, 20); assert.equal(rows[1].saleAmountSource, "legacy");
});
test("legacy credit checkouts recover their exact timestamped invoice even when earlier sales have no invoices", () => {
  const rows = salesWithRevenue({ ventes: [sale({ idProduct: "old", DateVante: "2026-10-23T10:00:00Z" }), sale({ saleType: "credit" })], Facture: [invoice({ DateFacture: date, TotalPrix: 15 })] }); assert.equal(rows[1].saleAmount, 15); assert.equal(rows[1].saleAmountSource, "invoice");
});
test("the original sale amount is independent of later payments, current prices and the seller being filtered", () => {
  const a = salesWithRevenue({ ventes: [sale({ saleAmount: 20, saleType: "credit" })], Facture: [invoice({ TotalPrix: 999 })] }), b = salesWithRevenue({ ventes: [sale({ saleAmount: 40, quantite: 2, profite: 10 })] });
  assert.equal(summarizeSales([...a, ...b]).revenue, 60); assert.equal(summarizeSales(a).revenue, 20); assert.equal(summarizeSales(b).profit, 10);
});
test("period keys use the local calendar for day, month and year", () => {
  const local = new Date(2026, 0, 2, 0, 15); assert.equal(salesPeriodKey(local), "2026-01-02"); assert.equal(salesPeriodKey(local, "month"), "2026-01"); assert.equal(salesPeriodKey(local, "year"), "2026"); assert.equal(salesPeriodKey("invalid"), "");
});
