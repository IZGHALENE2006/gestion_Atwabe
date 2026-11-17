import { shopPieceBarcode, shopPieceNumber } from '../../../shared/workerShopFlow.js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoRefreshOutline, IoSearchOutline } from 'react-icons/io5';
import { loadWorkerShopOptions } from './workersApi.js';
import WorkerShopFlowInfo from './WorkerShopFlowInfo.jsx';

export default function WorkerShopWorkPicker({ token, workerId, category, garmentType, value, lineIds = [], onChange, disabled, error, pieceError }) {
  const { t } = useTranslation();
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
  const available = selected?.pieces?.filter(piece => piece.available) || [];
  const choose = (work, pieceNumber = null) => onChange({ shopOriginId: work?._id || '', lineIds: work?.pieces ? work.pieces.filter(piece => piece.available && (pieceNumber === null || piece.pieceNumber === pieceNumber)).map(piece => piece.lineId) : undefined });
  function search(text) {
    setQuery(text);
    const exact = state.works.find(work => normalize(work.barcode) === normalize(text.trim()) || shopPieceNumber(work, text) !== null);
    if (exact?.available) choose(exact, shopPieceNumber(exact, text));
    else if (value) onChange({ shopOriginId: '', lineIds: [] });
  }
  return <section className="shop-work-picker" data-shop-work-picker>
    <div className="shop-picker-heading"><h3>{t('workers.shopFlow.chooseWork')}</h3><button type="button" onClick={() => { onChange({ shopOriginId: '', lineIds: [] }); setAttempt(value => value + 1); }} disabled={disabled || state.loading} className="work-text-button"><IoRefreshOutline aria-hidden="true" />{t('workers.shopFlow.refresh')}</button></div>
    <p className="work-field-hint">{t('workers.shopFlow.selectionHint')}</p>
    {state.loading ? <p role="status">{t('common.loading')}</p> : state.error ? <p role="alert" className="work-field-error">{t('workers.shopFlow.loadFailed')}</p> : <>
      <label htmlFor="shop-work-search">{t('workers.shopFlow.search')}</label><div className="shop-picker-search"><IoSearchOutline aria-hidden="true" /><input id="shop-work-search" type="search" className="work-input" value={query} onChange={event => search(event.target.value)} disabled={disabled} /></div>
      <div className="work-field"><label htmlFor="worker-work-shopOriginId">{t('workers.shopFlow.machineWork')}</label><select id="worker-work-shopOriginId" className="work-input" value={value} onChange={event => choose(state.works.find(work => work._id === event.target.value))} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? 'worker-work-shopOriginId-error' : undefined} required>
        <option value="">{t('workers.shopFlow.chooseWork')}</option>{visible.map(work => <option key={work._id} value={work._id} disabled={!work.available}>{[work.barcode, work.workerName, t('workers.shopFlow.pieceCount', { count: work.quantity }), work.pieces ? t('workers.shopFlow.readyCount', { count: work.availableQuantity }) : '', work.available ? '' : t('workers.work.errors.' + work.reason)].filter(Boolean).join(' · ')}</option>)}
      </select>{error && <p id="worker-work-shopOriginId-error" role="alert" className="work-field-error">{t('workers.work.errors.' + error)}</p>}</div>
      {!visible.length && <p className="work-field-hint">{t('workers.shopFlow.empty')}</p>}
      {visible.some(work => !work.available) && <ul className="shop-unavailable-works" aria-label={t('workers.shopFlow.unavailable')}>{visible.filter(work => !work.available).map(work => <li key={work._id}><bdi dir="ltr">{work.barcode}</bdi><span>{work.workerName}</span><strong>{t('workers.work.errors.' + work.reason)}</strong></li>)}</ul>}
      {selected && <div className="shop-work-selection" data-shop-work-selected><div className="shop-selection-title"><h4>{t('fesla.garmentTypes.' + selected.garmentType)}</h4><bdi dir="ltr">{selected.barcode}</bdi></div><p>{t('workers.shopFlow.pieceCount', { count: selected.quantity })} · {selected.workerName}</p><WorkerShopFlowInfo flow={selected.flow} />
        {matchedPiece !== null && <p role="status" className="shop-matched-piece">{t('workers.shopFlow.matchedPiece', { number: matchedPiece })}</p>}
        {selected.pieces && <fieldset id="worker-work-lineIds" tabIndex={-1} className="shop-transfer-pieces" aria-describedby={pieceError ? 'worker-work-lineIds-error' : undefined}>
          <legend>{t('workers.shopFlow.choosePieces')}</legend>
          <div className="worker-piece-completion-actions"><strong data-shop-transfer-count>{t('workers.shopFlow.selectedCount', { count: lineIds.length })}</strong><button type="button" className="work-text-button" data-select-ready-shop-pieces disabled={disabled} onClick={() => onChange({ lineIds: lineIds.length === available.length ? [] : available.map(piece => piece.lineId) })}>{t(lineIds.length === available.length ? 'workers.work.pieceCards.clearSelection' : 'workers.work.pieceCards.selectAll')}</button></div>
          <div className="shop-piece-table-scroll" tabIndex={0} role="region" aria-label={t('workers.shopFlow.choosePieces')}><table className="shop-piece-table" data-shop-transfer-table><thead><tr>{['selectPiece','pieceNumber','pieceBarcode','fabric','size','pieceStatus'].map(key => <th key={key} scope="col">{t('workers.shopFlow.' + key)}</th>)}</tr></thead><tbody>{selected.pieces.map(piece => {
            const row = selected.materials.find(row => row.lineId === piece.lineId);
            return <tr key={piece.lineId} data-shop-selected-piece data-matched-piece={matchedPiece === piece.pieceNumber ? 'true' : undefined} data-piece-ready={piece.available}><td><input type="checkbox" data-transfer-shop-piece={piece.lineId} aria-label={t('workers.work.pieceCards.pieceNumber', { number: piece.pieceNumber })} checked={lineIds.includes(piece.lineId)} disabled={disabled || !piece.available} onChange={event => onChange({ lineIds: event.target.checked ? [...lineIds, piece.lineId] : lineIds.filter(id => id !== piece.lineId) })} /></td><th scope="row">{piece.pieceNumber}</th><td><bdi dir="ltr" data-selected-piece-barcode>{shopPieceBarcode(selected, piece.pieceNumber)}</bdi></td><td dir="auto">{row?.fabricType}<small>{row?.fabricColor}</small></td><td><bdi>{row?.size || '—'}</bdi></td><td><span className={piece.available ? 'shop-piece-ready' : 'shop-piece-blocked'}>{t(piece.available ? 'workers.shopFlow.ready' : 'workers.work.errors.' + piece.reason)}</span></td></tr>;
          })}</tbody></table></div>
          {pieceError && <p id="worker-work-lineIds-error" className="work-field-error">{t('workers.work.errors.' + pieceError)}</p>}
        </fieldset>}
      </div>}
    </>}
  </section>;
}
