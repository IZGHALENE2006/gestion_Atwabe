import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GiTrousers } from "react-icons/gi";
import { IoAddOutline, IoArrowBackOutline, IoArrowForwardOutline, IoCallOutline, IoCheckmarkDoneOutline, IoColorPaletteOutline, IoConstructOutline, IoCreateOutline, IoLinkOutline, IoPersonOutline, IoSearchOutline, IoShirtOutline, IoSettingsOutline, IoWaterOutline } from "react-icons/io5";
import { WORKER_CATEGORIES, filterTailoringWorkers, workerCategories } from "../../../shared/workers.js";
import { WORK_TRACKING_CATEGORIES } from "../../../shared/workerWork.js";
import { loadTailoringWorkers } from "./workersApi.js";
import WorkerForm from "./WorkerForm.jsx";
import "./workerWork.css";

const icons = { machine: IoSettingsOutline, sfifa: IoColorPaletteOutline, finishing: IoCheckmarkDoneOutline, brim: IoLinkOutline, trousers: GiTrousers, shirts: IoShirtOutline, mesbanto: IoWaterOutline };
const tones = { machine: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", sfifa: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300", finishing: "bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300", brim: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", trousers: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300", shirts: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300", mesbanto: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" };

export default function Khadama() {
  const { category } = useParams();
  const { t, i18n } = useTranslation();
  const token = useSelector(state => state.LoginAdmin.token);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState(null), [editor, setEditor] = useState(null), [status, setStatus] = useState(null);
  const state = result?.token === token && result.attempt === attempt ? result : { workers: [], permissions: {}, loading: true, error: "" };
  const query = search && search.category === category ? search.value : "";
  const categoryWorkers = state.workers.filter(worker => workerCategories(worker).includes(category));
  const visible = filterTailoringWorkers(state.workers, category, query);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    loadTailoringWorkers(token, controller.signal).then(data => {
      if (!Array.isArray(data.workers)) throw new Error("Invalid workers response");
      if (!controller.signal.aborted) setResult({ ...data, token, attempt, loading: false, error: "" });
    }).catch(error => { if (!controller.signal.aborted) setResult({ workers: [], permissions: {}, token, attempt, loading: false, error: error.response?.status === 403 ? "forbidden" : "loadFailed" }); });
    return () => controller.abort();
  }, [token, attempt]);
  const saved = worker => {
    setResult(current => current?.token === token ? { ...current, workers: [worker, ...current.workers.filter(entry => entry._id !== worker._id)] } : current);
    setStatus({ token, category, key: editor.worker ? "updated" : "added" }); setEditor(null); setSearch(null);
  };
  const edit = (worker = null) => { setEditor({ token, category, worker }); setStatus(null); };
  if (!token) return <Navigate to="/LoginChoise" replace />;
  if (category && !WORKER_CATEGORIES.includes(category)) return <Navigate to="/Home/Khadama" replace />;
  return <main dir={i18n.dir()} className="workers-directory min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-8"><div className="mx-auto max-w-7xl space-y-6 pb-24">
    {category && <Link to="/Home/Khadama" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 dark:text-primary-300"><IoArrowBackOutline className="rtl:rotate-180" />{t("workers.back")}</Link>}
    <header className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><h1 className="text-3xl font-bold">{t(category ? `workers.categories.${category}` : "workers.title")}</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t(category ? "workers.categorySubtitle" : "workers.subtitle")}</p></div>{category && state.permissions.add && <button type="button" data-add-worker onClick={() => edit()} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700"><IoAddOutline size={21} />{t("workers.add")}</button>}</header>
    {status?.token === token && status.category === category && <p role="status" className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300">{t(`workers.${status.key}`)}</p>}
    {!category && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{WORKER_CATEGORIES.map(key => { const Icon = icons[key]; return <Link key={key} to={`/Home/Khadama/${key}`} data-worker-category={key} className="group flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-primary-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary-500 dark:border-slate-800 dark:bg-slate-900"><span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${tones[key]}`}><Icon size={27} /></span><div><h2 className="text-xl font-bold">{t(`workers.categories.${key}`)}</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{t(`workers.descriptions.${key}`)}</p></div><p className="mt-auto flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-slate-500 dark:text-slate-400">{t("workers.count")}: <strong className="text-slate-900 dark:text-slate-100">{state.loading || state.error ? "—" : state.workers.filter(worker => workerCategories(worker).includes(key)).length}</strong></span><span className="inline-flex items-center gap-2 font-bold text-primary-700 dark:text-primary-300">{t("workers.open")}<IoArrowForwardOutline className="rtl:rotate-180" /></span></p></Link>; })}</div>}
    {state.loading && <p role="status" className="p-8 text-center text-sm text-slate-500">{t("common.loading")}</p>}
    {state.error && <div role="alert" className="rounded-xl bg-rose-50 p-5 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"><p>{t(`workers.errors.${state.error}`)}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 font-bold underline">{t("workers.retry")}</button></div>}
    {category && !state.loading && !state.error && <><div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500 dark:text-slate-400">{t("workers.count")}: <strong className="text-slate-900 dark:text-slate-100">{categoryWorkers.length}</strong></p><div className="relative w-full sm:w-80"><IoSearchOutline size={20} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={query} onChange={event => setSearch({ category, value: event.target.value })} aria-label={t("workers.search")} placeholder={t("workers.search")} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 py-3 pe-3 ps-10 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800" /></div></div>
      {visible.length ? <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(worker => <article key={worker._id} data-worker={worker._id} data-worker-tone={category} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="mb-4 flex items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[category]}`}><IoPersonOutline size={22} /></span><div className="min-w-0 flex-1"><h2 dir="auto" className="break-words text-lg font-bold">{worker.name}</h2><div className="mt-2 flex flex-wrap gap-1.5">{workerCategories(worker).map(key => <span key={key} className={`rounded-lg px-2 py-1 text-xs font-semibold ${tones[key]}`}>{t(`workers.categories.${key}`)}</span>)}</div></div>{state.permissions.update && <button type="button" data-edit-worker onClick={() => edit(worker)} aria-label={t("workers.editNamed", { name: worker.name })} className="shrink-0 rounded-lg border border-slate-200 p-2 text-primary-600 hover:bg-primary-50 dark:border-slate-700 dark:text-primary-400 dark:hover:bg-slate-800"><IoCreateOutline size={20} /></button>}</div><p className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><IoCallOutline className="shrink-0" /><span className="sr-only">{t("workers.phone")}</span><bdi dir="ltr">{worker.phone}</bdi></p>{WORK_TRACKING_CATEGORIES.includes(category) && <Link data-open-worker-work to={`/Home/Khadama/${category}/workers/${worker._id}`} className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">{t("workers.work.open")}</Link>}</article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><IoConstructOutline size={38} className="mx-auto mb-4 text-slate-400" /><p className="font-semibold">{t(query ? "workers.noResults" : "workers.empty")}</p>{!query && state.permissions.add && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("workers.emptyHint")}</p>}</div>}</>}
  </div>{editor?.token === token && editor.category === category && <WorkerForm key={editor.worker?._id || "new"} category={category} worker={editor.worker} token={token} onClose={() => setEditor(null)} onSaved={saved} />}</main>;
}
