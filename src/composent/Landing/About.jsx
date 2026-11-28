import { createElement } from 'react';
import { Barcode, Scissors, UsersRound, ReceiptText, WalletCards, Layers, ArrowUpLeft, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const features = [
  { key: 'fabrics', icon: Barcode, color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  { key: 'sfifa', icon: Layers, color: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  { key: 'tailoring', icon: Scissors, color: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  { key: 'workers', icon: UsersRound, color: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400' },
  { key: 'sales', icon: ReceiptText, color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  { key: 'credit', icon: WalletCards, color: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' },
];
export default function About() {
  const { t, i18n } = useTranslation();
  const Arrow = i18n.dir() === 'rtl' ? ArrowUpLeft : ArrowUpRight;
  return <section id="about" className="scroll-mt-24 bg-white py-20 dark:bg-slate-950 sm:py-24">
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <div className="mx-auto mb-12 max-w-2xl text-center"><p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{t('landingAbout.features')}</p><h2 className="mt-4 text-3xl font-black leading-relaxed text-slate-900 dark:text-white sm:text-4xl">{t('landingAbout.title')}</h2><p className="mt-4 leading-8 text-slate-500 dark:text-slate-400">{t('landingAbout.description')}</p></div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.map(({ key, icon: Icon, color }) => <article key={key} data-landing-feature className="rounded-3xl border border-slate-200 bg-slate-50/50 p-7 transition hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-emerald-700"><div className={'mb-6 inline-flex rounded-2xl p-3 ' + color}>{createElement(Icon, { size: 24 })}</div><h3 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">{t('landingAbout.' + key + 'Title')}</h3><p className="text-sm leading-7 text-slate-600 dark:text-slate-400">{t('landingAbout.' + key + 'Desc')}</p></article>)}
      </div>
      <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-3xl bg-emerald-900 p-7 text-white sm:p-10 lg:flex-row lg:items-center"><div className="max-w-2xl"><h3 className="text-2xl font-bold leading-relaxed">{t('landingAbout.ctaTitle')}</h3><p className="mt-3 text-sm leading-7 text-emerald-100">{t('landingAbout.ctaDesc')}</p></div><Link to="/LoginChoise" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-bold text-emerald-900 transition hover:bg-emerald-50">{t('landingAbout.ctaButton')}<Arrow size={18} /></Link></div>
    </div>
  </section>;
}
