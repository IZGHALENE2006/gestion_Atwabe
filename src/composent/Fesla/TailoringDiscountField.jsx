import { useTranslation } from 'react-i18next';

export default function TailoringDiscountField({ id, label, value, onChange, disabled, error }) {
  const { t } = useTranslation();
  return <div className="fesla-discount-field">
    <label htmlFor={id + '-value'}>{label} <small>({t('fabrics.optional')})</small></label>
    <div className="fesla-discount-inputs">
      <input id={id + '-value'} type="text" inputMode="decimal" dir="ltr" maxLength={12} value={value?.value ?? ''} placeholder="0" disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? id + '-error' : undefined} onChange={event => onChange({ type: value?.type || 'amount', value: event.target.value })} />
      <select id={id + '-type'} aria-label={t('fesla.adjustments.discountType')} value={value?.type || 'amount'} disabled={disabled} onChange={event => onChange({ type: event.target.value, value: value?.value ?? '' })}><option value="amount">{t('fesla.currency')}</option><option value="percent">%</option></select>
    </div>
    {error && <p id={id + '-error'} role="alert" className="fesla-action-error">{t('fesla.errors.' + error)}</p>}
  </div>;
}
