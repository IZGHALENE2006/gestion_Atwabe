import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { payrollDay, validateEmployeePayment } from '../../../shared/employeePayroll.js';
import { employeePayrollError, employeePayrollRequest } from './employeePayrollApi.js';
import EmployeePayrollModal from './EmployeePayrollModal.jsx';

export default function EmployeePaymentDialog({ employee, month, onClose, onSaved, onReload }) {
  const { t } = useTranslation(), savingRef = useRef(false), requestRef = useRef(null);
  const [form, setForm] = useState({ month: month.month, amount: String(month.due), paidOn: payrollDay(), note: '' });
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); if (savingRef.current) return;
    let input;
    try { input = validateEmployeePayment(form); } catch { setError('employeePayroll.errors.employeePaymentInvalid'); return; }
    const fingerprint = JSON.stringify(input);
    if (requestRef.current?.fingerprint !== fingerprint) requestRef.current = { fingerprint, id: crypto.randomUUID() };
    savingRef.current = true; setSaving(true); setError('');
    try { const result = await employeePayrollRequest(employee._id, 'payments', { ...input, requestId: requestRef.current.id }); onSaved(result.payment); }
    catch (failure) { setError(employeePayrollError(failure)); onReload(); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <EmployeePayrollModal title={t('employeePayroll.paymentTitle')} subtitle={`${employee.name} · ${month.month}`} onClose={onClose} busy={saving} footer={<><button type="button" disabled={saving} onClick={onClose}>{t('employeePayroll.cancel')}</button><button type="submit" form="ep-payment-form" className="ep-primary" disabled={saving}>{t(saving ? 'employeePayroll.loading' : 'employeePayroll.confirmPayment')}</button></>}>
    <div className="ep-payment-balance"><span>{t('employeePayroll.due')}</span><strong dir="auto">{month.due.toFixed(2)} {t('employeePayroll.currency')}</strong></div>
    <form id="ep-payment-form" onSubmit={submit}><fieldset disabled={saving} className="ep-fields">
      <label htmlFor="ep-payment-amount">{t('employeePayroll.amount')}<input id="ep-payment-amount" dir="ltr" type="number" inputMode="decimal" min="0.01" max={month.due} step="0.01" required value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })}/></label>
      <label htmlFor="ep-payment-date">{t('employeePayroll.paidOn')}<input id="ep-payment-date" dir="ltr" type="date" max={payrollDay()} min="1900-01-01" required value={form.paidOn} onChange={event => setForm({ ...form, paidOn: event.target.value })}/></label>
      <label htmlFor="ep-payment-note" className="ep-full">{t('employeePayroll.note')}<textarea id="ep-payment-note" maxLength={300} rows={3} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })}/></label>
    </fieldset></form>{error && <p className="ep-error" role="alert">{t(error)}</p>}
  </EmployeePayrollModal>;
}
