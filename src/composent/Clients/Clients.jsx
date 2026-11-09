import useSearchTarget from "../../hooks/useSearchTarget.js";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoBusinessOutline, IoCreateOutline, IoPeopleOutline, IoPersonOutline, IoSearchOutline } from "react-icons/io5";
import { CLIENT_TYPES, filterClients, normalizeClientWebsite } from "../../../shared/clients.js";
import { loadClients } from "./clientsApi.js";
import ClientForm from "./ClientForm.jsx";

function Website({ value }) {
  let href;
  try { href = normalizeClientWebsite(value); } catch { href = ""; }
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" dir="ltr" className="break-all text-primary-700 underline decoration-primary-300 underline-offset-4 dark:text-primary-400">{value}</a> : <span>{value || "—"}</span>;
}

function ClientType({ type }) {
  const { t } = useTranslation();
  const Icon = type === "company" ? IoBusinessOutline : IoPersonOutline;
  return <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon size={14} />{t(`clients.types.${type}`)}</span>;
}

export default function Clients() {
  const matchesSearchTarget = useSearchTarget();
  const { t, i18n } = useTranslation();
  const token = useSelector((state) => state.LoginAdmin.token);
  const [result, setResult] = useState({ token: null, clients: [], permissions: {}, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [editor, setEditor] = useState(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    loadClients(controller.signal).then((data) => {
      if (!Array.isArray(data.clients)) throw new Error("Invalid clients response");
      if (!controller.signal.aborted) setResult({ ...data, token, loading: false, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ token, clients: [], permissions: {}, loading: false, error: error.response?.status === 403 ? "forbidden" : "loadFailed" });
    });
    return () => controller.abort();
  }, [token, attempt]);
  const state = result.token === token ? result : { clients: [], permissions: {}, loading: true, error: "" };
  const visible = filterClients(state.clients.filter(matchesSearchTarget), search, type);
  const retry = () => { setResult((current) => ({ ...current, loading: true, error: "" })); setAttempt((value) => value + 1); };
  const edit = (client) => { setEditor({ client, token }); setStatus(""); };
  const saved = (client) => {
    setResult((current) => ({ ...current, clients: [...current.clients.filter((entry) => entry._id !== client._id), client].sort((a, b) => a.name.localeCompare(b.name, i18n.language)) }));
    setStatus(editor.client ? "updated" : "added");
    setEditor(null);
    setSearch("");
    setType("all");
  };
  const editButton = (client) => state.permissions.update && <button type="button" onClick={() => edit(client)} aria-label={t("clients.editNamed", { name: client.name })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-primary-400 hover:text-primary-700 dark:border-slate-700 dark:text-slate-200"><IoCreateOutline size={19} />{t("clients.editAction")}</button>;
  if (!token) return <Navigate to="/LoginChoise" replace />;

  return <main dir={i18n.dir()} className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-8">
    <div className="mx-auto max-w-7xl space-y-6 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold">{t("clients.title")}</h1><p className="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">{t("clients.subtitle")}</p></div>
        {state.permissions.add && <button type="button" onClick={() => edit(null)} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700"><IoAddOutline size={21} />{t("clients.add")}</button>}
      </header>
      {status && <p role="status" className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300">{t(`clients.${status}`)}</p>}
      {!state.loading && !state.error && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["total", state.clients.length, IoPeopleOutline], ...CLIENT_TYPES.map((key) => [key, state.clients.filter((client) => client.type === key).length, key === "company" ? IoBusinessOutline : IoPersonOutline])].map((stat) => { const [key, count, Icon] = stat; return <div key={key} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><Icon size={25} className="text-slate-400" /><div><p className="text-sm text-slate-500 dark:text-slate-400">{t(key === "total" ? "clients.total" : `clients.types.${key}`)}</p><p className="mt-1 text-2xl font-bold">{count}</p></div></div>; })}
      </div>}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:flex-row">
        <div className="relative min-w-0 flex-1"><IoSearchOutline size={20} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" aria-label={t("clients.search")} placeholder={t("clients.search")} value={search} onChange={(event) => setSearch(event.target.value)} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 py-3 pe-3 ps-10 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800" /></div>
        <select value={type} onChange={(event) => setType(event.target.value)} aria-label={t("clients.filterType")} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800"><option value="all">{t("clients.allTypes")}</option>{CLIENT_TYPES.map((value) => <option key={value} value={value}>{t(`clients.types.${value}`)}</option>)}</select>
      </div>
      {state.loading && <p role="status" className="p-8 text-center text-slate-500">{t("common.loading")}</p>}
      {state.error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><p>{t(`clients.errors.${state.error}`)}</p><button type="button" onClick={retry} className="mt-3 font-bold underline">{t("clients.retry")}</button></div>}
      {!state.loading && !state.error && <>
        {visible.length > 0 ? <>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block">
            <table className="w-full min-w-[900px] text-start text-sm">
              <caption className="sr-only">{t("clients.title")}</caption>
              <thead className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><tr>{["name", "contact", "address", "cin", "website", "actions"].map((key) => <th key={key} scope="col" className="px-5 py-4 text-start font-semibold">{t(`clients.fields.${key}`)}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visible.map((client) => <tr key={client._id} data-client-id={client._id} className="align-top">
                <td className="max-w-56 px-5 py-4"><p dir="auto" className="mb-2 break-words font-bold">{client.name}</p><ClientType type={client.type} /></td>
                <td className="px-5 py-4"><p className="whitespace-nowrap"><bdi dir="ltr">{client.phone}</bdi></p>{client.fax && <p className="mt-2 text-xs text-slate-500">{t("clients.fields.fax")}: <bdi dir="ltr">{client.fax}</bdi></p>}</td>
                <td className="max-w-64 whitespace-pre-line break-words px-5 py-4"><bdi>{client.address}</bdi></td>
                <td className="max-w-40 break-words px-5 py-4"><bdi dir="ltr">{client.cin || "—"}</bdi></td>
                <td className="max-w-48 px-5 py-4"><Website value={client.website} /></td>
                <td className="px-5 py-4">{editButton(client)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-4 md:hidden">{visible.map((client) => <article key={client._id} data-client-id={client._id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 dir="auto" className="mb-2 break-words text-lg font-bold">{client.name}</h2><ClientType type={client.type} />
            <dl className="my-4 space-y-3 text-sm">{["address", "phone", "fax", "cin", "website"].map((key) => <div key={key}><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t(`clients.fields.${key}`)}</dt><dd className="whitespace-pre-line break-words">{key === "website" ? <Website value={client.website} /> : <bdi dir={key === "address" ? "auto" : "ltr"}>{client[key] || "—"}</bdi>}</dd></div>)}</dl>
            {editButton(client)}
          </article>)}</div>
        </> : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><IoPeopleOutline size={36} className="mx-auto mb-3 text-slate-400" /><p className="font-semibold">{t(state.clients.length ? "clients.noResults" : "clients.empty")}</p><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t(state.clients.length ? "clients.searchHint" : "clients.emptyHint")}</p></div>}
      </>}
    </div>
    {editor && editor.token === token && <ClientForm key={editor.client?._id || "new"} client={editor.client} onClose={() => setEditor(null)} onSaved={saved} />}
  </main>;
}
