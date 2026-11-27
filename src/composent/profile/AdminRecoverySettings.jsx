import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PasswordField from '../auth/PasswordField.jsx';
import { recoveryCodeError } from '../../../shared/adminRecovery.js';
import { apiErrorMessage } from '../../i18n/apiErrors.js';

const url = (import.meta.env.VITE_API_URL || 'http://localhost:7000') + '/api/admin/recovery-code';
const empty = { code: '', confirmation: '', currentPassword: '' };
const headers = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') });

export default function AdminRecoverySettings() {
  const { t } = useTranslation();
  const [fields, setFields] = useState(empty);
  const [configured, setConfigured] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    axios.get(url, { headers: headers(), signal: controller.signal }).then(({ data }) => { setConfigured(data.configured); setStatusError(''); }).catch(err => { if (!controller.signal.aborted) setStatusError(apiErrorMessage(err, t, 'adminRecovery.loadFailed')); });
    return () => controller.abort();
  }, [t, reload]);

  async function save(event) {
    event.preventDefault();
    if (busyRef.current) return;
    setSaved(false); setError('');
    const invalid = recoveryCodeError(fields.code, fields.confirmation);
    if (invalid || !fields.currentPassword) { setError(invalid ? apiErrorMessage(invalid, t) : t('changePassword.allRequired')); return; }
    busyRef.current = true; setBusy(true);
    try {
      await axios.put(url, fields, { headers: headers() });
      setConfigured(true); setFields(empty); setSaved(true);
    } catch (err) { setError(apiErrorMessage(err, t)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const change = name => event => { setFields(value => ({ ...value, [name]: event.target.value })); setSaved(false); setError(''); };
  return <section aria-labelledby="recovery-settings-title" className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-8" data-admin-recovery-settings>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 id="recovery-settings-title" className="flex items-center gap-3 text-lg font-black text-slate-900 dark:text-white"><span className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-500/10"><KeyRound size={22} /></span>{t('adminRecovery.title')}</h3>
      {configured !== null && <span data-recovery-status className={'rounded-full px-3 py-1 text-xs font-bold ' + (configured ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400')}>{t('adminRecovery.' + (configured ? 'configured' : 'notConfigured'))}</span>}
    </div>
    <p className="mt-4 text-sm leading-7 text-slate-500 dark:text-slate-400">{t('adminRecovery.description')}</p>
    {configured === null && (statusError ? <button type="button" onClick={() => { setStatusError(''); setReload(value => value + 1); }} className="mt-2 text-xs text-blue-600 underline">{statusError} ↻</button> : <p role="status" className="mt-2 text-xs text-slate-500">{t('adminRecovery.loading')}</p>)}
    <form onSubmit={save} noValidate className="mt-6 space-y-5" aria-busy={busy}>
      <div className="grid gap-5 md:grid-cols-2">
        <PasswordField id="recovery-settings-code" label={t('adminRecovery.code')} value={fields.code} onChange={change('code')} autoComplete="new-password" required disabled={busy} hint={t('adminRecovery.codeHint')} />
        <PasswordField id="recovery-settings-confirmation" label={t('adminRecovery.confirmCode')} value={fields.confirmation} onChange={change('confirmation')} autoComplete="new-password" required disabled={busy} />
      </div>
      <PasswordField id="recovery-settings-current" label={t('adminRecovery.currentPassword')} value={fields.currentPassword} onChange={change('currentPassword')} autoComplete="current-password" required disabled={busy} hint={t('adminRecovery.replaceHint')} />
      {error && <p role="alert" data-recovery-settings-error className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      {saved && <p role="status" data-recovery-saved className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 size={20} />{t('adminRecovery.saved')}</p>}
      <button type="submit" data-save-recovery-code disabled={busy} className="w-full rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto">{t('adminRecovery.' + (busy ? 'saving' : 'save'))}</button>
    </form>
  </section>;
}
