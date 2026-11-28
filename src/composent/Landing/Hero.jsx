import { createElement } from 'react';
import { ArrowUpLeft, ArrowUpRight, Barcode, Check, Layers, Ruler, Scissors } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const fabrics = [
  { key: 'crepe', meters: 48, colors: ['#21645c', '#cc9b98', '#d9bd8b', '#3c5579'] },
  { key: 'linen', meters: 30, colors: ['#b99973', '#ded2b8', '#7c8e71', '#945d52'] },
  { key: 'satin', meters: 18, colors: ['#425276', '#9c7890', '#d2b480', '#303b45'] },
];

export default function Hero() {
  const { t, i18n } = useTranslation();
  const Arrow = i18n.dir() === 'rtl' ? ArrowUpLeft : ArrowUpRight;
  const number = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA').format(value);
  return <section id="home" className="relative overflow-hidden bg-[#f0f6f3] pb-20 pt-32 dark:bg-[#152722] sm:pb-28 sm:pt-40">
    <div aria-hidden="true" className="pointer-events-none absolute -end-44 -top-44 h-[600px] w-[600px] rounded-full border-[80px] border-emerald-200/20 dark:border-emerald-400/5" />
    <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
      <div>
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t('landingHero.badge')}</p>
        <h1 className="text-4xl font-black leading-[1.35] tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-[3.5rem]">
          <span className="block">{t('landingHero.title1')}</span><span className="block text-emerald-700 dark:text-emerald-400">{t('landingHero.title2')}</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">{t('landingHero.description')}</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link to="/LoginChoise" data-landing-login className="inline-flex items-center justify-center gap-3 rounded-2xl bg-emerald-700 px-6 py-4 font-bold text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">{t('landingHero.startNow')}<Arrow size={20} /></Link>
          <a href="#about" className="rounded-xl px-2 py-3 text-sm font-bold text-slate-700 underline decoration-slate-300 underline-offset-8 hover:text-emerald-700 dark:text-slate-200">{t('landingHero.explore')}</a>
        </div>
        <div className="mt-9 flex flex-wrap gap-x-5 gap-y-3 border-t border-emerald-900/10 pt-6 text-xs font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300">
          {[['fabricTag', Ruler], ['barcodeTag', Barcode], ['tailoringTag', Scissors]].map(([key, Icon]) => <span key={key} className="inline-flex items-center gap-2">{createElement(Icon, { size: 16, className: 'text-emerald-700 dark:text-emerald-400' })}{t('landingHero.' + key)}</span>)}
        </div>
      </div>
      <div data-fabric-preview className="relative min-w-0 rounded-[2rem] border border-white bg-white p-4 shadow-[0_24px_80px_-30px_#194c3c55] dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-5 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-3"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"><Layers size={22} /></span><div><h2 className="font-black text-slate-900 dark:text-white">{t('landingHero.previewTitle')}</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('landingHero.previewHint')}</p></div></div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t('landingHero.previewLabel')}</span>
        </div>
        <div className="mb-5 grid grid-cols-3 gap-2">
          {[['types', number(3)], ['colors', number(12)], ['totalMeters', t('landingHero.meters', { value: number(96) })]].map(([key, value]) => <div key={key} className="rounded-2xl bg-[#f3f7f5] px-2 py-3 text-center dark:bg-slate-800"><p className="text-xl font-black text-emerald-800 dark:text-emerald-300">{value}</p><p className="mt-1 text-[10px] font-semibold leading-5 text-slate-500 dark:text-slate-400">{t('landingHero.' + key)}</p></div>)}
        </div>
        <div className="space-y-3">
          {fabrics.map(fabric => <div key={fabric.key} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
            <div aria-hidden="true" className="relative h-16 w-14 shrink-0 overflow-hidden rounded-xl shadow-inner" style={{ backgroundColor: fabric.colors[0], backgroundImage: 'repeating-linear-gradient(100deg, transparent 0 8px, #ffffff12 9px, #00000014 12px, transparent 17px)' }}><div className="absolute inset-x-0 top-0 h-3 rounded-[50%] border border-white/25 bg-black/10" /></div>
            <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('landingHero.' + fabric.key)}</p><div aria-hidden="true" className="mt-2 flex gap-1.5">{fabric.colors.map(color => <span key={color} className="h-4 w-4 rounded-full border border-black/5 ring-2 ring-white dark:ring-slate-900" style={{ backgroundColor: color }} />)}</div></div>
            <div className="shrink-0 text-end"><p className="text-sm font-black text-slate-800 dark:text-white">{t('landingHero.meters', { value: number(fabric.meters) })}</p><p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400"><Check size={12} />{t('landingHero.available')}</p></div>
          </div>)}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-blue-50 p-3 dark:bg-blue-500/10"><Barcode size={34} className="shrink-0 text-blue-700 dark:text-blue-300" /><div><p className="text-xs font-bold text-blue-900 dark:text-blue-200">{t('landingHero.roll')} · {t('landingHero.meters', { value: number(24) })}</p><p className="mt-1 text-[11px] leading-5 text-blue-700 dark:text-blue-300">{t('landingHero.rollHint')}</p></div></div>
      </div>
    </div>
  </section>;
}
