import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoSearchOutline, IoRemoveCircleOutline, IoTimeOutline } from "react-icons/io5";
import { calculateFabricReduction, findFabricPieces, isFabricBarcode } from "../../../shared/fabrics.js";
import { loadFabrics, reduceFabricPiece } from "./fabricsApi.js";

export default function FabricReductionDialog({ fabrics, token, canReduce, onClose, onReduced, onReloaded, onHistory }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const submissionRef = useRef(null);
  const [method, setMethod] = useState("barcode");
  const [search, setSearch] = useState("");
  const [fabricId, setFabricId] = useState("");
  const [colorId, setColorId] = useState("");
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const chosenFabric = fabrics.find((fabric) => fabric._id === fabricId);
  const chosenColor = chosenFabric?.colors.find((color) => color._id === colorId);
  const matches = method === "barcode" ? findFabricPieces(fabrics, search)
    : chosenColor?.pieces.map((piece, index) => ({ fabric: chosenFabric, color: chosenColor, piece, pieceNumber: index + 1 }));
  const complete = isFabricBarcode(search.trim());
  const showPieces = method === "barcode" ? complete : Boolean(chosenColor);
  const format = (value) => Number(value).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 });
  let preview = null, validation = "";
  if (selected && amount.trim()) {
    try { preview = calculateFabricReduction(amount, selected.piece.meters); }
    catch (failure) { validation = failure.message; }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    dialogRef.current?.querySelector(method === "barcode" ? "#fabric-reduction-barcode" : "#fabric-reduction-type")?.focus();
  }, [method]);

  useEffect(() => {
    if (selected?.piece.meters > 0) dialogRef.current?.querySelector("#fabric-reduction-meters")?.focus();
  }, [selected]);

  const select = (match) => { setSelected(match); setAmount(""); setError(""); setSuccess(null); submissionRef.current = null; };
  const changeMethod = (next) => {
    if (savingRef.current || next === method) return;
    setMethod(next);
    setSearch("");
    setFabricId("");
    setColorId("");
    select(null);
  };
  const submit = async (event) => {
    event.preventDefault();
    if (savingRef.current || !canReduce || !selected) return;
    let input;
    try { input = calculateFabricReduction(amount, selected.piece.meters); }
    catch (failure) { setError(failure.message); return; }
    const fingerprint = [selected.fabric._id, selected.fabric.__v, selected.color._id, selected.piece._id, input.meters].join("/");
    if (submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, requestId: crypto.randomUUID() };
    savingRef.current = true;
    setSaving(true);
    setError("");
    setSuccess(null);
    try {
      const result = await reduceFabricPiece(selected, input.meters, submissionRef.current.requestId, token);
      if (!dialogRef.current?.open) return;
      onReduced(result);
      const color = result.fabric?.colors.find((entry) => entry._id === selected.color._id);
      const piece = color?.pieces.find((entry) => entry._id === selected.piece._id);
      if (method === "browse") {
        if (!result.fabric) setFabricId("");
        if (!color) setColorId("");
      }
      setSelected(piece ? { fabric: result.fabric, color, piece, pieceNumber: selected.pieceNumber } : null);
      setSuccess(result.movement);
      setAmount("");
      submissionRef.current = null;
    } catch (failure) {
      const code = failure.response?.data?.message;
      if (dialogRef.current?.open) setError(["forbidden", "notFound", "conflict", "insufficientMeters", "invalidReduction", "requestConflict"].includes(code) ? code : "reductionFailed");
    } finally {
      savingRef.current = false;
      if (dialogRef.current?.open) setSaving(false);
    }
  };

  const reload = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const data = await loadFabrics(token);
      if (!dialogRef.current?.open) return;
      onReloaded(data);
      let match;
      if (method === "barcode") match = findFabricPieces(data.fabrics, search)?.[0];
      else {
        const fabric = data.fabrics.find((entry) => entry._id === fabricId);
        const color = fabric?.colors.find((entry) => entry._id === colorId);
        const index = color?.pieces.findIndex((entry) => entry._id === selected?.piece._id);
        if (index >= 0) match = { fabric, color, piece: color.pieces[index], pieceNumber: index + 1 };
        if (!fabric) setFabricId("");
        if (!color) setColorId("");
      }
      select(match || null);
      if (!match && (method === "barcode" ? complete : selected)) setError("notFound");
    } catch {
      if (dialogRef.current?.open) setError("loadFailed");
    } finally {
      savingRef.current = false;
      if (dialogRef.current?.open) setSaving(false);
    }
  };

  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="fabric-reduction-title" onCancel={(event) => { event.preventDefault(); if (!savingRef.current) onClose(); }} className="fixed top-4 right-4 bottom-auto left-auto m-auto max-h-[90dvh] w-[calc(100dvw-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:inset-0">
    <header className="mb-4 flex items-start justify-between gap-3"><div><h2 id="fabric-reduction-title" className="text-xl font-bold text-blue-700 dark:text-blue-400">{t("fabrics.reduceAction")}</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.reductionHint")}</p></div><button type="button" disabled={saving} onClick={onClose} aria-label={t("dialog.close")} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"><IoCloseOutline size={23} /></button></header>
    <div role="group" aria-label={t("fabrics.selectionMethod")} className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {[["barcode", "byBarcode"], ["browse", "byTypeColor"]].map(([value, label]) => <button key={value} type="button" disabled={saving} aria-pressed={method === value} data-reduction-method={value} onClick={() => changeMethod(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${method === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"}`}>{t(`fabrics.${label}`)}</button>)}
    </div>
    {method === "barcode" ? <>
    <label htmlFor="fabric-reduction-barcode" className="mb-2 block text-sm font-semibold">{t("fabrics.barcode")}</label>
    <div className="relative"><IoSearchOutline className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={19} /><input id="fabric-reduction-barcode" type="search" inputMode="numeric" dir="ltr" disabled={saving} value={search} onChange={(event) => { setSearch(event.target.value); select(null); }} placeholder={t("fabrics.scanBarcode")} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 py-3 pe-3 ps-10 font-mono text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" /></div>
    {!complete && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.scanHint")}</p>}
    {complete && !matches?.length && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.pieceNotFound")}</p>}
    </> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="fabric-reduction-type" className="mb-2 block text-sm font-semibold">{t("fabrics.type")}</label><select id="fabric-reduction-type" disabled={saving || !fabrics.length} value={chosenFabric?._id || ""} onChange={(event) => { setFabricId(event.target.value); setColorId(""); select(null); }} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800">
          <option value="">{t("fabrics.chooseType")}</option>
          {fabrics.map((fabric) => <option key={fabric._id} value={fabric._id}>{fabric.type}{fabric.reference ? ` · ${fabric.reference}` : ""}</option>)}
        </select></div>
        <div><label htmlFor="fabric-reduction-color" className="mb-2 block text-sm font-semibold">{t("fabrics.color")}</label><select id="fabric-reduction-color" disabled={saving || !chosenFabric} value={chosenColor?._id || ""} onChange={(event) => { setColorId(event.target.value); select(null); }} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800">
          <option value="">{t("fabrics.chooseColor")}</option>
          {chosenFabric?.colors.map((color) => <option key={color._id} value={color._id}>{color.name}{color.number ? ` · ${color.number}` : ""}</option>)}
        </select></div>
      </div>
      {!fabrics.length && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.empty")}</p>}
      {chosenColor && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.choosePieceHint")}</p>}
    </>}
    {showPieces && <div role="region" aria-label={t("fabrics.pieces")} className={`mt-4 space-y-3 ${method === "browse" ? "max-h-72 overflow-y-auto rounded-xl pe-1" : ""}`}>{matches?.map((match) => <section key={match.piece._id} data-reduction-piece={match.piece.barcode} className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <p dir="auto" className="break-words font-bold">{match.fabric.type}{match.fabric.reference ? ` · ${match.fabric.reference}` : ""}</p>
      <p dir="auto" className="mt-2 break-words text-sm">{match.color.name}{match.color.number ? ` · ${match.color.number}` : ""}</p>
      <p className="mt-2 text-sm">{t("fabrics.piece", { number: match.pieceNumber })} · <bdi dir="ltr" className="font-mono">{match.piece.barcode}</bdi></p>
      <p className="mt-3 text-lg font-bold text-blue-700 dark:text-blue-400"><bdi dir="ltr">{t("fabrics.meterValue", { value: format(match.piece.meters) })}</bdi></p>
      {match.piece.meters === 0 ? <p className="mt-2 text-sm font-semibold text-rose-600 dark:text-rose-400">{t("fabrics.exhausted")}</p> : <button type="button" disabled={saving} onClick={() => select(match)} aria-pressed={selected?.piece._id === match.piece._id} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{t(selected?.piece._id === match.piece._id ? "fabrics.pieceSelected" : "fabrics.selectPiece")}</button>}
    </section>)}</div>}
    {selected && selected.piece.meters > 0 && <form noValidate onSubmit={submit} className="mt-5 space-y-4">
      <div><label htmlFor="fabric-reduction-meters" className="mb-2 block text-sm font-bold">{t("fabrics.reductionMeters")}</label><input id="fabric-reduction-meters" type="text" inputMode="decimal" dir="ltr" disabled={saving || !canReduce} value={amount} onChange={(event) => { setAmount(event.target.value); setError(""); setSuccess(null); }} aria-invalid={Boolean(validation || error === "invalidReduction" || error === "insufficientMeters")} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" placeholder="20" /></div>
      {preview && <div data-reduction-preview className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">{[["beforeReduction", selected.piece.meters], ["reductionMeters", preview.meters], ["remainingMeters", preview.remaining]].map(([key, value]) => <div key={key}><p className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t(`fabrics.${key}`)}</p><bdi dir="ltr" className="font-bold">{t("fabrics.meterValue", { value: format(value) })}</bdi></div>)}</div>}
      {preview?.remaining === 0 && <p className="text-sm text-amber-700 dark:text-amber-400">{t("fabrics.exhaustedHint")}</p>}
      {validation && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{t(`fabrics.errors.${validation}`)}</p>}
      <button type="submit" disabled={saving || !canReduce || !preview} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><IoRemoveCircleOutline size={21} />{t(saving ? "common.loading" : "fabrics.confirmReduction")}</button>
    </form>}
    {success && <p role="status" data-reduction-success className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{t("fabrics.reductionSaved", { removed: format(success.meters), remaining: format(success.remainingMeters) })}</p>}
    {error && <div className="mt-4 text-sm text-rose-600 dark:text-rose-400"><p role="alert">{t(`fabrics.errors.${error}`)}</p>{["conflict", "notFound", "insufficientMeters", "loadFailed"].includes(error) && <button type="button" disabled={saving} onClick={reload} className="mt-2 font-bold underline">{t("fabrics.reloadStock")}</button>}</div>}
    <footer className="mt-5 flex flex-wrap justify-end gap-3"><EmployeeOperation module="fabrics" operation="history"><button type="button" disabled={saving} onClick={() => onHistory(selected?.piece.barcode || (complete ? search.trim() : ""))} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700"><IoTimeOutline size={19} />{t("fabrics.movementsTitle")}</button></EmployeeOperation><button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700">{t("dialog.close")}</button></footer>
  </dialog>;
}
