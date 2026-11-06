import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline } from "react-icons/io5";
import { SFIFA_STOCK_LIMIT, SFIFA_STOCK_SCALE, formatSfifaCode, sfifaQuantityUnits } from "../../../shared/sfifaStock.js";
import { deleteSfifaStock, restockSfifaStock } from "./sfifaStockApi.js";

export default function SfifaStockActionDialog({ mode, stock, token, onClose, onSaved, onReload }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), busyRef = useRef(false), submissionRef = useRef(null);
  const [quantity, setQuantity] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const restocking = mode === "restock", units = sfifaQuantityUnits(quantity);
  const current = sfifaQuantityUnits(stock.quantity), after = units === null ? null : (current + units) / SFIFA_STOCK_SCALE;
  const number = value => new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 }).format(value);
  useEffect(() => {
    const dialog = dialogRef.current; dialog.showModal();
    dialog.querySelector(restocking ? "input" : "[data-cancel-sfifa-action]")?.focus();
    return () => dialog.close();
  }, [restocking]);
  const close = callback => { dialogRef.current.close(); callback(); };
  const dismiss = () => { if (!busyRef.current) close(onClose); };
  const submit = async event => {
    event.preventDefault(); if (busyRef.current) return;
    if (restocking && (units === null || units === 0 || after > SFIFA_STOCK_LIMIT)) {
      setError(units !== null && units > 0 ? "quantityLimit" : "invalidQuantity"); dialogRef.current.querySelector("input")?.focus(); return;
    }
    if (restocking && submissionRef.current?.units !== units) submissionRef.current = { units, requestId: crypto.randomUUID() };
    busyRef.current = true; setBusy(true); setError("");
    try {
      const result = restocking ? await restockSfifaStock(stock, units / SFIFA_STOCK_SCALE, submissionRef.current.requestId, token) : await deleteSfifaStock(stock, token);
      if (dialogRef.current?.open) close(() => onSaved(result));
    } catch (failure) {
      if (dialogRef.current?.open) {
        const code = failure.response?.data?.fields?.quantity || failure.response?.data?.message;
        setError(["workerMaterialsInUse", "invalidQuantity", "quantityLimit", "invalidStock", "invalidRequest", "requestConflict", "stockConflict", "notFound", "forbidden"].includes(code) ? code : restocking ? "saveFailed" : "deleteFailed");
      }
    } finally { busyRef.current = false; if (dialogRef.current?.open) setBusy(false); }
  };
  return <dialog ref={dialogRef} dir={i18n.dir()} className="sfifa-dialog" aria-labelledby="sfifa-action-title" onCancel={event => { event.preventDefault(); dismiss(); }}>
    <header><div><h2 id="sfifa-action-title">{t(restocking ? "sfifaStock.restockTitle" : "sfifaStock.deleteTitle")}</h2><p>{t(`sfifaStock.widths.${stock.width}`)} · <bdi dir="ltr">{stock.family}</bdi> · {stock.isUnassigned ? t("sfifaStock.unassigned") : <bdi dir="ltr">{formatSfifaCode(stock.code, stock.family)}</bdi>}</p></div><button type="button" onClick={dismiss} disabled={busy} aria-label={t("dialog.close")}><IoCloseOutline size={24} /></button></header>
    <form noValidate onSubmit={submit}>
      <dl className="sfifa-balance-preview"><div><dt>{t("sfifaStock.currentBalance")}</dt><dd data-sfifa-current data-value={stock.quantity}><bdi>{number(stock.quantity)} {t("sfifaStock.unit")}</bdi></dd></div>{restocking && <div><dt>{t("sfifaStock.afterRestock")}</dt><dd data-sfifa-after data-value={after ?? ""}><bdi>{after === null ? "—" : number(after)} {t("sfifaStock.unit")}</bdi></dd></div>}</dl>
      {restocking ? <div className="sfifa-restock-input"><label htmlFor="sfifa-restock-quantity">{t("sfifaStock.addedMeters")}</label><input id="sfifa-restock-quantity" type="text" inputMode="decimal" dir="ltr" value={quantity} onChange={event => { setQuantity(event.target.value); setError(""); }} disabled={busy} required maxLength={11} aria-invalid={Boolean(error)} aria-describedby="sfifa-restock-hint" /><p id="sfifa-restock-hint">{t("sfifaStock.restockHint")}</p></div> : <p className="sfifa-delete-warning">{t("sfifaStock.deleteHint", { quantity: number(stock.quantity) })}</p>}
      {error && <div role="alert" className="sfifa-dialog-error"><p>{t(`sfifaStock.errors.${error}`)}</p>{["stockConflict", "requestConflict", "notFound"].includes(error) && <button type="button" disabled={busy} onClick={() => close(onReload)}>{t("sfifaStock.reload")}</button>}</div>}
      <footer><button type="button" data-cancel-sfifa-action onClick={dismiss} disabled={busy}>{t("common.cancel")}</button><button type="submit" className={restocking ? "is-blue" : "is-danger-solid"} disabled={busy}>{t(busy ? "common.loading" : restocking ? "sfifaStock.confirmRestock" : "sfifaStock.confirmDelete")}</button></footer>
    </form>
  </dialog>;
}
