import { useTranslation } from 'react-i18next';
import { nextPayrollMonth, payrollMonth } from '../../../shared/employeePayroll.js';
import './employeePayroll.css';

export default function EmployeeCompensationFields({ value, onChange, disabled = false, minMonth, id = 'employee-compensation' }) {
  const { t } = useTranslation();
  const set = (field, next) => onChange({ ...value, [field]: next });
  return <fieldset className="ep-compensation" disabled={disabled}>
    <legend>{t('employeePayroll.agreement')}</legend>
    <div className="ep-type-options">{['monthly', 'profitShare'].map(type => <label key={type} className={value.type === type ? 'is-selected' : ''}><input type="radio" name={`${id}-type`} value={type} checked={value.type === type} onChange={() => set('type', type)}/><strong>{t(`employeePayroll.${type}`)}</strong></label>)}</div>
    <div className="ep-fields">{value.type === 'monthly' && <label htmlFor={`${id}-amount`}>{t('employeePayroll.monthlyAmount')}<input id={`${id}-amount`} type="number" dir="ltr" inputMode="decimal" min="0.01" max="1000000000" step="0.01" required value={value.monthlyAmount} onChange={event => set('monthlyAmount', event.target.value)}/></label>}
      <label htmlFor={`${id}-month`}>{t('employeePayroll.effectiveMonth')}<input id={`${id}-month`} type="month" dir="ltr" min={minMonth || '1900-01'} max={nextPayrollMonth(payrollMonth())} required value={value.effectiveMonth} onChange={event => set('effectiveMonth', event.target.value)}/></label></div>
    <p>{t(`employeePayroll.${value.type === 'monthly' ? 'monthlyHint' : 'shareHint'}`)}</p>
  </fieldset>;
}
