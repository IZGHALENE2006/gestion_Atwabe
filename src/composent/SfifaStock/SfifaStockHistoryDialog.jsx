import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoPersonOutline, IoTimeOutline } from "react-icons/io5";
import { SFIFA_STOCK_FAMILIES, SFIFA_STOCK_SCALE, formatSfifaCode, sfifaQuantityUnits } from "../../../shared/sfifaStock.js";
import { loadSfifaRestocks } from "./sfifaStockApi.js";

export default function SfifaStockHistoryDialog({ stock, token, onClose }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const scope = `${token}:${stock.parentId}:${stock._id}:${attempt}`;
  const state = result?.scope === scope ? result : { loading: true, entries: [], error: "" };
  const total = state.entries.reduce((sum, entry) => sum + (sfifaQuantityUnits(entry.quantity) ?? 0), 0) / SFIFA_STOCK_SCALE;
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const date = value => { const time = new Date(value); return Number.isNaN(time.getTime()) ? "—" : time.toLocaleDateString(locale); };
  const time = value => { const time = new Date(value); return Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString(locale); };
  useEffect(() => {
    const dialog = dialogRef.current; dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadSfifaRestocks(stock, token, controller.signal).then(data => {
      if (!Array.isArray(data.entries)) throw new Error("Invalid stock history response");
      if (!controller.signal.aborted) setResult({ ...data, scope, loading: false, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ scope, entries: [], loading: false, error: error.response?.status === 403 ? "forbidden" : error.response?.status === 404 ? "notFound" : "loadHistoryFailed" });
    });
    return () => controller.abort();
  }, [stock, token, scope]);
  const close = () => { dialogRef.current.close(); onClose(); };
  return <dialog ref={dialogRef} dir={i18n.dir()} className="sfifa-dialog sfifa-history-dialog" aria-labelledby="sfifa-history-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header>
      <div><h2 id="sfifa-history-title"><IoTimeOutline size={23} />{t("sfifaStock.historyTitle")}</h2>
        <p>{t(`sfifaStock.widths.${stock.width}`)} · <bdi dir="ltr">{SFIFA_STOCK_FAMILIES.find(family => family.value === stock.family)?.label}</bdi> · {stock.isUnassigned ? t("sfifaStock.unassigned") : <bdi dir="ltr">{formatSfifaCode(stock.code, stock.family)}</bdi>}</p>
      </div>
      <button type="button" onClick={close} aria-label={t("dialog.close")}><IoCloseOutline size={24} /></button>
    </header>
    <div className="sfifa-history-body">
      {state.loading && <p role="status" className="sfifa-history-empty">{t("common.loading")}</p>}
      {state.error && <div role="alert" className="sfifa-dialog-error"><p>{t(`sfifaStock.errors.${state.error}`)}</p><button type="button" data-retry-sfifa-history onClick={() => setAttempt(value => value + 1)}>{t("sfifaStock.retry")}</button></div>}
      {!state.loading && !state.error && <>
        <dl className="sfifa-balance-preview sfifa-history-summary"><div><dt>{t("sfifaStock.historyCount")}</dt><dd data-sfifa-history-count>{number(state.entries.length)}</dd></div><div><dt>{t("sfifaStock.historyTotal")}</dt><dd data-sfifa-history-total data-value={total}><bdi>{number(total)} {t("sfifaStock.unit")}</bdi></dd></div></dl>
        {state.hasUnassignedHistory && <p className="sfifa-history-note">{t("sfifaStock.historyLegacyNote")}</p>}
        {state.entries.length ? <>
          <p className="sfifa-history-hint">{t("sfifaStock.historyHint")}</p>
          <p className="sfifa-history-scroll-hint">{t("sfifaStock.scrollTable")}</p>
          <div className="sfifa-history-scroll" tabIndex={0} role="region" aria-label={t("sfifaStock.history")}>
            <table className="sfifa-history-table"><caption className="sr-only">{t("sfifaStock.historyTitle")}</caption><thead><tr>{["historyDate", "historyQuantity", "historySource", "historyWorker"].map(key => <th key={key} scope="col">{t(`sfifaStock.${key}`)}</th>)}</tr></thead>
              <tbody>{state.entries.map((entry, index) => <tr key={`${entry.date}:${index}`} data-sfifa-receipt data-source={entry.source}>
                <td><time dateTime={entry.date}><span>{date(entry.date)}</span><small>{time(entry.date)}</small></time></td>
                <td className="sfifa-history-meters" data-sfifa-receipt-quantity data-value={entry.quantity}><bdi dir="ltr">+{number(entry.quantity)} {t("sfifaStock.unit")}</bdi></td>
                <td><span className={`sfifa-source-badge is-${entry.source}`}>{entry.source === "worker" && <IoPersonOutline size={16} />}{t(entry.source === "worker" ? "sfifaStock.historyProduction" : "sfifaStock.historyManual")}</span></td>
                <td className="sfifa-history-worker">{entry.source === "worker" ? entry.workerName || t("sfifaStock.historyUnknownWorker") : "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </> : <p className="sfifa-history-empty">{t("sfifaStock.historyEmpty")}</p>}
      </>}
    </div>
    <footer><button type="button" onClick={close}>{t("dialog.close")}</button></footer>
  </dialog>;
}
