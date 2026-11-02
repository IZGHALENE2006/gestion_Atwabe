import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { IoAddOutline, IoArrowBackOutline, IoDocumentTextOutline, IoDownloadOutline, IoSearchOutline } from "react-icons/io5";
import { supplierInvoiceStatus } from "../../../shared/supplierInvoices.js";
import SupplierInvoiceForm from "./SupplierInvoiceForm.jsx";
import SupplierPaymentForm from "./SupplierPaymentForm.jsx";
import { addSupplierInvoice, addSupplierPayment, getSupplierInvoices } from "./supplierInvoiceApi.js";
import { generateSupplierInvoicePDF } from "./supplierInvoicePDF.js";
import { usePdfExport } from "../../utils/usePdfExport.js";

const money = (value) => <bdi dir="ltr">{Number(value || 0).toFixed(2)} DH</bdi>;
const panelClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900";

function SupplierLedger({ id, token }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [products, setProducts] = useState([]);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [success, setSuccess] = useState("");
  const { exportPdf, isExporting, exportError } = usePdfExport(generateSupplierInvoicePDF);

  useEffect(() => {
    const controller = new AbortController();
    getSupplierInvoices(id, controller.signal).then((result) => {
      setData(result); setLoadError("");
    }).catch((error) => { if (!controller.signal.aborted) setLoadError(error.response?.data?.message === "notFound" ? "notFound" : "loadFailed"); });
    return () => controller.abort();
  }, [id, reload]);

  useEffect(() => {
    if (!adding) return;
    const controller = new AbortController();
    axios.get("http://localhost:7000/Product/Get", { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } })
      .then((response) => setProducts(Array.isArray(response.data) ? response.data : []))
      .catch(() => { /* Manual invoice lines remain available if stock lookup fails. */ });
    return () => controller.abort();
  }, [adding, token]);

  const back = <Link to="/Home/Fornisseur" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 dark:text-primary-400"><IoArrowBackOutline className={i18n.dir() === "rtl" ? "rotate-180" : ""} />{t("supplierInvoices.back")}</Link>;
  if (!data) return <div dir={i18n.dir()} className="space-y-5 p-6">
    {back}
    {loadError ? <div role="alert" className={panelClass}><p>{t(`supplierInvoices.errors.${loadError}`)}</p><button onClick={() => setReload((count) => count + 1)} className="mt-3 font-bold text-primary-600">{t("supplierInvoices.retry")}</button></div> : <p role="status">{t("common.loading")}</p>}
  </div>;

  const { supplier, invoices, summary } = data;
  const selected = invoices.find((invoice) => invoice._id === selectedId);
  const query = search.trim().toLocaleLowerCase();
  const filtered = invoices.filter((invoice) => (status === "all" || supplierInvoiceStatus(invoice) === status) &&
    [invoice.reference, invoice._id, ...invoice.items.map((item) => item.name)].some((text) => String(text || "").toLocaleLowerCase().includes(query)));

  async function saveInvoice(payload) {
    const result = await addSupplierInvoice(id, payload);
    setData(result); setAdding(false); setSearch(""); setStatus("all");
    setSelectedId(result.invoices.find((invoice) => invoice.requestId === payload.requestId)?._id);
    setSuccess(t("supplierInvoices.saved"));
  }

  async function savePayment(payload) {
    try {
      const result = await addSupplierPayment(id, selected._id, payload);
      setData(result); setSuccess(t("supplierInvoices.paymentSaved"));
    } catch (error) {
      if (error.response?.status === 409) setReload((count) => count + 1);
      throw error;
    }
  }

  return <div dir={i18n.dir()} className="min-h-screen space-y-6 bg-slate-50 p-4 text-slate-900 dark:bg-[#1e293b] dark:text-slate-100 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary-600 dark:text-primary-400">{t("supplierInvoices.title")}</p>
          <h1 className="mt-1 text-3xl font-bold"><bdi>{supplier.name}</bdi></h1>
          <p className="mt-2 break-all text-xs text-slate-500 dark:text-slate-400">{t("supplierInvoices.supplierId")}: <bdi dir="ltr">{supplier._id}</bdi></p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400"><bdi>{[supplier.phone, supplier.Ville].filter(Boolean).join(" · ")}</bdi></p>
        </div>
        {!adding && <button onClick={() => { setAdding(true); setSuccess(""); }} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 font-bold text-white hover:bg-primary-700"><IoAddOutline size={22} />{t("supplierInvoices.add")}</button>}
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {[["total", summary.total], ["amountPaid", summary.paid], ["remaining", summary.remaining]].map(([key, value]) => <div key={key} className={panelClass}>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t(`supplierInvoices.${key}`)}</p>
          <p className={`mt-2 text-2xl font-bold ${key === "remaining" ? "text-amber-700 dark:text-amber-400" : key === "amountPaid" ? "text-primary-600 dark:text-primary-400" : ""}`}>{money(value)}</p>
        </div>)}
      </div>
      {success && <p role="status" className="rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">{success}</p>}
      {loadError && <p role="alert" className="text-sm text-rose-600">{t(`supplierInvoices.errors.${loadError}`)}</p>}
      {adding ? <SupplierInvoiceForm products={products} onSave={saveInvoice} onCancel={() => setAdding(false)} /> : <>
        <section className={panelClass}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{t("supplierInvoices.invoiceCount", { count: invoices.length })}</h2>
            <div className="flex flex-wrap gap-3">
              <div className="relative"><IoSearchOutline className="pointer-events-none absolute start-3 top-3.5 text-slate-400" /><input aria-label={t("supplierInvoices.search")} placeholder={t("supplierInvoices.search")} value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pe-3 ps-9 text-sm dark:border-slate-700 dark:bg-slate-800" /></div>
              <select aria-label={t("supplierInvoices.status")} value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-800">{["all", "unpaid", "partial", "paid"].map((value) => <option key={value} value={value}>{t(`supplierInvoices.${value}`)}</option>)}</select>
            </div>
          </div>
          {filtered.length === 0 ? <div className="py-12 text-center text-slate-500 dark:text-slate-400"><IoDocumentTextOutline size={36} className="mx-auto mb-3" /><p>{t(invoices.length ? "supplierInvoices.noResults" : "supplierInvoices.empty")}</p></div> : <div className="space-y-3">
            {filtered.map((invoice) => <button key={invoice._id} onClick={() => { setSelectedId(invoice._id); setSuccess(""); }} aria-expanded={selectedId === invoice._id} className={`grid w-full gap-4 rounded-xl border p-4 text-start transition-colors sm:grid-cols-[2fr_1fr_1fr_1fr] ${selectedId === invoice._id ? "border-primary-500 bg-primary-50/50 dark:bg-primary-900/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
              <div className="min-w-0"><p className="break-words font-bold"><bdi>{invoice.reference || `#${invoice._id.slice(-8).toUpperCase()}`}</bdi></p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400"><bdi dir="ltr">{invoice.invoiceDate}</bdi> · {t(`supplierInvoices.${supplierInvoiceStatus(invoice)}`)}</p></div>
              {[["total", invoice.total], ["amountPaid", invoice.amountPaid], ["remaining", invoice.total - invoice.amountPaid]].map(([key, value]) => <div key={key}><p className="text-xs text-slate-500 dark:text-slate-400">{t(`supplierInvoices.${key}`)}</p><p className="mt-1 font-semibold">{money(value)}</p></div>)}
            </button>)}
          </div>}
        </section>
        {selected && <section className={`${panelClass} space-y-6`} aria-label={t("supplierInvoices.details")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-bold">{t("supplierInvoices.details")} <bdi>{selected.reference}</bdi></h2><p className="mt-2 text-sm"><bdi>{selected.supplierName}</bdi> · <bdi dir="ltr">{selected.invoiceDate}</bdi></p><p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{t("supplierInvoices.invoiceId")}: <bdi dir="ltr">{selected._id}</bdi></p></div>
            <button disabled={isExporting} onClick={() => exportPdf({ supplier, invoice: selected })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold dark:border-slate-700"><IoDownloadOutline size={18} />{isExporting ? t("salesPdf.exporting") : "PDF"}</button>
          </div>
          {exportError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{exportError}</p>}
          <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"><tr>{["product", "quantity", "unitPrice", "total"].map((key) => <th key={key} className="px-3 py-3 text-start">{t(`supplierInvoices.${key}`)}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{selected.items.map((item, index) => <tr key={index}><td className="px-3 py-4"><bdi>{item.name}</bdi></td><td className="px-3 py-4"><bdi dir="ltr">{item.quantity}</bdi></td><td className="whitespace-nowrap px-3 py-4">{money(item.unitPrice)}</td><td className="whitespace-nowrap px-3 py-4 font-semibold">{money(item.total)}</td></tr>)}</tbody></table></div>
          <div className="flex flex-wrap justify-end gap-x-8 gap-y-3">{[["total", selected.total], ["amountPaid", selected.amountPaid], ["remaining", selected.total - selected.amountPaid]].map(([key, value]) => <p key={key} className="text-sm">{t(`supplierInvoices.${key}`)}: <strong>{money(value)}</strong></p>)}</div>
          <div><h3 className="mb-3 font-bold">{t("supplierInvoices.paymentHistory")}</h3>{selected.payments.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">{selected.payments.map((payment) => <li key={payment.requestId} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><div><bdi dir="ltr">{payment.date}</bdi>{payment.note && <p className="mt-1 text-slate-500 dark:text-slate-400"><bdi>{payment.note}</bdi></p>}</div><strong className="text-primary-600 dark:text-primary-400">{money(payment.amount)}</strong></li>)}</ul> : <p className="text-sm text-slate-500 dark:text-slate-400">{t("supplierInvoices.noPayments")}</p>}</div>
          {selected.amountPaid < selected.total && <SupplierPaymentForm key={selected._id} invoice={selected} onSave={savePayment} />}
        </section>}
      </>}
    </div>
  </div>;
}

export default function SupplierInvoices() {
  const { id } = useParams();
  const { token } = useSelector((state) => state.LoginAdmin);
  if (!token) return <Navigate to="/LoginChoise" replace />;
  return <SupplierLedger key={id} id={id} token={token} />;
}
