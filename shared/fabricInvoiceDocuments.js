import { fabricInvoiceLineName } from './fabricInvoices.js';

const addMoney = (a, b = 0) => (Math.round(a * 100) + Math.round(b * 100)) / 100;
// Invoice rows show line discounts first. The global discount appears once in
// the summary; the stored sale/credit rows retain their allocated net amounts.
export function fabricInvoiceDocument(invoice) {
  const hasDiscount = invoice.discountAmount > 0;
  return { kind: 'invoice', titleKey: 'fabricInvoices.title', currentBalance: true, reference: invoice.reference, date: invoice.date, actor: invoice.actor, customer: invoice.customer, total: invoice.total, paid: invoice.paidAmount, remaining: invoice.remaining,
    ...(hasDiscount ? { discountSummary: [
      { key: 'subtotal', labelKey: 'fabricInvoices.subtotal', value: invoice.subtotal },
      { key: 'lineDiscountAmount', labelKey: 'fabricInvoices.lineDiscountAmount', value: invoice.lineDiscountAmount ?? invoice.discountAmount },
      { key: 'invoiceDiscountAmount', labelKey: 'fabricInvoices.invoiceDiscountAmount', value: invoice.invoiceDiscountAmount ?? 0 },
    ] } : {}),
    lines: invoice.lines.map((line, index) => ({ id: String(index), nom: fabricInvoiceLineName(line), unit: 'meter', Quantite: line.meters, prix: line.unitPrice, discountAmount: line.lineDiscountAmount ?? line.discountAmount, lineTotal: addMoney(line.total, line.invoiceDiscountAmount), Date: invoice.date })) };
}

export function fabricInvoicePDFData(invoice) {
  return { _id: invoice.reference, invoiceOrigin: 'fabric', DateFacture: invoice.date, nameEmp: invoice.actor.name, clientName: invoice.customer.name, clientPhone: invoice.customer.phone,
    Product: invoice.lines.map(line => ({ name: fabricInvoiceLineName(line), code: line.barcode, quantite: line.meters, unit: 'meter', price: line.unitPrice, TotalPrix: addMoney(line.total, line.invoiceDiscountAmount), subtotal: line.subtotal, discountType: line.discountType, discountValue: line.discountValue, discountAmount: line.lineDiscountAmount ?? line.discountAmount })),
    TotalQauntite: Math.round(invoice.lines.reduce((sum, line) => sum + line.meters, 0) * 1000) / 1000,
    TotalPrix: invoice.total, totalOrder: invoice.total, subtotal: invoice.subtotal, discountAmount: invoice.discountAmount, lineDiscountAmount: invoice.lineDiscountAmount ?? invoice.discountAmount, orderDiscountAmount: invoice.invoiceDiscountAmount ?? 0, discountType: invoice.invoiceDiscount?.type ?? 'percent', discountValue: invoice.invoiceDiscount?.value ?? 0, amountPaid: invoice.paidAmount, remainingAmount: invoice.remaining, PrixReture: 0 };
}
