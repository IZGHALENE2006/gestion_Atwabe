import { useTranslation } from 'react-i18next';
import Barcode from 'react-barcode';
import { normalizeInvoiceSettings } from '../../../shared/invoiceSettings.js';
import { publicTailoringReceipt } from '../../../shared/tailoringReceipts.js';
import './tailoringReceipts.css';

export default function TailoringReceiptPaper({ document: snapshot, settings, paperRef }) {
  const { t, i18n } = useTranslation();
  const data = publicTailoringReceipt(snapshot), config = normalizeInvoiceSettings(settings || {});
  const payment = data.kind === 'payment', locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const money = value => value === null ? '—' : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ' + t('fesla.currency');
  const date = (value, withTime = false) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(String(value).length === 10 ? value + 'T12:00:00' : value).toLocaleString(locale, withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }) : '—';
  const rows = payment ? [
    ['totalPrice', data.totalPrice], ['received', data.paymentAmount],
    [data.historical ? 'paidAfter' : 'currentPaid', data.paidAmount],
    [data.historical ? 'remainingAfter' : 'currentRemaining', data.remainingAmount],
  ] : [['totalPrice', data.totalPrice], ['paidAmount', data.paidAmount], ['remainingAmount', data.remainingAmount]];
  if (!payment && data.adjustments) rows.unshift(['subtotal', data.adjustments.subtotal], ['orderDiscount', data.adjustments.discountAmount]);
  const label = key => ['subtotal', 'orderDiscount'].includes(key) ? t('fesla.adjustments.' + key) : ['totalPrice', 'paidAmount', 'remainingAmount'].includes(key) ? t('fesla.' + key) : t('fesla.receipts.' + key);
  return <article ref={paperRef} className="tailoring-receipt-paper" data-tailoring-receipt={data.kind} data-receipt-reference={data.reference} dir={i18n.dir()}>
    <header className="tailoring-receipt-heading"><div><h1>{config.visibility.shopName && config.shopName ? config.shopName : t('fesla.receipts.shopFallback')}</h1>{config.visibility.address && config.address && <p>{config.address}</p>}{config.visibility.phone && config.phone && <p><bdi dir="ltr">{config.phone}</bdi></p>}</div><div><h2>{t('fesla.receipts.' + (payment ? 'paymentTitle' : 'orderTitle'))}</h2><p>{t('fesla.receipts.reference')}<bdi dir="ltr">{data.reference}</bdi></p><p><time dateTime={data.issuedAt}>{date(data.issuedAt, true)}</time></p></div></header>
    <section className="tailoring-receipt-client"><h3>{t('fesla.clientName')}: <span dir="auto">{data.clientName}</span></h3><p>{t('fesla.phone')}: <bdi dir="ltr">{data.phone}</bdi></p><p>{t('fesla.receipts.orderKind')}: {t('fesla.garmentTypes.' + data.garmentType)} <span>({data.items.length})</span></p></section>
    <dl className="tailoring-receipt-dates"><div><dt>{t('fesla.orderDate')}</dt><dd><time dateTime={data.orderDate}>{date(data.orderDate)}</time></dd></div><div><dt>{t('fesla.readyDate')}</dt><dd><time dateTime={data.readyDate}>{date(data.readyDate)}</time></dd></div></dl>
    {!payment && <table className="tailoring-receipt-items"><thead><tr><th scope="col">{t('fesla.receipts.item')}</th><th scope="col">{t('fesla.receipts.fabric')}</th><th scope="col">{t('fesla.receipts.price')}</th></tr></thead><tbody>{data.items.map(item => <tr key={item.number}><td><strong>{t('fesla.receipts.item')} {item.number}</strong>{item.trouserType && <small>{t('fesla.trouserTypes.' + item.trouserType)}</small>}{item.shirtType && <small dir="auto">{item.shirtType}</small>}{item.pricing?.fourFille && <small><bdi>4fille +{money(item.pricing.fourFilleAmount)}</bdi></small>}</td><td><strong dir="auto">{item.fabricType}</strong><small>{t('fesla.sources.' + item.fabricSource)}</small>{item.fabricReference && <small dir="auto">{t('fesla.fabricReference')}: {item.fabricReference}</small>}{item.fabricColor && <small dir="auto">{t('fesla.fabricColor')}: {item.fabricColor}</small>}{item.fabricMeters !== undefined && <small>{t('fesla.costs.fabricMeters')}: <bdi>{item.fabricMeters}</bdi> {t('fesla.costs.metersUnit')}</small>}{item.sfifa && <small>{t('fesla.widths.' + item.sfifa.width)} · {t('fesla.styles.' + item.sfifa.style)}{item.sfifa.style !== 'fabric' && <> · <bdi>{[item.sfifa.color1, item.sfifa.color2].filter(Boolean).join(' · ')}</bdi></>}</small>}</td><td><bdi>{money(item.price)}</bdi>{item.pricing?.discountAmount > 0 && <small>{t("fesla.adjustments.pieceDiscount")}{item.pricing.discount.type === "percent" ? ` (${item.pricing.discount.value}%)` : ""}: <bdi>−{money(item.pricing.discountAmount)}</bdi></small>}</td></tr>)}</tbody></table>}
    <dl className="tailoring-receipt-totals">{rows.map(([key, value], index) => <div key={key} className={index === rows.length - 1 ? 'is-balance' : key === 'received' ? 'is-received' : ''}><dt>{label(key)}</dt><dd data-tailoring-receipt-amount={key} data-value={value}><bdi>{money(value)}</bdi></dd></div>)}</dl>
    {!data.historical && <p className="tailoring-receipt-note">{t('fesla.receipts.currentBalanceNote')}</p>}
    <div className="tailoring-receipt-barcode" dir="ltr"><Barcode value={data.orderBarcode} format="CODE128" width={1} height={30} displayValue={false} margin={8} background="#ffffff" lineColor="#111827" /><bdi>{data.orderBarcode}</bdi></div>
    {config.visibility.footer && config.footer && <footer className="tailoring-receipt-footer">{config.footer}</footer>}
  </article>;
}
