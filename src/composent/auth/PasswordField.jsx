import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function PasswordField({ id, label, hint, ...props }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</label>
    <div className="relative">
      <input {...props} id={id} type={visible ? 'text' : 'password'} dir="ltr" aria-describedby={hint ? id + '-hint' : undefined} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-14 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
      <button type="button" disabled={props.disabled} aria-controls={id} aria-pressed={visible} aria-label={t('adminRecovery.' + (visible ? 'hide' : 'show')) + ': ' + label} onClick={() => setVisible(value => !value)} className="absolute right-1 top-1 bottom-1 rounded-lg px-3 text-slate-500 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:hover:bg-slate-700">
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
    {hint && <p id={id + '-hint'} className="text-xs leading-6 text-slate-500 dark:text-slate-400">{hint}</p>}
  </div>;
}
