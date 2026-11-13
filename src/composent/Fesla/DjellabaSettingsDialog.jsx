import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline } from "react-icons/io5";
import { tailoringMoneyCents } from "../../../shared/tailoring.js";
import { tailoringProfitAmount } from "../../../shared/tailoring.js";
import { tailoringRateFields, validateDjellabaRates } from "../../../shared/tailoringCosts.js";
import { loadDjellabaCostSettings, saveDjellabaCostSettings } from "./feslaApi.js";

export default function DjellabaSettingsDialog({ token, garmentType = "djellaba", onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const trousers = garmentType === "trousers";
  const money = value => value === null ? "—" : value.toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const costText = key => garmentType === "shirts" && ["settingsTitle", "settingsHint"].includes(key) ? t("fesla.adjustments." + (key === "settingsTitle" ? "shirtsSettingsTitle" : "fourFilleSettingsHint")) : t(["fesla." + garmentType + ".costs." + key, "fesla.costs." + key]);
  const dialogRef = useRef(null), busyRef = useRef(false);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState({}), [fields, setFields] = useState({}), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); return () => dialog.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadDjellabaCostSettings(token, controller.signal, garmentType).then(value => {
      if (!controller.signal.aborted) { setResult({ attempt, value }); setDraft({ ...Object.fromEntries(tailoringRateFields(garmentType, 3).map(key => [key, String(value.rates?.[key] ?? "")])), fourFillePrice: String(value.fourFillePrice ?? 0) }); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) setResult({ attempt, error: true }); });
    return () => controller.abort();
  }, [token, attempt, garmentType]);
  const state = result?.attempt === attempt ? result : null;
  const close = () => { if (!busyRef.current) { dialogRef.current.close(); onClose(); } };
  const submit = async event => {
    event.preventDefault(); if (busyRef.current || !state?.value?.canEdit) return;
    let rates;
    try { rates = validateDjellabaRates(draft, garmentType, 3); if (!trousers && tailoringMoneyCents(draft.fourFillePrice) === null) throw Object.assign(new Error("invalidMoney"), { fields: { fourFillePrice: "invalidMoney" } }); } catch (failure) { setFields(failure.fields || {}); return; }
    busyRef.current = true; setBusy(true); setError(""); setFields({});
    try { const value = await saveDjellabaCostSettings(rates, state.value.version, token, garmentType, trousers ? undefined : draft.fourFillePrice); if (dialogRef.current?.open) { dialogRef.current.close(); onSaved(value); } }
    catch (failure) { if (dialogRef.current?.open) { const code = failure.response?.data?.message; setError(["costSettingsConflict", "invalidCostSettings", "forbidden"].includes(code) ? code : "costSettingsFailed"); setFields(failure.response?.data?.fields || {}); } }
    finally { busyRef.current = false; if (dialogRef.current?.open) setBusy(false); }
  };
  const rateInput = (key, label) => <div className="fesla-cost-setting-field" key={key}><label htmlFor={"djellaba-rate-" + key}>{label} ({t("fesla.currency")})</label><input id={"djellaba-rate-" + key} type="text" inputMode="decimal" dir="ltr" value={draft[key] ?? ""} maxLength={12} placeholder="0.00" required aria-invalid={Boolean(fields[key])} aria-describedby={fields[key] ? "djellaba-rate-" + key + "-error" : undefined} onChange={event => { setDraft(current => ({ ...current, [key]: event.target.value })); setFields({}); setError(""); }} />{fields[key] && <p id={"djellaba-rate-" + key + "-error"} className="fesla-action-error">{t("fesla.errors." + fields[key])}</p>}</div>;
  return <dialog ref={dialogRef} dir={i18n.dir()} className="fesla-cost-settings-dialog" aria-labelledby="djellaba-settings-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="djellaba-settings-title">{costText("settingsTitle")}</h2><button type="button" onClick={close} disabled={busy} aria-label={t("dialog.close")}><IoCloseOutline size={24} /></button></header>
    <p className="fesla-cost-settings-hint">{["trousers", "shirts"].includes(garmentType) ? costText("settingsHint") : t("fesla.salePricing.settingsHint")}</p>
    {!state ? <p role="status">{t("common.loading")}</p> : state.error ? <div role="alert"><p>{t("fesla.errors.costSettingsFailed")}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{t("fesla.retry")}</button></div> : <form noValidate onSubmit={submit}>
      <fieldset disabled={busy || !state.value.canEdit}>
        {garmentType === "shirts" ? null : trousers ? tailoringRateFields("trousers").map(key => rateInput(key, costText("rates." + key))) : ["thin", "thick"].map(width => {
          const margin = tailoringProfitAmount(draft[width + "SfifaPrice"], draft[width + "SfifaCostPrice"]);
          return <section className="fesla-sfifa-price-group" key={width} data-sfifa-price-group={width} aria-labelledby={"sfifa-price-" + width}>
            <h3 id={"sfifa-price-" + width}>{t("fesla.widths." + width)}</h3>
            <div className="fesla-sfifa-price-fields">{rateInput(width + "SfifaCostPrice", t("fesla.salePricing.costPrice"))}{rateInput(width + "SfifaPrice", t("fesla.salePricing.salePrice"))}</div>
            <p className={"fesla-sfifa-margin" + (margin < 0 ? " is-loss" : "")}><span>{t("fesla.salePricing.profitMargin")}</span><output aria-live="polite" data-sfifa-margin={width} data-value={margin ?? ""}><bdi>{money(margin)} {t("fesla.currency")}</bdi></output></p>
          </section>;
        })}
        {!trousers && <section className="fesla-sfifa-price-group" data-four-fille-settings>{rateInput("fourFillePrice", t("fesla.adjustments.fourFillePrice"))}<p className="fesla-cost-settings-hint">{t("fesla.adjustments.fourFilleSettingsHint")}</p></section>}
      </fieldset>
      {error && <div role="alert" className="fesla-action-error"><p>{t("fesla.errors." + error)}</p>{error === "costSettingsConflict" && <button type="button" disabled={busy} onClick={() => { setAttempt(value => value + 1); setError(""); }}>{costText("reloadPrices")}</button>}</div>}
      <footer><button type="button" disabled={busy} onClick={close}>{t("common.cancel")}</button>{state.value.canEdit && <button type="submit" disabled={busy}>{t(busy ? "common.loading" : "fesla.costs.saveSettings")}</button>}</footer>
    </form>}
  </dialog>;
}
