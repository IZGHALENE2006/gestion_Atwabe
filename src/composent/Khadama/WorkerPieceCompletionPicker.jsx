import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import { shopPieceBarcode } from '../../../shared/workerShopFlow.js';
import { useTranslation } from 'react-i18next';
import { workerAvailablePieces, workerMaterialRows } from '../../../shared/workerMaterials.js';

export default function WorkerPieceCompletionPicker({ work, selected, onChange, disabled, error }) {
  const { t, i18n } = useTranslation();
  const canSeeFinancials = useEmployeeOperations("workers").financials;
  const rows = workerMaterialRows(work), available = workerAvailablePieces(work);
  const money = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { style: 'currency', currency: 'MAD' }).format(value);
  return <fieldset id="worker-work-lineIds" tabIndex={-1} className="worker-piece-completion" aria-describedby={error ? 'worker-work-lineIds-error' : undefined}>
    <legend>{t('workers.work.pieceCards.chooseCompleted')}</legend>
    <div className="worker-piece-completion-actions"><p>{t('workers.work.pieceCards.completionHint')}</p><button type="button" disabled={disabled} className="work-text-button" data-select-all-work-pieces onClick={() => onChange(selected.length === available.length ? [] : available.map(row => row.lineId))}>{t(selected.length === available.length ? 'workers.work.pieceCards.clearSelection' : 'workers.work.pieceCards.selectAll')}</button></div>
    {available.map(row => <label key={row.lineId} className={selected.includes(row.lineId) ? 'is-selected' : ''}><input type="checkbox" data-complete-piece={row.lineId} checked={selected.includes(row.lineId)} disabled={disabled} onChange={event => onChange(event.target.checked ? [...selected, row.lineId] : selected.filter(id => id !== row.lineId))} /><span><strong>{t('workers.work.pieceCards.pieceNumber', { number: rows.findIndex(item => item.lineId === row.lineId) + 1 })} · {row.fabricType} · {row.fabricColor}</strong><bdi dir="ltr" data-completion-piece-barcode>{shopPieceBarcode(work, rows.findIndex(item => item.lineId === row.lineId) + 1) || row.pieceBarcode}</bdi>{row.size && <small>{t('workers.work.pieceCards.size')}: <bdi dir="ltr" data-completion-piece-size>{row.size}</bdi></small>}</span>{canSeeFinancials && <bdi className="worker-piece-wage">{money(row.unitWage)}</bdi>}</label>)}
    {error && <p id="worker-work-lineIds-error" className="work-field-error">{t('workers.work.errors.' + error)}</p>}
  </fieldset>;
}
