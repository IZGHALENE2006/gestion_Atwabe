import { saleRevenue } from "../../../shared/salesRevenue.js";
import {
  HiOutlineCube,
  HiOutlineCash,
  HiOutlineTrendingUp,
  HiOutlineCalendar,
  HiOutlineHashtag,
  HiOutlineEye,
} from "react-icons/hi";
import { useTranslation } from "react-i18next";

const StatCard = ({ icon, label, value, subValue, darkIconColor, isRtl }) => (
    <div
      className={`relative overflow-hidden group p-5 rounded-[2rem] transition-all duration-500 border flex items-center gap-4 bg-white shadow-sm border-slate-100 hover:shadow-md hover:-translate-y-1 dark:bg-slate-900/40 dark:border-slate-800 dark:shadow-none ${isRtl ? "flex-row-reverse text-right" : ""}`}
    >
      <div
        className={`p-3 rounded-2xl bg-slate-50 text-slate-600 border border-slate-100 dark:bg-slate-800/50 ${darkIconColor} dark:border-slate-700 backdrop-blur-md transition-transform group-hover:scale-110`}
      >
        {icon}
      </div>

      <div className="relative z-10">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-0.5 text-slate-400 dark:text-slate-500">{label}</p>
        <h2 className="text-sm font-black tracking-tight text-slate-800 dark:text-slate-100">{value}</h2>
        {subValue && <p className="text-[8px] font-bold text-slate-400 dark:text-slate-600 italic uppercase">{subValue}</p>}
      </div>
    </div>
  );

const DailogInfoVentes = ({ vente, onViewProduct }) => {
  const { t, i18n } = useTranslation();

  if (!vente) return null;

  const isRtl = i18n.dir() === "rtl";
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";


  return (
    <div dir={i18n.dir()} className="p-2 rounded-[2.5rem] overflow-hidden transition-colors duration-300">
      <div className="space-y-6">
        <div
          className={`relative overflow-hidden group p-6 rounded-[2.2rem] border flex items-center justify-between bg-linear-to-br from-primary-600 to-primary-800 shadow-xl shadow-primary-900/20 border-primary-500/20 dark:bg-none dark:bg-slate-900/40 dark:border-slate-800 dark:shadow-none ${isRtl ? "flex-row-reverse" : ""}`}
        >
          <div className={`flex items-center gap-4 relative z-10 ${isRtl ? "flex-row-reverse text-right" : ""}`}>
            <div className="w-14 h-14 bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg">
              {vente.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-xl font-black text-white leading-none mb-1 tracking-tighter uppercase">{vente.name}</h3>
              <p className="text-[10px] font-bold text-primary-100/60 dark:text-slate-500 tracking-widest uppercase">
                {t("salesDetails.id")}: {vente.idProduct || "---"}
              </p>
            </div>
          </div>

          <div className="duration-700 absolute -right-12 -top-12 w-32 h-32 bg-primary-500 opacity-20 dark:opacity-40 blur-3xl rounded-full group-hover:-right-4 group-hover:-top-4 transition-all" />

          {onViewProduct && (
            <button
              onClick={() => onViewProduct(vente.idProduct)}
              className="relative z-10 flex items-center gap-2 px-5 py-3 bg-white dark:bg-primary-600 text-primary-700 dark:text-white text-[10px] font-black rounded-xl shadow-xl transition-all active:scale-90 hover:bg-primary-50 dark:hover:bg-primary-500 uppercase tracking-widest"
            >
              <HiOutlineEye size={18} />
              <span>{t("salesDetails.viewProduct")}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard isRtl={isRtl} icon={<HiOutlineCash size={22} />} label={t("salesRevenue.amount")} value={`${saleRevenue(vente).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`} subValue={t("salesRevenue.hint")} darkIconColor="dark:text-blue-400" />
          <StatCard isRtl={isRtl}
            icon={<HiOutlineCash size={22} />}
            label={t("salesDetails.salePrice")}
            value={`${Number(vente.price || 0).toLocaleString(locale)} DH`}
            subValue={t("salesDetails.unitPrice")}
            darkIconColor="dark:text-amber-400"
          />

          <StatCard isRtl={isRtl}
            icon={<HiOutlineCube size={22} />}
            label={t("salesDetails.quantity")}
            value={`${vente.quantite} ${t("salesDetails.units")}`}
            subValue={t("salesDetails.totalVolume")}
            darkIconColor="dark:text-primary-400"
          />

          <StatCard isRtl={isRtl}
            icon={<HiOutlineTrendingUp size={22} />}
            label={t("salesDetails.profit")}
            value={`${Number(vente.profite || 0).toLocaleString(locale)} DH`}
            subValue={t("salesDetails.netGain")}
            darkIconColor="dark:text-primary-400"
          />

          <StatCard isRtl={isRtl}
            icon={<HiOutlineCalendar size={22} />}
            label={t("salesDetails.dateTime")}
            value={new Date(vente.DateVante).toLocaleDateString(locale)}
            subValue={new Date(vente.DateVante).toLocaleTimeString(locale)}
            darkIconColor="dark:text-purple-400"
          />
        </div>

        <div
          className={`pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] ${isRtl ? "flex-row-reverse" : ""}`}
        >
          <div className={`flex items-center gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
            <HiOutlineHashtag size={14} className="text-primary-500" />
            <span>
              {t("salesDetails.transaction")}: <span className="text-primary-600 dark:text-primary-400">{t("salesDetails.completed")}</span>
            </span>
          </div>
          <div className="italic opacity-50">
            {t("salesDetails.logId")}: {String(vente._id).slice(-8)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailogInfoVentes;
