import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCheckmarkCircleOutline, IoColorPaletteOutline, IoRefreshOutline } from 'react-icons/io5';
import { TROUSER_TYPES, SHOP_TROUSER_LENGTHS } from '../../../shared/workerWork.js';
import { trouserMeterUnits } from '../../../shared/workerShopTrousers.js';
import { WORKER_GARMENT_SIZES } from '../../../shared/workerMaterials.js';
import { loadWorkerFabricOptions } from './workersApi.js';

export default function WorkerShopTrouserFields({ token, workerId, value, onChange, disabled, fields = {}, fixedWork }) {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const scope = `${token}:${workerId}:${attempt}`;
  const state = result?.scope === scope ? result : { loading: true, fabrics: [], error: false };
  useEffect(() => {
    const controller = new AbortController();
    loadWorkerFabricOptions(token, workerId, controller.signal).then(data => {
      if (!Array.isArray(data.fabrics)) throw new Error('Invalid fabric choices');
      if (!controller.signal.aborted) setResult({ scope, ...data, loading: false, error: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ scope, fabrics: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [token, workerId, scope]);
  const props = key => ({ id: `worker-work-${key}`, className: 'work-input', 'aria-invalid': Boolean(fields[key]), 'aria-describedby': fields[key] ? `worker-work-${key}-error` : undefined });
  const errorFor = key => fields[key] && <p id={`worker-work-${key}-error`} className="work-field-error">{t(`workers.work.errors.${fields[key]}`)}</p>;
  const patch = data => {
    const shopTrouser = { ...value.shopTrouser, ...data };
    onChange({ shopTrouser, quantity: String((shopTrouser.colorIds || []).length) });
  };
  const fabricId = fixedWork?.shopTrouser.fabricId || value.shopTrouser?.fabricId;
  const fabric = state.fabrics.find(row => row._id === fabricId);
  const colors = fabric?.colors || [];
  const selected = value.shopTrouser?.colorIds || [];
  const assigned = new Set((fixedWork?.shopTrouser.colors || []).map(color => color.colorId));
  const available = colors.filter(color => !assigned.has(color._id));
  const stale = !state.loading && !state.error && selected.some(id => !available.some(color => color._id === id));
  const meters = fixedWork?.shopTrouser.metersPerPiece ?? value.shopTrouser?.metersPerPiece;
  const meterUnits = trouserMeterUnits(meters);
  const toggle = id => patch({ colorIds: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] });
  const number = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA').format(value);
  const refresh = <button type="button" data-refresh-trouser-fabrics onClick={() => setAttempt(n => n + 1)} className="work-text-button" disabled={disabled || state.loading}><IoRefreshOutline aria-hidden="true" />{t('workers.work.materials.refresh')}</button>;
  return <section className="worker-shop-trousers" aria-label={t('workers.work.shopTrousers.details')}>
    {!fixedWork ? <>
      <div className="work-field"><label htmlFor="worker-work-trouserType">{t('workers.work.trousers.typeLabel')}</label><select {...props('trouserType')} data-shop-trouser-type value={value.trouserType} onChange={event => onChange({ trouserType: event.target.value })} disabled={disabled} required>{TROUSER_TYPES.map(type => <option key={type} value={type}>{t(`workers.work.trousers.styles.${type}`)}</option>)}</select>{errorFor('trouserType')}</div>
      <div className="work-field"><div className="worker-shop-fabric-label"><label htmlFor="worker-work-shopTrouser.fabricId">{t('workers.work.materials.fabric')}</label>{refresh}</div><select {...props('shopTrouser.fabricId')} data-shop-trouser-fabric value={fabricId || ''} onChange={event => patch({ fabricId: event.target.value, colorIds: [] })} disabled={disabled || state.loading || state.error} required><option value="">{t(state.loading ? 'common.loading' : 'workers.work.materials.chooseFabric')}</option>{state.fabrics.map(fabric => <option key={fabric._id} value={fabric._id}>{fabric.type}{fabric.reference ? ` · ${fabric.reference}` : ''}</option>)}</select>{errorFor('shopTrouser.fabricId')}{!state.loading && !state.error && !state.fabrics.length && <p className="work-field-hint">{t('workers.work.shopTrousers.noFabrics')}</p>}</div>
      <div className="worker-trouser-measures">
        <div className="work-field"><label htmlFor="worker-work-shopTrouser.length">{t('workers.work.shopTrousers.length')}</label><select {...props('shopTrouser.length')} data-shop-trouser-length dir="ltr" value={value.shopTrouser?.length || ''} onChange={event => patch({ length: event.target.value })} disabled={disabled} required><option value="">{t('workers.work.shopTrousers.chooseLength')}</option>{SHOP_TROUSER_LENGTHS.map(length => <option key={length} value={length}>{length}</option>)}</select>{errorFor('shopTrouser.length')}</div>
        <div className="work-field"><label htmlFor="worker-work-shopTrouser.size">{t('workers.work.pieceCards.size')}</label><select {...props('shopTrouser.size')} data-shop-trouser-size dir="ltr" value={value.shopTrouser?.size || ''} onChange={event => patch({ size: event.target.value })} disabled={disabled} required><option value="">{t('workers.work.pieceCards.chooseSize')}</option>{WORKER_GARMENT_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select>{errorFor('shopTrouser.size')}</div>
      </div>
    </> : <div className="worker-shop-fabric-label"><p className="work-field-hint" dir="auto">{fixedWork.shopTrouser.fabricType} · {t('workers.work.shopTrousers.length')}: <bdi>{fixedWork.shopTrouser.length}</bdi> · <bdi>{fixedWork.shopTrouser.size}</bdi></p>{refresh}</div>}
    {!fixedWork ? <div className="work-field worker-trouser-meter-field"><label htmlFor="worker-work-shopTrouser.metersPerPiece">{t('workers.work.shopTrousers.metersPerPiece')}</label><input {...props('shopTrouser.metersPerPiece')} data-shop-trouser-meters inputMode="decimal" dir="ltr" value={meters || ''} onChange={event => patch({ metersPerPiece: event.target.value })} disabled={disabled} placeholder="0.00" maxLength={11} required /><p className="work-field-hint">{t('workers.work.shopTrousers.metersHint')}</p>{errorFor('shopTrouser.metersPerPiece')}</div> : meters !== undefined && <p className="work-field-hint">{t('workers.work.shopTrousers.metersPerPiece')}: <bdi>{number(meters)}</bdi></p>}
    {state.error && <p role="alert" className="work-field-error">{t('workers.work.errors.loadMaterialsFailed')}</p>}
    <fieldset id="worker-work-shopTrouser.colorIds" tabIndex={-1} className="worker-trouser-colors" disabled={disabled || state.loading || state.error} aria-invalid={Boolean(fields['shopTrouser.colorIds'])} aria-describedby={`worker-trouser-colors-hint${fields['shopTrouser.colorIds'] ? ' worker-work-shopTrouser.colorIds-error' : ''}`}>
      <legend><IoColorPaletteOutline aria-hidden="true" />{t('workers.work.shopTrousers.colors')}</legend>
      <p id="worker-trouser-colors-hint" className="work-field-hint">{t('workers.work.shopTrousers.colorHint')}</p>
      {fabric && available.length > 0 && <div className="worker-trouser-color-toolbar"><button type="button" className="work-text-button" data-select-trouser-colors onClick={() => patch({ colorIds: selected.length === available.length && !stale ? [] : available.map(color => color._id) })}>{t(selected.length === available.length && !stale ? 'workers.work.shopTrousers.clearColors' : 'workers.work.shopTrousers.allColors')}</button><span aria-live="polite" data-trouser-color-count>{t('workers.work.shopTrousers.selectedCount', { count: selected.length, number: number(selected.length) })}</span></div>}
      <div className="worker-trouser-color-grid">{colors.map(color => {
        const isSelected = selected.includes(color._id), wasAssigned = assigned.has(color._id);
        return <label key={color._id} className={`worker-trouser-color ${isSelected ? 'is-selected' : ''} ${wasAssigned ? 'is-assigned' : ''}`}>
          <input type="checkbox" data-shop-trouser-color={color._id} checked={isSelected} onChange={() => toggle(color._id)} disabled={wasAssigned} />
          <span><strong dir="auto">{color.name}</strong>{color.number && <small>{t('workers.work.shopTrousers.colorNumber')}: <bdi dir="auto">{color.number}</bdi></small>}{color.meters !== undefined && <small>{t('workers.work.shopTrousers.availableMeters')}: <bdi>{number(color.meters)}</bdi> {t('sfifaStock.unit')}</small>}{!wasAssigned && meterUnits > 0 && Math.round(color.meters * 1000) < meterUnits && <small className="work-field-error">{t('workers.work.errors.insufficientFabric')}</small>}{wasAssigned && <small>{t('workers.work.shopTrousers.alreadyAssigned')}</small>}</span><IoCheckmarkCircleOutline className="worker-trouser-color-check" aria-hidden="true" />
        </label>;
      })}</div>
      {!state.loading && !state.error && !colors.length && <p className="work-field-hint">{t(fabricId ? 'workers.work.shopTrousers.noColors' : 'workers.work.shopTrousers.chooseFabricFirst')}</p>}
      {stale && <p role="alert" className="work-field-error">{t('workers.work.errors.trouserColorsChanged')}</p>}
      {meterUnits > 0 && selected.length > 0 && <p className="worker-trouser-metre-total" data-trouser-meter-total>{t('workers.work.shopTrousers.totalMeters')}: <bdi>{number(meterUnits * selected.length / 1000)}</bdi> {t('sfifaStock.unit')}</p>}
      {errorFor('shopTrouser.colorIds')}
    </fieldset>
    {errorFor('shopTrouser')}
  </section>;
}
