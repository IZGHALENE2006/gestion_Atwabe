import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCartOutline, IoCloseOutline, IoRefreshOutline } from 'react-icons/io5';
import { calculateFabricReduction } from '../../../shared/fabrics.js';
import { calculateFabricSale, fabricSaleFingerprint, validateFabricSaleInput } from '../../../shared/fabricSales.js';
import { loadFabrics, loadFabricSaleClients, sellFabricPiece } from './fabricsApi.js';

const inputClass = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800';
const errorCodes = ['forbidden', 'notFound', 'conflict', 'requestConflict', 'invalidReduction', 'insufficientMeters', 'invalidSalePrice', 'salePriceUnavailable', 'invalidSaleDiscount', 'invalidSaleClient', 'clientUnavailable'];

export default function FabricSaleDialog({ fabrics, token, permissions, onClose, onSold, onReloaded }) {
  const { t, i18n } = useTranslation();
  const dialog = useRef(null), busy = useRef(false), request = useRef(null);
  const [fabricId, setFabricId] = useState(''), [colorId, setColorId] = useState(''), [pieceId, setPieceId] = useState('');
  const [meters, setMeters] = useState(''), [pricingMode, setPricingMode] = useState('retail');
  const [discountType, setDiscountType] = useState('percent'), [discountValue, setDiscountValue] = useState('');
  const [clientId, setClientId] = useState(''), [clientName, setClientName] = useState('');
  const [clients, setClients] = useState({ loading: true, rows: [], error: false }), [clientAttempt, setClientAttempt] = useState(0);
  const [saving, setSaving] = useState(false), [reloading, setReloading] = useState(false), [error, setError] = useState('');
  const fabric = fabrics.find(row => row._id === fabricId), color = fabric?.colors.find(row => row._id === colorId), piece = color?.pieces.find(row => row._id === pieceId);
  const match = piece ? { fabric, color, piece } : null;
  const locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const money = value => t('fabrics.salePriceValue', { value: Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  const length = value => t('fabrics.meterValue', { value: Number(value).toLocaleString(locale, { maximumFractionDigits: 3 }) });
  const values = { meters, pricingMode, discountType, discountValue: discountValue.trim() || 0, clientId, clientName };
  let preview = null, previewError = '';
  if (match && meters.trim()) {
    try {
      const input = validateFabricSaleInput(values);
      preview = { ...calculateFabricSale(input, fabric), ...calculateFabricReduction(input.meters, piece.meters) };
    } catch (failure) { previewError = errorCodes.includes(failure.message) ? failure.message : 'saleFailed'; }
  }
  const unitPrice = fabric?.[pricingMode === 'wholesale' ? 'wholesalePricePerMeter' : 'salePricePerMeter'];
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadFabricSaleClients(token, controller.signal).then(data => {
      if (!controller.signal.aborted) setClients({ rows: data.clients, loading: false, error: false });
    }).catch(() => { if (!controller.signal.aborted) setClients({ rows: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [token, clientAttempt]);
  const close = () => { if (!busy.current) onClose(); };
  const clearError = () => setError('');
  const reload = async () => {
    if (busy.current) return;
    busy.current = true; setReloading(true); setError('');
    try { onReloaded(await loadFabrics(token)); }
    catch { setError('loadFailed'); }
    finally { busy.current = false; setReloading(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (busy.current || !permissions.sell) return;
    if (!match) { setError('salePieceRequired'); return; }
    let input;
    try {
      input = validateFabricSaleInput(values);
      calculateFabricReduction(input.meters, piece.meters);
      calculateFabricSale(input, fabric);
    } catch (failure) { setError(errorCodes.includes(failure.message) ? failure.message : 'saleFailed'); return; }
    const fingerprint = JSON.stringify([fabricId, colorId, pieceId, fabricSaleFingerprint(input)]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    busy.current = true; setSaving(true); setError('');
    try { onSold(await sellFabricPiece(match, input, request.current.id, token)); }
    catch (failure) { const code = failure.response?.data?.message; setError(errorCodes.includes(code) ? code : 'saleFailed'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <dialog ref={dialog} dir={i18n.dir()} aria-labelledby="fabric-sale-title" onCancel={event => { event.preventDefault(); close(); }} className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-700"><div><h2 id="fabric-sale-title" className="flex items-center gap-2 text-xl font-bold text-blue-700 dark:text-blue-300"><IoCartOutline />{t('fabrics.sales.title')}</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('fabrics.sales.hint')}</p></div><button type="button" disabled={saving || reloading} onClick={close} aria-label={t('dialog.close')} className="rounded-lg p-2 hover:bg-slate-200 dark:hover:bg-slate-800"><IoCloseOutline size={24} /></button></header>
    <form noValidate onSubmit={submit} className="p-4 sm:p-6"><fieldset disabled={saving || reloading} className="min-w-0 space-y-5 disabled:opacity-70">
      <section className="space-y-4 rounded-2xl border border-blue-100 bg-white p-4 dark:border-blue-900 dark:bg-slate-950/30"><h3 className="font-bold">{t('fabrics.sales.selectRoll')}</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="fabric-sale-type" className="mb-2 block text-sm font-semibold">{t('fabrics.type')} *</label><select id="fabric-sale-type" autoFocus value={fabricId} onChange={event => { setFabricId(event.target.value); setColorId(''); setPieceId(''); clearError(); }} className={inputClass}><option value="">{t('fabrics.chooseType')}</option>{fabrics.map(row => <option key={row._id} value={row._id}>{row.type}{row.reference ? ' · ' + row.reference : ''}</option>)}</select></div>
          <div><label htmlFor="fabric-sale-color" className="mb-2 block text-sm font-semibold">{t('fabrics.color')} *</label><select id="fabric-sale-color" disabled={!fabric} value={colorId} onChange={event => { setColorId(event.target.value); setPieceId(''); clearError(); }} className={inputClass}><option value="">{t('fabrics.chooseColor')}</option>{fabric?.colors.map(row => <option key={row._id} value={row._id}>{row.name}{row.number ? ' · ' + row.number : ''}</option>)}</select></div>
          <div><label htmlFor="fabric-sale-roll" className="mb-2 block text-sm font-semibold">{t('fabrics.sales.roll')} *</label><select id="fabric-sale-roll" disabled={!color} value={pieceId} onChange={event => { setPieceId(event.target.value); clearError(); }} className={inputClass}><option value="">{t('fabrics.sales.chooseRoll')}</option>{color?.pieces.map((row, index) => <option key={row._id} value={row._id} disabled={row.meters <= 0}>{t('fabrics.piece', { number: index + 1 })} · {length(row.meters)} · {row.barcode}</option>)}</select></div>
        </div>
        {match && <p data-fabric-sale-available className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">{t('fabrics.remainingMeters')}: <bdi>{length(piece.meters)}</bdi> · <bdi dir="ltr" className="font-mono">{piece.barcode}</bdi></p>}
        <div className="grid gap-4 sm:grid-cols-3"><div><label htmlFor="fabric-sale-meters" className="mb-2 block text-sm font-semibold">{t('fabrics.sales.meters')} *</label><input id="fabric-sale-meters" inputMode="decimal" dir="ltr" maxLength={20} value={meters} onChange={event => { setMeters(event.target.value); clearError(); }} className={inputClass} /></div><div><label htmlFor="fabric-sale-pricing" className="mb-2 block text-sm font-semibold">{t('fabrics.sales.pricing')}</label><select id="fabric-sale-pricing" value={pricingMode} onChange={event => { setPricingMode(event.target.value); clearError(); }} className={inputClass}><option value="retail">{t('fabrics.sales.retail')}</option>{permissions.wholesale && <option value="wholesale">{t('fabrics.sales.wholesale')}</option>}</select></div><div><p className="mb-2 text-sm font-semibold">{t('fabrics.sales.unitPrice')}</p><p data-fabric-sale-unit-price className="rounded-xl bg-slate-100 p-3 text-sm font-bold text-blue-700 dark:bg-slate-800 dark:text-blue-300">{Number.isFinite(unitPrice) ? <bdi>{money(unitPrice)}</bdi> : t('fabrics.priceUnknown')}</p></div></div>
      </section>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/30"><h3 className="font-bold">{t('fabrics.sales.client')} <span className="text-sm font-normal text-slate-500">({t('fabrics.optional')})</span></h3><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="fabric-sale-client" className="mb-2 block text-sm font-semibold">{t('fabrics.sales.savedClient')}</label><select id="fabric-sale-client" value={clientId} disabled={clients.loading || clients.error} onChange={event => { setClientId(event.target.value); clearError(); }} className={inputClass}><option value="">{t('fabrics.sales.noClient')}</option>{clients.rows.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></div><div><label htmlFor="fabric-sale-client-name" className="mb-2 block text-sm font-semibold">{t('fabrics.sales.clientName')}</label><input id="fabric-sale-client-name" maxLength={160} value={clientId ? clients.rows.find(row => row._id === clientId)?.name || '' : clientName} disabled={Boolean(clientId)} onChange={event => { setClientName(event.target.value); clearError(); }} className={inputClass} /></div></div>{clients.error && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{t('fabrics.sales.clientsFallback')} <button type="button" onClick={() => { setClients(current => ({ ...current, loading: true })); setClientAttempt(value => value + 1); }} className="font-bold underline">{t('fabrics.retry')}</button></p>}</section>
      {permissions.discount && <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/30 sm:grid-cols-2"><div><label htmlFor="fabric-sale-discount-type" className="mb-2 block text-sm font-semibold">{t('fabrics.sales.discount')} ({t('fabrics.optional')})</label><select id="fabric-sale-discount-type" value={discountType} onChange={event => { setDiscountType(event.target.value); setDiscountValue(''); clearError(); }} className={inputClass}><option value="percent">{t('fabrics.sales.percent')}</option><option value="amount">{t('fabrics.sales.amount')}</option></select></div><div><label htmlFor="fabric-sale-discount" className="mb-2 block text-sm font-semibold">{t(discountType === 'percent' ? 'fabrics.sales.discountPercent' : 'fabrics.sales.discountAmount')}</label><input id="fabric-sale-discount" dir="ltr" inputMode="decimal" maxLength={20} placeholder="0" value={discountValue} onChange={event => { setDiscountValue(event.target.value); clearError(); }} className={inputClass} /></div></section>}
      <dl className="grid gap-3 sm:grid-cols-3">{[['subtotal', preview?.subtotal], ['discount', preview?.discountAmount], ['total', preview?.total]].map(([key, value]) => <div key={key} className={'rounded-2xl border p-4 ' + (key === 'total' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800')}><dt className="text-sm">{t('fabrics.sales.' + key)}</dt><dd data-fabric-sale-total={key} data-value={value} className="mt-2 text-xl font-bold"><bdi>{value === undefined ? '—' : money(value)}</bdi></dd></div>)}</dl>
      {preview && <p className="text-sm text-slate-500 dark:text-slate-400">{t('fabrics.sales.remainingAfter')}: <bdi>{length(preview.remaining)}</bdi></p>}
      {(error || previewError) && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{t('fabrics.errors.' + (error || previewError))}</p>}
      <footer className="sticky bottom-0 flex flex-wrap justify-between gap-3 border-t border-slate-200 bg-slate-50 py-4 dark:border-slate-700 dark:bg-slate-900"><button type="button" onClick={reload} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold dark:border-slate-700"><IoRefreshOutline />{t('fabrics.reloadStock')}</button><div className="flex gap-2"><button type="button" onClick={close} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold dark:border-slate-700">{t('dialog.close')}</button><button type="submit" data-confirm-fabric-sale disabled={!match || !preview || !permissions.sell} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"><IoCartOutline />{t(saving ? 'common.loading' : 'fabrics.sales.confirm')}</button></div></footer>
    </fieldset></form>
  </dialog>;
}
