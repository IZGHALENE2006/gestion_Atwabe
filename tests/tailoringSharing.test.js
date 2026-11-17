import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { tailoringOrderReceipt, tailoringPaymentReceipt } from '../shared/tailoringReceipts.js';
import { tailoringReadyMessage, tailoringReceiptFilename, tailoringReceiptMessage } from '../shared/tailoringSharing.js';
import { canEmployeeOperation, validateEmployeePermissions } from '../shared/employeeOperations.js';
import { creditWhatsAppUrl } from '../shared/creditSharing.js';

globalThis.localStorage = { getItem: () => 'ar' };
let failFonts = false;
globalThis.fetch = async url => failFonts ? new Response(null, { status: 503 }) : new Response(await readFile(new URL(url)));
const { default: i18n } = await import('../src/i18n/index.js');
const { createTailoringReceiptPDF } = await import('../src/composent/Fesla/tailoringReceiptPDF.js');
const options = language => ({ t: i18n.getFixedT(language), rtl: language === 'ar', locale: language === 'ar' ? 'ar-MA' : 'fr-MA' });
const order = {
  _id: '123456789012345678901234', garmentType: 'djellaba', clientName: 'أمينة العميلة SARL', phone: '0612345678', orderDate: '2026-11-02', readyDate: '2026-11-10',
  totalPrice: 800, paidAmount: 100, createdAt: '2026-11-02T12:00:00Z', photo: 'PRIVATE-PHOTO', profitAmount: 9999, expenseAmount: 1234,
  items: [{ lineId: 'a', price: 500, fabricSource: 'client', fabricType: 'قطن ممتاز Premium', fabricColor: 'أزرق', fabricMeters: 2.5, sfifa: { width: 'thin', style: 'twoTone', color1: '01', color2: '30' }, costs: { total: 9999 }, photo: 'PRIVATE-PHOTO', fabricId: 'PRIVATE-STOCK' }, { lineId: 'b', price: 300, fabricSource: 'shop', fabricType: 'كتان', fabricColor: 'أبيض', sfifa: { width: 'thick', style: 'fabric' } }],
};

async function inspect(doc) {
  const task = getDocument({ data: new Uint8Array(doc.output('arraybuffer')) }), pdf = await task.promise, pages = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number), content = await page.getTextContent(), operators = await page.getOperatorList();
      const glyphs = operators.argsArray.filter((_, i) => operators.fnArray[i] === OPS.showText).flatMap(([runs]) => runs.filter(run => typeof run === 'object'));
      for (const glyph of glyphs) if (glyph.unicode.trim()) { assert.equal(glyph.isInFont, true, 'Missing glyph: ' + glyph.unicode); assert.doesNotMatch(glyph.unicode, /[\u200e\u200f\uFFFD]/); }
      for (const item of content.items.filter(item => item.str.trim())) {
        assert.ok(item.transform[4] >= 25, 'Left clipping: ' + item.str);
        assert.ok(item.transform[4] + item.width <= page.view[2] - 25, 'Right clipping: ' + item.str);
        assert.ok(item.transform[5] >= 12, 'Bottom clipping: ' + item.str);
      }
      pages.push({ text: content.items.map(item => item.str.normalize('NFKC')).join(' '), items: content.items, hasImage: operators.fnArray.includes(OPS.paintImageXObject) });
    }
    return pages;
  } finally { await task.destroy(); }
}
const summary = (pages, label, amount) => assert.ok(pages.some(page => page.items.some(item => item.str.normalize('NFKC').includes(label) && page.items.some(value => value.str.includes(amount) && Math.abs(item.transform[5] - value.transform[5]) < 2))), label + ' = ' + amount);

test('tailoring sharing has an independent employee grant without permitting printing or payments', () => {
  const permission = validateEmployeePermissions({ moduleAccess: ['tailoring'], operationPermissions: { tailoring: ['share', 'details'] } });
  assert.equal(canEmployeeOperation('Employe', permission, 'tailoring', 'share'), true);
  for (const op of ['print', 'payment', 'deliver', 'profits']) assert.equal(canEmployeeOperation('Employe', permission, 'tailoring', op), false);
  assert.equal(canEmployeeOperation('Employe', { ...permission, moduleAccess: [] }, 'tailoring', 'share'), false);
  assert.equal(canEmployeeOperation('Employe', { moduleAccess: ['tailoring'], operationPermissions: { tailoring: ['print'] } }, 'tailoring', 'share'), false);
  assert.equal(canEmployeeOperation('admin', null, 'tailoring', 'share'), true);
});

test('each receipt share uses its immutable original or payment snapshot after later edits and payments', () => {
  const original = tailoringOrderReceipt(order);
  const historicalPayment = { ...original, kind: 'payment', reference: original.orderBarcode + '-P001', historical: true, paymentAmount: 50.25, paidAmount: 150.25, remainingAmount: 649.75 };
  const changed = { ...order, totalPrice: 1200, paidAmount: 900, customerReceipt: original };
  const receipt = tailoringPaymentReceipt(changed, { amount: 50.25, document: historicalPayment });
  assert.deepEqual([receipt.paymentAmount, receipt.paidAmount, receipt.remainingAmount], [50.25, 150.25, 649.75]);
  const text = tailoringReceiptMessage(receipt, options('fr'));
  assert.match(text, /50,25/); assert.match(text, /150,25/); assert.match(text, /649,75/); assert.doesNotMatch(text, /900,00|1.200,00|PRIVATE|9999|1234,00/);
  assert.match(tailoringReceiptMessage(tailoringOrderReceipt(changed), options('fr')), /800,00/);
  const url = new URL(creditWhatsAppUrl(order.phone, text)); assert.equal(url.pathname, '/212612345678'); assert.equal(url.searchParams.get('text'), text);
  assert.doesNotMatch(tailoringReceiptFilename('../../unsafe?\nref'), /\.\.\/|\n|\?/);
});

test('readiness messages address every garment section and do not mutate orders or declare delivery', () => {
  for (const language of ['ar', 'fr']) for (const garmentType of ['djellaba', 'jabador', 'malakiya', 'trousers', 'shirts']) {
    const input = { ...order, garmentType }, before = structuredClone(input), o = options(language);
    const ready = tailoringReadyMessage(input, 'ready', o), almost = tailoringReadyMessage(input, 'almost', o);
    assert.ok(ready.includes(order.clientName)); assert.ok(ready.includes(o.t('fesla.garmentTypes.' + garmentType))); assert.ok(ready.includes('FS-123456789012345678901234'));
    assert.notEqual(ready, almost); assert.doesNotMatch(ready + almost, /PRIVATE|9999|1234,00/); assert.deepEqual(input, before);
  }
});

test('receipt PDF font failure is retryable', async () => {
  failFonts = true; await assert.rejects(createTailoringReceiptPDF(tailoringOrderReceipt(order), {}, options('ar')), /invoice font/); failFonts = false;
  assert.ok(await createTailoringReceiptPDF(tailoringOrderReceipt(order), {}, options('ar')));
});

for (const language of ['ar', 'fr']) test(language + ' order and historical payment PDFs preserve the customer amounts and exclude photos and private fields', async () => {
  const o = options(language), original = { ...tailoringOrderReceipt(order), historical: true };
  const settings = { shopName: 'محل الخياطة Atelier', address: 'الدار البيضاء Casablanca', phone: '0522123456', footer: 'شكرًا لثقتكم - Merci' };
  const pages = await inspect(await createTailoringReceiptPDF({ ...original, profitAmount: 9999, photo: 'PRIVATE-PHOTO', items: original.items.map(item => ({ ...item, costs: 'PRIVATE-COST', fabricId: 'PRIVATE-ID' })) }, settings, o));
  const text = pages.map(page => page.text).join(' '); assert.match(text, /Premium/); assert.doesNotMatch(text, /PRIVATE|9999|1234,00/); assert.ok(pages.every(page => !page.hasImage));
  summary(pages, o.t('fesla.totalPrice'), '800'); summary(pages, o.t('fesla.paidAmount'), '100'); summary(pages, o.t('fesla.remainingAmount'), '700');
  const receipt = { ...original, kind: 'payment', reference: original.orderBarcode + '-P001', paymentAmount: 50.25, paidAmount: 150.25, remainingAmount: 649.75 };
  const payment = await inspect(await createTailoringReceiptPDF(receipt, settings, o));
  summary(payment, o.t('fesla.receipts.received'), '50'); summary(payment, o.t('fesla.receipts.paidAfter'), '150'); summary(payment, o.t('fesla.receipts.remainingAfter'), '649');
  assert.doesNotMatch(payment.map(page => page.text).join(' '), /Premium/);
});

test('long multi-piece Arabic and French PDF receipts repeat headers across pages without clipping', async () => {
  for (const language of ['ar', 'fr']) {
    const receipt = tailoringOrderReceipt({ ...order, items: Array.from({ length: 45 }, (_, i) => ({ ...order.items[0], lineId: String(i), fabricType: 'قماش كتان ممتاز بألوان متعددة Tissu de qualité supérieure ' + i })) });
    const pages = await inspect(await createTailoringReceiptPDF(receipt, {}, options(language)));
    assert.ok(pages.length >= 3); assert.equal(pages.map(page => page.text).join(' ').match(/supérieure/g).length, 45);
  }
});
