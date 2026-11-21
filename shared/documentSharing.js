import { tailoringOrderBarcode } from './tailoringBarcode.js';

export const documentShareFilename = (reference, kind = 'document') => `${kind}_${String(reference || 'document').replace(/[^a-z\d_-]/gi, '_').slice(0, 100)}.pdf`;

export function tailoringLabelShareMessage(order, { t }) {
  return t('documentSharing.labelMessage', { name: order.clientName, reference: tailoringOrderBarcode(order) });
}

export function fabricInvoiceShareMessage(invoice, { t, locale }) {
  const money = value => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ' + t('fesla.currency');
  return t('documentSharing.invoiceMessage', { name: invoice.customer.name || t('fabricInvoices.emptyCustomer'), reference: invoice.reference, total: money(invoice.total), paid: money(invoice.paidAmount), remaining: money(invoice.remaining) });
}
