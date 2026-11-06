import { workerSfifaNumberLabel } from './workerSfifaLabels.js';
import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoDownloadOutline, IoRefreshOutline, IoTimeOutline, IoWalletOutline } from "react-icons/io5";
import { workerPayrollDay, workerPayrollMonth, workerPayrollSummary, WORKER_PAYROLL_TIMEZONE } from "../../../shared/workerPayroll.js";
import { buildWorkerPayrollReport } from "../../../shared/workerPayrollReports.js";
import { workerPayrollPeriodLabel } from "./workerPayrollReportLabels.js";
import { loadWorkerPayroll } from "./workersApi.js";
import WorkerPaymentDialog from "./WorkerPaymentDialog.jsx";
import WorkerPayrollHistoryDialog from "./WorkerPayrollHistoryDialog.jsx";
import "./workerPayroll.css";

export default function WorkerPayroll({ token, worker, revision }) {
  const { t, i18n } = useTranslation();
  const currentMonth = workerPayrollMonth();
  const exportRef = useRef(false);
  const [exporting, setExporting] = useState(""), [exportError, setExportError] = useState(false);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0), [open, setOpen] = useState(false), [payment, setPayment] = useState(false), [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState({ mode: "month", week: workerPayrollDay(), month: currentMonth, year: currentMonth.slice(0, 4), kind: "all" });
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
  let report;
  try { report = buildWorkerPayrollReport(state, filter); }
  catch { report = { period: null, entries: [], ...workerPayrollSummary([]) }; }
  const { months, totals, entries } = report;
  const periodColumns = filter.mode === "week" ? ["month", "earned", "paid", "balance"] : ["month", "earned", "paid", "due", "advance"];
  const periodAmounts = filter.mode === "week" ? ["earned", "paid", "balance"] : ["earned", "paid", "due", "advance"];
  const exportPDF = async mode => {
    if (exportRef.current || state.loading || state.error || !state.permissions?.download || mode !== "all" && !report.period) return;
    exportRef.current = true; setExporting(mode); setExportError(false);
    try {
      const { generateWorkerPayrollPDF } = await import("./workerPayrollPDF.js");
      await generateWorkerPayrollPDF({ worker, account: state, filter: mode === "all" ? { mode: "all", kind: "all" } : filter, language: i18n.language });
    } catch { setExportError(true); }
    finally { exportRef.current = false; setExporting(""); }
  };
  const years = [...new Set([currentMonth.slice(0, 4), ...(state.months || []).map(row => row.month.slice(0, 4))])].sort().reverse();
  return <section className="payroll-panel" data-worker-payroll aria-labelledby="worker-payroll-heading">
    <header className="payroll-heading"><div><h2 id="worker-payroll-heading"><IoWalletOutline />{t("workers.payroll.title")}</h2><p>{t("workers.payroll.scopeHint")}</p></div><div className="payroll-actions"><EmployeeOperation module="workers" anyOf={["payroll", "download"]}><button type="button" className="work-button work-button-quiet" data-payroll-history onClick={() => setOpen(true)} disabled={state.loading || Boolean(state.error)} aria-haspopup="dialog" aria-expanded={open} aria-controls="worker-payroll-history"><IoTimeOutline />{t("workers.payroll.history")}</button></EmployeeOperation>{state.permissions?.download && <button type="button" data-export-worker-account className="work-button work-button-blue" disabled={Boolean(exporting) || state.loading || Boolean(state.error)} onClick={() => exportPDF("all")}><IoDownloadOutline />{t(exporting === "all" ? "workers.payroll.pdf.exporting" : "workers.payroll.pdf.accountAction")}</button>}{!state.loading && !state.error && (state.permissions?.pay || state.permissions?.advance) && <button type="button" data-record-worker-payment className="work-button work-button-blue" onClick={() => { setPayment(true); setSaved(false); }}><IoWalletOutline />{t("workers.payroll.recordPayment")}</button>}<button type="button" className="work-button work-button-quiet" aria-label={t("workers.retry")} onClick={reload} disabled={state.loading}><IoRefreshOutline /></button></div></header>
    {exportError && !open && <p role="alert" className="work-feedback work-feedback-error">{t("workers.payroll.pdf.failed")}</p>}
    {state.loading ? <p role="status">{t("common.loading")}</p> : state.error ? <p role="alert" className="work-feedback work-feedback-error">{t(`workers.payroll.errors.${state.error}`)}</p> : <>
      <dl className="payroll-cards">{["earned", "paid", "due"].map(item => <div key={item} className={`payroll-card-${item}`}><dt>{t(`workers.payroll.total.${item}`)}</dt><dd data-payroll-total={item} data-value={state.totals[item]}>{money(state.totals[item])}</dd></div>)}</dl>
      {state.totals.advance > 0 && <p className="payroll-advance" data-payroll-advance={state.totals.advance}>{t("workers.payroll.advanceBalance", { amount: money(state.totals.advance) })}</p>}
      {state.totals.unpriced > 0 && <p className="payroll-warning">{t("workers.payroll.unpricedHint", { count: state.totals.unpriced })}</p>}
      {saved && <p role="status" className="work-feedback work-feedback-success">{t("workers.payroll.paymentSaved")}</p>}
      {state.months.some(row => row.due > 0) && <div className="payroll-unpaid"><strong>{t("workers.payroll.unpaidMonths")}</strong>{state.months.filter(row => row.due > 0).map(row => <EmployeeOperation key={row.month} module="workers" anyOf={["payroll", "download"]}><button type="button" data-unpaid-month={row.month} onClick={() => selectMonth(row.month)}><span>{monthLabel(row.month)}</span><bdi>{money(row.due)}</bdi></button></EmployeeOperation>)}</div>}
      {open && <WorkerPayrollHistoryDialog onExport={state.permissions?.download ? () => exportPDF("period") : undefined} exporting={Boolean(exporting) || !report.period} worker={worker} canPay={state.permissions?.pay || state.permissions?.advance} onClose={() => setOpen(false)} onRecordPayment={() => { setPayment(true); setSaved(false); }}>
        {exportError && <p role="alert" className="work-feedback work-feedback-error">{t("workers.payroll.pdf.failed")}</p>}
        <div className="payroll-filters"><label>{t("workers.payroll.period")}<select data-payroll-period value={filter.mode} onChange={event => setFilter(current => ({ ...current, mode: event.target.value }))}>{["week", "month", "year", "all"].map(mode => <option value={mode} key={mode}>{t(`workers.payroll.periods.${mode}`)}</option>)}</select></label>{filter.mode === "week" && <label>{t("workers.payroll.pdf.weekDay")}<input type="date" dir="ltr" data-payroll-week value={filter.week} onChange={event => { if (event.target.value) setFilter(current => ({ ...current, week: event.target.value })); }} /></label>}{filter.mode === "month" && <label>{t("workers.payroll.entitlementMonth")}<input type="month" dir="ltr" data-payroll-month value={filter.month} onChange={event => { if (event.target.value) setFilter(current => ({ ...current, month: event.target.value })); }} /></label>}{filter.mode === "year" && <label>{t("workers.payroll.year")}<select data-payroll-year value={filter.year} onChange={event => setFilter(current => ({ ...current, year: event.target.value }))}>{years.map(year => <option key={year}>{year}</option>)}</select></label>}<label>{t("workers.payroll.records")}<select data-payroll-kind value={filter.kind} onChange={event => setFilter(current => ({ ...current, kind: event.target.value }))}>{["all", "earning", "payment"].map(kind => <option key={kind} value={kind}>{t(`workers.payroll.kinds.${kind}`)}</option>)}</select></label></div>
        <p className="payroll-period-note" data-payroll-period-label role={!report.period ? "alert" : undefined}><strong>{report.period ? workerPayrollPeriodLabel(report.period, t, i18n.language) : t("workers.payroll.pdf.invalidPeriod")}</strong><span>{t(filter.mode === "week" ? "workers.payroll.pdf.weekHint" : "workers.payroll.pdf.monthHint")}</span></p>
        <dl className="payroll-period-totals">{periodAmounts.map(item => <div key={item}><dt>{t(`workers.payroll.selected.${item}`)}</dt><dd data-payroll-period-total={item} data-value={totals[item]}>{money(totals[item])}</dd></div>)}</dl>
        {months.length > 0 && <div className="payroll-table-scroll" role="region" tabIndex={0} aria-label={t("workers.payroll.monthSummary")}><table className="payroll-table"><caption>{t("workers.payroll.monthSummary")}</caption><thead><tr>{periodColumns.map(key => <th key={key} scope="col">{t(`workers.payroll.columns.${key}`)}</th>)}</tr></thead><tbody>{months.map(row => <tr key={row.month} data-payroll-month-row={row.month}><th scope="row"><button type="button" className="work-text-button" onClick={() => selectMonth(row.month)}>{monthLabel(row.month)}</button></th>{periodColumns.slice(1).map(key => <td key={key}>{money(row[key])}</td>)}</tr>)}</tbody></table></div>}
        <div className="payroll-table-scroll" role="region" tabIndex={0} aria-label={t("workers.payroll.history")}><table className="payroll-table payroll-ledger"><caption>{t("workers.payroll.history")}</caption><thead><tr>{["date", "month", "detail", "earned", "paid"].map(key => <th key={key} scope="col">{t(`workers.payroll.columns.${key}`)}</th>)}</tr></thead><tbody>{entries.map(entry => <tr key={entry.id} data-payroll-entry={entry.kind}><td><time>{date(entry)}</time></td><td>{monthLabel(entry.month)}</td><td>{entry.kind === "payment" ? <><strong className="payroll-payment-label">{t(`workers.payroll.types.${entry.paymentType}`)}</strong>{entry.note && <p dir="auto">{entry.note}</p>}{entry.createdByName && <small>{t("workers.payroll.recordedBy")} <span dir="auto">{entry.createdByName}</span></small>}</> : <><strong>{t(`workers.categories.${entry.category}`)} · <span dir="auto">{entry.sfifa ? `${t(`sfifaStock.widths.${entry.sfifa.width}`)} ${workerSfifaNumberLabel(entry.sfifa, t)}` : entry.productName}</span></strong><small>{number(entry.quantity)} {t(`workers.payroll.${entry.category === "sfifa" ? "meters" : "pieces"}`)}{entry.pieceWages ? ` · ${t("workers.work.pieceCards.variableWages")}` : entry.unitWage !== undefined ? ` × ${money(entry.unitWage)}` : ` · ${t("workers.payroll.unpriced")}`}</small>{entry.barcode && <bdi dir="ltr">{entry.barcode}</bdi>}{entry.deletedWork && <small>{t("workers.payroll.deletedWork")}</small>}</>}</td><td className="payroll-earned">{entry.kind === "earning" ? money(entry.amount) : entry.kind === "unpriced" ? t("workers.payroll.unpriced") : "—"}</td><td className="payroll-paid">{entry.kind === "payment" ? money(entry.amount) : "—"}</td></tr>)}</tbody></table>{!entries.length && <p className="payroll-empty">{t("workers.payroll.empty")}</p>}</div>
      </WorkerPayrollHistoryDialog>}
    </>}
    {payment && !state.loading && !state.error && <WorkerPaymentDialog token={token} worker={worker} months={state.months} month={filter.mode === "month" ? filter.month : currentMonth} onClose={() => setPayment(false)} onReload={reload} onSaved={() => { setSaved(true); reload(); }} />}
  </section>;
}
