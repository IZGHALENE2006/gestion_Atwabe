import { createElement, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IoWalletOutline, IoCheckmarkCircleOutline, IoTimeOutline, IoReceiptOutline, IoAddOutline, IoArrowBackOutline } from 'react-icons/io5';
import { payrollMonth } from '../../../shared/employeePayroll.js';
import { employeePayrollError, employeePayrollRequest } from './employeePayrollApi.js';
import EmployeeCompensationDialog from './EmployeeCompensationDialog.jsx';
import EmployeePaymentDialog from './EmployeePaymentDialog.jsx';
import EmployeePayrollReceipt from './EmployeePayrollReceipt.jsx';
import './employeePayroll.css';

export default function EmployeePayrollPage() {
  const { id } = useParams(), { t, i18n } = useTranslation();
  const current = payrollMonth(), [year, setYear] = useState(current.slice(0, 4)), [month, setMonth] = useState(current);
  const [state, setState] = useState({ loading: true, error: '', data: null }), [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState(false), [payment, setPayment] = useState(null), [receipt, setReceipt] = useState(null), [tab, setTab] = useState('payments');
  const reload = () => setAttempt(value => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    employeePayrollRequest(id, `payroll?month=${month}`, undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ data, loading: false, error: '' });
    }).catch(error => { if (!controller.signal.aborted) setState(previous => ({ ...previous, loading: false, error: employeePayrollError(error) })); });
    return () => controller.abort();
  }, [id, month, attempt]);
  const locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', money = value => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ' + t('employeePayroll.currency');
  const monthName = value => new Date(`${value}-15T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const data = state.data?.employee._id === id ? state.data : null, months = (data?.months || []).filter(row => !year || row.month.startsWith(year));
  const totals = Object.fromEntries(['earned', 'paid', 'due', 'overpaid'].map(key => [key, months.reduce((sum, row) => sum + Math.round(row[key] * 100), 0) / 100]));
  const selected = data?.months.find(row => row.month === month), payments = data?.payments.filter(item => item.month === month) || [];
  const years = [...new Set([current.slice(0, 4), ...(data?.months || []).map(row => row.month.slice(0, 4))])].sort().reverse();
  const selectMonth = value => { setMonth(value); setState(previous => ({ ...previous, loading: true, error: '' })); };
  const rowPayment = row => { setPayment(row); };
  return <main className="employee-payroll-page" dir={i18n.dir()} data-employee-payroll-page>
    <Link to="/Home/employees/EmployeeDashboard" className="ep-back"><IoArrowBackOutline/>{t('employeePayroll.back')}</Link>
    <header className="ep-page-header"><div><span className="ep-eyebrow">{t('employeePayroll.title')}</span><h1 dir="auto">{data?.employee.name || t('employeePayroll.employee')}</h1>{data?.employee.phone && <p dir="ltr">{data.employee.phone}</p>}</div>{data && <button type="button" className="ep-primary" data-configure-employee-compensation onClick={() => setSettings(true)}><IoWalletOutline/>{t(`employeePayroll.${data.plans.length ? 'change' : 'configure'}`)}</button>}</header>
    {state.error && <div className="ep-error" role="alert">{t(state.error)} <button type="button" onClick={reload}>{t('employeePayroll.retry')}</button></div>}
    {state.loading && <p role="status">{t('employeePayroll.loading')}</p>}
    {data && <>
      {!data.plans.length && <div className="ep-notice">{t('employeePayroll.notConfigured')}</div>}
      <section className="ep-totals" aria-label={t('employeePayroll.title')}>{[['earned', 'totalEarned', IoWalletOutline], ['paid', 'totalPaid', IoCheckmarkCircleOutline], ['due', 'totalDue', IoTimeOutline]].map(([key, label, icon]) => <article key={key} className={`ep-total ep-total-${key}`}><span>{createElement(icon, { size: 23 })}{t(`employeePayroll.${label}`)}</span><strong data-employee-payroll-total={key}>{money(data.totals[key])}</strong></article>)}</section>
      {data.totals.overpaid > 0 && <div className="ep-notice">{t('employeePayroll.totalOverpaid')}: {money(data.totals.overpaid)}. {t('employeePayroll.overpaidHint')}</div>}
      <section className="ep-section"><header className="ep-section-header"><div><h2>{t('employeePayroll.month')}</h2><p>{t('employeePayroll.selectedYear')} · {t('employeePayroll.due')}: {money(totals.due)}</p></div><label className="ep-year">{t('employeePayroll.year')}<select data-employee-payroll-year value={year} onChange={event => setYear(event.target.value)}><option value="">{t('employeePayroll.allYears')}</option>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label></header>
        <div className="ep-table-scroll"><table><thead><tr>{['month', 'agreement', 'earned', 'paid', 'due', 'status', 'details'].map(key => <th scope="col" key={key}>{t(`employeePayroll.${key}`)}</th>)}</tr></thead><tbody>{months.map(row => <tr key={row.month} data-employee-payroll-month={row.month} className={month === row.month ? 'is-current' : ''}><th scope="row">{monthName(row.month)}</th><td>{t(`employeePayroll.${row.type}`)}</td><td><bdi>{money(row.earned)}</bdi></td><td className="ep-green"><bdi>{money(row.paid)}</bdi></td><td className="ep-amber"><bdi>{money(row.due)}</bdi></td><td><span className={`ep-status ep-status-${row.status}`}>{t(`employeePayroll.${row.status === 'paid' ? 'paidStatus' : row.status}`)}</span></td><td><div className="ep-row-actions"><button type="button" data-employee-month-details={row.month} onClick={() => { selectMonth(row.month); document.querySelector("[data-employee-month-panel]")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{t('employeePayroll.details')}</button>{row.due > 0 && !(row.type === 'profitShare' && row.unpriced) && <button type="button" className="ep-primary" data-pay-employee-month={row.month} disabled={Boolean(state.error)} onClick={() => rowPayment(row)}><IoAddOutline/>{t('employeePayroll.pay')}</button>}</div></td></tr>)}</tbody></table></div>
        {!months.length && <p className="ep-empty">{t('employeePayroll.empty')}</p>}
      </section>
      <section className="ep-section" data-employee-month-panel><header className="ep-section-header"><div><h2>{monthName(month)}</h2>{selected && <p>{t('employeePayroll.earned')}: {money(selected.earned)} · {t('employeePayroll.due')}: {money(selected.due)}</p>}</div>{selected?.type === 'profitShare' && <strong className="ep-green">{t('employeePayroll.salesProfit')}: {money(selected.profit)} ÷ 3</strong>}</header>
        {selected?.provisional && <p className="ep-notice">{t('employeePayroll.provisional')}</p>}{selected?.unpriced > 0 && selected.type === 'profitShare' && <p className="ep-error">{t('employeePayroll.missingProfit')}</p>}
        <div className="ep-tabs" role="tablist">{['payments', 'sales'].map(key => <button key={key} type="button" role="tab" id={`ep-tab-${key}`} aria-controls={`ep-panel-${key}`} aria-selected={tab === key} onClick={() => setTab(key)}>{t(`employeePayroll.${key}`)} <span>{key === 'payments' ? payments.length : state.loading ? '…' : data.sales.length}</span></button>)}</div>
        <div role="tabpanel" id={`ep-panel-${tab}`} aria-labelledby={`ep-tab-${tab}`}>
          {state.loading ? <p className="ep-empty">{t('employeePayroll.loading')}</p> : tab === 'payments' ? <>{payments.length ? <div className="ep-table-scroll"><table><thead><tr>{['paidOn', 'paymentAmount', 'createdBy', 'note', 'receipt'].map(key => <th key={key} scope="col">{t(`employeePayroll.${key}`)}</th>)}</tr></thead><tbody>{payments.map(item => <tr key={item._id}><td><time dateTime={item.paidOn}>{item.paidOn}</time></td><td className="ep-green"><bdi>{money(item.amount)}</bdi></td><td dir="auto">{item.createdByName}</td><td dir="auto">{item.note || '—'}</td><td><button type="button" data-employee-payment-receipt={item._id} onClick={() => setReceipt(item)}><IoReceiptOutline/>{t('employeePayroll.receipt')}</button></td></tr>)}</tbody></table></div> : <p className="ep-empty">{t('employeePayroll.noPayments')}</p>}</> : <>{data.sales.length ? <div className="ep-table-scroll"><table><thead><tr>{['date', 'product', 'quantity', 'profit'].map(key => <th key={key} scope="col">{t(`employeePayroll.${key}`)}</th>)}</tr></thead><tbody>{data.sales.map(sale => <tr key={sale._id}><td>{new Date(sale.date).toLocaleString(locale)}<small>{t(`employeePayroll.${sale.saleType === 'credit' ? 'credit' : 'cashier'}`)}</small></td><td dir="auto">{sale.name}</td><td>{sale.quantity}</td><td><bdi>{sale.profit === null ? '—' : money(sale.profit)}</bdi></td></tr>)}</tbody></table></div> : <p className="ep-empty">{t('employeePayroll.noSales')}</p>}</>}
        </div>
      </section>
      {data.plans.length > 0 && <details className="ep-agreement-history"><summary>{t('employeePayroll.history')}</summary><div className="ep-table-scroll"><table><thead><tr>{['effectiveMonth', 'agreement', 'monthlyAmount', 'createdBy'].map(key => <th key={key} scope="col">{t(`employeePayroll.${key}`)}</th>)}</tr></thead><tbody>{[...data.plans].sort((a,b) => b.effectiveMonth.localeCompare(a.effectiveMonth)).map(plan => <tr key={plan.effectiveMonth}><td>{monthName(plan.effectiveMonth)}</td><td>{t(`employeePayroll.${plan.type}`)}</td><td>{plan.type === 'monthly' ? money(plan.monthlyAmount) : '⅓'}</td><td dir="auto">{plan.createdByName || '—'}</td></tr>)}</tbody></table></div></details>}
      {settings && <EmployeeCompensationDialog employee={data.employee} plans={data.plans} onClose={() => setSettings(false)} onSaved={() => { setSettings(false); reload(); }}/>} 
      {payment && <EmployeePaymentDialog employee={data.employee} month={payment} onClose={() => setPayment(null)} onReload={reload} onSaved={result => { setPayment(null); setReceipt(result); selectMonth(result.month); reload(); }}/>} 
      {receipt && <EmployeePayrollReceipt payment={receipt} onClose={() => setReceipt(null)}/>}
    </>}
  </main>;
}
