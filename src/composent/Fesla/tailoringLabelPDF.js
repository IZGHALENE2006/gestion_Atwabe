import { autoTable } from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import { tailoringGarmentType, tailoringOrderItems } from '../../../shared/tailoring.js';
import { tailoringOrderBarcode } from '../../../shared/tailoringBarcode.js';
import { createPdfDocument, pdfLtr, pdfTableStyles } from '../../utils/createPdfDocument.js';
import { tailoringMeasurementText } from './tailoringMeasurementText.js';

// Match the printed ticket: customer, barcode and measurements only.
export async function createTailoringLabelPDF(order, { t, rtl, locale }) {
  const barcode = tailoringOrderBarcode(order);
  if (!barcode) throw new Error('Invalid tailoring barcode');
  const doc = await createPdfDocument({ rtl }), base = pdfTableStyles(rtl);
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = (width - 90) / 2;
  const garment = tailoringGarmentType(order), items = tailoringOrderItems(order), date = new Date(order.readyDate + 'T12:00:00');
  const table = { ...base, theme: 'plain', margin: { top: 14, bottom: 14, left: margin, right: margin }, styles: { ...base.styles, fontSize: 12, cellPadding: 1.5, halign: 'center', textColor: [15, 23, 42] } };
  autoTable(doc, { ...table, startY: 14, body: [
    [t('fesla.title') + ' · ' + t('fesla.garmentTypes.' + garment)], [order.clientName], [pdfLtr(order.phone || '')],
    [t('fesla.readyDate') + ': ' + (Number.isFinite(date.getTime()) ? pdfLtr(date.toLocaleDateString(locale)) : '—')],
    [t(garment === 'djellaba' ? 'fesla.garmentsCount' : 'fesla.' + garment + '.garmentsCount', { count: items.length })],
  ], didParseCell: data => { if (data.row.index === 1) { data.cell.styles.fontSize = 17; data.cell.styles.fontStyle = 'bold'; } } });
  let y = doc.lastAutoTable.finalY + 5;
  if (y + 28 > height - 14) { doc.addPage(); y = 14; }
  const encoded = {}; JsBarcode(encoded, barcode, { format: 'CODE128' });
  const bars = encoded.encodings.map(entry => entry.data).join(''), barWidth = Math.min(0.35, 80 / bars.length), left = (width - bars.length * barWidth) / 2;
  doc.setFillColor(0, 0, 0);
  for (let index = 0; index < bars.length; index++) if (bars[index] === '1') doc.rect(left + index * barWidth, y, barWidth, 15, 'F');
  doc.setFontSize(10); doc.text(pdfLtr(barcode), width / 2, y + 21, { align: 'center' }); y += 27;
  const measurements = items.flatMap((item, index) => {
    const text = tailoringMeasurementText(item, t);
    return text.trim() ? [[{ content: t('fesla.measurements.title') + ' · ' + t(garment === 'djellaba' ? 'fesla.garmentNumber' : 'fesla.' + garment + '.garmentNumber', { number: index + 1 }), styles: { fontStyle: 'bold', fillColor: [243, 247, 252] } }], [text]] : [];
  });
  if (measurements.length) autoTable(doc, { ...table, startY: y, body: measurements, styles: { ...table.styles, halign: rtl ? 'right' : 'left', cellPadding: 2, fontSize: 12 }, rowPageBreak: 'avoid' });
  doc.setProperties({ title: t('fesla.labelTitle'), subject: barcode });
  return doc;
}
