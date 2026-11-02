import { useTranslation } from 'react-i18next';
import { stockPriceRange } from '../../../shared/productBatches.js';
export default function ProductPrice({ product }) {
  const { i18n } = useTranslation(), { min, max } = stockPriceRange(product);
  const format = value => Number(value).toLocaleString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { maximumFractionDigits: 2 });
  return <bdi dir="ltr">{format(min)}{max !== min ? ' – ' + format(max) : ''} DH</bdi>;
}
