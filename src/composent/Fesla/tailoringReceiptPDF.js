import { autoTable } from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import { normalizeInvoiceSettings } from '../../../shared/invoiceSettings.js';
import { publicTailoringReceipt } from '../../../shared/tailoringReceipts.js';
import { createPdfDocument, pdfTableStyles, pdfLtr } from '../../utils/createPdfDocument.js';

// Project again at the export boundary: customer files never contain costs,
// profits, photos, stock identifiers or the complete internal order.
export async function createTailoringReceiptPDF(snapshot, settings, { t, rtl, locale }) {
  const data = publicTailoringReceipt(snapshot), config = normalizeInvoiceSettings(settings || {});
  const doc = await createPdfDocument({ rtl }), base = pdfTableStyles(rtl);
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const order = cells => rtl ? [...cells].reverse() : cells;
  const money = value => value === null ? '-' : pdfLtr(new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ' + t('fesla.currency'));
  const date = (value, time = false) => {
    const parsed = new Date(String(value).length === 10 ? value + 'T12:00:00' : value);
    return value && Number.isFinite(parsed.getTime()) ? pdfLtr(parsed.toLocaleString(locale, { dateStyle: 'short', ...(time ? { timeStyle: 'short' } : {}) }).replace(/[\u061c\u200e\u200f]/g, '')) : '-';
  };
  const table = { ...base, theme: 'grid', rowPageBreak: 'avoid', styles: { ...base.styles, fontSize: 11, cellPadding: 2.5, textColor: [28, 47, 70], lineColor: [214, 225, 237], lineWidth: 0.2 }, headStyles: { ...base.headStyles, fillColor: [37, 83, 158], textColor: [255, 255, 255] } };
  const plain = { ...table, theme: 'plain', styles: { ...table.styles, lineWidth: 0, cellPadding: 1.2 } };
  const payment = data.kind === 'payment', title = t('fesla.receipts.' + (payment ? 'paymentTitle' : 'orderTitle'));
  autoTable(doc, { ...plain, startY: 14, body: [
    [config.visibility.shopName && config.shopName || t('fesla.receipts.shopFallback')],
    ...(['address', 'phone'].filter(key => config.visibility[key] && config[key]).map(key => [key === 'phone' ? pdfLtr(config[key]) : config[key]])),
    [title], [t('fesla.receipts.reference') + ': ' + pdfLtr(data.reference)], [date(data.issuedAt, true)],
  ], didParseCell: cell => { if (cell.row.index === 0 || cell.cell.raw === title) { cell.cell.styles.fontStyle = 'bold'; cell.cell.styles.fontSize = 18; cell.cell.styles.textColor = [29, 78, 153]; } } });
  autoTable(doc, { ...plain, startY: doc.lastAutoTable.finalY + 5, body: [
    [t('fesla.clientName') + ': ' + data.clientName], [t('fesla.phone') + ': ' + pdfLtr(data.phone || '-')],
    [t('fesla.receipts.orderKind') + ': ' + t('fesla.garmentTypes.' + data.garmentType) + ' (' + data.items.length + ')'],
    [t('fesla.orderDate') + ': ' + date(data.orderDate) + '   |   ' + t('fesla.readyDate') + ': ' + date(data.readyDate)],
  ], styles: { ...plain.styles, fillColor: [239, 246, 255], cellPadding: 2 } });
  if (!payment) autoTable(doc, { ...table, startY: doc.lastAutoTable.finalY + 7,
    head: [order(['item', 'fabric', 'price'].map(key => t('fesla.receipts.' + key)))],
    body: data.items.map(item => order([
      [t('fesla.receipts.item') + ' ' + item.number, item.trouserType && t('fesla.trouserTypes.' + item.trouserType), item.shirtType, item.pricing?.fourFille && pdfLtr('4fille +' + money(item.pricing.fourFilleAmount))].filter(Boolean).join('\n'),
      [item.fabricType, t('fesla.sources.' + item.fabricSource), item.fabricReference && t('fesla.fabricReference') + ': ' + item.fabricReference,
        item.fabricColor && t('fesla.fabricColor') + ': ' + item.fabricColor,
        item.fabricMeters !== undefined && t('fesla.costs.fabricMeters') + ': ' + pdfLtr(item.fabricMeters) + ' ' + t('fesla.costs.metersUnit'),
        item.sfifa && [t('fesla.widths.' + item.sfifa.width), t('fesla.styles.' + item.sfifa.style), ...(item.sfifa.style !== 'fabric' ? [item.sfifa.color1, item.sfifa.color2] : [])].filter(Boolean).join(' · '),
      ].filter(Boolean).join('\n'),
      money(item.price) + (item.pricing?.discountAmount > 0 ? '\n' + t('fesla.adjustments.pieceDiscount') + ': ' + money(item.pricing.discountAmount) : ''),
    ])), columnStyles: { [rtl ? 2 : 0]: { cellWidth: 32 }, [rtl ? 0 : 2]: { cellWidth: 45 } }, alternateRowStyles: { fillColor: [248, 250, 253] },
  });
  const rows = payment ? [['totalPrice', data.totalPrice], ['received', data.paymentAmount], [data.historical ? 'paidAfter' : 'currentPaid', data.paidAmount], [data.historical ? 'remainingAfter' : 'currentRemaining', data.remainingAmount]] : [
    ...(data.adjustments ? [['subtotal', data.adjustments.subtotal], ['orderDiscount', data.adjustments.discountAmount]] : []),
    ['totalPrice', data.totalPrice], ['paidAmount', data.paidAmount], ['remainingAmount', data.remainingAmount],
  ];
  const label = key => t(['subtotal', 'orderDiscount'].includes(key) ? 'fesla.adjustments.' + key : ['totalPrice', 'paidAmount', 'remainingAmount'].includes(key) ? 'fesla.' + key : 'fesla.receipts.' + key);
  autoTable(doc, { ...table, startY: doc.lastAutoTable.finalY + 7, pageBreak: 'avoid', tableWidth: 130, margin: { ...base.margin, left: width - 144 },
    body: rows.map(([key, value]) => order([label(key), money(value)])),
    didParseCell: cell => { if (cell.row.index === rows.length - 1) { cell.cell.styles.fillColor = [223, 243, 233]; cell.cell.styles.fontStyle = 'bold'; cell.cell.styles.textColor = [14, 100, 68]; } },
  });
  if (!data.historical || config.visibility.footer && config.footer) autoTable(doc, { ...plain, startY: doc.lastAutoTable.finalY + 5, body: [
    ...(!data.historical ? [[t('fesla.receipts.currentBalanceNote')]] : []), ...(config.visibility.footer && config.footer ? [[config.footer]] : []),
  ], styles: { ...plain.styles, fontSize: 10, textColor: [85, 103, 125] } });
  let y = doc.lastAutoTable.finalY + 7;
  if (y + 24 > height - 16) { doc.addPage(); y = 18; }
  const encoded = {};
  JsBarcode(encoded, data.orderBarcode, { format: 'CODE128', displayValue: false });
  const bars = encoded.encodings.map(entry => entry.data).join(''), barWidth = Math.min(0.3, (width - 42) / bars.length), left = (width - bars.length * barWidth) / 2;
  doc.setFillColor(17, 24, 39);
  for (let index = 0; index < bars.length; index++) if (bars[index] === '1') doc.rect(left + index * barWidth, y, barWidth, 12, 'F');
  doc.setFontSize(9); doc.setTextColor(28, 47, 70); doc.text(pdfLtr(data.orderBarcode), width / 2, y + 18, { align: 'center' });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFont('Amiri', 'normal'); doc.setFontSize(9); doc.setTextColor(85, 103, 125); doc.text(pdfLtr(`${page} / ${pages}`), width / 2, height - 7, { align: 'center' }); }
  doc.setProperties({ title, subject: data.reference, author: config.visibility.shopName ? config.shopName : '' });
  return doc;
}
