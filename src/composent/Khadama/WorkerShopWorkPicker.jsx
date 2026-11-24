import { shopPieceNumber } from '../../../shared/workerShopFlow.js';
import { WORKER_SHOP_BATCH_LIMIT } from '../../../shared/workerShopBatch.js';
import { workerBatchLocked } from '../../../shared/workerClientBatch.js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCheckmarkCircleOutline, IoRefreshOutline, IoSearchOutline } from 'react-icons/io5';
import { loadWorkerShopOptions } from './workersApi.js';
import WorkerShopFlowInfo from './WorkerShopFlowInfo.jsx';
import './workerClientBatch.css';

const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase();
export default function WorkerShopWorkPicker({ token, workerId, category, garmentType, selections, onChange, disabled, fields, outcomes }) {
  const { t } = useTranslation(), p = key => t('workerShopBatch.' + key);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0), [query, setQuery] = useState('');
  const scope = JSON.stringify([token, workerId, category, garmentType, attempt]);
  const state = result?.scope === scope ? result : { loading: true, works: [] };
  useEffect(() => {
    const controller = new AbortController();
    loadWorkerShopOptions(token, workerId, category, garmentType, controller.signal).then(data => {
      if (!Array.isArray(data.works)) throw new Error('Invalid shop works');
      if (!controller.signal.aborted) setResult({ scope, works: data.works, loading: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ scope, works: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [token, workerId, category, garmentType, scope]);
  const selectedById = new Map(selections.map(row => [row.shopOriginId, row]));
  const visible = state.works.filter(work => (work.available || selectedById.has(work._id)) && (normalize([work.productName, work.workerName, work.barcode].join(' ')).includes(normalize(query.trim())) || shopPieceNumber(work, query) !== null));
  const selectionFor = work => {
    const number = shopPieceNumber(work, query);
    return { shopOriginId: work._id, unitWage: '', ...(work.pieces ? { lineIds: work.pieces.filter(piece => piece.available && (number === null || piece.pieceNumber === number)).map(piece => piece.lineId) } : {}) };
  };
  const canChoose = work => work.available && (!work.pieces || selectionFor(work).lineIds.length > 0);
  const update = (id, patch) => onChange(selections.map(row => row.shopOriginId === id ? { ...row, ...patch } : row));
  const toggle = work => {
    if (workerBatchLocked(outcomes[work._id])) return;
    onChange(selectedById.has(work._id) ? selections.filter(row => row.shopOriginId !== work._id) : !canChoose(work) || selections.length >= WORKER_SHOP_BATCH_LIMIT ? selections : [...selections, selectionFor(work)]);
  };
  const selectAll = () => onChange([...selections, ...visible.filter(work => !selectedById.has(work._id) && canChoose(work)).slice(0, WORKER_SHOP_BATCH_LIMIT - selections.length).map(selectionFor)]);
  function search(text) {
    setQuery(text);
    const work = state.works.find(work => normalize(work.barcode) === normalize(text.trim()) || shopPieceNumber(work, text) !== null);
    if (!work?.available || workerBatchLocked(outcomes[work._id])) return;
    const number = shopPieceNumber(work, text), pieces = work.pieces?.filter(piece => piece.available && (number === null || piece.pieceNumber === number));
    if (pieces && !pieces.length) return;
    const row = selectedById.get(work._id);
    if (row && number !== null) update(work._id, { lineIds: [...new Set([...row.lineIds, ...pieces.map(piece => piece.lineId)])] });
    else if (!row && selections.length < WORKER_SHOP_BATCH_LIMIT) onChange([...selections, { shopOriginId: work._id, unitWage: '', ...(pieces ? { lineIds: pieces.map(piece => piece.lineId) } : {}) }]);
  }
  const selectedPieces = selections.reduce((sum, row) => sum + (row.lineIds?.length ?? state.works.find(work => work._id === row.shopOriginId)?.quantity ?? 0), 0);
  const locked = Object.values(outcomes).some(workerBatchLocked);
  const error = (index, key) => fields[`shopSelections.${index}.${key}`];
  return <section className="worker-orders-picker shop-work-picker" id="worker-work-shopSelections" tabIndex={-1} aria-label={p('title')} data-shop-work-picker>
    <header className="shop-picker-heading"><div><h3>{p('title')}</h3><p className="work-field-hint">{p('hint')}</p></div><button type="button" onClick={() => { onChange([]); setAttempt(value => value + 1); }} disabled={disabled || locked || state.loading} className="work-text-button"><IoRefreshOutline aria-hidden="true" />{t('workers.shopFlow.refresh')}</button></header>
    <p className="work-field-hint" data-shop-stage-hint={category}>{p(category === 'finishing' ? 'finishingHint' : 'laundryHint')}</p>
    <label className="worker-orders-search"><IoSearchOutline aria-hidden="true" /><span className="sr-only">{t('workers.shopFlow.search')}</span><input type="search" data-shop-work-search value={query} onChange={event => search(event.target.value)} placeholder={t('workers.shopFlow.search')} disabled={disabled} /></label>
    <div className="worker-orders-toolbar"><strong data-shop-works-count>{t('workerShopBatch.selected', { works: selections.length, pieces: selectedPieces })}</strong><div><button type="button" data-shop-works-select-all onClick={selectAll} disabled={disabled || state.loading || state.error}>{p('selectAll')}</button><button type="button" data-shop-works-clear onClick={() => onChange(selections.filter(row => workerBatchLocked(outcomes[row.shopOriginId])))} disabled={disabled}>{t('workerClientBatch.clear')}</button></div></div>
    {fields.shopSelections && <p className="work-field-error" role="alert">{p('chooseWorks')}</p>}
    {state.loading ? <p role="status">{t('common.loading')}</p> : state.error ? <p className="work-field-error" role="alert">{t('workers.shopFlow.loadFailed')} <button type="button" disabled={disabled} className="work-text-button" onClick={() => setAttempt(value => value + 1)}>{t('workers.retry')}</button></p> : <div className="worker-orders-list">{visible.map(work => {
      const selection = selectedById.get(work._id), index = selections.findIndex(row => row.shopOriginId === work._id), outcome = outcomes[work._id], rowLocked = workerBatchLocked(outcome), available = work.pieces?.filter(piece => piece.available), matchedPiece = shopPieceNumber(work, query);
      return <article key={work._id} data-shop-work-choice={work._id} className={'worker-order-choice' + (selection ? ' is-selected' : '') + (outcome?.status === 'saved' ? ' is-saved' : '')}>
        <label className="worker-order-choice-heading"><input type="checkbox" data-select-shop-work={work._id} aria-label={t('workerShopBatch.selectWork', { barcode: work.barcode })} checked={Boolean(selection)} disabled={disabled || rowLocked || !selection && (!canChoose(work) || selections.length >= WORKER_SHOP_BATCH_LIMIT)} onChange={() => toggle(work)} /><span><strong dir="auto">{work.productName || t('fesla.garmentTypes.' + work.garmentType)}</strong><small><bdi dir="ltr">{work.barcode}</bdi></small><small dir="auto">{work.workerName}</small></span>{outcome?.status === 'saved' ? <span className="worker-order-saved"><IoCheckmarkCircleOutline />{p('saved')}</span> : <b>{t('workers.shopFlow.readyCount', { count: work.availableQuantity ?? work.quantity })}</b>}</label>
        {selection && <div className="worker-order-choice-body" data-shop-work-selected><WorkerShopFlowInfo flow={work.flow} />
          {matchedPiece !== null && <p role="status" className="shop-matched-piece">{t('workers.shopFlow.matchedPiece', { number: matchedPiece })}</p>}
          {work.pieces && <fieldset disabled={disabled || rowLocked} className="shop-transfer-pieces"><legend>{t('workers.shopFlow.choosePieces')}</legend><div className="worker-piece-completion-actions"><strong>{t('workers.shopFlow.selectedCount', { count: selection.lineIds.length })}</strong><button type="button" className="work-text-button" data-select-ready-shop-pieces disabled={disabled || rowLocked} onClick={() => update(work._id, { lineIds: selection.lineIds.length === available.length ? [] : available.map(piece => piece.lineId) })}>{t(selection.lineIds.length === available.length ? 'workers.work.pieceCards.clearSelection' : 'workers.work.pieceCards.selectAll')}</button></div>
            <div className="shop-piece-table-scroll" tabIndex={0} role="region" aria-label={t('workers.shopFlow.choosePieces')}><table className="shop-piece-table" data-shop-transfer-table><thead><tr>{['selectPiece', 'pieceNumber', 'pieceBarcode', 'fabric', 'size', 'pieceStatus'].map(key => <th key={key} scope="col">{t('workers.shopFlow.' + key)}</th>)}</tr></thead><tbody>{work.pieces.map(piece => {
              const material = work.materials.find(row => row.lineId === piece.lineId);
              return <tr key={piece.lineId} data-shop-selected-piece data-matched-piece={matchedPiece === piece.pieceNumber ? 'true' : undefined} data-piece-ready={piece.available}><td><input type="checkbox" data-transfer-shop-piece={piece.lineId} aria-label={t('workers.work.pieceCards.pieceNumber', { number: piece.pieceNumber })} checked={selection.lineIds.includes(piece.lineId)} disabled={!piece.available || disabled || rowLocked} onChange={event => update(work._id, { lineIds: event.target.checked ? [...selection.lineIds, piece.lineId] : selection.lineIds.filter(id => id !== piece.lineId) })} /></td><th scope="row">{piece.pieceNumber}</th><td><bdi dir="ltr">{piece.barcode}</bdi></td><td dir="auto">{material?.fabricType}<small>{material?.fabricColor}</small></td><td><bdi>{material?.size || '—'}</bdi></td><td><span className={piece.available ? 'shop-piece-ready' : 'shop-piece-blocked'}>{t(piece.available ? 'workers.shopFlow.ready' : 'workers.work.errors.' + piece.reason)}</span></td></tr>;
            })}</tbody></table></div>
          </fieldset>}
          {(error(index, 'lineIds') || error(index, 'shopOriginId')) && <p role="alert" className="work-field-error">{t('workers.work.errors.' + (error(index, 'lineIds') || error(index, 'shopOriginId')))}</p>}
          <div className="worker-order-inputs"><label>{p('wage')}<input className="work-input" data-shop-work-wage inputMode="decimal" dir="ltr" maxLength={13} value={rowLocked ? outcome.input.unitWage : selection.unitWage} disabled={disabled || rowLocked} onChange={event => update(work._id, { unitWage: event.target.value })} placeholder={t('workerClientBatch.overrideHint')} />{error(index, 'unitWage') && <small className="work-field-error">{t('workers.work.errors.' + error(index, 'unitWage'))}</small>}</label></div>
          {outcome?.status === 'saving' && <p role="status">{p('saving')}</p>}{outcome?.status === 'uncertain' && <p className="work-field-error" role="alert">{t('workerClientBatch.uncertain')}</p>}{outcome?.status === 'failed' && <p className="work-field-error" role="alert">{t('workers.work.errors.' + outcome.code, { defaultValue: t('workers.work.errors.saveWorkFailed') })}</p>}
        </div>}
      </article>;
    })}{!visible.length && <p className="work-field-hint">{p('empty')}</p>}</div>}
    {selections.length >= WORKER_SHOP_BATCH_LIMIT && <p className="work-field-hint">{t('workerShopBatch.limit', { count: WORKER_SHOP_BATCH_LIMIT })}</p>}
  </section>;
}
