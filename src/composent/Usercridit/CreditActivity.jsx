import { useTranslation } from "react-i18next";
import { creditActivity } from "../../../shared/creditDocuments.js";

export default function CreditActivity({ user }) {
  const { t, i18n } = useTranslation(), events = creditActivity(user);
  const money = value => `${new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${i18n.language === "ar" ? "درهم" : "DH"}`;
  return <section className="credit-activity" data-credit-activity dir={i18n.dir()} aria-labelledby="credit-activity-title">
    <header><h3 id="credit-activity-title">{t("creditAudit.title")}</h3><p>{t("creditAudit.description")}</p></header>
    <div className="credit-activity-scroll"><table><thead><tr>{["date", "operation", "performedBy", "details", "reference"].map(key => <th key={key} scope="col">{t(`creditAudit.${key}`)}</th>)}</tr></thead><tbody>{events.map(event => <tr key={event.id} data-credit-activity-kind={event.kind}>
      <td><time dateTime={event.date}>{event.date ? new Date(event.date).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA") : "—"}</time></td>
      <td>{t(`creditAudit.${event.kind}`)}</td>
      <td data-credit-activity-actor><span dir="auto">{event.actor?.name || t("creditAudit.unrecorded")}</span>{event.actor && <small>{t(event.actor.role === "admin" ? "creditAudit.admin" : "creditAudit.employee")}</small>}</td>
      <td>{event.kind === "customer" ? <span dir="auto">{user.name}</span> : ["credit", "sale"].includes(event.kind) ? t("creditAudit.invoiceSummary", { total: money(event.total), paid: money(event.paid), remaining: money(event.remaining) }) : <>{t("creditAudit.paymentSummary", { amount: money(event.amount) })}{event.remaining != null && <small>{t("creditAudit.paymentBalance", { remaining: money(event.remaining) })}</small>}{event.note && <small dir="auto">{event.note}</small>}</>}</td>
      <td><bdi dir="ltr">{event.reference || "—"}</bdi></td>
    </tr>)}</tbody></table></div>
    {!events.length && <p className="credit-activity-empty">{t("creditAudit.empty")}</p>}
  </section>;
}
