import { IoCashOutline, IoTrendingUpOutline, IoCartOutline, IoWalletOutline } from "react-icons/io5";
import { useTranslation } from "react-i18next";

export default function SalesSummaryCards({ summary, history = false, ownerProfit, loading = false, error = false, onRetry }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const cards = [
    { key: "revenue", label: t("salesRevenue.total"), value: summary.revenue, unit: "DH", icon: <IoCashOutline size={28} />, color: "bg-blue-600" },
    { key: "profit", label: t("salesRevenue.profit"), value: summary.profit, unit: "DH", icon: <IoTrendingUpOutline size={28} />, color: "bg-emerald-600" },
    ...(ownerProfit ? [{ key: 'ownerProfit', label: t('salesRevenue.ownerProfit'), value: ownerProfit.ownerProfit, unit: 'DH', icon: <IoWalletOutline size={28} />, color: 'bg-teal-700' }] : []),
    { key: "quantity", label: t(history ? "historyPage.completedSales" : "salesPage.salesVolume"), value: history ? summary.records : summary.quantity, unit: t(history ? "historyPage.items" : "salesPage.items"), icon: <IoCartOutline size={28} />, color: "bg-amber-700" },
  ];
  return <div className="space-y-3" aria-busy={loading}><div className={'grid grid-cols-1 gap-5 ' + (ownerProfit ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3')}>{cards.map(({ key, label, value, unit, icon, color }) => <section key={key} className={`${color} relative flex min-w-0 items-center gap-4 rounded-3xl p-6 text-white shadow-sm`} aria-label={label}>
    <span className="rounded-2xl bg-white/15 p-3 max-sm:absolute max-sm:end-4 max-sm:top-4 max-sm:p-2">{icon}</span><div className="min-w-0 max-sm:w-full"><p className="text-sm font-semibold text-white/90 max-sm:pe-12">{label}</p><p className="mt-2 break-words text-3xl font-black"><bdi data-sales-summary={key} data-value={loading || error || value === null ? '' : value}>{loading || error || value === null ? '—' : Number(value).toLocaleString(locale, key === "quantity" ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</bdi> <span className="text-sm font-semibold">{unit}</span></p>{key === 'ownerProfit' && <p className="mt-2 text-xs leading-6 text-white/90">{t('salesRevenue.employeeShares')}: <bdi data-sales-employee-shares data-value={loading || error || ownerProfit.employeeShares === null ? '' : ownerProfit.employeeShares}>{loading || error || ownerProfit.employeeShares === null ? '—' : Number(ownerProfit.employeeShares).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH</bdi></p>}</div>
  </section>)}</div><p className="text-sm text-slate-600 dark:text-slate-300">{t("salesRevenue.hint")}</p>
    {ownerProfit && <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">{t('salesRevenue.ownerProfitHint')}</p>}
    {loading && <p role="status" className="text-sm text-slate-500">{t('common.loading')}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{t('salesRevenue.reportFailed')} <button type="button" data-retry-sales-profit className="font-bold underline" onClick={onRetry}>{t('fabrics.retry')}</button></p>}
    {!loading && !error && ownerProfit?.ownerProfit === null && <p role="status" data-sales-share-incomplete className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{t('salesRevenue.ownerProfitUnknown')}</p>}
    {summary.legacyCount > 0 && !loading && !error && <p data-sales-legacy-note className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-7 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">{t("salesRevenue.legacyNote")}</p>}</div>;
}
