export const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateSaleTotals(subtotal, discountType = "percent", discountValue = 0) {
  const value = discountValue === "" ? 0 : Number(discountValue);
  if (
    !["percent", "amount"].includes(discountType) ||
    !["number", "string"].includes(typeof discountValue) ||
    !Number.isFinite(value) || value < 0
  ) {
    throw new Error("invalidDiscount");
  }
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error("invalidSubtotal");
  subtotal = roundMoney(subtotal);
  if (discountType === "percent" && value > 100) throw new Error("discountPercentageExceeded");
  if (discountType === "amount" && value > subtotal) throw new Error("discountAmountExceeded");

  const normalizedValue = roundMoney(value);
  const discountAmount = discountType === "percent"
    ? roundMoney(subtotal * normalizedValue / 100)
    : normalizedValue;

  return {
    subtotal,
    discountType,
    discountValue: normalizedValue,
    discountAmount,
    total: roundMoney(subtotal - discountAmount),
  };
}

function normalizeVatRate(vatRate) {
  if (
    !["number", "string"].includes(typeof vatRate) || String(vatRate).trim() === "" ||
    !Number.isFinite(Number(vatRate)) || Number(vatRate) < 0 || Number(vatRate) > 100
  ) throw new Error("invalidVatRate");
  return roundMoney(vatRate);
}

export function calculateCartTotals(items, discountType = "percent", discountValue = 0, vatRate = 0) {
  const fallbackVatRate = normalizeVatRate(vatRate);
  const lines = items.map((item, index) => {
    try {
      const price = Number(item.price);
      const qty = Number(item.qty);
      if (!Number.isInteger(qty) || qty <= 0) throw new Error("invalidQuantity");
      if (item.price === "" || !Number.isFinite(price) || price < 0) throw new Error("invalidPrice");
      return {
        ...calculateSaleTotals(roundMoney(price * qty), item.discountType ?? "percent", item.discountValue ?? 0),
        vatRate: item.vatRate === undefined ? fallbackVatRate : normalizeVatRate(item.vatRate),
      };
    } catch (error) {
      error.lineIndex = index;
      throw error;
    }
  });
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const lineDiscountAmount = roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0));
  const order = calculateSaleTotals(roundMoney(subtotal - lineDiscountAmount), discountType, discountValue);
  const orderDiscounts = allocateDiscount(lines.map((line) => line.total), order.discountAmount);
  const groups = new Map();
  lines.forEach((line, index) => {
    line.orderDiscountAmount = orderDiscounts[index];
    line.totalHT = roundMoney(line.total - line.orderDiscountAmount);
    if (!groups.has(line.vatRate)) groups.set(line.vatRate, []);
    groups.get(line.vatRate).push(line);
  });
  // Round each tax-rate group once and allocate every cent to its product lines.
  // This also preserves the previous single-rate calculation for older clients.
  const vatBreakdown = [...groups].sort(([a], [b]) => a - b).map(([rate, group]) => {
    const baseHT = roundMoney(group.reduce((sum, line) => sum + line.totalHT, 0));
    const amount = roundMoney(baseHT * rate / 100);
    const shares = allocateDiscount(group.map((line) => line.totalHT), amount);
    group.forEach((line, index) => {
      line.vatAmount = shares[index];
      line.totalTTC = roundMoney(line.totalHT + line.vatAmount);
    });
    return { vatRate: rate, baseHT, vatAmount: amount };
  });
  const vatAmount = roundMoney(vatBreakdown.reduce((sum, group) => sum + group.vatAmount, 0));
  return {
    ...order,
    totalHT: order.total,
    vatRate: groups.size > 1 ? undefined : vatBreakdown[0]?.vatRate ?? fallbackVatRate,
    vatAmount,
    vatBreakdown,
    total: roundMoney(order.total + vatAmount),
    subtotal,
    lines,
    lineDiscountAmount,
    orderDiscountAmount: order.discountAmount,
    discountAmount: roundMoney(lineDiscountAmount + order.discountAmount),
  };
}

// Allocate every cent of the invoice discount so sales profits match the net total.
export function allocateDiscount(lineTotals, discountAmount) {
  const cents = lineTotals.map((total) => Math.round(total * 100));
  const subtotal = cents.reduce((sum, total) => sum + total, 0);
  const discountCents = Math.round(discountAmount * 100);
  let cumulativeTotal = 0;
  let allocated = 0;
  return cents.map((total) => {
    cumulativeTotal += total;
    const target = subtotal === 0 ? 0 : Math.round(discountCents * cumulativeTotal / subtotal);
    const share = target - allocated;
    allocated = target;
    return share / 100;
  });
}

// Read saved amounts without retroactively adding VAT to older invoices.
export function getInvoiceTotals(invoice = {}) {
  const total = Number(invoice.TotalPrix ?? invoice.totalOrder ?? 0);
  const vatAmount = Number(invoice.vatAmount ?? 0);
  const totalHT = Number(invoice.totalHT ?? roundMoney(total - vatAmount));
  const discountAmount = Number(invoice.discountAmount ?? 0);
  const lineDiscountAmount = Number(invoice.lineDiscountAmount ??
    roundMoney((invoice.Product ?? []).reduce((sum, line) => sum + Number(line.discountAmount ?? 0), 0)));
  const change = Number(invoice.PrixReture ?? 0);
  const rates = [...new Set((invoice.Product ?? []).filter((line) => line.vatRate != null).map((line) => Number(line.vatRate)))];
  return {
    subtotal: Number(invoice.subtotal ?? roundMoney(totalHT + discountAmount)),
    hasVat: invoice.vatRate != null || invoice.vatAmount != null || rates.length > 0,
    vatRate: invoice.vatRate != null ? Number(invoice.vatRate) : rates.length > 1 ? null : rates[0] ?? 0,
    vatAmount,
    totalHT,
    discountType: invoice.discountType ?? "percent",
    discountValue: Number(invoice.discountValue ?? 0),
    discountAmount,
    lineDiscountAmount,
    orderDiscountAmount: Number(invoice.orderDiscountAmount ?? roundMoney(discountAmount - lineDiscountAmount)),
    total,
    paid: Number(invoice.amountPaid ?? roundMoney(Number(invoice.totalOrder ?? total) + change)),
    change,
  };
}

// Saved invoices are snapshots: never recompute their tax from current products.
export function getInvoiceVatBreakdown(invoice = {}) {
  const totals = getInvoiceTotals(invoice);
  if (!totals.hasVat) return [];
  const products = invoice.Product ?? [];
  if (!products.length || !products.every((line) => line.vatRate != null && line.vatAmount != null && line.totalHT != null)) {
    return [{ vatRate: totals.vatRate ?? 0, baseHT: totals.totalHT, vatAmount: totals.vatAmount }];
  }
  const groups = new Map();
  for (const line of products) {
    const rate = Number(line.vatRate);
    const group = groups.get(rate) ?? { vatRate: rate, baseHT: 0, vatAmount: 0 };
    group.baseHT = roundMoney(group.baseHT + Number(line.totalHT));
    group.vatAmount = roundMoney(group.vatAmount + Number(line.vatAmount));
    groups.set(rate, group);
  }
  return [...groups.values()].sort((a, b) => a.vatRate - b.vatRate);
}
