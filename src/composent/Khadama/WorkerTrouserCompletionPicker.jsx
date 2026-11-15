import { useTranslation } from 'react-i18next';
import { IoCheckmarkCircleOutline } from 'react-icons/io5';
import { availableTrouserColors, completedTrouserColorIds } from '../../../shared/workerShopTrousers.js';

export default function WorkerTrouserCompletionPicker({ work, selected, onChange, disabled, error }) {
  const { t, i18n } = useTranslation();
  const available = availableTrouserColors(work), done = new Set(completedTrouserColorIds(work));
  const unknown = work.completedQuantity - done.size;
  const number = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA').format(value);
  return <fieldset id="worker-work-colorIds" tabIndex={-1} className="worker-trouser-colors worker-trouser-completion" disabled={disabled} aria-describedby={`worker-trouser-completion-hint${error ? ' worker-work-colorIds-error' : ''}`} aria-invalid={Boolean(error)}>
    <legend>{t('workers.work.shopTrousers.completeColors')}</legend>
    <p id="worker-trouser-completion-hint" className="work-field-hint">{t('workers.work.shopTrousers.completionHint')}</p>
    <p className="work-field-hint">{work.shopTrouser.fabricType} · {t('workers.work.shopTrousers.length')}: <bdi>{work.shopTrouser.length}</bdi> · <bdi>{work.shopTrouser.size}</bdi></p>
    {unknown > 0 && <p className="work-field-hint" data-unknown-trouser-completions>{t('workers.work.shopTrousers.legacyCompletionHint', { number: number(unknown) })}</p>}
    <div className="worker-trouser-color-toolbar"><button type="button" className="work-text-button" data-select-all-trouser-completions onClick={() => onChange(selected.length === Math.min(available.length, work.remainingQuantity) ? [] : available.slice(0, work.remainingQuantity).map(color => color.colorId))}>{t(selected.length === Math.min(available.length, work.remainingQuantity) ? 'workers.work.shopTrousers.clearColors' : 'workers.work.shopTrousers.allColors')}</button><span aria-live="polite" data-completed-trouser-count>{t('workers.work.shopTrousers.selectedCount', { number: number(selected.length) })}</span></div>
    <div className="worker-trouser-color-grid">{work.shopTrouser.colors.map(color => {
      const completed = done.has(color.colorId), checked = selected.includes(color.colorId);
      return <label key={color.colorId} className={`worker-trouser-color ${checked ? 'is-selected' : ''} ${completed ? 'is-assigned is-completed' : ''}`}>
        <input type="checkbox" data-complete-trouser-color={color.colorId} checked={checked} disabled={completed || !checked && selected.length >= work.remainingQuantity} onChange={event => onChange(event.target.checked ? [...selected, color.colorId] : selected.filter(id => id !== color.colorId))} />
        <span><strong dir="auto">{color.name}</strong>{color.number && <small>{t('workers.work.shopTrousers.colorNumber')}: <bdi>{color.number}</bdi></small>}<small>{t(completed ? 'workers.work.done' : 'workers.work.inProgress')}</small></span>
        <IoCheckmarkCircleOutline className="worker-trouser-color-check" aria-hidden="true" />
      </label>;
    })}</div>
    {error && <p id="worker-work-colorIds-error" className="work-field-error">{t('workers.work.errors.' + error)}</p>}
  </fieldset>;
}
