import test from "node:test";
import assert from "node:assert/strict";
import { apiErrorMessage } from "../src/i18n/apiErrors.js";

globalThis.localStorage = { getItem: () => "ar" };
const { default: i18n } = await import("../src/i18n/index.js");

function entries(resource, prefix = "") {
  return Object.entries(resource).flatMap(([key, value]) => typeof value === "object"
    ? entries(value, `${prefix}${key}.`)
    : [[`${prefix}${key}`, value]]);
}

test("Arabic translations cover every French key without corrupted characters", () => {
  const french = new Map(entries(i18n.getResourceBundle("fr", "translation")));
  const arabic = new Map(entries(i18n.getResourceBundle("ar", "translation")));
  assert.deepEqual([...arabic.keys()].sort(), [...french.keys()].sort());
  for (const [key, value] of arabic) {
    assert.doesNotMatch(value, /[\u00C2\u00C3\u00D8\u00D9\uFFFD\u0080-\u009F]|\?{2,}/, key);
    const variables = (text) => [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(variables(value), variables(french.get(key)), `Interpolation: ${key}`);
  }
  for (const [key, value] of french) {
    assert.doesNotMatch(value, /[\u00C2\u00C3\uFFFD\u0080-\u009F]|\?{2,}/, key);
  }
});

test("saved Arabic language renders readable menu and cashier labels", () => {
  assert.equal(i18n.language, "ar");
  assert.equal(i18n.dir(), "rtl");
  assert.equal(i18n.t("common.arabic"), "العربية");
  assert.equal(i18n.t("nav.products"), "المنتجات");
  assert.equal(i18n.t("nav.cashier"), "الصندوق");
  assert.equal(i18n.t("cashier.totalReceived"), "المبلغ المستلم");
  assert.equal(i18n.t("invoiceCreate.title"), "إضافة فاتورة");
  assert.match(i18n.t("cashier.insufficientAmount", { missing: "15.50" }), /15\.50/);
});

test("switching between French and Arabic updates text and direction", async () => {
  await i18n.changeLanguage("fr");
  assert.equal(i18n.dir(), "ltr");
  assert.equal(i18n.t("nav.cashier"), "Caisse");
  await i18n.changeLanguage("ar");
  assert.equal(i18n.dir(), "rtl");
  assert.equal(i18n.t("nav.cashier"), "الصندوق");
});

test("legacy English and missing preferences open in French while Arabic is preserved", async () => {
  for (const saved of ["en", null, "fr", "ar"]) {
    const writes = [];
    globalThis.localStorage = {
      getItem: () => saved,
      setItem: (key, value) => writes.push([key, value]),
    };
    const { default: instance } = await import(`../src/i18n/index.js?saved=${saved}`);
    const expected = saved === "ar" ? "ar" : "fr";
    assert.equal(instance.language, expected);
    assert.equal(instance.hasResourceBundle("en", "translation"), false);
    assert.deepEqual(writes, saved === expected ? [] : [["lang", expected]]);
    assert.equal(instance.t("common.french"), "Français");
  }
});

test("server errors are translated without exposing English fallback messages", async () => {
  await i18n.changeLanguage("fr");
  const t = i18n.t.bind(i18n);
  assert.equal(apiErrorMessage("Password incorrect", t), "Adresse e-mail ou mot de passe incorrect.");
  assert.equal(apiErrorMessage("Insufficient stock: Thé", t), "Stock insuffisant pour Thé. Actualisez les produits.");
  assert.match(apiErrorMessage("Payment exceeds remaining amount (25 DH)", t), /reste à payer \(25 DH\)/);
  assert.equal(apiErrorMessage(new Error("Network Error"), t), "Une erreur est survenue. Veuillez réessayer.");
  await i18n.changeLanguage("ar");
  assert.equal(apiErrorMessage("Password incorrect", t), t("errors.invalidCredentials"));
});
