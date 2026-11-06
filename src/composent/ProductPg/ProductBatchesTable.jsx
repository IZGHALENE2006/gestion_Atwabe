import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { FaPrint } from "react-icons/fa";
import toast from "react-hot-toast";
import ProductBatchLabels from "./ProductBatchLabels.jsx";
import ProductBarcode from "./ProductBarcode.jsx";
import { useTranslation } from 'react-i18next';
import { productBatches } from '../../../shared/productBatches.js';
import './productBatches.css';
export default function ProductBatchesTable({ product, canManage = false }) {
  const { t, i18n } = useTranslation(), locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const [printJob, setPrintJob] = useState(null);
  const printRef = useRef(null), startedJob = useRef(null);
  const print = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Labels_${printJob?.product.name || product.name}_${printJob?.number || ""}`,
    onAfterPrint: () => setPrintJob(null),
    onPrintError: () => { setPrintJob(null); toast.error(t("productBatches.printFailed")); },
  });
  useEffect(() => {
    if (!printJob || startedJob.current === printJob) return;
    startedJob.current = printJob;
    print();
  }, [printJob, print]);
  const money = value => Number(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DH';
  const batches = productBatches(product), current = batches.at(-1);
  return <section className="product-batch-history" aria-label={t('productBatches.history')}>
    <h3>{t('productBatches.history')}</h3><p className="batch-barcode-hint">{t('productBatches.barcodeHint')}</p>
    <div className="batch-selling-summary"><div><span>{t('productBatches.currentRetail')}</span><strong data-product-current-retail><bdi dir="ltr">{money(current.prix_vente)}</bdi></strong></div>{current.prix_gros != null && <div><span>{t('pricing.wholesalePrice')}</span><strong><bdi dir="ltr">{money(current.prix_gros)}</bdi></strong></div>}</div>
    <div className="product-batch-scroll"><table data-product-batches><thead><tr>
      <th>{t('productBatches.label')}</th><th>{t('productBatches.barcode')}</th><th>{t('productBatches.date')}</th><th>{t('productBatches.added')}</th><th>{t('productBatches.remaining')}</th>
      {canManage && <><th>{t('productTable.purchasePrice')}</th><th>{t('productBatches.fees')}</th></>}
    </tr></thead><tbody>{batches.map(batch => <tr key={batch.batchId} data-batch-id={batch.batchId}>
      <td><strong>{t('productBatches.batch', { number: batch.number })}</strong>{batch.batchId === 'initial' && <small>{t('productBatches.initial')}</small>}{batch.fournisseur && <small dir="auto">{batch.fournisseur}</small>}{batch.note && <small dir="auto">{batch.note}</small>}{batch.createdByName && <small>{t('productBatches.by')}: {batch.createdByName}</small>}</td>
      <td data-batch-barcode={batch.barcode}><ProductBarcode value={batch.barcode} /><div className="batch-barcode-actions"><EmployeeOperation module="products" operation="labels"><button type="button" className="batch-print-button" data-print-product-batch={batch.batchId} disabled={Boolean(printJob) || batch.quantite <= 0 || !batch.barcode} onClick={() => setPrintJob({ product, batchId: batch.batchId, number: batch.number })} aria-label={`${t('productTable.print')} — ${t('productBatches.batch', { number: batch.number })} (${batch.quantite})`}><FaPrint aria-hidden="true" />{t(printJob?.batchId === batch.batchId ? 'common.loading' : 'productTable.print')} <bdi>({batch.quantite})</bdi></button></EmployeeOperation></div></td>
      <td>{batch.receivedAt && !Number.isNaN(new Date(batch.receivedAt).getTime()) ? <time dateTime={batch.receivedAt}>{new Date(batch.receivedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</time> : '—'}</td>
      <td><bdi>{batch.initialQuantity}</bdi></td><td><strong className={batch.quantite > 0 ? 'batch-remaining' : 'batch-empty'}><bdi>{batch.quantite}</bdi></strong></td>
      {canManage && <><td data-batch-purchase><bdi dir="ltr">{money(batch.prix_achat)}</bdi></td><td><bdi dir="ltr">{money(batch.frais_unitaire)}</bdi></td></>}
    </tr>)}</tbody></table></div>
    {printJob && <div style={{ display: "none" }}><ProductBatchLabels ref={printRef} product={printJob.product} batchId={printJob.batchId} /></div>}
  </section>;
}
