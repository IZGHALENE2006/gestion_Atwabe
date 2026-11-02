import { useState } from "react";
import { IoSearchOutline, IoAddOutline, IoGridOutline, IoListOutline } from "react-icons/io5";
import AddEmploye from "./AddEmploye";
import { useTranslation } from "react-i18next";

export default function EmployeeSearch({ view, setView, searchTerm, setSearchTerm }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-8 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-4 flex flex-wrap justify-between items-center gap-4 shadow-sm transition-colors duration-300">
      
      {/* LEFT: Search Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500 transition-all">
          <span className="ps-3 text-slate-400 dark:text-slate-500">
            <IoSearchOutline size={18} />
          </span>
          <input
            type="text"
            placeholder={t("employees.search")}
            aria-label={t("employees.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-sm text-slate-700 dark:text-slate-200 px-3 py-2.5 outline-none w-48 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>

        {/* View Toggle Buttons */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button 
            onClick={() => setView('card')}
            aria-label={t("employees.cards")}
            className={`p-2 rounded-lg transition-all ${view === 'card' ? 'bg-white dark:bg-slate-600 shadow-sm text-primary-600' : 'text-slate-400'}`}
          >
            <IoGridOutline size={18} />
          </button>
          <button 
            onClick={() => setView('list')}
            aria-label={t("employees.list")}
            className={`p-2 rounded-lg transition-all ${view === 'list' ? 'bg-white dark:bg-slate-600 shadow-sm text-primary-600' : 'text-slate-400'}`}
          >
            <IoListOutline size={18} />
          </button>
        </div>
      </div>

      {/* RIGHT: Add Button */}
      <button
        onClick={() => setOpen(true)}
        className="px-6 py-2.5 rounded-xl bg-primary-600 dark:bg-primary-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary-500 dark:hover:bg-primary-500 transition-all flex items-center gap-2 shadow-lg shadow-primary-500/20 active:scale-95"
      >
        <IoAddOutline size={18} />
        {t("employees.add")}
      </button>

      <AddEmploye open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
