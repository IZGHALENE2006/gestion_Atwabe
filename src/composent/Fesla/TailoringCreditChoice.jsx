import { useTranslation } from 'react-i18next';
export default function TailoringCreditChoice({ checked, onChange, disabled, clientId, total, onUseMinimum, useOrderClient = false, debtAmount }) {
  const { t, i18n } = useTranslation();
  const minimum = total == null ? null : Math.ceil(Math.round(total * 100) / 2) / 100;
  const money = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return <div className="tailoring-credit-choice"><label><input type="checkbox" data-deliver-on-credit checked={checked} disabled={disabled || !clientId && !useOrderClient} onChange={event => onChange(event.target.checked)} /><strong>{t('tailoringCredit.choice')}</strong></label><p>{t(useOrderClient ? 'tailoringCredit.orderOwnerHint' : clientId ? 'tailoringCredit.hint' : 'tailoringCredit.selectFirst')}</p>{checked && debtAmount != null && <div className="tailoring-delivery-debt" data-tailoring-delivery-debt>{t('tailoringCredit.deliveryDebtAmount', { amount: money(debtAmount) })}</div>}{checked && minimum !== null && <div><span>{t('tailoringCredit.minimum', { amount: money(minimum) })}</span>{onUseMinimum && <button type="button" data-use-credit-deposit disabled={disabled} onClick={() => onUseMinimum(minimum)}>{t('tailoringCredit.useMinimum')}</button>}</div>}</div>;
}
