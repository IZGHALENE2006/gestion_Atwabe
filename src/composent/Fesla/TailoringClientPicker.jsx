import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadTailoringClients } from './feslaApi.js';

export default function TailoringClientPicker({ token, value, onChange, disabled, showDebt, error }) {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const state = result?.token === token && result.attempt === attempt ? result : { loading: true, clients: [] };
  useEffect(() => {
    const controller = new AbortController();
    loadTailoringClients(token, controller.signal).then(data => {
      if (!Array.isArray(data.clients)) throw Error('Invalid clients');
      if (!controller.signal.aborted) setResult({ token, attempt, clients: data.clients, loading: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ token, attempt, clients: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [token, attempt]);
  const client = state.clients.find(row => row._id === value);
  const money = amount => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return <div className="tailoring-client-picker">
    <label><span>{t('tailoringCredit.select')}</span><select data-tailoring-client value={value || ''} disabled={disabled || state.loading} aria-invalid={Boolean(error)} onChange={event => onChange(state.clients.find(row => row._id === event.target.value) || null)}><option value="">{t(state.loading ? 'tailoringCredit.loading' : 'tailoringCredit.manual')}</option>{state.clients.map(row => <option key={row._id} value={row._id}>{row.name} · {row.phone}</option>)}</select></label>
    {(state.error || error) && <p role="alert">{t('tailoringCredit.errors.' + (error || 'creditClientsFailed'))}{state.error && <button type="button" disabled={disabled} onClick={() => setAttempt(n => n + 1)}>{t('tailoringCredit.retry')}</button>}</p>}
    {showDebt && client?.creditRemainingAmount > 0 && <p className="tailoring-client-warning" role="status" data-client-existing-debt={client.creditRemainingAmount}>{t('tailoringCredit.previousDebt', { amount: money(client.creditRemainingAmount) })}</p>}
    {showDebt && client?.creditAmbiguous && <p role="alert">{t('tailoringCredit.errors.creditCustomerAmbiguous')}</p>}
  </div>;
}
