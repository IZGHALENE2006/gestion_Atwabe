import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoRefreshOutline } from 'react-icons/io5';
import { formatSfifaCode } from '../../../shared/sfifaStock.js';
import { tailoringSfifaStyle } from '../../../shared/tailoringSfifa.js';
import { loadTailoringSfifaOptions } from './feslaApi.js';

export default function TailoringSfifaPicker({ token, sfifa, savedStock, index, onChange, disabled, fields }) {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const stock = sfifa.stock, scope = token + ':' + attempt, enabled = Boolean(stock);
  const state = result?.scope === scope ? result : { loading: true, items: [] };
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    loadTailoringSfifaOptions(token, controller.signal).then(data => {
      if (!Array.isArray(data.items)) throw new Error('Invalid sfifa options');
      if (!controller.signal.aborted) setResult({ ...data, scope, loading: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ scope, loading: false, items: [], error: true }); });
    return () => controller.abort();
  }, [token, scope, enabled]);
  const id = key => `fesla-items-${index}-sfifa-stock-${key}`;
  const error = key => fields['sfifa.stock.' + key];
  const number = value => Number(value).toLocaleString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { maximumFractionDigits: 3 });
  const label = row => `${row.code === undefined ? t('fesla.stockSfifa.unassigned') : formatSfifaCode(row.code, row.family)} · ${row.family} · ${number(row.quantity ?? 0)} ${t('sfifaStock.unit')}`;
  const selected = state.items.find(row => row.stockId === stock?.stockId && row.variantId === stock?.variantId);
  const retained = savedStock && stock && savedStock.stockId === stock.stockId && savedStock.variantId === stock.variantId ? savedStock : null;
  const types = [...new Set([...(selected?.styles || []), ...(retained?.meterType ? [retained.meterType] : [])])];
  const inputClass = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800';
  const field = (key, title, child) => <div className="min-w-0"><label htmlFor={id(key)} className="mb-2 block text-sm font-semibold">{title}</label>{child}{error(key) && <p className="mt-2 text-xs text-rose-600" role="alert">{t('fesla.errors.' + error(key))}</p>}</div>;
  return <div className="min-w-0 space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20 sm:col-span-2" data-tailoring-sfifa-picker>
    {field('source', t('fesla.stockSfifa.source'), <select id={id('source')} className={inputClass} disabled={disabled} value={stock ? 'stock' : 'manual'} onChange={event => onChange({ ...sfifa, style: 'fabric', color1: '', color2: '', stock: event.target.value === 'stock' ? { stockId: '', variantId: '', meters: '3' } : undefined })}><option value="manual">{t('fesla.stockSfifa.manual')}</option><option value="stock">{t('fesla.stockSfifa.fromStock')}</option></select>)}
    {stock && <>
      <p className="text-xs leading-6 text-blue-800 dark:text-blue-200">{t('fesla.stockSfifa.hint')}</p>
      <button type="button" data-refresh-tailoring-sfifa disabled={disabled || state.loading} onClick={() => setAttempt(value => value + 1)} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 dark:text-blue-300"><IoRefreshOutline aria-hidden="true" />{t('workers.work.materials.refresh')}</button>
      {state.loading ? <p role="status">{t('common.loading')}</p> : state.error ? <p role="alert" className="text-sm text-rose-600">{t('fesla.errors.sfifaStockUnavailable')}</p> : <>
        {field('variantId', t('fesla.stockSfifa.choose'), <select id={id('variantId')} data-tailoring-sfifa-stock className={inputClass} disabled={disabled} required value={stock.variantId} aria-invalid={Boolean(error('variantId') || error('stockId'))} onChange={event => {
          const row = state.items.find(row => row.variantId === event.target.value);
          const meterType = row?.styles.length === 1 ? row.styles[0] : undefined;
          onChange({ ...sfifa, style: tailoringSfifaStyle(meterType) || 'fabric', color1: '', color2: '', stock: { stockId: row?.stockId || '', variantId: row?.variantId || '', meters: stock.meters, ...(meterType ? { meterType } : {}) } });
        }}><option value="">{t('fesla.stockSfifa.choose')}</option>{retained && !selected && <option value={retained.variantId}>{label({ ...retained, quantity: retained.meters })}</option>}{state.items.filter(row => row.width === sfifa.width).map(row => <option key={row.variantId} value={row.variantId} disabled={row.quantity <= 0 && row.variantId !== retained?.variantId}>{label(row)}</option>)}</select>)}
        {types.length > 0 && field('meterType', t('fesla.stockSfifa.meterType'), <select id={id('meterType')} data-tailoring-sfifa-type className={inputClass} disabled={disabled} required value={stock.meterType || ''} aria-invalid={Boolean(error('meterType'))} onChange={event => onChange({ ...sfifa, style: tailoringSfifaStyle(event.target.value) || 'fabric', color1: '', color2: '', stock: { ...stock, meterType: event.target.value || undefined } })}><option value="">{t('fesla.stockSfifa.chooseType')}</option>{types.map(type => <option key={type} value={type}>{t('sfifaStock.meterTypes.' + type)}</option>)}</select>)}
        {field('meters', t('fesla.stockSfifa.meters'), <input id={id('meters')} data-tailoring-sfifa-meters className={inputClass} inputMode="decimal" dir="ltr" maxLength={11} required disabled={disabled} value={stock.meters} aria-invalid={Boolean(error('meters'))} onChange={event => onChange({ ...sfifa, stock: { ...stock, meters: event.target.value } })} />)}
        {(selected || retained) && <p className="text-xs text-slate-600 dark:text-slate-300" data-tailoring-sfifa-available>{t('fesla.stockSfifa.available', { meters: number((selected?.quantity || 0) + (retained?.meters || 0)) })}</p>}
      </>}
    </>}
  </div>;
}
