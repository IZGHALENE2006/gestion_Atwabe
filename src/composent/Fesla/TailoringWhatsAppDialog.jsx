import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline, IoDocumentTextOutline, IoDownloadOutline, IoLogoWhatsapp, IoShareSocialOutline } from 'react-icons/io5';
import { creditWhatsAppUrl, canShareCreditFile } from '../../../shared/creditSharing.js';
import { publicTailoringReceipt } from '../../../shared/tailoringReceipts.js';
import { tailoringOrderBarcode } from '../../../shared/tailoringBarcode.js';
import { tailoringReadyMessage, tailoringReceiptFilename, tailoringReceiptMessage } from '../../../shared/tailoringSharing.js';
import { useInvoiceSettings } from '../Facture/useInvoiceSettings.js';
import { createTailoringReceiptPDF } from './tailoringReceiptPDF.js';
import TailoringReceiptPaper from './TailoringReceiptPaper.jsx';
import './tailoringSharing.css';

export default function TailoringWhatsAppDialog({ order, document: snapshot, onClose }) {
  const { t, i18n } = useTranslation();
  const dialog = useRef(null), downloadRef = useRef(null), sharingRef = useRef(false);
  const data = useMemo(() => snapshot ? publicTailoringReceipt(snapshot) : null, [snapshot]);
  const locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', rtl = i18n.dir() === 'rtl';
  const { settings, loading, error, retry } = useInvoiceSettings(Boolean(data));
  const [phone, setPhone] = useState(order.phone || ''), [status, setStatus] = useState('ready');
  const [message, setMessage] = useState(() => data ? tailoringReceiptMessage(data, { t, locale }) : tailoringReadyMessage(order, 'ready', { t }));
  const [attempt, setAttempt] = useState(0), [pdf, setPdf] = useState(null);
  const [sharing, setSharing] = useState(false), [shareError, setShareError] = useState(false), [downloaded, setDownloaded] = useState(false);
  const [shared, setShared] = useState(false);
  const reference = data?.reference || tailoringOrderBarcode(order), filename = tailoringReceiptFilename(reference);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  useEffect(() => {
    if (!data || loading || error) return;
    let active = true, url;
    createTailoringReceiptPDF(data, settings, { t, rtl, locale }).then(doc => {
      if (!active) return;
      const file = new File([doc.output('blob')], tailoringReceiptFilename(data.reference), { type: 'application/pdf' });
      url = URL.createObjectURL(file);
      setPdf({ file, url });
    }).catch(() => { if (active) setPdf({ error: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [data, settings, loading, error, t, rtl, locale, attempt]);
  const close = () => { if (!sharingRef.current) { dialog.current.close(); onClose(); } };
  const ready = !data || !loading && !error && Boolean(pdf?.file);
  const whatsapp = message.trim() ? creditWhatsAppUrl(phone, message) : '';
  const allowed = ready && Boolean(whatsapp) && !sharing;
  const title = t('fesla.whatsapp.' + (data ? data.kind === 'payment' ? 'paymentAction' : 'orderAction' : 'notifyAction'));
  const download = () => { if (ready && pdf?.file) { downloadRef.current.click(); setDownloaded(true); } };
  const share = async () => {
    if (!allowed || sharingRef.current || !canShareCreditFile(navigator, pdf?.file)) return;
    sharingRef.current = true; setSharing(true); setShareError(false); setShared(false);
    try { await navigator.share({ files: [pdf.file], title, text: message }); setShared(true); }
    catch (failure) { if (failure.name !== 'AbortError') setShareError(true); }
    finally { sharingRef.current = false; setSharing(false); }
  };
  const retryPdf = () => { setPdf(null); setDownloaded(false); setShareError(false); setShared(false); if (error) retry(); else setAttempt(value => value + 1); };
  return <dialog ref={dialog} className="tailoring-whatsapp-dialog" dir={i18n.dir()} aria-labelledby="tailoring-whatsapp-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><span className="tailoring-whatsapp-eyebrow"><IoLogoWhatsapp size={20} aria-hidden="true" />{t('fesla.whatsapp.channel')}</span><h2 id="tailoring-whatsapp-title">{title}</h2><p>{t(data ? 'fesla.whatsapp.receiptHint' : 'fesla.whatsapp.notifyHint')}</p></div><button type="button" data-close-tailoring-whatsapp onClick={close} disabled={sharing} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <div className="tailoring-whatsapp-body">
      <div className="tailoring-whatsapp-customer"><strong dir="auto">{order.clientName}</strong><bdi dir="ltr">{reference}</bdi></div>
      {!data && <fieldset className="tailoring-whatsapp-status"><legend>{t('fesla.whatsapp.chooseStatus')}</legend>{['ready', 'almost'].map(value => <label key={value} className={status === value ? 'is-selected' : ''}><input type="radio" name="tailoring-ready-status" value={value} checked={status === value} onChange={() => { setStatus(value); setMessage(tailoringReadyMessage(order, value, { t })); }} />{t('fesla.whatsapp.' + value)}</label>)}</fieldset>}
      <label className="tailoring-whatsapp-field" htmlFor="tailoring-whatsapp-phone">{t('fesla.whatsapp.phone')}<input id="tailoring-whatsapp-phone" type="tel" dir="ltr" autoComplete="tel" placeholder="0612345678" value={phone} disabled={sharing} onChange={event => setPhone(event.target.value)} aria-invalid={!creditWhatsAppUrl(phone, 'test')} aria-describedby="tailoring-whatsapp-phone-hint" /><small id="tailoring-whatsapp-phone-hint">{t(creditWhatsAppUrl(phone, 'test') ? 'fesla.whatsapp.phoneHint' : 'fesla.whatsapp.invalidPhone')}</small></label>
      <label className="tailoring-whatsapp-field" htmlFor="tailoring-whatsapp-message">{t('fesla.whatsapp.message')}<textarea id="tailoring-whatsapp-message" dir="auto" rows={data ? 7 : 5} value={message} disabled={sharing} onChange={event => setMessage(event.target.value)} /></label>
      {data && <>
        {(loading || !error && !pdf) && <p role="status" className="tailoring-whatsapp-feedback">{t('fesla.whatsapp.preparing')}</p>}
        {(error || pdf?.error) && <p role="alert" className="tailoring-whatsapp-feedback is-error">{t('fesla.whatsapp.pdfFailed')} <button type="button" data-retry-tailoring-share onClick={retryPdf}>{t('fesla.retry')}</button></p>}
        {ready && <><section className="tailoring-whatsapp-file"><IoDocumentTextOutline size={32} aria-hidden="true" /><div><strong>{t('fesla.whatsapp.pdfReady')}</strong><bdi dir="ltr">{filename}</bdi></div><button type="button" data-download-tailoring-share disabled={sharing} onClick={download}><IoDownloadOutline size={19} />{t('fesla.whatsapp.download')}</button></section><a ref={downloadRef} href={pdf.url} download={filename} hidden tabIndex={-1} aria-hidden="true">PDF</a><details className="tailoring-whatsapp-preview"><summary>{t('fesla.whatsapp.preview')}</summary><div className="tailoring-receipt-preview"><TailoringReceiptPaper document={data} settings={settings} /></div></details></>}
        <p className="tailoring-whatsapp-hint">{t('fesla.whatsapp.attachHint')}</p>
      </>}
      {downloaded && <p role="status" className="tailoring-whatsapp-feedback">{t('fesla.whatsapp.downloaded')}</p>}
      {shared && <p role="status" className="tailoring-whatsapp-feedback">{t('fesla.whatsapp.shared')}</p>}
      {shareError && <p role="alert" className="tailoring-whatsapp-feedback is-error">{t('fesla.whatsapp.shareFailed')}</p>}
    </div>
    <footer><button type="button" onClick={close} disabled={sharing}>{t('dialog.close')}</button>{data && ready && canShareCreditFile(navigator, pdf?.file) && <button type="button" className="tailoring-whatsapp-primary" data-share-tailoring-file disabled={!allowed} onClick={share}><IoShareSocialOutline size={20} />{t(sharing ? 'fesla.whatsapp.sharing' : 'fesla.whatsapp.native')}</button>}<a className={data ? 'tailoring-whatsapp-chat' : 'tailoring-whatsapp-primary'} data-open-tailoring-whatsapp href={allowed ? whatsapp : undefined} aria-disabled={!allowed} target="_blank" rel="noopener noreferrer" onClick={event => { if (!allowed) event.preventDefault(); else if (data) download(); }}><IoLogoWhatsapp size={20} aria-hidden="true" />{t(data ? 'fesla.whatsapp.downloadAndOpen' : 'fesla.whatsapp.open')}</a></footer>
  </dialog>;
}
