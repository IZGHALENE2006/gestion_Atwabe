import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoRefreshOutline } from 'react-icons/io5';
import { TROUSER_TYPES } from '../../../shared/workerWork.js';
import { WORKER_GARMENT_SIZES } from '../../../shared/workerMaterials.js';
import { loadWorkerFabricOptions } from './workersApi.js';

export default function WorkerShopTrouserFields({ token, workerId, value, onChange, disabled, fields = {} }) {
  const { t } = useTranslation();
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
  const patch = data => onChange({ shopTrouser: { ...value.shopTrouser, ...data } });
  return <section className="worker-shop-trousers" aria-label={t('workers.work.shopTrousers.details')}>
    <div className="work-field"><label htmlFor="worker-work-trouserType">{t('workers.work.trousers.typeLabel')}</label><select {...props('trouserType')} data-shop-trouser-type value={value.trouserType} onChange={event => onChange({ trouserType: event.target.value })} disabled={disabled} required>{TROUSER_TYPES.map(type => <option key={type} value={type}>{t(`workers.work.trousers.styles.${type}`)}</option>)}</select>{errorFor('trouserType')}</div>
    <div className="work-field"><div className="worker-shop-fabric-label"><label htmlFor="worker-work-shopTrouser.fabricId">{t('workers.work.materials.fabric')}</label><button type="button" data-refresh-trouser-fabrics onClick={() => setAttempt(n => n + 1)} className="work-text-button" disabled={disabled || state.loading}><IoRefreshOutline aria-hidden="true" />{t('workers.work.materials.refresh')}</button></div><select {...props('shopTrouser.fabricId')} data-shop-trouser-fabric value={value.shopTrouser?.fabricId || ''} onChange={event => patch({ fabricId: event.target.value })} disabled={disabled || state.loading || state.error} required><option value="">{t(state.loading ? 'common.loading' : 'workers.work.materials.chooseFabric')}</option>{state.fabrics.map(fabric => <option key={fabric._id} value={fabric._id}>{fabric.type}{fabric.reference ? ` · ${fabric.reference}` : ''}</option>)}</select>{errorFor('shopTrouser.fabricId')}{state.error && <p role="alert" className="work-field-error">{t('workers.work.errors.loadMaterialsFailed')}</p>}{!state.loading && !state.error && !state.fabrics.length && <p className="work-field-hint">{t('workers.work.shopTrousers.noFabrics')}</p>}</div>
    <div className="work-field"><label htmlFor="worker-work-shopTrouser.size">{t('workers.work.pieceCards.size')}</label><select {...props('shopTrouser.size')} data-shop-trouser-size dir="ltr" value={value.shopTrouser?.size || ''} onChange={event => patch({ size: event.target.value })} disabled={disabled} required><option value="">{t('workers.work.pieceCards.chooseSize')}</option>{WORKER_GARMENT_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select>{errorFor('shopTrouser.size')}</div>
    {errorFor('shopTrouser')}
  </section>;
}
