import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline, IoPrintOutline } from 'react-icons/io5';

export default function FabricSaleDetailsDialog({ sale, onClose, onReceipt }) {
  const { t, i18n } = useTranslation(), dialog = useRef(null);
  const p = key => t('fabrics.profits.' + key), locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const money = value => value === null ? '—' : t('fabrics.salePriceValue', { value: Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  const length = value => t('fabrics.meterValue', { value: Number(value).toLocaleString(locale, { maximumFractionDigits: 3 }) });
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} dir={i18n.dir()} aria-labelledby="fabric-sale-details-title" className="fabric-profit-details" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><p>{p('reference')} <bdi dir="ltr">{sale.reference}</bdi></p><h2 id="fabric-sale-details-title">{p('detailsTitle')}</h2></div><button type="button" data-close-fabric-sale-details onClick={onClose} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <div className="fabric-profit-details-body">
      <dl className="fabric-profit-detail-meta"><div><dt>{p("source")}</dt><dd data-fabric-detail-source>{p("sources." + sale.source)}{sale.source === "tailoring" && <><bdi className="fabric-profit-code" dir="ltr">{sale.sourceOrderBarcode}</bdi><p>{t("fabrics.profits.orderPiece", { number: sale.sourceLineNumber })}</p></>}</dd></div><div><dt>{p('date')}</dt><dd><time dateTime={sale.occurredAt}>{new Date(sale.occurredAt).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' })}</time></dd></div><div><dt>{p('seller')}</dt><dd data-fabric-detail-seller dir="auto">{sale.sellerName || p('unknownSeller')}{sale.sellerRole && <small> · {p('roles.' + sale.sellerRole)}</small>}</dd></div><div><dt>{p('client')}</dt><dd dir="auto">{sale.clientName || p('anonymousClient')}</dd></div><div><dt>{p('fabric')}</dt><dd><strong dir="auto">{sale.type}</strong>{sale.fabricReference && <span dir="auto"> · {sale.fabricReference}</span>}<p dir="auto">{sale.color}{sale.colorNumber ? ' · ' + sale.colorNumber : ''}</p><bdi className="fabric-profit-code" dir="ltr">{sale.barcode}</bdi></dd></div></dl>
      <section className="fabric-profit-detail-panel"><h3>{p('financials')}</h3><dl className="fabric-profit-detail-money">{[['purchasePrice', sale.purchaseUnitPrice], ['unitPrice', sale.unitPrice], ['subtotal', sale.subtotal], ['discount', sale.discountAmount], ['net', sale.revenueAmount], ['cost', sale.costAmount], ['profit', sale.profitAmount]].map(([key, value]) => <div key={key} className={key === 'profit' ? 'is-profit' : ''}><dt>{p(key)}{key === 'unitPrice' && <small> · {t('fabrics.sales.' + sale.pricingMode)}</small>}{key === 'discount' && sale.discountType === 'percent' && <> (<bdi>{sale.discountValue}%</bdi>)</>}</dt><dd data-fabric-detail-amount={key} data-value={value ?? ''} className={value < 0 ? 'is-loss' : undefined}><bdi>{money(value)}</bdi></dd></div>)}</dl></section>
      {sale.costAmount === null && <p role="status" className="fabric-profit-notice">{p('unknownDetails')}</p>}
      {sale.cancelledAt && <p role="status" className="fabric-profit-notice">{p("cancelledHint")}</p>}
      {sale.source !== "tailoring" && <section className="fabric-profit-detail-panel"><h3>{p('stock')}</h3><dl className="fabric-profit-stock">{[['before', sale.beforeMeters], ['sold', sale.meters], ['remaining', sale.remainingMeters]].map(([key, value]) => <div key={key}><dt>{p(key)}</dt><dd><bdi>{length(value)}</bdi></dd></div>)}</dl></section>}
    </div>
    <footer><button type="button" onClick={onClose}>{t('dialog.close')}</button><button type="button" data-fabric-details-receipt className="is-primary" onClick={() => onReceipt(sale)}><IoPrintOutline size={19} />{p('receipt')}</button></footer>
  </dialog>;
}
