import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { IoCloseOutline, IoDownloadOutline, IoPrintOutline } from 'react-icons/io5';
import { fabricInvoiceLineName } from '../../../shared/fabricInvoices.js';
import { documentPrintFonts } from '../../utils/documentFonts.js';
import { useInvoiceSettings } from '../Facture/useInvoiceSettings.js';
import { createFacturePDF } from '../Facture/invoicePDF.js';
import CreditDocumentPaper from '../Usercridit/CreditDocumentPaper.jsx';
import CreditDocumentDialog from '../Usercridit/CreditDocumentDialog.jsx';
import useEmployeeOperations from '../../hooks/useEmployeeOperations.js';
import printStyle from '../Usercridit/creditPrint.css?inline';
import { payFabricInvoice, fabricInvoiceError } from './fabricInvoicesApi.js';

function fabricInvoiceDocument(invoice) {
  return { kind: 'invoice', titleKey: 'fabricInvoices.title', currentBalance: true, reference: invoice.reference, date: invoice.date, actor: invoice.actor, customer: invoice.customer, total: invoice.total, paid: invoice.paidAmount, remaining: invoice.remaining,
    lines: invoice.lines.map((line, index) => ({ id: String(index), nom: fabricInvoiceLineName(line), unit: 'meter', Quantite: line.meters, prix: line.unitPrice, discountAmount: line.discountAmount, lineTotal: line.total, Date: invoice.date })) };
}
export default function FabricInvoiceDetails({ invoice, permissions, token, onClose, onChanged }) {
  const { t, i18n } = useTranslation(), credit = useEmployeeOperations('credit');
  const dialog = useRef(null), paper = useRef(null), busyRef = useRef(false), request = useRef(null);
  const { settings, loading, error: settingsError, retry } = useInvoiceSettings();
  const [amount, setAmount] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState(null), [exporting, setExporting] = useState(false);
  const money = value => Number(value).toLocaleString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = value => new Date(value).toLocaleString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { dateStyle: 'short', timeStyle: 'short' });
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  const print = useReactToPrint({ contentRef: paper, fonts: documentPrintFonts, ignoreGlobalStyles: true, documentTitle: invoice.reference, pageStyle: '@page {size:A4;margin:12mm}' + printStyle,
    onBeforePrint: async () => { await document.fonts.ready; }, onPrintError: () => setError(t('fabrics.errors.printFailed')) });
  const close = () => { if (!busyRef.current && !exporting) { dialog.current.close(); onClose(); } };
  const pdf = async () => {
    setExporting(true); setError('');
    try {
      const data = { _id: invoice.reference, invoiceOrigin: 'fabric', DateFacture: invoice.date, nameEmp: invoice.actor.name, clientName: invoice.customer.name, clientPhone: invoice.customer.phone,
        Product: invoice.lines.map(line => ({ name: fabricInvoiceLineName(line), code: line.barcode, quantite: line.meters, unit: 'meter', price: line.unitPrice, TotalPrix: line.total, subtotal: line.subtotal, discountType: line.discountType, discountValue: line.discountValue, discountAmount: line.discountAmount })),
        TotalQauntite: invoice.lines.reduce((sum, line) => sum + line.meters, 0), TotalPrix: invoice.total, totalOrder: invoice.total, subtotal: invoice.subtotal, discountAmount: invoice.discountAmount, lineDiscountAmount: invoice.discountAmount, orderDiscountAmount: 0, amountPaid: invoice.paidAmount, remainingAmount: invoice.remaining, PrixReture: 0 };
      const document = await createFacturePDF(data, settings); document.save(invoice.reference + '.pdf');
    } catch { setError(t('invoiceSettings.printFailed')); } finally { setExporting(false); }
  };
  const pay = async event => {
    event.preventDefault(); if (busyRef.current) return;
    if (!request.current || request.current.amount !== amount) request.current = { id: crypto.randomUUID(), amount };
    busyRef.current = true; setBusy(true); setError('');
    try { const result = await payFabricInvoice(invoice._id, { amount, requestId: request.current.id }, token); onChanged(result.invoice); setAmount(''); request.current = null; if (result.payment?.document && permissions.invoicePrint) setReceipt(result.payment.document); }
    catch (failure) { setError(fabricInvoiceError(failure, t)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <><dialog ref={dialog} className="fi-dialog fi-details" dir={i18n.dir()} aria-labelledby="fi-details-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="fi-details-title">{t('fabricInvoices.title')}</h2><p><bdi>{invoice.reference}</bdi> · {date(invoice.date)}</p></div><button type="button" disabled={busy || exporting} onClick={close} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <div className="fi-details-body"><div className="fi-totals">{[['total', invoice.total], ['paid', invoice.paidAmount], ['remaining', invoice.remaining]].map(([key, value]) => <div key={key}><span>{t('fabricInvoices.' + key)}</span><strong data-invoice-detail-total={key} data-value={value}>{money(value)} {t('fesla.currency')}</strong></div>)}</div>
      {permissions.invoicePayment && credit.payment && invoice.creditUserId && invoice.remaining > 0 && !invoice.accountUnavailable && <form className="fi-payment-form" onSubmit={pay}><label htmlFor="fi-payment-amount">{t('fabricInvoices.addPayment')}</label><input id="fi-payment-amount" inputMode="decimal" dir="ltr" maxLength={12} value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /><button type="submit" className="fi-primary" data-pay-fabric-invoice disabled={busy}>{t(busy ? 'common.loading' : 'fabricInvoices.addPayment')}</button></form>}
      {error && <p role="alert" className="fi-error">{error}</p>}
      <div className="fi-document-actions">{permissions.invoicePrint && <><button type="button" className="fi-secondary" disabled={loading || settingsError || exporting} onClick={pdf}><IoDownloadOutline />{t('fabricInvoices.download')}</button><button type="button" className="fi-primary" data-print-fabric-invoice disabled={loading || settingsError} onClick={print}><IoPrintOutline />{t('fabricInvoices.print')}</button></>}{invoice.creditUserId && credit.details && <Link className="fi-secondary" to={'/Home/cridit/UserCreditDetails/' + invoice.creditUserId}>{t('fabricInvoices.creditLink')}</Link>}</div>
      {loading && <p role="status">{t('common.loading')}</p>}{settingsError && <p role="alert">{t('invoiceSettings.loadFailed')} <button type="button" onClick={retry}>{t('fabrics.retry')}</button></p>}
      {!loading && !settingsError && <div className="fi-preview"><CreditDocumentPaper document={fabricInvoiceDocument(invoice)} settings={settings} paperRef={paper} /></div>}
      <section className="fi-payment-history"><h3>{t('fabricInvoices.payments')}</h3>{!invoice.payments.length ? <p>{t('fabricInvoices.noPayments')}</p> : <div className="fi-table-scroll"><table><thead><tr>{['date', 'paid', 'seller', 'actions'].map(key => <th key={key}>{t('fabricInvoices.' + key)}</th>)}</tr></thead><tbody>{invoice.payments.map(payment => <tr key={payment.id}><td>{date(payment.Date)}</td><td><bdi>{money(payment.amount)}</bdi></td><td>{payment.actor?.name || '—'}</td><td>{permissions.invoicePrint && <button type="button" className="fi-secondary" onClick={() => setReceipt(payment.document)}>{t('fabricInvoices.print')}</button>}</td></tr>)}</tbody></table></div>}</section>
    </div><footer><button type="button" className="fi-secondary" disabled={busy || exporting} onClick={close}>{t('dialog.close')}</button></footer>
  </dialog>{receipt && <CreditDocumentDialog document={receipt} onClose={() => setReceipt(null)} />}</>;
}
