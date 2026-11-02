import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoRefreshOutline, IoTimeOutline } from "react-icons/io5";
import { isFabricBarcode } from "../../../shared/fabrics.js";
import { loadFabricMovements } from "./fabricsApi.js";

export default function FabricMovements({ token, barcode = "", onClose }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  const moreRef = useRef(null);
  const moreBusyRef = useRef(false);
  const [search, setSearch] = useState(barcode);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const query = search.trim();
  const valid = !query || isFabricBarcode(query);
  const state = result?.token === token && result.query === query && result.attempt === attempt
    ? result : { movements: [], loading: valid, error: "", hasMore: false };
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const format = (value) => Number(value).toLocaleString(locale, { maximumFractionDigits: 3 });

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => { dialog.close(); moreRef.current?.abort(); };
  }, []);

  useEffect(() => {
    moreRef.current?.abort();
    moreBusyRef.current = false;
    if (!valid) return;
    const controller = new AbortController();
    loadFabricMovements(token, { barcode: query, signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setResult({ ...data, token, query, attempt, loading: false, error: "", moreError: "", loadingMore: false });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ token, query, attempt, movements: [], loading: false, error: "loadMovementsFailed", hasMore: false });
    });
    return () => controller.abort();
  }, [token, query, attempt, valid]);

  const loadMore = async () => {
    if (moreBusyRef.current || !state.hasMore) return;
    const controller = new AbortController();
    moreRef.current = controller;
    moreBusyRef.current = true;
    setResult((current) => ({ ...current, loadingMore: true, moreError: "" }));
    try {
      const data = await loadFabricMovements(token, { barcode: query, offset: state.nextOffset, signal: controller.signal });
      if (!controller.signal.aborted) setResult((current) => ({
        ...current, movements: [...new Map([...current.movements, ...data.movements].map((entry) => [entry._id, entry])).values()],
        hasMore: data.hasMore, nextOffset: data.nextOffset, loadingMore: false,
      }));
    } catch {
      if (!controller.signal.aborted) setResult((current) => ({ ...current, loadingMore: false, moreError: "loadMovementsFailed" }));
    } finally { if (!controller.signal.aborted) moreBusyRef.current = false; }
  };

  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="fabric-movements-title" onCancel={(event) => { event.preventDefault(); onClose(); }} className="fixed top-4 right-4 bottom-auto left-auto m-auto max-h-[90dvh] w-[calc(100dvw-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:inset-0">
    <header className="mb-5 flex items-start justify-between gap-3"><div><h2 id="fabric-movements-title" className="text-xl font-bold">{t("fabrics.movementsTitle")}</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.movementsHint")}</p></div><button type="button" onClick={onClose} aria-label={t("dialog.close")} className="rounded-lg p-2 hover:bg-slate-200 dark:hover:bg-slate-800"><IoCloseOutline size={23} /></button></header>
    <div className="mb-4 flex flex-wrap gap-2"><input type="search" dir="ltr" inputMode="numeric" value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t("fabrics.historyBarcode")} placeholder={t("fabrics.historyBarcode")} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" /><button type="button" onClick={() => setAttempt((value) => value + 1)} aria-label={t("fabrics.refreshHistory")} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><IoRefreshOutline size={20} /></button></div>
    {!valid && <p className="py-4 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.scanHint")}</p>}
    {state.loading && <p role="status" className="py-6 text-center text-sm text-slate-500">{t("common.loading")}</p>}
    {state.error && <p role="alert" className="py-4 text-sm text-rose-600 dark:text-rose-400">{t(`fabrics.errors.${state.error}`)}</p>}
    {valid && !state.loading && !state.error && <div className="space-y-3">{state.movements.length ? state.movements.map((entry) => <article key={entry._id} data-fabric-movement={entry._id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <p className="mb-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><IoTimeOutline size={17} /><time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></p>
      <p dir="auto" className="break-words font-bold">{entry.type}{entry.reference ? ` · ${entry.reference}` : ""}</p><p dir="auto" className="mt-1 break-words text-sm">{entry.color}{entry.colorNumber ? ` · ${entry.colorNumber}` : ""}</p><p dir="ltr" className="mt-2 break-all font-mono text-xs text-slate-500 dark:text-slate-400">{entry.barcode}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-700">{[["beforeReduction", entry.beforeMeters], ["reductionMeters", entry.meters], ["remainingMeters", entry.remainingMeters]].map(([key, value]) => <div key={key}><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t(`fabrics.${key}`)}</dt><dd><bdi dir="ltr" className={key === "reductionMeters" ? "font-bold text-blue-700 dark:text-blue-400" : "font-semibold"}>{t("fabrics.meterValue", { value: format(value) })}</bdi></dd></div>)}</dl>
    </article>) : <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{t("fabrics.noMovements")}</p>}</div>}
    {state.moreError && <p role="alert" className="mt-4 text-sm text-rose-600 dark:text-rose-400">{t(`fabrics.errors.${state.moreError}`)}</p>}
    {state.hasMore && <button type="button" disabled={state.loadingMore} onClick={loadMore} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold disabled:opacity-50 dark:border-slate-700">{t(state.loadingMore ? "common.loading" : "fabrics.moreMovements")}</button>}
  </dialog>;
}
