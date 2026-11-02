import { apiErrorMessage } from "../../i18n/apiErrors.js";
import React, { useState } from "react";
import {
  IoLockClosedOutline,
  IoShieldCheckmarkOutline,
  IoEyeOffOutline,
} from "react-icons/io5";
import { useDispatch, useSelector } from "react-redux";
import { UpdatePassword } from "../../slices/SliceLoginAdmin";
import { useNavigate } from "react-router";
import toast, { Toaster } from "react-hot-toast";
import { useTranslation } from "react-i18next";

const ChangePassword = () => {
  const { t } = useTranslation();
  const { error } = useSelector((state) => state.LoginAdmin);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState({
    old: "",
    newpass: "",
    newpass2: "",
  });

  function handleUpdatePassword(e) {
    e.preventDefault();

    if (!newPassword.old || !newPassword.newpass || !newPassword.newpass2) {
      toast.error(t("changePassword.allRequired"));
      return;
    }

    if (newPassword.newpass !== newPassword.newpass2) {
      toast.error(t("changePassword.notMatch"));
      return;
    }

    dispatch(UpdatePassword(newPassword))
      .unwrap()
      .then(() => {
        toast.success(t("changePassword.updatedSuccess"), {
          duration: 3000,
          position: "top-right",
        });
        navigate("/Home/profile");
      })
      .catch((err) => {
        toast.error(apiErrorMessage(err, t, "changePassword.somethingWrong"), {
          duration: 4000,
        });
      });
  }

  return (
    <div className="min-h-[80vh] bg-gray-100 dark:bg-[#1e293b] flex items-center justify-center p-4 transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
        <div className="p-8 pb-4 text-center">
          <div className="w-16 h-16 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
            <IoShieldCheckmarkOutline size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
            {t("changePassword.security")}
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2">
            {t("changePassword.updatePrompt")}
          </p>
        </div>

        <form className="p-8 pt-4 space-y-6" onSubmit={handleUpdatePassword}>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 ml-1">
              {t("changePassword.currentPassword")}
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors">
                <IoLockClosedOutline size={18} />
              </span>
              <input
                type="password"
                placeholder="********"
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 dark:text-slate-200 font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all"
                onChange={(e) => setNewPassword({ ...newPassword, old: e.target.value })}
              />
            </div>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 ml-1">
              {t("changePassword.newPassword")}
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors">
                <IoEyeOffOutline size={18} />
              </span>
              <input
                type="password"
                placeholder={t("changePassword.minChars")}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 dark:text-slate-200 font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all"
                onChange={(e) =>
                  setNewPassword({ ...newPassword, newpass: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 ml-1">
              {t("changePassword.confirmPassword")}
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors">
                <IoEyeOffOutline size={18} />
              </span>
              <input
                type="password"
                placeholder={t("changePassword.repeatPassword")}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-700 dark:text-slate-200 font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all"
                onChange={(e) =>
                  setNewPassword({ ...newPassword, newpass2: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <button
              type="submit"
              className="w-full py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-primary-600/20 transition-all active:scale-95"
            >
              {t("changePassword.updateButton")}
            </button>
            <button
              type="button"
              onClick={() => navigate("/Home/profile")}
              className="w-full bg-red-400 rounded-xl py-4 text-white dark:text-slate-500 font-black text-xs uppercase tracking-[0.2em] hover:bg-red-600 dark:hover:text-slate-300 transition-all"
            >
              {t("common.cancel")}
            </button>
            {error && <span className="text-red-500 text-xs font-bold text-center mt-2">{apiErrorMessage(error, t)}</span>}
          </div>
        </form>
      </div>
      <Toaster />
    </div>
  );
};

export default ChangePassword;
