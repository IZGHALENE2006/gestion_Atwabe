import { autoTable } from 'jspdf-autotable';
import i18n from '../../i18n/index.js';
import { createPdfDocument, pdfLtr, pdfTableStyles } from '../../utils/createPdfDocument.js';
import { SFIFA_METER_TYPES, SFIFA_STOCK_FAMILIES, formatSfifaCode } from '../../../shared/sfifaStock.js';

export async function createSfifaInventoryPDF({ report, issuedAt = new Date(), language = i18n.language }) {
  if (!report?.rows?.length || !report.totals) throw new Error('emptyInventoryReport');
  const t = i18n.getFixedT(language), p = key => t('sfifaInventoryReport.' + key), rtl = i18n.dir(language) === 'rtl';
  const doc = await createPdfDocument({ rtl, orientation: 'landscape' });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 13, content = width - margin * 2;
  const x = rtl ? width - margin : margin, align = { align: rtl ? 'right' : 'left' }, reverse = row => rtl ? [...row].reverse() : row;
  const number = value => pdfLtr(new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 3, useGrouping: false }).format(value));
  const date = new Intl.DateTimeFormat(language === 'ar' ? 'ar-MA' : 'fr-MA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Casablanca' }).format(new Date(issuedAt));
  doc.setProperties({ title: p('title'), subject: p(report.includeUnavailable ? 'allStock' : 'availableOnly'), creator: 'Atwabe' });
  doc.setFillColor(22, 56, 91).rect(0, 0, width, 27, 'F');
  doc.setFont('Amiri', 'bold').setFontSize(21).setTextColor(255, 255, 255).text(p('title'), x, 18, align);
  doc.setFont('Amiri', 'normal').setFontSize(10).setTextColor(80, 102, 124).text(p('issuedAt') + ': ' + pdfLtr(date), x, 35, align);
  doc.text(p(report.includeUnavailable ? 'allStock' : 'availableOnly') + ' - ' + p('unit'), x, 42, align);
  const cardWidth = (content - 8) / 3;
  ['quantity', 'thin', 'thick'].forEach((key, index) => {
    const left = margin + (rtl ? 2 - index : index) * (cardWidth + 4), edge = rtl ? left + cardWidth - 4 : left + 4;
    doc.setFillColor(...(index ? [237, 245, 255] : [233, 249, 241])).roundedRect(left, 48, cardWidth, 23, 2, 2, 'F');
    doc.setTextColor(...(index ? [28, 80, 145] : [15, 112, 78])).setFont('Amiri', 'normal').setFontSize(10).text(t(key === 'quantity' ? 'sfifaStock.total' : 'sfifaStock.' + key + 'Total'), edge, 56, align);
    doc.setFont('Amiri', 'bold').setFontSize(16).text(number(report.totals[key]), edge, 66, align);
  });
  const keys = ['width', 'family', 'code', ...SFIFA_METER_TYPES, ...(report.hasUnclassified ? ['unclassifiedMeters'] : []), 'quantity'];
  const heading = key => ['single', 'double', 'gradient'].includes(key) ? t('sfifaStock.meterTypes.' + key) : key === 'code' ? p('colorCode') : key === 'unclassifiedMeters' ? p('unclassified') : key === 'quantity' ? p('total') : t('sfifaStock.' + key);
  const family = row => pdfLtr(SFIFA_STOCK_FAMILIES.find(item => item.value === row.family)?.label || row.family);
  const value = (row, key) => key === 'width' ? p(row.width) : key === 'family' ? family(row) : key === 'code' ? row.isUnassigned ? t('sfifaStock.unassigned') : pdfLtr(formatSfifaCode(row.code, row.family)) : number(SFIFA_METER_TYPES.includes(key) ? row.styleMeters[key] : row[key]);
  const body = report.rows.map(row => reverse(keys.map(key => value(row, key))));
  const foot = reverse(keys.map((key, index) => index === 0 ? p('total') : index < 3 ? '' : number(report.totals[key])));
  const widths = keys.map(key => key === 'width' ? 33 : key === 'family' ? 35 : key === 'code' ? 38 : (content - 106) / (keys.length - 3));
  const totalIndex = rtl ? 0 : keys.length - 1;
  autoTable(doc, {
    ...pdfTableStyles(rtl), startY: 79, margin: { top: 28, bottom: 23, left: margin, right: margin }, theme: 'grid',
    head: [reverse(keys.map(heading))], body, foot: [foot], showFoot: 'lastPage', rowPageBreak: 'avoid',
    styles: { ...pdfTableStyles(rtl).styles, fontSize: 11, cellPadding: 2.6, valign: 'middle', lineColor: [218, 229, 238], lineWidth: .15, halign: 'center' },
    headStyles: { ...pdfTableStyles(rtl).headStyles, fillColor: [30, 82, 134], textColor: 255, halign: 'center' },
    footStyles: { font: 'Amiri', fontStyle: 'bold', fillColor: [224, 245, 235], textColor: [13, 102, 71], halign: 'center' },
    alternateRowStyles: { fillColor: [245, 249, 253] },
    columnStyles: { ...Object.fromEntries(reverse(widths).map((cellWidth, index) => [index, { cellWidth }])), [totalIndex]: { cellWidth: widths.at(-1), fontStyle: 'bold', textColor: [10, 116, 78] } },
    didParseCell: data => { if (data.section === 'body' && report.rows[data.row.index].quantity === 0) { data.cell.styles.textColor = [159, 52, 52]; data.cell.styles.fillColor = [255, 246, 246]; } },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (page > 1) { doc.setFont('Amiri', 'bold').setFontSize(12).setTextColor(27, 69, 110).text(p('title'), x, 16, align); doc.setDrawColor(29, 159, 116).line(margin, 21, width - margin, 21); }
    doc.setDrawColor(218, 229, 238).line(margin, height - 17, width - margin, height - 17);
    doc.setFont('Amiri', 'normal').setFontSize(9).setTextColor(83, 106, 129).text(p('unit'), x, height - 10, align);
    doc.text(t('sfifaInventoryReport.page', { page: pdfLtr(page), pages: pdfLtr(pages) }), width / 2, height - 10, { align: 'center' });
  }
  return doc;
}

export async function downloadSfifaInventoryPDF(options) {
  const doc = await createSfifaInventoryPDF(options);
  const date = new Date(options.issuedAt || Date.now()).toISOString().slice(0, 10);
  await doc.save('sfifa-stock_' + date + '.pdf', { returnPromise: true });
}
