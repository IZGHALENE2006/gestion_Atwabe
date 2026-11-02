export const INVOICE_TEXT_FIELDS = { shopName: 160, address: 400, phone: 60, email: 160, footer: 300 };
export const INVOICE_VISIBILITY_GROUPS = {
  business: ["logo", "shopName", "address", "phone", "email"],
  details: ["reference", "date", "seller", "client", "paymentMethod"],
  summary: ["quantity", "subtotal", "discounts", "totalHT", "vat", "paid", "change", "footer"],
};
export const INVOICE_VISIBILITY_KEYS = Object.values(INVOICE_VISIBILITY_GROUPS).flat();

export function normalizeInvoiceSettings(value = {}) {
  return {
    ...Object.fromEntries(Object.keys(INVOICE_TEXT_FIELDS).map((key) => [key, typeof value[key] === "string" ? value[key] : ""])),
    logo: typeof value.logo === "string" ? value.logo : "",
    visibility: Object.fromEntries(INVOICE_VISIBILITY_KEYS.map((key) => [key, value.visibility?.[key] !== false])),
  };
}

export function validateInvoiceSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalidSettings");
  for (const [key, max] of Object.entries(INVOICE_TEXT_FIELDS)) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || input[key].trim().length > max)) throw new Error("invalidSettings");
  }
  if (!input.visibility || typeof input.visibility !== "object" || Array.isArray(input.visibility)) throw new Error("invalidSettings");
  for (const key of INVOICE_VISIBILITY_KEYS) {
    if (input.visibility[key] !== undefined && typeof input.visibility[key] !== "boolean") throw new Error("invalidSettings");
  }
  const settings = normalizeInvoiceSettings(input);
  for (const key of Object.keys(INVOICE_TEXT_FIELDS)) settings[key] = settings[key].trim();
  delete settings.logo; // A logo must come from the validated upload, never a supplied URL.
  return settings;
}
