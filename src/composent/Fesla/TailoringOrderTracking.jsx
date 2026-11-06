import { workerSfifaFamilyLabel, workerSfifaNumberLabel } from '../Khadama/workerSfifaLabels.js';
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { IoCheckmarkCircleOutline, IoRefreshOutline, IoTimeOutline } from "react-icons/io5";
import { WORKER_CATEGORIES } from "../../../shared/workers.js";
import { tailoringOrderItems, tailoringGarmentType } from "../../../shared/tailoring.js";

export default function TailoringOrderTracking({ order, tracking, compact = false, onRefresh }) {
  const { t, i18n } = useTranslation();
  const assignments = tracking?.byOrder?.[order._id] || [];
  const loading = tracking?.loading ?? true, error = tracking?.error;
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const date = value => new Date(value).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  const stageLabel = (category, done) => t(done ? "fesla.tracking.sectionDone" : "fesla.tracking.atSection", { section: t(`workers.categories.${category}`) });
  const feedback = loading ? <p role="status">{t("common.loading")}</p> : error ? <p role="alert" className="fesla-tracking-error">{t(`fesla.errors.${error}`)}</p> : !assignments.length ? <p className="fesla-tracking-empty" data-order-unassigned>{t("fesla.tracking.unassigned")}</p> : null;
  if (compact) return <div className="fesla-tracking-summary" data-order-tracking={order._id}>{feedback || WORKER_CATEGORIES.filter(category => assignments.some(work => work.category === category)).map(category => {
    const done = assignments.filter(work => work.category === category).every(work => work.remainingQuantity === 0);
    return <span key={category} className={`fesla-tracking-stage is-${done ? "done" : "active"}`} data-order-stage={category} data-stage-done={done}>{done ? <IoCheckmarkCircleOutline size={16} /> : <IoTimeOutline size={16} />}{stageLabel(category, done)}</span>;
  })}</div>;
  const items = tailoringOrderItems(order);
  return <section className="fesla-tracking-panel" aria-labelledby="fesla-tracking-title" data-order-work-details>
    <header><div><h3 id="fesla-tracking-title">{t("fesla.tracking.title")}</h3><p>{t("fesla.tracking.hint")}</p></div><button type="button" data-refresh-order-tracking disabled={loading} onClick={onRefresh}><IoRefreshOutline size={18} />{t("fesla.tracking.refresh")}</button></header>
    {feedback || <div className="fesla-assignment-list">{assignments.map(work => {
      const done = work.remainingQuantity === 0, sfifa = work.category === "sfifa";
      return <article key={work.workId} className="fesla-assignment" data-order-assignment={work.workId} data-assignment-category={work.category}>
        <div className="fesla-assignment-header"><span className={`fesla-tracking-stage is-${done ? "done" : "active"}`}>{done ? <IoCheckmarkCircleOutline size={17} /> : <IoTimeOutline size={17} />}{stageLabel(work.category, done)}</span>{work.workerAvailable ? <Link to={`/Home/Khadama/${work.category}/workers/${work.workerId}?type=client${work.category === "machine" ? "&garment=" + tailoringGarmentType(order) : ""}`} data-view-assigned-worker>{work.workerName}</Link> : <span>{t("fesla.tracking.workerUnavailable")}</span>}</div>
        <ul className="fesla-assignment-garments">{work.items.map(item => { const index = items.findIndex(current => current.lineId === item.lineId); return <li key={item.lineId}>{index >= 0 ? t(tailoringGarmentType(order) === "djellaba" ? "fesla.garmentNumber" : "fesla." + tailoringGarmentType(order) + ".garmentNumber", { number: index + 1 }) : t("fesla.tracking.previousGarment")} · <span dir="auto">{item.fabricType}{item.fabricColor ? ` · ${item.fabricColor}` : ""}</span></li>; })}</ul>
        {sfifa && <p className="fesla-assignment-sfifa">{t(`sfifaStock.widths.${work.sfifa.width}`)} · {work.sfifa.code !== undefined && t("sfifaStock.code")} <bdi dir="auto">{workerSfifaNumberLabel(work.sfifa, t)}</bdi>{work.sfifa.code !== undefined && <> · <bdi dir="ltr">{workerSfifaFamilyLabel(work.sfifa.family, t)}</bdi></>}</p>}
        <dl className="fesla-assignment-amounts">{["quantity", "completedQuantity", "remainingQuantity"].map(key => <div key={key}><dt>{t(`workers.work.${sfifa ? "sfifa." : ""}${key}`)}</dt><dd data-assignment-amount={key} data-value={work[key]}><bdi>{number(work[key])}{sfifa ? ` ${t("sfifaStock.unit")}` : ""}</bdi></dd></div>)}</dl>
        <p className="fesla-assignment-date">{work.assignedAt && <span>{t("fesla.tracking.assignedAt")}: <time dateTime={work.assignedAt}>{date(work.assignedAt)}</time></span>}{work.completedAt && <span>{t("fesla.tracking.completedAt")}: <time dateTime={work.completedAt}>{date(work.completedAt)}</time></span>}</p>
      </article>;
    })}</div>}
  </section>;
}
