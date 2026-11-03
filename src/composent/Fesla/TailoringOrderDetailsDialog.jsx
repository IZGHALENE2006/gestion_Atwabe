import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { IoCashOutline, IoCheckmarkCircleOutline, IoCloseOutline, IoCreateOutline, IoPrintOutline, IoReceiptOutline } from "react-icons/io5";
import TailoringOrderCard from "./TailoringOrderCard.jsx";
import TailoringOrderTracking from "./TailoringOrderTracking.jsx";
import TailoringOrderStatus from "./TailoringOrderStatus.jsx";
import { tailoringRemainingAmount } from "../../../shared/tailoring.js";

export default function TailoringOrderDetailsDialog({ order, token, tracking, onRefreshTracking, canEdit, onClose, onEdit, onPrint, onAction, onReceipt }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const close = () => { dialogRef.current.close(); onClose(); };
  const proceed = action => { dialogRef.current.close(); action(order); };
  const remaining = tailoringRemainingAmount(order.totalPrice ?? 0, order.paidAmount ?? 0);
  const money = new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <dialog ref={dialogRef} dir={i18n.dir()} className="fesla-details-dialog" aria-labelledby="tailoring-details-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="fesla-details-header"><h2 id="tailoring-details-title">{t("fesla.orderDetails")}</h2><button type="button" onClick={close} aria-label={t("dialog.close")}><IoCloseOutline size={24} /></button></header>
    <div className="fesla-details-body">
      <p data-tailoring-creator className="mb-4 text-sm text-slate-600 dark:text-slate-300">{t("employeePermissions.orderCreator")}: <strong dir="auto">{order.creator?.name || t("employeePermissions.unrecorded")}</strong>{order.creator && <> · {t(order.creator.role === "admin" ? "employeePermissions.admin" : "employeePermissions.employee")}</>}</p>
      <div className="fesla-details-status"><TailoringOrderStatus order={order} withDate />{canEdit && <div className="fesla-order-actions"><button type="button" className="fesla-payment-button" data-add-payment={order._id} disabled={remaining === 0} onClick={() => proceed(value => onAction(value, "payment"))}><IoCashOutline size={19} aria-hidden="true" />{t(remaining === 0 ? "fesla.fullyPaid" : "fesla.addPayment")}</button>{!order.deliveredAt && <button type="button" className="fesla-deliver-button" data-deliver-order={order._id} onClick={() => proceed(value => onAction(value, "delivery"))}><IoCheckmarkCircleOutline size={19} aria-hidden="true" />{t("fesla.completeAndDeliver")}</button>}</div>}</div>
      <TailoringOrderTracking order={order} tracking={tracking} onRefresh={onRefreshTracking} />
      <TailoringOrderCard order={order} token={token} canEdit={false} />
      {order.addedPayments?.length > 0 && <section className="fesla-payment-history" aria-labelledby="fesla-payment-history-title"><h3 id="fesla-payment-history-title">{t("fesla.addedPayments")}</h3><ul>{[...order.addedPayments].reverse().map((entry, index) => <li key={entry.reference || index}><bdi>{money.format(entry.amount)} {t("fesla.currency")}</bdi><time dateTime={entry.paidAt}>{new Date(entry.paidAt).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA")}</time>{onReceipt && <button type="button" className="fesla-payment-button" data-payment-receipt={entry.reference || index} onClick={() => { dialogRef.current.close(); onReceipt(order, entry); }}><IoPrintOutline size={17} />{t("fesla.receipts.paymentAction")}</button>}</li>)}</ul></section>}
    </div>
    <footer className="fesla-details-footer">
      <button type="button" onClick={close}>{t("dialog.close")}</button>
      {canEdit && <button type="button" data-edit-tailoring={order._id} onClick={() => proceed(onEdit)}><IoCreateOutline size={19} aria-hidden="true" />{t("fesla.edit")}</button>}
      {onReceipt && <button type="button" data-order-receipt={order._id} className="fesla-details-print" onClick={() => proceed(onReceipt)}><IoReceiptOutline size={19} aria-hidden="true" />{t("fesla.receipts.orderAction")}</button>}
      <button type="button" data-print-order={order._id} className="fesla-details-print" onClick={() => proceed(onPrint)}><IoPrintOutline size={19} aria-hidden="true" />{t("fesla.printBarcode")}</button>
    </footer>
  </dialog>;
}
