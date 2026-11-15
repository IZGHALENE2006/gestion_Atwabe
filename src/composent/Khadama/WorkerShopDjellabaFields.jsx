import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCheckmarkCircleOutline, IoColorPaletteOutline, IoRefreshOutline } from 'react-icons/io5';
import { WORKER_GARMENT_SIZES, WORKER_SFIFA_METERS } from '../../../shared/workerMaterials.js';
import { formatSfifaCode } from '../../../shared/sfifaStock.js';
import { loadWorkerMaterialOptions } from './workersApi.js';

export default function WorkerShopDjellabaFields({ token, workerId, value, onChange, disabled, fields = {}, fixedWork }) {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const scope = `${token}:${workerId}:${attempt}`, state = result?.scope === scope ? result : { loading: true, fabrics: [], sfifa: [], error: false };
  useEffect(() => {
    const controller = new AbortController();
    loadWorkerMaterialOptions(token, workerId, controller.signal).then(data => {
      if (!Array.isArray(data.fabrics) || !Array.isArray(data.sfifa)) throw new Error('Invalid material options');
      if (!controller.signal.aborted) setResult({ scope, ...data, loading: false, error: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ scope, loading: false, fabrics: [], sfifa: [], error: true }); });
    return () => controller.abort();
  }, [token, workerId, scope]);
  const config = value.shopDjellaba, selected = config.colorIds || [], assigned = new Set(fixedWork?.shopDjellaba.colorIds || []);
  const fabric = state.fabrics.find(fabric => fabric._id === config.fabricId), colors = fabric?.colors || [], available = colors.filter(color => !assigned.has(color._id));
  const sfifa = state.sfifa.find(sfifa => sfifa.parentId === config.sfifaId && sfifa._id === config.variantId);
  const patch = input => { const next = { ...config, ...input }; onChange({ shopDjellaba: next, quantity: String(next.colorIds.length), lineIds: next.colorIds }); };
  const props = key => ({ id: `worker-work-shopDjellaba.${key}`, className: 'work-input', 'aria-invalid': Boolean(fields[`shopDjellaba.${key}`]), 'aria-describedby': fields[`shopDjellaba.${key}`] ? `worker-work-shopDjellaba.${key}-error` : undefined });
  const errorFor = key => fields[`shopDjellaba.${key}`] && <p id={`worker-work-shopDjellaba.${key}-error`} className="work-field-error">{t('workers.work.errors.' + fields[`shopDjellaba.${key}`])}</p>;
  const number = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { maximumFractionDigits: 3 }).format(value);
  const shortage = sfifa && Math.round(sfifa.quantity * 1000) < selected.length * WORKER_SFIFA_METERS * 1000;
  return <section className="worker-shop-djellaba" id="worker-work-materials" tabIndex={-1} aria-labelledby="worker-djellaba-title">
    <header className="worker-djellaba-heading"><div><h3 id="worker-djellaba-title">{t('workers.work.shopDjellaba.title')}</h3><p className="work-field-hint">{t('workers.work.shopDjellaba.hint')}</p></div><button type="button" data-refresh-djellaba-options disabled={disabled || state.loading} onClick={() => setAttempt(n => n + 1)} className="work-text-button"><IoRefreshOutline aria-hidden="true" />{t('workers.work.materials.refresh')}</button></header>
    {state.error && <p role="alert" className="work-field-error">{t('workers.work.errors.loadMaterialsFailed')}</p>}
    <div className="worker-djellaba-layout"><div>
      <div className="work-field"><label htmlFor={props('fabricId').id}>{t('workers.work.materials.fabric')}</label><select {...props('fabricId')} data-djellaba-fabric value={config.fabricId || ''} onChange={event => patch({ fabricId: event.target.value, colorIds: [] })} disabled={disabled || state.loading || state.error || Boolean(fixedWork)} required><option value="">{t(state.loading ? 'common.loading' : 'workers.work.materials.chooseFabric')}</option>{state.fabrics.map(fabric => <option key={fabric._id} value={fabric._id}>{fabric.type}{fabric.reference ? ` · ${fabric.reference}` : ''}</option>)}</select>{errorFor('fabricId')}</div>
      <div className="worker-trouser-measures"><div className="work-field"><label htmlFor={props('size').id}>{t('workers.work.pieceCards.size')}</label><select {...props('size')} data-djellaba-size dir="ltr" value={config.size || ''} onChange={event => patch({ size: event.target.value })} disabled={disabled || Boolean(fixedWork)}><option value="">{t('workers.work.pieceCards.chooseSize')}</option>{WORKER_GARMENT_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select>{errorFor('size')}</div><div className="work-field"><label htmlFor={props('meters').id}>{t('workers.work.shopDjellaba.meters')}</label><input {...props('meters')} data-djellaba-meters value={config.meters ?? ''} onChange={event => patch({ meters: event.target.value })} disabled={disabled || Boolean(fixedWork)} inputMode="decimal" dir="ltr" maxLength={11} placeholder="0" />{errorFor('meters')}</div></div>
      <p className="work-field-hint worker-djellaba-fabric-note">{t('workers.work.shopDjellaba.fabricNote')}</p>
      <div className="work-field"><label htmlFor={props('variantId').id}>{t('workers.work.materials.sfifa')}</label><select {...props('variantId')} data-djellaba-sfifa value={config.variantId || ''} onChange={event => { const chosen = state.sfifa.find(row => row._id === event.target.value); patch({ sfifaId: chosen?.parentId || '', variantId: chosen?._id || '', sfifaStyle: chosen?.styles?.length ? '' : undefined }); }} disabled={disabled || state.loading || state.error || Boolean(fixedWork)} required><option value="">{t('workers.work.materials.chooseSfifa')}</option>{state.sfifa.map(sfifa => <option key={sfifa._id} value={sfifa._id}>{t('sfifaStock.widths.' + sfifa.width)} · {sfifa.code === undefined ? t('workers.work.materials.unassigned') : formatSfifaCode(sfifa.code, sfifa.family)} · {number(sfifa.quantity)} {t('sfifaStock.unit')}</option>)}</select>{errorFor('sfifaId')}{errorFor('variantId')}</div>
      {sfifa?.styles?.length > 0 && <div className="work-field"><label htmlFor={props('sfifaStyle').id}>{t('workers.work.materials.sfifaStyle')}</label><select {...props('sfifaStyle')} data-djellaba-sfifa-style value={config.sfifaStyle || ''} onChange={event => patch({ sfifaStyle: event.target.value })} disabled={disabled || Boolean(fixedWork)} required><option value="">{t('workers.work.materials.chooseSfifaStyle')}</option>{sfifa.styles.map(style => <option key={style} value={style}>{t('sfifaStock.meterTypes.' + style)}</option>)}</select>{errorFor('sfifaStyle')}</div>}
      <div className="work-field"><label htmlFor={props('unitWage').id}>{t('workers.payroll.wagePerPiece')}</label><input {...props('unitWage')} data-djellaba-wage value={config.unitWage ?? ''} onChange={event => patch({ unitWage: event.target.value })} disabled={disabled} inputMode="decimal" dir="ltr" maxLength={13} placeholder="0.00" required />{errorFor('unitWage')}</div>
    </div><fieldset id="worker-work-shopDjellaba.colorIds" tabIndex={-1} className="worker-trouser-colors" disabled={disabled || state.loading || state.error} aria-invalid={Boolean(fields['shopDjellaba.colorIds'])}>
      <legend><IoColorPaletteOutline aria-hidden="true" />{t('workers.work.shopTrousers.colors')}</legend><p className="work-field-hint">{t('workers.work.shopDjellaba.colorHint')}</p>
      {available.length > 0 && <div className="worker-trouser-color-toolbar"><button type="button" className="work-text-button" data-select-djellaba-colors onClick={() => patch({ colorIds: selected.length === available.length ? [] : available.map(color => color._id) })}>{t(selected.length === available.length ? 'workers.work.shopTrousers.clearColors' : 'workers.work.shopTrousers.allColors')}</button><span data-djellaba-count aria-live="polite">{t('workers.work.shopDjellaba.count', { number: number(selected.length) })}</span></div>}
      <div className="worker-trouser-color-grid">{colors.map(color => { const checked = selected.includes(color._id), alreadyAssigned = assigned.has(color._id); return <label key={color._id} className={`worker-trouser-color ${checked ? 'is-selected' : ''} ${alreadyAssigned ? 'is-assigned' : ''}`}><input type="checkbox" data-djellaba-color={color._id} checked={checked} disabled={alreadyAssigned} onChange={event => patch({ colorIds: event.target.checked ? [...selected, color._id] : selected.filter(id => id !== color._id) })} /><span><strong dir="auto">{color.name}</strong>{color.number && <small>{t('workers.work.shopTrousers.colorNumber')}: <bdi>{color.number}</bdi></small>}{alreadyAssigned && <small>{t('workers.work.shopTrousers.alreadyAssigned')}</small>}</span><IoCheckmarkCircleOutline className="worker-trouser-color-check" aria-hidden="true" /></label>; })}</div>
      {!colors.length && !state.loading && <p className="work-field-hint">{t('workers.work.shopTrousers.chooseFabricFirst')}</p>}{errorFor('colorIds')}
      <p className="worker-trouser-metre-total" data-djellaba-sfifa-total>{t('workers.work.shopDjellaba.sfifaTotal')}: <bdi>{number(selected.length * WORKER_SFIFA_METERS)}</bdi> {t('sfifaStock.unit')}</p>
      {shortage && <p role="alert" className="work-field-error">{t('workers.work.errors.insufficientSfifa')}</p>}
    </fieldset></div>
    {fields.shopDjellaba && <p className="work-field-error">{t('workers.work.errors.' + fields.shopDjellaba)}</p>}
  </section>;
}
