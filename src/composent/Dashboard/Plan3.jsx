import { useTranslation } from "react-i18next";
import { Line } from "react-chartjs-2";
export default function Plan3({ data, options }) {
  const { t } = useTranslation();
  return (
    <div className="h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1.5 h-6 bg-primary-500 rounded-full" />
        <h3 className="text-slate-800 dark:text-slate-100 font-black uppercase text-xs tracking-widest">{t("dashboard.employeeProfit")} </h3>
      </div>
      <div className="h-80">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}