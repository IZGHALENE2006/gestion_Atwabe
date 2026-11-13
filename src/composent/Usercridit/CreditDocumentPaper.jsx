import { useTranslation } from "react-i18next";
import { normalizeInvoiceSettings } from "../../../shared/invoiceSettings.js";
import { creditRound } from "../../../shared/creditDocuments.js";
import { invoiceLogoUrl } from "../Facture/invoicePresentation.js";
import "./creditPrint.css";

export default function CreditDocumentPaper({ document: data, settings, paperRef }) {
  const { t, i18n } = useTranslation();
  const config = normalizeInvoiceSettings(settings || {}), visibility = config.visibility;
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA", receipt = data.kind === "payment";
  const money = value => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${i18n.language === "ar" ? "درهم" : "DH"}`;
  const date = (value, withTime = true) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString(locale, withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }) : "—";
  const hasDiscounts = !receipt && data.lines.some(line => Number(line.discountAmount || 0) > 0);
  const title = data.titleKey ? t(data.titleKey) : t(`creditDocuments.${receipt ? "paymentTitle" : data.kind === "invoice" ? "invoiceTitle" : "statementTitle"}`);
  const rows = receipt ? data.historical ? [["remainingBefore", data.remainingBefore], ["received", data.amount], ["remainingAfter", data.remaining]] : [["received", data.amount], ["currentTotal", data.total], ["currentPaid", data.paid], ["currentBalance", data.remaining]] : [["total", data.total], [data.kind === "invoice" && !data.currentBalance ? "initialPaid" : "paid", data.paid], ["remaining", data.remaining]];
  return <article ref={paperRef} className="credit-paper" data-credit-document={data.kind} data-credit-reference={data.reference} dir={i18n.dir()}>
    <header className="credit-paper-header"><div>
      {visibility.logo && invoiceLogoUrl(config.logo) && <img className="credit-paper-logo" src={invoiceLogoUrl(config.logo)} alt="" />}
      <h1>{visibility.shopName && config.shopName ? config.shopName : t("creditDocuments.shopFallback")}</h1>
      {visibility.address && config.address && <p className="credit-paper-address">{config.address}</p>}
      {visibility.phone && config.phone && <p><bdi dir="ltr">{config.phone}</bdi></p>}
      {visibility.email && config.email && <p><bdi dir="ltr">{config.email}</bdi></p>}
    </div><div className="credit-paper-title"><h2>{title}</h2><p>{t("creditDocuments.reference")}<bdi dir="ltr">{data.reference}</bdi></p><p>{t(data.kind === "statement" ? "creditDocuments.issuedAt" : "creditDocuments.date")}<time dateTime={data.date}>{date(data.date)}</time></p></div></header>
    <section className="credit-paper-customer"><h3>{t("creditDocuments.customer")}: <span dir="auto">{data.customer?.name}</span></h3>{data.customer?.phone && <p>{t("creditDocuments.phone")}: <bdi dir="ltr">{data.customer.phone}</bdi></p>}{data.customer?.cin && <p>{t("creditDocuments.cin")}: <bdi dir="ltr">{data.customer.cin}</bdi></p>}</section>
    {data.kind !== "statement" && <p className="credit-paper-note" data-credit-print-actor>{t("creditAudit.performedBy")}: <bdi>{data.actor?.name || t("creditAudit.unrecorded")}</bdi>{data.actor && <> — {t(data.actor.role === "admin" ? "creditAudit.admin" : "creditAudit.employee")}</>}</p>}
    {!receipt && (data.lines.length ? <table className="credit-paper-lines"><thead><tr>{["product", "quantity", "unitPrice", ...(hasDiscounts ? ["discount"] : []), "lineTotal", "purchaseDate"].map(key => <th key={key} scope="col">{t(`creditDocuments.${key}`)}</th>)}</tr></thead><tbody>{data.lines.map((line, index) => <tr key={`${line.id}:${index}`}><td dir="auto">{line.nom}{line.batchNumber && <small style={{ display: 'block' }}>{t('productBatches.batch', { number: line.batchNumber })}</small>}</td><td><bdi>{line.Quantite}{line.unit === "meter" ? " " + t("fabricInvoices.meter") : ""}</bdi></td><td><bdi>{money(line.prix)}</bdi></td>{hasDiscounts && <td><bdi>{money(line.discountAmount || 0)}</bdi></td>}<td><bdi>{money(creditRound(line.lineTotal ?? line.prix * line.Quantite))}</bdi></td><td><time dateTime={line.Date}>{date(line.Date, false)}</time></td></tr>)}</tbody></table> : <p>{t("creditDocuments.empty")}</p>)}
    {receipt && !data.historical && <p className="credit-paper-legacy" data-credit-legacy-note>{t("creditDocuments.legacyNote")}</p>}
    <dl className="credit-paper-totals">{rows.map(([key, value], index) => <div key={key} className={index === rows.length - 1 ? "is-final" : ""}><dt>{t(`creditDocuments.${key}`)}</dt><dd data-credit-print-amount={key} data-value={value}><bdi>{money(value)}</bdi></dd></div>)}</dl>
    {receipt && data.historical && <p className="credit-paper-account"><span>{t("creditDocuments.totalAtPayment")}: <bdi>{money(data.total)}</bdi></span><span>{t("creditDocuments.paidAfter")}: <bdi>{money(data.paid)}</bdi></span></p>}
    {data.kind === "statement" && <p className="credit-paper-note">{t("creditDocuments.statementNote")}</p>}
    {receipt && data.note && <section className="credit-paper-note"><strong>{t("creditDocuments.note")}</strong><p dir="auto">{data.note}</p></section>}
    {visibility.footer && config.footer && <footer className="credit-paper-footer">{config.footer}</footer>}
  </article>;
}
