import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoSaveOutline } from "react-icons/io5";
import { CLIENT_TYPES, CLIENT_FIELD_LIMITS, CLIENT_REQUIRED_FIELDS, validateClient } from "../../../shared/clients.js";
import { saveClient } from "./clientsApi.js";

const inputClass = "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 aria-invalid:border-rose-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

export default function ClientForm({ client, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(() => ({ type: client?.type || "person", ...Object.fromEntries(Object.keys(CLIENT_FIELD_LIMITS).map((key) => [key, client?.[key] || ""])) }));
  const [fields, setFields] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const change = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFields((current) => ({ ...current, [key]: undefined }));
    setError("");
  };
  const showErrors = (value) => {
    setFields(value);
    const first = ["type", ...Object.keys(CLIENT_FIELD_LIMITS)].find((key) => value[key]);
    if (first) dialogRef.current.querySelector(`#client-${first}`)?.focus();
  };
  const submit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    let input;
    try { input = validateClient(draft); } catch (validation) {
      showErrors(validation.fields || {});
      setError("invalidClient");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setFields({});
    try {
      const saved = await saveClient(input, client?._id);
      if (dialogRef.current?.open) onSaved(saved);
    } catch (failure) {
      const response = failure.response?.data;
      const code = ["forbidden", "notFound", "invalidClient"].includes(response?.message) ? response.message : "saveFailed";
      if (response?.fields) showErrors(response.fields);
      setError(code);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="client-form-title" onCancel={(event) => { event.preventDefault(); if (!savingRef.current) onClose(); }} className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-700">
      <h2 id="client-form-title" className="text-xl font-bold">{t(client ? "clients.edit" : "clients.add")}</h2>
      <button type="button" disabled={saving} onClick={onClose} aria-label={t("dialog.close")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800"><IoCloseOutline size={24} /></button>
    </header>
    <form noValidate onSubmit={submit} className="p-5 sm:p-6">
      <fieldset disabled={saving} className="min-w-0 space-y-5 disabled:opacity-70">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("clients.requiredHint")}</p>
        <div>
          <label htmlFor="client-type" className="mb-2 block text-sm font-bold">{t("clients.type")} *</label>
          <select id="client-type" value={draft.type} onChange={(event) => change("type", event.target.value)} required aria-invalid={Boolean(fields.type)} aria-describedby={fields.type ? "client-type-error" : undefined} className={inputClass}>
            {CLIENT_TYPES.map((type) => <option key={type} value={type}>{t(`clients.types.${type}`)}</option>)}
          </select>
          {fields.type && <p id="client-type-error" className="mt-1 text-sm text-rose-600">{t("clients.errors.invalidType")}</p>}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2">
          {Object.entries(CLIENT_FIELD_LIMITS).map(([key, limit]) => {
            const required = CLIENT_REQUIRED_FIELDS.includes(key);
            const label = key === "name" ? t(`clients.names.${draft.type}`) : t(`clients.fields.${key}`);
            const props = {
              id: `client-${key}`, name: key, value: draft[key], maxLength: limit, required,
              onChange: (event) => change(key, event.target.value),
              className: inputClass, "aria-invalid": Boolean(fields[key]),
              "aria-describedby": [fields[key] ? `client-${key}-error` : "", key === "website" ? "client-website-hint" : ""].filter(Boolean).join(" ") || undefined,
              dir: ["phone", "fax", "cin", "website"].includes(key) ? "ltr" : "auto",
            };
            return <div key={key} className={["name", "address"].includes(key) ? "min-w-0 sm:col-span-2" : "min-w-0"}>
              <label htmlFor={props.id} className="mb-2 block text-sm font-bold">{label}{required ? " *" : <span className="ms-1 font-normal text-slate-500">({t("clients.optional")})</span>}</label>
              {key === "address" ? <textarea {...props} rows={2} autoComplete="street-address" /> : <input {...props} type={["phone", "fax"].includes(key) ? "tel" : "text"} inputMode={key === "website" ? "url" : undefined} autoComplete={key === "name" ? (draft.type === "company" ? "organization" : "name") : key === "phone" ? "tel" : "off"} />}
              {key === "website" && <p id="client-website-hint" className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("clients.websiteHint")}</p>}
              {fields[key] && <p id={`client-${key}-error`} className="mt-1 text-sm text-rose-600 dark:text-rose-400">{t(`clients.errors.${fields[key]}`, { max: limit, defaultValue: t("clients.errors.invalidText") })}</p>}
            </div>;
          })}
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{t(`clients.errors.${error}`)}</p>}
        <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5 dark:border-slate-700">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold dark:border-slate-700">{t("common.cancel")}</button>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700"><IoSaveOutline size={19} />{saving ? t("common.loading") : t(client ? "clients.update" : "clients.save")}</button>
        </footer>
      </fieldset>
    </form>
  </dialog>;
}
