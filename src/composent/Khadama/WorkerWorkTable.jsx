import { workerSfifaFamilyLabel, workerSfifaNumberLabel } from './workerSfifaLabels.js';
import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoAddCircleOutline, IoCheckmarkCircleOutline, IoEyeOutline, IoTimeOutline, IoTrashOutline } from "react-icons/io5";

import WorkerWorkDetailsDialog from "./WorkerWorkDetailsDialog.jsx";

import { tailoringGarmentType } from "../../../shared/tailoring.js";
import { usesWorkerMaterials, workerHasPieceWages, workerPieceWageCents, workerMaterialPending } from '../../../shared/workerMaterials.js';
import { workerWorkGarmentType } from '../../../shared/workerWork.js';

export default function WorkerWorkTable({ works, worker, category, canComplete, canIncrease, canDelete, canResume, onComplete, onIncrease, onDelete, onCancel, onResume }) {
  const { t, i18n } = useTranslation();
  const [selectedId, setSelectedId] = useState(null);
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const money = value => new Intl.NumberFormat(locale, { style: "currency", currency: "MAD" }).format(value);
  const date = value => new Date(value).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  const isSfifa = category === "sfifa";
  const selectedWork = works.find(work => work._id === selectedId);
  const amount = value => <><bdi>{number(value)}</bdi>{isSfifa && <small>{t("sfifaStock.unit")}</small>}</>;
  return <div className="worker-table-panel"><p className="worker-table-hint" id="worker-table-hint">{t("workers.work.scrollTable")}</p><div className="worker-table-scroll" role="region" aria-label={t("workers.work.design.workList")} aria-describedby="worker-table-hint" tabIndex={0}>
    <table className="worker-work-table"><caption className="sr-only">{t("workers.work.design.workList")}</caption>
      <thead><tr>{["identity", "quantity", "completedQuantity", "remainingQuantity", "wage", "status", "assignedDate", "actions"].map(key => <th scope="col" key={key} className={key === "actions" ? "worker-table-actions" : undefined}>{t(["quantity", "completedQuantity", "remainingQuantity"].includes(key) ? `workers.work.${isSfifa ? "sfifa." : ""}${key}` : key === "identity" && category === "trousers" ? "workers.work.trousers.identity" : key === "wage" ? "workers.payroll.wage" : `workers.work.${key}`)}</th>)}</tr></thead>
      <tbody>{works.map(work => {
        const done = work.remainingQuantity === 0;
        const pending = workerMaterialPending(work), cancellable = usesWorkerMaterials(category, work.workType, workerWorkGarmentType(work)) && work.materialStatus !== 'returning';
        return <tr key={work._id} data-worker-work={work._id} data-work-status={done ? "done" : "inProgress"}>
          <th scope="row" className="worker-table-identity">{isSfifa ? <><strong>{t(`sfifaStock.widths.${work.sfifa.width}`)}</strong><bdi dir="auto">{workerSfifaNumberLabel(work.sfifa, t)}</bdi>{work.sfifa.code !== undefined && <small>{workerSfifaFamilyLabel(work.sfifa.family, t)}</small>}{work.tailoring && <><strong dir="auto">{work.tailoring.clientName}</strong><bdi dir="ltr" className="worker-order-barcode">{work.tailoring.barcode}</bdi></>}</> : <><strong dir="auto">{work.productName}</strong>{category === "trousers" && work.trouserType && <span className={`worker-trouser-badge worker-trouser-${work.trouserType}`}>{t(`workers.work.trousers.styles.${work.trouserType}`)}</span>}{work.tailoring && <><bdi dir="ltr" className="worker-order-barcode">{work.tailoring.barcode}</bdi><small>{t(tailoringGarmentType(work.tailoring) === "djellaba" ? "fesla.garmentsCount" : "fesla." + tailoringGarmentType(work.tailoring) + ".garmentsCount", { count: work.tailoring.items.length })}</small></>}</>}</th>
          {["quantity", "completedQuantity", "remainingQuantity"].map(key => <td key={key} data-work-quantity={key} data-value={work[key]} className={`worker-table-number worker-amount-${key}`}>{amount(work[key])}</td>)}
          <td data-work-wage>{workerHasPieceWages(work) ? <><strong>{t('workers.work.pieceCards.variableWages')}</strong><small style={{ display: 'block' }}>{t('workers.work.pieceCards.totalWages')}: {money(workerPieceWageCents(work.materials) / 100)}</small></> : work.unitWage === undefined ? t("workers.payroll.unpriced") : <><strong>{money(work.unitWage)}</strong><small style={{ display: "block" }}>{t(isSfifa ? "workers.payroll.perMeter" : "workers.payroll.perPiece")}</small></>}{(workerHasPieceWages(work) || work.unitWage !== undefined) && <small style={{ display: "block" }}>{t("workers.payroll.earnedShort")}: {money(work.completions.reduce((sum, event) => sum + Math.round((event.earningAmount || 0) * 100), 0) / 100)}</small>}</td>
          <td><span className={`work-status-badge ${done ? "work-status-done" : "work-status-pending"}`}>{done ? <IoCheckmarkCircleOutline aria-hidden="true" /> : <IoTimeOutline aria-hidden="true" />}{t(pending ? 'workers.work.materialProcessing' : done ? "workers.work.done" : "workers.work.inProgress")}</span></td>
          <td><time dateTime={work.createdAt}>{date(work.createdAt)}</time></td>
          <td className="worker-table-actions"><div>{pending ? canResume && <button type="button" data-resume-materials onClick={() => onResume(work)} className="work-button work-button-blue"><IoAddCircleOutline aria-hidden="true" />{t('workers.work.resumeMaterials')}</button> : <>{!done && canComplete && <button type="button" data-complete-work onClick={() => onComplete(work)} className="work-button work-button-blue"><IoAddCircleOutline aria-hidden="true" />{t("workers.work.complete")}</button>}{(canIncrease || canDelete) && <div className="worker-change-actions">{canIncrease && <button type="button" data-increase-work onClick={() => onIncrease(work)} aria-label={t("workers.work.increase")} className="work-button work-button-quiet"><IoAddCircleOutline aria-hidden="true" />{t("workers.work.increaseShort")}</button>}{canDelete && !cancellable && <EmployeeOperation module="workers" operation="deleteWork"><button type="button" data-delete-work onClick={() => onDelete(work)} aria-label={t("workers.work.remove")} className="work-button work-button-red-quiet"><IoTrashOutline aria-hidden="true" />{t("workers.work.deleteShort")}</button></EmployeeOperation>}</div>}</>}{canDelete && cancellable && <EmployeeOperation module="workers" operation="cancelWork"><button type="button" data-cancel-worker-work onClick={() => onCancel(work)} className="work-button work-button-red-quiet"><IoTrashOutline aria-hidden="true" />{t('workers.work.cancelWork')}</button></EmployeeOperation>}<EmployeeOperation module="workers" operation="details"><button type="button" data-view-work={work._id} aria-haspopup="dialog" aria-controls={`work-detail-${work._id}`} onClick={() => setSelectedId(work._id)} className="work-button work-button-quiet"><IoEyeOutline aria-hidden="true" />{t("workers.work.details")}</button></EmployeeOperation></div></td>
        </tr>;
      })}</tbody>
    </table>
  </div>{selectedWork && <WorkerWorkDetailsDialog key={selectedWork._id} work={selectedWork} worker={worker} category={category} onClose={() => setSelectedId(null)} />}</div>;
}
