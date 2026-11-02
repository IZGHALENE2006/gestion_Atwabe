import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoDownloadOutline, IoMailOutline, IoShareSocialOutline, IoLogoWhatsapp } from "react-icons/io5";
import { creditDocument } from "../../../shared/creditDocuments.js";
import { canShareCreditFile, creditEmailUrl, creditStatementFilename, creditWhatsAppUrl } from "../../../shared/creditSharing.js";
import { useInvoiceSettings } from "../Facture/useInvoiceSettings.js";
import { createCreditStatementPDF } from "./creditStatementPDF.js";
import "./creditDocuments.css";

const api = import.meta.env.VITE_API_URL || "http://localhost:7000";

export default function CreditShareDialog({ userId, onClose }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), downloadRef = useRef(null), sharingRef = useRef(false);
  const { settings, loading: settingsLoading, error: settingsError, retry: retrySettings } = useInvoiceSettings();
  const [account, setAccount] = useState({ user: null, loading: true, error: false });
  const [attempt, setAttempt] = useState(0), [phone, setPhone] = useState(""), [email, setEmail] = useState("");
  const [pdf, setPdf] = useState({ file: null, data: null, url: "", error: false });
  const [sharing, setSharing] = useState(false), [shareError, setShareError] = useState(false), [downloaded, setDownloaded] = useState(false);
  const language = i18n.language, rtl = i18n.dir() === "rtl", locale = language === "ar" ? "ar-MA" : "fr-MA";

  useEffect(() => {
    const dialog = dialogRef.current; dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    axios.get(`${api}/usercridite/get/${encodeURIComponent(userId)}`, { signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }).then(({ data }) => {
      if (!controller.signal.aborted) {
        if (String(data?._id) !== String(userId)) throw new Error("Wrong credit customer");
        setAccount({ user: data, loading: false, error: false }); setPhone(data.phone || ""); setEmail(data.email || "");
      }
    }).catch(() => { if (!controller.signal.aborted) setAccount({ user: null, loading: false, error: true }); });
    return () => controller.abort();
  }, [userId, attempt]);
  useEffect(() => {
    if (!account.user || !settings || account.loading || settingsLoading || settingsError) return;
    let active = true, url = "";
    const data = creditDocument(account.user, { kind: "statement" });
    createCreditStatementPDF(data, settings, { t, rtl, locale }).then(doc => {
      if (!active) return;
      const file = new File([doc.output("blob")], creditStatementFilename(data.reference), { type: "application/pdf" });
      url = URL.createObjectURL(file); setPdf({ file, data, url, error: false });
    }).catch(() => { if (active) setPdf({ file: null, data: null, url: "", error: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [account, settings, settingsLoading, settingsError, language, t, rtl, locale]);

  const close = () => { if (!sharingRef.current) { dialogRef.current.close(); onClose(); } };
  const retry = () => {
    setPdf({ file: null, data: null, url: "", error: false }); setAccount({ user: null, loading: true, error: false });
    setShareError(false); setDownloaded(false); retrySettings(); setAttempt(value => value + 1);
  };
  const ready = Boolean(pdf.file) && !account.loading && !settingsLoading && !settingsError && !account.error;
  const money = value => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${rtl ? "درهم" : "DH"}`;
  const subject = t("creditDocuments.share.subject", { name: account.user?.name || "" });
  const message = pdf.data ? t("creditDocuments.share.message", { name: pdf.data.customer.name, total: money(pdf.data.total), paid: money(pdf.data.paid), remaining: money(pdf.data.remaining), file: pdf.file.name }) : "";
  const whatsapp = creditWhatsAppUrl(phone, message), mail = creditEmailUrl(email, subject, message);
  const download = () => { downloadRef.current?.click(); setDownloaded(true); };
  const share = async () => {
    if (!ready || sharingRef.current) return;
    sharingRef.current = true; setSharing(true); setShareError(false);
    try { await navigator.share({ files: [pdf.file], title: subject, text: message }); }
    catch (error) { if (error.name !== "AbortError") setShareError(true); }
    finally { sharingRef.current = false; setSharing(false); }
  };
  const failed = account.error || settingsError || pdf.error;
  return <dialog ref={dialogRef} className="credit-document-dialog credit-share-dialog" dir={i18n.dir()} aria-labelledby="credit-share-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="credit-share-title"><IoShareSocialOutline aria-hidden="true" />{t("creditDocuments.share.title")}</h2><p>{t("creditDocuments.share.hint")}</p></div><button type="button" data-close-credit-share onClick={close} disabled={sharing} aria-label={t("creditDocuments.close")}><IoCloseOutline size={24} /></button></header>
    <div className="credit-document-body credit-share-body">
      {failed ? <div role="alert" className="credit-document-feedback"><p>{t("creditDocuments.share.prepareFailed")}</p><button type="button" onClick={retry}>{t("invoiceSettings.retry")}</button></div> : !ready ? <p className="credit-share-status" role="status">{t("creditDocuments.share.preparing")}</p> : <>
        <section className="credit-share-summary" aria-label={t("creditDocuments.customer")}><strong dir="auto" data-credit-share-customer>{pdf.data.customer.name}</strong><dl>{["total", "paid", "remaining"].map(key => <div key={key}><dt>{t(`creditDocuments.${key}`)}</dt><dd data-credit-share-amount={key} data-value={pdf.data[key]}><bdi>{money(pdf.data[key])}</bdi></dd></div>)}</dl></section>
        <div className="credit-share-file"><IoDownloadOutline size={26} aria-hidden="true"/><div><strong>{t("creditDocuments.share.pdfTitle")}</strong><small dir="ltr">{pdf.file.name}</small></div><button type="button" data-credit-share-download onClick={download}>{t("creditDocuments.share.download")}</button></div>
        <a ref={downloadRef} href={pdf.url} download={pdf.file.name} hidden tabIndex={-1} aria-hidden="true">PDF</a>
        <p className="credit-share-instruction">{t("creditDocuments.share.attachHint")}</p>
        <div className="credit-share-channels">
          <section><h3><IoLogoWhatsapp size={22} aria-hidden="true"/> {t("creditDocuments.share.whatsapp")}</h3><label htmlFor="credit-share-phone">{t("creditDocuments.share.phone")}</label><input id="credit-share-phone" type="tel" dir="ltr" value={phone} disabled={sharing} onChange={event => setPhone(event.target.value)} placeholder="0612345678" autoComplete="tel" aria-invalid={!whatsapp} aria-describedby="credit-share-phone-hint"/><small id="credit-share-phone-hint">{t(whatsapp ? "creditDocuments.share.contactHint" : "creditDocuments.share.phoneHint")}</small><a data-credit-share-whatsapp href={whatsapp && !sharing ? whatsapp : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!whatsapp || sharing} onClick={event => { if (!whatsapp || sharing) event.preventDefault(); else download(); }}>{t("creditDocuments.share.openWhatsapp")}</a></section>
          <section><h3><IoMailOutline size={22} aria-hidden="true"/> {t("creditDocuments.share.email")}</h3><label htmlFor="credit-share-email">{t("creditDocuments.share.email")}</label><input id="credit-share-email" type="email" dir="ltr" value={email} disabled={sharing} onChange={event => setEmail(event.target.value)} placeholder="client@example.com" autoComplete="email" aria-invalid={!mail} aria-describedby="credit-share-email-hint"/><small id="credit-share-email-hint">{t(mail ? "creditDocuments.share.contactHint" : "creditDocuments.share.emailHint")}</small><a data-credit-share-email href={mail && !sharing ? mail : undefined} aria-disabled={!mail || sharing} onClick={event => { if (!mail || sharing) event.preventDefault(); else download(); }}>{t("creditDocuments.share.openEmail")}</a></section>
        </div>
        {downloaded && <p className="credit-share-status" role="status">{t("creditDocuments.share.downloaded")}</p>}
        {shareError && <p className="credit-document-feedback" role="alert">{t("creditDocuments.share.shareFailed")}</p>}
      </>}
    </div>
    <footer><button type="button" disabled={sharing} onClick={close}>{t("creditDocuments.close")}</button>{ready && canShareCreditFile(navigator, pdf.file) && <button type="button" data-credit-share-native disabled={sharing} onClick={share}><IoShareSocialOutline size={20}/>{t(sharing ? "creditDocuments.share.sharing" : "creditDocuments.share.native")}</button>}</footer>
  </dialog>;
}
