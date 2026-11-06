import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import { documentTitleKey } from "../../../shared/salesDocuments.js";
import { useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useReactToPrint } from "react-to-print";
import { Link } from "react-router-dom";
import { IoCloseOutline, IoPrintOutline, IoDownloadOutline, IoSettingsOutline } from "react-icons/io5";
import FacturePrint from "./FacturePrintachat";
import { generateFacturePDF } from "./invoicePDF";
import { useInvoiceSettings } from "./useInvoiceSettings";
import { documentPrintFonts } from "../../utils/documentFonts.js";
import { usePdfExport } from "../../utils/usePdfExport.js";

function InvoiceDetailsContent({ data, onClose }) {
  const printRef = useRef(null);
  const { user, role } = useSelector((state) => state.LoginAdmin);
  const { t, i18n } = useTranslation();
  const { settings, loading, error, retry } = useInvoiceSettings();
  const [printError, setPrintError] = useState("");
  const { exportPdf, isExporting, exportError } = usePdfExport((invoice) => generateFacturePDF(invoice, settings));
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    fonts: documentPrintFonts,
    onBeforePrint: async () => {
      setPrintError("");
      await document.fonts.ready;
      await Promise.all(Array.from(printRef.current.querySelectorAll("img")).map((img) => img.decode()));
    },
    onPrintError: () => setPrintError(t("invoiceSettings.printFailed")),
  });
  const disabled = loading || Boolean(error);
  return (
    <div dir={i18n.dir()} className="fixed inset-0 z-999 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="invoice-preview-title" className="relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 id="invoice-preview-title" className="font-bold text-slate-900 dark:text-white">{t(documentTitleKey(data))}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {role === "admin" && <Link to="/Home/invoice-settings" onClick={onClose} className="rounded-xl border border-slate-200 p-3 text-slate-600 dark:border-slate-700 dark:text-slate-300" aria-label={t("invoiceSettings.title")} title={t("invoiceSettings.title")}><IoSettingsOutline size={19} /></Link>}
            <EmployeeOperation module="invoices" operation="download"><button type="button" disabled={disabled || isExporting} onClick={() => exportPdf(data)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"><IoDownloadOutline />{isExporting ? t("salesPdf.exporting") : "PDF"}</button></EmployeeOperation>
            <EmployeeOperation module="invoices" operation="print"><button type="button" disabled={disabled} onClick={handlePrint} className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><IoPrintOutline />{t("invoiceDialog.print")}</button></EmployeeOperation>
            <button type="button" onClick={onClose} aria-label={t("invoiceSettings.close")} className="rounded-xl p-3 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"><IoCloseOutline size={23} /></button>
          </div>
        </header>
        <div className="overflow-auto p-3 sm:p-6">
          {loading && <p className="p-8 text-center text-slate-500">{t("common.loading")}</p>}
          {error && <div role="alert" className="p-8 text-center text-rose-600"><p>{t("invoiceSettings.loadFailed")}</p><button type="button" onClick={retry} className="mt-4 font-bold underline">{t("invoiceSettings.retry")}</button></div>}
          {(exportError || printError) && <p role="alert" className="mb-4 text-sm text-rose-600">{exportError || printError}</p>}
          {!disabled && <div className="min-w-[620px] shadow-sm"><FacturePrint ref={printRef} facture={data} user={user} settings={settings} /></div>}
        </div>
      </section>
    </div>
  );
}

export default function InvoiceDetailsDialog({ open, ...props }) {
  return open ? <InvoiceDetailsContent {...props} /> : null;
}
