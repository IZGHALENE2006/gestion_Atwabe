import { NavLink } from "react-router-dom";
import { IoPeopleOutline, IoBarChartOutline } from "react-icons/io5";
import { useTranslation } from "react-i18next";

export default function NaveProfite() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";

  return (
    <div
      dir={i18n.dir()}
      className={`flex justify-start gap-4 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 shadow-sm p-2 rounded-2xl mb-8 backdrop-blur-md transition-all ${isRtl ? "flex-row-reverse" : ""}`}
    >
      <NavLink
        to="/Home/Profit/Ventes"
        className={({ isActive }) => `
          flex items-center gap-3 px-6 py-3 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-all duration-300
          ${isActive
            ? 'bg-primary-600 text-white shadow-xl shadow-primary-600/20 scale-105'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary-600'
          }
        `}
      >
        <IoPeopleOutline size={18} />
        <span>{t("salesNav.sales")}</span>
      </NavLink>

      <NavLink
        to="/Home/Profit/Hestorique"
        className={({ isActive }) => `
          flex items-center gap-3 px-6 py-3 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-all duration-300
          ${isActive
            ? 'bg-primary-600 text-white shadow-xl shadow-primary-600/20 scale-105'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-primary-600'
          }
        `}
      >
        <IoBarChartOutline size={18} />
        <span>{t("salesNav.history")}</span>
      </NavLink>
    </div>
  );
}
