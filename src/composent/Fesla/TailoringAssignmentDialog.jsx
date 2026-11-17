import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline, IoGitBranchOutline, IoPersonOutline } from 'react-icons/io5';
import { WORKER_CATEGORIES, workerCategories } from '../../../shared/workers.js';
import { workerOrderGarmentTypes } from '../../../shared/workerWork.js';
import { tailoringGarmentType } from '../../../shared/tailoring.js';
import { tailoringOrderBarcode } from '../../../shared/tailoringBarcode.js';
import { loadOrderAssignmentWorkers } from './tailoringAssignmentsApi.js';
import WorkerWorkForm from '../Khadama/WorkerWorkForm.jsx';
import '../Khadama/workerWork.css';
import './tailoringAssignments.css';

export default function TailoringAssignmentDialog({ order, token, onClose, onSaved }) {
  const { t, i18n } = useTranslation(), dialog = useRef(null), busyRef = useRef(false);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const [category, setCategory] = useState(''), [workerId, setWorkerId] = useState(''), [busy, setBusy] = useState(false);
  const scope = `${token}:${order._id}:${attempt}`;
  const state = result?.scope === scope ? result : { workers: [], loading: true };
  const garmentType = tailoringGarmentType(order);
  const categories = WORKER_CATEGORIES.filter(value => workerOrderGarmentTypes(value).includes(garmentType));
  const workers = state.workers.filter(worker => !worker.deletedAt && workerCategories(worker).includes(category));
  const worker = workers.find(value => value._id === workerId);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadOrderAssignmentWorkers(token, order._id, controller.signal).then(data => {
      if (!Array.isArray(data.workers)) throw new Error('Invalid assignment workers');
      if (!controller.signal.aborted) setResult({ workers: data.workers, scope, loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ workers: [], scope, loading: false, error: error.response?.data?.message || 'loadOrderAssignmentFailed' });
    });
    return () => controller.abort();
  }, [token, order._id, scope]);
  const close = () => { if (!busyRef.current) { dialog.current.close(); onClose(); } };
  const changeBusy = value => { busyRef.current = value; setBusy(value); };
  const reload = () => { if (!busyRef.current) { setWorkerId(''); setAttempt(value => value + 1); } };
  const errorText = key => t(['workers.work.errors.' + key, 'fesla.assignment.loadFailed']);
  return <dialog ref={dialog} className="tailoring-assignment-dialog" dir={i18n.dir()} aria-labelledby="tailoring-assignment-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="tailoring-assignment-header"><div><span className="tailoring-assignment-eyebrow"><IoGitBranchOutline size={19} aria-hidden="true" />{t('fesla.assignment.eyebrow')}</span><h2 id="tailoring-assignment-title">{t('fesla.assignment.title')}</h2><p>{t('fesla.assignment.hint')}</p></div><button type="button" data-close-tailoring-assignment disabled={busy} onClick={close} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <div className="tailoring-assignment-body">
      <div className="tailoring-assignment-order"><div><strong dir="auto">{order.clientName}</strong><small>{t('fesla.garmentTypes.' + garmentType)} · <bdi dir="ltr">{order.phone}</bdi></small></div><bdi dir="ltr">{tailoringOrderBarcode(order)}</bdi></div>
      {state.loading ? <p role="status" className="tailoring-assignment-feedback">{t('common.loading')}</p> : state.error ? <div role="alert" className="tailoring-assignment-feedback is-error"><p>{errorText(state.error)}</p><button type="button" data-retry-order-assignment onClick={reload}>{t('fesla.retry')}</button></div> : <>
        <div className="tailoring-assignment-selectors">
          <label htmlFor="tailoring-assignment-category">{t('fesla.assignment.section')}<select id="tailoring-assignment-category" value={category} disabled={busy} onChange={event => { setCategory(event.target.value); setWorkerId(''); }}><option value="">{t('fesla.assignment.chooseSection')}</option>{categories.map(value => <option key={value} value={value}>{t('workers.categories.' + value)} ({state.workers.filter(worker => workerCategories(worker).includes(value)).length})</option>)}</select></label>
          <label htmlFor="tailoring-assignment-worker">{t('fesla.assignment.worker')}<select id="tailoring-assignment-worker" value={workerId} disabled={busy || !category || !workers.length} onChange={event => setWorkerId(event.target.value)}><option value="">{t('fesla.assignment.chooseWorker')}</option>{workers.map(worker => <option key={worker._id} value={worker._id}>{worker.name}{worker.phone ? ' · ' + worker.phone : ''}</option>)}</select></label>
        </div>
        {category && !workers.length && <p role="status" className="tailoring-assignment-feedback">{t('fesla.assignment.noWorkers')}</p>}
        {worker ? <WorkerWorkForm key={scope + ':' + category + ':' + workerId} embedded fixedOrder={order} token={token} worker={worker} category={category} garmentType={garmentType} workType="client" onBusyChange={changeBusy} onClose={close} onReload={reload} onSaved={work => onSaved(work, worker)} /> : <p className="tailoring-assignment-placeholder"><IoPersonOutline size={30} aria-hidden="true" /><span>{t('fesla.assignment.chooseHint')}</span></p>}
      </>}
    </div>
    {!worker && <footer className="tailoring-assignment-footer"><button type="button" onClick={close}>{t('dialog.close')}</button></footer>}
  </dialog>;
}
