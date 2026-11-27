import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoShieldCheckmarkOutline, IoEyeOutline, IoEyeOffOutline, IoCheckmarkCircleOutline } from 'react-icons/io5';
import { UpdatePassword } from '../../slices/SliceLoginAdmin';
import { apiErrorMessage } from '../../i18n/apiErrors.js';
import { passwordChangeError } from '../../../shared/passwordChange.js';

const emptyPasswords = () => ({ old: '', newpass: '', newpass2: '' });
const fields = [
  { name: 'old', label: 'currentPassword', autoComplete: 'current-password' },
  { name: 'newpass', label: 'newPassword', autoComplete: 'new-password' },
  { name: 'newpass2', label: 'confirmPassword', autoComplete: 'new-password' },
];

export default function ChangePassword() {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch(), navigate = useNavigate(), busyRef = useRef(false);
  const [passwords, setPasswords] = useState(emptyPasswords);
  const [visible, setVisible] = useState({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);

  const submit = async event => {
    event.preventDefault();
    if (busyRef.current) return;
    setSaved(false);
    const invalid = passwordChangeError(passwords);
    if (invalid) { setError(apiErrorMessage(invalid, t)); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      await dispatch(UpdatePassword(passwords)).unwrap();
      setPasswords(emptyPasswords()); setVisible({}); setSaved(true);
    } catch (failure) { setError(apiErrorMessage(failure, t, 'changePassword.somethingWrong')); }
    finally { busyRef.current = false; setBusy(false); }
  };

  return <main dir={i18n.dir()} className="flex min-h-[80vh] items-center justify-center bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-8">
    <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900" aria-labelledby="change-password-title">
      <header className="border-b border-slate-100 px-6 py-7 dark:border-slate-800 sm:px-8">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><IoShieldCheckmarkOutline size={30} aria-hidden="true" /></div>
        <h1 id="change-password-title" className="text-2xl font-bold">{t('changePassword.updateButton')}</h1>
        <p className="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400">{t('changePassword.updatePrompt')}</p>
      </header>
      <form noValidate onSubmit={submit} className="space-y-5 p-6 sm:p-8" aria-busy={busy}>
        {saved && <p role="status" data-password-updated className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><IoCheckmarkCircleOutline size={22} className="shrink-0" aria-hidden="true" />{t('changePassword.updatedSuccess')}</p>}
        {fields.map(field => <div key={field.name}>
          <label htmlFor={'change-password-' + field.name} className="mb-2 block text-sm font-bold">{t('changePassword.' + field.label)}</label>
          <div className="relative">
            <input id={'change-password-' + field.name} name={field.name} type={visible[field.name] ? 'text' : 'password'} dir="ltr" autoComplete={field.autoComplete} required value={passwords[field.name]} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? 'password-change-error' : field.name === 'newpass' ? 'new-password-hint' : undefined} onChange={event => { setPasswords(current => ({ ...current, [field.name]: event.target.value })); setError(''); setSaved(false); }} className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pr-12 pl-4 text-base outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:focus:ring-blue-950" />
            <button type="button" disabled={busy} onClick={() => setVisible(current => ({ ...current, [field.name]: !current[field.name] }))} aria-label={t('changePassword.' + (visible[field.name] ? 'hidePassword' : 'showPassword')) + ': ' + t('changePassword.' + field.label)} aria-pressed={Boolean(visible[field.name])} aria-controls={'change-password-' + field.name} className="absolute top-1/2 right-2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:bg-slate-700">{visible[field.name] ? <IoEyeOffOutline size={21} /> : <IoEyeOutline size={21} />}</button>
          </div>
          {field.name === 'newpass' && <p id="new-password-hint" className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('changePassword.minChars')}</p>}
        </div>)}
        {error && <p id="password-change-error" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" disabled={busy} data-save-password className="min-h-12 flex-1 cursor-pointer rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{t(busy ? 'changePassword.saving' : 'changePassword.updateButton')}</button>
          <button type="button" disabled={busy} onClick={() => navigate('/Home/profile')} className="min-h-12 cursor-pointer rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800">{t('common.cancel')}</button>
        </div>
      </form>
    </section>
  </main>;
}
