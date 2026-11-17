import SfifaStock from '../models/SfifaStock.js';
import { sfifaVariantIdentity, sfifaVariantMatches, sfifaReceiptMatches } from '../../shared/sfifaStock.js';

export async function findSfifaIdentity(idAdmin, identity) {
  const stocks = await SfifaStock.find({ idAdmin }).lean();
  for (const stock of stocks) {
    const variant = stock.variants?.find(row => sfifaVariantMatches(stock, row, identity));
    if (variant) return { stock, variant };
  }
  return null;
}

// Bind old code-based history before renaming. Receipt amounts and dates stay intact.
export function bindSfifaVariant(stock, variant) {
  const identity = sfifaVariantIdentity(stock, variant);
  for (const receipt of stock.receipts || []) if (!receipt.variantId && sfifaReceiptMatches(stock, receipt, variant)) {
    receipt.variantId = variant._id; receipt.width = identity.width; receipt.family = identity.family;
  }
  for (const work of stock.production || []) if (!work.sfifa?.variantId && work.workType !== 'client' && work.sfifa?.width === identity.width && work.sfifa?.family === identity.family && work.sfifa?.code === identity.code) work.sfifa.variantId = variant._id;
}

export async function currentSfifaViews(idAdmin, values, kind = 'order') {
  const linked = value => kind === 'order' ? value.items?.some(row => row.sfifa?.stock) : value.materials?.length || value.materialOperations?.length || value.shopFlow?.materials?.length || value.tailoring?.items?.some(row => row.sfifa?.stock);
  if (!values.some(linked)) return values;
  const stocks = await SfifaStock.find({ idAdmin }).lean();
  const lookup = new Map(stocks.flatMap(stock => (stock.variants || []).map(variant => [String(stock._id) + ':' + String(variant._id), sfifaVariantIdentity(stock, variant)])));
  const itemView = row => {
    const selection = row.sfifa?.stock, identity = selection && lookup.get(String(selection.stockId) + ':' + String(selection.variantId));
    return identity ? { ...row, sfifa: { ...row.sfifa, width: identity.width, stock: { ...selection, family: identity.family, code: identity.code } } } : row;
  };
  const materialView = row => { const identity = lookup.get(String(row.sfifaId) + ':' + String(row.variantId)); return identity ? { ...row, sfifaWidth: identity.width, sfifaFamily: identity.family, sfifaCode: identity.code } : row; };
  return values.map(value => kind === 'order' ? { ...value, ...(value.items ? { items: value.items.map(itemView) } : {}) } : {
    ...value,
    ...(value.materials ? { materials: value.materials.map(materialView) } : {}),
    ...(value.materialOperations ? { materialOperations: value.materialOperations.map(operation => ({ ...operation, rows: operation.rows.map(materialView) })) } : {}),
    ...(value.shopFlow?.materials ? { shopFlow: { ...value.shopFlow, materials: value.shopFlow.materials.map(materialView) } } : {}),
    ...(value.tailoring?.items ? { tailoring: { ...value.tailoring, items: value.tailoring.items.map(itemView) } } : {}),
  });
}
