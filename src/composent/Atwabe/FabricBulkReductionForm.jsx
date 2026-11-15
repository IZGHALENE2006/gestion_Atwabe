import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoRefreshOutline, IoRemoveCircleOutline } from 'react-icons/io5';
import { prepareFabricReductionLines } from '../../../shared/fabricReductions.js';
import { reduceFabricPieces } from './fabricsApi.js';
import './fabricBulkReductions.css';

export default function FabricBulkReductionForm({ fabric, token, canReduce, disabled, onBusyChange, onReduced, onReload }) {
  const { t, i18n } = useTranslation();
  const [amounts, setAmounts] = useState({}), [error, setError] = useState(''), [success, setSuccess] = useState(null);
  const savingRef = useRef(false), requestRef = useRef(null);
  const prepared = prepareFabricReductionLines(fabric, amounts), invalid = Object.keys(prepared.errors).length > 0;
  const format = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { maximumFractionDigits: 3 }).format(value);
  const patch = (id, value) => { setAmounts(current => ({ ...current, [id]: value })); setError(''); setSuccess(null); };
  const reload = async () => { if (savingRef.current) return; if (await onReload()) { setAmounts({}); setError(''); setSuccess(null); requestRef.current = null; } };
  const submit = async event => {
    event.preventDefault();
    if (disabled || savingRef.current || !canReduce || invalid || !prepared.lines.length) return;
    const fingerprint = JSON.stringify({ fabricId: fabric._id, version: fabric.__v, lines: prepared.lines });
    if (requestRef.current?.fingerprint !== fingerprint) requestRef.current = { fingerprint, requestId: crypto.randomUUID() };
    savingRef.current = true; onBusyChange(true); setError(''); setSuccess(null);
    try {
      const result = await reduceFabricPieces(fabric, prepared.lines, requestRef.current.requestId, token);
      onReduced(result); setAmounts({}); setSuccess(result.summary); requestRef.current = null;
    } catch (failure) {
      const code = failure.response?.data?.message;
      setError(['forbidden', 'notFound', 'conflict', 'insufficientMeters', 'invalidReduction', 'requestConflict'].includes(code) ? code : 'reductionFailed');
    } finally { savingRef.current = false; onBusyChange(false); }
  };
  return <form noValidate onSubmit={submit} className="fabric-bulk-reduction" data-bulk-reduction-form>
    <p className="fabric-bulk-hint">{t('fabrics.bulkReduction.hint')}</p>
    <div className="fabric-bulk-list" role="region" aria-label={t('fabrics.bulkReduction.colorsAndPieces')} tabIndex={0}>
      {fabric.colors.map(color => <section key={color._id} className="fabric-bulk-color" data-bulk-color={color._id}>
        <header><div><strong dir="auto">{color.name}</strong>{color.number && <span dir="auto">{t('fabrics.colorNumber')}: <bdi>{color.number}</bdi></span>}</div><span>{t('fabrics.bulkReduction.piecesCount', { number: format(color.pieces.length) })}</span></header>
        <div className="fabric-bulk-columns" aria-hidden="true"><span>{t('fabrics.barcode')}</span><span>{t('fabrics.beforeReduction')}</span><span>{t('fabrics.reductionMeters')}</span><span>{t('fabrics.remainingMeters')}</span></div>
        {color.pieces.map((piece, index) => {
          const value = amounts[piece._id] || '', rowError = prepared.errors[piece._id], line = prepared.lines.find(row => row.pieceId === piece._id);
          const after = rowError ? null : (Math.round(piece.meters * 1000) - Math.round((line?.meters || 0) * 1000)) / 1000;
          const id = `fabric-bulk-${piece._id}`, exhausted = piece.meters === 0;
          return <div key={piece._id} className={`fabric-bulk-piece ${rowError ? 'has-error' : line ? 'is-entered' : ''} ${exhausted ? 'is-exhausted' : ''}`} data-bulk-piece={piece._id}>
            <div className="fabric-bulk-identity"><strong>{t('fabrics.piece', { number: index + 1 })}</strong><bdi dir="ltr">{piece.barcode}</bdi>{exhausted && <small>{t('fabrics.exhausted')}</small>}</div>
            <div className="fabric-bulk-before"><span className="fabric-bulk-mobile-label">{t('fabrics.beforeReduction')}</span><bdi dir="ltr">{t('fabrics.meterValue', { value: format(piece.meters) })}</bdi></div>
            <div className="fabric-bulk-amount"><label htmlFor={id} className="fabric-bulk-mobile-label">{t('fabrics.reductionMeters')}</label><input id={id} data-bulk-meters={piece._id} type="text" inputMode="decimal" dir="ltr" value={value} onChange={event => patch(piece._id, event.target.value)} disabled={disabled || !canReduce || exhausted} aria-label={t('fabrics.bulkReduction.inputLabel', { color: color.name, number: index + 1, barcode: piece.barcode })} aria-invalid={Boolean(rowError)} aria-describedby={rowError ? id + '-error' : undefined} placeholder="0" maxLength={11} />{rowError && <p role="alert" id={id + '-error'}>{t('fabrics.errors.' + rowError)}</p>}</div>
            <div className="fabric-bulk-after"><span className="fabric-bulk-mobile-label">{t('fabrics.remainingMeters')}</span><bdi dir="ltr" data-bulk-after={piece._id}>{after === null ? '—' : t('fabrics.meterValue', { value: format(after) })}</bdi></div>
          </div>;
        })}
      </section>)}
    </div>
    <div className="fabric-bulk-summary" aria-live="polite"><div><span>{t('fabrics.bulkReduction.selectedPieces')}</span><strong data-bulk-piece-count>{format(prepared.lines.length)}</strong></div><div><span>{t('fabrics.bulkReduction.totalMeters')}</span><strong data-bulk-total>{t('fabrics.meterValue', { value: format(prepared.meters) })}</strong></div><button type="button" disabled={disabled || !Object.keys(amounts).length} onClick={() => { setAmounts({}); setError(''); setSuccess(null); }} className="fabric-bulk-clear">{t('fabrics.bulkReduction.clear')}</button></div>
    {invalid && <p className="fabric-bulk-error" role="alert">{t('fabrics.bulkReduction.fixRows')}</p>}
    {error && <div className="fabric-bulk-error" role="alert"><p>{t('fabrics.errors.' + error)}</p>{['conflict', 'notFound', 'insufficientMeters'].includes(error) && <button type="button" disabled={disabled} onClick={reload}><IoRefreshOutline aria-hidden="true" />{t('fabrics.reloadStock')}</button>}</div>}
    {success && <p role="status" data-bulk-reduction-success className="fabric-bulk-success">{t('fabrics.bulkReduction.saved', { count: success.pieceCount, number: format(success.pieceCount), meters: format(success.meters) })}</p>}
    <button type="submit" data-confirm-bulk-reduction disabled={disabled || !canReduce || invalid || !prepared.lines.length} className="fabric-bulk-confirm"><IoRemoveCircleOutline aria-hidden="true" />{t(disabled ? 'common.loading' : 'fabrics.bulkReduction.confirm')}</button>
  </form>;
}
