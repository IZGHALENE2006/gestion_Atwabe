import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoRefreshOutline, IoTimeOutline, IoWalletOutline } from "react-icons/io5";
import { workerPayrollMonth, workerPayrollTotals, WORKER_PAYROLL_TIMEZONE } from "../../../shared/workerPayroll.js";
import { formatSfifaCode } from "../../../shared/sfifaStock.js";
import { loadWorkerPayroll } from "./workersApi.js";
import WorkerPaymentDialog from "./WorkerPaymentDialog.jsx";
import WorkerPayrollHistoryDialog from "./WorkerPayrollHistoryDialog.jsx";
import "./workerPayroll.css";

export default function WorkerPayroll({ token, worker, revision }) {
  const { t, i18n } = useTranslation();
  const currentMonth = workerPayrollMonth();
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0), [open, setOpen] = useState(false), [payment, setPayment] = useState(false), [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState({ mode: "month", month: currentMonth, year: currentMonth.slice(0, 4), kind: "all" });
  const key = `${worker._id}:${revision}:${attempt}`;
  const state = result?.key === key && result.token === token ? result : { loading: true };
  useEffect(() => {
    const controller = new AbortController();
    loadWorkerPayroll(token, worker._id, controller.signal).then(data => { if (!controller.signal.aborted) setResult({ ...data, key, token, loading: false }); }).catch(failure => { if (!controller.signal.aborted) setResult({ key, token, loading: false, error: failure.response?.status === 403 ? "forbidden" : "loadFailed" }); });
    return () => controller.abort();
  }, [token, worker._id, key]);
  const reload = () => { setPayment(false); setAttempt(value => value + 1); };
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const money = value => new Intl.NumberFormat(locale, { style: "currency", currency: "MAD" }).format(value);
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const monthLabel = month => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T12:00:00Z"));
  const date = entry => new Intl.DateTimeFormat(locale, entry.kind === "payment" ? { dateStyle: "short", timeZone: "UTC" } : { dateStyle: "short", timeStyle: "short", timeZone: WORKER_PAYROLL_TIMEZONE }).format(new Date(entry.kind === "payment" ? entry.paidOn + "T12:00:00Z" : entry.date));
  const selectMonth = month => { setFilter(current => ({ ...current, mode: "month", month, year: month.slice(0, 4) })); setOpen(true); };
  const matches = month => filter.mode === "all" || (filter.mode === "year" ? month.startsWith(filter.year + "-") : month === filter.month);
  const months = (state.months || []).filter(row => matches(row.month));
  const totals = workerPayrollTotals(months);
  const entries = (state.entries || []).filter(entry => matches(entry.month) && (filter.kind === "all" || (filter.kind === "payment" ? entry.kind === "payment" : entry.kind !== "payment")));
  const years = [...new Set([currentMonth.slice(0, 4), ...(state.months || []).map(row => row.month.slice(0, 4))])].sort().reverse();
  return <section className="payroll-panel" data-worker-payroll aria-labelledby="worker-payroll-heading">
    <header className="payroll-heading"><div><h2 id="worker-payroll-heading"><IoWalletOutline />{t("workers.payroll.title")}</h2><p>{t("workers.payroll.scopeHint")}</p></div><div className="payroll-actions"><button type="button" className="work-button work-button-quiet" data-payroll-history onClick={() => setOpen(true)} disabled={state.loading || Boolean(state.error)} aria-haspopup="dialog" aria-expanded={open} aria-controls="worker-payroll-history"><IoTimeOutline />{t("workers.payroll.history")}</button>{!state.loading && !state.error && state.permissions?.update && <button type="button" data-record-worker-payment className="work-button work-button-blue" onClick={() => { setPayment(true); setSaved(false); }}><IoWalletOutline />{t("workers.payroll.recordPayment")}</button>}<button type="button" className="work-button work-button-quiet" aria-label={t("workers.retry")} onClick={reload} disabled={state.loading}><IoRefreshOutline /></button></div></header>
    {state.loading ? <p role="status">{t("common.loading")}</p> : state.error ? <p role="alert" className="work-feedback work-feedback-error">{t(`workers.payroll.errors.${state.error}`)}</p> : <>
      <dl className="payroll-cards">{["earned", "paid", "due"].map(item => <div key={item} className={`payroll-card-${item}`}><dt>{t(`workers.payroll.total.${item}`)}</dt><dd data-payroll-total={item} data-value={state.totals[item]}>{money(state.totals[item])}</dd></div>)}</dl>
      {state.totals.advance > 0 && <p className="payroll-advance" data-payroll-advance={state.totals.advance}>{t("workers.payroll.advanceBalance", { amount: money(state.totals.advance) })}</p>}
      {state.totals.unpriced > 0 && <p className="payroll-warning">{t("workers.payroll.unpricedHint", { count: state.totals.unpriced })}</p>}
      {saved && <p role="status" className="work-feedback work-feedback-success">{t("workers.payroll.paymentSaved")}</p>}
      {state.months.some(row => row.due > 0) && <div className="payroll-unpaid"><strong>{t("workers.payroll.unpaidMonths")}</strong>{state.months.filter(row => row.due > 0).map(row => <button type="button" key={row.month} data-unpaid-month={row.month} onClick={() => selectMonth(row.month)}><span>{monthLabel(row.month)}</span><bdi>{money(row.due)}</bdi></button>)}</div>}
      {open && <WorkerPayrollHistoryDialog worker={worker} canPay={state.permissions?.update} onClose={() => setOpen(false)} onRecordPayment={() => { setPayment(true); setSaved(false); }}>
        <div className="payroll-filters"><label>{t("workers.payroll.period")}<select data-payroll-period value={filter.mode} onChange={event => setFilter(current => ({ ...current, mode: event.target.value }))}>{["month", "year", "all"].map(mode => <option value={mode} key={mode}>{t(`workers.payroll.periods.${mode}`)}</option>)}</select></label>{filter.mode === "month" && <label>{t("workers.payroll.entitlementMonth")}<input type="month" dir="ltr" data-payroll-month value={filter.month} onChange={event => { if (event.target.value) setFilter(current => ({ ...current, month: event.target.value })); }} /></label>}{filter.mode === "year" && <label>{t("workers.payroll.year")}<select data-payroll-year value={filter.year} onChange={event => setFilter(current => ({ ...current, year: event.target.value }))}>{years.map(year => <option key={year}>{year}</option>)}</select></label>}<label>{t("workers.payroll.records")}<select data-payroll-kind value={filter.kind} onChange={event => setFilter(current => ({ ...current, kind: event.target.value }))}>{["all", "earning", "payment"].map(kind => <option key={kind} value={kind}>{t(`workers.payroll.kinds.${kind}`)}</option>)}</select></label></div>
        <dl className="payroll-period-totals">{["earned", "paid", "due", "advance"].map(item => <div key={item}><dt>{t(`workers.payroll.selected.${item}`)}</dt><dd data-payroll-period-total={item} data-value={totals[item]}>{money(totals[item])}</dd></div>)}</dl>
        {months.length > 0 && <div className="payroll-table-scroll" role="region" tabIndex={0} aria-label={t("workers.payroll.monthSummary")}><table className="payroll-table"><caption>{t("workers.payroll.monthSummary")}</caption><thead><tr>{["month", "earned", "paid", "due", "advance"].map(key => <th key={key} scope="col">{t(`workers.payroll.columns.${key}`)}</th>)}</tr></thead><tbody>{months.map(row => <tr key={row.month} data-payroll-month-row={row.month}><th scope="row"><button type="button" className="work-text-button" onClick={() => selectMonth(row.month)}>{monthLabel(row.month)}</button></th>{["earned", "paid", "due", "advance"].map(key => <td key={key}>{money(row[key])}</td>)}</tr>)}</tbody></table></div>}
        <div className="payroll-table-scroll" role="region" tabIndex={0} aria-label={t("workers.payroll.history")}><table className="payroll-table payroll-ledger"><caption>{t("workers.payroll.history")}</caption><thead><tr>{["date", "month", "detail", "earned", "paid"].map(key => <th key={key} scope="col">{t(`workers.payroll.columns.${key}`)}</th>)}</tr></thead><tbody>{entries.map(entry => <tr key={entry.id} data-payroll-entry={entry.kind}><td><time>{date(entry)}</time></td><td>{monthLabel(entry.month)}</td><td>{entry.kind === "payment" ? <><strong className="payroll-payment-label">{t(`workers.payroll.types.${entry.paymentType}`)}</strong>{entry.note && <p dir="auto">{entry.note}</p>}{entry.createdByName && <small>{t("workers.payroll.recordedBy")} <span dir="auto">{entry.createdByName}</span></small>}</> : <><strong>{t(`workers.categories.${entry.category}`)} · <span dir="auto">{entry.sfifa ? `${t(`sfifaStock.widths.${entry.sfifa.width}`)} ${formatSfifaCode(entry.sfifa.code, entry.sfifa.family)}` : entry.productName}</span></strong><small>{number(entry.quantity)} {t(`workers.payroll.${entry.category === "sfifa" ? "meters" : "pieces"}`)}{entry.unitWage !== undefined ? ` × ${money(entry.unitWage)}` : ` · ${t("workers.payroll.unpriced")}`}</small>{entry.barcode && <bdi dir="ltr">{entry.barcode}</bdi>}{entry.deletedWork && <small>{t("workers.payroll.deletedWork")}</small>}</>}</td><td className="payroll-earned">{entry.kind === "earning" ? money(entry.amount) : entry.kind === "unpriced" ? t("workers.payroll.unpriced") : "—"}</td><td className="payroll-paid">{entry.kind === "payment" ? money(entry.amount) : "—"}</td></tr>)}</tbody></table>{!entries.length && <p className="payroll-empty">{t("workers.payroll.empty")}</p>}</div>
      </WorkerPayrollHistoryDialog>}
    </>}
    {payment && !state.loading && !state.error && <WorkerPaymentDialog token={token} worker={worker} months={state.months} month={filter.mode === "month" ? filter.month : currentMonth} onClose={() => setPayment(false)} onReload={reload} onSaved={() => { setSaved(true); reload(); }} />}
  </section>;
}
