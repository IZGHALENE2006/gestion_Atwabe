import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "react-icons/io5";
import { fabricTotals } from "../../../shared/fabrics.js";
import { removeFabricEntry } from "./fabricsApi.js";

export default function FabricDeleteDialog({ target, token, onClose, onDeleted }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { fabric, color, piece } = target;
  const kind = piece ? "piece" : color ? "color" : "fabric";
  const totals = fabricTotals(piece ? [{ pieces: [piece] }] : color ? [color] : fabric.colors);
  const meters = totals.meters.toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 });
  const cascade = kind === "piece" && color.pieces.length === 1
    ? fabric.colors.length === 1 ? "deleteLastPieceFabric" : "deleteLastPieceColor"
    : kind === "color" && fabric.colors.length === 1 ? "deleteLastColor" : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const confirm = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await removeFabricEntry(target, token);
      if (dialogRef.current?.open) onDeleted(result, kind);
    } catch (failure) {
      const message = failure.response?.data?.message;
      if (dialogRef.current?.open) setError(["workerMaterialsInUse", "forbidden", "notFound", "conflict"].includes(message) ? message : "deleteFailed");
    } finally {
      savingRef.current = false;
      if (dialogRef.current?.open) setSaving(false);
    }
  };

  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="fabric-delete-title" aria-describedby="fabric-delete-description" onCancel={(event) => { event.preventDefault(); if (!savingRef.current) onClose(); }} className="fixed top-4 right-4 bottom-auto left-auto m-auto max-h-[90dvh] w-[calc(100dvw-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:inset-0">
    <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"><IoTrashOutline size={25} /></span>
    <h2 id="fabric-delete-title" className="text-xl font-bold">{t(`fabrics.deleteTitles.${kind}`)}</h2>
    <p id="fabric-delete-description" className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t(`fabrics.deleteMessages.${kind}`)}</p>
    <dl className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
      <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t("fabrics.type")}</dt><dd dir="auto" className="mt-1 break-words font-semibold">{fabric.type}</dd>{fabric.reference && <dd className="mt-1 break-words"><bdi>{fabric.reference}</bdi></dd>}</div>
      {color && <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t("fabrics.color")}</dt><dd dir="auto" className="mt-1 break-words font-semibold">{color.name}</dd>{color.number && <dd className="mt-1 break-words"><bdi>{color.number}</bdi></dd>}</div>}
      {piece && <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t("fabrics.barcode")}</dt><dd dir="ltr" className="mt-1 break-all font-mono">{piece.barcode}</dd></div>}
      <div className="flex flex-wrap gap-4"><span>{t("fabrics.quantity")}: <b>{totals.quantity}</b></span><bdi dir="ltr" className="font-semibold">{t("fabrics.meterValue", { value: meters })}</bdi></div>
    </dl>
    {cascade && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{t(`fabrics.${cascade}`)}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-600 dark:text-rose-400">{t(`fabrics.errors.${error}`)}</p>}
    <footer className="mt-6 flex flex-wrap justify-end gap-3">
      <button type="button" autoFocus disabled={saving} onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold disabled:opacity-50 dark:border-slate-700">{t("common.cancel")}</button>
      <button type="button" disabled={saving} onClick={confirm} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"><IoTrashOutline size={19} />{t(saving ? "confirmDelete.deleting" : "fabrics.deleteAction")}</button>
    </footer>
  </dialog>;
}
