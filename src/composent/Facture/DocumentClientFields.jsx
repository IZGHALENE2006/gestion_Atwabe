import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadClients } from "../Clients/clientsApi.js";

export default function DocumentClientFields({ clientId, clientName, onChange, inputClass }) {
  const { t } = useTranslation();
  const [clients, setClients] = useState([]);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const nameRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    loadClients(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(data?.clients)) throw new Error("Invalid client list");
      setClients(data.clients);
      setStatus("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setStatus("error");
    });
    return () => controller.abort();
  }, [attempt]);

  const selectClient = (event) => {
    const client = clients.find((item) => item._id === event.target.value);
    onChange({ clientId: client?._id || "", clientName: client?.name || "" });
    if (!client) nameRef.current?.focus();
  };

  return (
    <div className="grid min-w-0 gap-4 md:col-span-2 md:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor="invoice-saved-client" className="block text-sm font-bold mb-2">{t("documentClient.select")}</label>
        <select id="invoice-saved-client" value={clientId} onChange={selectClient} disabled={status !== "ready"} aria-describedby="invoice-client-list-hint" className={`${inputClass} disabled:opacity-60`}>
          <option value="">{status === "loading" ? t("common.loading") : t("documentClient.manual")}</option>
          {clients.map((client) => <option key={client._id} value={client._id} dir="auto">{client.name}{client.phone ? ` — ${client.phone}` : ""}</option>)}
        </select>
        <div id="invoice-client-list-hint" className="mt-2 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          {status === "error" ? <><span role="alert">{t("documentClient.loadFailed")}</span>{" "}<button type="button" className="font-bold text-primary-600 underline" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>{t("clients.retry")}</button></>
            : status === "ready" && clients.length === 0 ? t("documentClient.empty") : t("documentClient.selectHint")}
        </div>
      </div>
      <div className="min-w-0">
        <label htmlFor="invoice-client" className="block text-sm font-bold mb-2">{t("invoiceCreate.clientName")}</label>
        <input ref={nameRef} id="invoice-client" value={clientName} onChange={(event) => onChange({ clientId: "", clientName: event.target.value })} maxLength={160} aria-describedby="invoice-client-name-hint" className={inputClass} />
        <p id="invoice-client-name-hint" className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("documentClient.nameHint")}</p>
      </div>
    </div>
  );
}
