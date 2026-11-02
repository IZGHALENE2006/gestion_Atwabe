export const CLIENT_TYPES = ["person", "company"];
export const CLIENT_FIELD_LIMITS = { name: 160, address: 500, phone: 40, fax: 40, cin: 40, website: 300 };
export const CLIENT_REQUIRED_FIELDS = ["name", "address", "phone"];

export function normalizeClientWebsite(value) {
  if (!value) return "";
  if (/\s/.test(value)) throw new Error("invalidWebsite");
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  const url = new URL(hasScheme ? value : `https://${value}`);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".") || url.hostname.startsWith(".") || url.hostname.endsWith(".")) throw new Error("invalidWebsite");
  if (url.href.length > CLIENT_FIELD_LIMITS.website) throw new Error("invalidWebsite");
  return url.href;
}

export function validateClient(input) {
  const fields = {};
  const value = { type: input?.type };
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("invalidClient"), { fields: { name: "required" } });
  if (!CLIENT_TYPES.includes(value.type)) fields.type = "invalidType";
  for (const [key, limit] of Object.entries(CLIENT_FIELD_LIMITS)) {
    if (input[key] !== undefined && typeof input[key] !== "string") { fields[key] = "invalidText"; continue; }
    value[key] = (input[key] || "").trim();
    if (CLIENT_REQUIRED_FIELDS.includes(key) && !value[key]) fields[key] = "required";
    else if (value[key].length > limit) fields[key] = "tooLong";
    else if ([...value[key]].some((char) => {
      const code = char.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })) fields[key] = "invalidText";
  }
  for (const key of ["phone", "fax"]) {
    if (!fields[key] && value[key] && (!/^[+\d\s()./-]+$/.test(value[key]) || !/^\d{6,20}$/.test(value[key].replace(/\D/g, "")))) fields[key] = "invalidPhone";
  }
  if (!fields.website && value.website) {
    try { value.website = normalizeClientWebsite(value.website); } catch { fields.website = "invalidWebsite"; }
  }
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidClient"), { fields });
  value.cin = value.cin.toUpperCase();
  return value;
}

const searchText = (value) => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function filterClients(clients, search = "", type = "all") {
  const query = searchText(search.trim());
  const digits = query.replace(/[\s()+./-]/g, "");
  return clients.filter((client) => (type === "all" || client.type === type) && (
    Object.keys(CLIENT_FIELD_LIMITS).some((key) => searchText(client[key]).includes(query)) ||
    (/^\d+$/.test(digits) && [client.phone, client.fax].some((phone) => String(phone || "").replace(/\D/g, "").includes(digits)))
  ));
}
