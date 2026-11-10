import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import { useTranslation } from "react-i18next";
import { IoBanOutline, IoCashOutline, IoCreateOutline, IoBarcodeOutline, IoCheckmarkCircleOutline, IoEyeOutline, IoReceiptOutline } from "react-icons/io5";
import TailoringOrderTracking from "./TailoringOrderTracking.jsx";
import TailoringOrderStatus from "./TailoringOrderStatus.jsx";
import { tailoringRemainingAmount, tailoringOrderItems, tailoringGarmentType, tailoringProfitAmount } from "../../../shared/tailoring.js";
import { tailoringOrderBarcode } from "../../../shared/tailoringBarcode.js";

export default function TailoringOrdersTable({ orders, tracking, onDetails, onAction, onReceipt, onEdit, onLabel }) {
  const operations = useEmployeeOperations('tailoring');
  const { t, i18n } = useTranslation();
  const garmentType = tailoringGarmentType(orders[0]);
  const trousers = garmentType === "trousers";
  const sectionLabels = garmentType !== "djellaba";
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const money = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = value => new Date(`${value}T12:00:00`).toLocaleDateString(locale);
  return <section className="fesla-table-panel">
    <p className="fesla-table-hint" id="fesla-table-hint">{t("fesla.scrollTable")}</p>
    <div className="fesla-table-scroll" role="region" aria-label={t("fesla.ordersTable")} aria-describedby="fesla-table-hint" tabIndex={0}>
      <table className="fesla-orders-table">
        <caption className="sr-only">{t("fesla.ordersTable")}</caption>
        <thead><tr>{["clientName", "creator", "orderDate", "readyDate", "orderGarments", "workLocation", "orderStatus", "totalPrice", "paidAmount", "remainingAmount", "expenseAmount", "profitAmount", "actions"].filter(key => operations.profits || !["expenseAmount", "profitAmount"].includes(key)).map(key => <th key={key} scope="col" className={key === "actions" ? "fesla-table-actions" : undefined}>{t(key === "creator" ? "employeePermissions.orderCreator" : key === "orderGarments" && sectionLabels ? `fesla.${garmentType}.orderGarments` : `fesla.${key}`)}</th>)}</tr></thead>
        <tbody>{orders.map(order => {
          const barcode = tailoringOrderBarcode(order);
          const remaining = tailoringRemainingAmount(order.totalPrice ?? 0, order.paidAmount ?? 0);
          return <tr key={order._id} data-tailoring-order={order._id}>
            <th scope="row" className="fesla-table-client"><span dir="auto">{order.clientName}</span><bdi dir="ltr" className="fesla-table-phone">{order.phone}</bdi><bdi dir="ltr" data-table-barcode={barcode} className="fesla-table-barcode" aria-label={`${t("fesla.barcode")}: ${barcode}`}>{barcode}</bdi></th>
            <td data-tailoring-creator><span dir="auto">{order.creator?.name || t("employeePermissions.unrecorded")}</span>{order.creator && <small className="block text-slate-500 dark:text-slate-400">{t(order.creator.role === "admin" ? "employeePermissions.admin" : "employeePermissions.employee")}</small>}</td>
            <td><time dateTime={order.orderDate}>{date(order.orderDate)}</time></td>
            <td><time dateTime={order.readyDate}>{date(order.readyDate)}</time></td>
            <td className="fesla-table-fabric"><strong data-tailoring-item-count={tailoringOrderItems(order).length}>{t(sectionLabels ? `fesla.${garmentType}.garmentsCount` : "fesla.garmentsCount", { count: tailoringOrderItems(order).length })}</strong>{tailoringOrderItems(order).slice(0, 2).map(item => <small key={item.lineId} dir="auto">{item.fabricType}{item.fabricColor ? ` · ${item.fabricColor}` : ""}{trousers ? ` · ${t("fesla.trouserTypes." + item.trouserType)}` : garmentType === "shirts" ? ` · ${item.shirtType}` : ""}</small>)}{tailoringOrderItems(order).length > 2 && <small>{t("fesla.moreGarments", { count: tailoringOrderItems(order).length - 2 })}</small>}</td>
            <td className="fesla-table-tracking"><EmployeeOperation module="tailoring" operation="tracking"><TailoringOrderTracking order={order} tracking={tracking} compact /></EmployeeOperation></td>
            <td><TailoringOrderStatus order={order} /></td>
            {[order.totalPrice ?? 0, order.paidAmount ?? 0, remaining, order.expenseAmount ?? null, tailoringProfitAmount(order.totalPrice, order.expenseAmount)].filter((_, index) => index < 3 || operations.profits).map((amount, index) => <td key={index} data-order-expenses={index === 3 ? amount : undefined} data-order-profit={index === 4 ? amount : undefined} className={`fesla-table-money${index === 4 && amount < 0 ? " is-loss" : ""}${index === 2 ? ` fesla-table-balance${amount === 0 ? " is-paid" : ""}` : ""}`}><bdi>{amount === null ? "—" : money.format(amount)}</bdi><small>{t("fesla.currency")}</small></td>)}
            <td className="fesla-table-actions"><div className="fesla-row-actions">{onEdit && !order.cancelledAt && <EmployeeOperation module="tailoring" operation="update"><button type="button" data-edit-tailoring={order._id} className="fesla-payment-button" onClick={() => onEdit(order)}><IoCreateOutline size={18} aria-hidden="true" />{t("fesla.edit")}</button></EmployeeOperation>}{onLabel && <EmployeeOperation module="tailoring" operation="labels"><button type="button" data-print-order={order._id} className="fesla-payment-button" onClick={() => onLabel(order)}><IoBarcodeOutline size={18} aria-hidden="true" />{t("fesla.printBarcode")}</button></EmployeeOperation>}<EmployeeOperation module="tailoring" operation="details"><button type="button" className="fesla-details-button" data-view-tailoring={order._id} onClick={() => onDetails(order)} aria-label={t("fesla.detailsNamed", { name: order.clientName })}><IoEyeOutline size={19} aria-hidden="true" />{t("fesla.details")}</button></EmployeeOperation>{onReceipt && <button type="button" className="fesla-payment-button" data-order-receipt={order._id} onClick={() => onReceipt(order)}><IoReceiptOutline size={18} aria-hidden="true" />{t("fesla.receipts.orderAction")}</button>}{!order.cancelledAt && <><EmployeeOperation module="tailoring" operation="payment"><button type="button" className="fesla-payment-button" data-add-payment={order._id} disabled={remaining === 0} onClick={() => onAction(order, "payment")} aria-label={t("fesla.addPaymentNamed", { name: order.clientName })}><IoCashOutline size={18} aria-hidden="true" />{t(remaining === 0 ? "fesla.fullyPaid" : "fesla.addPayment")}</button></EmployeeOperation>{!order.deliveredAt && <EmployeeOperation module="tailoring" operation="deliver"><button type="button" className="fesla-deliver-button" data-deliver-order={order._id} onClick={() => onAction(order, "delivery")} aria-label={t("fesla.deliverNamed", { name: order.clientName })}><IoCheckmarkCircleOutline size={18} aria-hidden="true" />{t("fesla.completeAndDeliver")}</button></EmployeeOperation>}</>}{(order.deliveredAt || order.fabricStock) && !order.cancelledAt && <EmployeeOperation module="tailoring" operation="cancel"><button type="button" className="fesla-cancel-button" data-cancel-order={order._id} onClick={() => onAction(order, "cancel")}><IoBanOutline size={18} aria-hidden="true" />{t("fesla.cancellation.action")}</button></EmployeeOperation>}</div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}
