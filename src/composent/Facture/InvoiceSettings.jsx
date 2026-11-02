import { useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { IoArrowBackOutline, IoSaveOutline, IoSettingsOutline } from "react-icons/io5";
import { INVOICE_TEXT_FIELDS, INVOICE_VISIBILITY_GROUPS, normalizeInvoiceSettings } from "../../../shared/invoiceSettings.js";
import { useInvoiceSettings } from "./useInvoiceSettings";
import { saveInvoiceSettings } from "./invoiceSettingsApi";
import { invoiceLogoUrl } from "./invoicePresentation";
import FacturePrint from "./FacturePrintachat";

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-slate-700 dark:bg-slate-800";

export default function InvoiceSettings() {
  const { role, token } = useSelector((state) => state.LoginAdmin);
  const { t } = useTranslation();
  const { settings, loading, error, retry } = useInvoiceSettings(role === "admin" && Boolean(token));
  if (!token) return <Navigate to="/LoginChoise" replace />;
  if (role && role !== "admin") return <Navigate to="/Home/Facture" replace />;
  if (loading) return <p className="p-12 text-center text-slate-500">{t("common.loading")}</p>;
  if (error) return <div role="alert" className="p-12 text-center text-rose-600"><p>{t("invoiceSettings.loadFailed")}</p><button type="button" onClick={retry} className="mt-4 font-bold underline">{t("invoiceSettings.retry")}</button></div>;
  return <InvoiceSettingsEditor initialSettings={settings} />;
}

function InvoiceSettingsEditor({ initialSettings }) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState(() => normalizeInvoiceSettings(initialSettings));
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readingLogo, setReadingLogo] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const logoInput = useRef(null);
  const [previewDate] = useState(() => new Date().toISOString());
  const edit = (patch) => { setDraft((current) => ({ ...current, ...patch })); setSaved(false); };
  const logoSource = logoPreview || (removeLogo ? "" : invoiceLogoUrl(draft.logo));
  const chooseLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setSaved(false);
    if (!["image/png", "image/jpeg"].includes(file.type)) return setError(t("invoiceSettings.logoTypeInvalid"));
    if (file.size > 2 * 1024 * 1024) return setError(t("invoiceSettings.logoTooLarge"));
    setReadingLogo(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      setLogoFile(file);
      setLogoPreview(dataUrl);
      setRemoveLogo(false);
    } catch {
      setError(t("invoiceSettings.logoTypeInvalid"));
    } finally { setReadingLogo(false); }
  };
  const save = async (event) => {
    event.preventDefault();
    if (busy.current || readingLogo) return;
    busy.current = true;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await saveInvoiceSettings(draft, logoFile, removeLogo);
      setDraft(normalizeInvoiceSettings(result));
      setLogoFile(null);
      setLogoPreview("");
      setRemoveLogo(false);
      setSaved(true);
    } catch (failure) {
      setError(t(`invoiceSettings.${failure.response?.data?.message || "saveFailed"}`, { defaultValue: t("invoiceSettings.saveFailed") }));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const previewInvoice = {
    _id: "FAC-2026-001", DateFacture: previewDate, nameEmp: t("invoiceSettings.sampleSeller"), clientName: t("invoiceSettings.sampleClient"),
    paymentMethod: "cash", TotalQauntite: 2,
    Product: [
      { code: "ART-001", name: `${t("invoiceSettings.sampleProduct")} A`, quantite: 1, price: 120, discountType: "amount", discountValue: 20, discountAmount: 20, TotalPrix: 100, totalHT: 100, vatRate: 20, vatAmount: 20, totalTTC: 120 },
      { code: "ART-002", name: `${t("invoiceSettings.sampleProduct")} B`, quantite: 1, price: 50, TotalPrix: 50, totalHT: 50, vatRate: 10, vatAmount: 5, totalTTC: 55 },
    ],
    subtotal: 170, discountAmount: 20, lineDiscountAmount: 20, orderDiscountAmount: 0,
    totalHT: 150, vatAmount: 25, TotalPrix: 175, amountPaid: 200, PrixReture: 25,
  };

  return (
    <main dir={i18n.dir()} className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="flex items-center gap-3 text-2xl font-bold"><IoSettingsOutline className="text-primary-600" />{t("invoiceSettings.title")}</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("invoiceSettings.subtitle")}</p></div>
          <Link to="/Home/Facture" className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold dark:border-slate-700"><IoArrowBackOutline />{t("common.back")}</Link>
        </header>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          <form onSubmit={save} className="space-y-5">
            <fieldset disabled={saving || readingLogo} className="space-y-5 disabled:opacity-60">
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="font-bold">{t("invoiceSettings.business")}</h2>
                {Object.entries(INVOICE_TEXT_FIELDS).map(([key, max]) => <div key={key}>
                  <label htmlFor={`invoice-setting-${key}`} className="mb-2 block text-sm font-semibold">{t(`invoiceSettings.${key}`)}</label>
                  {key === "address" || key === "footer"
                    ? <textarea id={`invoice-setting-${key}`} rows={key === "address" ? 3 : 2} maxLength={max} value={draft[key]} onChange={(e) => edit({ [key]: e.target.value })} className={inputClass} />
                    : <input id={`invoice-setting-${key}`} type={key === "phone" ? "tel" : key === "email" ? "email" : "text"} maxLength={max} dir={key === "phone" || key === "email" ? "ltr" : "auto"} value={draft[key]} onChange={(e) => edit({ [key]: e.target.value })} className={inputClass} />}
                </div>)}
                <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-600">
                  <label htmlFor="invoice-logo-upload" className="mb-2 block text-sm font-bold">{t("invoiceSettings.logo")}</label>
                  {logoSource && <img src={logoSource} alt={t("invoiceSettings.logo")} className="mb-3 h-20 w-32 rounded-lg bg-white object-contain p-2" />}
                  <input ref={logoInput} id="invoice-logo-upload" type="file" accept="image/png,image/jpeg" onChange={chooseLogo} className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:font-semibold file:text-primary-700" />
                  <p className="mt-2 text-xs text-slate-500">{t("invoiceSettings.logoHint")}</p>
                  {logoSource && <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(""); setRemoveLogo(true); edit({ logo: "" }); }} className="mt-3 text-sm font-bold text-rose-600">{t("invoiceSettings.removeLogo")}</button>}
                </div>
              </section>
              <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div><h2 className="font-bold">{t("invoiceSettings.visibility")}</h2><p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{t("invoiceSettings.visibilityHint")}</p></div>
                {Object.entries(INVOICE_VISIBILITY_GROUPS).map(([group, keys]) => <div key={group}>
                  <h3 className="mb-3 text-sm font-bold text-primary-700 dark:text-primary-400">{t(`invoiceSettings.${group}`)}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">{keys.map((key) => <label key={key} className="flex cursor-pointer items-center gap-3 text-sm">
                    <input id={`invoice-visible-${key}`} type="checkbox" checked={draft.visibility[key]} onChange={(event) => edit({ visibility: { ...draft.visibility, [key]: event.target.checked } })} className="size-4 accent-primary-600" />
                    {t(`invoiceSettings.fields.${key}`)}
                  </label>)}</div>
                </div>)}
              </section>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-4 font-bold text-white hover:bg-primary-700"><IoSaveOutline />{saving ? t("common.loading") : t("invoiceSettings.save")}</button>
            </fieldset>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            {saved && <p role="status" className="text-sm font-bold text-primary-700 dark:text-primary-400">{t("invoiceSettings.saved")}</p>}
          </form>
          <aside className="min-w-0 xl:sticky xl:top-6">
            <h2 className="font-bold">{t("invoiceSettings.preview")}</h2><p className="mb-4 mt-1 text-xs text-slate-500">{t("invoiceSettings.previewHint")}</p>
            <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-200/50 p-2 dark:border-slate-700 dark:bg-slate-800">
              <div className="min-w-[560px] shadow-sm"><FacturePrint facture={previewInvoice} settings={{ ...draft, logo: removeLogo ? "" : draft.logo }} logoSrc={logoPreview || undefined} /></div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
