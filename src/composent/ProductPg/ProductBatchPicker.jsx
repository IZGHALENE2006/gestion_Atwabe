import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline, IoLayersOutline, IoAddOutline } from 'react-icons/io5';
import { cashierBatchChoices, cashierAvailableQuantity } from '../../../shared/cashierBatches.js';
import { productBatches } from '../../../shared/productBatches.js';
import './productBatches.css';
export default function ProductBatchPicker({ product, cart, onChoose, onClose, priceType = 'retail', quantity = 1, replacingKey }) {
  const { t, i18n } = useTranslation(), dialog = useRef(null), locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const choices = cashierBatchChoices(product, priceType);
  const money = value => Number(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DH';
  useEffect(() => { const element = dialog.current; element.showModal(); element.querySelector('[data-choose-batch]:not(:disabled)')?.focus(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="product-stock-dialog product-batch-picker" dir={i18n.dir()} aria-labelledby="batch-picker-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><h2 id="batch-picker-title">{t('productBatches.choose')}</h2><p>{t('productBatches.chooseHint')}</p></div><button type="button" onClick={onClose} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <div className="batch-dialog-body"><h3 className="batch-picker-product" dir="auto">{product.name}</h3>
      {choices.length > 0 && <div className="batch-current-price"><span>{t('pricing.' + priceType)}</span><strong data-current-sale-price><bdi dir="ltr">{money(choices[0].price)}</bdi></strong></div>}
      <div className="batch-picker-list">{choices.map(batch => {
        const available = cashierAvailableQuantity(product, batch, cart, replacingKey);
        const label = batch.batchId === 'initial' ? 'initial' : batch.batchId === productBatches(product).at(-1).batchId ? 'latest' : 'previous';
        return <button key={batch.key} type="button" data-choose-batch={batch.batchId} data-batch-number={batch.batchNumber} disabled={available < quantity} onClick={() => { onChoose(batch); onClose(); }}>
          <span className="batch-picker-top"><span><IoLayersOutline size={20} />{t('productBatches.batch', { number: batch.batchNumber })}</span><small>{t('productBatches.' + label)}</small></span>
          <span className="batch-picker-meta"><span>{t('productBatches.remaining')}: <strong className="batch-remaining"><bdi data-batch-available>{available}</bdi></strong></span>{batch.receivedAt && !Number.isNaN(new Date(batch.receivedAt).getTime()) && <time dateTime={batch.receivedAt}>{new Date(batch.receivedAt).toLocaleDateString(locale)}</time>}</span>
          <span className="batch-picker-add"><IoAddOutline size={18} />{t(available >= quantity ? 'productBatches.chooseAction' : 'productBatches.unavailable')}</span>
        </button>;
      })}</div>{!choices.length && <p className="batch-notice">{t('productBatches.empty')}</p>}
    </div>
  </dialog>;
}
