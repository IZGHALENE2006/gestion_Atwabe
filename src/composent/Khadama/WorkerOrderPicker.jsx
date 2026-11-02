import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { tailoringGarmentType } from "../../../shared/tailoring.js";
import WorkerBlockingNotice from "./WorkerBlockingNotice.jsx";
import { loadWorkerOrderOptions } from "./workersApi.js";

export default function WorkerOrderPicker({ token, workerId, category, orderId, lineIds, onChange, disabled, fields, fixedOrder = false, garmentType, trouserType }) {
  const { t } = useTranslation();
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const scope = `${token}:${workerId}:${category}:${garmentType || ""}:${attempt}`;
  const state = result?.scope === scope ? result : { orders: [], loading: true, error: "" };
  useEffect(() => {
    const controller = new AbortController();
    loadWorkerOrderOptions(token, workerId, category, controller.signal, garmentType).then(data => {
      if (!Array.isArray(data.orders)) throw new Error("Invalid orders response");
      if (!controller.signal.aborted) setResult({ scope, orders: data.orders, loading: false, error: "" });
    }).catch(error => { if (!controller.signal.aborted) setResult({ scope, orders: [], loading: false, error: error.response?.status === 403 ? "forbidden" : "loadOrdersFailed" }); });
    return () => controller.abort();
  }, [token, workerId, category, scope, garmentType]);
  const orders = state.orders.map(order => ({ ...order, items: order.items.filter(item => !trouserType || item.trouserType === trouserType) })).filter(order => order.items.length);
  const selected = orders.find(order => order._id === orderId);
  const availableOrders = fixedOrder ? orders.filter(order => order._id === orderId) : orders;
  const errorFor = key => fields[key] && <p id={`worker-work-${key}-error`} className="work-field-error">{t(`workers.work.errors.${fields[key]}`)}</p>;
  return <div className="worker-order-picker">
    <div className="work-field"><label htmlFor="worker-work-orderId">{t("workers.work.chooseOrder")}</label><select id="worker-work-orderId" className="work-input" value={orderId} disabled={disabled || fixedOrder || state.loading || Boolean(state.error)} onChange={event => { const order = orders.find(entry => entry._id === event.target.value); onChange({ orderId: order?._id || "", lineIds: order?.items.filter(item => item.available).map(item => item.lineId) || [] }); }} aria-invalid={Boolean(fields.orderId)} aria-describedby={fields.orderId ? "worker-work-orderId-error" : undefined}><option value="">{t(state.loading ? "common.loading" : "workers.work.chooseOrderPlaceholder")}</option>{availableOrders.map(order => <option key={order._id} value={order._id}>{order.clientName}{(category === "mesbanto" || tailoringGarmentType(order) !== "djellaba") ? " · " + t("fesla.garmentTypes." + tailoringGarmentType(order)) : ""} · {order.barcode}{!order.items.some(item => item.available) ? ` · ${t("workers.work.blockedOrder")}` : ""}</option>)}</select>{errorFor("orderId")}</div>
    {state.error ? <p role="alert" className="work-field-error">{t(`workers.work.errors.${state.error}`)} <button type="button" disabled={disabled} onClick={() => setAttempt(value => value + 1)} className="work-text-button">{t("workers.retry")}</button></p> : !state.loading && !availableOrders.length && <p className="work-field-hint">{t("workers.work.noAvailableOrders")}</p>}
    {selected && <fieldset id="worker-work-lineIds" tabIndex={-1} className="worker-garment-choices" aria-describedby={fields.lineIds ? "worker-work-lineIds-error" : undefined}><legend>{t("workers.work.chooseGarments")}</legend>{selected.items.map(item => <label key={item.lineId} className={!item.available ? "is-unavailable" : ""}><input type="checkbox" disabled={disabled || !item.available} checked={lineIds.includes(item.lineId)} onChange={event => onChange({ lineIds: event.target.checked ? [...lineIds, item.lineId] : lineIds.filter(id => id !== item.lineId) })} /><span><strong>{t(tailoringGarmentType(selected) === "djellaba" ? "fesla.garmentNumber" : "fesla." + tailoringGarmentType(selected) + ".garmentNumber", { number: item.number })} · <span dir="auto">{item.fabricType}{item.fabricColor ? ` · ${item.fabricColor}` : ""}</span></strong>{item.sfifa?.width && <small>{t(`fesla.widths.${item.sfifa.width}`)} · {t(`fesla.styles.${item.sfifa.style}`)}</small>}{item.trouserType && <small>{t("fesla.trouserTypes." + item.trouserType)}</small>}{item.shirtType && <small>{t("fesla.shirtType")}: <bdi>{item.shirtType}</bdi></small>}{item.blockedBy?.length ? <WorkerBlockingNotice blockers={item.blockedBy} /> : !item.available && <small>{t("workers.work.alreadyAssigned")}</small>}</span></label>)}{errorFor("lineIds")}</fieldset>}
  </div>;
}
