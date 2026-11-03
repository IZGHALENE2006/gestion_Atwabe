import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoCloseOutline } from "react-icons/io5";
import { MAX_TAILORING_ITEMS, todayTailoringDate, validateTailoringOrder, tailoringRemainingAmount, tailoringItemsTotal, tailoringOrderItems, tailoringGarmentType, tailoringProfitAmount, tailoringHasExpenses, tailoringUsesSfifa } from "../../../shared/tailoring.js";
import { loadFabrics } from "../Atwabe/fabricsApi.js";
import { djellabaItemCosts, djellabaCostsTotal, tailoringFabricCost, tailoringFabricCostsTotal, trouserCostsTotal } from "../../../shared/tailoringCosts.js";
import DjellabaSettingsDialog from "./DjellabaSettingsDialog.jsx";
import { saveTailoringOrder, loadDjellabaCostSettings } from "./feslaApi.js";
import TailoringOrderItemForm from "./TailoringOrderItemForm.jsx";

const newItem = garmentType => ({ lineId: crypto.randomUUID().replaceAll("-", "").slice(0, 24), price: "", fabricSource: "client", fabricType: "", fabricColor: "", fabricId: "", colorId: "", ...(garmentType === "shirts" ? { shirtType: "" } : garmentType === "trousers" ? { trouserType: "regular", fabricMeters: "" } : { fabricMeters: "", sfifa: { width: "thin", style: "fabric", color1: "", color2: "" } }), selection: null, removeImage: false });
const fieldId = name => `fesla-${name.replaceAll(".", "-")}`;
function Field({ name, label, error, children }) {
  const { t } = useTranslation();
  return <div className="min-w-0"><label htmlFor={fieldId(name)} className="mb-2 block text-sm font-semibold">{label}</label>{children}{error && <p id={`${fieldId(name)}-error`} className="mt-2 text-xs text-rose-600 dark:text-rose-400">{t(`fesla.errors.${error}`)}</p>}</div>;
}
export default function TailoringOrderForm({ order, garmentType: sectionType = "djellaba", token, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), savingRef = useRef(false), submissionRef = useRef(null);
  const garmentType = order ? tailoringGarmentType(order) : sectionType;
  const costText = key => t(["fesla." + garmentType + ".costs." + key, "fesla.costs." + key]);
  const withExpenses = tailoringHasExpenses({ garmentType });
  const automaticCosts = tailoringUsesSfifa({ garmentType });
  const trousers = garmentType === "trousers";
  const [manualExpenses, setManualExpenses] = useState(() => Boolean(order) && trouserCostsTotal(tailoringOrderItems(order).map(item => item.fabricCost), order.trouserCosting?.laborPrice ?? 0) !== order.expenseAmount);
  const [costResult, setCostResult] = useState(null), [costAttempt, setCostAttempt] = useState(0), [settingsEditor, setSettingsEditor] = useState(false);
  const costState = costResult?.token === token && costResult.attempt === costAttempt ? costResult : { loading: true };
  const garmentText = (key, options) => t(garmentType === "djellaba" ? `fesla.${key}` : `fesla.${garmentType}.${key}`, options);
  const savedItems = tailoringOrderItems(order);
  const [data, setData] = useState(() => ({ garmentType, ...(withExpenses ? { expenseAmount: String(order?.expenseAmount ?? "") } : {}), clientName: order?.clientName || "", phone: order?.phone || "", orderDate: order?.orderDate || todayTailoringDate(), readyDate: order?.readyDate || "", paidAmount: String(order?.paidAmount ?? 0), items: order ? tailoringOrderItems(order).map(item => ({ ...item, price: String(item.price), fabricId: item.fabricId || "", colorId: item.colorId || "", ...(garmentType !== "shirts" ? { fabricMeters: String(item.fabricMeters ?? "") } : {}), ...(!withExpenses ? { sfifa: { ...item.sfifa } } : {}), selection: null, removeImage: false })) : [newItem(garmentType)] }));
  const [inventory, setInventory] = useState({ loading: true, fabrics: [], error: false });
  const [attempt, setAttempt] = useState(0), [fields, setFields] = useState({}), [error, setError] = useState("");
  const [saving, setSaving] = useState(false), [cameras, setCameras] = useState({});
  const cameraBusy = Object.values(cameras).some(Boolean);
  const cameraChanged = useCallback((lineId, busy) => setCameras(current => ({ ...current, [lineId]: busy })), []);
  const totalPrice = tailoringItemsTotal(data.items);
  const costRates = order?.costing?.rates || costState.value?.rates;
  const costSettingsVersion = order?.costing?.settingsVersion ?? costState.value?.version;
  const trouserLaborPrice = order ? order.trouserCosting?.laborPrice ?? 0 : costState.value ? costState.value.rates?.laborPrice ?? 0 : null;
  const trouserSettingsVersion = order ? order.trouserCosting?.settingsVersion ?? null : costState.value?.version;
  const pricedItems = data.items.map(item => {
    if (!automaticCosts && !trousers) return item;
    const previous = savedItems.find(saved => saved.lineId === item.lineId);
    const snapshot = trousers ? previous?.fabricCost : previous?.costs;
    const savedPrice = snapshot && previous.fabricSource === "shop" && previous.fabricId === item.fabricId;
    const fabricUnitPrice = item.fabricSource === "client" ? 0 : savedPrice ? snapshot.fabricUnitPrice : inventory.fabrics.find(fabric => fabric._id === item.fabricId)?.salePricePerMeter;
    return { ...item, fabricUnitPrice: fabricUnitPrice ?? "" };
  });
  const garmentCosts = automaticCosts ? pricedItems.map(item => djellabaItemCosts(item, costRates)) : [];
  const fabricCosts = trousers ? pricedItems.map(tailoringFabricCost) : [];
  const fabricTotal = trousers ? tailoringFabricCostsTotal(fabricCosts) : null;
  const suggestedExpenses = trousers && trouserLaborPrice !== null ? trouserCostsTotal(fabricCosts, trouserLaborPrice) : null;
  const expenseAmount = automaticCosts ? djellabaCostsTotal(garmentCosts) : trousers && !manualExpenses ? suggestedExpenses : data.expenseAmount;
  const profit = totalPrice !== null && expenseAmount !== null ? tailoringProfitAmount(totalPrice, expenseAmount) : null;
  const remaining = totalPrice === null ? null : tailoringRemainingAmount(totalPrice, data.paidAmount);
  const money = value => value === null ? "—" : new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const inputClass = "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-primary-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800";
  const props = name => ({ id: fieldId(name), className: inputClass, "aria-invalid": Boolean(fields[name]), "aria-describedby": fields[name] ? `${fieldId(name)}-error` : undefined });
  const patch = value => { setData(current => ({ ...current, ...value })); setFields({}); setError(""); };
  const patchItem = (lineId, value) => { setData(current => ({ ...current, items: current.items.map(item => item.lineId === lineId ? { ...item, ...value } : item) })); setFields({}); setError(""); };
  const removeItem = lineId => { if (!cameraBusy && !savingRef.current) { setData(current => ({ ...current, items: current.items.length > 1 ? current.items.filter(item => item.lineId !== lineId) : current.items })); setFields({}); setError(""); } };
  const reloadFabrics = () => { setInventory(current => ({ ...current, loading: true, error: false })); setAttempt(value => value + 1); };
  useEffect(() => {
    const dialog = dialogRef.current; dialog.showModal(); dialog.querySelector("#fesla-clientName")?.focus();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadFabrics(token, controller.signal).then(value => {
      if (!Array.isArray(value.fabrics)) throw new Error("Invalid fabrics response");
      if (!controller.signal.aborted) setInventory({ fabrics: value.fabrics, loading: false, error: false });
    }).catch(() => { if (!controller.signal.aborted) setInventory({ fabrics: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [token, attempt]);
  useEffect(() => {
    if (!automaticCosts && !trousers) return;
    const controller = new AbortController();
    loadDjellabaCostSettings(token, controller.signal, garmentType).then(value => {
      if (!controller.signal.aborted) setCostResult({ token, attempt: costAttempt, value, loading: false });
    }).catch(() => { if (!controller.signal.aborted) setCostResult({ token, attempt: costAttempt, loading: false, error: true }); });
    return () => controller.abort();
  }, [token, automaticCosts, trousers, costAttempt, garmentType]);
  const close = () => { if (!savingRef.current) { dialogRef.current.close(); onClose(); } };
  const submit = async event => {
    event.preventDefault();
    if (savingRef.current || cameraBusy) return;
    if (trousers && !order && !costState.value) { setError("costSettingsFailed"); return; }
    let input;
    try { input = validateTailoringOrder(automaticCosts ? { ...data, automaticCosting: true, costSettingsVersion, items: pricedItems } : trousers ? { ...data, expenseAmount, fabricCosting: true, laborCosting: true, costSettingsVersion: trouserSettingsVersion, items: pricedItems } : data); }
    catch (failure) { setFields(failure.fields || {}); setError("invalidOrder"); dialogRef.current.querySelector(`#${fieldId(Object.keys(failure.fields || {})[0] || "clientName")}`)?.focus(); return; }
    const files = data.items.map(item => item.selection?.file);
    if (files.reduce((sum, file) => sum + (file?.size || 0), 0) > 25 * 1024 * 1024) { setError("imagesTotalTooLarge"); return; }
    const fingerprint = JSON.stringify(input);
    if (!order && (submissionRef.current?.fingerprint !== fingerprint || files.some((file, index) => file !== submissionRef.current?.files[index]))) submissionRef.current = { fingerprint, files, requestId: crypto.randomUUID() };
    savingRef.current = true; setSaving(true); setError(""); setFields({});
    try {
      const saved = await saveTailoringOrder(input, data.items, false, token, order, submissionRef.current?.requestId);
      if (dialogRef.current?.open) { dialogRef.current.close(); onSaved(saved); }
    } catch (failure) {
      if (dialogRef.current?.open) {
        const code = failure.response?.data?.message;
        setError(["invalidOrder", "invalidRequest", "requestConflict", "fabricNotFound", "notFound", "forbidden", "conflict", "imageTooLarge", "imagesTotalTooLarge", "imageTypeInvalid", "imageUploadInvalid", "itemsRequired", "costSettingsRequired", "costSettingsChanged", "fabricPriceMissing", "fabricPriceChanged"].includes(code) ? code : "saveFailed");
        setFields(failure.response?.data?.fields || {});
      }
    } finally { savingRef.current = false; if (dialogRef.current?.open) setSaving(false); }
  };
  return <><dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="fesla-form-title" onCancel={event => { event.preventDefault(); close(); }} className="fixed top-4 right-4 bottom-auto left-auto m-auto max-h-[90dvh] w-[calc(100dvw-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:inset-0">
    <header className="mb-5 flex items-center justify-between gap-3"><h2 id="fesla-form-title" className="text-xl font-bold">{garmentText(order ? "edit" : "add")}</h2><button type="button" disabled={saving} onClick={close} aria-label={t("dialog.close")} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><IoCloseOutline size={24} /></button></header>
    <form noValidate onSubmit={submit} className="space-y-5">
      <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field name="clientName" label={t("fesla.clientName")} error={fields.clientName}><input {...props("clientName")} value={data.clientName} onChange={event => patch({ clientName: event.target.value })} maxLength={160} autoComplete="name" required /></Field>
        <Field name="phone" label={t("fesla.phone")} error={fields.phone}><input {...props("phone")} type="tel" dir="ltr" value={data.phone} onChange={event => patch({ phone: event.target.value })} maxLength={40} autoComplete="tel" required /></Field>
        <Field name="orderDate" label={t("fesla.orderDate")} error={fields.orderDate}><input {...props("orderDate")} type="date" dir="ltr" value={data.orderDate} onChange={event => patch({ orderDate: event.target.value })} required /></Field>
        <Field name="readyDate" label={t("fesla.readyDate")} error={fields.readyDate}><input {...props("readyDate")} type="date" dir="ltr" min={data.orderDate} value={data.readyDate} onChange={event => patch({ readyDate: event.target.value })} required /></Field>
      </fieldset>
      {(automaticCosts || trousers) && <section className="fesla-costs-notice"><p>{costText(order && trousers || order?.costing ? "savedPricesHint" : "automaticHint")}</p>{!(order && trousers) && !order?.costing && (costState.loading ? <p role="status">{t("common.loading")}</p> : costState.error ? <p role="alert">{t("fesla.errors.costSettingsFailed")}</p> : !costRates && !trousers && <p role="alert">{t("fesla.errors.costSettingsRequired")}</p>)}<div>{costState.value?.canEdit && <button type="button" data-edit-cost-settings disabled={saving} onClick={() => setSettingsEditor(true)}>{costText("settingsTitle")}</button>}{!(order && trousers) && !order?.costing && <button type="button" disabled={saving} onClick={() => { setCostAttempt(value => value + 1); reloadFabrics(); }}>{costText("reloadPrices")}</button>}</div></section>}
      <div className="fesla-items-heading"><div><h3>{garmentText("orderGarments")}</h3><p>{garmentText("garmentsHint")}</p></div><span>{garmentText("garmentsCount", { count: data.items.length })}</span></div>
      <div className="space-y-5">{pricedItems.map((item, index) => <TailoringOrderItemForm costPreview={trousers ? fabricCosts[index] : garmentCosts[index]} garmentType={garmentType} key={item.lineId} item={item} index={index} savedItem={savedItems.find(saved => saved.lineId === item.lineId)} order={order} token={token} inventory={inventory} reloadFabrics={reloadFabrics} errors={fields} onChange={patchItem} onRemove={removeItem} onCameraBusy={cameraChanged} disabled={saving} canRemove={data.items.length > 1 && !cameraBusy} />)}</div>
      <button type="button" data-add-tailoring-item className="fesla-add-item" disabled={saving || cameraBusy || data.items.length >= MAX_TAILORING_ITEMS} onClick={() => patch({ items: [...data.items, newItem(garmentType)] })}><IoAddOutline size={21} aria-hidden="true" />{garmentText("addGarment")}</button>
      <fieldset disabled={saving} className="grid min-w-0 gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-700">
        <legend className="px-2 text-sm font-bold">{t("fesla.payment")}</legend>
        <div className="fesla-form-total"><label htmlFor="fesla-totalPrice">{t("fesla.totalPrice")}</label><output id="fesla-totalPrice" aria-live="polite"><bdi>{money(totalPrice)} {t("fesla.currency")}</bdi></output>{fields.totalPrice && <p role="alert">{t(`fesla.errors.${fields.totalPrice}`)}</p>}</div>
        <Field name="paidAmount" label={`${t("fesla.paidAmount")} (${t("fesla.currency")})`} error={fields.paidAmount}><input {...props("paidAmount")} type="text" inputMode="decimal" dir="ltr" value={data.paidAmount} onChange={event => patch({ paidAmount: event.target.value })} maxLength={12} required /></Field>
        {withExpenses && <Field name="expenseAmount" label={t("fesla.expenseAmount") + " (" + t("fesla.currency") + ")"} error={fields.expenseAmount}><input {...props("expenseAmount")} type="text" inputMode="decimal" dir="ltr" value={expenseAmount ?? ""} onChange={event => { setManualExpenses(true); patch({ expenseAmount: event.target.value }); }} placeholder="0.00" maxLength={12} required /><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t(trousers ? "fesla.trousers.editableExpenseHint" : "fesla.expenseHint")}</p>{trousers && <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300"><p>{t("fesla.trousers.suggestedFabricCost")}: <bdi data-fabric-expenses={fabricTotal ?? ""}>{money(fabricTotal)} {t("fesla.currency")}</bdi></p><p>{t("fesla.trousers.suggestedLaborCost")}: <bdi data-labor-expenses={trouserLaborPrice === null ? "" : Number((trouserLaborPrice * data.items.length).toFixed(2))}>{money(trouserLaborPrice === null ? null : trouserLaborPrice * data.items.length)} {t("fesla.currency")}</bdi></p><p>{t("fesla.trousers.suggestedExpenses")}: <bdi data-suggested-expenses={suggestedExpenses ?? ""}>{money(suggestedExpenses)} {t("fesla.currency")}</bdi></p>{manualExpenses && <button type="button" data-use-fabric-cost disabled={suggestedExpenses === null} className="rounded-lg border border-blue-200 px-3 py-2 font-bold text-blue-700 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300" onClick={() => { setManualExpenses(false); setFields({}); setError(""); }}>{t("fesla.trousers.useSuggestedExpenses")}</button>}</div>}</Field>}
        {automaticCosts && <div className="fesla-form-total"><label htmlFor="fesla-expenseAmount">{t("fesla.expenseAmount")}</label><output id="fesla-expenseAmount" aria-live="polite" data-order-expenses={expenseAmount ?? ""}><bdi>{money(expenseAmount)} {t("fesla.currency")}</bdi></output><p>{costText("expenseHint")}</p></div>}
        {(automaticCosts || withExpenses) && <div className={"fesla-form-profit" + (profit < 0 ? " is-loss" : "")}><label htmlFor="fesla-profitAmount">{t("fesla.profitAmount")}</label><output id="fesla-profitAmount" aria-live="polite" data-order-profit={profit ?? ""}><bdi>{money(profit)} {t("fesla.currency")}</bdi></output><p>{t("fesla.profitHint")}</p></div>}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-800 sm:col-span-2 dark:bg-blue-950/40 dark:text-blue-200"><label htmlFor="fesla-remainingAmount">{t("fesla.remainingAmount")}</label><output id="fesla-remainingAmount" aria-live="polite"><bdi>{money(remaining)} {t("fesla.currency")}</bdi></output></div>
      </fieldset>
      {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{t(`fesla.errors.${error}`)}{["fabricNotFound", "fabricPriceMissing", "fabricPriceChanged"].includes(error) && <button type="button" disabled={saving} onClick={reloadFabrics} className="ms-2 font-bold underline">{t("fabrics.reloadStock")}</button>}</div>}
      <footer className="flex flex-wrap justify-end gap-3"><button type="button" disabled={saving} onClick={close} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold dark:border-slate-700">{t("common.cancel")}</button><button type="submit" disabled={saving || cameraBusy || trousers && !order && (costState.loading || costState.error)} className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">{t(saving ? "common.loading" : "fesla.save")}</button></footer>
    </form>
  </dialog>{settingsEditor && <DjellabaSettingsDialog garmentType={garmentType} token={token} onClose={() => setSettingsEditor(false)} onSaved={value => { setSettingsEditor(false); setCostResult({ token, attempt: costAttempt, value, loading: false }); setFields({}); setError(""); }} />}</>;
}
