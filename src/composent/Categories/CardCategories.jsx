import { useEffect } from "react";
import {
  IoCreateOutline,
  IoTrashOutline,
  IoCalendarOutline,
  IoLayersOutline,
} from "react-icons/io5";
import { useDispatch, useSelector } from "react-redux";
import { GetAllProduct } from "../../slices/SliceProduct";
import { useTranslation } from "react-i18next";

function CardCategories({ name, Datee, btn, id, update }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const { role } = useSelector((state) => state.LoginAdmin);
  const { Produts } = useSelector((state) => state.Product);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(GetAllProduct());
  }, [dispatch]);

  const productCount = Produts?.filter((item) => item.categorie?._id === id).length || 0;

  const formattedDate = Datee
    ? new Date(Datee).toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : t("categories.unspecified");

  return (
    <div
      className="
        group w-full md:w-80 p-6 rounded-4xl
        bg-white dark:bg-slate-800/50 border border-[#e2e8f0] dark:border-slate-700
        hover:border-primary-200 dark:hover:border-primary-500/50 hover:bg-[#19b393]/5 dark:hover:bg-primary-500/5
        hover:shadow-xl hover:shadow-primary-500/5
        transition-all duration-300 relative overflow-hidden
      "
    >
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-linear-to-r from-transparent via-white/40 dark:via-primary-500/10 to-transparent -skew-x-12 translate-x-[-150%] group-hover:translate-x-[150%]" />

      <div className="flex justify-between items-start mb-5">
        <div className="p-3 rounded-2xl bg-primary-50 dark:bg-primary-500/10 text-[#19b393] border border-primary-100/50 dark:border-primary-500/20">
          <IoLayersOutline size={22} />
        </div>

        <span className="text-[10px] font-black px-3 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-[#64748b] dark:text-slate-400 border border-[#e2e8f0] dark:border-slate-700 tracking-tighter">
          ID: {id.slice(-5).toUpperCase()}
        </span>
      </div>

      <h2 className="text-lg font-black text-[#0f172a] dark:text-slate-100 uppercase tracking-tight mb-1">
        {name}
      </h2>

      <div className="flex items-center gap-2 text-[11px] font-bold text-[#64748b] dark:text-slate-400 uppercase tracking-wide mb-6">
        <IoCalendarOutline size={14} className="text-slate-400 dark:text-slate-500" />
        <span>
          {t("categories.createdAt")} {formattedDate}
        </span>
      </div>

      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#f8fafc] dark:bg-slate-800/40 border border-[#e2e8f0] dark:border-slate-700 mb-6">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase text-[#64748b] dark:text-slate-500 tracking-widest">
            {t("categories.inventory")}
          </span>
          <span className="text-[#334155] dark:text-slate-300 text-xs font-bold">
            {t("categories.productsCount")}
          </span>
        </div>

        <span className="text-[#19b393] font-black text-xl px-4 py-1 rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-primary-50 dark:border-primary-500/20">
          {productCount}
        </span>
      </div>

      {role === "admin" && (
        <div className="flex items-center gap-3 border-t border-[#e2e8f0] dark:border-slate-800 pt-5">
          <button
            onClick={() => update(id)}
            className="
              flex-1 flex items-center justify-center gap-2 py-2.5
              text-[11px] font-black uppercase tracking-widest text-[#19b393]
              bg-primary-50 dark:bg-primary-500/10 hover:bg-primary-100 dark:hover:bg-primary-500/20
              border border-primary-300 dark:border-primary-500/30 rounded-xl
              transition-all active:scale-95
            "
          >
            <IoCreateOutline size={16} />
            {t("categories.edit")}
          </button>

          <button
            onClick={() => btn(id)}
            className="
              flex-1 flex items-center justify-center gap-2 py-2.5
              text-[11px] font-black uppercase tracking-widest text-rose-500
              bg-red-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20
              border border-rose-300 dark:border-rose-500/30 rounded-xl
              transition-all active:scale-95
            "
          >
            <IoTrashOutline size={16} />
            {t("categories.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

export default CardCategories;
