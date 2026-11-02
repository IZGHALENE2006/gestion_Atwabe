import test from "node:test";
import assert from "node:assert/strict";
import { filterInvoicesByView, invoiceDateKey } from "../shared/invoiceFilters.js";

const now = new Date(2026, 8, 27, 12);
const records = [
  { _id: "manual-old", invoiceOrigin: "manual", DateFacture: new Date(2024, 0, 5, 12).toISOString() },
  { _id: "manual-today", invoiceOrigin: "manual", DateFacture: now.toISOString() },
  { _id: "cashier-today", invoiceOrigin: "cashier", DateFacture: now.toISOString() },
  { _id: "cashier-yesterday", invoiceOrigin: "cashier", DateFacture: new Date(2026, 8, 26, 12).toISOString() },
  { _id: "cashier-august", invoiceOrigin: "cashier", DateFacture: new Date(2026, 7, 4, 12).toISOString() },
  { _id: "legacy", DateFacture: now.toISOString() },
];
const ids = (options, invoices = records) => filterInvoicesByView(invoices, { now, ...options }).map((invoice) => invoice._id);

test("added invoices stay visible across dates and ignore cashier period filters", () => {
  assert.deepEqual(ids({ view: "manual", filterType: "year", periodValue: "2026" }), ["manual-old", "manual-today"]);
});

test("cashier's daily view excludes added invoices and retains legacy receipts", () => {
  assert.deepEqual(ids({ view: "cashier" }), ["cashier-today", "legacy"]);
});

test("cashier history filters day, month and year without mixing added invoices", () => {
  assert.deepEqual(ids({ view: "history", filterType: "day", periodValue: "2026-09-26" }), ["cashier-yesterday"]);
  assert.deepEqual(ids({ view: "history", filterType: "month", periodValue: "2026-09" }), ["cashier-today", "cashier-yesterday", "legacy"]);
  assert.deepEqual(ids({ view: "history", filterType: "year", periodValue: "2026" }), ["cashier-today", "cashier-yesterday", "cashier-august", "legacy"]);
  assert.deepEqual(ids({ view: "history", periodValue: "" }), []);
});

test("cashier periods use local calendar dates, including the start of the day", () => {
  const midnight = new Date(2026, 8, 27, 0, 15);
  assert.equal(invoiceDateKey(midnight.toISOString()), "2026-09-27");
  assert.deepEqual(ids({ view: "cashier" }, [{ _id: "midnight", DateFacture: midnight.toISOString() }]), ["midnight"]);
});

test("missing and invalid dates never appear as today's cashier invoices", () => {
  assert.deepEqual(ids({ view: "cashier" }, [{ _id: "missing" }, { _id: "bad-date", DateFacture: "invalid" }]), []);
});
