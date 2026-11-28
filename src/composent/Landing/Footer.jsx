import { Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  return <footer className="border-t border-emerald-900/10 bg-[#f0f6f3] pb-24 pt-12 dark:border-white/10 dark:bg-[#152722]">
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <div className="flex flex-col justify-between gap-8 sm:flex-row"><div className="max-w-md"><a href="#home" className="inline-flex items-center gap-3 text-xl font-black text-slate-900 dark:text-white"><span className="rounded-xl bg-emerald-700 p-2 text-white"><Layers size={22} /></span><span dir="ltr">Stock Pro</span></a><p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-400">{t('landingFooter.description')}</p></div><nav aria-label={t('landingFooter.product')} className="flex flex-wrap items-start gap-x-7 gap-y-4 text-sm font-semibold text-slate-600 dark:text-slate-300"><a href="#about" className="hover:text-emerald-700">{t('landingFooter.features')}</a><Link to="/LoginChoise" className="hover:text-emerald-700">{t('landingFooter.access')}</Link><a href="#contact" className="hover:text-emerald-700">{t('landingFooter.contact')}</a></nav></div>
      <div className="mt-9 flex flex-col justify-between gap-3 border-t border-slate-200 pt-6 text-xs leading-6 text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:flex-row"><p>{t('landingFooter.rights', { year: new Date().getFullYear() })}</p><a href="#team" className="font-semibold hover:text-emerald-700 dark:hover:text-emerald-400">{t('landingFooter.developer')}</a></div>
    </div>
  </footer>;
}
