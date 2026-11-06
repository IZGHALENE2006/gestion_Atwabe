import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoBarcodeOutline, IoCutOutline, IoSearchOutline, IoSettingsOutline, IoTrendingUpOutline, IoBarChartOutline } from "react-icons/io5";
import { filterTailoringOrders, tailoringGarmentType, tailoringUsesSfifa, TAILORING_GARMENT_TYPES } from "../../../shared/tailoring.js";
import { loadTailoringOrders, loadTailoringTracking } from "./feslaApi.js";
import DjellabaSettingsDialog from "./DjellabaSettingsDialog.jsx";
import TailoringProfits from "./TailoringProfits.jsx";
import TailoringOrderForm from "./TailoringOrderForm.jsx";
import TailoringOrdersTable from "./TailoringOrdersTable.jsx";
import TailoringOrderDetailsDialog from "./TailoringOrderDetailsDialog.jsx";
import TailoringOrderActionDialog from "./TailoringOrderActionDialog.jsx";
import TailoringOrderLabelDialog from "./TailoringOrderLabelDialog.jsx";
import TailoringReceiptDialog from "./TailoringReceiptDialog.jsx";
import { tailoringOrderReceipt, tailoringPaymentReceipt } from "../../../shared/tailoringReceipts.js";
import "./feslaBarcode.css";

export default function Fesla() {
  const operations = useEmployeeOperations('tailoring');
  const { t, i18n } = useTranslation();
  const costText = key => t(["fesla." + garmentType + ".costs." + key, "fesla.costs." + key]);
  const [params] = useSearchParams();
  const garmentType = TAILORING_GARMENT_TYPES.includes(params.get("garment")) ? params.get("garment") : "djellaba";
  const profitsView = params.get("view") === "profits";
  const allProfitSections = profitsView && params.get("scope") === "all";
  const sectionText = key => t(garmentType === "djellaba" ? `fesla.${key}` : `fesla.${garmentType}.${key}`);
  const token = useSelector((state) => state.LoginAdmin.token);
  const [result, setResult] = useState(null);
  const [trackingResult, setTrackingResult] = useState(null), [trackingAttempt, setTrackingAttempt] = useState(0);
  const tracking = trackingResult?.token === token && trackingResult.attempt === trackingAttempt ? trackingResult : { byOrder: {}, loading: true, error: "" };
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState("general");
  const [label, setLabel] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [details, setDetails] = useState(null);
  const [action, setAction] = useState(null);
  const searchRef = useRef(null);
  const [editor, setEditor] = useState(null);
  const [status, setStatus] = useState(null);
  const [priceEditor, setPriceEditor] = useState(null);
  const state = result?.token === token && result.attempt === attempt ? result : { orders: [], permissions: {}, loading: true, error: "" };
  const sectionOrders = state.orders.filter(order => tailoringGarmentType(order) === garmentType);
  const visible = filterTailoringOrders(sectionOrders, search, { barcodeOnly: searchMode === "barcode" });
  const selectedOrder = details?.token === token ? state.orders.find(order => order._id === details.id) : null;
  const actionOrder = action?.token === token ? state.orders.find(order => order._id === action.id) : null;
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    loadTailoringOrders(token, controller.signal).then((data) => {
      if (!Array.isArray(data.orders)) throw new Error("Invalid orders response");
      if (!controller.signal.aborted) setResult({ ...data, token, attempt, loading: false, error: "" });
    }).catch((error) => { if (!controller.signal.aborted) setResult({ orders: [], permissions: {}, token, attempt, loading: false, error: error.response?.status === 403 ? "forbidden" : "loadFailed" }); });
    return () => controller.abort();
  }, [token, attempt]);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    loadTailoringTracking(token, controller.signal).then(data => {
      if (!Array.isArray(data.orders)) throw new Error("Invalid work tracking response");
      if (!controller.signal.aborted) setTrackingResult({ token, attempt: trackingAttempt, byOrder: Object.fromEntries(data.orders.map(entry => [entry.orderId, entry.assignments])), loading: false, error: "" });
    }).catch(error => { if (!controller.signal.aborted) setTrackingResult({ token, attempt: trackingAttempt, byOrder: {}, loading: false, error: error.response?.status === 403 ? "forbidden" : "loadTrackingFailed" }); });
    return () => controller.abort();
  }, [token, trackingAttempt, operations.tracking]);
  const refreshTracking = () => setTrackingAttempt(value => value + 1);
  const changeSection = () => { setPriceEditor(null); setSearch(""); setEditor(null); setDetails(null); setAction(null); setLabel(null); setReceipt(null); setStatus(null); };
  const edit = (order = null) => { setDetails(null); setEditor({ token, order }); setStatus(null); };
  const printReceipt = (order, payment) => { if (!operations.print) return; setDetails(null); setReceipt({ token, document: payment ? tailoringPaymentReceipt(order, payment) : tailoringOrderReceipt(order) }); };
  const printOrder = order => { setDetails(null); setLabel({ token, order }); };
  const openAction = (order, mode) => { setDetails(null); setAction({ token, id: order._id, mode }); setStatus(null); };
  const actionSaved = order => {
    setResult(current => ({ ...current, orders: current.orders.map(entry => entry._id === order._id ? order : entry) }));
    setStatus({ token, key: action.mode === "payment" ? "paymentAdded" : "orderDelivered" });
    setAction(null);
    if (action.mode === "payment" && order.paymentReceipt) printReceipt(order, order.paymentReceipt);
    else setDetails({ token, id: order._id });
  };
  const reloaded = data => { if (Array.isArray(data.orders)) setResult({ ...data, token, attempt, loading: false, error: "" }); };
  const changeSearchMode = mode => { setSearchMode(mode); setSearch(""); searchRef.current?.focus(); };
  const saved = (order) => {
    setResult((current) => ({ ...current, orders: [order, ...current.orders.filter((entry) => entry._id !== order._id)].sort((a, b) => b.orderDate.localeCompare(a.orderDate) || new Date(b.createdAt) - new Date(a.createdAt)) }));
    setStatus({ token, key: editor.order ? "updated" : "added" });
    if (!editor.order) printReceipt(order);
    setEditor(null); setSearch("");
  };
  if (!token) return <Navigate to="/LoginChoise" replace />;
  return <main dir={i18n.dir()} className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-8"><div className="mx-auto max-w-7xl space-y-6 pb-24">
    {profitsView ? <TailoringProfits key={allProfitSections ? "all" : garmentType} allSections={allProfitSections} orders={state.orders} garmentType={garmentType} loading={state.loading} error={state.error} onRetry={() => setAttempt(value => value + 1)} onDetails={order => { setDetails({ token, id: order._id }); refreshTracking(); }} onNavigate={changeSection} /> : <>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">{t("fesla.title")}</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{sectionText("subtitle")}</p></div><div className={"flex flex-wrap gap-2" + (["jabador", "malakiya"].includes(garmentType) ? " fesla-actions-left" : "")}><EmployeeOperation module="tailoring" operation="profits"><Link to={"/Home/Fesla?garment=" + garmentType + "&view=profits&scope=all"} onClick={changeSection} className="fesla-view-profits-button fesla-view-total-profits-button" data-view-total-tailoring-profits><IoBarChartOutline size={21} aria-hidden="true" />{t("fesla.profits.totalTitle")}</Link><EmployeeOperation module="tailoring" operation="profits"></EmployeeOperation><Link to={"/Home/Fesla?garment=" + garmentType + "&view=profits"} onClick={changeSection} className="fesla-view-profits-button" data-view-tailoring-profits><IoTrendingUpOutline size={21} aria-hidden="true" />{t("fesla.profits.view")}</Link></EmployeeOperation>{(tailoringUsesSfifa({ garmentType }) || garmentType === "trousers") && state.permissions.settings && <button type="button" data-djellaba-settings onClick={() => setPriceEditor({ token })} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"><IoSettingsOutline size={21} />{costText("settingsTitle")}</button>}{state.permissions.add && <button type="button" data-add-tailoring onClick={() => edit()} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700"><IoAddOutline size={21} />{sectionText("add")}</button>}</div></header>
    <nav className="fesla-section-nav" aria-label={t("fesla.sections")} data-fesla-sections>{TAILORING_GARMENT_TYPES.map(type => <Link key={type} to={"/Home/Fesla?garment=" + type} onClick={changeSection} data-fesla-section={type} aria-current={garmentType === type ? "page" : undefined}><IoCutOutline size={20} aria-hidden="true" /><span>{t("fesla.garmentTypes." + type)}</span>{!state.loading && !state.error && <b>{state.orders.filter(order => tailoringGarmentType(order) === type).length}</b>}</Link>)}</nav>
    {status?.token === token && <p role="status" className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300">{t(`fesla.${status.key}`)}</p>}
    {!state.loading && !state.error && <p className="text-sm text-slate-500 dark:text-slate-400">{t("fesla.total")}: <span className="font-bold text-slate-900 dark:text-slate-100">{sectionOrders.length}</span></p>}
    <section className="fesla-search-panel" aria-label={t("fesla.search")}>
      <div className="fesla-search-modes">{[["general", "generalSearch"], ["barcode", "barcodeSearch"]].map(([mode, text]) => <button key={mode} type="button" data-fesla-search-mode={mode} aria-pressed={searchMode === mode} onClick={() => changeSearchMode(mode)}>{mode === "barcode" ? <IoBarcodeOutline size={19} aria-hidden="true" /> : <IoSearchOutline size={18} aria-hidden="true" />}{t(`fesla.${text}`)}</button>)}</div>
      <label className="fesla-search-input">{searchMode === "barcode" ? <IoBarcodeOutline aria-hidden="true" /> : <IoSearchOutline aria-hidden="true" />}<span className="sr-only">{t(searchMode === "barcode" ? "fesla.barcodeSearch" : "fesla.search")}</span><input ref={searchRef} id="fesla-search" data-fesla-search type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t(searchMode === "barcode" ? "fesla.scanBarcode" : "fesla.search")} dir={searchMode === "barcode" ? "ltr" : undefined} autoComplete="off" spellCheck={false} /></label>
      {searchMode === "barcode" && <p className="fesla-search-hint">{t("fesla.barcodeHint")}</p>}
    </section>
    {state.loading && <p role="status" className="p-8 text-center text-sm text-slate-500">{t("common.loading")}</p>}
    {state.error && <div role="alert" className="rounded-xl bg-rose-50 p-5 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"><p>{t(`fesla.errors.${state.error}`)}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 font-bold underline">{t("fesla.retry")}</button></div>}
    {!state.loading && !state.error && (visible.length ? <TailoringOrdersTable onEdit={edit} onLabel={printOrder} onReceipt={operations.print ? printReceipt : undefined} orders={visible} tracking={tracking} canEdit={state.permissions.update} onAction={openAction} onDetails={order => { setDetails({ token, id: order._id }); refreshTracking(); }} /> : <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700"><IoCutOutline size={38} className="mx-auto mb-4 text-slate-400" /><p className="font-semibold">{t(sectionOrders.length ? "fesla.noResults" : "fesla.empty")}</p>{!sectionOrders.length && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("fesla.emptyHint")}</p>}</div>)}
    </>}
  </div>{receipt?.token === token && <TailoringReceiptDialog document={receipt.document} onClose={() => setReceipt(null)} />}{selectedOrder && <EmployeeOperation module="tailoring" operation="details"><TailoringOrderDetailsDialog onReceipt={operations.print ? printReceipt : undefined} order={selectedOrder} tracking={tracking} onRefreshTracking={refreshTracking} token={token} canEdit={state.permissions.update} onClose={() => setDetails(null)} onEdit={edit} onPrint={printOrder} onAction={openAction} /></EmployeeOperation>}{actionOrder && (action.mode === "payment" ? state.permissions.payment : state.permissions.deliver) && <TailoringOrderActionDialog key={`${action.id}-${action.mode}`} order={actionOrder} mode={action.mode} token={token} onClose={() => setAction(null)} onSaved={actionSaved} onReload={reloaded} />}{editor?.token === token && <TailoringOrderForm key={editor.order?._id || garmentType} garmentType={garmentType} order={editor.order} token={token} onClose={() => setEditor(null)} onSaved={saved} />}{label?.token === token && <TailoringOrderLabelDialog order={label.order} onClose={() => setLabel(null)} />}{priceEditor?.token === token && <DjellabaSettingsDialog garmentType={garmentType} token={token} onClose={() => setPriceEditor(null)} onSaved={() => { setPriceEditor(null); setStatus({ token, key: garmentType === "djellaba" ? "costs.settingsSaved" : garmentType + ".costs.settingsSaved" }); }} />}</main>;
}
