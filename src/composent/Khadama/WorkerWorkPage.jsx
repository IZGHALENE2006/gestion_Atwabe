import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoArrowBackOutline, IoBriefcaseOutline, IoBusinessOutline, IoCallOutline, IoCheckmarkCircleOutline, IoCheckmarkDoneOutline, IoCubeOutline, IoPeopleOutline, IoPersonOutline, IoSearchOutline, IoTimeOutline } from "react-icons/io5";
import { WORKER_CATEGORIES } from "../../../shared/workers.js";
import { WORK_TRACKING_CATEGORIES, WORK_TYPES, workerWorkTotals, workerWorkType, workerWorkGarmentType } from "../../../shared/workerWork.js";
import { formatSfifaCode } from "../../../shared/sfifaStock.js";
import { loadWorkerWork } from "./workersApi.js";
import WorkerWorkTable from "./WorkerWorkTable.jsx";
import WorkerWorkForm from "./WorkerWorkForm.jsx";
import WorkerWorkActionDialog from "./WorkerWorkActionDialog.jsx";
import { TAILORING_SFIFA_GARMENT_TYPES } from "../../../shared/tailoring.js";
import WorkerGarmentChoices from "./WorkerGarmentChoices.jsx";
import TrouserSummary from "./TrouserSummary.jsx";
import "./workerWork.css";

const searchable = value => String(value || "").normalize("NFKC").toLocaleLowerCase();
export default function WorkerWorkPage() {
  const { category, workerId } = useParams();
  const [params, setParams] = useSearchParams();
  const workType = WORK_TYPES.includes(params.get("type")) ? params.get("type") : "";
  const garmentType = category === "machine" && [...TAILORING_SFIFA_GARMENT_TYPES, "legacy"].includes(params.get("garment")) ? params.get("garment") : "";
  const needsGarment = category === "machine" && Boolean(workType) && !garmentType;
  const { t, i18n } = useTranslation();
  const token = useSelector(state => state.LoginAdmin.token);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0), [editor, setEditor] = useState(null), [status, setStatus] = useState(null), [view, setView] = useState(null);
  const scope = `${workerId}:${category}`, workScope = `${scope}:${workType}:${garmentType}`;
  const validCategory = WORK_TRACKING_CATEGORIES.includes(category), isSfifa = category === "sfifa", isTrousers = category === "trousers";
  const state = result?.token === token && result.scope === scope && result.attempt === attempt ? result : { worker: null, works: [], permissions: {}, loading: true, error: "" };
  const filters = view?.scope === workScope ? view : { status: "all", query: "" };
  useEffect(() => {
    if (!token || !validCategory) return;
    const controller = new AbortController();
    loadWorkerWork(token, workerId, category, controller.signal).then(data => {
      if (!data.worker || !Array.isArray(data.works)) throw new Error("Invalid worker work response");
      if (!controller.signal.aborted) setResult({ ...data, token, scope, attempt, loading: false, error: "" });
    }).catch(error => { if (!controller.signal.aborted) setResult({ worker: null, works: [], permissions: {}, token, scope, attempt, loading: false, error: error.response?.status === 403 ? "forbidden" : error.response?.status === 404 ? "notFound" : "loadWorkFailed" }); });
    return () => controller.abort();
  }, [token, workerId, category, scope, attempt, validCategory]);
  const reload = () => { setEditor(null); setStatus(null); setAttempt(value => value + 1); };
  const edit = (work = null, mode = work ? "complete" : "new") => { setEditor({ token, scope: workScope, work, mode }); setStatus(null); };
  const saved = work => {
    setResult(current => current?.token === token && current.scope === scope ? { ...current, works: work.deleted ? current.works.filter(entry => entry._id !== work._id) : [work, ...current.works.filter(entry => entry._id !== work._id)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b._id.localeCompare(a._id)) } : current);
    setStatus({ token, scope: workScope, key: editor.mode === "delete" ? "deletedSaved" : editor.mode === "increase" ? "increasedSaved" : `${isSfifa ? "sfifa." : ""}${editor.work ? "completedSaved" : "assignedSaved"}` }); setEditor(null); setView(null);
  };
  if (!token) return <Navigate to="/LoginChoise" replace />;
  if (!validCategory) return <Navigate to={WORKER_CATEGORIES.includes(category) ? `/Home/Khadama/${category}` : "/Home/Khadama"} replace />;
  const typeWorks = state.works.filter(work => workerWorkType(work) === workType);
  const works = category === "machine" && garmentType ? typeWorks.filter(work => (workerWorkGarmentType(work) || "legacy") === garmentType) : typeWorks;
  const typeLabel = type => t(`workers.work.${isTrousers || category === "shirts" ? category + "." : ""}types.${type}`);
  const totals = workerWorkTotals(works, category);
  const number = value => new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 }).format(value);
  const counts = { all: works.length, inProgress: works.filter(work => work.remainingQuantity > 0).length, done: works.filter(work => work.remainingQuantity === 0).length };
  const visible = works.filter(work => {
    const statusMatches = filters.status === "all" || (filters.status === "done" ? work.remainingQuantity === 0 : work.remainingQuantity > 0);
    const title = work.category === "sfifa" ? `${t(`sfifaStock.widths.${work.sfifa.width}`)} ${formatSfifaCode(work.sfifa.code, work.sfifa.family)} ${work.sfifa.code}` : [work.productName, work.trouserType ? t(`workers.work.trousers.styles.${work.trouserType}`) : "", work.tailoring?.barcode, work.tailoring?.phone, ...(work.tailoring?.items || []).flatMap(item => [item.fabricType, item.fabricColor])].join(" ");
    return statusMatches && searchable(title).includes(searchable(filters.query.trim()));
  });
  const patchView = value => setView({ ...filters, ...value, scope: workScope });
  return <main dir={i18n.dir()} className="work-page"><div className="work-container">
    <Link to={`/Home/Khadama/${category}`} className="work-back"><IoArrowBackOutline className="rtl:rotate-180" />{t("workers.work.back")}</Link>
    {workType && <button type="button" data-choose-work-type onClick={() => { setParams({}); setEditor(null); }} className="work-back worker-type-back"><IoArrowBackOutline className="rtl:rotate-180" />{t("workers.work.changeWorkType")}</button>}
    {category === "machine" && garmentType && <button type="button" data-choose-work-garment onClick={() => { setParams({ type: workType }); setEditor(null); }} className="work-back worker-type-back"><IoArrowBackOutline className="rtl:rotate-180" />{t("workers.work.chooseGarmentType")} · {t(garmentType === "legacy" ? "workers.work.legacyGarments" : "fesla.garmentTypes." + garmentType)}</button>}
    <header className="work-hero"><div className="work-person"><span className="work-avatar" aria-hidden="true"><IoPersonOutline /></span><div className="work-person-copy"><p className="work-eyebrow">{t("workers.work.title")} · {t(`workers.categories.${category}`)}</p><h1 dir="auto">{state.worker?.name || t("workers.work.title")}</h1>{state.worker && <a className="work-phone" href={`tel:${state.worker.phone.replace(/[^\d+]/g, "")}`}><IoCallOutline /><bdi dir="ltr">{state.worker.phone}</bdi></a>}</div></div><div className="work-hero-actions">{workType && !needsGarment && garmentType !== "legacy" && state.canAssign && state.permissions.add && <button type="button" data-add-work onClick={() => edit()} className="work-button work-button-blue"><IoAddOutline />{t("workers.work.add")}</button>}{isSfifa && <Link to="/Home/SfifaStock" data-open-sfifa-stock className="work-button work-button-quiet"><IoCubeOutline />{t("sfifaStock.title")}</Link>}</div></header>
    {state.loading && <p role="status" className="work-empty">{t("common.loading")}</p>}
    {state.error && <div role="alert" className="work-feedback work-feedback-error"><p>{t(`workers.work.errors.${state.error}`)}</p><button type="button" onClick={reload} className="work-text-button">{t("workers.retry")}</button></div>}
    {!state.loading && !state.error && isTrousers && workType !== "shop" && <TrouserSummary works={state.works} />}
    {!state.loading && !state.error && (!workType ? <section className="worker-type-section" aria-labelledby="worker-type-title"><h2 id="worker-type-title">{t("workers.work.chooseWorkType")}</h2><div className="worker-type-grid">{WORK_TYPES.map(type => <button type="button" key={type} data-work-type={type} onClick={() => setParams({ type })} className={`worker-type-card worker-type-${type}`}><span className="worker-type-icon" aria-hidden="true">{type === "shop" ? <IoBusinessOutline /> : <IoPeopleOutline />}</span><h3>{typeLabel(type)}</h3><p>{t(`workers.work.${isTrousers || category === "shirts" ? category + "." : ""}typeHints.${type}`)}</p><strong>{t("workers.work.workCount", { count: state.works.filter(work => workerWorkType(work) === type).length })}</strong></button>)}</div></section> : needsGarment ? <WorkerGarmentChoices works={typeWorks} onChoose={kind => { setParams({ type: workType, garment: kind }); setEditor(null); }} /> : <>
      <nav className="worker-type-tabs" aria-label={t("workers.work.chooseWorkType")}>{WORK_TYPES.map(type => <button type="button" key={type} data-work-type={type} aria-pressed={workType === type} onClick={() => { setParams({ type }); setEditor(null); }}>{type === "shop" ? <IoBusinessOutline aria-hidden="true" /> : <IoPeopleOutline aria-hidden="true" />}{typeLabel(type)}</button>)}</nav>
      {isSfifa && <p className="work-stock-note"><IoCheckmarkCircleOutline aria-hidden="true" />{t("workers.work.sfifa.subtitle")}</p>}
      {status?.token === token && status.scope === workScope && <p role="status" className="work-feedback work-feedback-success"><IoCheckmarkCircleOutline aria-hidden="true" />{t(`workers.work.${status.key}`)}</p>}
      {!isTrousers || workType === "shop" ? <dl className="worker-summary">{["quantity", "completedQuantity", "remainingQuantity"].map(key => <div key={key}><dt>{t(`workers.work.design.${key}`)}</dt><dd data-work-total={key} data-value={totals[key]} className={`worker-amount-${key}`}><bdi>{number(totals[key])}</bdi>{isSfifa && <small>{t("sfifaStock.unit")}</small>}</dd></div>)}</dl> : null}
      <section className="work-list-section" aria-labelledby="work-list-title"><div className="work-list-heading"><div><p className="work-eyebrow">{typeLabel(workType)}</p><h2 id="work-list-title">{t("workers.work.design.workList")} <span>{number(counts.all)}</span></h2></div><label className="work-search"><IoSearchOutline aria-hidden="true" /><span className="sr-only">{t("workers.work.design.search")}</span><input type="search" data-search-work value={filters.query} onChange={event => patchView({ query: event.target.value })} placeholder={t("workers.work.design.search")} /></label></div>
        <div className="work-filter-tabs" aria-label={t("workers.work.design.statusFilter")}>{["all", "inProgress", "done"].map(key => <button key={key} type="button" data-work-filter={key} aria-pressed={filters.status === key} onClick={() => patchView({ status: key })}>{key === "all" ? <IoBriefcaseOutline aria-hidden="true" /> : key === "done" ? <IoCheckmarkDoneOutline aria-hidden="true" /> : <IoTimeOutline aria-hidden="true" />}{t(key === "all" ? "workers.work.design.allWorks" : `workers.work.${key}`)}<span>{number(counts[key])}</span></button>)}</div>
        {visible.length ? <WorkerWorkTable works={visible} category={category} canComplete={state.permissions.update} canIncrease={state.permissions.add && state.canAssign} canDelete={state.permissions.delete} onComplete={edit} onIncrease={work => edit(work, "increase")} onDelete={work => edit(work, "delete")} /> : <div className="work-empty"><IoBriefcaseOutline aria-hidden="true" /><h3>{t(works.length ? "workers.work.design.noResults" : "workers.work.empty")}</h3>{works.length ? <button type="button" className="work-text-button" onClick={() => setView(null)}>{t("workers.work.design.clearFilters")}</button> : state.permissions.add && state.canAssign && <p>{t(isSfifa ? "workers.work.sfifa.emptyHint" : isTrousers && workType === "client" ? "workers.work.trousers.emptyHint" : workType === "client" ? "workers.work.clientEmptyHint" : "workers.work.emptyHint")}</p>}</div>}
      </section>
    </>)}
  </div>{editor?.token === token && editor.scope === workScope && state.worker && (["increase", "delete"].includes(editor.mode) ? <WorkerWorkActionDialog key={`${editor.mode}-${editor.work._id}`} token={token} worker={state.worker} work={editor.work} mode={editor.mode} onClose={() => setEditor(null)} onSaved={saved} onReload={reload} /> : <WorkerWorkForm key={editor.work?._id || `new-${workType}`} token={token} worker={state.worker} category={category} workType={workType} garmentType={garmentType && garmentType !== "legacy" ? garmentType : undefined} work={editor.work} onClose={() => setEditor(null)} onSaved={saved} onReload={reload} />)}</main>;
}
