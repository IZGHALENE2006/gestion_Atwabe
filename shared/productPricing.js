export function normalizeWholesalePrice(value) {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new Error('invalidWholesalePrice');
  }
  return Number(value);
}

export function hasWholesalePrice(product) {
  const value = product?.prix_gros;
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function getProductSalePrice(product, priceType = 'retail') {
  if (!['retail', 'wholesale'].includes(priceType)) throw new Error('invalidPriceType');
  if (priceType === 'wholesale' && !hasWholesalePrice(product)) throw new Error('wholesaleUnavailable');
  const value = priceType === 'wholesale' ? product.prix_gros : product.prix_vente;
  const price = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(price) || price < 0) throw new Error('invalidPrice');
  return price;
}
