import { shopPieceBarcode, shopPieceNumber } from '../../../shared/workerShopFlow.js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoRefreshOutline, IoSearchOutline } from 'react-icons/io5';
import { loadWorkerShopOptions } from './workersApi.js';
import WorkerShopFlowInfo from './WorkerShopFlowInfo.jsx';
import { formatSfifaCode } from '../../../shared/sfifaStock.js';
export default function WorkerShopWorkPicker({ token, workerId, category, garmentType, value, onChange, disabled, error }) {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0), [query, setQuery] = useState('');
  const scope = [token, workerId, category, garmentType, attempt].join(':');
  const state = result?.scope === scope ? result : { loading: true, works: [], error: false };
  useEffect(() => {
    const controller = new AbortController();
    loadWorkerShopOptions(token, workerId, category, garmentType, controller.signal).then(data => {
      if (!Array.isArray(data.works)) throw new Error('Invalid shop works');
      if (!controller.signal.aborted) setResult({ scope, works: data.works, loading: false, error: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ scope, works: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [token, workerId, category, garmentType, scope]);
  const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase();
  const selected = state.works.find(work => work._id === value), visible = state.works.filter(work => work._id === value || normalize([work.productName, work.workerName, work.barcode].join(' ')).includes(normalize(query.trim())) || shopPieceNumber(work, query) !== null);
  const matchedPiece = selected ? shopPieceNumber(selected, query) : null;
  const number = value => Number(value).toLocaleString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { maximumFractionDigits: 3 });
  function search(text) {
    setQuery(text);
    const exact = state.works.find(work => normalize(work.barcode) === normalize(text.trim()) || shopPieceNumber(work, text) !== null);
    if (exact?.available) onChange({ shopOriginId: exact._id });
    else if (value) onChange({ shopOriginId: '' });
  }
  return <section className="shop-work-picker" data-shop-work-picker>
    <div className="shop-picker-heading"><h3>{t('workers.shopFlow.chooseWork')}</h3><button type="button" onClick={() => { onChange({ shopOriginId: '' }); setAttempt(value => value + 1); }} disabled={disabled || state.loading} className="work-text-button"><IoRefreshOutline aria-hidden="true" />{t('workers.shopFlow.refresh')}</button></div>
    <p className="work-field-hint">{t('workers.shopFlow.selectionHint')}</p>
    {state.loading ? <p role="status">{t('common.loading')}</p> : state.error ? <p role="alert" className="work-field-error">{t('workers.shopFlow.loadFailed')}</p> : <>
      <label htmlFor="shop-work-search">{t('workers.shopFlow.search')}</label><div className="shop-picker-search"><IoSearchOutline aria-hidden="true" /><input id="shop-work-search" type="search" className="work-input" value={query} onChange={event => search(event.target.value)} disabled={disabled} /></div>
      <div className="work-field"><label htmlFor="worker-work-shopOriginId">{t('workers.shopFlow.machineWork')}</label><select id="worker-work-shopOriginId" className="work-input" value={value} onChange={event => onChange({ shopOriginId: event.target.value })} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? 'worker-work-shopOriginId-error' : undefined} required>
        <option value="">{t('workers.shopFlow.chooseWork')}</option>{visible.map(work => <option key={work._id} value={work._id} disabled={!work.available}>{[work.barcode, work.workerName, t('workers.shopFlow.pieceCount', { count: work.quantity }), work.available ? '' : t('workers.work.errors.' + work.reason)].filter(Boolean).join(' · ')}</option>)}
      </select>{error && <p id="worker-work-shopOriginId-error" role="alert" className="work-field-error">{t('workers.work.errors.' + error)}</p>}</div>
      {!visible.length && <p className="work-field-hint">{t('workers.shopFlow.empty')}</p>}
      {visible.some(work => !work.available) && <ul className="shop-unavailable-works" aria-label={t('workers.shopFlow.unavailable')}>{visible.filter(work => !work.available).map(work => <li key={work._id}><bdi dir="ltr">{work.barcode}</bdi><span>{work.workerName}</span><strong>{t('workers.work.errors.' + work.reason)}</strong></li>)}</ul>}
      {selected && <div className="shop-work-selection" data-shop-work-selected><div className="shop-selection-title"><h4>{t('fesla.garmentTypes.' + selected.garmentType)}</h4><bdi dir="ltr">{selected.barcode}</bdi></div><p>{t('workers.shopFlow.pieceCount', { count: selected.quantity })} · {selected.workerName}</p><WorkerShopFlowInfo flow={selected.flow} />
        {matchedPiece !== null && <p role="status" className="shop-matched-piece">{t('workers.shopFlow.matchedPiece', { number: matchedPiece })}</p>}{selected.materials.length > 0 && <ul className="shop-selected-pieces">{selected.materials.map((row, index) => <li key={row.lineId} data-shop-selected-piece data-matched-piece={matchedPiece === index + 1 ? "true" : undefined}><strong>{t('workers.work.pieceCards.pieceNumber', { number: index + 1 })}</strong><bdi dir="ltr" className="shop-piece-barcode" data-selected-piece-barcode>{shopPieceBarcode(selected, index + 1)}</bdi><p dir="auto">{row.fabricType} · {row.fabricColor}{row.fabricReference ? ' · ' + row.fabricReference : ''}</p><span>{t('workers.work.materials.meters')}: {number(row.meters)} {t('sfifaStock.unit')}</span>{row.size && <span>{t('workers.work.pieceCards.size')}: <bdi dir="ltr">{row.size}</bdi></span>}<span>{t('workers.work.materials.sfifa')}: {t('sfifaStock.widths.' + row.sfifaWidth)} · {row.sfifaCode === undefined ? t('workers.work.materials.unassigned') : formatSfifaCode(row.sfifaCode, row.sfifaFamily)} · {number(row.sfifaMeters)} {t('sfifaStock.unit')}</span>{row.sfifaStyle && <span data-shop-sfifa-style={row.sfifaStyle}>{t('workers.work.materials.sfifaStyle')}: {t('sfifaStock.meterTypes.' + row.sfifaStyle)}</span>}</li>)}</ul>}
      </div>}
    </>}
  </section>;
}
