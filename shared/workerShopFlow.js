export const SHOP_FLOW_GARMENTS = ['djellaba', 'jabador', 'malakiya'];
export const SHOP_FLOW_STAGES = ['machine', 'finishing', 'mesbanto'];
export const isShopFlowOrigin = work => work.category === 'machine' && work.workType !== 'client' && SHOP_FLOW_GARMENTS.includes(work.garmentType);
export const shopFlowOriginId = work => work.shopFlow?.originId ? String(work.shopFlow.originId) : isShopFlowOrigin(work) ? String(work._id) : null;
export const shopWorkBarcode = work => { const id = shopFlowOriginId(work); return id ? 'SW-' + id.toUpperCase() : ''; };
export const shopFlowSlot = (originId, category) => String(originId) + ':' + category;
export const shopFlowPieceSlot = (originId, category, lineId) => shopFlowSlot(originId, category) + ':' + lineId;
export const shopPieceNumbers = work => work.shopFlow?.pieceNumbers || Array.from({ length: work.quantity }, (_, index) => index + 1);
export function validateShopFlowSelection(input) {
  const fields = {}, shopOriginId = typeof input.shopOriginId === 'string' ? input.shopOriginId.toLowerCase() : '';
  if (!/^[a-f\d]{24}$/.test(shopOriginId)) fields.shopOriginId = 'chooseShopWork';
  if (input.workType !== 'shop' || !['finishing', 'mesbanto'].includes(input.category)) fields.shopOriginId = 'invalidShopSection';
  if (!SHOP_FLOW_GARMENTS.includes(input.garmentType)) fields.garmentType = 'invalidGarmentType';
  const lineIds = input.lineIds === undefined ? undefined : Array.isArray(input.lineIds) ? input.lineIds.map(id => typeof id === 'string' ? id.toLowerCase() : '') : [];
  if (lineIds !== undefined && (!lineIds.length || lineIds.length > 100 || new Set(lineIds).size !== lineIds.length || lineIds.some(id => !/^[a-f\d]{24}$/.test(id)))) fields.lineIds = 'chooseShopPieces';
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidWork'), { fields });
  return { shopOriginId, category: input.category, workType: 'shop', garmentType: input.garmentType, ...(lineIds ? { lineIds: lineIds.sort() } : {}) };
}

// Piece numbers follow the original material order. Added pieces are appended;
// stage snapshots retain that order and the machine origin ID.
export function shopPieceBarcode(work, number) {
  const reference = shopWorkBarcode(work) || (/^SW-[A-F\d]{24}$/i.test(work.barcode || '') ? work.barcode.toUpperCase() : '');
  return reference && Number.isSafeInteger(number) && number > 0 && (work.shopFlow?.pieceNumbers ? work.shopFlow.pieceNumbers.includes(number) : number <= work.quantity)
    ? reference + '-' + String(number).padStart(3, '0') : '';
}
export function shopPieceNumber(work, barcode) {
  const text = typeof barcode === 'string' ? barcode.trim().toUpperCase() : '';
  const match = /^SW-[A-F\d]{24}-([0-9]+)$/.exec(text);
  if (!match) return null;
  const number = Number(match[1]);
  return shopPieceBarcode(work, number) === text ? number : null;
}
