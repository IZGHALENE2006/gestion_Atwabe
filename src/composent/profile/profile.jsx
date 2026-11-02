import React from "react";
import { useSelector } from "react-redux";
import {
  IoLockClosedOutline,
  IoPersonOutline,
  IoShieldCheckmarkOutline,
  IoStatsChartOutline,
} from "react-icons/io5";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const { user, role } = useSelector((state) => state.LoginAdmin);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-[#1e293b] flex items-center justify-center text-[#19b393]">
        <p className="animate-pulse text-lg font-black tracking-widest uppercase">
          {t("profile.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-100 dark:bg-[#1e293b] min-h-screen space-y-8 transition-colors duration-300 font-sans">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight uppercase">
            {t("profile.myProfile")}
          </h1>
          <p className="text-slate-400 dark:text-slate-500 font-medium italic text-sm">
            {t("profile.manageInfo")}
          </p>
        </div>
        <div className="bg-[#19b393]/10 px-4 py-2 rounded-2xl border border-[#19b393]/20">
          <span className="text-[#19b393] font-black uppercase text-xs tracking-tighter">{role}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-8">
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-white dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div className="h-32 bg-gradient-to-r from-[#19b393] to-primary-600 relative" />
            <div className="px-8 pb-8">
              <div className="relative -mt-16 mb-6 flex items-end gap-6">
                <div className="h-32 w-32 bg-white dark:bg-[#1e293b] rounded-3xl p-2 shadow-2xl border-4 border-white dark:border-slate-800">
                  <div className="h-full w-full bg-[#19b393]/20 rounded-2xl flex items-center justify-center text-[#19b393] text-4xl font-black uppercase">
                    {user.name?.charAt(0)}
                  </div>
                </div>
                <div className="pb-2">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white capitalize">{user.name}</h2>
                  <p className="text-slate-400 font-medium">{user.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <InfoBox label={t("profile.fullName")} value={user.name} icon={<IoPersonOutline />} />
                <InfoBox label={t("profile.emailAddress")} value={user.email} icon={<IoShieldCheckmarkOutline />} />
                <InfoBox
                  label={t("profile.phoneNumber")}
                  value={user.phone || t("profile.notProvided")}
                  icon={<IoShieldCheckmarkOutline />}
                />
                <InfoBox
                  label={t("profile.cinNumber")}
                  value={user.cin || "—"}
                  icon={<IoShieldCheckmarkOutline />}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-red-50 dark:bg-red-500/10 rounded-xl text-red-500">
                <IoLockClosedOutline size={20} />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                {t("profile.security")}
              </h3>
            </div>
            <Link to="../changePassword">
              <button className="w-full py-4 px-6 rounded-2xl bg-[#19b393] hover:bg-[#12846e] text-white font-black text-sm transition-all duration-300 shadow-lg shadow-primary-200 dark:shadow-primary-900/20 flex items-center justify-center gap-2">
                {t("profile.changePassword")}
              </button>
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-primary-50 dark:bg-primary-500/10 rounded-xl text-primary-500">
                <IoStatsChartOutline size={20} />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                {t("profile.activity")}
              </h3>
            </div>
            <div className="space-y-4">
              <StatItem label={t("profile.salesCompleted")} value={user.ventes?.length || 0} />
              <StatItem label={t("profile.invoicesGenerated")} value={user.Facture?.length || 0} />
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">
                  {t("profile.memberSince")}
                </p>
                <p className="text-sm font-bold text-[#19b393]">
                  {user.datecreate
                    ? new Date(user.datecreate).toLocaleDateString(locale, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value, icon }) {
  return (
    <div className="group p-4 rounded-2xl border border-slate-50 dark:border-slate-800 hover:border-[#19b393]/30 transition-all bg-slate-50/50 dark:bg-slate-800/30">
      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest mb-1">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-slate-300 dark:text-slate-600 group-hover:text-[#19b393] transition-colors">
          {icon}
        </span>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{value}</p>
      </div>
    </div>
  );
}

function StatItem({ label, value }) {
  return (
    <div className="flex justify-between items-center group">
      <span className="text-sm text-slate-500 dark:text-slate-400 font-medium group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
        {label}
      </span>
      <span className="text-lg font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-xl min-w-10 text-center">
        {value}
      </span>
    </div>
  );
}
