import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoWalletOutline } from "react-icons/io5";
import { tailoringMoneyCents } from "../../../shared/tailoring.js";
import { validateWorkerPayment, workerPayrollDay } from "../../../shared/workerPayroll.js";
import { saveWorkerPayment } from "./workersApi.js";

export default function WorkerPaymentDialog({ token, worker, months, month, onClose, onSaved, onReload }) {
  const { t, i18n } = useTranslation();
  const ref = useRef(null), submitting = useRef(false), submission = useRef(null);
  const [data, setData] = useState({ type: "settlement", month, amount: "", paidOn: workerPayrollDay(), note: "" });
  const [fields, setFields] = useState({}), [error, setError] = useState(""), [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false);
  const money = value => new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { style: "currency", currency: "MAD" }).format(value);
  const due = months.find(row => row.month === data.month)?.due || 0;
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  const patch = value => { setData(current => ({ ...current, ...value })); setFields({}); setError(""); };
  const submit = async event => {
    event.preventDefault();
    if (submitting.current) return;
    let input;
    try {
      input = validateWorkerPayment(data);
      if (input.type === "settlement" && tailoringMoneyCents(input.amount) > tailoringMoneyCents(due)) throw Object.assign(new Error("invalidPayment"), { fields: { amount: "paymentExceedsDue" } });
    } catch (failure) { setFields(failure.fields || {}); setError("invalidPayment"); return; }
    const fingerprint = JSON.stringify(input);
    if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, requestId: crypto.randomUUID() };
    submitting.current = true; setSaving(true); setError("");
    try {
      await saveWorkerPayment(token, worker._id, input, submission.current.requestId);
      if (ref.current?.open) onSaved();
    } catch (failure) {
      if (ref.current?.open) {
        const code = failure.response?.data?.message;
        setError(["invalidPayment", "paymentConflict", "paymentExceedsDue", "paymentRequestConflict", "invalidRequest", "forbidden", "notFound"].includes(code) ? code : "saveFailed");
        setFields(failure.response?.data?.fields || {});
        setUncertain(!failure.response || failure.response.status >= 500);
      }
    } finally { submitting.current = false; if (ref.current?.open) setSaving(false); }
  };
  const errorFor = key => fields[key] && <p role="alert" id={`worker-payment-${key}-error`} className="work-field-error">{t(`workers.payroll.errors.${fields[key]}`)}</p>;
  const props = key => ({ id: `worker-payment-${key}`, "aria-invalid": Boolean(fields[key]), "aria-describedby": fields[key] ? `worker-payment-${key}-error` : undefined, className: "work-input" });
  return <dialog ref={ref} className="work-dialog worker-payment-dialog" dir={i18n.dir()} aria-labelledby="worker-payment-title" onCancel={event => { event.preventDefault(); if (!submitting.current && !uncertain) onClose(); }}>
    <header className="work-dialog-header"><span className="work-dialog-icon"><IoWalletOutline /></span><div><h2 id="worker-payment-title">{t("workers.payroll.recordPayment")}</h2><p dir="auto">{worker.name}</p></div><button type="button" className="work-close" aria-label={t("dialog.close")} disabled={saving || uncertain} onClick={onClose}><IoCloseOutline /></button></header>
    <form onSubmit={submit} noValidate><div className="work-dialog-body"><fieldset disabled={saving || uncertain} className="work-form-fields">
      <fieldset className="payroll-payment-types"><legend>{t("workers.payroll.paymentType")}</legend>{["settlement", "advance"].map(type => <label key={type} className={data.type === type ? "is-selected" : ""}><input type="radio" name="worker-payment-type" value={type} checked={data.type === type} onChange={() => patch({ type })} /><strong>{t(`workers.payroll.types.${type}`)}</strong><small>{t(`workers.payroll.typeHints.${type}`)}</small></label>)}</fieldset>
      <div className="work-field"><label htmlFor="worker-payment-month">{t("workers.payroll.entitlementMonth")}</label><input {...props("month")} type="month" dir="ltr" value={data.month} onChange={event => patch({ month: event.target.value })} required /><p className="work-field-hint">{t("workers.payroll.monthHint")}</p>{errorFor("month")}</div>
      <p className="payroll-month-due">{t("workers.payroll.dueForMonth")} <strong data-payment-due={due}>{money(due)}</strong></p>
      <div className="work-numeric-grid"><div className="work-field"><label htmlFor="worker-payment-amount">{t("workers.payroll.amount")}</label><input {...props("amount")} inputMode="decimal" dir="ltr" value={data.amount} onChange={event => patch({ amount: event.target.value })} placeholder="0.00" maxLength={13} required autoFocus />{errorFor("amount")}</div><div className="work-field"><label htmlFor="worker-payment-paidOn">{t("workers.payroll.paymentDate")}</label><input {...props("paidOn")} type="date" dir="ltr" value={data.paidOn} max={workerPayrollDay()} onChange={event => patch({ paidOn: event.target.value })} required />{errorFor("paidOn")}</div></div>
      <div className="work-field"><label htmlFor="worker-payment-note">{t("workers.payroll.note")}</label><input {...props("note")} value={data.note} maxLength={300} onChange={event => patch({ note: event.target.value })} />{errorFor("note")}</div>
    </fieldset>{uncertain && <p role="status" className="work-feedback work-feedback-error">{t("workers.payroll.uncertain")}</p>}{error && <div role="alert" className="work-feedback work-feedback-error"><p>{t(`workers.payroll.errors.${error}`)}</p>{["paymentConflict", "paymentExceedsDue"].includes(error) && <button type="button" className="work-text-button" onClick={onReload}>{t("workers.retry")}</button>}</div>}</div>
      <footer className="work-dialog-footer"><button type="button" disabled={saving || uncertain} onClick={onClose} className="work-button work-button-quiet">{t("common.cancel")}</button><button type="submit" disabled={saving} className="work-button work-button-blue"><IoWalletOutline />{t(saving ? "common.loading" : uncertain ? "workers.retry" : "workers.payroll.savePayment")}</button></footer>
    </form>
  </dialog>;
}
