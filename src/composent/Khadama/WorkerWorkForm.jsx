import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoArrowForwardOutline, IoCheckmarkCircleOutline, IoCloseOutline, IoCubeOutline, IoPersonOutline } from "react-icons/io5";
import { TROUSER_TYPES, parseWorkQuantity, validateWorkerCompletion, validateWorkerWork, workQuantityUnits } from "../../../shared/workerWork.js";
import { SFIFA_STOCK_FAMILIES, SFIFA_STOCK_SCALE, SFIFA_STOCK_WIDTHS, formatSfifaCode } from "../../../shared/sfifaStock.js";
import { assignWorkerWork, completeWorkerWork } from "./workersApi.js";
import WorkerOrderPicker from "./WorkerOrderPicker.jsx";
import WorkerBlockingNotice from "./WorkerBlockingNotice.jsx";

export default function WorkerWorkForm({ token, worker, category, workType = "shop", garmentType, work, onClose, onSaved, onReload }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), savingRef = useRef(false), submissionRef = useRef(null);
  const isSfifa = category === "sfifa";
  const isTrouserClient = category === "trousers" && (work?.workType || workType) === "client";
  const isClient = !isSfifa && (work?.workType || workType) === "client";
  const [data, setData] = useState({ productName: "", quantity: "", trouserType: isTrouserClient ? "regular" : "", ...(category === "machine" && workType === "shop" && garmentType ? { garmentType } : {}), orderId: "", lineIds: [], linkOrder: false, width: "thin", family: SFIFA_STOCK_FAMILIES[0].value, code: "" });
  const range = SFIFA_STOCK_FAMILIES.find(family => family.value === data.family);
  const [blockers, setBlockers] = useState([]);
  const [fields, setFields] = useState({}), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal(); dialog.querySelector(work ? "#worker-work-quantity" : isSfifa ? '[name="worker-work-width"]:checked' : isClient ? "#worker-work-orderId" : "#worker-work-productName")?.focus();
    return () => dialog.close();
  }, [work, isSfifa, isClient]);
  const patch = value => { setData(current => ({ ...current, ...value })); setFields({}); setError(""); setBlockers([]); };
  const submit = async event => {
    event.preventDefault();
    if (savingRef.current) return;
    let input;
    try { input = work ? validateWorkerCompletion(data, work.remainingQuantity, category) : validateWorkerWork({ ...data, category, workType, ...(isSfifa ? { sfifa: { width: data.width, family: data.family, code: data.code } } : {}) }); }
    catch (failure) { setFields(failure.fields || {}); setError("invalidWork"); dialogRef.current?.querySelector(`#worker-work-${Object.keys(failure.fields || {})[0] || "quantity"}`)?.focus(); return; }
    const fingerprint = JSON.stringify(input);
    if (submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, requestId: crypto.randomUUID() };
    savingRef.current = true; setSaving(true); setError(""); setFields({}); setBlockers([]);
    try {
      const saved = work ? await completeWorkerWork(token, worker._id, work, input.quantity, submissionRef.current.requestId) : await assignWorkerWork(token, worker._id, input, submissionRef.current.requestId);
      if (dialogRef.current?.open) onSaved(saved);
    } catch (failure) {
      if (dialogRef.current?.open) {
        const code = failure.response?.data?.message;
        setError(["invalidWork", "invalidRequest", "workRequestConflict", "workerSectionChanged", "workNotFound", "workConflict", "forbidden", "notFound", "invalidWorkCategory", "sfifaStockLimit", "orderNotFound", "orderAlreadyDelivered", "orderGarmentsChanged", "garmentAlreadyAssigned", "garmentInProgress"].includes(code) ? code : "saveWorkFailed");
        setFields(failure.response?.data?.fields || {});
        setBlockers(Array.isArray(failure.response?.data?.blockers) ? failure.response.data.blockers : []);
      }
    } finally { savingRef.current = false; if (dialogRef.current?.open) setSaving(false); }
  };
  const number = value => new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 }).format(value);
  const entered = parseWorkQuantity(data.quantity, category);
  const validCompletion = work && entered !== null && entered <= work.remainingQuantity;
  const after = validCompletion ? (workQuantityUnits(work.remainingQuantity, category) - workQuantityUnits(entered, category)) / (isSfifa ? SFIFA_STOCK_SCALE : 1) : work?.remainingQuantity;
  const amount = value => <><bdi>{number(value)}</bdi>{isSfifa && <span className="work-unit">{t("sfifaStock.unit")}</span>}</>;
  const fieldProps = key => ({ id: `worker-work-${key}`, className: "work-input", "aria-invalid": Boolean(fields[key]), "aria-describedby": fields[key] ? `worker-work-${key}-error` : undefined });
  const errorFor = key => fields[key] && <p id={`worker-work-${key}-error`} className="work-field-error">{t(`workers.work.errors.${fields[key]}`)}</p>;
  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="worker-work-form-title" onCancel={event => { event.preventDefault(); if (!savingRef.current) onClose(); }} className="work-dialog">
    <header className={`work-dialog-header ${work ? "work-dialog-header-complete" : ""}`}>
      <span className="work-dialog-icon" aria-hidden="true">{work ? <IoCheckmarkCircleOutline /> : <IoAddOutline />}</span>
      <div><p className="work-eyebrow">{t(`workers.categories.${category}`)}</p><h2 id="worker-work-form-title">{t(work ? "workers.work.complete" : "workers.work.add")}</h2><p className="work-dialog-worker"><IoPersonOutline aria-hidden="true" /><span dir="auto">{worker.name}</span></p></div>
      <button type="button" disabled={saving} onClick={onClose} aria-label={t("dialog.close")} className="work-close"><IoCloseOutline /></button>
    </header>
    <form noValidate onSubmit={submit}>
      <div className="work-dialog-body">
        {work && <>
          <div className="work-completion-identity">{isSfifa ? <><span className={`work-width-badge work-width-badge-${work.sfifa.width}`}>{t(`sfifaStock.widths.${work.sfifa.width}`)}</span><strong>{t("sfifaStock.code")} <bdi dir="ltr">{formatSfifaCode(work.sfifa.code, work.sfifa.family)}</bdi></strong><span>{t("sfifaStock.family")} <bdi dir="ltr">{SFIFA_STOCK_FAMILIES.find(family => family.value === work.sfifa.family)?.label}</bdi></span></> : <><strong dir="auto">{work.productName}</strong>{isTrouserClient && <span className={`worker-trouser-badge worker-trouser-${work.trouserType}`}>{t(`workers.work.trousers.styles.${work.trouserType}`)}</span>}</>}</div>
          <dl className="work-completion-preview"><div className="work-tone-amber"><dt>{t("workers.work.design.remainingBefore")}</dt><dd>{amount(work.remainingQuantity)}</dd></div><IoArrowForwardOutline className="rtl:rotate-180" aria-hidden="true" /><div className="work-tone-green"><dt>{t("workers.work.design.remainingAfter")}</dt><dd data-work-preview-after data-value={after}>{amount(after)}</dd></div></dl>
        </>}
        <fieldset disabled={saving} className="work-form-fields">
          {!work && isSfifa && workType === "client" && <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><input type="checkbox" data-link-sfifa-order checked={data.linkOrder} onChange={event => patch({ linkOrder: event.target.checked, orderId: "", lineIds: [] })} /><span>{t("workers.work.linkSfifaOrder")}</span></label>}
          {!work && isTrouserClient && <div className="work-field"><label htmlFor="worker-work-trouser-filter">{t("workers.work.trousers.typeLabel")}</label><select id="worker-work-trouser-filter" className="work-input" value={data.trouserType} onChange={event => patch({ trouserType: event.target.value, orderId: "", lineIds: [] })}>{TROUSER_TYPES.map(type => <option key={type} value={type}>{t("workers.work.trousers.styles." + type)}</option>)}</select><p className="work-field-hint">{t("workers.work.trousers.orderHint")}</p></div>}
          {!work && (isClient || (isSfifa && workType === "client" && data.linkOrder)) && <WorkerOrderPicker token={token} workerId={worker._id} category={category} garmentType={garmentType} trouserType={isTrouserClient ? data.trouserType : undefined} orderId={data.orderId} lineIds={data.lineIds} onChange={patch} disabled={saving} fields={fields} />}
          {!work && !isSfifa && !isClient && <div className="work-field"><label htmlFor="worker-work-productName">{t(isTrouserClient ? "workers.work.trousers.clientName" : "workers.work.productName")}</label><input {...fieldProps("productName")} value={data.productName} onChange={event => patch({ productName: event.target.value })} maxLength={160} required />{errorFor("productName")}</div>}

          {!work && isSfifa && <>
            <fieldset id="worker-work-width" tabIndex={-1} className="work-choice-field" aria-describedby={fields.width ? "worker-work-width-error" : undefined}>
              <legend>{t("sfifaStock.width")}</legend><div className="work-width-choices">{SFIFA_STOCK_WIDTHS.map(width => <label key={width} className={`work-choice work-choice-${width} ${data.width === width ? "is-selected" : ""}`}>
                <input type="radio" name="worker-work-width" value={width} checked={data.width === width} onChange={() => patch({ width })} /><span className={`work-thread-icon work-thread-icon-${width}`} aria-hidden="true"><i /><i /><i /></span><span>{t(`sfifaStock.widths.${width}`)}</span><IoCheckmarkCircleOutline className="work-choice-check" aria-hidden="true" />
              </label>)}</div>{errorFor("width")}
            </fieldset>
            <fieldset id="worker-work-family" tabIndex={-1} className="work-choice-field" aria-describedby={fields.family ? "worker-work-family-error" : undefined}>
              <legend>{t("sfifaStock.family")}</legend><div className="work-family-choices">{SFIFA_STOCK_FAMILIES.map(family => <label key={family.value} className={`work-family-choice ${data.family === family.value ? "is-selected" : ""}`}>
                <input type="radio" name="worker-work-family" value={family.value} checked={data.family === family.value} onChange={() => patch({ family: family.value, code: "" })} /><bdi dir="ltr">{family.label}</bdi>
              </label>)}</div>{errorFor("family")}
            </fieldset>
          </>}
          <div className={!work && isSfifa ? "work-numeric-grid" : ""}>
            {!work && isSfifa && <div className="work-field"><label htmlFor="worker-work-code">{t("sfifaStock.code")}</label><input {...fieldProps("code")} className="work-input work-number-input" type="text" inputMode="numeric" dir="ltr" value={data.code} onChange={event => patch({ code: event.target.value })} maxLength={4} placeholder={String(range.min).padStart(range.min === 1 ? 2 : 1, "0")} required aria-describedby={`worker-work-code-hint${fields.code ? " worker-work-code-error" : ""}`} /><p id="worker-work-code-hint" className="work-field-hint">{t("sfifaStock.codeHint", { min: range.min, max: range.max })}</p>{errorFor("code")}</div>}
            <div className="work-field"><label htmlFor="worker-work-quantity">{t(`workers.work.${isSfifa ? "sfifa." : ""}${work ? "completedInput" : "quantity"}`)}</label><div className="work-input-with-unit"><input {...fieldProps("quantity")} className="work-input work-number-input" type="text" inputMode={isSfifa ? "decimal" : "numeric"} dir="ltr" value={!work && isClient ? String(data.lineIds.length) : data.quantity} readOnly={!work && isClient} onChange={event => patch({ quantity: event.target.value })} maxLength={isSfifa ? 11 : 7} placeholder="0" required />{isSfifa && <span aria-hidden="true">{t("sfifaStock.unit")}</span>}</div>{errorFor("quantity")}{!work && isClient && <p className="work-field-hint">{t("workers.work.selectedGarmentsHint", { count: data.lineIds.length })}</p>}</div>
          </div>
        </fieldset>
        {isSfifa && <div className="work-transfer-note"><IoCubeOutline aria-hidden="true" /><p>{t(work ? "workers.work.design.stockTransfer" : "workers.work.sfifa.assignmentHint")}{work && validCompletion && <strong data-work-preview-credit>+ {amount(entered)}</strong>}</p></div>}
        {error && <div role="alert" className="work-feedback work-feedback-error"><p>{t(`workers.work.errors.${error}`)}</p>{error === "garmentInProgress" && <WorkerBlockingNotice blockers={blockers} />}{["workConflict", "workerSectionChanged", "workNotFound", "orderNotFound", "orderAlreadyDelivered", "orderGarmentsChanged", "garmentAlreadyAssigned", "garmentInProgress"].includes(error) && <button type="button" onClick={onReload} disabled={saving} className="work-text-button">{t("workers.work.reload")}</button>}</div>}
      </div>
      <footer className="work-dialog-footer"><button type="button" disabled={saving} onClick={onClose} className="work-button work-button-quiet">{t("common.cancel")}</button><button type="submit" disabled={saving} className={`work-button ${work ? "work-button-green" : "work-button-blue"}`}>{work ? <IoCheckmarkCircleOutline /> : <IoAddOutline />}{t(saving ? "common.loading" : work ? "workers.work.saveCompletion" : "workers.work.saveAssignment")}</button></footer>
    </form>
  </dialog>;
}
