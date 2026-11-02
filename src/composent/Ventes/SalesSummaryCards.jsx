import { IoCashOutline, IoTrendingUpOutline, IoCartOutline } from "react-icons/io5";
import { useTranslation } from "react-i18next";

export default function SalesSummaryCards({ summary, history = false }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const cards = [
    { key: "revenue", label: t("salesRevenue.total"), value: summary.revenue, unit: "DH", icon: <IoCashOutline size={28} />, color: "bg-blue-600" },
    { key: "profit", label: t("salesRevenue.profit"), value: summary.profit, unit: "DH", icon: <IoTrendingUpOutline size={28} />, color: "bg-emerald-600" },
    { key: "quantity", label: t(history ? "historyPage.completedSales" : "salesPage.salesVolume"), value: history ? summary.records : summary.quantity, unit: t(history ? "historyPage.items" : "salesPage.items"), icon: <IoCartOutline size={28} />, color: "bg-amber-700" },
  ];
  return <div className="space-y-3"><div className="grid grid-cols-1 gap-5 md:grid-cols-3">{cards.map(({ key, label, value, unit, icon, color }) => <section key={key} className={`${color} flex min-w-0 items-center gap-4 rounded-3xl p-6 text-white shadow-sm`} aria-label={label}>
    <span className="rounded-2xl bg-white/15 p-3">{icon}</span><div className="min-w-0"><p className="text-sm font-semibold text-white/90">{label}</p><p className="mt-2 break-words text-3xl font-black"><bdi data-sales-summary={key} data-value={value}>{Number(value).toLocaleString(locale, key === "quantity" ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</bdi> <span className="text-sm font-semibold">{unit}</span></p></div>
  </section>)}</div><p className="text-sm text-slate-600 dark:text-slate-300">{t("salesRevenue.hint")}</p>{summary.legacyCount > 0 && <p data-sales-legacy-note className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-7 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">{t("salesRevenue.legacyNote")}</p>}</div>;
}
