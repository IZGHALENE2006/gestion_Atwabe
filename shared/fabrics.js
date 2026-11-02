export const FABRIC_LIMITS = { text: 120, colors: 100, pieces: 500, meters: 1000000, pricePerMeter: 1000000 };

const invalid = (fields) => Object.assign(new Error("invalidFabric"), { fields });
const normalized = (value) => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function isFabricBarcode(value) {
  if (typeof value !== "string" || !/^\d{13}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return Number(value[12]) === (10 - sum % 10) % 10;
}

export function generateFabricBarcode(used = new Set()) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(11));
    const digits = "2" + [...bytes].map((byte) => byte % 10).join("");
    const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    const barcode = digits + (10 - sum % 10) % 10;
    if (!used.has(barcode)) return barcode;
  }
  throw new Error("barcodeGenerationFailed");
}

export function validateFabric(input, { allowZeroMeters = false, requirePrice = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid({ type: "required" });
  const fields = {};
  const text = (raw, path, required = false) => {
    if (raw !== undefined && typeof raw !== "string") { fields[path] = "invalidText"; return ""; }
    const value = (raw || "").trim();
    if (required && !value) fields[path] = "required";
    else if (value.length > FABRIC_LIMITS.text || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fields[path] = "invalidText";
    return value;
  };
  const type = text(input.type, "type", true);
  const reference = text(input.reference, "reference");
  // Legacy stock remains valid without a price; never interpret an unknown price as zero.
  let salePricePerMeter;
  if (input.salePricePerMeter !== undefined) {
    const raw = input.salePricePerMeter;
    const price = (typeof raw === "number" || typeof raw === "string" ? String(raw).trim() : "")
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
      .replace(/٫/g, ".").replace(",", ".");
    salePricePerMeter = /^\d+(?:\.\d{1,2})?$/.test(price) ? Number(price) : NaN;
    if (!Number.isFinite(salePricePerMeter) || salePricePerMeter <= 0 || salePricePerMeter > FABRIC_LIMITS.pricePerMeter) fields.salePricePerMeter = "invalidPrice";
  } else if (requirePrice) fields.salePricePerMeter = "required";
  if (!Array.isArray(input.colors) || !input.colors.length || input.colors.length > FABRIC_LIMITS.colors) throw invalid({ ...fields, colors: "colorsRequired" });
  const barcodes = new Set();
  const colorKeys = new Set();
  let count = 0;
  const colors = input.colors.map((color, colorIndex) => {
    const path = `colors.${colorIndex}`;
    if (!color || typeof color !== "object" || Array.isArray(color)) { fields[path] = "invalidText"; return null; }
    const name = text(color.name, `${path}.name`, true);
    const number = text(color.number, `${path}.number`);
    const key = `${normalized(name)}\u0000${normalized(number)}`;
    if (colorKeys.has(key)) fields[`${path}.name`] = "duplicateColor";
    colorKeys.add(key);
    if (!Array.isArray(color.pieces) || !color.pieces.length || color.pieces.length > FABRIC_LIMITS.pieces) { fields[`${path}.pieces`] = "piecesRequired"; return null; }
    const pieces = color.pieces.map((piece, pieceIndex) => {
      const piecePath = `${path}.pieces.${pieceIndex}`;
      const raw = piece?.meters;
      const meters = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+(?:[.,]\d{1,3})?$/.test(raw.trim()) ? Number(raw.trim().replace(",", ".")) : NaN;
      if (!Number.isFinite(meters) || meters < 0 || (!allowZeroMeters && meters === 0) || meters > FABRIC_LIMITS.meters || Math.abs(meters * 1000 - Math.round(meters * 1000)) > 0.000001) fields[`${piecePath}.meters`] = "invalidMeters";
      const barcode = typeof piece?.barcode === "string" ? piece.barcode.trim() : "";
      if (!isFabricBarcode(barcode)) fields[`${piecePath}.barcode`] = "invalidBarcode";
      else if (barcodes.has(barcode)) fields[`${piecePath}.barcode`] = "duplicateBarcode";
      barcodes.add(barcode);
      count += 1;
      return { meters, barcode };
    });
    return { name, number, pieces };
  });
  if (count > FABRIC_LIMITS.pieces) fields.colors = "tooManyPieces";
  if (Object.keys(fields).length) throw invalid(fields);
  return { type, reference, ...(salePricePerMeter !== undefined ? { salePricePerMeter } : {}), colors };
}

export function validateFabricUpdate(input, current, { requirePrice = false } = {}) {
  const value = validateFabric(input, { allowZeroMeters: true, requirePrice });
  const fields = {};
  const colorsById = new Map(current.colors.map((color) => [String(color._id), color]));
  const pieces = current.colors.flatMap((color) => color.pieces);
  const piecesById = new Map(pieces.map((piece) => [String(piece._id), piece]));
  const piecesByBarcode = new Map(pieces.map((piece) => [piece.barcode, piece]));
  const usedColorIds = new Set();
  const usedPieceIds = new Set();
  const preserveId = (raw, stored, seen, path) => {
    if (raw !== undefined && (typeof raw !== "string" || !stored)) fields[path] = "invalidIdentity";
    if (!stored) return undefined;
    const id = String(stored._id);
    if (seen.has(id)) fields[path] = "invalidIdentity";
    seen.add(id);
    return stored._id;
  };
  value.colors = value.colors.map((color, index) => {
    const raw = input.colors[index];
    const path = `colors.${index}`;
    const stored = raw._id === undefined
      ? current.colors.find((entry) => normalized(entry.name) === normalized(color.name) && normalized(entry.number) === normalized(color.number))
      : colorsById.get(raw._id);
    const id = preserveId(raw._id, stored, usedColorIds, `${path}.name`);
    return {
      ...color, ...(id ? { _id: id } : {}),
      pieces: color.pieces.map((piece, pieceIndex) => {
        const pieceRaw = raw.pieces[pieceIndex];
        const pieceStored = pieceRaw._id === undefined ? piecesByBarcode.get(piece.barcode) : piecesById.get(pieceRaw._id);
        const pieceId = preserveId(pieceRaw._id, pieceStored, usedPieceIds, `${path}.pieces.${pieceIndex}.meters`);
        if (piece.meters === 0 && (!pieceStored || pieceStored.meters !== 0)) fields[`${path}.pieces.${pieceIndex}.meters`] = "invalidMeters";
        return { ...piece, ...(pieceId ? { _id: pieceId } : {}) };
      }),
    };
  });
  if (Object.keys(fields).length) throw invalid(fields);
  return value;
}

export function fabricTotals(colors = []) {
  const pieces = colors.flatMap((color) => color.pieces || []);
  return {
    quantity: pieces.filter((piece) => Number(String(piece.meters || "").replace(",", ".")) > 0).length,
    meters: pieces.reduce((total, piece) => {
      const meters = Number(String(piece.meters || "").replace(",", "."));
      return total + (Number.isFinite(meters) && meters > 0 ? Math.round(meters * 1000) : 0);
    }, 0) / 1000,
  };
}

export function filterFabrics(fabrics, search = "") {
  const query = normalized(search.trim());
  return fabrics.filter((fabric) => [fabric.type, fabric.reference, ...fabric.colors.flatMap((color) => [color.name, color.number, ...color.pieces.map((piece) => piece.barcode)])].some((value) => normalized(value).includes(query)));
}

export function findFabricPieces(fabrics, search = "") {
  const barcode = search.trim();
  if (!/^\d{13}$/.test(barcode)) return null;
  return fabrics.flatMap((fabric) => fabric.colors.flatMap((color) => color.pieces.flatMap((piece, index) => (
    piece.barcode === barcode ? [{ fabric, color, piece, pieceNumber: index + 1 }] : []
  ))));
}

export function calculateFabricReduction(raw, available) {
  const meters = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+(?:[.,]\d{1,3})?$/.test(raw.trim()) ? Number(raw.trim().replace(",", ".")) : NaN;
  if (!Number.isFinite(meters) || meters <= 0 || meters > FABRIC_LIMITS.meters || Math.abs(meters * 1000 - Math.round(meters * 1000)) > 0.000001) throw Object.assign(new Error("invalidReduction"), { status: 400 });
  const before = Math.round(Number(available) * 1000);
  const removed = Math.round(meters * 1000);
  if (!Number.isFinite(before) || before < 0) throw Object.assign(new Error("invalidReduction"), { status: 400 });
  if (removed > before) throw Object.assign(new Error("insufficientMeters"), { status: 409 });
  return { meters: removed / 1000, remaining: (before - removed) / 1000 };
}
