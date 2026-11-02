import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoAddCircleOutline, IoCloseOutline, IoTrashOutline } from 'react-icons/io5';
import { validateWorkerIncrease, workQuantityUnits } from '../../../shared/workerWork.js';
import { SFIFA_STOCK_SCALE, formatSfifaCode } from '../../../shared/sfifaStock.js';
import { deleteWorkerWork, increaseWorkerWork } from './workersApi.js';
import WorkerOrderPicker from './WorkerOrderPicker.jsx';
import WorkerBlockingNotice from './WorkerBlockingNotice.jsx';

export default function WorkerWorkActionDialog({ token, worker, work, mode, onClose, onSaved, onReload }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), savingRef = useRef(false), submissionRef = useRef(null);
  const deleting = mode === 'delete', isSfifa = work.category === 'sfifa';
  const linked = Boolean(work.tailoring) && !isSfifa;
  const [data, setData] = useState({ quantity: '', orderId: String(work.tailoring?.orderId || ''), lineIds: [] });
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [fields, setFields] = useState({}), [blockers, setBlockers] = useState([]);
  useEffect(() => {
    const dialog = dialogRef.current; dialog.showModal();
    dialog.querySelector(deleting ? '[data-cancel-work-action]' : linked ? '#worker-work-lineIds' : '#work-increase-quantity')?.focus();
    return () => dialog.close();
  }, [deleting, linked]);
  const close = () => { if (!savingRef.current) { dialogRef.current.close(); onClose(); } };
  const patch = input => { setData(current => ({ ...current, ...input })); setError(''); setFields({}); setBlockers([]); };
  let increase;
  try { increase = validateWorkerIncrease(data, work); } catch { /* The form displays field validation on submit. */ }
  const number = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { maximumFractionDigits: 3 }).format(value);
  const amount = value => <><bdi>{number(value)}</bdi>{isSfifa && <small className="work-unit"> {t('sfifaStock.unit')}</small>}</>;
  const next = increase ? (workQuantityUnits(work.remainingQuantity, work.category) + workQuantityUnits(increase.quantity, work.category)) / (isSfifa ? SFIFA_STOCK_SCALE : 1) : work.remainingQuantity;
  const submit = async event => {
    event.preventDefault(); if (savingRef.current) return;
    let input;
    if (!deleting) {
      try { input = validateWorkerIncrease(data, work); }
      catch (failure) { setFields(failure.fields || {}); setError('invalidWork'); return; }
      const fingerprint = JSON.stringify(input);
      if (submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, requestId: crypto.randomUUID() };
    }
    savingRef.current = true; setSaving(true); setError(''); setFields({}); setBlockers([]);
    try {
      const result = deleting ? await deleteWorkerWork(token, worker._id, work) : await increaseWorkerWork(token, worker._id, work, input, submissionRef.current.requestId);
      if (dialogRef.current?.open) { dialogRef.current.close(); onSaved(result); }
    } catch (failure) {
      if (dialogRef.current?.open) {
        const code = failure.response?.data?.message;
        setError(['invalidWork', 'invalidRequest', 'workRequestConflict', 'workerSectionChanged', 'workNotFound', 'workConflict', 'workDeleted', 'forbidden', 'notFound', 'orderNotFound', 'orderAlreadyDelivered', 'orderGarmentsChanged', 'garmentAlreadyAssigned', 'garmentInProgress'].includes(code) ? code : 'saveWorkFailed');
        setFields(failure.response?.data?.fields || {}); setBlockers(failure.response?.data?.blockers || []);
      }
    } finally { savingRef.current = false; if (dialogRef.current?.open) setSaving(false); }
  };
  return <dialog ref={dialogRef} dir={i18n.dir()} className="work-dialog" aria-labelledby="work-action-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="work-dialog-header"><span className="work-dialog-icon" aria-hidden="true">{deleting ? <IoTrashOutline /> : <IoAddCircleOutline />}</span><div><p className="work-eyebrow">{worker.name} · {t(`workers.categories.${work.category}`)}</p><h2 id="work-action-title">{t(deleting ? 'workers.work.remove' : 'workers.work.increase')}</h2></div><button type="button" disabled={saving} onClick={close} className="work-close" aria-label={t('dialog.close')}><IoCloseOutline /></button></header>
    <form noValidate onSubmit={submit}><div className="work-dialog-body">
      <p className="work-completion-identity">{isSfifa ? <>{t(`sfifaStock.widths.${work.sfifa.width}`)} · <bdi dir="ltr">{formatSfifaCode(work.sfifa.code, work.sfifa.family)}</bdi></> : work.productName}</p>
      {deleting ? <><p className="work-action-delete-copy">{t('workers.work.deleteConfirm')}</p>{isSfifa && work.completedQuantity > 0 && <p className="work-field-hint">{t('workers.work.deleteSfifaHint')}</p>}</> : <>
        <fieldset disabled={saving} className="work-form-fields">
          {linked ? <WorkerOrderPicker token={token} workerId={worker._id} category={work.category} garmentType={work.tailoring?.garmentType} trouserType={work.category === "trousers" ? work.trouserType : undefined} orderId={data.orderId} lineIds={data.lineIds} onChange={patch} disabled={saving} fields={fields} fixedOrder /> : <div className="work-field"><label htmlFor="work-increase-quantity">{t(isSfifa ? 'workers.work.increaseMeters' : 'workers.work.increaseQuantity')}</label><input id="work-increase-quantity" className="work-input work-number-input" type="text" dir="ltr" inputMode={isSfifa ? 'decimal' : 'numeric'} value={data.quantity} onChange={event => patch({ quantity: event.target.value })} maxLength={isSfifa ? 11 : 7} required aria-invalid={Boolean(fields.quantity)} aria-describedby={fields.quantity ? 'work-increase-error' : undefined} />{fields.quantity && <p id="work-increase-error" className="work-field-error">{t(`workers.work.errors.${fields.quantity}`)}</p>}</div>}
        </fieldset>
        <dl className="work-completion-preview work-increase-preview"><div className="work-tone-blue"><dt>{t('workers.work.design.remainingBefore')}</dt><dd>{amount(work.remainingQuantity)}</dd></div><div className="work-tone-green"><dt>{t('workers.work.remainingAfterIncrease')}</dt><dd data-work-increase-preview data-value={next}>{amount(next)}</dd></div></dl>
      </>}
      {error && <div role="alert" className="work-feedback work-feedback-error"><p>{t(`workers.work.errors.${error}`)}</p>{error === 'garmentInProgress' && <WorkerBlockingNotice blockers={blockers} />}{['workConflict', 'workDeleted', 'workNotFound', 'workerSectionChanged', 'garmentAlreadyAssigned', 'garmentInProgress', 'orderNotFound', 'orderAlreadyDelivered', 'orderGarmentsChanged'].includes(error) && <button type="button" disabled={saving} onClick={onReload} className="work-text-button">{t('workers.work.reload')}</button>}</div>}
    </div><footer className="work-dialog-footer"><button data-cancel-work-action type="button" disabled={saving} className="work-button work-button-quiet" onClick={close}>{t('common.cancel')}</button><button type="submit" disabled={saving} className={`work-button ${deleting ? 'work-button-red' : 'work-button-blue'}`}>{t(saving ? 'common.loading' : deleting ? 'workers.work.confirmDelete' : 'workers.work.saveIncrease')}</button></footer></form>
  </dialog>;
}
