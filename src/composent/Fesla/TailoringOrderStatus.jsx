import { useTranslation } from "react-i18next";
import { IoBanOutline, IoCheckmarkCircleOutline, IoTimeOutline } from "react-icons/io5";

export default function TailoringOrderStatus({ order, withDate = false }) {
  const { t, i18n } = useTranslation();
  const cancelled = Boolean(order.cancelledAt);
  const date = value => new Date(value).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA");
  return <div className="fesla-status-block">
    <span data-order-status={cancelled ? "cancelled" : order.deliveredAt ? "delivered" : "inProgress"} className={`fesla-order-status${cancelled ? " is-cancelled" : order.deliveredAt ? " is-delivered" : ""}`}>{cancelled ? <IoBanOutline size={18} aria-hidden="true" /> : order.deliveredAt ? <IoCheckmarkCircleOutline size={18} aria-hidden="true" /> : <IoTimeOutline size={18} aria-hidden="true" />}{t(cancelled ? "fesla.cancellation.status" : order.deliveredAt ? "fesla.delivered" : "fesla.inProgress")}</span>
    {withDate && order.deliveredAt && <p className="fesla-delivered-date">{t("fesla.deliveredAt")}: <time dateTime={order.deliveredAt}>{new Date(order.deliveredAt).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA")}</time></p>}
    {withDate && cancelled && <div className="fesla-cancellation-log" data-order-cancellation>
      <p>{t("fesla.cancellation.date")}: <time dateTime={order.cancelledAt}>{date(order.cancelledAt)}</time></p>
      <p>{t("fesla.cancellation.by")}: <strong dir="auto" data-cancellation-actor>{order.cancelledBy?.name || t("employeePermissions.unrecorded")}</strong>{order.cancelledBy && <> · {t(order.cancelledBy.role === "admin" ? "employeePermissions.admin" : "employeePermissions.employee")}</>}</p>
      <p>{t("fesla.cancellation.excluded")}</p>
    </div>}
  </div>;
}
