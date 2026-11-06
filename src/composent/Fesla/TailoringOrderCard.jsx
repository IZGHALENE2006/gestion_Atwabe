import { TAILORING_MEASUREMENT_FIELDS } from "../../../shared/tailoringMeasurements.js";
import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import { useTranslation } from "react-i18next";
import { IoBarcodeOutline, IoCalendarOutline, IoCreateOutline, IoCallOutline, IoPrintOutline } from "react-icons/io5";
import DjellabaCostBreakdown from "./DjellabaCostBreakdown.jsx";
import TrouserFabricCost from "./TrouserFabricCost.jsx";
import TailoringPhoto from "./TailoringPhoto.jsx";
import TailoringOrderBarcode from "./TailoringOrderBarcode.jsx";
import { tailoringDeliveryAmounts } from "../../../shared/tailoringProfits.js";
import { tailoringRemainingAmount, tailoringOrderItems, tailoringGarmentType, tailoringProfitAmount, tailoringHasExpenses, tailoringUsesSfifa } from "../../../shared/tailoring.js";

export default function TailoringOrderCard({ order, token, canEdit, onEdit, onPrint }) {
  const operations = useEmployeeOperations('tailoring');
  const { t, i18n } = useTranslation();
  const garmentType = tailoringGarmentType(order);
  const trousers = garmentType === "trousers";
  const withExpenses = tailoringHasExpenses(order);
  const date = (value) => new Date(`${value}T12:00:00`).toLocaleDateString(i18n.language === "ar" ? "ar-MA" : "fr-MA");
  const money = new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const measurementNumber = new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 2 });
  const totalPrice = order.totalPrice ?? 0, paidAmount = order.paidAmount ?? 0;
  const deliveryAmounts = order.deliveryFinancials ? tailoringDeliveryAmounts(order) : null;
  const amounts = { totalPrice, paidAmount, remainingAmount: tailoringRemainingAmount(totalPrice, paidAmount), ...((withExpenses || order.costing) && operations.profits ? { expenseAmount: order.expenseAmount ?? null, profitAmount: tailoringProfitAmount(totalPrice, order.expenseAmount) } : {}) };
  return <article data-tailoring-order={order._id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
    <div className="mb-4 flex items-start justify-between gap-3"><div className="min-w-0"><h2 dir="auto" className="break-words text-lg font-bold">{order.clientName}</h2><p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><IoCallOutline /><bdi dir="ltr">{order.phone}</bdi></p></div>{canEdit && <button type="button" onClick={() => onEdit(order)} aria-label={t("fesla.editNamed", { name: order.clientName })} className="rounded-lg border border-slate-200 p-2 text-primary-600 hover:bg-primary-50 dark:border-slate-700 dark:text-primary-400 dark:hover:bg-slate-800"><IoCreateOutline size={21} /></button>}</div>
    <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">{["orderDate", "readyDate"].map((key) => <div key={key}><dt className="mb-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><IoCalendarOutline />{t(`fesla.${key}`)}</dt><dd><time dateTime={order[key]}>{date(order[key])}</time></dd></div>)}</dl>
    <dl className="mb-4 grid gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm dark:border-blue-900/60 dark:bg-blue-950/20">{Object.entries(amounts).map(([key, amount]) => <div key={key} data-payment-field={key} className={`flex flex-wrap items-center justify-between gap-2 ${key === "remainingAmount" ? "font-bold text-blue-800 dark:text-blue-200" : ""}`}><dt>{t(`fesla.${key}`)}</dt><dd><bdi>{amount === null ? "—" : money.format(amount)} {t("fesla.currency")}</bdi></dd></div>)}</dl>
    {operations.profits && deliveryAmounts && <section className="fesla-delivery-financials" data-delivery-financials><h3>{t("fesla.profits.deliverySnapshot")}</h3><p>{t("fesla.profits.snapshotHint")}</p><dl>{["revenueAmount", "expenseAmount", "profitAmount"].map(key => <div key={key}><dt>{t("fesla.profits.snapshotLabels." + key)}</dt><dd data-delivery-amount={key}><bdi>{deliveryAmounts[key] === null ? "—" : money.format(deliveryAmounts[key])} {t("fesla.currency")}</bdi></dd></div>)}</dl></section>}
    <div className="fesla-garment-details">{tailoringOrderItems(order).map((item, index) => <section key={item.lineId} data-tailoring-item={item.lineId} className="fesla-garment-detail"><header><h3>{t(garmentType !== "djellaba" ? `fesla.${garmentType}.garmentNumber` : "fesla.garmentNumber", { number: index + 1 })}</h3><bdi>{money.format(item.price)} {t("fesla.currency")}</bdi></header>
    {trousers && <p className="fesla-garment-type">{t("fesla.trouserType")}: {t("fesla.trouserTypes." + item.trouserType)}</p>}
    {garmentType === "shirts" && <p className="fesla-garment-type">{t("fesla.shirtType")}: <bdi dir="auto">{item.shirtType}</bdi></p>}
    {TAILORING_MEASUREMENT_FIELDS.some(key => item.measurements?.[key] != null) && <section data-saved-measurements className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20"><h4 className="mb-3 text-sm font-bold text-blue-800 dark:text-blue-200">{t("fesla.measurements.title")} ({t("fesla.measurements.unit")})</h4><dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{TAILORING_MEASUREMENT_FIELDS.filter(key => item.measurements?.[key] != null).map(key => <div key={key}><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("fesla.measurements.fields." + key)}</dt><dd data-measurement={key} className="font-semibold"><bdi>{measurementNumber.format(item.measurements[key])}</bdi></dd></div>)}</dl></section>}
    {item.hasPhoto && <TailoringPhoto order={order} item={item} token={token} />}
    <div className="mt-4 space-y-2"><p className="inline-flex rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{t(`fesla.sources.${item.fabricSource}`)}</p><p dir="auto" className="break-words font-semibold">{item.fabricType}{item.fabricReference ? ` · ${item.fabricReference}` : ""}</p>{item.fabricColor && <p dir="auto" className="break-words text-sm text-slate-500 dark:text-slate-400">{t("fesla.fabricColor")}: {item.fabricColor}</p>}</div>
    {!withExpenses && <div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><p className="font-bold">{t(`fesla.widths.${item.sfifa.width}`)}</p><p className="mt-1 text-slate-500 dark:text-slate-400">{t(`fesla.styles.${item.sfifa.style}`)}</p>{item.sfifa.style !== "fabric" && <p dir="auto" className="mt-2 break-words">{item.sfifa.color1} · {item.sfifa.color2}</p>}</div>}
    {operations.profits && trousers && item.fabricCost && <TrouserFabricCost cost={item.fabricCost} meters={item.fabricMeters} />}
    {operations.profits && item.costs && <DjellabaCostBreakdown garmentType={garmentType} costs={item.costs} meters={item.fabricMeters} />}
    </section>)}</div>
    {tailoringUsesSfifa(order) && !order.costing && <p className="fesla-costs-notice">{t(["fesla." + garmentType + ".costs.legacyUnknown", "fesla.costs.legacyUnknown"])}</p>}
    <section className="fesla-barcode-panel" aria-label={t("fesla.barcode")}>
      <p><IoBarcodeOutline size={19} aria-hidden="true" />{t("fesla.barcode")}</p>
      <TailoringOrderBarcode order={order} />
      {onPrint && <button type="button" data-print-order={order._id} onClick={() => onPrint(order)} className="fesla-label-button"><IoPrintOutline size={19} aria-hidden="true" />{t("fesla.printBarcode")}</button>}
    </section>
  </article>;
}
