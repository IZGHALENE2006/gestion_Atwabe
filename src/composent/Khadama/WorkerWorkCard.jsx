import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoCalendarOutline, IoCheckmarkCircleOutline, IoChevronDownOutline, IoTimeOutline } from "react-icons/io5";
import { SFIFA_STOCK_FAMILIES, formatSfifaCode } from "../../../shared/sfifaStock.js";

export default function WorkerWorkCard({ work, canComplete, onComplete }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const date = value => new Date(value).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  const done = work.remainingQuantity === 0, isSfifa = work.category === "sfifa";
  const progress = done ? 100 : Math.min(99, Math.round(work.completedQuantity / work.quantity * 100));
  const amount = value => <><bdi>{number(value)}</bdi>{isSfifa && <span className="work-unit">{t("sfifaStock.unit")}</span>}</>;
  return <article data-worker-work={work._id} data-work-status={done ? "done" : "inProgress"} className={`work-card ${isSfifa ? `work-width-${work.sfifa.width}` : ""}`}>
    <header className="work-card-heading">
      <div className="work-card-identity">{isSfifa ? <>
        <span className={`work-width-badge work-width-badge-${work.sfifa.width}`}>{t(`sfifaStock.widths.${work.sfifa.width}`)}</span>
        <p className="work-code-label">{t("sfifaStock.code")}</p><h2><bdi dir="ltr">{formatSfifaCode(work.sfifa.code, work.sfifa.family)}</bdi></h2>
        <p className="work-family">{t("sfifaStock.family")} <bdi dir="ltr">{SFIFA_STOCK_FAMILIES.find(family => family.value === work.sfifa.family)?.label}</bdi></p>
      </> : <h2 dir="auto" className="work-product-name">{work.productName}</h2>}</div>
      <span className={`work-status-badge ${done ? "work-status-done" : "work-status-pending"}`}>{done ? <IoCheckmarkCircleOutline /> : <IoTimeOutline />}{t(done ? "workers.work.done" : "workers.work.inProgress")}</span>
    </header>
    <dl className={`work-remaining ${done ? "work-tone-green" : "work-tone-amber"}`}><dt>{t("workers.work.design.remainingQuantity")}</dt><dd data-work-quantity="remainingQuantity" data-value={work.remainingQuantity}>{amount(work.remainingQuantity)}</dd></dl>
    <dl className="work-card-amounts">{["quantity", "completedQuantity"].map(key => <div key={key} className={`work-mini-stat work-tone-${key === "quantity" ? "blue" : "green"}`}><dt>{t(`workers.work.design.${key}`)}</dt><dd data-work-quantity={key} data-value={work[key]}>{amount(work[key])}</dd></div>)}</dl>
    <div className="work-progress"><div><span>{t("workers.work.design.progress")}</span><strong><bdi>{number(progress)}%</bdi></strong></div><div role="progressbar" aria-label={t("workers.work.design.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="work-progress-track"><span style={{ width: `${progress}%` }} /></div></div>
    {!done && canComplete && <button type="button" data-complete-work onClick={() => onComplete(work)} className="work-button work-button-blue work-complete-button"><IoAddCircleOutline />{t("workers.work.complete")}</button>}
    {done && <p className="work-finished"><IoCheckmarkCircleOutline aria-hidden="true" />{t("workers.work.design.fullyCompleted")}</p>}
    <p className="work-assigned-date"><IoCalendarOutline aria-hidden="true" /><span>{t("workers.work.assignedDate")}: <time dateTime={work.createdAt}>{date(work.createdAt)}</time></span></p>
    {work.completions.length > 0 && <details className="work-history"><summary><span>{t("workers.work.history")} <b>{number(work.completions.length)}</b></span><IoChevronDownOutline aria-hidden="true" /></summary><ol>{[...work.completions].reverse().map(event => <li key={event._id} data-work-completion>
      <div className="work-history-top"><strong className="work-history-amount">+ {amount(event.quantity)}</strong><time dateTime={event.date}>{date(event.date)}</time></div>
      <p>{t(isSfifa ? "workers.work.sfifa.completedEntry" : "workers.work.completedEntry", { quantity: number(event.quantity) })}</p>
      <p className="work-history-balances">{t(isSfifa ? "workers.work.sfifa.balanceEntry" : "workers.work.balanceEntry", { before: number(event.before), after: number(event.after) })}</p>
    </li>)}</ol></details>}
  </article>;
}
