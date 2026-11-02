import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import {
  IoAddOutline, IoCashOutline, IoCloseOutline, IoFlashOutline,
  IoHomeOutline, IoWaterOutline, IoWifiOutline,
} from 'react-icons/io5';
import { EXPENSE_REQUEST_PATTERN, FIXED_EXPENSE_TYPES, currentExpenseMonth, expenseKind, expenseMonth, fixedExpenseAmount, monthlyExpenseTotals, validateSideExpense } from '../../../shared/sideExpenses.js';
import { clearPendingExpense, keepPendingExpense, loadSideExpenses, readPendingExpense, saveSideExpense } from './sideExpensesApi.js';
import './SideExpenses.css';

const expenseTypes = [
  { id: 'water', icon: IoWaterOutline, tone: 'blue' },
  { id: 'electricity', icon: IoFlashOutline, tone: 'amber' },
  { id: 'internet', icon: IoWifiOutline, tone: 'violet' },
  { id: 'rent', icon: IoHomeOutline, tone: 'green' },
];

function ExpenseTypeDialog({ token, items, initialType = '', initialMonth, onSaved, onClose, onReload }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  const otherRef = useRef(null);
  const [initialPending] = useState(() => {
    const pending = readPendingExpense(token);
    try { validateSideExpense(pending); return EXPENSE_REQUEST_PATTERN.test(pending.requestId) ? pending : null; }
    catch { return null; }
  });
  const submissionRef = useRef(initialPending), savingRef = useRef(false);
  const [type, setType] = useState(initialPending?.type || initialType);
  const [month, setMonth] = useState(initialPending?.month || initialMonth);
  const [otherName, setOtherName] = useState(initialPending?.otherName || '');
  const [amount, setAmount] = useState(() => {
    if (initialPending) return initialPending.amount;
    const quote = fixedExpenseAmount(items, initialType, initialMonth);
    return quote === null ? '' : (quote / 100).toFixed(2);
  });
  const [fields, setFields] = useState({}), [error, setError] = useState(initialPending ? 'pending' : '');
  const [saving, setSaving] = useState(false), [locked, setLocked] = useState(Boolean(initialPending));

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector('input:checked, input[type="radio"]')?.focus();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    if (type === 'other') otherRef.current?.focus();
  }, [type]);

  const close = () => {
    if (savingRef.current) return;
    dialogRef.current.close();
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    let input;
    try { input = validateSideExpense(submissionRef.current || { type, otherName, amount, month }); }
    catch (failure) { setFields(failure.fields || {}); setError('invalidExpense'); return; }
    const request = submissionRef.current || { type: input.type, otherName: input.otherName, amount: (input.amountCents / 100).toFixed(2), month: input.month, requestId: crypto.randomUUID() };
    try { keepPendingExpense(token, request); }
    catch { setError('storageFailed'); return; }
    submissionRef.current = request;
    savingRef.current = true; setSaving(true); setLocked(true); setFields({}); setError('');
    try {
      const expense = await saveSideExpense(request, token);
      clearPendingExpense(token);
      onSaved(expense);
      dialogRef.current?.close();
      onClose();
    } catch (failure) {
      const status = failure.response?.status;
      if ([400, 401, 403, 409].includes(status)) {
        clearPendingExpense(token); submissionRef.current = null; setLocked(false);
        setFields(failure.response?.data?.fields || {});
        const message = failure.response?.data?.message;
        setError(status === 401 || status === 403 ? 'forbidden' : ['invalidExpense', 'invalidRequest', 'requestConflict', 'fixedExpenseExists'].includes(message) ? message : 'saveFailed');
      } else setError('pending');
    } finally { savingRef.current = false; setSaving(false); }
  };
  const patch = setter => event => { setter(event.target.value); setFields({}); setError(''); };
  const chooseType = event => {
    const nextType = event.target.value, quote = fixedExpenseAmount(items, nextType, month);
    setType(nextType); setAmount(quote === null ? '' : (quote / 100).toFixed(2)); setFields({}); setError('');
  };
  const chooseMonth = event => {
    const nextMonth = event.target.value, quote = fixedExpenseAmount(items, type, nextMonth);
    setMonth(nextMonth); setAmount(quote === null ? '' : (quote / 100).toFixed(2)); setFields({}); setError('');
  };
  const fixed = expenseKind(type) === 'fixed';
  const fixedRecorded = fixed && items.some(item => item.type === type && expenseMonth(item) === month);
  const fieldError = name => fields[name] && <p id={`expense-${name}-error`} className="side-expenses-field-error">{t(`sideExpenses.errors.${fields[name]}`)}</p>;

  return (
    <dialog
      ref={dialogRef}
      className="side-expenses-dialog"
      dir={i18n.dir()}
      aria-labelledby="expense-dialog-title"
      aria-describedby="expense-dialog-description"
      onCancel={(event) => { event.preventDefault(); close(); }}
    >
      <form onSubmit={submit} noValidate>
        <header className="side-expenses-dialog-header">
          <div>
            <h2 id="expense-dialog-title">{t('sideExpenses.add')}</h2>
            <p id="expense-dialog-description">{t('sideExpenses.chooseHint')}</p>
          </div>
          <button type="button" className="side-expenses-close" disabled={saving} onClick={close} aria-label={t('sideExpenses.close')}>
            <IoCloseOutline size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="side-expenses-dialog-body">
          <fieldset disabled={saving || locked}>
            <legend>{t('sideExpenses.typeLabel')}</legend>
            <div className="side-expenses-month-field"><label htmlFor="expense-month">{t('sideExpenses.monthLabel')}</label><input id="expense-month" type="month" dir="ltr" min="1900-01" max="9999-12" value={month} onChange={chooseMonth} required aria-invalid={Boolean(fields.month)} aria-describedby={fields.month ? 'expense-month-error' : undefined} />{fieldError('month')}</div>
            {fieldError('type')}
            <div className="side-expenses-options">
              {expenseTypes.map((expenseType) => {
                const { id, tone, icon: Icon } = expenseType;
                return (
                  <label key={id} className="side-expenses-option">
                    <span className={`side-expenses-icon side-expenses-icon-${tone}`}><Icon size={25} aria-hidden="true" /></span>
                    <span>{t(`sideExpenses.types.${id}`)}<small className="side-expenses-option-kind">{t(`sideExpenses.kinds.${expenseKind(id)}`)}</small></span>
                    <input type="radio" name="expenseType" value={id} checked={type === id} onChange={chooseType} required aria-invalid={Boolean(fields.type)} />
                  </label>
                );
              })}
            </div>
            <div className="side-expenses-other">
              <label className="side-expenses-other-choice">
                <input type="radio" name="expenseType" value="other" checked={type === 'other'} onChange={chooseType} required aria-invalid={Boolean(fields.type)} />
                <span>{t('sideExpenses.types.other')}</span>
              </label>
              {type === 'other' && <><label htmlFor="other-expense-name" className="side-expenses-input-label">{t('sideExpenses.otherName')}</label>
              <input
                ref={otherRef}
                id="other-expense-name"
                type="text"
                value={otherName}
                onChange={patch(setOtherName)}
                placeholder={t('sideExpenses.otherPlaceholder')}
                disabled={type !== 'other'}
                required={type === 'other'}
                maxLength={120}
                autoComplete="off"
                aria-invalid={Boolean(fields.otherName)}
                aria-describedby={fields.otherName ? 'expense-otherName-error' : undefined}
              />
              {fieldError('otherName')}</>}
            </div>
            {type && <div className="side-expenses-amount-field">
              <label htmlFor="expense-amount">{t('sideExpenses.amountLabel')}</label>
              <input id="expense-amount" type="text" inputMode="decimal" dir="ltr" value={amount} onChange={patch(setAmount)} placeholder="0.00" maxLength={12} autoComplete="off" required aria-invalid={Boolean(fields.amount)} aria-describedby={`expense-amount-hint${fields.amount ? ' expense-amount-error' : ''}`} />
              <p id="expense-amount-hint" className="side-expenses-amount-hint">{t(fixed ? 'sideExpenses.fixedAmountHint' : 'sideExpenses.variableAmountHint')}</p>
              {fieldError('amount')}
              {fixedRecorded && !locked && <p className="side-expenses-month-notice">{t('sideExpenses.errors.fixedExpenseExists')}</p>}
            </div>}
          </fieldset>
          {error && <div role="alert" className="side-expenses-error"><p>{t(`sideExpenses.errors.${error}`)}</p>{error === 'fixedExpenseExists' && <button type="button" className="side-expenses-secondary" onClick={onReload}>{t('sideExpenses.refresh')}</button>}</div>}
        </div>
        <footer className="side-expenses-dialog-footer">
          <button type="button" className="side-expenses-secondary" disabled={saving} onClick={close}>{t('sideExpenses.cancel')}</button>
          <button type="submit" className="side-expenses-primary" disabled={saving || (fixedRecorded && !locked)} aria-busy={saving}>{t(saving ? 'sideExpenses.saving' : locked ? 'sideExpenses.retrySave' : 'sideExpenses.save')}</button>
        </footer>
      </form>
    </dialog>
  );
}

export default function SideExpenses() {
  const { t, i18n } = useTranslation();
  const token = useSelector(state => state.LoginAdmin.token);
  const [editor, setEditor] = useState(null), [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0), [status, setStatus] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => currentExpenseMonth());
  const state = result?.token === token && result.attempt === attempt ? result : { items: [], permissions: {}, loading: true, error: '' };
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    loadSideExpenses(token, controller.signal).then(data => {
      if (!Array.isArray(data.items)) throw new Error('Invalid expenses response');
      if (!controller.signal.aborted) setResult({ ...data, token, attempt, loading: false, error: '' });
    }).catch(failure => {
      if (!controller.signal.aborted) setResult({ items: [], permissions: {}, token, attempt, loading: false, error: [401, 403].includes(failure.response?.status) ? 'forbidden' : 'loadFailed' });
    });
    return () => controller.abort();
  }, [token, attempt]);
  const closeEditor = () => setEditor(current => current?.token === token ? null : current);
  const saved = expense => {
    setResult(current => current?.token === token ? { ...current, items: [expense, ...current.items.filter(item => item._id !== expense._id)] } : current);
    setStatus({ token, key: 'saved' });
    setSelectedMonth(expense.month || '');
  };
  if (!token) return <Navigate to="/LoginChoise" replace />;
  const visible = state.items.filter(item => !selectedMonth || expenseMonth(item) === selectedMonth);
  const totals = monthlyExpenseTotals(state.items, selectedMonth), totalCents = totals.totalCents;
  const pricingMonth = selectedMonth || currentExpenseMonth();
  const locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const money = cents => new Intl.NumberFormat(locale, { style: 'currency', currency: 'MAD' }).format(cents / 100);
  const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : t('sideExpenses.unknownDate');
  const monthLabel = value => value ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(value + '-15T12:00:00Z')) : t('sideExpenses.unknownMonth');

  return (
    <main className="side-expenses-page" dir={i18n.dir()}>
      <div className="side-expenses-content">
        <header className="side-expenses-header">
          <div>
            <div className="side-expenses-eyebrow"><IoCashOutline size={19} aria-hidden="true" />{t('sideExpenses.typeLabel')}</div>
            <h1>{t('sideExpenses.title')}</h1>
            <p>{t('sideExpenses.subtitle')}</p>
          </div>
          {state.permissions.add && <button type="button" className="side-expenses-primary" onClick={() => { setEditor({ token }); setStatus(null); }}>
            <IoAddOutline size={22} aria-hidden="true" />{t('sideExpenses.add')}
          </button>}
        </header>
        {status?.token === token && <p role="status" className="side-expenses-success">{t(`sideExpenses.${status.key}`)}</p>}
        {state.loading && <p role="status">{t('sideExpenses.loading')}</p>}
        {state.error && <div role="alert" className="side-expenses-error"><p>{t(`sideExpenses.errors.${state.error}`)}</p><button type="button" className="side-expenses-secondary" onClick={() => setAttempt(value => value + 1)}>{t('sideExpenses.retry')}</button></div>}
        {!state.loading && !state.error && <>
          <section className="side-expenses-month-filter" aria-label={t('sideExpenses.filterMonth')}><div><label htmlFor="expense-filter-month">{t('sideExpenses.filterMonth')}</label><input id="expense-filter-month" type="month" dir="ltr" min="1900-01" max="9999-12" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} /></div><button type="button" className="side-expenses-secondary" aria-pressed={!selectedMonth} onClick={() => setSelectedMonth('')}>{t('sideExpenses.allMonths')}</button></section>
          <section className="side-expenses-fixed-section" aria-labelledby="fixed-expenses-title"><h2 id="fixed-expenses-title">{t('sideExpenses.fixedMonthlyTitle')} · {monthLabel(pricingMonth)}</h2><div className="side-expenses-fixed-grid">{FIXED_EXPENSE_TYPES.map(type => {
            const quote = fixedExpenseAmount(state.items, type, pricingMonth), recorded = state.items.some(item => item.type === type && expenseMonth(item) === pricingMonth);
            const Icon = type === 'internet' ? IoWifiOutline : IoHomeOutline;
            return <article key={type} className="side-expenses-fixed-card" data-fixed-expense={type}><div><span className={`side-expenses-icon side-expenses-icon-${type === 'internet' ? 'violet' : 'green'}`}><Icon size={22} aria-hidden="true" /></span><h3>{t(`sideExpenses.types.${type}`)}</h3><span className="side-expenses-kind side-expenses-kind-fixed">{t('sideExpenses.kinds.fixed')}</span></div><p className="side-expenses-fixed-price"><bdi>{quote === null ? t('sideExpenses.notSet') : money(quote)}</bdi></p><p className="side-expenses-amount-hint">{t(recorded ? 'sideExpenses.monthRecorded' : 'sideExpenses.monthNotRecorded')}</p>{state.permissions.add && <button type="button" className="side-expenses-secondary" disabled={recorded} onClick={() => { setEditor({ token, type, month: pricingMonth }); setStatus(null); }}>{t(recorded ? 'sideExpenses.monthRecorded' : 'sideExpenses.recordMonth')}</button>}</article>;
          })}</div><p className="side-expenses-amount-hint">{t('sideExpenses.fixedSummaryHint')}</p></section>
          <div className="side-expenses-total-card">
            <span className="side-expenses-icon side-expenses-icon-blue"><IoCashOutline size={30} aria-hidden="true" /></span>
            <div><dl><dt>{t(selectedMonth ? 'sideExpenses.monthTotal' : 'sideExpenses.total')}</dt><dd data-expense-total={totalCents}><bdi>{money(totalCents)}</bdi></dd></dl><p>{t('sideExpenses.recordCount', { count: visible.length })}</p><div className="side-expenses-breakdown"><span>{t('sideExpenses.fixedTotal')}: <bdi data-expense-fixed-total={totals.fixedCents}>{money(totals.fixedCents)}</bdi></span><span>{t('sideExpenses.variableTotal')}: <bdi data-expense-variable-total={totals.variableCents}>{money(totals.variableCents)}</bdi></span></div></div>
          </div>
          {visible.length ? <section className="side-expenses-history" aria-labelledby="expense-history-title">
            <h2 id="expense-history-title">{t('sideExpenses.history')}</h2>
            <div className="side-expenses-table-scroll"><table>
              <thead><tr><th scope="col">{t('sideExpenses.typeLabel')}</th><th scope="col">{t('sideExpenses.amountLabel')}</th><th scope="col">{t('sideExpenses.monthLabel')}</th><th scope="col">{t('sideExpenses.dateLabel')}</th></tr></thead>
              <tbody>{visible.map(item => {
                const expenseType = expenseTypes.find(option => option.id === item.type);
                const Icon = expenseType?.icon || IoCashOutline;
                return <tr key={item._id} data-expense-row={item._id}><td><div className="side-expenses-table-type"><span className={`side-expenses-icon side-expenses-icon-${expenseType?.tone || 'blue'}`}><Icon size={20} aria-hidden="true" /></span><span>{item.type === 'other' ? item.otherName : t(`sideExpenses.types.${item.type}`)}<small className={`side-expenses-kind side-expenses-kind-${expenseKind(item.type)}`}>{t(`sideExpenses.kinds.${expenseKind(item.type)}`)}</small></span></div></td><td><strong><bdi>{money(item.amountCents)}</bdi></strong></td><td>{monthLabel(expenseMonth(item))}{item.monthEstimated && <small className="side-expenses-estimated-month">{t('sideExpenses.estimatedMonth')}</small>}</td><td><time dateTime={item.createdAt}>{date(item.createdAt)}</time></td></tr>;
              })}</tbody>
            </table></div>
          </section> : <section className="side-expenses-selection"><span className="side-expenses-icon side-expenses-icon-blue"><IoCashOutline size={34} aria-hidden="true" /></span><h2>{t('sideExpenses.empty')}</h2>{state.permissions.add && <p>{t('sideExpenses.emptyHint')}</p>}</section>}
        </>}
      </div>
      {editor?.token === token && <ExpenseTypeDialog token={token} items={state.items} initialType={editor.type} initialMonth={editor.month || pricingMonth} onSaved={saved} onClose={closeEditor} onReload={() => { closeEditor(); setAttempt(value => value + 1); }} />}
    </main>
  );
}
