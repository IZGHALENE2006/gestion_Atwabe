import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoColorPaletteOutline, IoLayersOutline, IoSearchOutline } from "react-icons/io5";
import { SFIFA_STOCK_FAMILIES, SFIFA_STOCK_WIDTHS, filterSfifaStock, sfifaStockTotals } from "../../../shared/sfifaStock.js";
import { loadSfifaStock } from "./sfifaStockApi.js";
import SfifaStockForm from "./SfifaStockForm.jsx";
import SfifaStockTable from "./SfifaStockTable.jsx";
import SfifaStockHistoryDialog from "./SfifaStockHistoryDialog.jsx";
import SfifaStockActionDialog from "./SfifaStockActionDialog.jsx";
import SfifaStockBarcodeDialog from "./SfifaStockBarcodeDialog.jsx";
import "../Khadama/workerWork.css";
import "./sfifaStock.css";

const emptyFilters = { width: "", family: "", code: "", barcode: "" };
const tones = { total: "bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300", thick: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", thin: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" };

export default function SfifaStock() {
  const { t, i18n } = useTranslation();
  const token = useSelector(state => state.LoginAdmin.token);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0), [editor, setEditor] = useState(null), [status, setStatus] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const state = result?.token === token && result.attempt === attempt ? result : { items: [], permissions: {}, loading: true, error: "" };
  const totals = sfifaStockTotals(state.items);
  const visible = filterSfifaStock(state.items, filters).sort((a, b) => SFIFA_STOCK_WIDTHS.indexOf(a.width) - SFIFA_STOCK_WIDTHS.indexOf(b.width) || a.family.localeCompare(b.family) || (a.code ?? Infinity) - (b.code ?? Infinity));
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    loadSfifaStock(token, controller.signal).then(data => {
      if (!Array.isArray(data.items)) throw new Error("Invalid sfifa stock response");
      if (!controller.signal.aborted) setResult({ ...data, token, attempt, loading: false, error: "" });
    }).catch(error => { if (!controller.signal.aborted) setResult({ items: [], permissions: {}, token, attempt, loading: false, error: error.response?.status === 403 ? "forbidden" : "loadFailed" }); });
    return () => controller.abort();
  }, [token, attempt]);
  const edit = (stock = null) => { setEditor({ token, stock, mode: stock ? "edit" : "new" }); setStatus(null); };
  const action = (mode, stock) => { setEditor({ token, stock, mode }); setStatus(null); };
  const reload = () => { setEditor(null); setStatus(null); setAttempt(value => value + 1); };
  const saved = response => {
    setResult(current => current?.token === token ? { ...current, items: [...response.items, ...current.items.filter(item => item.parentId !== response.parentId)] } : current);
    setStatus({ token, key: editor.mode === "delete" ? "deleted" : editor.mode === "restock" ? "restocked" : editor.stock?.isUnassigned ? "classified" : editor.stock ? "updated" : "added" }); setEditor(null); if (editor.mode === "new") setFilters(emptyFilters);
  };
  if (!token) return <Navigate to="/LoginChoise" replace />;
  const number = value => new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 }).format(value);
  const patchFilter = value => setFilters(current => ({ ...current, ...value }));
  const inputClass = "w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800";
  return <main dir={i18n.dir()} className="sfifa-inventory min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-8"><div className="mx-auto max-w-7xl space-y-6 pb-24">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">{t("sfifaStock.title")}</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("sfifaStock.subtitle")}</p></div>{state.permissions.add && <button type="button" data-add-sfifa onClick={() => edit()} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700"><IoAddOutline size={21} />{t("sfifaStock.add")}</button>}</header>
    {status?.token === token && <p role="status" className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300">{t(`sfifaStock.${status.key}`)}</p>}
    {state.loading && <p role="status" className="p-8 text-center text-sm text-slate-500">{t("common.loading")}</p>}
    {state.error && <div role="alert" className="rounded-xl bg-rose-50 p-5 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"><p>{t(`sfifaStock.errors.${state.error}`)}</p><button type="button" onClick={reload} className="mt-3 font-bold underline">{t("sfifaStock.retry")}</button></div>}
    {!state.loading && !state.error && <>
      <dl className="grid gap-3 md:grid-cols-3">{Object.entries(totals).map(([key, value]) => <div key={key} data-sfifa-summary={key} className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><span className={`rounded-xl p-3 ${tones[key]}`}>{key === "total" ? <IoLayersOutline size={25} /> : <IoColorPaletteOutline size={25} />}</span><div className="min-w-0"><dt className="text-sm text-slate-500 dark:text-slate-400">{t(key === "total" ? "sfifaStock.total" : `sfifaStock.${key}Total`)}</dt><dd data-sfifa-total={key} data-value={value} className="mt-1 break-all text-2xl font-bold"><bdi>{number(value)} {t("sfifaStock.unit")}</bdi></dd></div></div>)}</dl>
      <section aria-label={t("sfifaStock.filters")} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 xl:grid-cols-5">
        <div><label htmlFor="sfifa-filter-width" className="mb-2 block text-sm font-semibold">{t("sfifaStock.width")}</label><select id="sfifa-filter-width" className={inputClass} value={filters.width} onChange={event => patchFilter({ width: event.target.value })}><option value="">{t("sfifaStock.allWidths")}</option>{SFIFA_STOCK_WIDTHS.map(width => <option key={width} value={width}>{t(`sfifaStock.widths.${width}`)}</option>)}</select></div>
        <div><label htmlFor="sfifa-filter-family" className="mb-2 block text-sm font-semibold">{t("sfifaStock.family")}</label><select id="sfifa-filter-family" className={inputClass} dir="ltr" value={filters.family} onChange={event => patchFilter({ family: event.target.value })}><option value="">{t("sfifaStock.allFamilies")}</option>{SFIFA_STOCK_FAMILIES.map(family => <option key={family.value} value={family.value}>{family.label}</option>)}</select></div>
        <div><label htmlFor="sfifa-filter-code" className="mb-2 block text-sm font-semibold">{t("sfifaStock.code")}</label><input id="sfifa-filter-code" className={inputClass} type="search" inputMode="numeric" dir="ltr" value={filters.code} onChange={event => patchFilter({ code: event.target.value })} placeholder={t("sfifaStock.searchCode")} /></div>
        <div><label htmlFor="sfifa-filter-barcode" className="mb-2 block text-sm font-semibold">{t("sfifaStock.barcode")}</label><input id="sfifa-filter-barcode" className={inputClass} type="search" dir="ltr" autoComplete="off" value={filters.barcode} onChange={event => patchFilter({ barcode: event.target.value })} placeholder={t("sfifaStock.searchBarcode")} /></div>
        <div className="flex items-end"><button type="button" data-clear-sfifa-filters disabled={!filters.width && !filters.family && !filters.code && !filters.barcode} onClick={() => setFilters(emptyFilters)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">{t("sfifaStock.clearFilters")}</button></div>
      </section>
      <p className="text-sm text-slate-500 dark:text-slate-400">{t("sfifaStock.results")}: <strong data-sfifa-count className="text-slate-900 dark:text-slate-100">{number(visible.length)}</strong></p>
      {visible.length ? <SfifaStockTable items={visible} permissions={state.permissions} onAction={action} /> : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><IoSearchOutline size={35} className="mx-auto mb-4 text-slate-400" /><p className="font-semibold">{t(state.items.length ? "sfifaStock.noResults" : "sfifaStock.empty")}</p>{!state.items.length && state.permissions.add && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("sfifaStock.emptyHint")}</p>}</div>}
    </>}
  </div>{editor?.token === token && ["new", "edit"].includes(editor.mode) && <SfifaStockForm key={editor.stock?._id || "new"} token={token} stock={editor.stock} initial={{ width: filters.width || "thin", family: filters.family || SFIFA_STOCK_FAMILIES[0].value }} onClose={() => setEditor(null)} onSaved={saved} onReload={reload} />}
  {editor?.token === token && ["restock", "delete"].includes(editor.mode) && <SfifaStockActionDialog key={editor.mode + editor.stock._id} mode={editor.mode} stock={editor.stock} token={token} onClose={() => setEditor(null)} onSaved={saved} onReload={reload} />}
  {editor?.token === token && editor.mode === "history" && <SfifaStockHistoryDialog key={editor.stock._id} stock={editor.stock} token={token} onClose={() => setEditor(null)} />}
  {editor?.token === token && editor.mode === "barcode" && <SfifaStockBarcodeDialog stock={editor.stock} onClose={() => setEditor(null)} />}</main>;
}
