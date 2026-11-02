import { roundMoney } from './saleTotals.js';
import { hasWholesalePrice, normalizeWholesalePrice } from './productPricing.js';

function nonNegativeNumber(value, errorCode) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new Error(errorCode);
  }
  return Number(value);
}

export function calculateProductFees({ retailPrice, wholesalePrice, totalFees = 0, quantity }) {
  const fees = totalFees === '' || totalFees === null ? 0 : roundMoney(nonNegativeNumber(totalFees, 'invalidFees'));
  const count = fees > 0 ? nonNegativeNumber(quantity, 'invalidFeeQuantity') : 0;
  if (fees > 0 && (!Number.isInteger(count) || count <= 0)) throw new Error('invalidFeeQuantity');
  const perUnit = fees > 0 ? roundMoney(fees / count) : 0;
  const retail = nonNegativeNumber(retailPrice, 'invalidPrice');
  const wholesale = normalizeWholesalePrice(wholesalePrice);
  const finalRetail = roundMoney(retail + perUnit);
  const finalWholesale = wholesale == null ? null : roundMoney(wholesale + perUnit);
  if (!Number.isFinite(finalRetail) || (finalWholesale !== null && !Number.isFinite(finalWholesale))) throw new Error('invalidPrice');
  return { frais_total: fees, frais_quantite: count, frais_unitaire: perUnit, prix_vente: finalRetail, prix_gros: finalWholesale };
}

export function getProductBasePrices(product) {
  const fee = Number(product?.frais_unitaire || 0);
  return {
    prix_vente: roundMoney(Number(product?.prix_vente || 0) - fee),
    prix_gros: hasWholesalePrice(product) ? roundMoney(Number(product.prix_gros) - fee) : '',
  };
}

// Price fields used by existing clients remain final prices when editing.
// New forms send explicit base prices so saving repeatedly never adds fees twice.
export function resolveProductFees(data, currentProduct) {
  const currentFee = Number(currentProduct?.frais_unitaire || 0);
  const currentBase = getProductBasePrices(currentProduct);
  const retail = data.prix_vente_base !== undefined ? data.prix_vente_base
    : data.prix_vente !== undefined ? nonNegativeNumber(data.prix_vente, 'invalidPrice') - currentFee : currentBase.prix_vente;
  let wholesale = currentBase.prix_gros;
  if (data.prix_gros_base !== undefined) wholesale = data.prix_gros_base;
  else if (data.prix_gros !== undefined) {
    const price = normalizeWholesalePrice(data.prix_gros);
    wholesale = price === null ? null : price - currentFee;
  }
  return calculateProductFees({
    retailPrice: retail,
    wholesalePrice: wholesale,
    totalFees: data.frais_total !== undefined ? data.frais_total : currentProduct?.frais_total ?? 0,
    quantity: data.frais_quantite !== undefined ? data.frais_quantite
      : currentProduct?.frais_quantite > 0 ? currentProduct.frais_quantite : data.quantite ?? currentProduct?.quantite,
  });
}
