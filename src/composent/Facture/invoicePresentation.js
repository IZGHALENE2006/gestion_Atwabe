import { getInvoiceTotals, getInvoiceVatBreakdown } from "../../../shared/saleTotals.js";
import { getPaymentMethodLabel } from "../../../shared/paymentMethods.js";
import { normalizeInvoiceSettings } from "../../../shared/invoiceSettings.js";
import { isSalesDocument, documentReference, documentTitleKey, documentQuantity } from "../../../shared/salesDocuments.js";

export function invoicePresentation(invoice, settings, t, seller = "", locale = "fr-MA") {
  const config = normalizeInvoiceSettings(settings);
  const visible = config.visibility;
  const isNote = isSalesDocument(invoice);
  const totals = getInvoiceTotals(invoice);
  const money = (value) => `${Number(value).toFixed(2)} DH`;
  const rows = [];
  const add = (key, label, value) => rows.push({ key, label, value });
  if (visible.quantity) add("quantity", t("receiptPrint.totalQty"), documentQuantity(invoice, invoice.TotalQauntite || 0));
  if (visible.subtotal && totals.discountAmount > 0) add("subtotal", t("discount.subtotal"), money(totals.subtotal));
  if (visible.discounts && totals.lineDiscountAmount > 0) add("lineDiscounts", t("invoiceCreate.productDiscounts"), `-${money(totals.lineDiscountAmount)}`);
  if (visible.discounts && totals.orderDiscountAmount > 0) add("discount", `${t("discount.label")} (${totals.discountValue}${totals.discountType === "percent" ? "%" : " DH"})`, `-${money(totals.orderDiscountAmount)}`);
  if (visible.totalHT && totals.hasVat) add("totalHT", t("invoiceCreate.totalHT"), money(totals.totalHT));
  if (visible.vat && totals.hasVat) add("vat", `${t("invoiceCreate.vat")}${totals.vatRate == null ? "" : ` (${totals.vatRate}%)`}`, money(totals.vatAmount));
  add("total", t(totals.hasVat ? "invoiceCreate.totalTTC" : "salesPdf.total"), money(totals.total));
  if (!isNote && visible.paid) add("paid", t("receiptPrint.paid"), money(totals.paid));
  if (!isNote && visible.change) add("change", t("receiptPrint.change"), money(totals.change));
  const paymentMethod = isNote ? "" : getPaymentMethodLabel(invoice.paymentMethod);
  const sellerName = visible.seller ? invoice.nameEmp || seller : "";
  const clientName = visible.client ? invoice.clientName : "";
  const dateValue = isNote && invoice.documentDate ? `${invoice.documentDate}T12:00:00` : invoice.DateFacture;
  const date = dateValue
    ? new Date(dateValue).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/[\u200e\u200f\u061c]/g, "")
    : "—";
  const metadata = [
    ...(visible.reference ? [{ key: "reference", label: t("invoiceLayout.number"), value: String(documentReference(invoice)) }] : []),
    ...(visible.date ? [{ key: "date", label: t("salesPdf.date"), value: date }] : []),
    ...(sellerName ? [{ key: "seller", label: t("salesPdf.seller"), value: sellerName }] : []),
    ...(clientName ? [{ key: "client", label: t("invoicePage.client"), value: clientName }] : []),
    ...(visible.paymentMethod && paymentMethod ? [{ key: "paymentMethod", label: t("invoiceCreate.paymentMethod"), value: paymentMethod }] : []),
  ];
  const hasLineDiscounts = visible.discounts && totals.lineDiscountAmount > 0;
  const showVat = visible.vat && totals.hasVat;
  const columns = [
    { key: "code", label: t("invoiceLayout.code"), width: 20 },
    { key: "description", label: t("invoiceLayout.description") },
    { key: "quantity", label: t("salesPdf.quantity"), width: 18, numeric: true },
    { key: "price", label: t(totals.hasVat ? "invoiceLayout.unitPriceHT" : "salesPdf.price"), width: 25, numeric: true },
    ...(hasLineDiscounts ? [{ key: "discount", label: t("discount.label"), width: 26, numeric: true }] : []),
    { key: "amount", label: t(totals.hasVat ? "invoiceLayout.amountHT" : "salesPdf.total"), width: 28, numeric: true },
    ...(showVat ? [{ key: "vat", label: t("invoiceCreate.vat"), width: 14, numeric: true }] : []),
  ];
  const productRows = (invoice.Product ?? []).map((line) => ({
    code: line.code || line.barcode || "—",
    description: line.name + (line.batchNumber ? ' · ' + t('productBatches.batch', { number: line.batchNumber }) : ''),
    quantity: documentQuantity(invoice, line.quantite),
    price: money(line.price || 0),
    discount: Number(line.discountAmount || 0) > 0 ? `${line.discountValue}${line.discountType === "percent" ? "%" : " DH"}\n-${money(line.discountAmount)}` : "—",
    // Legacy line totals were stored before the invoice-level discount.
    amount: money(line.TotalPrix ?? line.totalHT ?? 0),
    vat: `${Number(line.vatRate ?? totals.vatRate ?? 0)}%`,
  }));
  const payment = isNote ? [] : [
    ...(visible.date ? [{ key: "date", label: t("salesPdf.date"), value: date }] : []),
    ...(visible.paymentMethod && paymentMethod ? [{ key: "paymentMethod", label: t("invoiceCreate.paymentMethod"), value: paymentMethod }] : []),
    ...(visible.paid ? [{ key: "paid", label: t("invoiceSettings.fields.paid"), value: money(totals.paid) }] : []),
    ...(visible.change ? [{ key: "change", label: t("receiptPrint.change"), value: money(totals.change) }] : []),
  ];
  return {
    title: t(documentTitleKey(invoice)), note: isNote ? invoice.note || "" : "",
    config, visible, totals, rows, metadata, columns, productRows, payment,
    vatBreakdown: showVat ? getInvoiceVatBreakdown(invoice) : [],
    hasLineDiscounts,
    seller: sellerName,
    client: clientName,
    paymentMethod: visible.paymentMethod ? paymentMethod : "",
  };
}

export function invoiceLogoUrl(logo) {
  if (!/^\/uploads\/invoice-logos\/[a-f0-9-]{36}\.(png|jpg)$/.test(logo || "")) return "";
  return new URL(logo, import.meta.env?.VITE_API_URL || "http://localhost:7000").href;
}
