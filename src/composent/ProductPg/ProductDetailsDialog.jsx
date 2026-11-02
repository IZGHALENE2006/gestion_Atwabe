// Dialog/ProductDetailsDialog.jsx
import { IoCloseOutline, IoCubeOutline, IoLayersOutline, IoWalletOutline, IoStatsChartOutline } from "react-icons/io5";
import { useTranslation } from "react-i18next";

export default function ProductDetailsDialog({ open, onClose, product }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-200/60 backdrop-blur-md p-4">
      <div className="bg-white border border-white p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] w-full max-w-md transform transition-all relative">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
        >
          <IoCloseOutline size={24} />
        </button>

        {/* Header Section */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-primary-50 rounded-[2.2rem] flex items-center justify-center text-primary-500 text-4xl font-black mb-4 border border-primary-100/50">
            {product?.name?.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
            {t("productTable.infoTitle")}
          </h2>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
            {t("productDialog.inventoryDetails")}
          </span>
        </div>
        
        {/* Info Cards (Light Style) */}
        <div className="grid grid-cols-1 gap-3">
          
          <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100/80">
            <div className="p-3 bg-white rounded-xl shadow-sm text-primary-500">
              <IoCubeOutline size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t("productDialog.designation")}</span>
              <span className="text-sm font-black text-slate-700 uppercase">{product?.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100/80">
            <div className="p-3 bg-white rounded-xl shadow-sm text-primary-500">
              <IoLayersOutline size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t("productTable.category")}</span>
              <span className="text-sm font-black text-slate-700 uppercase">{product?.categorie || t("productDialog.general")}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100/80">
            <div className="p-3 bg-white rounded-xl shadow-sm text-amber-500">
              <IoWalletOutline size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t("productTable.purchasePrice")}</span>
              <span className="text-sm font-black text-slate-700">{Number(product?.prix_achat || 0).toLocaleString(locale)} DH</span>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100/80">
            <div className="p-3 bg-white rounded-xl shadow-sm text-rose-500">
              <IoStatsChartOutline size={20} />
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t("productDialog.availableStock")}</span>
              <div className="flex justify-between items-center">
                 <span className="text-sm font-black text-slate-700">{product?.quantite} {t("productTable.units")}</span>
                 <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                    product?.quantite < 10 ? 'bg-rose-100 text-rose-600' : 'bg-primary-100 text-primary-600'
                 }`}>
                   {product?.quantite < 10 ? t("productDialog.low") : t("productDialog.ok")}
                 </span>
              </div>
            </div>
          </div>

        </div>

        {/* Action Button */}
        <div className="mt-10">
          <button 
            onClick={onClose}
            className="w-full py-4 bg-primary-500 hover:bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-[0.98] shadow-[0_10px_25px_rgba(99,102,241,0.3)]"
          >
            {t("dialog.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
