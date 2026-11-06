import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactToPrint } from 'react-to-print';
import { normalizeInvoiceSettings } from '../../../shared/invoiceSettings.js';
import { documentPrintFonts } from '../../utils/documentFonts.js';
import { useInvoiceSettings } from '../Facture/useInvoiceSettings.js';
import EmployeePayrollModal from './EmployeePayrollModal.jsx';
import printStyles from './employeePayroll.css?inline';

export default function EmployeePayrollReceipt({ payment, onClose }) {
  const { t, i18n } = useTranslation(), paper = useRef(null);
  const { settings } = useInvoiceSettings();
  const config = normalizeInvoiceSettings(settings || {}), locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const money = value => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ' + t('employeePayroll.currency');
  const [printing, setPrinting] = useState(false), [error, setError] = useState(false);
  const print = useReactToPrint({ contentRef: paper, documentTitle: payment.reference, fonts: documentPrintFonts, ignoreGlobalStyles: true,
    pageStyle: `@page {size:A4; margin:14mm;} ${printStyles}`,
    onBeforePrint: async () => { await document.fonts.ready; }, onAfterPrint: () => setPrinting(false), onPrintError: () => { setPrinting(false); setError(true); },
  });
  return <EmployeePayrollModal title={t('employeePayroll.receiptTitle')} subtitle={payment.reference} wide busy={printing} onClose={onClose} footer={<><button type="button" disabled={printing} onClick={onClose}>{t('employeePayroll.close')}</button><button type="button" data-print-employee-receipt disabled={printing} className="ep-primary" onClick={() => { setPrinting(true); setError(false); print(); }}>{t('employeePayroll.print')}</button></>}>
    {error && <p className="ep-error" role="alert">{t('employeePayroll.printFailed')}</p>}
    <article ref={paper} className="ep-receipt" dir={i18n.dir()} data-employee-payroll-receipt={payment.reference}>
      <header><div><h1>{config.visibility.shopName && config.shopName || t('employeePayroll.receiptTitle')}</h1>{config.visibility.address && config.address && <p>{config.address}</p>}{config.visibility.phone && config.phone && <p dir="ltr">{config.phone}</p>}</div><div><h2>{t('employeePayroll.receiptTitle')}</h2><small>{t('employeePayroll.reference')}</small><p dir="ltr">{payment.reference}</p><time dateTime={payment.paidOn}>{payment.paidOn}</time></div></header>
      <section className="ep-receipt-person"><h3>{t('employeePayroll.employee')}: <span dir="auto">{payment.employeeName}</span></h3>{payment.employeePhone && <p>{t('employeePayroll.phone')}: <bdi dir="ltr">{payment.employeePhone}</bdi></p>}{payment.employeeCin && <p>{t('employeePayroll.cin')}: <bdi>{payment.employeeCin}</bdi></p>}<p>{t('employeePayroll.forMonth')}: <bdi>{payment.month}</bdi></p><p>{t('employeePayroll.agreement')}: {t(`employeePayroll.${payment.compensationType}`)}</p></section>
      <dl>{[['earned', payment.earned], ...(payment.compensationType === 'profitShare' ? [['salesProfit', payment.profit]] : []), ['paidBefore', payment.paidBefore], ['paymentAmount', payment.amount], ['paidAfter', payment.paidAfter], ['remaining', payment.remaining]].map(([key, value]) => <div key={key} className={key === 'paymentAmount' ? 'is-payment' : key === 'remaining' ? 'is-remaining' : ''}><dt>{t(`employeePayroll.${key}`)}</dt><dd data-employee-receipt-amount={key} data-value={value}><bdi>{money(value)}</bdi></dd></div>)}</dl>
      {payment.note && <p dir="auto">{t('employeePayroll.note')}: {payment.note}</p>}<p>{t('employeePayroll.payer')}: <span dir="auto">{payment.createdByName}</span></p><p className="ep-receipt-hint">{t('employeePayroll.receiptHint')}</p>
      <footer><span>{t('employeePayroll.received')}</span><span>{t('employeePayroll.payerSignature')}</span></footer>
    </article>
  </EmployeePayrollModal>;
}
