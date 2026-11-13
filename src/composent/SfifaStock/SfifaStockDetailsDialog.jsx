import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline, IoLayersOutline, IoRefreshOutline } from 'react-icons/io5';
import { SFIFA_METER_TYPES, formatSfifaCode } from '../../../shared/sfifaStock.js';
import { loadSfifaDetails } from './sfifaStockApi.js';

export default function SfifaStockDetailsDialog({ stock, token, onClose }) {
  const { t, i18n } = useTranslation(), dialogRef = useRef(null);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const scope = `${token}:${stock._id}:${attempt}`;
  const state = result?.scope === scope ? result : { loading: true };
  const number = value => Number(value).toLocaleString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { maximumFractionDigits: 3 });
  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadSfifaDetails(stock, token, controller.signal).then(data => {
      if (!data.item?.styleMeters || !Number.isFinite(data.item.quantity)) throw new Error('Invalid sfifa details');
      if (!controller.signal.aborted) setResult({ ...data, scope, loading: false });
    }).catch(error => { if (!controller.signal.aborted) setResult({ scope, loading: false, error: error.response?.status === 403 ? 'forbidden' : error.response?.status === 404 ? 'notFound' : 'loadDetailsFailed' }); });
    return () => controller.abort();
  }, [stock, token, scope]);
  const item = state.item;
  return <dialog ref={dialogRef} className="sfifa-dialog sfifa-details-dialog" dir={i18n.dir()} aria-labelledby="sfifa-details-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><h2 id="sfifa-details-title"><IoLayersOutline aria-hidden="true" />{t('sfifaStock.detailsTitle')}</h2><p>{t('sfifaStock.widths.' + stock.width)} · <bdi dir="ltr">{stock.family}</bdi> · {stock.isUnassigned ? t('sfifaStock.unassigned') : <bdi dir="ltr">{formatSfifaCode(stock.code, stock.family)}</bdi>}</p></div><button type="button" data-close-sfifa-details onClick={onClose} aria-label={t('dialog.close')} autoFocus><IoCloseOutline size={24} /></button></header>
    <div className="sfifa-details-body">
      {state.loading ? <p role="status">{t('common.loading')}</p> : state.error ? <div role="alert" className="sfifa-dialog-error"><p>{t('sfifaStock.errors.' + state.error)}</p><button type="button" data-retry-sfifa-details onClick={() => setAttempt(value => value + 1)}>{t('sfifaStock.retry')}</button></div> : <>
        <dl className="sfifa-details-total"><dt>{t('sfifaStock.remainingTotal')}</dt><dd data-sfifa-details-total data-value={item.quantity}><bdi>{number(item.quantity)}</bdi><small>{t('sfifaStock.unit')}</small></dd></dl>
        <p className="sfifa-details-hint">{t('sfifaStock.remainingTypesHint')}</p>
        <dl className="sfifa-details-types">{SFIFA_METER_TYPES.map(key => <div key={key} className={'is-' + key}><dt>{t('sfifaStock.meterTypes.' + key)}</dt><dd data-sfifa-type-remaining={key} data-value={item.styleMeters[key]}><bdi>{number(item.styleMeters[key])}</bdi><small>{t('sfifaStock.unit')}</small></dd></div>)}</dl>
        {item.unclassifiedMeters > 0 && <div className="sfifa-details-unclassified"><p>{t('sfifaStock.unclassifiedMeters')}: <strong data-sfifa-unclassified data-value={item.unclassifiedMeters}>{number(item.unclassifiedMeters)} {t('sfifaStock.unit')}</strong></p><p>{t('sfifaStock.unclassifiedHint')}</p></div>}
        <p className="sfifa-details-hint">{t('sfifaStock.remainingRules')}</p>
      </>}
    </div>
    <footer><button type="button" disabled={state.loading} onClick={() => setAttempt(value => value + 1)}><IoRefreshOutline aria-hidden="true" />{t('sfifaStock.reload')}</button><button type="button" className="is-blue" onClick={onClose}>{t('dialog.close')}</button></footer>
  </dialog>;
}
