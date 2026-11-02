import { useTranslation } from "react-i18next";
import { employeeErrorKey } from "../../i18n/employeeErrors.js";
import { useState } from "react";
import {
  IoPersonOutline,
  IoCallOutline,
  IoMailOutline,
  IoLockClosedOutline,
  IoCloseOutline,
  IoFingerPrintOutline,
  IoColorPaletteOutline,
} from "react-icons/io5";
import { addEmploye } from "../../slices/sliceEmploye";
import { useDispatch, useSelector } from "react-redux";
import toast, { Toaster } from 'react-hot-toast';

function AddEmploye({ open, onClose }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [infoEmp, setInfoEmp] = useState({
    name: "",
    cin: "",
    phone: "",
    email: "",
    password: "",
    color: "#10b981", // Default to Emerald
    isActive: true,
  });

  const { loading } = useSelector((state) => state.Employe);

  function HandelAddEmploye() {
    dispatch(addEmploye(infoEmp))
      .unwrap()
      .then(() => {
        toast.success(t("employees.added"), {
          duration: 3000,
          style: {
            border: "1px solid #10b981",
            padding: "16px",
            color: "#10b981",
            backgroundColor: "#ffffff",
          },
        });
        onClose();
      })
      .catch((err) => {
        toast.error(t(employeeErrorKey(err, "addFailed")), {
          duration: 3000,
        });
      });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">{t("employees.newTitle")} </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{t("employees.profileHint")} </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
          >
            <IoCloseOutline size={28} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6">
          {/* Name + CIN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block ml-1">{t("employees.name")} </label>
              <div className="relative group">
                <IoPersonOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                <input
                  type="text"
                  placeholder={t("employees.namePlaceholder")}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white transition-all font-semibold text-sm"
                  onChange={(e) => setInfoEmp({ ...infoEmp, name: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block ml-1">{t("employees.cin")} </label>
              <div className="relative group">
                <IoFingerPrintOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                <input
                  type="text"
                  placeholder="AB123456"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white transition-all font-semibold text-sm"
                  onChange={(e) => setInfoEmp({ ...infoEmp, cin: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block ml-1">{t("employees.phone")} </label>
              <div className="relative group">
                <IoCallOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                <input
                  type="tel"
                  placeholder="06 00 00 00 00"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white transition-all font-semibold text-sm"
                  onChange={(e) => setInfoEmp({ ...infoEmp, phone: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block ml-1">{t("employees.email")} </label>
              <div className="relative group">
                <IoMailOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                <input
                  type="email"
                  placeholder="nom@entreprise.com"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white transition-all font-semibold text-sm"
                  onChange={(e) => setInfoEmp({ ...infoEmp, email: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Password + Color */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block ml-1">{t("employees.password")} </label>
              <div className="relative group">
                <IoLockClosedOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white transition-all font-semibold text-sm"
                  onChange={(e) => setInfoEmp({ ...infoEmp, password: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block ml-1">{t("employees.color")} </label>
              <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-2xl">
                <input
                  type="color"
                  className="w-10 h-10 rounded-xl border-none cursor-pointer bg-transparent"
                  value={infoEmp.color}
                  onChange={(e) => setInfoEmp({ ...infoEmp, color: e.target.value })}
                />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{t("employees.chooseColor")} </span>
              </div>
            </div>
          </div>

          {/* Status Toggle */}
          <div className="pt-2">
            <label className="flex items-center justify-between p-4 bg-primary-50/50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 rounded-2xl cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all">
              <div className="flex flex-col">
                <span className="text-sm font-black text-primary-800 dark:text-primary-400 uppercase tracking-tight">{t("employees.activeAccount")} </span>
                <span className="text-[10px] text-primary-600/70 dark:text-primary-500/50 font-bold uppercase tracking-widest">{t("employees.allowAccess")} </span>
              </div>
              <input
                type="checkbox"
                className="w-6 h-6 rounded-lg accent-primary-600 cursor-pointer"
                checked={infoEmp.isActive}
                onChange={(e) => setInfoEmp({ ...infoEmp, isActive: e.target.checked })}
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-10 pt-6 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >{t("common.cancel")} </button>
          <button
            onClick={HandelAddEmploye}
            disabled={loading}
            className={`px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg transition-all active:scale-95
              ${loading 
                ? "bg-slate-400 cursor-not-allowed" 
                : "bg-primary-600 hover:bg-primary-500 shadow-primary-600/20"}
            `}
          >
            {loading ? t("common.loading") : t("employees.add")}
          </button>
        </div>
      </div>
      <Toaster/>
    </div>
  );
}

export default AddEmploye;
