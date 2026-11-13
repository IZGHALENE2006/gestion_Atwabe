import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PAYMENT_METHODS } from "../shared/paymentMethods.js";

globalThis.localStorage = { getItem: () => "ar" };
let failFonts = false;
let fontRequests = 0;
globalThis.fetch = async (url) => {
  if (String(url).includes("/uploads/invoice-logos/")) return new Response(Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4XmMQy478D8IMMAYAPUQHZZffFX4AAAAASUVORK5CYII="), (char) => char.charCodeAt(0)));
  fontRequests++;
  if (failFonts) return new Response(null, { status: 503 });
  return new Response(await readFile(new URL(url)));
};
const { default: i18n } = await import("../src/i18n/index.js");
const { createFacturePDF } = await import("../src/composent/Facture/invoicePDF.js");
const { createFactureVentesPDF } = await import("../src/composent/Ventes/FactureVentes.js");
const { createSupplierInvoicePDF } = await import("../src/composent/Fornisseur/supplierInvoicePDF.js");

const invoice = {
  _id: "INV-2026-123", DateFacture: "2026-09-29T10:25:00",
  clientName: "محمد العلوي SARL 123",
  Product: [
    { name: "زيت الزيتون 1L", quantite: 2, price: 60.25, TotalPrix: 120.50 },
    { name: "Samsung A15 - هاتف أزرق", quantite: 1, price: 1234.5, TotalPrix: 1111.05, discountType: "percent", discountValue: 10, discountAmount: 123.45 },
  ],
  TotalQauntite: 3, subtotal: 1355, TotalPrix: 1231.55, totalOrder: 1231.55,
  discountAmount: 123.45, lineDiscountAmount: 123.45, discountValue: 0,
  orderDiscountAmount: 0, amountPaid: 1300, PrixReture: 68.45,
};

async function inspectPDF(doc) {
  const task = getDocument({ data: new Uint8Array(doc.output("arraybuffer")) });
  const pdf = await task.promise;
  const pages = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const operators = await page.getOperatorList();
      const runs = operators.argsArray.filter((_, i) => operators.fnArray[i] === OPS.showText).map(([glyphs]) => glyphs.filter((glyph) => typeof glyph === "object"));
      for (const glyph of runs.flat()) {
        // Spaces intentionally have advance width without a glyph outline.
        if (glyph.unicode.trim()) assert.equal(glyph.isInFont, true, `Missing embedded glyph: ${glyph.unicode}`);
        assert.doesNotMatch(glyph.unicode, /[\u200e\u200f\uFFFD]/, "Direction marks must not become printed glyphs");
      }
      for (const item of content.items.filter((item) => item.str.trim())) {
        assert.ok(item.transform[4] >= 30, `Text clipped on the left: ${item.str}`);
        assert.ok(item.transform[4] + item.width <= page.view[2] - 30, `Text clipped on the right: ${item.str}`);
        assert.ok(item.transform[5] >= 30, `Text clipped at the bottom: ${item.str}`);
      }
      pages.push({
        text: content.items.map((item) => item.str.normalize("NFKC")).join(" "),
        // Visual glyph order catches reversed decimals, disconnected Arabic,
        // misplaced currency and mixed scripts that text extraction can hide.
        visual: runs.map((glyphs) => glyphs.map((glyph) => glyph.unicode).join("").normalize("NFKC")),
        items: content.items,
        hasImage: operators.fnArray.includes(OPS.paintImageXObject),
      });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

function assertSummaryRow(page, label, value) {
  const labels = page.items.filter((item) => item.str.normalize("NFKC").includes(label));
  assert.ok(labels.some((item) => page.items.some((cell) => cell.str.trim() === value && Math.abs(item.transform[5] - cell.transform[5]) < 1)), `Missing table row ${label} = ${value}`);
}

test("a failed font load rejects export and can be retried", async () => {
  failFonts = true;
  await assert.rejects(createFacturePDF(invoice), /invoice font/);
  failFonts = false;
  const doc = await createFacturePDF(invoice);
  assert.ok(doc);
  assert.equal(fontRequests, 4);
});

test("Arabic invoice embeds both fonts and preserves mixed names, money and discounts", async () => {
  await i18n.changeLanguage("ar");
  const doc = await createFacturePDF(invoice);
  assert.equal(fontRequests, 4, "Reuse loaded font data on later exports");
  const raw = doc.output();
  assert.equal((raw.match(/\/FontFile2 /g) || []).length, 2);
  const [page] = await inspectPDF(doc);
  for (const text of ["فاتورة", "المنتج", "الكمية", "زيت الزيتون 1L", "محمد العلوي SARL 123", "Samsung A15"]) {
    assert.ok(page.text.includes(text), `Missing invoice text: ${text}`);
  }
  for (const run of [
    "1L نوتيزلا تيز", "Samsung A15 - قرزأ فتاه",
    "SARL 123 يولعلا دمحم", "INV-2026-123",
    "1234.50 DH", "10%", "-123.45 DH", "1111.05 DH",
    "1231.55 DH", ":يلامجلإا", "-123.45 DH", ":تاجتنملا تاضيفخت", "68.45 DH", ":يقابلا",
  ]) assert.ok(page.visual.includes(run), `Incorrect visual text: ${run}`);
  assertSummaryRow(page, "الإجمالي:", "1231.55 DH");
  assertSummaryRow(page, "تخفيضات المنتجات:", "-123.45 DH");
  assertSummaryRow(page, "الباقي:", "68.45 DH");
  const productHeader = page.items.find((item) => item.str.normalize("NFKC") === "المنتج");
  const totalHeader = page.items.find((item) => item.str.normalize("NFKC") === "الإجمالي");
  assert.ok(productHeader.transform[4] > totalHeader.transform[4], "Arabic columns read from right to left");
});

test("French invoices still render Arabic names and keep French amounts unchanged", async () => {
  await i18n.changeLanguage("fr");
  const [page] = await inspectPDF(await createFacturePDF(invoice));
  assert.ok(page.text.includes("FACTURE"));
  assertSummaryRow(page, "Total:", "1231.55 DH");
  assert.ok(page.visual.includes("1L نوتيزلا تيز"));
  assert.ok(page.visual.includes("Samsung A15 - قرزأ فتاه"));
  const productHeader = page.items.find((item) => item.str === "Description");
  const totalHeader = page.items.find((item) => item.str === "Total");
  assert.ok(productHeader.transform[4] < totalHeader.transform[4]);
});

test("long Arabic invoices wrap names, repeat headers and keep totals inside the final page", async () => {
  await i18n.changeLanguage("ar");
  const Product = Array.from({ length: 75 }, (_, index) => ({
    name: `زيت الزيتون الطبيعي الممتاز من أجود المنتجات المغربية للطبخ والاستعمال اليومي ${index + 1}`,
    quantite: 1, price: 20, TotalPrix: 20,
  }));
  const pages = await inspectPDF(await createFacturePDF({
    ...invoice, Product, TotalQauntite: 75, subtotal: 1500, totalOrder: 1500,
    TotalPrix: 1500, discountAmount: 0, lineDiscountAmount: 0, amountPaid: 1500, PrixReture: 0,
  }));
  assert.ok(pages.length >= 3);
  assert.ok(pages.slice(0, -1).every((page) => page.text.includes("المنتج") && page.text.includes("الكمية")));
  assertSummaryRow(pages.at(-1), "الإجمالي:", "1500.00 DH");
  assert.ok(pages.map((page) => page.text).join(" ").includes("75"));
});

test("Arabic sales reports support seller names, accented Latin names and decimal profit", async () => {
  await i18n.changeLanguage("ar");
  const [page] = await inspectPDF(await createFactureVentesPDF([
    { name: "زيت الزيتون 1L", nameEmp: "أحمد العلوي", price: 60.25, profite: 12.35, quantite: 2, DateVante: "2026-09-29T10:25:00.000Z" },
    { name: "Café crème", nameEmp: "سارة", price: 45, profite: 3.2, quantite: 1, DateVante: "2026-09-29T11:35:00.000Z" },
  ]));
  assert.ok(page.text.includes("تقرير المبيعات"));
  assert.ok(page.text.includes("مبلغ البيع"));
  assertSummaryRow(page, "إجمالي المبيعات", "165.50 DH");
  assertSummaryRow(page, "صافي الأرباح", "15.55 DH");
  assert.ok(page.text.includes("الكمية"));
  assert.ok(page.text.includes("أحمد العلوي"));
  assert.ok(page.text.includes("Café crème"));
  assert.ok(page.visual.includes("+ 12.35 DH"));
  assert.ok(page.visual.some((run) => run.startsWith("15.55 DH")));
});

test("empty exports do not create a blank PDF", async () => {
  assert.equal(await createFacturePDF({ Product: [] }), undefined);
  assert.equal(await createFactureVentesPDF([]), undefined);
});

test("mixed-rate PDF places the tax breakdown beside totals and keeps per-product rates and codes", async () => {
  for (const language of ["fr", "ar"]) {
    await i18n.changeLanguage(language);
    const doc = await createFacturePDF({
      _id: "FAC-2026-002", DateFacture: "2026-10-01T12:00:00Z", paymentMethod: "cash", totalHT: 150, vatAmount: 25, TotalPrix: 175, amountPaid: 200, PrixReture: 25,
      Product: [
        { code: "AR00549", name: "دفتر Cahier", quantite: 1, price: 100, TotalPrix: 100, totalHT: 100, vatRate: 20, vatAmount: 20, totalTTC: 120 },
        { code: "AR01531", name: "قلم Stylo", quantite: 1, price: 50, TotalPrix: 50, totalHT: 50, vatRate: 10, vatAmount: 5, totalTTC: 55 },
      ],
    });
    const pages = await inspectPDF(doc);
    assert.equal(pages.length, 1);
    const [page] = pages;
    for (const value of ["AR00549", "AR01531", "10%", "20%", "5.00 DH", "20.00 DH", "01/10/2026"]) assert.ok(page.visual.includes(value), value);
    assertSummaryRow(page, `${i18n.t("invoiceCreate.vat")}:`, "25.00 DH");
    const totalLabel = language === "ar" ? i18n.t("invoiceCreate.totalTTC").split(" (")[0] : `${i18n.t("invoiceCreate.totalTTC")}:`;
    assertSummaryRow(page, totalLabel, "175.00 DH");
    const base = page.items.find((item) => item.str.normalize("NFKC") === i18n.t("invoiceLayout.taxBase"));
    const total = page.items.find((item) => item.str.normalize("NFKC").includes(totalLabel));
    assert.ok(base.transform[4] < total.transform[4], "Tax breakdown stays left of totals in both languages");
  }
});

test("client PDF keeps payment methods readable with accented French text and Arabic metadata", async () => {
  for (const language of ["fr", "ar"]) {
    await i18n.changeLanguage(language);
    for (const method of PAYMENT_METHODS) {
      const [page] = await inspectPDF(await createFacturePDF({ ...invoice, paymentMethod: method.value }));
      assert.ok(page.text.includes(method.label), `Missing payment method: ${method.label}`);
      const paymentLine = page.items.find((item) => item.str.includes(method.label));
      const productHeader = page.items.find((item) => item.str.normalize("NFKC") === i18n.t("invoiceLayout.description"));
      assert.ok(paymentLine.transform[5] > productHeader.transform[5] + 12, "Payment method must stay above the products table");
    }
    const [legacy] = await inspectPDF(await createFacturePDF(invoice));
    assert.ok(!legacy.text.includes(i18n.t("invoiceCreate.paymentMethod")));
  }
});

test("supplier invoice PDF preserves Arabic supplier names and distinguishes paid from remaining", async () => {
  await i18n.changeLanguage("ar");
  const [page] = await inspectPDF(await createSupplierInvoicePDF({
    supplier: { _id: "333333333333333333333333", name: "مورد جديد" },
    invoice: {
      _id: "444444444444444444444444", supplierName: "شركة الأطلس", reference: "FR-2026-12",
      invoiceDate: "2026-09-29", total: 150, amountPaid: 60,
      items: [{ name: "زيت الزيتون 1L", quantity: 3, unitPrice: 50, total: 150 }],
    },
  }));
  assert.ok(page.text.includes("فاتورة المورد"));
  assert.ok(page.text.includes("شركة الأطلس"));
  assert.ok(page.text.includes("FR-2026-12"));
  assert.ok(page.visual.includes("1L نوتيزلا تيز"));
  assert.ok(page.visual.some((run) => run.startsWith("60.00 DH")));
  assert.ok(page.visual.some((run) => run.startsWith("90.00 DH")));
  assert.ok(page.visual.some((run) => run.startsWith("150.00 DH")));
});

test("client PDF shows HT, TVA and TTC without clipping in Arabic and French", async () => {
  for (const language of ["fr", "ar"]) {
    await i18n.changeLanguage(language);
    for (const vatRate of [0, 20]) {
      const [page] = await inspectPDF(await createFacturePDF({
        ...invoice, totalHT: 1231.55, vatRate, vatAmount: vatRate === 0 ? 0 : 246.31,
        TotalPrix: vatRate === 0 ? 1231.55 : 1477.86, amountPaid: 1500,
        PrixReture: vatRate === 0 ? 268.45 : 22.14, paymentMethod: "cheque_30_days",
      }));
      assert.ok(page.text.includes("HT"));
      assert.ok(page.text.includes("TTC"));
      assertSummaryRow(page, `TVA (${vatRate}%):`, `${vatRate === 0 ? "0.00" : "246.31"} DH`);
      assert.ok(page.visual.some((run) => run.includes(`${vatRate === 0 ? "1231.55" : "1477.86"} DH`)));
      assert.ok(page.visual.some((run) => run.includes(`${vatRate === 0 ? "268.45" : "22.14"} DH`)));
    }
  }
});

test("branded PDF places business text on the left and embeds the logo above the products", async () => {
  await i18n.changeLanguage("ar");
  const [page] = await inspectPDF(await createFacturePDF(invoice, {
    shopName: "متجر الأطلس", address: "شارع محمد الخامس، الدار البيضاء", phone: "+212 612345678",
    logo: "/uploads/invoice-logos/11111111-1111-4111-8111-111111111111.png", footer: "مرحبا بكم مجددا",
  }));
  assert.equal(page.hasImage, true);
  const name = page.items.find((item) => item.str.normalize("NFKC") === "متجر الأطلس");
  const product = page.items.find((item) => item.str.normalize("NFKC") === "المنتج");
  assert.ok(name.transform[4] < 100);
  assert.ok(name.transform[5] > product.transform[5]);
  assert.ok(page.text.includes("+212 612345678"));
  assert.ok(page.text.includes("مرحبا بكم مجددا"));
});

test("PDF visibility removes chosen rows, metadata and logo without changing the invoice total", async () => {
  for (const language of ["fr", "ar"]) {
    await i18n.changeLanguage(language);
    const [page] = await inspectPDF(await createFacturePDF({ ...invoice, totalHT: 1231.55, vatRate: 20, vatAmount: 246.31, TotalPrix: 1477.86, paymentMethod: "cash" }, {
      shopName: "Hidden shop", phone: "Hidden phone", footer: "Hidden footer",
      logo: "/uploads/invoice-logos/11111111-1111-4111-8111-111111111111.png",
      visibility: { logo: false, shopName: false, phone: false, footer: false, vat: false, totalHT: false, paid: false, change: false, discounts: false, client: false, reference: false, date: false, paymentMethod: false },
    }));
    for (const text of ["TVA", "Hidden", "INV-2026-123", "محمد العلوي", "Espèce", "246.31 DH", "1300.00 DH", "68.45 DH"]) assert.ok(!page.text.includes(text), `Hidden content printed: ${text}`);
    assert.equal(page.hasImage, false);
    assertSummaryRow(page, "TTC", "1477.86 DH");
  }
});

for (const language of ["fr", "ar"]) for (const documentType of ["delivery", "return", "quote", "credit"]) {
  test(`${language} ${documentType} PDF uses its own title and reference without payment fields`, async () => {
    await i18n.changeLanguage(language);
    const reference = `${{ delivery: "BL", return: "BR", quote: "DEV", credit: "AV" }[documentType]}-2026-12345678`;
    const doc = await createFacturePDF({ ...invoice, documentType, reference, documentDate: "2026-10-04", note: "Produits conformes — منتجات سليمة" });
    const pages = await inspectPDF(doc);
    assert.equal(pages.length, 1);
    const text = pages.map((page) => page.text).join(" ");
    assert.ok(text.includes(i18n.t(`salesDocuments.printTitles.${documentType}`)));
    assert.ok(text.includes(reference));
    assert.ok(text.includes("منتجات سليمة"));
    for (const key of ["invoiceLayout.paymentSummary", "receiptPrint.paid", "receiptPrint.change", "invoiceCreate.paymentMethod"]) {
      assert.ok(!text.includes(i18n.t(key)), `Unexpected payment text: ${key}`);
    }
    assert.ok(!text.includes("INV-2026-123"));
    for (const quantity of [1, 2, 3]) assert.ok(pages[0].visual.includes(String(documentType === "return" ? -quantity : quantity)), "Incorrect visual quantity for " + documentType + ": " + quantity);
    assert.ok(text.includes("1231.55 DH"));
  });
}

test("a long Arabic return note wraps across PDF pages without clipping", async () => {
  await i18n.changeLanguage("ar");
  const doc = await createFacturePDF({ ...invoice, documentType: "return", reference: "BR-2026-ABC123", note: "ملاحظات إرجاع المنتجات بحالة سليمة ".repeat(29) });
  const pages = await inspectPDF(doc);
  assert.ok(pages.length >= 1);
  assert.ok(pages.map((page) => page.text).join(" ").includes("ملاحظات إرجاع"));
});

test("sales PDF distinguishes revenue from profit and repeats all columns across long Arabic/French reports", async () => {
  for (const language of ["ar", "fr"]) {
    await i18n.changeLanguage(language);
    const rows = Array.from({ length: 70 }, (_, index) => ({ name: "جلابة مغربية رقم " + (index + 1), nameEmp: "خديجة", price: 20, quantite: 1, saleAmount: 20, profite: 5, DateVante: "2026-10-24T10:00:00Z" }));
    const pages = await inspectPDF(await createFactureVentesPDF(rows));
    assert.ok(pages.length > 1); assert.ok(pages.slice(0, -1).every(page => page.text.includes(i18n.t("salesRevenue.amount"))));
    assertSummaryRow(pages.at(-1), i18n.t("salesRevenue.total"), "1400.00 DH");
    assertSummaryRow(pages.at(-1), i18n.t("salesRevenue.profit"), "350.00 DH");
  }
});

test('fabric invoice PDF shows fractional meters and the unpaid balance consistently in Arabic and French', async () => {
  for (const language of ['ar', 'fr']) {
    await i18n.changeLanguage(language);
    const data = { _id: 'FI-2026-TEST', invoiceOrigin: 'fabric', DateFacture: '2026-11-11T10:00:00Z', clientName: 'فاطمة', clientPhone: '0612345678', nameEmp: 'خديجة', Product: [{ code: '2073688603298', name: 'قطن أزرق', quantite: 2, unit: 'meter', price: 30, TotalPrix: 60 }, { code: '2459081950021', name: 'حرير أخضر', quantite: 1.25, unit: 'meter', price: 45, TotalPrix: 56.25 }], TotalQauntite: 3.25, TotalPrix: 116.25, totalOrder: 116.25, amountPaid: 50, remainingAmount: 66.25, PrixReture: 0 };
    const pages = await inspectPDF(await createFacturePDF(data)); assert.equal(pages.length, 1);
    assertSummaryRow(pages[0], i18n.t('creditDocuments.remaining'), '66.25 DH');
    assertSummaryRow(pages[0], i18n.t('receiptPrint.paid'), '50.00 DH');
    assert.ok(pages[0].text.includes('1.25')); assert.ok(pages[0].text.includes('0612345678'));
    assert.ok(!pages[0].items.some(item => item.str.trim() === '0.00 DH'));
  }
});
