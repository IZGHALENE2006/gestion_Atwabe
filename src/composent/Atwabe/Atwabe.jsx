import FabricInvoices from './FabricInvoices.jsx';
import useSearchTarget from "../../hooks/useSearchTarget.js";
import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoChevronDownOutline, IoCreateOutline, IoLayersOutline, IoPrintOutline, IoSearchOutline, IoTrashOutline, IoRemoveCircleOutline, IoTimeOutline, IoCartOutline, IoTrendingUpOutline } from "react-icons/io5";
import Barcode from "react-barcode";
import { fabricTotals, filterFabrics, findFabricPieces } from "../../../shared/fabrics.js";
import { loadFabrics } from "./fabricsApi.js";
import AddFabricForm from "./AddFabricForm.jsx";
import FabricLabelsDialog from "./FabricLabelsDialog.jsx";
import FabricPieceResult from "./FabricPieceResult.jsx";
import FabricDeleteDialog from "./FabricDeleteDialog.jsx";
import FabricSaleDialog from "./FabricSaleDialog.jsx";
import FabricSaleReceiptDialog from "./FabricSaleReceiptDialog.jsx";
import FabricReductionDialog from "./FabricReductionDialog.jsx";
import FabricMovements from "./FabricMovements.jsx";
import FabricPhoto from "./FabricPhoto.jsx";
import FabricCatalogButton from "./FabricCatalogButton.jsx";

export default function Atwabe() {
  const matchesSearchTarget = useSearchTarget();
  const { t, i18n } = useTranslation();
  const token = useSelector((state) => state.LoginAdmin.token);
  const [result, setResult] = useState({ token: null, fabrics: [], permissions: {}, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("piece") || "");
  const [editor, setEditor] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [labels, setLabels] = useState(null);
  const [status, setStatus] = useState(null);
  const [deletion, setDeletion] = useState(null);
  const [reduction, setReduction] = useState(null);
  const [history, setHistory] = useState(null);
  const [sale, setSale] = useState(null);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    loadFabrics(token, controller.signal).then((data) => {
      if (!Array.isArray(data.fabrics)) throw new Error("Invalid fabrics response");
      if (!controller.signal.aborted) setResult({ ...data, token, loading: false, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ token, fabrics: [], permissions: {}, loading: false, error: error.response?.status === 403 ? "forbidden" : "loadFailed" });
    });
    return () => controller.abort();
  }, [token, attempt]);

  const state = result.token === token ? result : { fabrics: [], permissions: {}, loading: true, error: "" };
  const visible = filterFabrics(state.fabrics.filter(matchesSearchTarget), search);
  const pieceMatches = findFabricPieces(state.fabrics.filter(matchesSearchTarget), search);
  const totals = fabricTotals(state.fabrics.flatMap((fabric) => fabric.colors));
  const format = (value) => Number(value).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 });
  const usedBarcodes = state.fabrics.flatMap((fabric) => fabric.colors.flatMap((color) => color.pieces.map((piece) => piece.barcode)));
  const retry = () => { setResult((current) => ({ ...current, loading: true, error: "" })); setAttempt((value) => value + 1); };
  const saved = (fabric) => {
    const updating = Boolean(editor.fabric);
    setResult((current) => ({ ...current, fabrics: updating
      ? current.fabrics.map((entry) => entry._id === fabric._id ? fabric : entry)
      : [fabric, ...current.fabrics] }));
    setEditor(null);
    setExpanded(fabric._id);
    setSearch("");
    setStatus({ token, message: updating ? "updated" : "added" });
  };
  const edit = (fabric = null) => { setEditor({ token, fabric }); setStatus(null); };
  const showLabels = (fabric, pieceBarcode) => setLabels({ fabric, pieceBarcode, token });
  const askDelete = (fabric, color, piece) => { setDeletion({ fabric, color, piece, token }); setStatus(null); };
  const deleted = ({ fabricId, fabric }, kind) => {
    setResult((current) => ({ ...current, fabrics: current.fabrics.flatMap((entry) => entry._id === fabricId ? fabric ? [fabric] : [] : [entry]) }));
    setDeletion(null);
    setLabels((current) => current?.fabric._id === fabricId ? null : current);
    if (!fabric) setExpanded((current) => current === fabricId ? null : current);
    setStatus({ token, message: kind === "piece" ? "deletedPiece" : kind === "color" ? "deletedColor" : "deletedFabric" });
  };

  const reduced = ({ fabricId, fabric }) => {
    setResult((current) => ({ ...current, fabrics: current.fabrics.flatMap((entry) => entry._id === fabricId ? fabric ? [fabric] : [] : [entry]) }));
    setStatus({ token, message: "reduced" });
  };
  const sold = data => {
    reduced(data); setSale(null); setStatus({ token, message: "saleSaved" }); setReceipt({ token, movement: data.movement });
  };
  const showHistory = (barcode = "") => { setReduction(null); setHistory({ token, barcode }); };

  if (!token) return <Navigate to="/LoginChoise" replace />;
  if (params.get("view") === "invoices") return <FabricInvoices fabrics={state.fabrics} permissions={state.permissions} token={token} onReload={retry} loading={state.loading || Boolean(state.error)} />;

  return <main dir={i18n.dir()} className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-8">
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">{t("fabrics.title")}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{t("fabrics.subtitle")}</p></div><div className="flex flex-wrap gap-2"><EmployeeOperation module="fabrics" operation="invoiceHistory"><Link to="/Home/Atwabe?view=invoices" data-open-fabric-invoices className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">{t("fabricInvoices.pageTitle")}</Link></EmployeeOperation><EmployeeOperation module="fabrics" operation="profits"><Link to="/Home/Atwabe/profits" data-open-fabric-profits className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><IoTrendingUpOutline size={21} />{t("fabrics.profits.button")}</Link></EmployeeOperation><EmployeeOperation module="fabrics" operation="catalog"><FabricCatalogButton key={token} token={token} disabled={state.loading || Boolean(state.error) || !state.fabrics.length} /></EmployeeOperation>{state.permissions.sell && <button type="button" data-open-fabric-sale disabled={state.loading || Boolean(state.error)} onClick={() => setSale({ token })} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><IoCartOutline size={21} />{t("fabrics.saleAction")}</button>}{state.permissions.reduce && <button type="button" onClick={() => setReduction({ token })} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"><IoRemoveCircleOutline size={21} />{t("fabrics.reduceAction")}</button>}<EmployeeOperation module="fabrics" operation="history"><button type="button" onClick={() => showHistory()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"><IoTimeOutline size={21} />{t("fabrics.movementsTitle")}</button></EmployeeOperation>{state.permissions.add && <button type="button" onClick={() => edit()} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700"><IoAddOutline size={21} />{t("fabrics.add")}</button>}</div></header>
      {status?.token === token && <p role="status" className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300">{t(`fabrics.${status.message}`)}</p>}
      {!state.loading && !state.error && pieceMatches === null && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["totalTypes", state.fabrics.length], ["totalColors", state.fabrics.reduce((count, fabric) => count + fabric.colors.length, 0)], ["quantity", totals.quantity], ["totalMeters", totals.meters]].map(([key, value]) => <div key={key} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500 dark:text-slate-400">{t(`fabrics.${key}`)}</p><p className="mt-2 text-2xl font-bold">{key === "totalMeters" ? <bdi dir="ltr">{t("fabrics.meterValue", { value: format(value) })}</bdi> : format(value)}</p></div>)}</div>}
      <div className="relative rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><IoSearchOutline size={20} className="absolute start-7 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t("fabrics.search")} placeholder={t("fabrics.search")} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 py-3 pe-3 ps-10 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800" /></div>
      {state.loading && <p role="status" className="p-8 text-center text-slate-500">{t("common.loading")}</p>}
      {state.error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><p>{t(`fabrics.errors.${state.error}`)}</p><button type="button" onClick={retry} className="mt-3 font-bold underline">{t("fabrics.retry")}</button></div>}
      {!state.loading && !state.error && pieceMatches === null && (visible.length ? <div className="space-y-4">{visible.map((fabric) => {
        const fabricTotal = fabricTotals(fabric.colors);
        const open = expanded === fabric._id && state.permissions.details;
        return <article key={fabric._id} data-fabric-id={fabric._id} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex min-w-0 items-center gap-4"><FabricPhoto fabric={fabric} token={token} className="h-24 w-24" /><div className="min-w-0"><h2 dir="auto" className="break-words text-lg font-bold">{fabric.type}</h2>{fabric.reference && <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{t("fabrics.reference")}: <bdi>{fabric.reference}</bdi></p>}<p data-fabric-price className="mt-2 text-sm font-semibold text-blue-700 dark:text-blue-300">{t("fabrics.salePricePerMeter")}: {Number.isFinite(fabric.salePricePerMeter) && fabric.salePricePerMeter > 0 ? <bdi>{t("fabrics.salePriceValue", { value: fabric.salePricePerMeter.toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</bdi> : t("fabrics.priceUnknown")}</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.wholesalePricePerMeter")}: {Number.isFinite(fabric.wholesalePricePerMeter) ? t("fabrics.salePriceValue", { value: format(fabric.wholesalePricePerMeter) }) : t("fabrics.priceUnknown")} · {t("fabrics.purchasePricePerMeter")}: {Number.isFinite(fabric.purchasePricePerMeter) ? t("fabrics.salePriceValue", { value: format(fabric.purchasePricePerMeter) }) : t("fabrics.priceUnknown")}</p><p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400"><span>{t("fabrics.colors")}: {format(fabric.colors.length)}</span><span>{t("fabrics.quantity")}: {format(fabricTotal.quantity)}</span><bdi dir="ltr" className="font-semibold text-primary-700 dark:text-primary-400">{t("fabrics.meterValue", { value: format(fabricTotal.meters) })}</bdi></p></div></div><div className="flex flex-wrap gap-2">{state.permissions.delete && <button type="button" onClick={() => askDelete(fabric)} aria-label={t("fabrics.deleteFabricNamed", { type: fabric.type })} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/30"><IoTrashOutline size={19} />{t("fabrics.deleteAction")}</button>}{(state.permissions.update || state.permissions.addColor || state.permissions.addPiece) && <button type="button" onClick={() => edit(fabric)} aria-label={t("fabrics.editNamed", { type: fabric.type })} className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300"><IoCreateOutline size={19} />{t("fabrics.editAction")}</button>}<EmployeeOperation module="fabrics" operation="labels"><button type="button" onClick={() => showLabels(fabric)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><IoPrintOutline size={19} />{t("fabrics.printLabels")}</button></EmployeeOperation><EmployeeOperation module="fabrics" operation="details"><button type="button" onClick={() => setExpanded(open ? null : fabric._id)} aria-expanded={open} aria-controls={`fabric-pieces-${fabric._id}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-800">{t(open ? "fabrics.hideDetails" : "fabrics.details")}<IoChevronDownOutline size={18} className={open ? "rotate-180" : ""} /></button></EmployeeOperation></div></div>
          <div id={`fabric-pieces-${fabric._id}`} hidden={!open}>{open && <div className="space-y-5 border-t border-slate-200 p-4 dark:border-slate-800 sm:p-5">{fabric.colors.map((color) => {
            const colorTotal = fabricTotals([color]);
            return <section data-fabric-color={color._id} key={color._id || `${color.name}-${color.number}`} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"><header className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 dark:bg-slate-800/50"><div><h3 dir="auto" className="font-bold">{color.name}</h3>{color.number && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("fabrics.colorNumber")}: <bdi>{color.number}</bdi></p>}</div><div className="flex flex-wrap gap-4 text-sm"><span>{t("fabrics.quantity")}: <b>{format(colorTotal.quantity)}</b></span><bdi dir="ltr" className="font-semibold">{t("fabrics.meterValue", { value: format(colorTotal.meters) })}</bdi>{state.permissions.deleteColor && <button type="button" onClick={() => askDelete(fabric, color)} aria-label={t("fabrics.deleteColorNamed", { name: color.name })} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-950/30"><IoTrashOutline size={19} />{t("fabrics.deleteAction")}</button>}</div></header><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-start text-sm"><caption className="sr-only">{fabric.type} — {color.name}</caption><thead className="text-xs text-slate-500 dark:text-slate-400"><tr>{["pieces", "meters", "barcode"].map((key) => <th key={key} scope="col" className="px-4 py-3 text-start">{t(`fabrics.${key}`)}</th>)}<th scope="col" className="px-4 py-3"><span className="sr-only">{t("fabrics.actions")}</span></th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{color.pieces.map((piece, index) => <tr data-piece-barcode={piece.barcode} key={piece.barcode}><th scope="row" className="px-4 py-3 text-start font-medium">{t("fabrics.piece", { number: index + 1 })}</th><td className="px-4 py-3 font-semibold"><bdi dir="ltr">{t("fabrics.meterValue", { value: format(piece.meters) })}</bdi></td><td className="px-4 py-3"><div className="inline-block rounded-lg bg-white p-1" dir="ltr"><Barcode value={piece.barcode} format="EAN13" width={1.1} height={30} fontSize={11} margin={4} /></div></td><td className="px-4 py-3"><div className="flex items-center gap-2">{state.permissions.deletePiece && <button type="button" onClick={() => askDelete(fabric, color, piece)} aria-label={t("fabrics.deletePieceNamed", { number: index + 1 })} title={t("fabrics.deletePieceNamed", { number: index + 1 })} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"><IoTrashOutline size={20} /></button>}<EmployeeOperation module="fabrics" operation="labels"><button type="button" onClick={() => showLabels(fabric, piece.barcode)} aria-label={t("fabrics.printPiece", { number: index + 1 })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><IoPrintOutline size={20} /></button></EmployeeOperation></div></td></tr>)}</tbody></table></div></section>;
          })}</div>}</div>
        </article>;
      })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700"><IoLayersOutline size={38} className="mx-auto mb-4 text-slate-400" /><p className="font-semibold">{t(state.fabrics.length ? "fabrics.noResults" : "fabrics.empty")}</p>{!state.fabrics.length && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.emptyHint")}</p>}</div>)}
      {!state.loading && !state.error && pieceMatches !== null && (pieceMatches.length
        ? <div className="space-y-4">{pieceMatches.map((match) => <FabricPieceResult key={`${match.fabric._id}-${match.piece.barcode}`} match={match} token={token} canEdit={state.permissions.update || state.permissions.addColor || state.permissions.addPiece} canDelete={state.permissions.deletePiece} onEdit={edit} onPrint={showLabels} onDelete={askDelete} />)}</div>
        : <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700"><IoSearchOutline size={38} className="mx-auto mb-4 text-slate-400" /><p className="font-semibold">{t("fabrics.noResults")}</p></div>)}
    </div>
    {editor?.token === token && <AddFabricForm key={editor.fabric?._id || "new"} fabric={editor.fabric} canUpdate={state.permissions.update} canAddColor={state.permissions.addColor} canAddPiece={state.permissions.addPiece} canDeleteColor={state.permissions.deleteColor} canDeletePiece={state.permissions.deletePiece} token={token} usedBarcodes={usedBarcodes} onClose={() => setEditor(null)} onSaved={saved} />}
    {sale?.token === token && <FabricSaleDialog fabrics={state.fabrics} token={token} permissions={state.permissions} onClose={() => setSale(null)} onSold={sold} onReloaded={data => setResult({ ...data, token, loading: false, error: "" })} />}
    {receipt?.token === token && <FabricSaleReceiptDialog movement={receipt.movement} onClose={() => setReceipt(null)} />}
    {reduction?.token === token && <FabricReductionDialog fabrics={state.fabrics} token={token} canReduce={state.permissions.reduce} onClose={() => setReduction(null)} onReduced={reduced} onReloaded={(data) => setResult({ ...data, token, loading: false, error: "" })} onHistory={state.permissions.history ? showHistory : undefined} />}
    {history?.token === token && <FabricMovements token={token} barcode={history.barcode} onClose={() => setHistory(null)} onReceipt={movement => setReceipt({ token, movement })} />}
    {deletion?.token === token && <FabricDeleteDialog target={deletion} token={token} onClose={() => setDeletion(null)} onDeleted={deleted} />}
    {labels?.token === token && <FabricLabelsDialog fabric={labels.fabric} pieceBarcode={labels.pieceBarcode} onClose={() => setLabels(null)} />}
  </main>;
}
