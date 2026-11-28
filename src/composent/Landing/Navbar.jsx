import { useEffect, useState } from 'react';
import { Layers, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Navbar() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false), [open, setOpen] = useState(false);
  useEffect(() => { const scroll = () => setScrolled(window.scrollY > 20); window.addEventListener('scroll', scroll, { passive: true }); return () => window.removeEventListener('scroll', scroll); }, []);
  const links = [['home', '#home'], ['about', '#about'], ['team', '#team'], ['contact', '#contact']];
  return <nav aria-label={t('landingNav.menu')} className={'fixed inset-x-0 top-0 z-50 border-b transition ' + (scrolled || open ? 'border-slate-200 bg-white/95 shadow-sm backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/95' : 'border-transparent bg-[#f0f6f3]/90 dark:bg-[#152722]/90')}>
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
      <a href="#home" className="flex items-center gap-3"><span className="rounded-xl bg-emerald-700 p-2.5 text-white"><Layers size={24} /></span><span><span dir="ltr" className="block text-xl font-black tracking-tight text-slate-900 dark:text-white">Stock <span className="text-emerald-700 dark:text-emerald-400">Pro</span></span><span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{t('landingNav.brand')}</span></span></a>
      <div className="hidden items-center gap-7 lg:flex">{links.map(([key, href]) => <a key={key} href={href} className="text-sm font-semibold text-slate-600 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400">{t('landingNav.' + key)}</a>)}<Link to="/LoginChoise" className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">{t('landingNav.getStarted')}</Link></div>
      <button type="button" data-landing-menu aria-label={t('landingNav.menu')} aria-expanded={open} aria-controls="landing-mobile-menu" onClick={() => setOpen(value => !value)} className="rounded-xl p-3 text-slate-700 hover:bg-emerald-100 dark:text-slate-200 dark:hover:bg-emerald-900 lg:hidden">{open ? <X size={24} /> : <Menu size={24} />}</button>
    </div>
    {open && <div id="landing-mobile-menu" className="space-y-1 border-t border-slate-100 px-5 pb-5 pt-3 dark:border-slate-800 lg:hidden">{links.map(([key, href]) => <a key={key} href={href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-emerald-50 dark:text-slate-200 dark:hover:bg-slate-800">{t('landingNav.' + key)}</a>)}<Link to="/LoginChoise" onClick={() => setOpen(false)} className="mt-2 block rounded-xl bg-emerald-700 px-5 py-3.5 text-center font-bold text-white">{t('landingNav.getStarted')}</Link></div>}
  </nav>;
}
