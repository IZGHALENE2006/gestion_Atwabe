import { allocateDiscount, roundMoney } from "./saleTotals.js";

const money = value => ["number", "string"].includes(typeof value) && String(value).trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const plain = value => typeof value?.toObject === "function" ? value.toObject() : value;
export const saleRevenue = sale => money(sale?.saleAmount) ? roundMoney(Number(sale.saleAmount)) : roundMoney(Math.max(0, number(sale?.price) * number(sale?.quantite)));

function invoiceAmounts(invoice) {
  const lines = invoice.Product || [], total = invoice.TotalPrix ?? invoice.totalOrder;
  if (!lines.length || !money(total)) return null;
  const exact = lines.map(line => line.totalTTC);
  if (exact.every(money) && Math.round(exact.reduce((sum, value) => sum + Number(value), 0) * 100) === Math.round(Number(total) * 100)) return exact.map(value => roundMoney(Number(value)));
  const weights = lines.map(line => money(line.totalHT) ? roundMoney(Number(line.totalHT) + number(line.vatAmount)) : money(line.TotalPrix) ? Number(line.TotalPrix) : roundMoney(number(line.price) * number(line.quantite) - number(line.discountAmount)));
  if (weights.some(value => !Number.isFinite(value) || value < 0)) return null;
  if (Number(total) === 0) return weights.map(() => 0);
  if (!weights.some(value => value > 0)) return null;
  // Allocate the saved invoice total, including every discount/tax cent. Never
  // use today's product prices or add profit to the sales amount.
  return allocateDiscount(weights, Number(total));
}
const signature = row => `${row.idProduct || ""}:${Number(row.quantite)}:${Number(row.price)}:${row.priceType || "retail"}`;
const timestamp = value => new Date(value).getTime();
function matching(row, entry) {
  return String(row.idProduct || "") !== "" && signature(row) === signature(entry.line) && (!row.invoiceId || String(row.invoiceId) === entry.invoiceId);
}

export function salesWithRevenue(account = {}) {
  const sales = (account.ventes || []).map(plain), invoices = (account.Facture || []).map(plain), entries = [];
  for (const invoice of invoices) {
    const amounts = invoiceAmounts(invoice);
    for (const [index, line] of (invoice.Product || []).entries()) entries.push({ invoiceId: String(invoice._id || ""), date: invoice.DateFacture, line, amount: amounts?.[index] });
  }
  const byInvoice = new Map(), byTime = new Map();
  const add = (map, key, entry) => { if (!map.has(key)) map.set(key, []); map.get(key).push(entry); };
  for (const entry of entries) {
    add(byInvoice, `${entry.invoiceId}:${signature(entry.line)}`, entry);
    if (Number.isFinite(timestamp(entry.date))) add(byTime, `${timestamp(entry.date)}:${signature(entry.line)}`, entry);
  }
  // Each checkout appends its sales and invoice together to the same account.
  // Use positional correspondence only when both complete arrays agree. A
  // partial/deleted/imported history must not shift amounts onto other sales.
  const aligned = entries.length === sales.length && sales.every((sale, index) => matching(sale, entries[index]) && Number.isFinite(timestamp(sale.DateVante)) && timestamp(sale.DateVante) <= timestamp(entries[index].date));
  const used = new Set();
  for (const [index, sale] of sales.entries()) if (money(sale.saleAmount)) {
    if (aligned) used.add(entries[index]);
    else if (sale.invoiceId) {
      const linked = byInvoice.get(`${sale.invoiceId}:${signature(sale)}`) || [];
      if (linked.length === 1) used.add(linked[0]);
    }
  }
  return sales.map((sale, index) => {
    if (money(sale.saleAmount)) return { ...sale, saleAmount: roundMoney(Number(sale.saleAmount)), saleAmountSource: sale.saleAmountSource || "stored" };
    let matched;
    if (sale.invoiceId) {
      const candidates = byInvoice.get(`${sale.invoiceId}:${signature(sale)}`) || [];
      if (candidates.length === 1) matched = candidates[0];
    }
    if (!matched && aligned) matched = entries[index];
    if (!matched) {
      const candidates = (byTime.get(`${timestamp(sale.DateVante)}:${signature(sale)}`) || []).filter(entry => !used.has(entry) && matching(sale, entry));
      if (candidates.length === 1) matched = candidates[0];
    }
    if (matched && money(matched.amount) && !used.has(matched)) { used.add(matched); return { ...sale, saleAmount: matched.amount, saleAmountSource: "invoice" }; }
    return { ...sale, saleAmount: saleRevenue(sale), saleAmountSource: "legacy" };
  });
}

export function summarizeSales(sales = []) {
  let revenue = 0, profit = 0, quantity = 0, legacyCount = 0;
  for (const sale of sales) {
    revenue += Math.round(saleRevenue(sale) * 100);
    profit += Math.round(number(sale.profite) * 100);
    quantity += number(sale.quantite);
    if (!money(sale.saleAmount) || sale.saleAmountSource === "legacy") legacyCount += 1;
  }
  return { revenue: revenue / 100, profit: profit / 100, quantity, records: sales.length, legacyCount };
}
export function salesPeriodKey(value = new Date(), unit = "day") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = String(date.getFullYear()), month = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return unit === "year" ? year : unit === "month" ? month : `${month}-${String(date.getDate()).padStart(2, "0")}`;
}
