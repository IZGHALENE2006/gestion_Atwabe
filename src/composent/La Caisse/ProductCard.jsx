import { IoAddCircle } from "react-icons/io5";
import { useTranslation } from "react-i18next";

export default function ProductCard({ item, click }) {
  const { t } = useTranslation();
  const statusStyles = {
    active: "bg-primary-50 text-primary-600 border-primary-100",
    low: "bg-amber-50 text-amber-600 border-amber-100",
    out: "bg-rose-50 text-rose-600 border-rose-100",
  };

  const currentStatus = item.quantite > 10 ? "active" : item.quantite > 0 ? "low" : "out";
  const statusLabel =
    item.quantite > 10
      ? t("cashier.available")
      : item.quantite > 0
      ? t("cashier.lowStock")
      : t("cashier.outOfStock");

  return (
    <div
      onClick={click}
      className="cursor-pointer group relative bg-white border border-[#e2e8f0] rounded-4xl p-5 transition-all duration-300 hover:shadow-xl hover:shadow-primary-100/50 hover:border-primary-200"
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary-50 blur-2xl rounded-full group-hover:bg-primary-100 transition-colors" />

      <div className="flex justify-between items-center mb-5 relative z-10">
        <span className="text-[9px] font-black tracking-[0.15em] text-[#64748b] uppercase bg-slate-50 px-2 py-1 rounded-md">
          {item.categorie || t("productDialog.general")}
        </span>
        <div className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-tighter ${statusStyles[currentStatus]}`}>
          ● {statusLabel}
        </div>
      </div>

      <div className="mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#0f172a] flex items-center justify-center text-white font-black shadow-md shadow-slate-200">
            {item.name.charAt(0).toUpperCase()}
          </div>
          <h3 className="text-md font-black text-[#0f172a] leading-tight uppercase tracking-tight group-hover:text-primary-600 transition-colors">
            {item.name}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 py-4 border-y border-dashed border-[#e2e8f0] relative z-10">
        <div>
          <p className="text-[#64748b] text-[9px] uppercase font-black tracking-widest">
            {t("cashier.stockLabel")}
          </p>
          <p className="text-[#334155] font-black text-sm">
            {item.quantite} <span className="text-[10px] font-bold">U</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[#64748b] text-[9px] uppercase font-black tracking-widest">
            {t("productTable.price")}
          </p>
          <p className="text-primary-600 font-black text-sm">
            {item.prix_vente} <span className="text-[10px]">DH</span>
          </p>
        </div>
      </div>

      <div className="mt-5 flex justify-between items-end relative z-10">
        <div>
          <p className="text-[#94a3b8] text-[9px] font-black uppercase tracking-tighter">
            {t("cashier.stockValue")}
          </p>
          <p className="text-xl font-black text-[#0f172a]">
            {item.prix_vente * item.quantite}
            <span className="text-[10px] ml-1 text-[#64748b]">DH</span>
          </p>
        </div>
        <div className="transform translate-y-1 group-hover:translate-y-0 opacity-80 group-hover:opacity-100 transition-all duration-300">
          <IoAddCircle className="text-primary-600 filter drop-shadow-sm" size={38} />
        </div>
      </div>
    </div>
  );
}
