import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nextPayrollMonth, payrollMonth, validateCompensation } from '../../../shared/employeePayroll.js';
import EmployeeCompensationFields from './EmployeeCompensationFields.jsx';
import EmployeePayrollModal from './EmployeePayrollModal.jsx';
import { employeePayrollError, employeePayrollRequest } from './employeePayrollApi.js';

export default function EmployeeCompensationDialog({ employee, plans, onClose, onSaved }) {
  const { t } = useTranslation(), lock = useRef(false), latest = [...plans].sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth)).at(-1);
  const minMonth = plans.length ? nextPayrollMonth(payrollMonth()) : undefined;
  const [form, setForm] = useState({ type: latest?.type || 'monthly', monthlyAmount: latest?.monthlyAmount || '', effectiveMonth: minMonth || payrollMonth() });
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); if (lock.current) return;
    let input; try { input = validateCompensation(form); } catch { setError('employeePayroll.errors.employeeCompensationInvalid'); return; }
    lock.current = true; setSaving(true); setError('');
    try { await employeePayrollRequest(employee._id, 'compensation', input); onSaved(); }
    catch (failure) { setError(employeePayrollError(failure)); }
    finally { lock.current = false; setSaving(false); }
  };
  return <EmployeePayrollModal title={t(plans.length ? 'employeePayroll.change' : 'employeePayroll.configure')} subtitle={employee.name} busy={saving} onClose={onClose} footer={<><button type="button" disabled={saving} onClick={onClose}>{t('employeePayroll.cancel')}</button><button type="submit" form="ep-compensation-form" disabled={saving} className="ep-primary">{t(saving ? 'employeePayroll.loading' : 'employeePayroll.save')}</button></>}>
    {plans.length > 0 && <p className="ep-notice">{t('employeePayroll.futureHint')}</p>}
    <form id="ep-compensation-form" onSubmit={submit}><EmployeeCompensationFields value={form} onChange={setForm} disabled={saving} minMonth={minMonth} id="ep-agreement"/></form>
    {error && <p className="ep-error" role="alert">{t(error)}</p>}
  </EmployeePayrollModal>;
}
