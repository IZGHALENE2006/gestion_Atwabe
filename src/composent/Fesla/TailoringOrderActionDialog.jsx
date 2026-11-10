import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCashOutline, IoCheckmarkCircleOutline, IoCloseOutline, IoBanOutline } from "react-icons/io5";
import { tailoringMoneyCents, tailoringRemainingAmount } from "../../../shared/tailoring.js";
import { addTailoringPayment, deliverTailoringOrder, cancelTailoringOrder, loadTailoringOrders } from "./feslaApi.js";

export default function TailoringOrderActionDialog({ order, mode, token, onClose, onSaved, onReload }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), busyRef = useRef(false), submissionRef = useRef(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const payment = mode === "payment", cancelling = mode === "cancel";
  const remaining = tailoringRemainingAmount(order.totalPrice ?? 0, order.paidAmount ?? 0);
  const cents = tailoringMoneyCents(amount);
  const validAmount = cents !== null && cents > 0 && remaining !== null && cents <= tailoringMoneyCents(remaining);
  const money = value => value === null ? "—" : new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const afterPayment = validAmount ? (tailoringMoneyCents(remaining) - cents) / 100 : null;
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector(payment ? "input" : "button[type=submit]")?.focus();
    return () => dialog.close();
  }, [payment]);
  const close = () => { if (!busyRef.current) { dialogRef.current.close(); onClose(); } };
  const reload = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { const data = await loadTailoringOrders(token); if (dialogRef.current?.open) { onReload(data); setError(""); } }
    catch { if (dialogRef.current?.open) setError("loadFailed"); }
    finally { busyRef.current = false; if (dialogRef.current?.open) setBusy(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (busyRef.current) return;
    if (payment && !validAmount) { setError(cents !== null && cents > 0 ? "paymentExceedsRemaining" : "invalidPayment"); return; }
    if (payment && submissionRef.current?.cents !== cents) submissionRef.current = { cents, requestId: crypto.randomUUID() };
    busyRef.current = true; setBusy(true); setError("");
    try {
      const updated = payment ? await addTailoringPayment(order, amount, submissionRef.current.requestId, token) : cancelling ? await cancelTailoringOrder(order, token) : await deliverTailoringOrder(order, token);
      if (dialogRef.current?.open) { dialogRef.current.close(); onSaved(updated); }
    } catch (failure) {
      if (dialogRef.current?.open) {
        const code = failure.response?.data?.message;
        setError(["invalidPayment", "paymentExceedsRemaining", "invalidRequest", "requestConflict", "notFound", "forbidden", "conflict", "orderCancelled", "orderNotDelivered", "fabricStockUnavailable", "fabricStockReturnLimit"].includes(code) ? code : "saveFailed");
      }
    } finally { busyRef.current = false; if (dialogRef.current?.open) setBusy(false); }
  };
  return <dialog ref={dialogRef} dir={i18n.dir()} className="fesla-action-dialog" aria-labelledby="tailoring-action-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="tailoring-action-title">{t(payment ? "fesla.addPayment" : cancelling ? "fesla.cancellation.action" : "fesla.completeAndDeliver")}</h2><button type="button" disabled={busy} onClick={close} aria-label={t("dialog.close")}><IoCloseOutline size={23} /></button></header>
    <form noValidate onSubmit={submit}>
      <p dir="auto" className="fesla-action-client">{order.clientName}</p>
      <dl className="fesla-action-summary">{["totalPrice", "paidAmount", "remainingAmount"].map(key => <div key={key}><dt>{t(`fesla.${key}`)}</dt><dd><bdi>{money(key === "remainingAmount" ? remaining : order[key] ?? 0)} {t("fesla.currency")}</bdi></dd></div>)}</dl>
      {payment ? <div className="fesla-payment-input"><label htmlFor="fesla-payment-amount">{t("fesla.paymentAmount")} ({t("fesla.currency")})</label><input id="fesla-payment-amount" type="text" inputMode="decimal" dir="ltr" value={amount} onChange={event => { setAmount(event.target.value); setError(""); }} disabled={busy} maxLength={12} placeholder="0.00" required aria-invalid={Boolean(error)} aria-describedby={error ? "fesla-action-error" : undefined} /><p aria-live="polite">{t("fesla.remainingAfterPayment")}: <bdi>{money(afterPayment)} {t("fesla.currency")}</bdi></p></div> : <p className={cancelling ? "fesla-cancellation-notice" : "fesla-delivery-hint"}>{t(cancelling ? (order.fabricStock ? "fesla.fabricStock.cancelConfirm" : "fesla.cancellation.confirm") : "fesla.deliveryHint")}</p>}
      {error && <div id="fesla-action-error" role="alert" className="fesla-action-error"><p>{t(`fesla.errors.${error}`)}</p>{["conflict", "loadFailed", "requestConflict"].includes(error) && <button type="button" disabled={busy} onClick={reload}>{t("fesla.reloadOrder")}</button>}</div>}
      <footer><button type="button" disabled={busy} onClick={close}>{t("common.cancel")}</button><button type="submit" data-confirm-tailoring-action disabled={busy || (payment && remaining === 0)} className={payment ? "fesla-payment-button" : cancelling ? "fesla-cancel-button" : "fesla-deliver-button"}>{payment ? <IoCashOutline size={20} aria-hidden="true" /> : cancelling ? <IoBanOutline size={20} aria-hidden="true" /> : <IoCheckmarkCircleOutline size={20} aria-hidden="true" />}{t(busy ? "common.loading" : payment ? "fesla.recordPayment" : cancelling ? "fesla.cancellation.action" : "fesla.completeAndDeliver")}</button></footer>
    </form>
  </dialog>;
}
