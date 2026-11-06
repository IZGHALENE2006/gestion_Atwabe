export const TAILORING_MEASUREMENT_FIELDS = [
  "shoulder", "sleeve", "chest", "length", "sleevePlacement", "sleeveHead", "jlail", "collar",
];

// All measurements are in centimetres, with at most two decimal places.
export function tailoringMeasurement(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim()
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, ".").replace(",", ".");
  const number = /^\d+(?:\.\d{1,2})?$/.test(text) ? Number(text) : NaN;
  return Number.isFinite(number) && number > 0 && number <= 1000 ? number : null;
}

export function validateTailoringMeasurements(input) {
  if (input === undefined) return undefined;
  let raw = input;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const invalid = fields => Object.assign(new Error("invalidOrder"), { fields });
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => !TAILORING_MEASUREMENT_FIELDS.includes(key))) {
    throw invalid({ measurements: "invalidMeasurements" });
  }
  const measurements = {}, fields = {};
  for (const key of TAILORING_MEASUREMENT_FIELDS) {
    const value = raw[key];
    if (value === undefined || typeof value === "string" && !value.trim()) continue;
    const number = tailoringMeasurement(value);
    if (number === null) fields["measurements." + key] = "invalidMeasurement";
    else measurements[key] = number;
  }
  if (Object.keys(fields).length) throw invalid(fields);
  // Omit empty measurements so old order fingerprints and retries remain stable.
  return Object.keys(measurements).length ? measurements : undefined;
}
