import { validateWorkerWorkEdit } from '../../../shared/workerWorkEditing.js';
import { usesWorkerMaterials } from '../../../shared/workerMaterials.js';

export function workerWorkEditSubmission(data, work, t) {
  const materials = usesWorkerMaterials(work.category, work.workType, work.garmentType) && !work.shopDjellaba;
  const raw = { productName: materials ? t('fesla.garmentTypes.' + work.garmentType) : data.productName, quantity: materials ? data.lineIds.length : data.quantity, unitWage: data.unitWage,
    ...(materials ? { materials: data.lineIds.map(lineId => ({ lineId, ...data.materials[lineId] })) } : {}),
    ...(work.shopDjellaba ? { shopDjellaba: data.shopDjellaba } : {}), ...(work.shopTrouser ? { shopTrouser: data.shopTrouser, trouserType: data.trouserType } : {}),
    ...(work.category === 'sfifa' ? { sfifa: { width: data.width, family: data.family, code: data.code }, ...(data.linkOrder ? { linkOrder: true, orderId: data.orderId, lineIds: data.lineIds } : {}) } : {}) };
  const input = validateWorkerWorkEdit({ ...raw, unitWage: raw.unitWage === '' ? 0 : raw.unitWage, ...(raw.shopDjellaba ? { shopDjellaba: { ...raw.shopDjellaba, unitWage: raw.shopDjellaba.unitWage === '' ? 0 : raw.shopDjellaba.unitWage } } : {}), ...(materials ? { unitWage: undefined, materials: raw.materials.map(row => ({ ...row, unitWage: row.unitWage === '' ? 0 : row.unitWage })) } : {}) }, work);
  if (raw.unitWage === '' && input.unitWage !== undefined) input.unitWage = '';
  if (raw.shopDjellaba?.unitWage === '') input.shopDjellaba.unitWage = '';
  if (materials) for (const row of input.materials) if (raw.materials.find(value => value.lineId === row.lineId).unitWage === '') row.unitWage = '';
  return input;
}

export function workerWorkEditData(work) {
  if (!work) return {};
  const rows = work.materials || [];
  return { ...(work.shopTrouser ? { trouserType: work.trouserType, shopTrouser: { ...work.shopTrouser, colorIds: (work.shopTrouser.colors || []).map(color => color.colorId) } } : {}), productName: work.productName, quantity: String(work.quantity), unitWage: work.unitWage === undefined ? '' : String(work.unitWage), orderId: work.tailoring?.orderId || '', lineIds: work.tailoring?.lineIds || rows.map(row => row.lineId), linkOrder: Boolean(work.tailoring), width: work.sfifa?.width || 'thin', family: work.sfifa?.family || '01-30', code: work.sfifa?.code === undefined ? '' : String(work.sfifa.code), materials: Object.fromEntries(rows.map(row => [row.lineId, { ...row, unitWage: row.unitWage === undefined ? '' : String(row.unitWage) }])), ...(work.shopDjellaba ? { shopDjellaba: { ...work.shopDjellaba, unitWage: work.shopDjellaba.unitWage === undefined ? '' : String(work.shopDjellaba.unitWage) } } : {}) };
}
export function creditWorkerMaterialOptions(data, rows = []) {
  return { ...data, fabrics: data.fabrics.map(fabric => ({ ...fabric, colors: fabric.colors.map(color => ({ ...color, pieces: color.pieces.map(piece => ({ ...piece, meters: piece.meters + rows.filter(row => row.fabricStockDeducted !== false && String(row.fabricId) === fabric._id && String(row.colorId) === color._id && String(row.pieceId) === piece._id).reduce((n, row) => n + row.meters, 0) })) })) })), sfifa: data.sfifa.map(sfifa => {
    const reserved = rows.filter(row => String(row.sfifaId) === sfifa.parentId && String(row.variantId) === sfifa._id);
    const styles = [...new Set([...(sfifa.styles || []), ...reserved.map(row => row.sfifaStyle).filter(Boolean)])];
    return { ...sfifa, quantity: sfifa.quantity + reserved.reduce((n, row) => n + row.sfifaMeters, 0), ...(styles.length ? { styles } : {}) };
  }) };
}
