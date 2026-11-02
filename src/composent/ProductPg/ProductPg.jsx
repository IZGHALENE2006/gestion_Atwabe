import { IoFileTrayStackedOutline, IoWalletOutline, IoBagRemoveOutline, IoBanOutline } from "react-icons/io5";
import { stockRetailValue } from '../../../shared/productBatches.js';
import ProductList from "./ProductList";
import { useSelector } from "react-redux";
import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";

function StatCard({ icon, label, value, warning = false }) {
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${warning ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-primary-100 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400'}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <div className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{value}</div>
      </div>
    </div>
  );
}

export default function ProductPg() {
  const { t, i18n } = useTranslation();
  const { Produts = [] } = useSelector((state) => state.Product);
  const { role, token } = useSelector((state) => state.LoginAdmin);
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const total = Produts.reduce((sum, item) => sum + stockRetailValue(item), 0);
  const lowStockCount = Produts.filter(item => item.quantite > 0 && item.quantite < 10).length;
  const outOfStockCount = Produts.filter(item => item.quantite <= 0).length;
  if (!token) return <Navigate to="/LoginChoise" replace />;

  return (
    <main dir={i18n.dir()} className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-7">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-600 dark:text-primary-400">STOCK PRO</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{t("nav.products")}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("productList.caption")}</p>
        </header>
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<IoFileTrayStackedOutline size={23} className="text-blue-600 dark:text-blue-400" />} label={t("productPage.totalProduct")} value={Produts.length} />
          <StatCard icon={<IoBagRemoveOutline size={23} />} label={t("productPage.lowStock")} value={lowStockCount} warning={lowStockCount > 0} />
          <StatCard icon={<IoBanOutline size={23} className="text-rose-500" />} label={t("productPage.outOfStock")} value={outOfStockCount} warning={outOfStockCount > 0} />
          <StatCard icon={<IoWalletOutline size={23} />} label={t("productPage.inventoryValue")} value={role === 'admin' ? `${total.toLocaleString(locale)} DH` : t("productPage.hiddenValue")} />
        </div>
        <ProductList />
      </div>
    </main>
  );
}
