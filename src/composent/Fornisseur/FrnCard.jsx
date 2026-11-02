import {
  IoMailOutline,
  IoLocationOutline,
  IoCreateOutline,
  IoTrashOutline,
  IoShieldCheckmarkOutline,
  IoLogoWhatsapp,
  IoDocumentTextOutline,
} from "react-icons/io5";
import { useTranslation } from "react-i18next";

const FrnCard = ({ supplier, onEdit, onDelete, onOpen, viewType }) => {
  const { t } = useTranslation();
  const firstLetter = supplier.name ? supplier.name.charAt(0).toUpperCase() : "?";

  const cleanPhone = supplier.phone ? supplier.phone.replace(/\D/g, "") : "";
  const whatsappPhone = cleanPhone.startsWith("0") ? cleanPhone.substring(1) : cleanPhone;
  const openCard = (event) => { if (!event.target.closest("button, a")) onOpen?.(); };

  if (viewType === "list") {
    return (
      <div onClick={openCard} className="cursor-pointer bg-white dark:border-slate-700 border-gray-300 dark:bg-slate-900 border p-3 rounded-2xl flex flex-wrap gap-3 items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group shadow-sm mb-3">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary-600 dark:bg-primary-500 text-white flex items-center justify-center font-black text-base shadow-lg shadow-primary-500/20">
            {firstLetter}
          </div>
          <div>
            <h3 className="text-slate-900 dark:text-slate-100 font-black text-[11px] uppercase tracking-wider">
              <button type="button" onClick={onOpen} className="text-start hover:text-primary-600"><bdi>{supplier.name}</bdi></button>
            </h3>
            <div className="flex items-center gap-4 mt-0.5">
              <a
                href={`https://wa.me/+212${whatsappPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-bold hover:text-primary-500 transition-colors"
              >
                <IoLogoWhatsapp className="text-primary-500" /> {supplier.phone}
              </a>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-bold uppercase tracking-tighter">
                <IoLocationOutline className="text-primary-500" /> {supplier.Ville}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-xl bg-primary-50 px-3 py-2 text-sm font-bold text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"><IoDocumentTextOutline size={18} />{t("supplierInvoices.title")}</button>
          <button
            onClick={onEdit}
            className="p-2 text-slate-400 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-xl transition-all"
          >
            <IoCreateOutline size={18} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all"
          >
            <IoTrashOutline size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div onClick={openCard} className="cursor-pointer group bg-linear-to-br from-white to-slate-50 dark:from-slate-700/40 dark:to-slate-900/70 relative border border-slate-200 dark:border-slate-700 rounded-[2.5rem] p-6 transition-all duration-300 hover:shadow-2xl hover:shadow-primary-500/10 hover:border-primary-200 dark:hover:border-primary-800/50 overflow-hidden">
      <div className="absolute blur-lg top-0 right-0 -mr-30 -mt-30 w-52 h-52 bg-primary-500/10 rounded-full group-hover:scale-150 transition-transform duration-500" />

      <div className="flex justify-between items-start mb-6 relative z-10">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-primary-600 flex items-center justify-center shadow-xl transform group-hover:rotate-6 group-hover:scale-110 transition-all duration-300 border border-slate-100 dark:border-primary-500/20">
          <span className="text-xl font-black text-white">{firstLetter}</span>
        </div>
        <span className="flex items-center gap-1.5 text-[8px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest bg-primary-50 dark:bg-primary-500/10 px-3 py-1.5 rounded-full border border-primary-100 dark:border-primary-500/20">
          <IoShieldCheckmarkOutline size={12} /> {t("supplier.partner")}
        </span>
      </div>

      <div className="mb-6 relative z-10">
        <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
          <button type="button" onClick={onOpen} className="text-start"><bdi>{supplier.name}</bdi></button>
        </h3>
        <p className="text-slate-400 dark:text-slate-500 text-[10px] font-black flex items-center gap-1 mt-1 uppercase tracking-widest">
          <IoLocationOutline size={14} className="text-primary-500" />{" "}
          {supplier.Ville || t("supplier.notLocalized")}
        </p>
      </div>

      <div className="space-y-2 mb-6 relative z-10">
        <a
          href={`mailto:${supplier.email}`}
          className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 group-hover:border-primary-100 dark:group-hover:border-primary-900/30 transition-colors hover:bg-primary-50 dark:hover:bg-primary-500/5 cursor-pointer"
        >
          <IoMailOutline className="text-primary-500" />
          <span className="text-[11px] text-slate-600 dark:text-slate-300 font-bold truncate">
            {supplier.email}
          </span>
        </a>

        <a
          href={`https://wa.me/+212${whatsappPhone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 group-hover:border-primary-100 dark:group-hover:border-primary-900/30 transition-colors hover:bg-primary-50 dark:hover:bg-primary-500/5 cursor-pointer"
        >
          <IoLogoWhatsapp className="text-primary-500" />
          <span className="text-[11px] text-slate-600 dark:text-slate-300 font-bold">
            {supplier.phone}
          </span>
        </a>
      </div>

      <button type="button" onClick={onOpen} className="relative z-10 mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white hover:bg-primary-700"><IoDocumentTextOutline size={20} />{t("supplierInvoices.title")}</button>
      <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 relative z-10">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white dark:text-primary-400 hover:bg-primary-600 dark:hover:bg-primary-600 hover:text-white dark:hover:text-white font-black text-[9px] tracking-[0.2em] transition-all shadow-lg active:scale-95"
        >
          <IoCreateOutline size={16} /> {t("categories.edit")}
        </button>
        <button
          onClick={onDelete}
          className="px-4 py-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-95"
        >
          <IoTrashOutline size={18} />
        </button>
      </div>
    </div>
  );
};

export default FrnCard;
