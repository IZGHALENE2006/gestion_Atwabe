import { Mail, ArrowUpLeft, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Contact() {
  const { t, i18n } = useTranslation();
  const Arrow = i18n.dir() === 'rtl' ? ArrowUpLeft : ArrowUpRight;
  return <section id="contact" className="scroll-mt-24 bg-white py-20 dark:bg-slate-950">
    <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
      <div><p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{t('landingContact.label')}</p><h2 className="mt-4 text-3xl font-black leading-relaxed text-slate-900 dark:text-white">{t('landingContact.title')}</h2><p className="mt-4 max-w-xl text-sm leading-8 text-slate-600 dark:text-slate-400">{t('landingContact.description')}</p><a href="mailto:StockPro@Gmail.com" className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 hover:border-emerald-400 dark:border-slate-700"><Mail className="text-emerald-700 dark:text-emerald-400" size={22} /><span><span className="block text-xs text-slate-500 dark:text-slate-400">{t('landingContact.emailUs')}</span><span dir="ltr" className="block break-all text-sm font-bold text-slate-800 dark:text-slate-100">StockPro@Gmail.com</span></span><Arrow size={18} className="text-slate-400" /></a></div>
      <div className="flex flex-col items-start justify-center rounded-3xl border border-slate-200 bg-slate-50 p-7 dark:border-slate-800 dark:bg-slate-900 sm:p-9"><h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('landingContact.accessTitle')}</h3><p className="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">{t('landingContact.accessDescription')}</p><Link to="/LoginChoise" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800">{t('landingContact.accessButton')}<Arrow size={18} /></Link></div>
    </div>
  </section>;
}
