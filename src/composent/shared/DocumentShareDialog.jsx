import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline, IoDocumentTextOutline, IoDownloadOutline, IoLogoWhatsapp, IoShareSocialOutline } from 'react-icons/io5';
import { canShareCreditFile, creditWhatsAppUrl } from '../../../shared/creditSharing.js';
import './documentSharing.css';

export default function DocumentShareDialog({ title, customer, filename, initialMessage, createDocument, preparing = false, preparationError = false, onRetryPreparation, onClose }) {
  const { t, i18n } = useTranslation(), p = key => t('documentSharing.' + key);
  const dialog = useRef(null), downloadRef = useRef(null), busy = useRef(false);
  const [phone, setPhone] = useState(customer.phone || ''), [message, setMessage] = useState(initialMessage);
  const [attempt, setAttempt] = useState(0), [result, setResult] = useState(null), [sharing, setSharing] = useState(false);
  const [downloaded, setDownloaded] = useState(false), [shared, setShared] = useState(false), [shareError, setShareError] = useState(false);
  const pdf = result?.createDocument === createDocument && result.filename === filename && result.attempt === attempt ? result : null;
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  useEffect(() => {
    if (preparing || preparationError) return;
    let active = true, url;
    Promise.resolve().then(createDocument).then(doc => {
      if (!active) return;
      const file = new File([doc.output('blob')], filename, { type: 'application/pdf' });
      url = URL.createObjectURL(file);
      setResult({ createDocument, filename, attempt, file, url });
    }).catch(() => { if (active) setResult({ createDocument, filename, attempt, error: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [createDocument, filename, attempt, preparing, preparationError]);
  const ready = !preparing && !preparationError && Boolean(pdf?.file), failed = preparationError || pdf?.error;
  const whatsapp = message.trim() ? creditWhatsAppUrl(phone, message) : '', allowed = ready && !sharing;
  const close = () => { if (!busy.current) { dialog.current.close(); onClose(); } };
  const download = () => { if (allowed) { downloadRef.current?.click(); setDownloaded(true); } };
  const share = async () => {
    if (!ready || busy.current || !canShareCreditFile(navigator, pdf.file)) return;
    busy.current = true; setSharing(true); setShareError(false); setShared(false);
    try { await navigator.share({ files: [pdf.file], title, text: message }); setShared(true); }
    catch (error) { if (error.name !== 'AbortError') setShareError(true); }
    finally { busy.current = false; setSharing(false); }
  };
  const retry = () => { setResult(null); setDownloaded(false); setShared(false); setShareError(false); setAttempt(value => value + 1); if (preparationError) onRetryPreparation?.(); };
  return <dialog ref={dialog} className="document-share-dialog" dir={i18n.dir()} aria-labelledby="document-share-title" onCancel={event => { event.preventDefault(); close(); }} data-document-share>
    <header><div><span><IoLogoWhatsapp aria-hidden="true" />WhatsApp</span><h2 id="document-share-title">{title}</h2><p>{p('hint')}</p></div><button type="button" data-close-document-share onClick={close} disabled={sharing} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <div className="document-share-body"><div className="document-share-customer"><strong dir="auto">{customer.name || t('fabricInvoices.emptyCustomer')}</strong></div>
      <label htmlFor="document-share-phone">{p('phone')}<input id="document-share-phone" data-document-share-phone type="tel" dir="ltr" autoComplete="tel" placeholder="0612345678" value={phone} disabled={sharing} onChange={event => setPhone(event.target.value)} aria-invalid={!creditWhatsAppUrl(phone, 'test')} aria-describedby="document-share-phone-hint" /><small id="document-share-phone-hint">{p(creditWhatsAppUrl(phone, 'test') ? 'phoneHint' : 'invalidPhone')}</small></label>
      <label htmlFor="document-share-message">{p('message')}<textarea id="document-share-message" data-document-share-message rows={5} dir="auto" value={message} disabled={sharing} onChange={event => setMessage(event.target.value)} /></label>
      {failed ? <div role="alert" className="document-share-feedback is-error"><p>{p('failed')}</p><button type="button" data-retry-document-share onClick={retry}>{p('retry')}</button></div> : !ready ? <p role="status" className="document-share-feedback">{p('preparing')}</p> : <><section className="document-share-file"><IoDocumentTextOutline size={31} aria-hidden="true" /><div><strong>{p('ready')}</strong><bdi dir="ltr">{filename}</bdi></div></section><a ref={downloadRef} href={pdf.url} download={filename} hidden tabIndex={-1} aria-hidden="true">PDF</a></>}
      <p className="document-share-instruction">{p('attachHint')}</p>
      {downloaded && <p role="status" className="document-share-feedback">{p('downloaded')}</p>}{shared && <p role="status" className="document-share-feedback">{p('shared')}</p>}{shareError && <p role="alert" className="document-share-feedback is-error">{p('shareFailed')}</p>}
    </div><footer><button type="button" onClick={close} disabled={sharing}>{t('dialog.close')}</button><button type="button" data-download-document-share disabled={!allowed} onClick={download}><IoDownloadOutline size={19} />{p('download')}</button>{ready && canShareCreditFile(navigator, pdf.file) && <button type="button" className="document-share-native" data-native-document-share disabled={sharing} onClick={share}><IoShareSocialOutline size={19} />{p(sharing ? 'sharing' : 'native')}</button>}<a className="document-share-whatsapp" data-whatsapp-document-share href={allowed && whatsapp ? whatsapp : undefined} aria-disabled={!allowed || !whatsapp} target="_blank" rel="noopener noreferrer" onClick={event => { if (!allowed || !whatsapp) event.preventDefault(); else download(); }}><IoLogoWhatsapp size={19} />{p('whatsapp')}</a></footer>
  </dialog>;
}
