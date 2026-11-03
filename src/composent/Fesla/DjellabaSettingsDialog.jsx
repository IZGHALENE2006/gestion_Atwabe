import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline } from "react-icons/io5";
import { tailoringRateFields, validateDjellabaRates } from "../../../shared/tailoringCosts.js";
import { loadDjellabaCostSettings, saveDjellabaCostSettings } from "./feslaApi.js";

export default function DjellabaSettingsDialog({ token, garmentType = "djellaba", onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const rateFields = tailoringRateFields(garmentType);
  const costText = key => t(["fesla." + garmentType + ".costs." + key, "fesla.costs." + key]);
  const dialogRef = useRef(null), busyRef = useRef(false);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState({}), [fields, setFields] = useState({}), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); return () => dialog.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadDjellabaCostSettings(token, controller.signal, garmentType).then(value => {
      if (!controller.signal.aborted) { setResult({ attempt, value }); setDraft(Object.fromEntries(tailoringRateFields(garmentType).map(key => [key, String(value.rates?.[key] ?? "")]))); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) setResult({ attempt, error: true }); });
    return () => controller.abort();
  }, [token, attempt, garmentType]);
  const state = result?.attempt === attempt ? result : null;
  const close = () => { if (!busyRef.current) { dialogRef.current.close(); onClose(); } };
  const submit = async event => {
    event.preventDefault(); if (busyRef.current || !state?.value?.canEdit) return;
    let rates;
    try { rates = validateDjellabaRates(draft, garmentType); } catch (failure) { setFields(failure.fields || {}); return; }
    busyRef.current = true; setBusy(true); setError(""); setFields({});
    try { const value = await saveDjellabaCostSettings(rates, state.value.version, token, garmentType); if (dialogRef.current?.open) { dialogRef.current.close(); onSaved(value); } }
    catch (failure) { if (dialogRef.current?.open) { const code = failure.response?.data?.message; setError(["costSettingsConflict", "invalidCostSettings", "forbidden"].includes(code) ? code : "costSettingsFailed"); setFields(failure.response?.data?.fields || {}); } }
    finally { busyRef.current = false; if (dialogRef.current?.open) setBusy(false); }
  };
  return <dialog ref={dialogRef} dir={i18n.dir()} className="fesla-cost-settings-dialog" aria-labelledby="djellaba-settings-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="djellaba-settings-title">{costText("settingsTitle")}</h2><button type="button" onClick={close} disabled={busy} aria-label={t("dialog.close")}><IoCloseOutline size={24} /></button></header>
    <p className="fesla-cost-settings-hint">{costText("settingsHint")}</p>
    {!state ? <p role="status">{t("common.loading")}</p> : state.error ? <div role="alert"><p>{t("fesla.errors.costSettingsFailed")}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{t("fesla.retry")}</button></div> : <form noValidate onSubmit={submit}>
      <fieldset disabled={busy || !state.value.canEdit}>{rateFields.map(key => <div className="fesla-cost-setting-field" key={key}><label htmlFor={"djellaba-rate-" + key}>{costText("rates." + key)} ({t("fesla.currency")})</label><input id={"djellaba-rate-" + key} type="text" inputMode="decimal" dir="ltr" value={draft[key] ?? ""} maxLength={12} placeholder="0.00" required aria-invalid={Boolean(fields[key])} aria-describedby={fields[key] ? "djellaba-rate-" + key + "-error" : undefined} onChange={event => { setDraft(current => ({ ...current, [key]: event.target.value })); setFields({}); setError(""); }} />{fields[key] && <p id={"djellaba-rate-" + key + "-error"} className="fesla-action-error">{t("fesla.errors." + fields[key])}</p>}</div>)}</fieldset>
      {error && <div role="alert" className="fesla-action-error"><p>{t("fesla.errors." + error)}</p>{error === "costSettingsConflict" && <button type="button" disabled={busy} onClick={() => { setAttempt(value => value + 1); setError(""); }}>{costText("reloadPrices")}</button>}</div>}
      <footer><button type="button" disabled={busy} onClick={close}>{t("common.cancel")}</button>{state.value.canEdit && <button type="submit" disabled={busy}>{t(busy ? "common.loading" : "fesla.costs.saveSettings")}</button>}</footer>
    </form>}
  </dialog>;
}
