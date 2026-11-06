import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import SalesSummaryCards from "./SalesSummaryCards.jsx";
import { salesWithRevenue, summarizeSales, saleRevenue, salesPeriodKey } from "../../../shared/salesRevenue.js";
import { useDispatch } from "react-redux";
import { getMe } from "../../slices/SliceLoginAdmin.jsx";
import { GetAllEmploye } from "../../slices/sliceEmploye.jsx";
import { useEffect, useMemo, useState } from "react";
import {
  IoCalendarOutline,
  IoFilterOutline,
  IoReceiptOutline,
  IoCartOutline,
  IoChevronDownOutline,
  IoSearchOutline,
  IoFileTrayStackedOutline,
} from "react-icons/io5";
import { FaUserTie } from "react-icons/fa";
import { useSelector } from "react-redux";
import { generateFactureVentesPDF } from "./FactureVentes";
import Dialog from "../Dialog/Dialog";
import DailogInfoVentes from "./Dailoginfoventes";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { usePdfExport } from "../../utils/usePdfExport.js";

function HestoriqueProfit() {
  const operations = useEmployeeOperations('profits');
  const { t, i18n } = useTranslation();
  const { exportPdf, isExporting, exportError } = usePdfExport(generateFactureVentesPDF);
  const [filterType, setFilterType] = useState("day");
  const [periodValue, setPeriodValue] = useState(() => salesPeriodKey());
  const [resultSearch, setResultSearch] = useState("");

  const { user, role, token } = useSelector((state) => state.LoginAdmin);
  const { Employe } = useSelector((state) => state.Employe);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  useEffect(() => { if (token) { dispatch(getMe()); if (role === "admin") dispatch(GetAllEmploye()); } }, [dispatch, token, role]);

  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const isRtl = i18n.dir() === "rtl";
  const padClass = isRtl ? "pr-12 pl-4" : "pl-12 pr-4";
  const iconClass = isRtl ? "right-4" : "left-4";
  const endIconClass = isRtl ? "left-4" : "right-4";

  const currentDay = new Date().toISOString().split("T")[0];
  const currentMonth = salesPeriodKey(new Date(), "month");
  const currentYear = String(new Date().getFullYear());

  useEffect(() => {
    if (!token) navigate("/LoginChoise");
  }, [token, navigate]);

  const allVentes = useMemo(() => {
    if (role === "admin") {
      const adminVentes = salesWithRevenue(user || {}).map((v) => ({ ...v, nameEmp: user?.name || t("historyPage.admin") }));
      const employeVentes =
        Employe?.flatMap((e) => salesWithRevenue(e).map((v) => ({ ...v, nameEmp: e.name || t("historyPage.employee") }))) || [];
      return [...adminVentes, ...employeVentes];
    }
    return (user?.ventes || []).map((v) => ({ ...v, nameEmp: user?.name || t("historyPage.admin") }));
  }, [role, user, Employe, t]);

  const filterByPeriod = (list, key) => {
    if (!periodValue) return [];
    return list.filter(item => salesPeriodKey(item[key], filterType) === periodValue);
  };

  const filteredSales = filterByPeriod(allVentes, "DateVante");

  const displayData = filteredSales.filter((item) => {
    const q = resultSearch.toLowerCase();
    if (!q) return true;
    return String(item.name || "").toLowerCase().includes(q) || String(item.nameEmp || "").toLowerCase().includes(q);
  });

  const summary = summarizeSales(displayData);

  const [openInfo, setOpenInfo] = useState(false);
  const [selectedVente, setSelectedVente] = useState({});

  const handleOpenInfo = (item) => {
    setSelectedVente(item);
    setOpenInfo(true);
  };

  return (
    <div dir={i18n.dir()} className="p-4 min-h-screen bg-[#f8fafc] dark:bg-slate-800 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className={isRtl ? "text-right" : ""}>
          <h1 className="text-4xl font-black tracking-tighter uppercase dark:text-white">{t("historyPage.title")}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mt-1">{t("historyPage.subtitle")}</p>
        </div>

        <SalesSummaryCards summary={summary} history />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-5 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="relative group">
            <IoFilterOutline className={`absolute ${iconClass} top-1/2 -translate-y-1/2 text-primary-500 z-10`} />
            <select
              value={filterType}
              onChange={(e) => {
                const next = e.target.value;
                setFilterType(next);
                setPeriodValue(next === "day" ? currentDay : next === "month" ? currentMonth : currentYear);
              }}
              className={`w-full ${padClass} py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 outline-none appearance-none cursor-pointer text-[11px] font-black uppercase tracking-widest focus:ring-2 ring-primary-500/20`}
            >
              <option value="day">{t("historyPage.daily")}</option>
              <option value="month">{t("historyPage.monthly")}</option>
              <option value="year">{t("historyPage.yearly")}</option>
            </select>
            <IoChevronDownOutline className={`absolute ${endIconClass} top-1/2 -translate-y-1/2 text-slate-400`} />
          </div>

          <div className="relative group">
            <IoCalendarOutline className={`absolute ${iconClass} top-1/2 -translate-y-1/2 text-primary-500 z-10`} />
            <input
              type={filterType === "day" ? "date" : filterType === "month" ? "month" : "number"}
              placeholder={filterType === "year" ? "YYYY" : ""}
              value={periodValue}
              onChange={(e) => setPeriodValue(e.target.value)}
              className={`w-full ${padClass} py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 outline-none text-[11px] font-black uppercase cursor-pointer`}
            />
          </div>

          <div className="relative flex-1">
            <IoSearchOutline className={`absolute ${iconClass} top-1/2 -translate-y-1/2 text-slate-400`} size={20} />
            <input
              type="text"
              value={resultSearch}
              onChange={(e) => setResultSearch(e.target.value)}
              placeholder={t("historyPage.searchResults")}
              className={`w-full ${padClass} py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 outline-none text-[11px] font-bold tracking-widest uppercase`}
            />
          </div>
        </div>

        <div className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${isRtl ? "md:flex-row-reverse" : ""}`}>
            <EmployeeOperation module="profits" operation="download"><button
              onClick={() => exportPdf(displayData)}
              disabled={isExporting}
              aria-busy={isExporting}
              className="px-8 py-4 rounded-2xl bg-primary-900 dark:bg-primary-600 hover:bg-slate-800 dark:hover:bg-primary-700 text-white shadow-xl transition-all flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em]"
            >
              <IoReceiptOutline size={20} />
              {isExporting ? t("salesPdf.exporting") : t("historyPage.printSalesInvoice")}
            </button></EmployeeOperation>
        </div>

        {exportError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{exportError}</p>}
        <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden min-h-[450px]">
          {displayData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 opacity-20">
              <IoFileTrayStackedOutline size={80} />
              <p className="mt-4 font-black uppercase tracking-[0.3em] text-[10px]">{t("historyPage.noDataPeriod")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-start">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-slate-400">
                    <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em]">{t("historyPage.tableDate")}</th>
                    <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em]">{t("historyPage.tableResponsible")}</th>
                    <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em]">
                      {t("historyPage.tableProduct")}
                    </th>
                    <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em] text-center">{t("historyPage.tableQuantity")}</th>
                    <th className="px-8 py-6 text-xs font-bold text-blue-600">{t("salesRevenue.amount")}</th>
                    <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em] text-right">
                      {t("historyPage.tableProfit")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {displayData.map((item, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
                      onClick={() => { if (operations.details) handleOpenInfo(item); }}
                    >
                      <td className="px-8 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">
                        {new Date(item.DateVante).toLocaleDateString(locale)}
                      </td>
                      <td className="px-8 py-5">
                        {item.nameEmp ? (
                          <div className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse justify-end" : ""}`}>
                            <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-500/10 flex items-center justify-center text-primary-600 text-[10px] font-black border border-primary-200 uppercase">
                              {item.nameEmp.charAt(0)}
                            </div>
                            <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">{item.nameEmp}</span>
                          </div>
                        ) : (
                          <div className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse justify-end" : ""}`}>
                            <div className="w-8 h-8 rounded-lg bg-amber-900/20 text-amber-500 border border-amber-500/20 flex items-center justify-center shadow-sm">
                              <FaUserTie size={14} />
                            </div>
                            <div className={`flex flex-col ${isRtl ? "items-end" : ""}`}>
                              <span className="text-[7px] text-amber-500 font-black uppercase tracking-widest leading-none mb-0.5">{t("historyPage.admin")}</span>
                              <span className="text-[11px] text-slate-900 dark:text-white font-black uppercase">{user?.name}</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        <p className="font-black text-xs text-slate-700 dark:text-slate-200 uppercase tracking-tight">
                          {item.name}
                        </p>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black">
                          {item.quantite || 0}
                        </span>
                      </td>
                      <td className="px-8 py-5 font-bold text-blue-700 dark:text-blue-300"><bdi data-sale-revenue data-value={saleRevenue(item)}>{saleRevenue(item).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH</bdi></td>
                      <td className="px-8 py-5 text-right font-black text-sm">
                        <span className="text-primary-600">
                          {Number(item.profite || 0).toLocaleString(locale)} DH
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog
        bgcolor={document.documentElement.classList.contains("dark") ? "#0f172a" : "#ffffff"}
        isOpen={openInfo}
        onClose={() => setOpenInfo(false)}
        width="650px"
        title={t("salesPage.saleDetailsTitle")}
      >
        <DailogInfoVentes vente={selectedVente} onClose={() => setOpenInfo(false)} />
      </Dialog>

    </div>
  );
}

export default HestoriqueProfit;
