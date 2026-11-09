export const SHOP_FLOW_GARMENTS = ['djellaba', 'jabador', 'malakiya'];
export const SHOP_FLOW_STAGES = ['machine', 'finishing', 'mesbanto'];
export const isShopFlowOrigin = work => work.category === 'machine' && work.workType !== 'client' && SHOP_FLOW_GARMENTS.includes(work.garmentType);
export const shopFlowOriginId = work => work.shopFlow?.originId ? String(work.shopFlow.originId) : isShopFlowOrigin(work) ? String(work._id) : null;
export const shopWorkBarcode = work => { const id = shopFlowOriginId(work); return id ? 'SW-' + id.toUpperCase() : ''; };
export const shopFlowSlot = (originId, category) => String(originId) + ':' + category;
export function validateShopFlowSelection(input) {
  const fields = {}, shopOriginId = typeof input.shopOriginId === 'string' ? input.shopOriginId.toLowerCase() : '';
  if (!/^[a-f\d]{24}$/.test(shopOriginId)) fields.shopOriginId = 'chooseShopWork';
  if (input.workType !== 'shop' || !['finishing', 'mesbanto'].includes(input.category)) fields.shopOriginId = 'invalidShopSection';
  if (!SHOP_FLOW_GARMENTS.includes(input.garmentType)) fields.garmentType = 'invalidGarmentType';
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidWork'), { fields });
  return { shopOriginId, category: input.category, workType: 'shop', garmentType: input.garmentType };
}

// Piece numbers follow the original material order. Added pieces are appended;
// stage snapshots retain that order and the machine origin ID.
export function shopPieceBarcode(work, number) {
  const reference = shopWorkBarcode(work) || (/^SW-[A-F\d]{24}$/i.test(work.barcode || '') ? work.barcode.toUpperCase() : '');
  return reference && Number.isSafeInteger(number) && number > 0 && number <= work.quantity
    ? reference + '-' + String(number).padStart(3, '0') : '';
}
export function shopPieceNumber(work, barcode) {
  const text = typeof barcode === 'string' ? barcode.trim().toUpperCase() : '';
  const match = /^SW-[A-F\d]{24}-([0-9]+)$/.exec(text);
  if (!match) return null;
  const number = Number(match[1]);
  return shopPieceBarcode(work, number) === text ? number : null;
}
