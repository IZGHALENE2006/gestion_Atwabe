import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { transformSync } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PAYMENT_METHODS } from "../shared/paymentMethods.js";

// Compile the actual receipt JSX in memory; no browser or database is required.
const receiptUrl = new URL("../src/composent/Facture/FacturePrintachat.jsx", import.meta.url);
const source = await readFile(receiptUrl, "utf8");
const compiled = transformSync(source, { loader: "jsx", jsx: "automatic", format: "esm" }).code;
const resolved = compiled.replace(/from "([^"]+)"/g, (_, specifier) => {
  const url = specifier.startsWith(".") ? new URL(specifier, receiptUrl).href : import.meta.resolve(specifier);
  return `from ${JSON.stringify(url)}`;
});
const { default: Receipt } = await import(`data:text/javascript;base64,${Buffer.from(resolved).toString("base64")}`);
globalThis.localStorage = { getItem: () => "fr" };
const { default: i18n } = await import("../src/i18n/index.js");

function renderInvoice(overrides) {
  return renderToStaticMarkup(createElement(Receipt, {
    facture: {
      Product: [{ name: "Product A", quantite: 2, price: 50, TotalPrix: 100 }],
      TotalQauntite: 2, subtotal: 100, TotalPrix: 90, totalOrder: 90,
      discountType: "percent", discountValue: 10, discountAmount: 10,
      amountPayé: 100, PrixReture: 10, ...overrides,
    },
    user: { name: "Cashier" },
  })).replace(/<[^>]*>/g, "");
}

test("printed percentage receipt shows subtotal, discount, net total and correct cash change", async () => {
  await i18n.changeLanguage("fr");
  const text = renderInvoice();
  assert.match(text, /Sous-total avant remise: 100\.00 DH/);
  assert.match(text, /Remise \(10%\): -10\.00 DH/);
  assert.match(text, /Total: 90\.00 DH/);
  assert.match(text, /Payé: 100\.00 DH/);
  assert.match(text, /Monnaie rendue: 10\.00 DH/);
});

test("printed fixed-amount receipt identifies DH instead of percent", async () => {
  await i18n.changeLanguage("fr");
  const text = renderInvoice({ discountType: "amount" });
  assert.match(text, /Remise \(10 DH\): -10\.00 DH/);
});

test("Arabic receipts include the translated discount and subtotal", async () => {
  await i18n.changeLanguage("ar");
  const text = renderInvoice();
  assert.match(text, /المجموع قبل التخفيض: 100\.00 DH/);
  assert.match(text, /التخفيض \(10%\): -10\.00 DH/);
  assert.match(text, /الإجمالي: 90\.00 DH/);
});

test("stock invoice prints each product discount, client and net line totals", async () => {
  await i18n.changeLanguage("fr");
  const text = renderInvoice({
    clientName: "Client A",
    Product: [
      { name: "A", quantite: 2, price: 40, discountType: "percent", discountValue: 10, discountAmount: 8, TotalPrix: 72 },
      { name: "B", quantite: 1, price: 20, discountType: "amount", discountValue: 5, discountAmount: 5, TotalPrix: 15 },
    ],
    TotalPrix: 87, totalOrder: 87, discountAmount: 13, lineDiscountAmount: 13,
    discountValue: 0, orderDiscountAmount: 0, PrixReture: 13,
  });
  assert.match(text, /Client A/);
  assert.match(text, /10%\s*-8\.00 DH72\.00 DH/);
  assert.match(text, /5 DH\s*-5\.00 DH15\.00 DH/);
  assert.match(text, /Remises sur les produits: -13\.00 DH/);
  assert.match(text, /Total: 87\.00 DH/);
  assert.doesNotMatch(text, /Remise \(0%\)/);
});

test("Arabic receipt isolates mixed names and LTR money on white paper", async () => {
  await i18n.changeLanguage("ar");
  const html = renderToStaticMarkup(createElement(Receipt, {
    facture: {
      clientName: "محمد SARL 123",
      nameEmp: "أحمد",
      Product: [{ name: "زيت الزيتون 1L", quantite: 2, price: 60.25, TotalPrix: 120.50 }],
      TotalPrix: 120.50, TotalQauntite: 2, amountPayé: 150, PrixReture: 29.50,
    },
  }));
  assert.match(html, /dir="rtl" lang="ar"/);
  assert.match(html, /Amiri/);
  assert.match(html, /color:#000;background-color:#fff/);
  assert.match(html, /<bdi dir="auto">محمد SARL 123<\/bdi>/);
  assert.match(html, /<bdi>زيت الزيتون 1L<\/bdi>/);
  assert.match(html, /<bdi dir="ltr">120\.50 DH<\/bdi>/);
  assert.match(html, /<bdi dir="ltr">29\.50 DH<\/bdi>/);
});

test("printed invoices display each chosen French payment method in both languages", async () => {
  for (const language of ["fr", "ar"]) {
    await i18n.changeLanguage(language);
    for (const method of PAYMENT_METHODS) {
      const text = renderInvoice({ paymentMethod: method.value });
      assert.ok(text.includes(i18n.t("invoiceCreate.paymentMethod")));
      assert.ok(text.includes(method.label));
    }
    assert.ok(!renderInvoice().includes(i18n.t("invoiceCreate.paymentMethod")), "Do not invent a method for old invoices");
  }
});

test("printed invoices show saved HT, TVA and TTC in both languages, including zero TVA", async () => {
  for (const language of ["fr", "ar"]) {
    await i18n.changeLanguage(language);
    for (const vatRate of [0, 20]) {
      const text = renderInvoice({ totalHT: 90, vatRate, vatAmount: vatRate === 0 ? 0 : 18, TotalPrix: vatRate === 0 ? 90 : 108 });
      assert.ok(text.includes(`${i18n.t("invoiceCreate.totalHT")}: 90.00 DH`));
      assert.ok(text.includes(`TVA (${vatRate}%): ${vatRate === 0 ? "0.00" : "18.00"} DH`));
      assert.ok(text.includes(`${i18n.t("invoiceCreate.totalTTC")}: ${vatRate === 0 ? "90.00" : "108.00"} DH`));
    }
    assert.ok(!renderInvoice().includes("TVA"), "Keep legacy receipts unchanged");
  }
});

test("client print uses a business header and a totals table and respects hidden fields", async () => {
  await i18n.changeLanguage("ar");
  const facture = { _id: "PRIVATE-ID", clientName: "Hidden client", paymentMethod: "cash", TotalPrix: 120, totalHT: 100, vatRate: 20, vatAmount: 20, amountPayé: 150, PrixReture: 30, Product: [{ name: "منتج", price: 100, quantite: 1, TotalPrix: 100 }] };
  const settings = { shopName: "متجر الأطلس", address: "شارع محمد الخامس", phone: "+212 612345678", logo: "/uploads/invoice-logos/11111111-1111-4111-8111-111111111111.png", visibility: { vat: false, paid: false, change: false, reference: false, client: false, paymentMethod: false } };
  const html = renderToStaticMarkup(createElement(Receipt, { facture, settings }));
  assert.match(html, /data-invoice-business/);
  assert.match(html, /data-invoice-logo/);
  assert.match(html, /متجر الأطلس/);
  assert.match(html, /شارع محمد الخامس/);
  assert.match(html, /\+212 612345678/);
  assert.match(html, /src="http:\/\/localhost:7000\/uploads\/invoice-logos\//);
  assert.match(html, /<table class="invoice-summary"/);
  assert.match(html, /data-invoice-row="total"/);
  assert.match(html, /120\.00 DH/);
  assert.doesNotMatch(html, /data-invoice-row="(vat|paid|change)"|TVA|Hidden client|PRIVATE-ID|Espèce/);
  assert.equal(facture.TotalPrix, 120);
  assert.equal(facture.vatAmount, 20);
});

test("cashier keeps its compact receipt with discounts and change", async () => {
  const url = new URL("../src/composent/La Caisse/CashierReceipt.jsx", import.meta.url);
  const code = transformSync(await readFile(url, "utf8"), { loader: "jsx", jsx: "automatic", format: "esm" }).code;
  const moduleCode = code.replace(/from "([^"]+)"/g, (_, specifier) => `from ${JSON.stringify(specifier.startsWith(".") ? new URL(specifier, url).href : import.meta.resolve(specifier))}`);
  const { default: CashierReceipt } = await import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString("base64")}`);
  await i18n.changeLanguage("fr");
  const html = renderToStaticMarkup(createElement(CashierReceipt, { facture: {
    invoiceOrigin: "cashier", Product: [{ name: "A", price: 100, quantite: 1, TotalPrix: 100 }],
    subtotal: 100, TotalPrix: 90, discountAmount: 10, discountType: "percent", discountValue: 10, amountPayé: 100, PrixReture: 10,
  } }));
  assert.match(html, /width:320px/);
  assert.doesNotMatch(html, /invoice-paper|@page/);
  const text = html.replace(/<[^>]*>/g, "");
  assert.match(text, /Remise \(10%\): -10\.00 DH/);
  assert.match(text, /Total: 90\.00 DH/);
  assert.match(text, /Monnaie rendue: 10\.00 DH/);
});

test("reference-style print shows independent product VAT and hiding VAT removes the entire tax presentation", async () => {
  const facture = { _id: "FAC-002", totalHT: 150, vatAmount: 25, TotalPrix: 175, amountPaid: 200, PrixReture: 25, Product: [
    { code: "AR00549", name: "Cahier", quantite: 1, price: 100, TotalPrix: 100, totalHT: 100, vatRate: 20, vatAmount: 20 },
    { code: "AR01531", name: "Stylo", quantite: 1, price: 50, TotalPrix: 50, totalHT: 50, vatRate: 10, vatAmount: 5 },
  ] };
  for (const language of ["fr", "ar"]) {
    await i18n.changeLanguage(language);
    const html = renderToStaticMarkup(createElement(Receipt, { facture }));
    assert.match(html, /class="invoice-metadata"/);
    assert.match(html, /class="invoice-products"/);
    assert.match(html, /class="invoice-payment"/);
    assert.match(html, /class="invoice-tax-summary"/);
    assert.match(html, /data-invoice-vat-rate="10"/);
    assert.match(html, /data-invoice-vat-rate="20"/);
    assert.match(html, /data-invoice-cell="vat"[^>]*><bdi dir="ltr">20%/);
    assert.match(html, /data-invoice-cell="vat"[^>]*><bdi dir="ltr">10%/);
    assert.match(html, /AR00549/);
    assert.match(html, /175\.00 DH/);
    const hidden = renderToStaticMarkup(createElement(Receipt, { facture, settings: { visibility: { vat: false } } }));
    assert.doesNotMatch(hidden, /invoice-tax-summary|data-invoice-cell="vat"|data-invoice-row="vat"|TVA|20%|10%/);
    assert.match(hidden, /175\.00 DH/);
  }
});

for (const language of ["fr", "ar"]) for (const documentType of ["delivery", "return", "quote", "credit"]) {
  test(`${language} ${documentType} print keeps the document title, reference and notes with no payment summary`, async () => {
    await i18n.changeLanguage(language);
    const reference = `${{ delivery: "BL", return: "BR", quote: "DEV", credit: "AV" }[documentType]}-2026-12345678`;
    const text = renderInvoice({ _id: "internal-id", documentType, reference, documentDate: "2026-10-04", note: "Retour conforme — إرجاع سليم", paymentMethod: "bank_transfer" });
    assert.ok(text.includes(i18n.t(`salesDocuments.printTitles.${documentType}`)));
    assert.ok(text.includes(reference));
    assert.ok(text.includes("إرجاع سليم"));
    assert.ok(!text.includes("internal-id"));
    const facture = { documentType, TotalQauntite: 2, TotalPrix: 100, Product: [{ name: "Produit", quantite: 2, price: 50, TotalPrix: 100 }] };
    const html = renderToStaticMarkup(createElement(Receipt, { facture }));
    const quantity = documentType === "return" ? "-2" : "2";
    assert.match(html, new RegExp('data-invoice-cell="quantity"[^>]*><bdi dir="ltr">' + quantity + "</bdi>"));
    assert.match(html, new RegExp('data-invoice-row="quantity"[\\s\\S]*?<bdi dir="ltr">' + quantity + "</bdi>"));
    assert.equal(facture.Product[0].quantite, 2, "Rendering must not change stored return quantities");
    assert.equal(facture.TotalQauntite, 2);
    for (const key of ["invoiceLayout.paymentSummary", "receiptPrint.paid", "receiptPrint.change", "invoiceCreate.paymentMethod"]) assert.ok(!text.includes(i18n.t(key)));
  });
}
