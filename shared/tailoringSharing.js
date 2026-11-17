import { publicTailoringReceipt } from './tailoringReceipts.js';
import { tailoringGarmentType } from './tailoring.js';
import { tailoringOrderBarcode } from './tailoringBarcode.js';

export function tailoringReceiptFilename(reference) {
  return 'tailoring_' + String(reference || 'receipt').replace(/[^a-z\d_-]/gi, '_').slice(0, 100) + '.pdf';
}

export function tailoringReceiptMessage(snapshot, { t, locale }) {
  const data = publicTailoringReceipt(snapshot);
  const money = value => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ' + t('fesla.currency');
  const payment = data.kind === 'payment';
  return [
    t('fesla.whatsapp.greeting', { name: data.clientName }),
    t('fesla.receipts.' + (payment ? 'paymentTitle' : 'orderTitle')) + ' · ' + data.reference,
    t('fesla.totalPrice') + ': ' + money(data.totalPrice),
    ...(payment ? [t('fesla.receipts.received') + ': ' + money(data.paymentAmount)] : []),
    t(payment ? 'fesla.receipts.' + (data.historical ? 'paidAfter' : 'currentPaid') : 'fesla.paidAmount') + ': ' + money(data.paidAmount),
    t(payment ? 'fesla.receipts.' + (data.historical ? 'remainingAfter' : 'currentRemaining') : 'fesla.remainingAmount') + ': ' + money(data.remainingAmount),
    ...(!data.historical ? [t('fesla.receipts.currentBalanceNote')] : []),
  ].join('\n');
}

export function tailoringReadyMessage(order, status, { t }) {
  return t('fesla.whatsapp.' + (status === 'almost' ? 'almostMessage' : 'readyMessage'), {
    name: order.clientName, reference: tailoringOrderBarcode(order), garment: t('fesla.garmentTypes.' + tailoringGarmentType(order)),
  });
}
