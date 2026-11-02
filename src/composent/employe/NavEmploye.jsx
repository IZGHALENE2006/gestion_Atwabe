import { NavLink } from "react-router-dom";
import { IoPeopleOutline, IoBarChartOutline, IoMoonOutline, IoSunnyOutline } from "react-icons/io5";
import { useTranslation } from "react-i18next";

export default function NavRow() {
  const { t } = useTranslation();

  // Toggle Dark Mode Logic

  return (
    <div className="flex flex-wrap items-center justify-between gap-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm transition-colors duration-300">
      
      <div className="flex gap-2">
        <NavLink
          to="/Home/employees/EmployeeDashboard"
          className={({ isActive }) =>
            `flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all
            ${
              isActive
                ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`
          }
        >
          <IoPeopleOutline size={18} />
          {t("employees.title")}
        </NavLink>

        {/* <NavLink
          to="/Home/employees/statistique"
          className={({ isActive }) =>
            `flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all
            ${
              isActive
                ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`
          }
        >
          <IoBarChartOutline size={18} />
          Statistics
        </NavLink> */}
      </div>

      {/* --- THEME TOGGLE BUTTON --- */}

    </div>
  );
}
