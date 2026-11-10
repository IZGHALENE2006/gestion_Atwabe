import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoCloseOutline, IoRefreshOutline, IoSaveOutline, IoTrashOutline } from "react-icons/io5";
import Barcode from "react-barcode";
import { FABRIC_LIMITS, fabricTotals, generateFabricBarcode, validateFabric, validateFabricUpdate } from "../../../shared/fabrics.js";
import { saveFabric } from "./fabricsApi.js";
import FabricPhotoField from "./FabricPhotoField.jsx";

const inputClass = "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 aria-invalid:border-rose-500 dark:border-slate-700 dark:bg-slate-800";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800";
const newPiece = (used, meters = "") => {
  const barcode = generateFabricBarcode(used);
  used.add(barcode);
  return { _key: crypto.randomUUID(), meters, barcode };
};
const newColor = (used) => ({ _key: crypto.randomUUID(), name: "", number: "", batchMeters: "", batchQuantity: "1", pieces: [newPiece(used)] });

function FieldError({ path, fields }) {
  const { t } = useTranslation();
  return fields[path] ? <p id={`${path}-error`} className="mt-1 text-xs text-rose-600 dark:text-rose-400">{t(`fabrics.errors.${fields[path]}`)}</p> : null;
}

export default function AddFabricForm({ fabric, token, usedBarcodes, canUpdate, canAddColor, canAddPiece, canDeleteColor, canDeletePiece, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(() => fabric ? {
    type: fabric.type, reference: fabric.reference || "", salePricePerMeter: String(fabric.salePricePerMeter ?? ""), purchasePricePerMeter: String(fabric.purchasePricePerMeter ?? ""), wholesalePricePerMeter: String(fabric.wholesalePricePerMeter ?? ""),
    colors: fabric.colors.map((color) => ({
      ...color, _key: crypto.randomUUID(), batchMeters: "", batchQuantity: "1",
      pieces: color.pieces.map((piece) => ({ ...piece, _key: crypto.randomUUID(), meters: String(piece.meters) })),
    })),
  } : { type: "", reference: "", salePricePerMeter: "", purchasePricePerMeter: "", wholesalePricePerMeter: "", colors: [newColor(new Set(usedBarcodes))] });
  const [photo, setPhoto] = useState(null);
  const [removedPhoto, setRemovedPhoto] = useState(false);
  const [fields, setFields] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const format = (value) => Number(value).toLocaleString(locale, { maximumFractionDigits: 3 });
  const totals = fabricTotals(draft.colors);
  const pieceCount = draft.colors.reduce((count, color) => count + color.pieces.length, 0);
  const allUsed = () => new Set([...usedBarcodes, ...draft.colors.flatMap((color) => color.pieces.map((piece) => piece.barcode))]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const change = (update) => { setDraft(update); setFields({}); setError(""); };
  const changeColor = (key, update) => change((current) => ({ ...current, colors: current.colors.map((color) => color._key === key ? update(color) : color) }));
  const changePiece = (colorKey, pieceKey, update) => changeColor(colorKey, (color) => ({ ...color, pieces: color.pieces.map((piece) => piece._key === pieceKey ? update(piece) : piece) }));
  const addColor = () => {
    if (draft.colors.length >= FABRIC_LIMITS.colors || pieceCount >= FABRIC_LIMITS.pieces) return;
    const color = newColor(allUsed());
    change((current) => ({ ...current, colors: [...current.colors, color] }));
  };
  const addPiece = (colorKey) => {
    if (pieceCount >= FABRIC_LIMITS.pieces) return;
    const piece = newPiece(allUsed());
    changeColor(colorKey, (color) => ({ ...color, pieces: [...color.pieces, piece] }));
  };
  const addBatch = (color, colorIndex) => {
    const path = `colors.${colorIndex}.batch`;
    const quantity = Number(color.batchQuantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > FABRIC_LIMITS.pieces) { setFields({ [path]: "invalidQuantity" }); return; }
    try { validateFabric({ type: "batch", colors: [{ name: "batch", pieces: [{ meters: color.batchMeters, barcode: color.pieces[0].barcode }] }] }); }
    catch { setFields({ [path]: "invalidMeters" }); return; }
    const replaceEmpty = color.pieces.length === 1 && color.pieces[0].meters === "";
    if (pieceCount + quantity - Number(replaceEmpty) > FABRIC_LIMITS.pieces) { setFields({ [path]: "tooManyPieces" }); return; }
    const used = allUsed();
    const pieces = Array.from({ length: quantity }, () => newPiece(used, color.batchMeters));
    changeColor(color._key, (current) => ({ ...current, pieces: [...(replaceEmpty ? [] : current.pieces), ...pieces], batchMeters: "", batchQuantity: "1" }));
  };
  const regenerateAll = () => {
    const used = allUsed();
    const colors = draft.colors.map((color) => ({ ...color, pieces: color.pieces.map((piece) => {
      const barcode = generateFabricBarcode(used);
      used.add(barcode);
      return { ...piece, barcode };
    }) }));
    change((current) => ({ ...current, colors }));
  };
  const showErrors = (value) => {
    setFields(value);
    const path = Object.keys(value)[0];
    if (path) dialogRef.current.querySelector(`[data-field="${path}"]`)?.focus();
  };
  const fieldProps = (path) => ({ "data-field": path, "aria-invalid": Boolean(fields[path]), "aria-describedby": fields[path] ? `${path}-error` : undefined });
  const submit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    let input;
    try {
      const values = { ...draft };
      if (fabric && !canUpdate) for (const key of ['salePricePerMeter', 'purchasePricePerMeter', 'wholesalePricePerMeter']) if (fabric[key] === undefined) delete values[key];
      input = fabric ? validateFabricUpdate(values, fabric, { requirePrices: Boolean(canUpdate) }) : validateFabric(values, { requirePrices: true });
    }
    catch (validation) { showErrors(validation.fields || {}); setError("invalidFabric"); return; }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setFields({});
    try {
      const saved = await saveFabric(input, token, fabric?._id, fabric?.__v, { file: photo?.file, removePhoto: removedPhoto });
      if (dialogRef.current?.open) onSaved(saved);
    } catch (failure) {
      const response = failure.response?.data;
      const code = ["tailoringFabricInUse", "workerMaterialsInUse", "invalidFabric", "forbidden", "duplicateBarcode", "notFound", "conflict", "imageTooLarge", "imageTypeInvalid", "imageUploadInvalid"].includes(response?.message) ? response.message : "saveFailed";
      if (response?.fields) showErrors(response.fields);
      setError(code);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="fabric-form-title" onCancel={(event) => { event.preventDefault(); if (!savingRef.current) onClose(); }} className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-700">
      <h2 id="fabric-form-title" className="text-xl font-bold">{t(fabric ? "fabrics.edit" : "fabrics.add")}</h2>
      <button type="button" disabled={saving} onClick={onClose} aria-label={t("dialog.close")} className="rounded-lg p-2 hover:bg-slate-200 disabled:opacity-40 dark:hover:bg-slate-800"><IoCloseOutline size={24} /></button>
    </header>
    <form noValidate onSubmit={submit} className="p-4 sm:p-6">
      <fieldset disabled={saving} className="min-w-0 space-y-5 disabled:opacity-70">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label htmlFor="fabric-type" className="mb-2 block text-sm font-bold">{t("fabrics.type")} *</label><input id="fabric-type" disabled={Boolean(fabric && !canUpdate)} autoFocus required maxLength={FABRIC_LIMITS.text} value={draft.type} placeholder={t("fabrics.typePlaceholder")} onChange={(event) => change((current) => ({ ...current, type: event.target.value }))} className={inputClass} {...fieldProps("type")} /><FieldError path="type" fields={fields} /></div>
          {[["purchasePricePerMeter", "purchasePriceLabel", "fabric-purchase-price"], ["wholesalePricePerMeter", "wholesalePriceLabel", "fabric-wholesale-price"], ["salePricePerMeter", "retailPriceLabel", "fabric-sale-price"]].map(([key, label, id]) => <div key={key}><label htmlFor={id} className="mb-2 block text-sm font-bold">{t("fabrics." + label)} *</label><input id={id} disabled={Boolean(fabric && !canUpdate)} required inputMode="decimal" dir="ltr" maxLength={20} value={draft[key]} onChange={event => change(current => ({ ...current, [key]: event.target.value }))} className={inputClass} {...fieldProps(key)} /><FieldError path={key} fields={fields} /></div>)}
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:col-span-2 lg:col-span-3">{t("fabrics.salePriceHint")}</p>
          <div><label htmlFor="fabric-reference" className="mb-2 block text-sm font-bold">{t("fabrics.reference")} <span className="font-normal text-slate-500">({t("fabrics.optional")})</span></label><input id="fabric-reference" disabled={Boolean(fabric && !canUpdate)} maxLength={FABRIC_LIMITS.text} value={draft.reference} onChange={(event) => change((current) => ({ ...current, reference: event.target.value }))} className={inputClass} {...fieldProps("reference")} /><FieldError path="reference" fields={fields} /></div>
        </div>
        <FabricPhotoField fabric={fabric} token={token} selection={photo} removed={removedPhoto} disabled={saving || Boolean(fabric && !canUpdate)} onSelect={selection => { setPhoto(selection); setRemovedPhoto(false); setError(""); }} onRemove={() => { setPhoto(null); setRemovedPhoto(true); setError(""); }} />
        <p className="rounded-xl border border-primary-100 bg-primary-50 p-3 text-sm text-primary-800 dark:border-primary-900 dark:bg-primary-950/30 dark:text-primary-300">{t("fabrics.quantityHint")}</p>
        <FieldError path="colors" fields={fields} />
        {draft.colors.map((color, colorIndex) => {
          const path = `colors.${colorIndex}`;
          const colorTotals = fabricTotals([color]);
          return <section key={color._key} aria-label={`${t("fabrics.color")} ${colorIndex + 1}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/40 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-bold">{t("fabrics.color")} {colorIndex + 1}</h3><button type="button" disabled={draft.colors.length === 1 || Boolean(color._id && !canDeleteColor)} onClick={() => change((current) => ({ ...current, colors: current.colors.filter((entry) => entry._key !== color._key) }))} aria-label={t("fabrics.removeColor")} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 disabled:opacity-30 dark:hover:bg-rose-950/30"><IoTrashOutline size={19} /></button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor={`color-${color._key}`} className="mb-2 block text-sm font-semibold">{t("fabrics.color")} *</label><input id={`color-${color._key}`} disabled={Boolean(color._id && !canUpdate)} required maxLength={FABRIC_LIMITS.text} value={color.name} placeholder={t("fabrics.colorPlaceholder")} onChange={(event) => changeColor(color._key, (current) => ({ ...current, name: event.target.value }))} className={inputClass} {...fieldProps(`${path}.name`)} /><FieldError path={`${path}.name`} fields={fields} /></div>
              <div><label htmlFor={`number-${color._key}`} className="mb-2 block text-sm font-semibold">{t("fabrics.colorNumber")} <span className="font-normal text-slate-500">({t("fabrics.optional")})</span></label><input id={`number-${color._key}`} disabled={Boolean(color._id && !canUpdate)} maxLength={FABRIC_LIMITS.text} value={color.number} onChange={(event) => changeColor(color._key, (current) => ({ ...current, number: event.target.value }))} className={inputClass} {...fieldProps(`${path}.number`)} /><FieldError path={`${path}.number`} fields={fields} /></div>
            </div>
            <div className="my-4 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>{t("fabrics.quantity")}: <b>{format(colorTotals.quantity)}</b></span><span>{t("fabrics.totalMeters")}: <b dir="ltr">{t("fabrics.meterValue", { value: format(colorTotals.meters) })}</b></span></div>
            <FieldError path={`${path}.pieces`} fields={fields} />
            <div className="space-y-3">{color.pieces.map((piece, pieceIndex) => {
              const piecePath = `${path}.pieces.${pieceIndex}`;
              return <div key={piece._key} className="grid min-w-0 items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50 sm:grid-cols-[1fr_2fr_auto]">
                <div><label htmlFor={`meters-${piece._key}`} className="mb-2 block text-xs font-semibold">{t("fabrics.piece", { number: pieceIndex + 1 })} — {t("fabrics.meters")} *</label><input id={`meters-${piece._key}`} disabled={Boolean(piece._id && !canUpdate)} required type="number" min={fabric?.colors.some((entry) => entry.pieces.some((stored) => stored._id === piece._id && stored.meters === 0)) ? 0 : 0.001} max={FABRIC_LIMITS.meters} step="0.001" inputMode="decimal" value={piece.meters} placeholder="35" onChange={(event) => changePiece(color._key, piece._key, (current) => ({ ...current, meters: event.target.value }))} className={inputClass} {...fieldProps(`${piecePath}.meters`)} /><FieldError path={`${piecePath}.meters`} fields={fields} /></div>
                <div className="min-w-0"><label htmlFor={`barcode-${piece._key}`} className="mb-2 block text-xs font-semibold">{t("fabrics.barcode")}</label><div className="flex items-center gap-2"><input id={`barcode-${piece._key}`} readOnly value={piece.barcode} dir="ltr" className={`${inputClass} font-mono`} {...fieldProps(`${piecePath}.barcode`)} /><button type="button" disabled={Boolean(piece._id && !canUpdate)} onClick={() => { const barcode = generateFabricBarcode(allUsed()); changePiece(color._key, piece._key, (current) => ({ ...current, barcode })); }} aria-label={t("fabrics.regenerate")} className={buttonClass}><IoRefreshOutline size={18} /></button></div><FieldError path={`${piecePath}.barcode`} fields={fields} /><div className="mt-2 overflow-x-auto rounded-lg bg-white p-2 text-center" dir="ltr"><Barcode value={piece.barcode} format="EAN13" height={30} width={1.1} displayValue={false} margin={4} /></div></div>
                <button type="button" disabled={color.pieces.length === 1 || Boolean(piece._id && !canDeletePiece)} onClick={() => changeColor(color._key, (current) => ({ ...current, pieces: current.pieces.filter((entry) => entry._key !== piece._key) }))} aria-label={t("fabrics.removePiece")} className="justify-self-end rounded-lg p-2 text-rose-500 hover:bg-rose-50 disabled:opacity-30 dark:hover:bg-rose-950/30 sm:mt-6"><IoTrashOutline size={19} /></button>
              </div>;
            })}</div>
            <button type="button" disabled={pieceCount >= FABRIC_LIMITS.pieces || Boolean(fabric && color._id && !canAddPiece)} onClick={() => addPiece(color._key)} className={`${buttonClass} mt-3`}><IoAddOutline size={19} />{t("fabrics.addPiece")}</button>
            <details className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 text-sm dark:border-slate-700"><summary className="cursor-pointer font-semibold">{t("fabrics.batch")}</summary><div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><div><label htmlFor={`batch-quantity-${color._key}`} className="mb-1 block text-xs">{t("fabrics.quantity")}</label><input id={`batch-quantity-${color._key}`} type="number" min="1" max={FABRIC_LIMITS.pieces} step="1" value={color.batchQuantity} onChange={(event) => changeColor(color._key, (current) => ({ ...current, batchQuantity: event.target.value }))} className={inputClass} /></div><div><label htmlFor={`batch-meters-${color._key}`} className="mb-1 block text-xs">{t("fabrics.meters")}</label><input id={`batch-meters-${color._key}`} type="number" min="0.001" max={FABRIC_LIMITS.meters} step="0.001" value={color.batchMeters} onChange={(event) => changeColor(color._key, (current) => ({ ...current, batchMeters: event.target.value }))} className={inputClass} /></div><button type="button" disabled={Boolean(fabric && color._id && !canAddPiece)} onClick={() => addBatch(color, colorIndex)} className={buttonClass}>{t("fabrics.batchAdd")}</button></div><FieldError path={`${path}.batch`} fields={fields} /></details>
          </section>;
        })}
        <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={Boolean(fabric && !canAddColor) || draft.colors.length >= FABRIC_LIMITS.colors || pieceCount >= FABRIC_LIMITS.pieces} onClick={addColor} className={buttonClass}><IoAddOutline size={20} />{t("fabrics.addColor")}</button><p className="text-xs text-slate-500 dark:text-slate-400">{t("fabrics.limits", FABRIC_LIMITS)}</p></div>
        <div className="flex flex-wrap gap-4 rounded-xl bg-slate-100 p-4 text-sm dark:bg-slate-800"><span>{t("fabrics.colors")}: <b>{format(draft.colors.length)}</b></span><span>{t("fabrics.quantity")}: <b>{format(totals.quantity)}</b></span><span>{t("fabrics.totalMeters")}: <b dir="ltr">{t("fabrics.meterValue", { value: format(totals.meters) })}</b></span></div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{t(`fabrics.errors.${error}`)}</p>}
        <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700"><button type="button" disabled={Boolean(fabric && !canUpdate)} onClick={regenerateAll} className={`${buttonClass} text-slate-500`}><IoRefreshOutline size={18} />{t("fabrics.regenerateAll")}</button><div className="flex flex-wrap gap-3"><button type="button" onClick={onClose} className={buttonClass}>{t("common.cancel")}</button><button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700"><IoSaveOutline size={19} />{saving ? t("common.loading") : t(fabric ? "fabrics.update" : "fabrics.save")}</button></div></footer>
      </fieldset>
    </form>
  </dialog>;
}
