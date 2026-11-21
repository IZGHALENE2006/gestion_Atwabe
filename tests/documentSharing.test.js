import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { documentShareFilename, fabricInvoiceShareMessage, tailoringLabelShareMessage } from '../shared/documentSharing.js';
import { creditWhatsAppUrl } from '../shared/creditSharing.js';
import { canEmployeeOperation, validateEmployeePermissions } from '../shared/employeeOperations.js';
import { fabricInvoicePDFData } from '../shared/fabricInvoiceDocuments.js';
import { TAILORING_GARMENT_TYPES } from '../shared/tailoring.js';

globalThis.localStorage = { getItem: () => 'ar' };
let failFonts = false;
globalThis.fetch = async url => failFonts ? new Response(null, { status: 503 }) : new Response(await readFile(new URL(url)));
const { default: i18n } = await import('../src/i18n/index.js');
const { createTailoringLabelPDF } = await import('../src/composent/Fesla/tailoringLabelPDF.js');
const { createFacturePDF } = await import('../src/composent/Facture/invoicePDF.js');
const options = language => ({ t: i18n.getFixedT(language), rtl: language === 'ar', locale: language === 'ar' ? 'ar-MA' : 'fr-MA' });
const order = { _id: '123456789012345678901234', clientName: 'عميلة الاختبار Customer', phone: '0612345678', readyDate: '2026-12-01', totalPrice: 9999, expenseAmount: 8888, photo: 'PRIVATE-PHOTO', items: [{ lineId: 'a', price: 7777, fabricType: 'PRIVATE-FABRIC', fabricSource: 'client', measurementNotes: 'الكتف: 40\nالكم: 60\nMEASURE-END' }] };
const invoice = { reference: 'FI-123456789012345678901234', date: '2026-11-21T12:00:00Z', customer: { name: 'Customer عميلة', phone: '0612345678' }, actor: { name: 'موظف البائع' }, subtotal: 120, total: 100, paidAmount: 40, remaining: 60, discountAmount: 20, lineDiscountAmount: 10, invoiceDiscountAmount: 10, invoiceDiscount: { type: 'amount', value: 10 }, profitAmount: 9999, purchasePrice: 'PRIVATE-COST', lines: [{ type: 'Coton', color: 'أزرق', barcode: '1234567890128', meters: 2, unitPrice: 60, subtotal: 120, total: 100, discountAmount: 20, lineDiscountAmount: 10, invoiceDiscountAmount: 10 }] };
async function inspect(doc) {
  const task = getDocument({ data: new Uint8Array(doc.output('arraybuffer')) }), pdf = await task.promise, pages = [];
  try {
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index), content = await page.getTextContent(), operators = await page.getOperatorList();
      const viewport = page.getViewport({ scale: 1 });
      for (const item of content.items.filter(item => item.str?.trim())) {
        assert.ok(item.transform[4] >= 0 && item.transform[4] + item.width <= viewport.width + 2, 'Text fits page width: ' + item.str);
        assert.ok(item.transform[5] >= 0 && item.transform[5] <= viewport.height, 'Text fits page height');
      }
      pages.push({ text: content.items.map(item => item.str || '').join(' '), vectorPaths: operators.fnArray.filter(value => value === OPS.constructPath).length, images: operators.fnArray.includes(OPS.paintImageXObject) });
    }
    return pages;
  } finally { await task.destroy(); }
}
test('file names and messages preserve the exact barcode and customer contact without leaking private order data', () => {
  for (const language of ['ar', 'fr']) {
    const text = tailoringLabelShareMessage(order, options(language)), link = new URL(creditWhatsAppUrl(order.phone, text));
    assert.equal(link.pathname, '/212612345678'); assert.equal(link.searchParams.get('text'), text);
    assert.ok(text.includes(order.clientName)); assert.match(text, /FS-123456789012345678901234/); assert.doesNotMatch(text, /PRIVATE|9999|8888|7777/);
  }
  assert.equal(documentShareFilename('FS-123', 'tailoring_barcode'), 'tailoring_barcode_FS-123.pdf');
  assert.doesNotMatch(documentShareFilename('../../bad?\nname'), /\.\.\/|\n|\?/);
});
test('fabric invoice messages include its current total, paid and remaining without profit or purchase costs', () => {
  for (const language of ['ar', 'fr']) {
    const message = fabricInvoiceShareMessage(invoice, options(language));
    assert.match(message, /FI-123456789012345678901234/); assert.match(message, /100/); assert.match(message, /40/); assert.match(message, /60/); assert.doesNotMatch(message, /9999|PRIVATE/);
  }
});
test('sharing fabric invoices is an independent employee permission; label sharing uses existing tailoring share rights', () => {
  const user = validateEmployeePermissions({ moduleAccess: ['fabrics', 'tailoring'], operationPermissions: { fabrics: ['invoiceHistory', 'invoiceShare'], tailoring: ['labels'] } });
  assert.equal(canEmployeeOperation('Employe', user, 'fabrics', 'invoiceShare'), true);
  assert.equal(canEmployeeOperation('Employe', user, 'fabrics', 'invoicePrint'), false);
  assert.equal(canEmployeeOperation('Employe', user, 'tailoring', 'share'), false);
  user.operationPermissions.fabrics = ['invoicePrint']; assert.equal(canEmployeeOperation('Employe', user, 'fabrics', 'invoiceShare'), false);
  assert.equal(canEmployeeOperation('admin', null, 'fabrics', 'invoiceShare'), true);
});
test('PDF font preparation can recover after a failed request', async () => {
  failFonts = true; await assert.rejects(createTailoringLabelPDF(order, options('ar')), /invoice font/); failFonts = false;
  assert.ok(await createTailoringLabelPDF(order, options('ar')));
});
for (const language of ['ar', 'fr']) for (const garmentType of TAILORING_GARMENT_TYPES) test(`${language} ${garmentType} barcode PDF contains a vector barcode and measurements without prices or photos`, async () => {
  const before = structuredClone(order), pages = await inspect(await createTailoringLabelPDF({ ...order, garmentType }, options(language)));
  assert.equal(pages.length, 1); const text = pages.map(page => page.text).join(' ');
  assert.match(text, /FS-123456789012345678901234/); assert.match(text, /MEASURE-END/); assert.match(text, /0612345678/); assert.doesNotMatch(text, /PRIVATE|9999|8888|7777/);
  assert.ok(pages.some(page => page.vectorPaths > 0)); assert.ok(pages.every(page => !page.images)); assert.deepEqual(order, before);
});
test('legacy individual measurements and long notes remain available over multiple PDF pages', async () => {
  const legacy = { ...order, items: [{ lineId: 'a', measurements: { shoulder: 47, sleeve: 62 } }] };
  const first = await inspect(await createTailoringLabelPDF(legacy, options('fr'))); assert.match(first[0].text, /47/); assert.match(first[0].text, /62/);
  for (const language of ['ar', 'fr']) {
    const long = { ...order, items: Array.from({ length: 3 }, (_, index) => ({ lineId: String(index), measurementNotes: Array(35).fill('قياسات قطعة مفصلة طويلة Long garment measurements').join('\n') + '\nFINAL-' + index })) };
    const pages = await inspect(await createTailoringLabelPDF(long, options(language)));
    assert.ok(pages.length >= 3); for (const index of [0, 1, 2]) assert.ok(pages.map(page => page.text).join(' ').includes('FINAL-' + index));
  }
});
test('shared fabric invoices reuse the existing PDF, preserving global discounts and customer balances', async () => {
  const saved = { ...invoice, lines: invoice.lines.map(line => ({ ...line, discountType: 'amount', discountValue: 10 })) };
  for (const language of ['ar', 'fr']) {
    await i18n.changeLanguage(language);
    const pages = await inspect(await createFacturePDF(fabricInvoicePDFData(saved), {})), text = pages.map(page => page.text).join(' ');
    assert.match(text, /Coton/); assert.match(text, /100/); assert.match(text, /40/); assert.match(text, /60/); assert.doesNotMatch(text, /9999|PRIVATE|undefined|NaN/);
  }
});
