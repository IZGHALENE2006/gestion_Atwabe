import { FABRIC_LIMITS, calculateFabricReduction, isFabricBarcode } from './fabrics.js';

const fail = message => Object.assign(new Error(message), { status: 400 });
export function validateFabricReductionLines(input) {
  if (!Array.isArray(input) || !input.length || input.length > FABRIC_LIMITS.pieces) throw fail('invalidReduction');
  const seen = new Set();
  return input.map(row => {
    const colorId = typeof row?.colorId === 'string' ? row.colorId.toLowerCase() : '';
    const pieceId = typeof row?.pieceId === 'string' ? row.pieceId.toLowerCase() : '';
    if (!/^[a-f\d]{24}$/.test(colorId) || !/^[a-f\d]{24}$/.test(pieceId) || !isFabricBarcode(row?.barcode) || seen.has(pieceId)) throw fail('invalidReduction');
    seen.add(pieceId);
    return { colorId, pieceId, barcode: row.barcode, meters: calculateFabricReduction(row.meters, FABRIC_LIMITS.meters).meters };
  }).sort((a, b) => a.pieceId.localeCompare(b.pieceId));
}

export function prepareFabricReductionLines(fabric, amounts) {
  const pieces = new Map((fabric?.colors || []).flatMap(color => color.pieces.map(piece => [String(piece._id), { color, piece }])));
  const lines = [], errors = {};
  let units = 0;
  for (const [pieceId, raw] of Object.entries(amounts)) {
    const text = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
    if (!text || /^0+(?:[.,]0{1,3})?$/.test(text)) continue;
    const entry = pieces.get(pieceId);
    if (!entry) { errors[pieceId] = 'notFound'; continue; }
    try {
      const reduction = calculateFabricReduction(raw, entry.piece.meters);
      lines.push({ colorId: String(entry.color._id), pieceId, barcode: entry.piece.barcode, meters: reduction.meters }); units += Math.round(reduction.meters * 1000);
    } catch (error) { errors[pieceId] = error.message; }
  }
  return { lines: lines.sort((a, b) => a.pieceId.localeCompare(b.pieceId)), errors, meters: units / 1000 };
}
