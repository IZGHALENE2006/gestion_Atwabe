import { useTranslation } from 'react-i18next';

export default function TailoringPricingSummary({ pricing, item = false }) {
  const { t, i18n } = useTranslation();
  if (!pricing) return null;
  const money = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ' + t('fesla.currency');
  const discountText = pricing.discount.type === 'percent' ? ` (${pricing.discount.value}%)` : '';
  const rows = item ? [
    ['basePrice', pricing.basePrice], ...(pricing.fourFille ? [['fourFille', pricing.fourFilleAmount]] : []), ...(pricing.discountAmount > 0 ? [['pieceDiscount', pricing.discountAmount, discountText]] : []),
  ] : [['subtotal', pricing.subtotal], ...(pricing.discountAmount > 0 ? [['orderDiscount', pricing.discountAmount, discountText]] : [])];
  return <dl className="fesla-pricing-summary" data-tailoring-pricing-summary={item ? 'piece' : 'order'}>{rows.map(([key, amount, suffix]) => <div key={key}><dt>{t('fesla.adjustments.' + key)}{suffix}</dt><dd><bdi>{key.includes('Discount') ? '− ' : ''}{money(amount)}</bdi></dd></div>)}</dl>;
}
