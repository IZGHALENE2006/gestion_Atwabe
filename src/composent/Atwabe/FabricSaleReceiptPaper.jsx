import { useTranslation } from 'react-i18next';
import { normalizeInvoiceSettings } from '../../../shared/invoiceSettings.js';
import { publicFabricSaleReceipt } from '../../../shared/fabricSales.js';
import '../Fesla/tailoringReceipts.css';

export default function FabricSaleReceiptPaper({ movement, settings, paperRef }) {
  const { t, i18n } = useTranslation();
  const data = publicFabricSaleReceipt(movement), config = normalizeInvoiceSettings(settings || {});
  const locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const money = value => t('fabrics.salePriceValue', { value: Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  return <article ref={paperRef} className="tailoring-receipt-paper" data-fabric-sale-receipt={data.reference} dir={i18n.dir()}>
    <header className="tailoring-receipt-heading"><div><h1>{config.visibility.shopName && config.shopName ? config.shopName : t('fesla.receipts.shopFallback')}</h1>{config.visibility.address && config.address && <p>{config.address}</p>}{config.visibility.phone && config.phone && <p><bdi dir="ltr">{config.phone}</bdi></p>}</div><div><h2>{t(data.source === 'tailoring' ? 'fabrics.profits.tailoringReceiptTitle' : 'fabrics.sales.receiptTitle')}</h2><p>{t('fesla.receipts.reference')} <bdi dir="ltr">{data.reference}</bdi></p><p><time dateTime={data.occurredAt}>{new Date(data.occurredAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</time></p></div></header>
    {data.source === "tailoring" && <p className="tailoring-receipt-note">{t("fabrics.profits.tailoringReceiptNote")} <bdi dir="ltr">{data.sourceOrderBarcode}</bdi> · {t("fabrics.profits.orderPiece", { number: data.sourceLineNumber })}</p>}
    {data.clientName && <section className="tailoring-receipt-client"><h3>{t('fabrics.sales.client')}: <span dir="auto">{data.clientName}</span></h3></section>}
    <p className="tailoring-receipt-note">{t('fabrics.sales.pricing')}: {t('fabrics.sales.' + data.pricingMode)}</p>
    <table className="tailoring-receipt-items"><thead><tr><th scope="col">{t('fabrics.type')}</th><th scope="col">{t('fabrics.sales.meters')}</th><th scope="col">{t('fabrics.sales.unitPrice')}</th><th scope="col">{t('fabrics.sales.subtotal')}</th></tr></thead><tbody><tr><td><strong dir="auto">{data.type}</strong>{data.fabricReference && <small dir="auto">{t('fabrics.reference')}: {data.fabricReference}</small>}<small dir="auto">{t('fabrics.color')}: {data.color}{data.colorNumber ? ' · ' + data.colorNumber : ''}</small><small><bdi dir="ltr">{data.barcode}</bdi></small></td><td><bdi>{Number(data.meters).toLocaleString(locale, { maximumFractionDigits: 3 })}</bdi></td><td><bdi>{money(data.unitPrice)}</bdi></td><td><bdi>{money(data.subtotal)}</bdi></td></tr></tbody></table>
    <dl className="tailoring-receipt-totals">{[['subtotal', data.subtotal], ['discount', data.discountAmount], ['total', data.total]].map(([key, value]) => <div key={key} className={key === 'total' ? 'is-balance' : ''}><dt>{t('fabrics.sales.' + key)}{key === 'discount' && data.discountType === 'percent' && <> (<bdi>{data.discountValue}%</bdi>)</>}</dt><dd data-fabric-receipt-amount={key} data-value={value}><bdi>{money(value)}</bdi></dd></div>)}</dl>
    {data.createdByName && <p data-fabric-receipt-seller className="tailoring-receipt-note">{t('fabrics.sales.seller')}: <span dir="auto">{data.createdByName}</span></p>}
    {config.visibility.footer && config.footer && <footer className="tailoring-receipt-footer">{config.footer}</footer>}
  </article>;
}
