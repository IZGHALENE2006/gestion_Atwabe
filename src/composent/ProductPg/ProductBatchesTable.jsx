import { useTranslation } from 'react-i18next';
import { productBatches } from '../../../shared/productBatches.js';
import './productBatches.css';
export default function ProductBatchesTable({ product, canManage = false }) {
  const { t, i18n } = useTranslation(), locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const money = value => Number(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DH';
  const batches = productBatches(product), current = batches.at(-1);
  return <section className="product-batch-history" aria-label={t('productBatches.history')}>
    <h3>{t('productBatches.history')}</h3>
    <div className="batch-selling-summary"><div><span>{t('productBatches.currentRetail')}</span><strong data-product-current-retail><bdi dir="ltr">{money(current.prix_vente)}</bdi></strong></div>{current.prix_gros != null && <div><span>{t('pricing.wholesalePrice')}</span><strong><bdi dir="ltr">{money(current.prix_gros)}</bdi></strong></div>}</div>
    <div className="product-batch-scroll"><table data-product-batches><thead><tr>
      <th>{t('productBatches.label')}</th><th>{t('productBatches.date')}</th><th>{t('productBatches.added')}</th><th>{t('productBatches.remaining')}</th>
      {canManage && <><th>{t('productTable.purchasePrice')}</th><th>{t('productBatches.fees')}</th></>}
    </tr></thead><tbody>{batches.map(batch => <tr key={batch.batchId} data-batch-id={batch.batchId}>
      <td><strong>{t('productBatches.batch', { number: batch.number })}</strong>{batch.batchId === 'initial' && <small>{t('productBatches.initial')}</small>}{batch.fournisseur && <small dir="auto">{batch.fournisseur}</small>}{batch.note && <small dir="auto">{batch.note}</small>}{batch.createdByName && <small>{t('productBatches.by')}: {batch.createdByName}</small>}</td>
      <td>{batch.receivedAt && !Number.isNaN(new Date(batch.receivedAt).getTime()) ? <time dateTime={batch.receivedAt}>{new Date(batch.receivedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</time> : '—'}</td>
      <td><bdi>{batch.initialQuantity}</bdi></td><td><strong className={batch.quantite > 0 ? 'batch-remaining' : 'batch-empty'}><bdi>{batch.quantite}</bdi></strong></td>
      {canManage && <><td data-batch-purchase><bdi dir="ltr">{money(batch.prix_achat)}</bdi></td><td><bdi dir="ltr">{money(batch.frais_unitaire)}</bdi></td></>}
    </tr>)}</tbody></table></div>
  </section>;
}
