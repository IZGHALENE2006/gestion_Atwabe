import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import React, { useState, useEffect } from "react";
import {
  IoFlashOutline,
  IoCartOutline,
  IoReceiptOutline,
  IoAdd,
  IoRemove,
  IoTrashOutline,
} from "react-icons/io5";
import gsap from "gsap";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";

const FunctionBtn = ({ label, isActive, onClick, activeColor }) => (
  <button
    onClick={onClick}
    className={`relative py-4 rounded-3xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-sm active:scale-95 border-2 flex items-center justify-center gap-2 ${
      isActive
        ? `${activeColor} text-white border-transparent shadow-lg`
        : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800 hover:border-primary-200 dark:hover:border-primary-900/50"
    }`}
  >
    {label}
  </button>
);

export default function RightSidebar({ panierItems = [], onUpdateQty, onRemoveItem, onPriceTypeChange }) {
  const operations = useEmployeeOperations('cashier');
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("panier");
  const { user, role } = useSelector((state) => state.LoginAdmin);
  const { Employe } = useSelector((state) => state.Employe);

  let allVentes = [];
  if (role === "admin") {
    const adminVentes = user?.ventes || [];
    const employeVentes =
      Employe?.flatMap((e) => (e.ventes || []).map((v) => ({ ...v, nameEmp: e.name }))) || [];
    allVentes = [...adminVentes, ...employeVentes];
  } else {
    allVentes = user?.ventes || [];
  }

  const day = new Date().toLocaleDateString();
  const ventesDujour = allVentes.filter(
    (item) => new Date(item.DateVante).toLocaleDateString() === day
  );

  useEffect(() => {
    if (activeTab === "panier" && panierItems.length > 0) {
      gsap.fromTo(
        ".cart-item-anim",
        { x: 30, opacity: 0 },
        { x: 0, opacity: 1, stagger: 0.1, duration: 0.4, ease: "back.out(1.7)" }
      );
    }
  }, [panierItems.length, activeTab]);


  return (
    <div className="w-full lg:w-100 flex flex-col gap-6">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <IoFlashOutline size={18} className="text-primary-500" /> {t("cashier.quickActions")}
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FunctionBtn
            label={t("cashier.cart")}
            isActive={activeTab === "panier"}
            onClick={() => setActiveTab("panier")}
            activeColor="bg-amber-400 shadow-amber-500/20"
          />
          <EmployeeOperation module="cashier" operation="history"><FunctionBtn
            label={t("cashier.orders")}
            isActive={activeTab === "commandes"}
            onClick={() => setActiveTab("commandes")}
            activeColor="bg-sky-600 shadow-sky-500/20"
          /></EmployeeOperation>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 flex-1 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden min-h-125 flex flex-col shadow-sm transition-colors">
        {activeTab === "panier" || !operations.history ? (
          <>
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-black text-sm flex items-center gap-2 text-slate-900 dark:text-white uppercase tracking-tight">
                <IoCartOutline size={22} className="text-primary-500" /> {t("cashier.cart")}
              </h3>
              <span className="bg-primary-500 text-white text-[10px] px-3 py-1.5 rounded-xl font-black shadow-lg shadow-primary-500/20">
                {panierItems.length} {t("cashier.items")}
              </span>
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {panierItems.length > 0 ? (
                panierItems.map((item) => (
                  <div
                    key={item.key}
                    data-cart-batch={item.batchId}
                    data-cart-price-type={item.priceType}
                    className="cart-item-anim flex flex-wrap justify-between items-center gap-3 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 group hover:border-primary-200 dark:hover:border-primary-800 transition-all"
                  >
                    <div className="flex gap-3 items-center">
                      <div className="flex flex-col items-center gap-1 mr-1">
                        <button
                          onClick={() => onUpdateQty(item.key, item.qty + 1)}
                          aria-label={`+ ${item.name}`}
                          className="p-1 hover:bg-primary-500 hover:text-white rounded-md transition-colors text-primary-600"
                        >
                          <IoAdd size={14} />
                        </button>
                        <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center font-black text-[10px]">
                          {item.qty}x
                        </div>
                        <button
                          aria-label={`− ${item.name}`}
                          onClick={() =>
                            item.qty > 1
                              ? onUpdateQty(item.key, item.qty - 1)
                              : onRemoveItem(item.key)
                          }
                          className="p-1 hover:bg-rose-500 hover:text-white rounded-md transition-colors text-slate-400"
                        >
                          {item.qty > 1 ? (
                            <IoRemove size={14} />
                          ) : (
                            <IoTrashOutline size={14} className="text-rose-500" />
                          )}
                        </button>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[12px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight line-clamp-1">
                          {item.name}
                        </p>
                        {item.batchNumber && <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">{t("productBatches.batch", { number: item.batchNumber })}</p>}
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                          {item.price} DH / {t("cashier.unit")}
                        </p>
                        <div role="group" aria-label={t('pricing.priceTypeFor', { name: item.name })} className="mt-2 flex flex-wrap gap-1">
                          {['retail', 'wholesale'].filter(type => type === 'retail' || operations.wholesale).map((type) => (
                            <button
                              key={type}
                              type="button"
                              aria-pressed={item.priceType === type}
                              disabled={type === 'wholesale' && item.wholesalePrice === null}
                              title={type === 'wholesale' && item.wholesalePrice === null ? t('pricing.wholesaleUnavailable') : undefined}
                              onClick={() => onPriceTypeChange(item.key, type)}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${item.priceType === type ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
                            >{t(`pricing.${type}`)}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900 dark:text-white text-sm">
                        {(item.price * item.qty).toFixed(2)} DH
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 space-y-4">
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-full border-2 border-dashed border-slate-100 dark:border-slate-800">
                    <IoCartOutline size={48} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em]">
                    {t("cashier.emptyCart")}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-black text-sm flex items-center gap-2 text-slate-900 dark:text-white uppercase tracking-tight">
                <IoReceiptOutline size={22} className="text-primary-500" /> {t("cashier.history")}
              </h3>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-400 dark:text-slate-500 text-[9px] font-black uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="p-5">ID</th>
                    <th className="p-5">{t("cashier.time")}</th>
                    <th className="p-5">{t("cashier.profit")}</th>
                    <th className="p-5 text-right">{t("cashier.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {ventesDujour.length > 0 ? (
                    ventesDujour.map((cmd) => (
                      <tr
                        key={cmd._id || cmd.id}
                        className="hover:bg-primary-50 dark:hover:bg-primary-500/5 transition-colors cursor-pointer group"
                      >
                        <td className="p-5 text-xs font-black text-slate-900 dark:text-slate-200">
                          #{cmd._id ? cmd._id.slice(0, 4) : "-"}
                        </td>
                        <td className="p-5 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                          {(() => {
                            const [, timePart] = String(cmd.DateVante).split("T");
                            return timePart ? timePart.split(".")[0] : "-";
                          })()}
                        </td>

                        <td className="p-5 text-xs font-black text-primary-600 dark:text-primary-400">
                          {cmd.profite} DH
                        </td>
                        <td className="p-5 text-right">
                          <span className="bg-primary-100 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter border border-primary-200 dark:border-primary-500/20">
                            {t(cmd.saleType === "credit" ? "creditCheckout.credit" : "cashier.paid")}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="p-20 text-center">
                        <p className="text-slate-300 dark:text-slate-700 font-black text-[10px] uppercase tracking-[0.3em]">
                          {t("cashier.noOrders")}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
