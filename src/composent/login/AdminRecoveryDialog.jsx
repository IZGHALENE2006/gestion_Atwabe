import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { KeyRound, X, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PasswordField from '../auth/PasswordField.jsx';
import { recoveryCodeError, recoveryEmail } from '../../../shared/adminRecovery.js';
import { passwordResetError } from '../../../shared/passwordChange.js';
import { apiErrorMessage } from '../../i18n/apiErrors.js';

const base = (import.meta.env.VITE_API_URL || 'http://localhost:7000') + '/api/admin/recovery';

export default function AdminRecoveryDialog({ initialEmail, onClose, onRecovered }) {
  const { t, i18n } = useTranslation();
  const dialog = useRef(null), busyRef = useRef(false);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [proof, setProof] = useState('');
  const [password, setPassword] = useState({ newpass: '', newpass2: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const node = dialog.current; node.showModal(); return () => node.close(); }, []);

  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    setError('');
    const invalid = proof ? passwordResetError(password) : !recoveryEmail(email) ? 'invalidEmail' : recoveryCodeError(code);
    if (invalid) { setError(invalid === 'invalidEmail' ? t('adminRecovery.invalidEmail') : apiErrorMessage(invalid, t)); return; }
    busyRef.current = true; setBusy(true);
    try {
      if (!proof) {
        const { data } = await axios.post(base + '/verify', { email: email.trim(), code });
        setProof(data.proof); setCode('');
      } else {
        await axios.post(base + '/reset', { proof, ...password });
        setProof(''); setPassword({ newpass: '', newpass2: '' }); onRecovered(email.trim());
      }
    } catch (err) {
      setError(apiErrorMessage(err, t));
      if (err.response?.data?.message === 'recoveryExpired') { setProof(''); setPassword({ newpass: '', newpass2: '' }); }
    } finally { busyRef.current = false; setBusy(false); }
  }
  const changePassword = name => event => { setPassword(value => ({ ...value, [name]: event.target.value })); setError(''); };
  return <dialog ref={dialog} aria-labelledby="admin-recovery-title" dir={i18n.dir()} onCancel={event => { event.preventDefault(); if (!busyRef.current) onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:p-8">
    <div className="flex items-center justify-between gap-3">
      <span className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-500/10"><KeyRound size={24} /></span>
      <button type="button" disabled={busy} onClick={onClose} aria-label={t('adminRecovery.close')} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X size={22} /></button>
    </div>
    <h2 id="admin-recovery-title" className="mt-5 text-2xl font-black">{t('adminRecovery.recoverTitle')}</h2>
    <p className="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">{t('adminRecovery.' + (proof ? 'resetHint' : 'verifyHint'))}</p>
    <ol aria-label={t('adminRecovery.recoverTitle')} className="my-6 flex gap-3 text-sm font-bold">
      <li aria-current={!proof ? 'step' : undefined} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{proof ? <CheckCircle2 size={18} /> : '1'} {t('adminRecovery.verify')}</li>
      <li aria-current={proof ? 'step' : undefined} className={'flex flex-1 items-center justify-center gap-2 rounded-xl p-3 ' + (proof ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>2 {t('adminRecovery.newPassword')}</li>
    </ol>
    <form key={proof ? 'reset' : 'verify'} onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
      {!proof ? <>
        <div className="space-y-2"><label htmlFor="recovery-email" className="block text-sm font-bold">{t('adminRecovery.email')}</label><input id="recovery-email" type="email" dir="ltr" autoComplete="username" autoFocus value={email} onChange={event => { setEmail(event.target.value); setError(''); }} required disabled={busy} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" /></div>
        <PasswordField id="recovery-code" label={t('adminRecovery.code')} value={code} onChange={event => { setCode(event.target.value); setError(''); }} autoComplete="off" required disabled={busy} />
      </> : <>
        <p dir="ltr" className="break-all rounded-xl bg-slate-50 px-4 py-2 text-center text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">{email.trim()}</p>
        <PasswordField id="recovery-newpass" label={t('adminRecovery.newPassword')} value={password.newpass} onChange={changePassword('newpass')} autoComplete="new-password" autoFocus required disabled={busy} hint={t('adminRecovery.passwordHint')} />
        <PasswordField id="recovery-newpass2" label={t('adminRecovery.confirmPassword')} value={password.newpass2} onChange={changePassword('newpass2')} autoComplete="new-password" required disabled={busy} />
      </>}
      {error && <p role="alert" data-recovery-error className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      <button type="submit" data-submit-recovery disabled={busy} className="w-full rounded-xl bg-blue-600 px-5 py-3.5 font-bold text-white hover:bg-blue-700 disabled:opacity-60">{t('adminRecovery.' + (proof ? busy ? 'resetting' : 'reset' : busy ? 'verifying' : 'verify'))}</button>
      {proof && <button type="button" disabled={busy} onClick={() => { setProof(''); setPassword({ newpass: '', newpass2: '' }); setError(''); }} className="w-full py-2 text-sm font-bold text-slate-500 hover:text-blue-600">{t('adminRecovery.back')}</button>}
    </form>
  </dialog>;
}
