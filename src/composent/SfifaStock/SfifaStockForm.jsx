import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline } from "react-icons/io5";
import { SFIFA_METER_TYPES, SFIFA_STOCK_FAMILIES, SFIFA_STOCK_WIDTHS, formatSfifaCode, parseSfifaStyleMeters, validateSfifaClassification, validateSfifaStock } from "../../../shared/sfifaStock.js";
import { saveSfifaStock } from "./sfifaStockApi.js";

export default function SfifaStockForm({ token, stock, initial, onClose, onSaved, onReload }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), savingRef = useRef(false), submissionRef = useRef(null);
  const classifying = Boolean(stock?.isUnassigned), correcting = Boolean(stock && !stock.isUnassigned);
  const [data, setData] = useState(() => ({ width: stock?.width || initial?.width || "thin", family: stock?.family || initial?.family || SFIFA_STOCK_FAMILIES[0].value, code: stock && !stock.isUnassigned ? formatSfifaCode(stock.code, stock.family) : "", quantity: stock ? String(stock.quantity) : "", ...(!stock ? { styleMeters: { single: "", double: "", gradient: "" } } : {}) }));
  const range = SFIFA_STOCK_FAMILIES.find(family => family.value === data.family);
  let styles;
  try { styles = parseSfifaStyleMeters(data.styleMeters); } catch { styles = null; }
  const automaticQuantity = !stock && styles !== undefined;
  const fieldId = key => `sfifa-stock-${key.replaceAll(".", "-")}`;
  const [fields, setFields] = useState({}), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal(); dialog.querySelector(stock?.isUnassigned ? "#sfifa-stock-code" : stock ? "#sfifa-stock-quantity" : "#sfifa-stock-width")?.focus();
    return () => dialog.close();
  }, [stock]);
  const patch = value => { setData(current => ({ ...current, ...value })); setFields({}); setError(""); };
  const submit = async event => {
    event.preventDefault();
    if (savingRef.current) return;
    let input;
    try { input = classifying ? validateSfifaClassification(data, stock.quantity) : validateSfifaStock(data, { allowZero: correcting }); }
    catch (failure) { setFields(failure.fields || {}); setError("invalidStock"); dialogRef.current?.querySelector(`#${fieldId(Object.keys(failure.fields || {})[0] || "quantity")}`)?.focus(); return; }
    const fingerprint = JSON.stringify(input);
    if (!stock && submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, requestId: crypto.randomUUID() };
    savingRef.current = true; setSaving(true); setError(""); setFields({});
    try {
      const saved = await saveSfifaStock(input, token, submissionRef.current?.requestId, stock);
      if (dialogRef.current?.open) onSaved(saved);
    } catch (failure) {
      if (dialogRef.current?.open) {
        const code = failure.response?.data?.message;
        setError(["invalidStock", "invalidRequest", "requestConflict", "stockConflict", "notFound", "forbidden"].includes(code) ? code : "saveFailed");
        setFields(failure.response?.data?.fields || {});
      }
    } finally { savingRef.current = false; if (dialogRef.current?.open) setSaving(false); }
  };
  const inputClass = "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-primary-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800";
  const props = key => ({ id: fieldId(key), className: inputClass, "aria-invalid": Boolean(fields[key]), "aria-describedby": fields[key] ? `${fieldId(key)}-error` : undefined });
  const errorFor = key => fields[key] && <p id={`${fieldId(key)}-error`} className="mt-2 text-xs text-rose-600 dark:text-rose-400">{t(`sfifaStock.errors.${fields[key]}`)}</p>;
  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="sfifa-stock-form-title" onCancel={event => { event.preventDefault(); if (!savingRef.current) onClose(); }} className="fixed top-4 right-4 bottom-auto left-auto m-auto max-h-[90dvh] w-[calc(100dvw-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:inset-0">
    <header className="mb-5 flex items-start justify-between gap-3"><div><h2 id="sfifa-stock-form-title" className="text-xl font-bold">{t(classifying ? "sfifaStock.classify" : stock ? "sfifaStock.edit" : "sfifaStock.add")}</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{t(classifying ? "sfifaStock.classifyHint" : stock ? "sfifaStock.editHint" : "sfifaStock.addHint")}</p></div><button type="button" disabled={saving} onClick={onClose} aria-label={t("dialog.close")} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><IoCloseOutline size={24} /></button></header>
    <form noValidate onSubmit={submit} className="space-y-5"><fieldset disabled={saving} className="min-w-0 space-y-4">
      <div><label htmlFor="sfifa-stock-width" className="mb-2 block text-sm font-semibold">{t("sfifaStock.width")}</label><select {...props("width")} disabled={saving || Boolean(stock)} value={data.width} onChange={event => patch({ width: event.target.value })}>{SFIFA_STOCK_WIDTHS.map(width => <option key={width} value={width}>{t(`sfifaStock.widths.${width}`)}</option>)}</select>{errorFor("width")}</div>
      <div><label htmlFor="sfifa-stock-family" className="mb-2 block text-sm font-semibold">{t("sfifaStock.family")}</label><select {...props("family")} dir="ltr" disabled={saving || Boolean(stock)} value={data.family} onChange={event => patch({ family: event.target.value, code: "" })}>{SFIFA_STOCK_FAMILIES.map(family => <option key={family.value} value={family.value}>{family.label}</option>)}</select>{errorFor("family")}</div>
      <div><label htmlFor="sfifa-stock-code" className="mb-2 block text-sm font-semibold">{t("sfifaStock.code")}</label><input {...props("code")} type="text" inputMode="numeric" dir="ltr" disabled={saving || correcting} value={data.code} onChange={event => patch({ code: event.target.value })} maxLength={4} required aria-describedby={`sfifa-stock-code-hint${fields.code ? " sfifa-stock-code-error" : ""}`} /><p id="sfifa-stock-code-hint" className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("sfifaStock.codeHint", { min: range.min, max: range.max })}</p>{errorFor("code")}</div>
      {!stock && <section id="sfifa-stock-styleMeters" tabIndex={-1} aria-labelledby="sfifa-style-meters-title" className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 id="sfifa-style-meters-title" className="text-sm font-bold text-blue-900 dark:text-blue-200">{t("sfifaStock.styleMetersTitle")}</h3><span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t("sfifaStock.optional")}</span></div>
        <p id="sfifa-style-meters-hint" className="mb-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{t("sfifaStock.styleMetersHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{SFIFA_METER_TYPES.map(key => <div key={key}><label htmlFor={fieldId(`styleMeters.${key}`)} className="mb-2 block text-sm font-semibold">{t(`sfifaStock.meterTypes.${key}`)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">({t("sfifaStock.unit")})</span></label><input {...props(`styleMeters.${key}`)} type="text" inputMode="decimal" dir="ltr" placeholder="0" value={data.styleMeters[key]} onChange={event => patch({ styleMeters: { ...data.styleMeters, [key]: event.target.value } })} maxLength={11} aria-describedby={`sfifa-style-meters-hint${fields[`styleMeters.${key}`] ? ` ${fieldId(`styleMeters.${key}`)}-error` : ""}`} />{errorFor(`styleMeters.${key}`)}</div>)}</div>
        {errorFor("styleMeters")}
      </section>}
      <div><label htmlFor="sfifa-stock-quantity" className="mb-2 block text-sm font-semibold">{t("sfifaStock.quantity")}</label><input {...props("quantity")} type="text" inputMode="decimal" dir="ltr" value={automaticQuantity ? styles?.quantity ?? "" : data.quantity} readOnly={automaticQuantity} onChange={event => patch({ quantity: event.target.value })} maxLength={11} required aria-describedby={`${automaticQuantity ? "sfifa-stock-quantity-hint " : ""}${fields.quantity ? "sfifa-stock-quantity-error" : ""}`.trim() || undefined} />{automaticQuantity && <p id="sfifa-stock-quantity-hint" className="mt-2 text-xs text-blue-700 dark:text-blue-300" role="status">{t("sfifaStock.autoQuantityHint")}</p>}{errorFor("quantity")}</div>
    </fieldset>{error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"><p>{t(`sfifaStock.errors.${error}`)}</p>{["stockConflict", "requestConflict", "notFound"].includes(error) && <button type="button" onClick={onReload} disabled={saving} className="mt-2 font-bold underline">{t("sfifaStock.reload")}</button>}</div>}
      <footer className="flex flex-wrap justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold disabled:opacity-50 dark:border-slate-700">{t("common.cancel")}</button><button type="submit" disabled={saving} className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{t(saving ? "common.loading" : classifying ? "sfifaStock.saveClassification" : stock ? "sfifaStock.saveBalance" : "sfifaStock.saveAddition")}</button></footer>
    </form>
  </dialog>;
}
