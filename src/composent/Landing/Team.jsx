import { Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Team() {
  const { t } = useTranslation();
  return <section id="team" className="scroll-mt-24 bg-[#f0f6f3] py-20 dark:bg-[#152722]">
    <div className="mx-auto max-w-4xl px-5 sm:px-8">
      <p className="text-center text-sm font-bold text-emerald-700 dark:text-emerald-400">{t('landingTeam.label')}</p>
      <h2 className="mt-4 text-center text-3xl font-black text-slate-900 dark:text-white">{t('landingTeam.title')}</h2>
      <article data-landing-developer className="mx-auto mt-10 grid max-w-3xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-[240px_1fr]">
        <div className="mx-auto w-60 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900 dark:to-slate-800 sm:w-full"><img src="/img4.png" alt="Izghalene El-Mahdi" width="720" height="1280" loading="lazy" className="aspect-[4/5] w-full object-cover" /></div>
        <div className="flex flex-col justify-center p-7 sm:p-9"><span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"><Code2 size={16} />{t('landingTeam.role')}</span><h3 dir="ltr" className="text-start text-2xl font-black text-slate-900 dark:text-white">Izghalene El-Mahdi</h3><p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-400">{t('landingTeam.description')}</p></div>
      </article>
    </div>
  </section>;
}
