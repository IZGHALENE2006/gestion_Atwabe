import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCheckmarkCircleOutline, IoSearchOutline } from 'react-icons/io5';
import { tailoringGarmentType } from '../../../shared/tailoring.js';
import { WORKER_CLIENT_BATCH_LIMIT, workerBatchLocked } from '../../../shared/workerClientBatch.js';
import { loadWorkerOrderOptions } from './workersApi.js';
import WorkerBlockingNotice from './WorkerBlockingNotice.jsx';
import './workerClientBatch.css';

export default function WorkerOrdersPicker({ token, workerId, category, garmentType, trouserType, selections, onChange, disabled, fields, outcomes }) {
  const { t } = useTranslation(), p = key => t('workerClientBatch.' + key);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0), [search, setSearch] = useState('');
  const scope = JSON.stringify([token, workerId, category, garmentType, attempt]);
  const state = result?.scope === scope ? result : { loading: true, orders: [] };
  useEffect(() => {
    const controller = new AbortController();
    loadWorkerOrderOptions(token, workerId, category, controller.signal, garmentType).then(data => {
      if (!Array.isArray(data.orders)) throw new Error('Invalid order choices');
      if (!controller.signal.aborted) setResult({ scope, orders: data.orders, loading: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ scope, orders: [], error: true, loading: false }); });
    return () => controller.abort();
  }, [token, workerId, category, garmentType, scope]);
  const orders = state.orders.map(order => ({ ...order, items: order.items.filter(item => !trouserType || item.trouserType === trouserType) })).filter(order => order.items.length);
  const query = search.trim().normalize('NFKC').toLocaleLowerCase();
  const visible = orders.filter(order => [order.clientName, order.phone, order.barcode].some(value => String(value || '').normalize('NFKC').toLocaleLowerCase().includes(query)));
  const selectedById = new Map(selections.map(row => [row.orderId, row]));
  const update = (id, patch) => onChange(selections.map(row => row.orderId === id ? { ...row, ...patch } : row));
  const toggle = order => {
    if (workerBatchLocked(outcomes[order._id])) return;
    onChange(selectedById.has(order._id) ? selections.filter(row => row.orderId !== order._id) : selections.length >= WORKER_CLIENT_BATCH_LIMIT ? selections : [...selections, { orderId: order._id, lineIds: order.items.filter(item => item.available).map(item => item.lineId), unitWage: '', quantity: '' }]);
  };
  const selectAll = () => {
    const added = visible.filter(order => !selectedById.has(order._id) && order.items.some(item => item.available));
    onChange([...selections, ...added.slice(0, WORKER_CLIENT_BATCH_LIMIT - selections.length).map(order => ({ orderId: order._id, lineIds: order.items.filter(item => item.available).map(item => item.lineId), unitWage: '', quantity: '' }))]);
  };
  const error = (index, key) => fields[`orderSelections.${index}.${key}`];
  return <section className="worker-orders-picker" id="worker-work-orderSelections" tabIndex={-1} aria-label={p('title')} data-worker-orders-picker>
    <header><h3>{p('title')}</h3><p>{p('hint')}</p></header>
    {['finishing', 'mesbanto'].includes(category) && <p className="work-field-hint" data-client-stage-hint={category}>{t('workers.work.' + (category === 'finishing' ? 'finishingStageHint' : 'laundryStageHint'))}</p>}
    <label className="worker-orders-search"><IoSearchOutline aria-hidden="true" /><span className="sr-only">{p('search')}</span><input type="search" data-worker-orders-search value={search} onChange={event => setSearch(event.target.value)} placeholder={p('search')} disabled={disabled} /></label>
    <div className="worker-orders-toolbar"><strong data-worker-orders-count>{t('workerClientBatch.selected', { orders: selections.length, pieces: selections.reduce((sum, row) => sum + row.lineIds.length, 0) })}</strong><div><button type="button" data-worker-orders-select-all onClick={selectAll} disabled={disabled || state.loading || state.error}>{p('selectAll')}</button><button type="button" data-worker-orders-clear onClick={() => onChange(selections.filter(row => workerBatchLocked(outcomes[row.orderId])))} disabled={disabled}>{p('clear')}</button></div></div>
    {fields.orderSelections && <p className="work-field-error" role="alert">{p('chooseOrders')}</p>}
    {state.loading ? <p role="status">{t('common.loading')}</p> : state.error ? <p className="work-field-error" role="alert">{t('workers.work.errors.loadOrdersFailed')} <button type="button" disabled={disabled} className="work-text-button" onClick={() => setAttempt(value => value + 1)}>{t('workers.retry')}</button></p> : <div className="worker-orders-list">{visible.map(order => {
      const selection = selectedById.get(order._id), index = selections.findIndex(row => row.orderId === order._id), outcome = outcomes[order._id], locked = workerBatchLocked(outcome), available = order.items.filter(item => item.available), type = tailoringGarmentType(order);
      return <article key={order._id} data-worker-order-choice={order._id} className={'worker-order-choice' + (selection ? ' is-selected' : '') + (outcome?.status === 'saved' ? ' is-saved' : '')}>
        <label className="worker-order-choice-heading"><input type="checkbox" data-select-worker-order={order._id} aria-label={t('workerClientBatch.selectOrder', { name: order.clientName })} checked={Boolean(selection)} disabled={disabled || locked || !available.length && !selection || !selection && selections.length >= WORKER_CLIENT_BATCH_LIMIT} onChange={() => toggle(order)} /><span><strong dir="auto">{order.clientName}</strong><small><bdi dir="ltr">{order.barcode}</bdi> · {t('fesla.garmentTypes.' + type)}</small>{order.phone && <small dir="ltr">{order.phone}</small>}</span>{outcome?.status === 'saved' ? <span className="worker-order-saved"><IoCheckmarkCircleOutline />{p('saved')}</span> : <b>{t('workerClientBatch.available', { count: available.length })}</b>}</label>
        {!selection && !available.length && <div className="worker-order-blocked">{order.items.map(item => item.blockedBy?.length ? <WorkerBlockingNotice key={item.lineId} blockers={item.blockedBy} /> : <p key={item.lineId} className="work-field-hint">{t('workers.work.alreadyAssigned')}</p>)}</div>}
        {selection && <div className="worker-order-choice-body"><fieldset className="worker-garment-choices" disabled={disabled || locked}><legend>{t('workers.work.chooseGarments')}</legend>{order.items.map(item => <label key={item.lineId} className={!item.available ? 'is-unavailable' : ''}><input type="checkbox" data-worker-order-piece={item.lineId} checked={selection.lineIds.includes(item.lineId)} disabled={!item.available} onChange={event => update(order._id, { lineIds: event.target.checked ? [...selection.lineIds, item.lineId] : selection.lineIds.filter(id => id !== item.lineId) })} /><span><strong>{t(type === 'djellaba' ? 'fesla.garmentNumber' : 'fesla.' + type + '.garmentNumber', { number: item.number })} · <bdi>{item.fabricType}{item.fabricColor ? ' · ' + item.fabricColor : ''}</bdi></strong>{item.sfifa?.width && <small>{t('fesla.widths.' + item.sfifa.width)} · {t('fesla.styles.' + item.sfifa.style)}</small>}{item.trouserType && <small>{t('fesla.trouserTypes.' + item.trouserType)}</small>}{item.shirtType && <small>{item.shirtType}</small>}{item.blockedBy?.length > 0 && <WorkerBlockingNotice blockers={item.blockedBy} />}</span></label>)}</fieldset>
          {(error(index, 'lineIds') || error(index, 'orderId')) && <p role="alert" className="work-field-error">{t('workers.work.errors.' + (error(index, 'lineIds') || error(index, 'orderId')))}</p>}
          <div className="worker-order-inputs">{category === 'sfifa' && <label>{p('meters')}<input className="work-input" data-worker-order-meters inputMode="decimal" dir="ltr" value={locked ? outcome.input.quantity : selection.quantity} disabled={disabled || locked} onChange={event => update(order._id, { quantity: event.target.value })} placeholder={p('metersHint')} />{error(index, 'quantity') && <small className="work-field-error">{t('workers.work.errors.' + error(index, 'quantity'))}</small>}</label>}<label>{p(category === 'sfifa' ? 'sfifaWage' : 'wage')}<input className="work-input" data-worker-order-wage inputMode="decimal" dir="ltr" maxLength={13} value={locked ? outcome.input.unitWage : selection.unitWage} disabled={disabled || locked} onChange={event => update(order._id, { unitWage: event.target.value })} placeholder={p('overrideHint')} />{error(index, 'unitWage') && <small className="work-field-error">{t('workers.work.errors.' + error(index, 'unitWage'))}</small>}</label></div>
          {Object.entries(fields).filter(([key]) => key.startsWith(`orderSelections.${index}.`) && !['quantity', 'unitWage', 'lineIds', 'orderId'].includes(key.split('.').at(-1))).map(([key, code]) => <p className="work-field-error" key={key}>{t('workers.work.errors.' + code, { defaultValue: t('workers.work.errors.invalidWork') })}</p>)}
          {outcome?.status === 'saving' && <p role="status">{p('saving')}</p>}{outcome?.status === 'uncertain' && <p className="work-field-error" role="alert">{p('uncertain')}</p>}{outcome?.status === 'failed' && <div className="work-field-error" role="alert"><p>{t('workers.work.errors.' + outcome.code, { defaultValue: t('workers.work.errors.saveWorkFailed') })}</p>{outcome.blockers?.length > 0 && <WorkerBlockingNotice blockers={outcome.blockers} />}</div>}
        </div>}
      </article>;
    })}{!visible.length && <p className="work-field-hint">{p('empty')}</p>}</div>}
    {category === 'sfifa' && <p className="work-field-hint">{p('sfifaHint')}</p>}{selections.length >= WORKER_CLIENT_BATCH_LIMIT && <p className="work-field-hint">{t('workerClientBatch.limit', { count: WORKER_CLIENT_BATCH_LIMIT })}</p>}
  </section>;
}
