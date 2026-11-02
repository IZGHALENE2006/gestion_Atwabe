export function invoiceDateKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function filterInvoicesByView(invoices, { view = "manual", filterType = "day", periodValue = "", now = new Date() } = {}) {
  if (view === "manual") return invoices.filter((invoice) => invoice.invoiceOrigin === "manual");

  // Records created before invoice origins were stored keep their cashier workflow.
  const cashierInvoices = invoices.filter((invoice) => invoice.invoiceOrigin !== "manual");
  const period = view === "cashier" ? invoiceDateKey(now) : periodValue;
  if (!period) return [];
  const length = view === "cashier" || filterType === "day" ? 10 : filterType === "month" ? 7 : 4;
  return cashierInvoices.filter((invoice) => {
    if (!invoice.DateFacture) return false;
    const date = invoiceDateKey(invoice.DateFacture);
    return date && date.slice(0, length) === period;
  });
}
