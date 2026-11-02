import { useTranslation } from "react-i18next";
import { Doughnut } from "react-chartjs-2";
export default function Plan2({ data, options, maxColor, produitperc }) {
  const { t } = useTranslation();
  const topProduct = produitperc?.length > 0 
    ? produitperc.reduce((prev, current) => (prev.percentage > current.percentage ? prev : current))
    : null;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: maxColor }} />
        <h3 className="text-slate-800 dark:text-slate-100 font-black uppercase text-xs tracking-widest">{t("dashboard.categoryDistribution")} </h3>
      </div>
      <div className="flex-1 flex justify-center items-center min-h-65">
        <Doughnut data={data} options={{ ...options, cutout: '75%', plugins: { ...options.plugins, legend: { display: false } } }} />
      </div>
      {topProduct && (
  <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 transition-colors">
    <div className="flex justify-between text-xs mb-2">
      {/* Label color adapts to dark mode */}
      <span className="text-slate-500 dark:text-slate-400 font-bold uppercase">
        {topProduct.name}
      </span>
      {/* Percentage color adapts to dark mode */}
      <span className="text-slate-800 dark:text-slate-100 font-black">
        {topProduct.percentage}%
      </span>
    </div>
    
    {/* Progress Bar Container */}
    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
      <div 
        className="h-full transition-all duration-700 ease-out" 
        style={{ 
          width: `${topProduct.percentage}%`, 
          backgroundColor: maxColor,
          // Optional: Add a subtle glow in dark mode
          boxShadow: `0 0 8px ${maxColor}60` 
        }} 
      />
    </div>
  </div>
)}
    </div>
  );
}