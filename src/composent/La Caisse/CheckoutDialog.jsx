import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import { cashierCartRows } from '../../../shared/cashierBatches.js';
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import axios from "axios";
import { IoCashOutline, IoWalletOutline, IoPersonAddOutline, IoCloseOutline } from "react-icons/io5";
import { addCreditVente } from "../../slices/SliceLoginAdmin.jsx";
import { apiErrorMessage } from "../../i18n/apiErrors.js";
import { roundMoney } from "../../../shared/saleTotals.js";
import "./checkout.css";

export default function CheckoutDialog({ cart, total, discount, received, user, onCashPay, onCreditSaved, onClose }) {
  const creditOperations = useEmployeeOperations('credit');
  const operations = useEmployeeOperations('cashier');
  const { t, i18n } = useTranslation(), dispatch = useDispatch();
  const storageKey = `atwabe-credit-checkout:${user?._id}`;
  const [recovery] = useState(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { return null; } });
  const [snapshot] = useState(() => recovery?.snapshot || { cart, total, discount });
  const [pending, setPending] = useState(recovery?.payload || null);
  const [mode, setMode] = useState(recovery ? recovery.checkoutMode || "credit" : "choose");
  const [customerMode, setCustomerMode] = useState(recovery?.payload?.newCustomer ? "new" : "existing");
  const [customerId, setCustomerId] = useState(recovery?.payload?.customerId || "");
  const [customer, setCustomer] = useState(recovery?.payload?.newCustomer || { name: "", phone: "", cin: "", email: "" });
  const [initialPaid, setInitialPaid] = useState(recovery?.payload?.amountPaid ?? "");
  const [cashPaid, setCashPaid] = useState(received);
  const [customers, setCustomers] = useState([]), [loading, setLoading] = useState(false), [loadError, setLoadError] = useState(false), [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dialogRef = useRef(null), busyRef = useRef(false);
  const creditAllowed = operations.creditSale && creditOperations.addDebt, locked = busy || Boolean(pending) && (mode !== "credit" || creditAllowed);
  const paid = initialPaid === "" ? 0 : Number(initialPaid);
  const invalidPaid = !Number.isFinite(paid) || paid < 0 || roundMoney(paid) > snapshot.total;
  const money = value => `${new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${i18n.language === "ar" ? "درهم" : "DH"}`;
  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); return () => dialog.close(); }, []);
  useEffect(() => {
    if (mode !== "credit" || !creditAllowed) return;
    let active = true;
    setLoading(true); setLoadError(false);
    axios.get(`${import.meta.env.VITE_API_URL || "http://localhost:7000"}/usercridite/get`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }).then(response => { if (active) setCustomers(response.data); }).catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, creditAllowed, reload]);
  const close = () => { if (!locked) { dialogRef.current.close(); onClose(); } };
  const forgetPending = () => { sessionStorage.removeItem(storageKey); setPending(null); };
  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    if (mode === "cash" && !operations.sell || mode === "credit" && !creditAllowed) { setError(t("creditAudit.accessDenied")); return; }
    if (mode === "credit" && !pending && (invalidPaid || (customerMode === "existing" && !customerId))) { setError(t(invalidPaid ? "creditCheckout.paymentInvalid" : "creditCheckout.customerRequired")); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      if (mode === "cash") {
        const payload = pending || { requestId: crypto.randomUUID(), invoiceOrigin: 'cashier', cart: snapshot.cart, amountPaid: Number(cashPaid), discountType: snapshot.discount.type, discountValue: snapshot.discount.value };
        sessionStorage.setItem(storageKey, JSON.stringify({ payload, snapshot, checkoutMode: 'cash' })); setPending(payload);
        if (await onCashPay(payload.amountPaid, payload)) { forgetPending(); dialogRef.current.close(); onClose(); }
        else setError(t("cashier.transactionError"));
      } else {
        const payload = pending || { requestId: crypto.randomUUID(), cart: snapshot.cart.map(({ id, batchId, qty, priceType, expectedUnitPrice }) => ({ id, batchId, qty, priceType, expectedUnitPrice })), discountType: snapshot.discount.type, discountValue: snapshot.discount.value, amountPaid: paid, ...(customerMode === "new" ? { newCustomer: customer } : { customerId }) };
        sessionStorage.setItem(storageKey, JSON.stringify({ payload, snapshot }));
        setPending(payload);
        const result = await dispatch(addCreditVente(payload)).unwrap();
        forgetPending(); dialogRef.current.close(); onCreditSaved(result);
      }
    } catch (failure) {
      const status = failure?.status;
      if ([400, 401, 403, 404].includes(status) || (status === 409 && ['productBatchRequired', 'productBatchUnavailable', 'productBatchStockChanged'].includes(failure?.message))) forgetPending();
      setError(apiErrorMessage(failure?.message || failure, t, "creditCheckout.saveFailed"));
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <dialog ref={dialogRef} className="checkout-dialog" dir={i18n.dir()} aria-labelledby="checkout-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="checkout-title">{t(mode === "choose" ? "creditCheckout.title" : mode === "cash" ? "creditCheckout.cash" : "creditCheckout.credit")}</h2><p>{t("creditCheckout.subtitle")}</p></div><button type="button" disabled={locked} onClick={close} aria-label={t("common.close")}><IoCloseOutline size={24} /></button></header>
    <form onSubmit={submit}>
      <div className="checkout-body">
        {mode === "choose" ? <div className="checkout-options">
          <button type="button" data-checkout-mode="cash" disabled={!operations.sell} onClick={() => setMode("cash")}><IoCashOutline size={36} /><strong>{t("creditCheckout.cash")}</strong><span>{t("creditCheckout.cashHint")}</span></button>
          <button type="button" data-checkout-mode="credit" disabled={!creditAllowed} onClick={() => setMode("credit")}><IoWalletOutline size={36} /><strong>{t("creditCheckout.credit")}</strong><span>{t(creditAllowed ? "creditCheckout.creditHint" : "creditAudit.accessDenied")}</span></button>
        </div> : <>
          <div className="checkout-summary"><div><span>{t("creditCheckout.total")}</span><strong data-checkout-total>{money(snapshot.total)}</strong></div>{mode === "credit" && <div><span>{t("creditCheckout.remaining")}</span><strong data-checkout-remaining>{money(Math.max(0, roundMoney(snapshot.total - (Number.isFinite(paid) ? paid : 0))))}</strong></div>}</div>
          <ul className="checkout-items">{cashierCartRows(snapshot.cart).map(item => <li key={item.key}><span dir="auto">{item.name}{item.batchNumber && <small className="block text-xs text-slate-500">{t("productBatches.batch", { number: item.batchNumber })}</small>}</span><bdi>{item.qty} × {money(item.price)}</bdi></li>)}</ul>
          {mode === 'cash' && pending && <p role="status" className="checkout-notice">{t(busy ? 'creditCheckout.saving' : 'productBatches.productCheckoutPending')}</p>}
          {mode === "cash" ? <label className="checkout-field" htmlFor="checkout-cash">{t("cashier.totalReceived")}<input id="checkout-cash" type="number" required min={snapshot.total} step="0.01" inputMode="decimal" disabled={locked} value={pending?.amountPaid ?? cashPaid} onChange={event => setCashPaid(event.target.value)} autoFocus /></label> : <>
            {pending && <p role="status" className="checkout-notice">{t(busy ? "creditCheckout.saving" : "creditCheckout.pending")}</p>}
            <fieldset disabled={locked} className="checkout-fields">
              <div className="checkout-customer-tabs"><button type="button" aria-pressed={customerMode === "existing"} onClick={() => setCustomerMode("existing")}>{t("creditCheckout.existing")}</button><button type="button" aria-pressed={customerMode === "new"} disabled={!creditOperations.add} onClick={() => setCustomerMode("new")}><IoPersonAddOutline size={19} />{t("creditCheckout.new")}</button></div>
              {customerMode === "existing" ? <>
                {loading && <p role="status">{t("common.loading")}</p>}
                {loadError && <div className="checkout-error" role="alert"><p>{t("creditCheckout.loadFailed")}</p><button type="button" onClick={() => setReload(value => value + 1)}>{t("creditCheckout.retryLoad")}</button></div>}
                <label className="checkout-field" htmlFor="checkout-customer">{t("creditCheckout.customer")}<select id="checkout-customer" required={!pending} disabled={loading || loadError} value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">{t("creditCheckout.chooseCustomer")}</option>{pending?.customerId && !customers.some(entry => entry._id === pending.customerId) && <option value={pending.customerId}>{t("creditCheckout.selectedCustomer")}</option>}{customers.map(entry => <option key={entry._id} value={entry._id}>{entry.name}{entry.phone ? ` — ${entry.phone}` : ""}</option>)}</select></label>
                {!loading && !loadError && !customers.length && <p className="checkout-muted">{t("creditCheckout.empty")}</p>}
                {customers.find(entry => entry._id === customerId) && <p className="checkout-muted">{t("creditCheckout.previousBalance")}: <bdi>{money(customers.find(entry => entry._id === customerId).summary?.remaining || 0)}</bdi></p>}
              </> : <div className="checkout-customer-form">{[["name", "text", 160], ["phone", "tel", 40], ["cin", "text", 80], ["email", "email", 254]].map(([key, type, max]) => <label className="checkout-field" key={key} htmlFor={`checkout-new-${key}`}>{t(`creditCheckout.${key}`)}{key === "name" && " *"}<input id={`checkout-new-${key}`} type={type} required={key === "name"} maxLength={max} autoComplete={key === "cin" ? "off" : key === "phone" ? "tel" : key} dir={key === "phone" || key === "email" ? "ltr" : "auto"} value={customer[key]} onChange={event => setCustomer(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}<p className="checkout-muted">{t("creditCheckout.newHint")}</p></div>}
              <label className="checkout-field" htmlFor="checkout-initial-paid">{t("creditCheckout.initialPaid")}<input id="checkout-initial-paid" disabled={!creditOperations.payment} type="number" min="0" max={snapshot.total} step="0.01" inputMode="decimal" placeholder="0.00" value={initialPaid} onChange={event => setInitialPaid(event.target.value)} aria-invalid={invalidPaid} /></label>
              {invalidPaid && <p role="alert" className="checkout-error">{t("creditCheckout.paymentInvalid")}</p>}
            </fieldset>
          </>}
        </>}
        {mode === "credit" && !creditAllowed && <p role="alert" className="checkout-error">{t("creditAudit.accessDenied")}</p>}
        {error && <p role="alert" className="checkout-error">{error}</p>}
      </div>
      <footer><button type="button" disabled={locked} onClick={mode === "choose" || mode === "credit" && !creditAllowed ? close : () => { setMode("choose"); setError(""); }}>{t(mode === "choose" ? "common.cancel" : "creditCheckout.back")}</button>{mode !== "choose" && <button type="submit" data-confirm-checkout disabled={busy || (mode === "credit" && (!creditAllowed || !pending && (invalidPaid || (customerMode === "existing" && (!customerId || loading || loadError)))))}>{t(busy ? "creditCheckout.saving" : pending ? "creditCheckout.resume" : mode === "cash" ? "cashier.confirmSale" : "creditCheckout.confirmCredit")}</button>}</footer>
    </form>
  </dialog>;
}
