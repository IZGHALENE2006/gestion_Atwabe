import { workerSfifaFamilyLabel, workerSfifaNumberLabel } from './workerSfifaLabels.js';
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoCheckmarkCircleOutline, IoCloseOutline, IoDocumentTextOutline, IoLayersOutline, IoTimeOutline, IoWalletOutline } from "react-icons/io5";
import { formatSfifaCode } from "../../../shared/sfifaStock.js";
import { tailoringGarmentType } from "../../../shared/tailoring.js";
import { workerHasPieceWages, workerMaterialPending, workerPieceWageCents } from "../../../shared/workerMaterials.js";
import { workerWageCents, workerWorkGarmentType, workerWorkType } from "../../../shared/workerWork.js";
import "./workerWorkDetails.css";

export default function WorkerWorkDetailsDialog({ work, worker, category, onClose }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), bodyRef = useRef(null);
  const [tab, setTab] = useState("overview");
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const money = value => new Intl.NumberFormat(locale, { style: "currency", currency: "MAD" }).format(value);
  const date = value => new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const day = value => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(locale, { dateStyle: "medium" });
  const isSfifa = category === "sfifa", pieceWages = workerHasPieceWages(work);
  const completions = work.completions || [], additions = work.additions || [], materials = work.materials || [];
  const completedIds = new Set(completions.flatMap(event => event.lineIds || []));
  const earned = completions.reduce((sum, event) => sum + Math.round((event.earningAmount || 0) * 100), 0) / 100;
  const unpriced = completions.filter(event => event.earningAmount === undefined).length;
  const totalWageCents = pieceWages ? workerPieceWageCents(materials) : work.unitWage === undefined ? null : workerWageCents(work.unitWage, work.quantity, category);
  const progress = work.quantity ? Math.min(100, Math.max(0, work.completedQuantity / work.quantity * 100)) : 0;
  const pending = workerMaterialPending(work), done = work.remainingQuantity === 0;
  const garmentType = workerWorkGarmentType(work), id = `work-detail-${work._id}`;
  const identity = isSfifa ? `${t(`sfifaStock.widths.${work.sfifa.width}`)} · ${workerSfifaNumberLabel(work.sfifa, t)}` : work.productName;
  const context = [worker?.name, t(`workers.categories.${category}`), t(`workers.work.types.${workerWorkType(work)}`)].filter(Boolean).join(" · ");
  const quantity = value => <><bdi>{number(value)}</bdi>{isSfifa && <small>{t("sfifaStock.unit")}</small>}</>;
  const tabs = [
    { key: "overview", icon: <IoDocumentTextOutline aria-hidden="true" /> },
    { key: "completions", icon: <IoCheckmarkCircleOutline aria-hidden="true" />, count: completions.length },
    { key: "additions", icon: <IoAddCircleOutline aria-hidden="true" />, count: additions.length },
  ];
  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => { bodyRef.current.scrollTop = 0; }, [tab]);

  function navigateTabs(event, index) {
    const step = i18n.dir() === "rtl" ? -1 : 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + step + tabs.length) % tabs.length : event.key === "ArrowLeft" ? (index - step + tabs.length) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next].key);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
  }
  const field = (label, value, key = label) => <div className="work-detail-field" key={key}><dt>{label}</dt><dd>{value}</dd></div>;

  return <dialog ref={dialogRef} id={id} className="work-dialog work-details-dialog" dir={i18n.dir()} aria-labelledby={`${id}-title`} aria-describedby={`${id}-context`} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="work-dialog-header work-details-header">
      <span className="work-dialog-icon" aria-hidden="true"><IoLayersOutline /></span>
      <div><p className="work-detail-eyebrow">{t("workers.work.details")}</p><h2 id={`${id}-title`} dir="auto">{identity}</h2><p id={`${id}-context`} className="work-dialog-worker" dir="auto">{context}</p></div>
      <button type="button" data-close-work-details className="work-close" aria-label={t("dialog.close")} onClick={onClose} autoFocus><IoCloseOutline aria-hidden="true" /></button>
    </header>
    <div className="work-details-tabs" role="tablist" aria-label={t("workers.work.details")}>
      {tabs.map(({ key, icon, count }, index) => <button key={key} type="button" id={`${id}-tab-${key}`} role="tab" data-work-detail-tab={key} aria-selected={tab === key} aria-controls={`${id}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => navigateTabs(event, index)}>{icon}<span>{t(`workers.work.detailDialog.${key}`)}</span>{count !== undefined && <bdi>{number(count)}</bdi>}</button>)}
    </div>
    <div ref={bodyRef} className="work-details-body" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} tabIndex={0}>
      {tab === "overview" ? <>
        <div className="work-detail-section-heading"><h3>{t("workers.work.detailDialog.summary")}</h3><span className={`work-status-badge ${done && !pending ? "work-status-done" : "work-status-pending"}`}>{done && !pending ? <IoCheckmarkCircleOutline aria-hidden="true" /> : <IoTimeOutline aria-hidden="true" />}{t(pending ? "workers.work.materialProcessing" : done ? "workers.work.done" : "workers.work.inProgress")}</span></div>
        <dl className="work-detail-stats">
          {["quantity", "completedQuantity", "remainingQuantity"].map(key => <div key={key} data-detail-stat={key} className={`work-detail-stat work-detail-stat-${key}`}><dt>{t(`workers.work.${isSfifa ? "sfifa" : "design"}.${key}`)}</dt><dd>{quantity(work[key])}</dd></div>)}
          <div className="work-detail-stat work-detail-stat-earned" data-detail-stat="earned"><dt><IoWalletOutline aria-hidden="true" />{t("workers.payroll.earnedShort")}</dt><dd>{work.unitWage === undefined && !pieceWages && !completions.some(event => event.earningAmount !== undefined) ? <span className="work-detail-unpriced">{t("workers.payroll.unpriced")}</span> : <bdi>{money(earned)}</bdi>}</dd></div>
        </dl>
        {unpriced > 0 && <p className="work-detail-note">{t("workers.payroll.unpricedHint", { count: unpriced })}</p>}
        <div className="work-detail-progress"><div><span>{t("workers.work.design.progress")}</span><strong><bdi>{number(Math.round(progress))}%</bdi></strong></div><progress max="100" value={progress} aria-label={t("workers.work.design.progress")} /></div>
        <section className="work-detail-section">
          <h3>{t("workers.work.detailDialog.information")}</h3>
          <dl className="work-detail-fields">
            {field(t("workers.work.assignedDate"), <time dateTime={work.createdAt}>{date(work.createdAt)}</time>)}
            {garmentType && field(t("workers.work.detailDialog.garmentType"), t(`fesla.garmentTypes.${garmentType}`))}
            {work.trouserType && field(t("workers.work.trousers.typeLabel"), t(`workers.work.trousers.styles.${work.trouserType}`))}
            {field(t("workers.payroll.wage"), pieceWages ? t("workers.work.pieceCards.variableWages") : work.unitWage === undefined ? t("workers.payroll.unpriced") : <><bdi>{money(work.unitWage)}</bdi><small>{t(isSfifa ? "workers.payroll.perMeter" : "workers.payroll.perPiece")}</small></>)}
            {totalWageCents !== null && field(t("workers.work.pieceCards.totalWages"), <bdi>{money(totalWageCents / 100)}</bdi>)}
          </dl>
          {isSfifa && <div className="work-detail-sfifa"><span>{t(`sfifaStock.widths.${work.sfifa.width}`)}</span><bdi dir="auto">{workerSfifaNumberLabel(work.sfifa, t)}</bdi>{work.sfifa.code !== undefined && <bdi dir="ltr">{workerSfifaFamilyLabel(work.sfifa.family, t)}</bdi>}</div>}
        </section>
        {work.tailoring && <section className="work-detail-section" data-work-order-details>
          <div className="work-detail-section-heading"><h3>{t("workers.work.orderGarments")}</h3><bdi className="work-detail-barcode" dir="ltr">{work.tailoring.barcode}</bdi></div>
          <dl className="work-detail-fields">
            {field(t("workers.work.trousers.clientName"), <span dir="auto">{work.tailoring.clientName}</span>)}
            {work.tailoring.phone && field(t("workers.phone"), <bdi dir="ltr">{work.tailoring.phone}</bdi>)}
            {work.tailoring.orderDate && field(t("workers.work.detailDialog.orderDate"), <time dateTime={work.tailoring.orderDate}>{day(work.tailoring.orderDate)}</time>)}
            {work.tailoring.readyDate && field(t("fesla.readyDate"), <time dateTime={work.tailoring.readyDate}>{day(work.tailoring.readyDate)}</time>)}
          </dl>
          <ul className="work-detail-pieces">{work.tailoring.items.map((item, index) => <li key={item.lineId} className="work-detail-piece">
            <div className="work-detail-piece-heading"><span className="work-detail-piece-number">{number(index + 1)}</span><h4>{t(tailoringGarmentType(work.tailoring) === "djellaba" ? "fesla.garmentNumber" : `fesla.${tailoringGarmentType(work.tailoring)}.garmentNumber`, { number: index + 1 })}</h4></div>
            <p dir="auto" className="work-detail-fabric-name">{item.fabricType}{item.fabricColor ? ` · ${item.fabricColor}` : ""}</p>
            {item.sfifa?.width && <p>{t(`fesla.widths.${item.sfifa.width}`)} · {t(`fesla.styles.${item.sfifa.style}`)}{item.sfifa.style !== "fabric" && [item.sfifa.color1, item.sfifa.color2].filter(Boolean).map((color, colorIndex) => <span key={colorIndex}> · <bdi>{color}</bdi></span>)}</p>}
            {item.trouserType && <p>{t(`fesla.trouserTypes.${item.trouserType}`)}</p>}
            {item.shirtType && <p>{t("fesla.shirtType")}: <bdi>{item.shirtType}</bdi></p>}
          </li>)}</ul>
        </section>}
        {materials.length > 0 && <section className="work-detail-section">
          <div className="work-detail-section-heading"><h3>{t("workers.work.materials.title")}</h3><span className="work-detail-count">{t("workers.work.pieceCards.count", { count: materials.length })}</span></div>
          <ul className="work-detail-pieces">{materials.map((row, index) => <li key={row.lineId} data-work-material className="work-detail-piece">
            <div className="work-detail-piece-heading"><span className="work-detail-piece-number">{number(index + 1)}</span><h4>{t("workers.work.pieceCards.pieceNumber", { number: index + 1 })}</h4>{pieceWages && <span data-piece-state={completedIds.has(row.lineId) ? "done" : "pending"} className={`work-status-badge ${completedIds.has(row.lineId) ? "work-status-done" : "work-status-pending"}`}>{t(completedIds.has(row.lineId) ? "workers.work.done" : "workers.work.inProgress")}</span>}</div>
            <p className="work-detail-fabric-name" dir="auto">{row.fabricType} · {row.fabricColor}</p>
            <dl className="work-detail-piece-fields">
              {field(t("workers.work.materials.meters"), <><bdi>{number(row.meters)}</bdi> {t("sfifaStock.unit")}</>)}
              {row.pieceBarcode && field(t("workers.work.detailDialog.fabricBarcode"), <bdi dir="ltr" className="work-detail-barcode">{row.pieceBarcode}</bdi>)}
              {field(t("workers.work.materials.sfifa"), <><span>{t(`sfifaStock.widths.${row.sfifaWidth}`)}</span><bdi dir="ltr">{row.sfifaCode === undefined ? t("workers.work.materials.unassigned") : formatSfifaCode(row.sfifaCode, row.sfifaFamily)}</bdi><span><bdi>{number(row.sfifaMeters)}</bdi> {t("sfifaStock.unit")}</span></>)}
            </dl>
            {row.unitWage !== undefined && <div className="work-detail-piece-wage"><span>{t("workers.payroll.wage")}</span><strong><bdi>{money(row.unitWage)}</bdi></strong></div>}
          </li>)}</ul>
        </section>}
      </> : <section className={`work-detail-history work-detail-history-${tab}`}>
        <div className="work-detail-section-heading"><h3>{t(tab === "completions" ? "workers.work.history" : "workers.work.increaseHistory")}</h3><span className="work-detail-count">{t("workers.work.detailDialog.records", { count: tab === "completions" ? completions.length : additions.length })}</span></div>
        {(tab === "completions" ? completions : additions).length ? <ol className="work-detail-timeline">{[...(tab === "completions" ? completions : additions)].reverse().map(event => {
          const pieceNumbers = (event.lineIds || []).map(lineId => materials.findIndex(row => row.lineId === lineId) + 1).filter(value => value > 0).map(number);
          return <li key={event._id} data-work-completion={tab === "completions" ? "" : undefined} data-work-addition={tab === "additions" ? "" : undefined}>
            <span className="work-detail-event-icon" aria-hidden="true">{tab === "completions" ? <IoCheckmarkCircleOutline /> : <IoAddCircleOutline />}</span>
            <article className="work-detail-event"><div className="work-detail-event-heading"><strong><span>{t(`workers.work.detailDialog.${tab === "completions" ? "completed" : "added"}`)}</span><b className="work-detail-event-quantity">+ {quantity(event.quantity)}</b></strong><time dateTime={event.date}>{date(event.date)}</time></div>
              <p className="work-detail-event-balance">{t(tab === "additions" ? "workers.work.increaseEntry" : isSfifa ? "workers.work.sfifa.balanceEntry" : "workers.work.balanceEntry", { before: number(event.before), after: number(event.after) })}</p>
              {tab === "completions" && <div className="work-detail-event-earning"><IoWalletOutline aria-hidden="true" /><span>{t("workers.payroll.earnedShort")}</span><strong>{event.earningAmount === undefined ? t("workers.payroll.unpriced") : <bdi>{money(event.earningAmount)}</bdi>}</strong></div>}
              {tab === "completions" && pieceNumbers.length > 0 && <p className="work-detail-event-pieces">{t("workers.work.pieceCards.completedNumbers", { numbers: pieceNumbers.join(i18n.language === "ar" ? "، " : ", ") })}</p>}
            </article>
          </li>;
        })}</ol> : <div className="work-detail-empty"><IoTimeOutline aria-hidden="true" /><h4>{t(`workers.work.detailDialog.${tab === "completions" ? "emptyCompletions" : "emptyAdditions"}`)}</h4><p>{t(tab === "completions" ? "workers.work.noCompletions" : "workers.work.detailDialog.noAdditions")}</p></div>}
      </section>}
    </div>
    <footer className="work-dialog-footer work-details-footer"><button type="button" data-close-work-details-footer className="work-button work-button-blue" onClick={onClose}>{t("dialog.close")}</button></footer>
  </dialog>;
}
