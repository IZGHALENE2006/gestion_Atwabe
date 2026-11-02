import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline } from "react-icons/io5";
import { WORKER_CATEGORIES, validateTailoringWorker, workerCategories } from "../../../shared/workers.js";
import { saveTailoringWorker } from "./workersApi.js";

export default function WorkerForm({ category, worker, token, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), savingRef = useRef(false), submissionRef = useRef(null);
  const [data, setData] = useState(() => worker ? { name: worker.name, phone: worker.phone, categories: workerCategories(worker) } : { name: "", phone: "", categories: [category] });
  const [fields, setFields] = useState({}), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal(); dialog.querySelector("#worker-name")?.focus();
    return () => dialog.close();
  }, []);
  const patch = value => { setData(current => ({ ...current, ...value })); setFields({}); setError(""); };
  const submit = async event => {
    event.preventDefault();
    if (savingRef.current) return;
    let input;
    try { input = validateTailoringWorker(data); }
    catch (failure) { setFields(failure.fields || {}); setError("invalidWorker"); dialogRef.current?.querySelector(`#worker-${Object.keys(failure.fields || {})[0] || "name"}`)?.focus(); return; }
    const fingerprint = JSON.stringify(input);
    if (!worker && submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, requestId: crypto.randomUUID() };
    savingRef.current = true; setSaving(true); setError(""); setFields({});
    try {
      const saved = await saveTailoringWorker(input, token, submissionRef.current?.requestId, worker);
      if (dialogRef.current?.open) onSaved(saved);
    } catch (failure) {
      if (dialogRef.current?.open) {
        const code = failure.response?.data?.message;
        setError(["invalidWorker", "invalidRequest", "requestConflict", "forbidden", "notFound", "conflict"].includes(code) ? code : "saveFailed");
        setFields(failure.response?.data?.fields || {});
      }
    } finally { savingRef.current = false; if (dialogRef.current?.open) setSaving(false); }
  };
  const inputClass = "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-primary-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800";
  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="worker-form-title" onCancel={event => { event.preventDefault(); if (!savingRef.current) onClose(); }} className="fixed top-4 right-4 bottom-auto left-auto m-auto max-h-[90dvh] w-[calc(100dvw-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:inset-0">
    <header className="mb-5 flex items-start justify-between gap-3"><div><h2 id="worker-form-title" className="text-xl font-bold">{t(worker ? "workers.edit" : "workers.add")}</h2><p className="mt-2 text-sm text-primary-700 dark:text-primary-300">{t(`workers.categories.${category}`)}</p></div><button type="button" disabled={saving} onClick={onClose} aria-label={t("dialog.close")} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><IoCloseOutline size={24} /></button></header>
    <form noValidate onSubmit={submit} className="space-y-5">
      <fieldset disabled={saving} className="min-w-0 space-y-4">{["name", "phone"].map(key => <div key={key}><label htmlFor={`worker-${key}`} className="mb-2 block text-sm font-semibold">{t(`workers.${key}`)}</label><input id={`worker-${key}`} type={key === "phone" ? "tel" : "text"} dir={key === "phone" ? "ltr" : "auto"} value={data[key]} onChange={event => patch({ [key]: event.target.value })} autoComplete={key === "phone" ? "tel" : "name"} maxLength={key === "phone" ? 40 : 160} required aria-invalid={Boolean(fields[key])} aria-describedby={fields[key] ? `worker-${key}-error` : undefined} className={inputClass} />{fields[key] && <p id={`worker-${key}-error`} className="mt-2 text-xs text-rose-600 dark:text-rose-400">{t(`workers.errors.${fields[key]}`)}</p>}</div>)}</fieldset>
      <fieldset id="worker-categories" tabIndex={-1} disabled={saving} aria-invalid={Boolean(fields.categories)} aria-describedby={`worker-categories-hint${fields.categories ? " worker-categories-error" : ""}`} className="min-w-0 rounded-xl border border-slate-200 p-4 outline-none focus:border-primary-500 dark:border-slate-700">
        <legend className="px-2 text-sm font-bold">{t("workers.sections")}</legend><p id="worker-categories-hint" className="mb-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{t("workers.sectionsHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">{WORKER_CATEGORIES.map(key => <label key={key} htmlFor={`worker-section-${key}`} className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${data.categories.includes(key) ? "border-primary-400 bg-primary-50 text-primary-800 dark:border-primary-600 dark:bg-primary-950/30 dark:text-primary-200" : "border-slate-200 dark:border-slate-700"}`}><input id={`worker-section-${key}`} type="checkbox" checked={data.categories.includes(key)} onChange={event => patch({ categories: event.target.checked ? [...data.categories, key] : data.categories.filter(value => value !== key) })} className="h-4 w-4 shrink-0 accent-primary-600" />{t(`workers.categories.${key}`)}</label>)}</div>
        {fields.categories && <p id="worker-categories-error" className="mt-3 text-xs text-rose-600 dark:text-rose-400">{t(`workers.errors.${fields.categories}`)}</p>}
      </fieldset>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{t(`workers.errors.${error}`)}</p>}
      <footer className="flex flex-wrap justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold disabled:opacity-50 dark:border-slate-700">{t("common.cancel")}</button><button type="submit" disabled={saving} className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{t(saving ? "common.loading" : "workers.save")}</button></footer>
    </form>
  </dialog>;
}
