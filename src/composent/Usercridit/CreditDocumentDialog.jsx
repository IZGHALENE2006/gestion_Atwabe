import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReactToPrint } from "react-to-print";
import { IoCloseOutline, IoPrintOutline } from "react-icons/io5";
import { creditDocument } from "../../../shared/creditDocuments.js";
import { documentPrintFonts } from "../../utils/documentFonts.js";
import { useInvoiceSettings } from "../Facture/useInvoiceSettings.js";
import CreditDocumentPaper from "./CreditDocumentPaper.jsx";
import printStyles from "./creditPrint.css?inline";

export default function CreditDocumentDialog({ user, selection, onClose }) {
  const { t, i18n } = useTranslation();
  const [data] = useState(() => creditDocument(user, selection));
  const dialogRef = useRef(null), printRef = useRef(null);
  const { settings, loading, error, retry } = useInvoiceSettings();
  const [printing, setPrinting] = useState(false), [printError, setPrintError] = useState(false);
  const print = useReactToPrint({ contentRef: printRef, fonts: documentPrintFonts, ignoreGlobalStyles: true, documentTitle: data.reference, pageStyle: `@page { size: A4; margin: 12mm; } ${printStyles}`,
    onBeforePrint: async () => { await document.fonts.ready; await Promise.all([...printRef.current.querySelectorAll("img")].map(img => img.decode().catch(() => {}))); },
    onAfterPrint: () => setPrinting(false), onPrintError: () => { setPrinting(false); setPrintError(true); },
  });
  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); return () => dialog.close(); }, []);
  const close = () => { if (!printing) { dialogRef.current.close(); onClose(); } };
  const title = t(`creditDocuments.${data.kind === "payment" ? "paymentTitle" : data.kind === "invoice" ? "invoiceTitle" : "statementTitle"}`);
  return <dialog ref={dialogRef} dir={i18n.dir()} className="credit-document-dialog" aria-labelledby="credit-document-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="credit-document-title">{title}</h2><p>{t(`creditDocuments.${data.kind === "payment" ? "paymentHint" : data.kind === "invoice" ? "invoiceHint" : "statementHint"}`)}</p></div><button type="button" data-close-credit-document disabled={printing} onClick={close} aria-label={t("creditDocuments.close")}><IoCloseOutline size={24} /></button></header>
    <div className="credit-document-body">
      {loading && <p role="status" className="credit-document-feedback">{t("common.loading")}</p>}
      {error && <div role="alert" className="credit-document-feedback"><p>{t("invoiceSettings.loadFailed")}</p><button type="button" onClick={retry}>{t("invoiceSettings.retry")}</button></div>}
      {printError && <p role="alert" className="credit-document-feedback">{t("creditDocuments.errors.printFailed")}</p>}
      {!loading && !error && <><p className="credit-document-scroll-hint">{t("creditDocuments.scrollPreview")}</p><div className="credit-document-preview"><CreditDocumentPaper document={data} settings={settings} paperRef={printRef} /></div></>}
    </div>
    <footer><button type="button" disabled={printing} onClick={close}>{t("creditDocuments.close")}</button><button type="button" data-print-credit-document disabled={loading || Boolean(error) || printing} onClick={() => { setPrintError(false); setPrinting(true); print(); }}><IoPrintOutline size={20} />{t(printing ? "creditDocuments.printing" : "creditDocuments.print")}</button></footer>
  </dialog>;
}
