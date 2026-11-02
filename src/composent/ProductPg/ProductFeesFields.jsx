import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { calculateProductFees } from '../../../shared/productFees.js';

export default function ProductFeesFields({ total, quantity, retailPrice, wholesalePrice, onTotalChange, onQuantityChange, disabled = false }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const money = (value) => `${Number(value).toLocaleString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
  let pricing;
  let error;
  try {
    pricing = calculateProductFees({ totalFees: total, quantity, retailPrice: retailPrice || 0, wholesalePrice });
  } catch (cause) {
    error = cause.message;
  }
  const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

  return (
    <fieldset disabled={disabled} className="my-5 rounded-2xl border border-primary-200 bg-primary-50/40 p-4 dark:border-primary-900 dark:bg-primary-950/20">
      <legend className="px-2 text-sm font-semibold text-primary-700 dark:text-primary-300">{t('fees.title')}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-total`} className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">{t('fees.total')}</label>
          <input id={`${id}-total`} name="frais_total" type="number" min="0" step="0.01" placeholder="0.00" value={total} onChange={(event) => onTotalChange(event.target.value)} aria-describedby={`${id}-hint`} className={inputClass} />
        </div>
        {onQuantityChange && Number(total) > 0 && <div>
          <label htmlFor={`${id}-quantity`} className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">{t('fees.quantity')}</label>
          <input id={`${id}-quantity`} name="frais_quantite" type="number" min="1" step="1" required value={quantity} onChange={(event) => onQuantityChange(event.target.value)} className={inputClass} />
        </div>}
      </div>
      <p id={`${id}-hint`} className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{t(onQuantityChange ? 'fees.editHint' : 'fees.hint')}</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{t(`pricing.${error}`)}</p>}
      {pricing?.frais_total > 0 && <div className="mt-4 space-y-3 border-t border-primary-200 pt-3 dark:border-primary-900" aria-live="polite">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200"><bdi dir="ltr">{t('fees.calculation', { total: money(pricing.frais_total), quantity: pricing.frais_quantite, unit: money(pricing.frais_unitaire) })}</bdi></p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('fees.finalRetail')}</p>
            <output data-final-price="retail" className="mt-1 block text-lg font-bold text-primary-700 dark:text-primary-300">{retailPrice === '' ? '—' : money(pricing.prix_vente)}</output>
          </div>
          {pricing.prix_gros !== null && <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('fees.finalWholesale')}</p>
            <output data-final-price="wholesale" className="mt-1 block text-lg font-bold text-primary-700 dark:text-primary-300">{money(pricing.prix_gros)}</output>
          </div>}
        </div>
      </div>}
    </fieldset>
  );
}
