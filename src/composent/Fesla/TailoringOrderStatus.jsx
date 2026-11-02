import { useTranslation } from "react-i18next";
import { IoCheckmarkCircleOutline, IoTimeOutline } from "react-icons/io5";

export default function TailoringOrderStatus({ order, withDate = false }) {
  const { t, i18n } = useTranslation();
  return <div className="fesla-status-block">
    <span data-order-status={order.deliveredAt ? "delivered" : "inProgress"} className={`fesla-order-status${order.deliveredAt ? " is-delivered" : ""}`}>{order.deliveredAt ? <IoCheckmarkCircleOutline size={18} aria-hidden="true" /> : <IoTimeOutline size={18} aria-hidden="true" />}{t(order.deliveredAt ? "fesla.delivered" : "fesla.inProgress")}</span>
    {withDate && order.deliveredAt && <p className="fesla-delivered-date">{t("fesla.deliveredAt")}: <time dateTime={order.deliveredAt}>{new Date(order.deliveredAt).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA")}</time></p>}
  </div>;
}
