import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import WorkerShopWorkPicker from './WorkerShopWorkPicker.jsx';
import { WORKER_SFIFA_FAMILIES, SFIFA_CUSTOMER_FAMILY, workerSfifaCreditsStock } from '../../../shared/workerSfifa.js';
import { workerSfifaFamilyLabel, workerSfifaNumberLabel } from './workerSfifaLabels.js';
import { tailoringMoneyCents } from "../../../shared/tailoring.js";
import { workerCompletionEarning } from "../../../shared/workerPayroll.js";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoArrowForwardOutline, IoCheckmarkCircleOutline, IoCloseOutline, IoCubeOutline, IoPersonOutline } from "react-icons/io5";
import { TROUSER_TYPES, parseWorkQuantity, validateWorkerCompletion, validateWorkerWork, workQuantityUnits } from "../../../shared/workerWork.js";
import { SFIFA_STOCK_SCALE, SFIFA_STOCK_WIDTHS } from "../../../shared/sfifaStock.js";
import { assignWorkerWork, completeWorkerWork } from "./workersApi.js";
import WorkerOrderPicker from "./WorkerOrderPicker.jsx";
import WorkerBlockingNotice from "./WorkerBlockingNotice.jsx";
import WorkerMaterialPicker from './WorkerMaterialPicker.jsx';
import WorkerShopTrouserFields from "./WorkerShopTrouserFields.jsx";
import WorkerPieceCompletionPicker from './WorkerPieceCompletionPicker.jsx';
import { usesWorkerMaterials, workerHasPieceWages, WORKER_MATERIAL_PIECE_LIMIT } from '../../../shared/workerMaterials.js';

export default function WorkerWorkForm({ token, worker, category, workType = "shop", garmentType, work, onClose, onSaved, onReload }) {
  const { t, i18n } = useTranslation();
  const canSeeFinancials = useEmployeeOperations("workers").financials;
  const dialogRef = useRef(null), savingRef = useRef(false), submissionRef = useRef(null);
  const isShopTransfer = !work && workType === 'shop' && ['finishing', 'mesbanto'].includes(category) && Boolean(garmentType);
  const isSfifa = category === "sfifa";
  const isBrim = category === "brim";
  const isTrouserShop = category === "trousers" && (work?.workType || workType) === "shop";
  const isTrouserClient = category === "trousers" && (work?.workType || workType) === "client";
  const isClient = !isSfifa && !isBrim && (work?.workType || workType) === "client";
  const withMaterials = !work && usesWorkerMaterials(category, workType, garmentType);
  const isPieceCompletion = Boolean(work && workerHasPieceWages(work));
  const pendingPieceFocus = useRef(null);
  const [data, setData] = useState(() => ({ materials: {}, shopOriginId: "", unitWage: "", productName: "", quantity: withMaterials && !isClient ? "1" : "", trouserType: isTrouserClient || isTrouserShop ? "regular" : "", ...(isTrouserShop ? { shopTrouser: { fabricId: "", size: "" } } : {}), ...((category === "machine" || isShopTransfer) && workType === "shop" && garmentType ? { garmentType } : {}), orderId: "", lineIds: withMaterials && !isClient ? [crypto.randomUUID().replaceAll('-', '').slice(0, 24)] : [], linkOrder: false, width: "thin", family: WORKER_SFIFA_FAMILIES[0].value, code: "" }));
  const isClientSfifa = isSfifa && !workerSfifaCreditsStock(work || { workType, sfifa: { family: data.family } });
  const range = WORKER_SFIFA_FAMILIES.find(family => family.value === data.family);
  const [blockers, setBlockers] = useState([]);
  const [fields, setFields] = useState({}), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal(); dialog.querySelector(isPieceCompletion ? '#worker-work-lineIds' : work ? "#worker-work-quantity" : withMaterials ? '#worker-work-materials' : isSfifa ? '[name="worker-work-width"]:checked' : isClient ? "#worker-work-orderId" : isShopTransfer ? "#worker-work-shopOriginId" : isBrim ? "#worker-work-quantity" : isTrouserShop ? "#worker-work-trouserType" : "#worker-work-productName")?.focus();
    return () => dialog.close();
  }, [work, isSfifa, isClient, withMaterials, isPieceCompletion, isBrim, isTrouserShop, isShopTransfer]);
  useEffect(() => {
    if (!pendingPieceFocus.current) return;
    dialogRef.current?.querySelector(`[data-material-line="${pendingPieceFocus.current}"] select`)?.focus();
    pendingPieceFocus.current = null;
  }, [data.lineIds]);
  const patch = value => { setData(current => ({ ...current, ...value })); setFields({}); setError(""); setBlockers([]); };
  const addPiece = () => { if (data.lineIds.length >= WORKER_MATERIAL_PIECE_LIMIT) return; const id = crypto.randomUUID().replaceAll('-', '').slice(0, 24); pendingPieceFocus.current = id; patch({ lineIds: [...data.lineIds, id] }); };
  const removePiece = id => { if (data.lineIds.length <= 1) return; const materials = { ...data.materials }; delete materials[id]; patch({ lineIds: data.lineIds.filter(value => value !== id), materials }); };
  const submit = async event => {
    event.preventDefault();
    if (savingRef.current) return;
    let input;
    try {
      if (!work && !withMaterials && tailoringMoneyCents(data.unitWage) === null) throw Object.assign(new Error("invalidWork"), { fields: { unitWage: "invalidWage" } });
      if (withMaterials) { const invalid = Object.fromEntries(data.lineIds.flatMap((id, index) => tailoringMoneyCents(data.materials[id]?.unitWage) === null ? [[`materials.${index}.unitWage`, 'invalidWage']] : [])); if (Object.keys(invalid).length) throw Object.assign(new Error('invalidWork'), { fields: invalid }); }
      const { materials, shopOriginId, ...values } = data;
      input = work ? validateWorkerCompletion(data, work.remainingQuantity, category, work) : validateWorkerWork({ ...values, category, workType, ...(isShopTransfer ? { shopOriginId } : {}), ...(isBrim ? { productName: t("workers.categories.brim") } : {}), ...(withMaterials ? { productName: t('fesla.garmentTypes.' + garmentType), quantity: data.lineIds.length, unitWage: undefined, materials: data.lineIds.map(lineId => ({ lineId, ...materials[lineId] })) } : {}), ...(isSfifa ? { sfifa: { width: data.width, family: data.family, code: data.code } } : {}) }); }
    catch (failure) { setFields(failure.fields || {}); setError("invalidWork"); document.getElementById(isPieceCompletion ? 'worker-work-lineIds' : `worker-work-${Object.keys(failure.fields || {})[0] || "quantity"}`)?.focus(); return; }
    const fingerprint = JSON.stringify(input);
    if (submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, requestId: crypto.randomUUID() };
    savingRef.current = true; setSaving(true); setError(""); setFields({}); setBlockers([]);
    try {
      const saved = work ? await completeWorkerWork(token, worker._id, work, input.quantity, submissionRef.current.requestId, input.lineIds) : await assignWorkerWork(token, worker._id, input, submissionRef.current.requestId);
      if (dialogRef.current?.open) onSaved(saved);
    } catch (failure) {
      if (dialogRef.current?.open) {
        const code = failure.response?.data?.message;
        const materialErrors = ['shopWorkNotFound', 'shopMachinePending', 'shopFinishingRequired', 'shopFinishingPending', 'shopAlreadyAssigned', 'shopHasLaterStage', 'shopFlowFixedQuantity', 'materialStockUnavailable', 'insufficientFabric', 'insufficientSfifa', 'materialsPending', 'invalidMaterialSection'];
        setError([...materialErrors, "invalidWork", "invalidRequest", "workRequestConflict", "workerSectionChanged", "workNotFound", "workerDeleted", "workConflict", "forbidden", "notFound", "invalidWorkCategory", "sfifaStockLimit", "orderNotFound", "orderAlreadyDelivered", "orderGarmentsChanged", "garmentAlreadyAssigned", "garmentInProgress"].includes(code) ? code : withMaterials ? 'materialsPending' : "saveWorkFailed");
        if (['materialStockUnavailable', 'insufficientFabric', 'insufficientSfifa'].includes(code)) submissionRef.current = null;
        setFields(failure.response?.data?.fields || {});
        setBlockers(Array.isArray(failure.response?.data?.blockers) ? failure.response.data.blockers : []);
      }
    } finally { savingRef.current = false; if (dialogRef.current?.open) setSaving(false); }
  };
  const number = value => new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 }).format(value);
  const money = value => new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { style: "currency", currency: "MAD" }).format(value);
  const entered = parseWorkQuantity(data.quantity, category);
  const validCompletion = work && entered !== null && entered <= work.remainingQuantity;
  const after = validCompletion ? (workQuantityUnits(work.remainingQuantity, category) - workQuantityUnits(entered, category)) / (isSfifa ? SFIFA_STOCK_SCALE : 1) : work?.remainingQuantity;
  const amount = value => <><bdi>{number(value)}</bdi>{isSfifa && <span className="work-unit">{t("sfifaStock.unit")}</span>}</>;
  const fieldProps = key => ({ id: `worker-work-${key}`, className: "work-input", "aria-invalid": Boolean(fields[key]), "aria-describedby": fields[key] ? `worker-work-${key}-error` : undefined });
  const errorFor = key => fields[key] && <p id={`worker-work-${key}-error`} className="work-field-error">{t(`workers.work.errors.${fields[key]}`)}</p>;
  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="worker-work-form-title" onCancel={event => { event.preventDefault(); if (!savingRef.current) onClose(); }} className={`work-dialog ${withMaterials ? 'work-material-dialog' : ''}`}>
    <header className={`work-dialog-header ${work ? "work-dialog-header-complete" : ""}`}>
      <span className="work-dialog-icon" aria-hidden="true">{work ? <IoCheckmarkCircleOutline /> : <IoAddOutline />}</span>
      <div><p className="work-eyebrow">{t(`workers.categories.${category}`)}</p><h2 id="worker-work-form-title">{t(work ? "workers.work.complete" : "workers.work.add")}</h2><p className="work-dialog-worker"><IoPersonOutline aria-hidden="true" /><span dir="auto">{worker.name}</span></p></div>
      <button type="button" disabled={saving} onClick={onClose} aria-label={t("dialog.close")} className="work-close"><IoCloseOutline /></button>
    </header>
    <form noValidate onSubmit={submit}>
      <div className="work-dialog-body">
        {work && <>
          <div className="work-completion-identity">{isSfifa ? <><span className={`work-width-badge work-width-badge-${work.sfifa.width}`}>{t(`sfifaStock.widths.${work.sfifa.width}`)}</span><strong>{work.sfifa.family !== SFIFA_CUSTOMER_FAMILY && t("sfifaStock.code")} <bdi dir="auto">{workerSfifaNumberLabel(work.sfifa, t)}</bdi></strong>{work.sfifa.code !== undefined && <span>{t("sfifaStock.family")} <bdi dir="ltr">{workerSfifaFamilyLabel(work.sfifa.family, t)}</bdi></span>}</> : <><strong dir="auto">{work.productName}</strong>{(isTrouserClient || isTrouserShop) && work.trouserType && <span className={`worker-trouser-badge worker-trouser-${work.trouserType}`}>{t(`workers.work.trousers.styles.${work.trouserType}`)}</span>}</>}</div>
          <dl className="work-completion-preview"><div className="work-tone-amber"><dt>{t("workers.work.design.remainingBefore")}</dt><dd>{amount(work.remainingQuantity)}</dd></div><IoArrowForwardOutline className="rtl:rotate-180" aria-hidden="true" /><div className="work-tone-green"><dt>{t("workers.work.design.remainingAfter")}</dt><dd data-work-preview-after data-value={after}>{amount(after)}</dd></div></dl>
        </>}
        <fieldset disabled={saving || error === 'materialsPending'} className="work-form-fields">
          {!work && isSfifa && workType === "client" && <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><input type="checkbox" data-link-sfifa-order checked={data.linkOrder} onChange={event => patch({ linkOrder: event.target.checked, orderId: "", lineIds: [] })} /><span>{t("workers.work.linkSfifaOrder")}</span></label>}
          {isShopTransfer && <WorkerShopWorkPicker token={token} workerId={worker._id} category={category} garmentType={garmentType} value={data.shopOriginId} onChange={patch} disabled={saving} error={fields.shopOriginId} />}
          {!work && isTrouserShop && <WorkerShopTrouserFields token={token} workerId={worker._id} value={data} onChange={patch} disabled={saving} fields={fields} />}
          {!work && isTrouserClient && <div className="work-field"><label htmlFor="worker-work-trouser-filter">{t("workers.work.trousers.typeLabel")}</label><select id="worker-work-trouser-filter" className="work-input" value={data.trouserType} onChange={event => patch({ trouserType: event.target.value, orderId: "", lineIds: [] })}>{TROUSER_TYPES.map(type => <option key={type} value={type}>{t("workers.work.trousers.styles." + type)}</option>)}</select><p className="work-field-hint">{t("workers.work.trousers.orderHint")}</p></div>}
          {!work && (isClient || (isSfifa && workType === "client" && data.linkOrder)) && <WorkerOrderPicker token={token} workerId={worker._id} category={category} garmentType={garmentType} trouserType={isTrouserClient ? data.trouserType : undefined} orderId={data.orderId} lineIds={data.lineIds} onChange={patch} disabled={saving} fields={fields} />}
          {!work && !isSfifa && !isClient && !withMaterials && !isBrim && !isTrouserShop && !isShopTransfer && <div className="work-field"><label htmlFor="worker-work-productName">{t(isTrouserClient ? "workers.work.trousers.clientName" : "workers.work.productName")}</label><input {...fieldProps("productName")} value={data.productName} onChange={event => patch({ productName: event.target.value })} maxLength={160} required />{errorFor("productName")}</div>}

          {!work && isSfifa && <>
            <fieldset id="worker-work-width" tabIndex={-1} className="work-choice-field" aria-describedby={fields.width ? "worker-work-width-error" : undefined}>
              <legend>{t("sfifaStock.width")}</legend><div className="work-width-choices">{SFIFA_STOCK_WIDTHS.map(width => <label key={width} className={`work-choice work-choice-${width} ${data.width === width ? "is-selected" : ""}`}>
                <input type="radio" name="worker-work-width" value={width} checked={data.width === width} onChange={() => patch({ width })} /><span className={`work-thread-icon work-thread-icon-${width}`} aria-hidden="true"><i /><i /><i /></span><span>{t(`sfifaStock.widths.${width}`)}</span><IoCheckmarkCircleOutline className="work-choice-check" aria-hidden="true" />
              </label>)}</div>{errorFor("width")}
            </fieldset>
            <fieldset id="worker-work-family" tabIndex={-1} className="work-choice-field" aria-describedby={fields.family ? "worker-work-family-error" : undefined}>
              <legend>{t("sfifaStock.family")}</legend><div className="work-family-choices">{WORKER_SFIFA_FAMILIES.map(family => <label key={family.value} className={`work-family-choice ${data.family === family.value ? "is-selected" : ""}`}>
                <input type="radio" name="worker-work-family" value={family.value} checked={data.family === family.value} onChange={() => patch({ family: family.value, code: "" })} /><span dir={family.value === SFIFA_CUSTOMER_FAMILY ? "auto" : "ltr"}>{workerSfifaFamilyLabel(family.value, t)}</span>
              </label>)}</div>{errorFor("family")}
            </fieldset>
          </>}
          {isPieceCompletion && <WorkerPieceCompletionPicker work={work} selected={data.lineIds} onChange={lineIds => patch({ lineIds, quantity: String(lineIds.length) })} disabled={saving} error={fields.lineIds || (fields.quantity ? 'chooseCompletedPieces' : undefined)} />}
          {!withMaterials && !isPieceCompletion && !isShopTransfer && <div className={!work && isSfifa ? "work-numeric-grid" : ""}>
            {!work && isSfifa && data.family !== SFIFA_CUSTOMER_FAMILY && <div className="work-field"><label htmlFor="worker-work-code">{t("sfifaStock.code")}</label><input {...fieldProps("code")} className="work-input work-number-input" type="text" inputMode="numeric" dir="ltr" value={data.code} onChange={event => patch({ code: event.target.value })} maxLength={4} placeholder={String(range.min).padStart(range.min === 1 ? 2 : 1, "0")} required aria-describedby={`worker-work-code-hint${fields.code ? " worker-work-code-error" : ""}`} /><p id="worker-work-code-hint" className="work-field-hint">{t("sfifaStock.codeHint", { min: range.min, max: range.max })}</p>{errorFor("code")}</div>}
            <div className="work-field"><label htmlFor="worker-work-quantity">{t(`workers.work.${isSfifa ? "sfifa." : ""}${work ? "completedInput" : "quantity"}`)}</label><div className="work-input-with-unit"><input {...fieldProps("quantity")} className="work-input work-number-input" type="text" inputMode={isSfifa ? "decimal" : "numeric"} dir="ltr" value={!work && isClient ? String(data.lineIds.length) : data.quantity} readOnly={!work && isClient} onChange={event => patch({ quantity: event.target.value })} maxLength={isSfifa ? 11 : 7} placeholder="0" required />{isSfifa && <span aria-hidden="true">{t("sfifaStock.unit")}</span>}</div>{errorFor("quantity")}{!work && isClient && <p className="work-field-hint">{t("workers.work.selectedGarmentsHint", { count: data.lineIds.length })}</p>}</div>
          </div>}
          {!work && !withMaterials && <div className="work-field"><label htmlFor="worker-work-unitWage">{t(`workers.payroll.${isSfifa ? "wagePerMeter" : "wagePerPiece"}`)}</label><input {...fieldProps("unitWage")} inputMode="decimal" dir="ltr" value={data.unitWage} onChange={event => patch({ unitWage: event.target.value })} maxLength={13} placeholder="0.00" required /><p className="work-field-hint">{t("workers.payroll.wageHint")}</p>{errorFor("unitWage")}</div>}
          {withMaterials && <WorkerMaterialPicker token={token} workerId={worker._id} workType={workType} garmentType={garmentType} lineIds={data.lineIds} value={data.materials} onChange={materials => patch({ materials })} onAddPiece={addPiece} onRemovePiece={removePiece} wages disabled={saving || error === 'materialsPending'} fields={fields} />}
        </fieldset>
        {canSeeFinancials && work && validCompletion && <p className="payroll-month-due">{t("workers.payroll.earningPreview")} <strong data-completion-earning>{work.unitWage === undefined && !isPieceCompletion ? t("workers.payroll.unpriced") : money(workerCompletionEarning(work, entered, new Date(), data.lineIds).earningAmount)}</strong></p>}
        {isSfifa && <div className="work-transfer-note"><IoCubeOutline aria-hidden="true" /><p>{t(isClientSfifa ? "workers.work.sfifa.clientCompletionHint" : work ? "workers.work.design.stockTransfer" : "workers.work.sfifa.assignmentHint")}{work && validCompletion && !isClientSfifa && <strong data-work-preview-credit>+ {amount(entered)}</strong>}</p></div>}
        {error && <div role="alert" className="work-feedback work-feedback-error"><p>{t(`workers.work.errors.${error}`)}</p>{error === "garmentInProgress" && <WorkerBlockingNotice blockers={blockers} />}{["shopWorkNotFound", "shopMachinePending", "shopFinishingRequired", "shopFinishingPending", "shopAlreadyAssigned", "materialsPending", "workConflict", "workerSectionChanged", "workNotFound", "orderNotFound", "orderAlreadyDelivered", "orderGarmentsChanged", "garmentAlreadyAssigned", "garmentInProgress"].includes(error) && <button type="button" onClick={onReload} disabled={saving} className="work-text-button">{t("workers.work.reload")}</button>}</div>}
      </div>
      <footer className="work-dialog-footer"><button type="button" disabled={saving} onClick={onClose} className="work-button work-button-quiet">{t("common.cancel")}</button><button type="submit" disabled={saving || isShopTransfer && !data.shopOriginId} className={`work-button ${work ? "work-button-green" : "work-button-blue"}`}>{work ? <IoCheckmarkCircleOutline /> : <IoAddOutline />}{t(saving ? "common.loading" : work ? "workers.work.saveCompletion" : "workers.work.saveAssignment")}</button></footer>
    </form>
  </dialog>;
}
