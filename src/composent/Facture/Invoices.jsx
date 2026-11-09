import useSearchTarget from "../../hooks/useSearchTarget.js";
import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import { FaFileInvoice, FaSearch, FaUserTie, FaThLarge, FaListUl, FaRegUserCircle } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import InvoiceDetailsDialog from "./InvoiceDetailsDialog";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AddInvoice from "./AddInvoice";
import { Link, Navigate, NavLink, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { IoSettingsOutline } from "react-icons/io5";
import { GetAllEmploye } from "../../slices/sliceEmploye";
import { filterInvoicesByView, invoiceDateKey } from "../../../shared/invoiceFilters.js";

import AddDocumentMenu from "./AddDocumentMenu";
import { useSalesDocuments } from "./useSalesDocuments";
import { documentTypeOf, isSalesDocument, filterSalesDocuments, SALES_DOCUMENT_TYPES } from "../../../shared/salesDocuments.js";

function Invoices() {
  const matchesSearchTarget = useSearchTarget();
  const { t, i18n } = useTranslation();
  const { user, role, token } = useSelector((state) => state.LoginAdmin);
  const { Employe } = useSelector((state) => state.Employe);
  const dispatch = useDispatch();

  useEffect(() => {
    if (token && role === "admin") {
      dispatch(GetAllEmploye());
    }
  }, [dispatch, role, token]);

  const [viewMode, setViewMode] = useState("grid");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("all");
  const addingInvoice = Boolean(useMatch("/Home/Facture/new"));
  const cashierView = Boolean(useMatch("/Home/Facture/caisse"));
  const historyView = Boolean(useMatch("/Home/Facture/history"));
  const view = historyView ? "history" : cashierView ? "cashier" : "manual";
  const [documentFilter, setDocumentFilter] = useState("all");
  const [params] = useSearchParams();
  const creationType = SALES_DOCUMENT_TYPES.includes(params.get("type")) ? params.get("type") : "invoice";
  const notes = useSalesDocuments(token, view === "manual" && !addingInvoice);
  const [filterType, setFilterType] = useState("day");
  const [periodValue, setPeriodValue] = useState(() => invoiceDateKey());
  const navigate = useNavigate();

  const isRtl = i18n.dir() === "rtl";
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const inputPadClass = isRtl ? "pr-12 pl-6" : "pl-12 pr-6";
  const inputIconClass = isRtl ? "right-5" : "left-5";

  const allFactures = useMemo(() => {
    if (role === "admin") {
      const adminFacture = (user?.Facture || []).map((f) => ({ ...f, nameEmp: user?.name, source: "admin" }));
      const employeFacture =
        Employe?.flatMap((e) => (e.Facture || []).map((f) => ({ ...f, nameEmp: e.name, source: e._id }))) || [];
      return [...adminFacture, ...employeFacture];
    }
    return (user?.Facture || []).map((f) => ({ ...f, nameEmp: user?.name, source: user?._id || "user" }));
  }, [role, user, Employe]);

  const visibleInvoices = params.get("record") ? allFactures.filter(matchesSearchTarget) : filterInvoicesByView(allFactures, { view, filterType, periodValue });
  const documents = view === "manual" ? filterSalesDocuments([...visibleInvoices, ...notes.documents.map((note) => ({ ...note, source: note.createdByRole === "admin" ? "admin" : note.createdBy }))], documentFilter).sort((a, b) => new Date(b.DateFacture) - new Date(a.DateFacture)) : visibleInvoices;
  const filteredFactures = documents.filter(matchesSearchTarget).filter((item) => {
    const sellerMatch = selectedSeller === "all" || item.source === selectedSeller;
    const searchValue = searchTerm.toLowerCase();
    const ref = String(item.reference || item._id || "").toLowerCase();
    const seller = String(item.nameEmp || "").toLowerCase();
    const client = String(item.clientName || "").toLowerCase();
    return sellerMatch && (ref.includes(searchValue) || seller.includes(searchValue) || client.includes(searchValue));
  });

  const totalAmount = filteredFactures.reduce((acc, curr) => acc + Number(curr.TotalPrix || 0), 0);

  const handleOpenInfo = (item) => {
    setData(item);
    setOpen(true);
  };

  const resetFilters = () => {
    setDocumentFilter("all");
    setSearchTerm("");
    setSelectedSeller("all");
  };
  const tabClass = (active) => `rounded-xl px-4 py-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${active ? "bg-primary-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`;

  if (!token) return <Navigate to="/LoginChoise" replace />;

  if (addingInvoice) {
    return <AddInvoice key={creationType} documentType={creationType} onCancel={() => navigate("/Home/Facture")} onSaved={(invoice) => {
      if (isSalesDocument(invoice)) notes.retry();
      setDocumentFilter("all");
      navigate("/Home/Facture", { replace: true });
      setSearchTerm("");
      setSelectedSeller("all");
      handleOpenInfo(invoice);
    }} />;
  }

  return (
    <div dir={i18n.dir()} className="p-4 bg-slate-50 dark:bg-[#1e293b] min-h-screen text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t(view === "manual" ? "salesDocuments.title" : "nav.invoices")}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t(view === "manual" ? "salesDocuments.subtitle" : `invoicePage.${view}Subtitle`)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          {role === "admin" && <Link to="/Home/invoice-settings" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold dark:border-slate-700"><IoSettingsOutline size={20} />{t("invoiceSettings.title")}</Link>}
          <AddDocumentMenu />
          </div>
        </header>
        <nav aria-label={t("nav.invoices")} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
          <NavLink to="/Home/Facture" end onClick={resetFilters} className={tabClass(view === "manual")}>
            {t("salesDocuments.manualDocuments")}
          </NavLink>
          <NavLink to="/Home/Facture/caisse" onClick={resetFilters} className={tabClass(view !== "manual")}>
            {t("invoicePage.cashierInvoices")}
          </NavLink>
        </nav>
        {view !== "manual" && (
          <div className="space-y-4">
            <nav aria-label={t("invoicePage.cashierInvoices")} className="flex flex-wrap gap-2">
              <NavLink to="/Home/Facture/caisse" onClick={resetFilters} className={tabClass(cashierView)}>{t("invoicePage.today")}</NavLink>
              <EmployeeOperation module="invoices" operation="history"><NavLink to="/Home/Facture/history" onClick={resetFilters} className={tabClass(historyView)}>{t("invoicePage.cashierHistory")}</NavLink></EmployeeOperation>
            </nav>
            {historyView && (
              <div className="flex flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {t("invoicePage.periodType")}
                  <select
                    value={filterType}
                    onChange={(event) => {
                      const next = event.target.value;
                      setFilterType(next);
                      setPeriodValue(invoiceDateKey().slice(0, next === "day" ? 10 : next === "month" ? 7 : 4));
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="day">{t("historyPage.daily")}</option>
                    <option value="month">{t("historyPage.monthly")}</option>
                    <option value="year">{t("historyPage.yearly")}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  {t("invoicePage.period")}
                  <input
                    type={filterType === "day" ? "date" : filterType === "month" ? "month" : "number"}
                    value={periodValue}
                    onChange={(event) => setPeriodValue(event.target.value)}
                    className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              </div>
            )}
          </div>
        )}
        {view === "manual" && <div className="flex flex-wrap gap-2" role="group" aria-label={t("salesDocuments.filterType")}>
          {["all", ...SALES_DOCUMENT_TYPES].map((type) => <button key={type} type="button" aria-pressed={documentFilter === type} onClick={() => setDocumentFilter(type)} className={tabClass(documentFilter === type)}>{t(type === "all" ? "salesDocuments.all" : `salesDocuments.types.${type}`)}</button>)}
        </div>}
        {view === "manual" && notes.loading && <p role="status" className="text-sm text-slate-500">{t("common.loading")}</p>}
        {view === "manual" && notes.error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{t("salesDocuments.loadFailed")} <button type="button" onClick={notes.retry} className="font-bold underline">{t("invoiceSettings.retry")}</button></div>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            { label: t(view === "manual" ? "salesDocuments.count" : "invoicePage.totalInvoices"), value: filteredFactures.length },
            { label: t(view === "manual" ? "salesDocuments.value" : "invoicePage.totalAmount"), value: totalAmount.toLocaleString(locale) + ' DH' },
          ].map((stat) => (
            <div key={stat.label} className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
                <FaFileInvoice size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                <p className="mt-1 break-words text-2xl font-bold text-slate-800 dark:text-slate-100">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-5 items-center justify-between bg-white dark:bg-slate-900 p-5 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col md:flex-row flex-1 gap-5 w-full">
            <div className="relative flex-1">
              <FaRegUserCircle className={`absolute ${inputIconClass} top-1/2 -translate-y-1/2 text-primary-500`} />
              <select
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                className={`w-full ${inputPadClass} py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 outline-none appearance-none cursor-pointer`}
              >
                <option value="all">{t("invoicePage.allSellers")}</option>
                {role === "admin" && <option value="admin">{t("invoicePage.adminSeller")}</option>}
                {role === "admin" && Employe?.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex-1">
              <FaSearch className={`absolute ${inputIconClass} top-1/2 -translate-y-1/2 text-slate-400`} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t(view === "manual" ? "salesDocuments.search" : "invoicePage.searchPlaceholder")}
                className={`w-full ${inputPadClass} py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-[11px] font-black tracking-widest text-slate-700 dark:text-slate-200 placeholder:opacity-40 outline-none`}
              />
            </div>
          </div>

          <div className="flex bg-slate-50 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-700">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "grid" ? "bg-white dark:bg-slate-900 text-primary-600 shadow-sm border border-slate-100 dark:border-slate-700" : "text-slate-400"}`}
            >
              <FaThLarge /> {t("invoicePage.grid")}
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "list" ? "bg-white dark:bg-slate-900 text-primary-600 shadow-sm border border-slate-100 dark:border-slate-700" : "text-slate-400"}`}
            >
              <FaListUl /> {t("invoicePage.list")}
            </button>
          </div>
        </div>

        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {filteredFactures.map((item) => (
              <div
                key={item._id}
                className="group relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] p-8 shadow-xl shadow-slate-200/40 dark:shadow-none hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary-500/5 rounded-full blur-3xl group-hover:bg-primary-500/10 transition-all" />
                <div className={`flex justify-between items-start mb-8 ${isRtl ? "flex-row-reverse text-right" : ""}`}>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-1">{t("invoicePage.reference")}</p>
                    <h2 className="text-lg break-all font-black dark:text-white">{item.reference || `#${String(item._id).slice(-5).toUpperCase()}`}</h2>
                  </div>
                  <div className="bg-primary-50 dark:bg-primary-500/10 px-4 py-2 rounded-xl border border-primary-100 dark:border-primary-500/20">
                    <span className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase">
                      {new Date(item.DateFacture).toLocaleDateString(locale)}
                    </span>
                  </div>
                </div>

                <DocumentBadge document={item} />
                <div className="space-y-4 mb-8">
                  <div className={`flex items-center justify-between px-1 ${isRtl ? "flex-row-reverse" : ""}`}>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">{t("invoicePage.client")}</span>
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-black italic">{item.clientName || t("invoicePage.walkInClient")}</span>
                  </div>
                  <div className={`p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center gap-4 ${isRtl ? "flex-row-reverse" : ""}`}>
                    {item.source !== "admin" ? (
                      <>
                        <div className="w-10 h-10 rounded-xl bg-primary-500 text-white flex items-center justify-center font-black shadow-lg shadow-primary-500/20">
                          {item.nameEmp?.charAt(0)}
                        </div>
                        <div className={`flex flex-col ${isRtl ? "items-end" : ""}`}>
                          <span className="text-[8px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest leading-none mb-1">
                            {t("invoicePage.seller")}
                          </span>
                          <span className="text-xs text-slate-700 dark:text-slate-200 font-black">{item.nameEmp}</span>
                        </div>
                      </>
                    ) : (
                      <div className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
                        <div className="w-10 h-10 rounded-xl bg-amber-900/20 text-amber-500 border border-amber-500/20 flex items-center justify-center shadow-sm">
                          <FaUserTie size={18} />
                        </div>
                        <div className={`flex flex-col ${isRtl ? "items-end" : ""}`}>
                          <span className="text-[8px] text-amber-500 font-black uppercase tracking-widest leading-none mb-1">{t("invoicePage.admin")}</span>
                          <span className="text-xs text-slate-900 dark:text-white font-black">{user?.name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className={`flex items-center justify-between pt-6 border-t border-slate-50 dark:border-slate-800 ${isRtl ? "flex-row-reverse" : ""}`}>
                  <div className={isRtl ? "text-right" : ""}>
                    <span className="block text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">{t(isSalesDocument(item) ? "salesDocuments.valueTTC" : "invoicePage.netPayable")}</span>
                    <span className="text-3xl font-black text-primary-600 dark:text-primary-500 tracking-tighter">
                      {Number(item.TotalPrix || 0).toLocaleString(locale)} <span className="text-sm font-bold opacity-60">DH</span>
                    </span>
                  </div>
                  <EmployeeOperation module="invoices" anyOf={["details", "print", "download"]}><button
                    onClick={() => handleOpenInfo(item)}
                    className="px-6 py-4 rounded-2xl bg-slate-900 dark:bg-primary-600 text-white font-black text-[10px] uppercase tracking-[0.2em] hover:bg-primary-600 dark:hover:bg-primary-500 shadow-xl shadow-slate-200 dark:shadow-none transition-all active:scale-95"
                  >
                    {t("invoicePage.details")}
                  </button></EmployeeOperation>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {filteredFactures.map((item) => (
                <div key={item._id} className={`group flex flex-wrap gap-4 items-center justify-between p-5 sm:p-8 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all ${isRtl ? "flex-row-reverse" : ""}`}>
                  <div className={`flex items-center gap-8 ${isRtl ? "flex-row-reverse" : ""}`}>
                    <div className="p-4 bg-primary-500 text-white rounded-2xl group-hover:rotate-6 transition-transform shadow-lg shadow-primary-500/20">
                      <FaFileInvoice size={22} />
                    </div>
                    <div className={isRtl ? "text-right" : ""}>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] leading-none mb-2">{t("invoicePage.reference")}</p>
                      <DocumentBadge document={item} />
                      <p className="font-black break-all text-slate-900 dark:text-white text-lg tracking-tight">{item.reference || `#${String(item._id).slice(-5).toUpperCase()}`}</p>
                    </div>
                    <div className={`hidden lg:block border-l border-slate-100 dark:border-slate-800 pl-8 ${isRtl ? "border-l-0 border-r pr-8 text-right" : ""}`}>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] leading-none mb-2">{t("invoicePage.responsible")}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 font-black uppercase tracking-tighter">{item.nameEmp || user?.name}</p>
                    </div>
                  </div>

                  <div className={`flex flex-wrap items-center gap-4 sm:gap-12 ${isRtl ? "flex-row-reverse" : ""}`}>
                    <div className={isRtl ? "text-left" : "text-right"}>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] leading-none mb-2">{t("invoicePage.amountVat")}</p>
                      <p className="text-3xl font-black text-primary-600 dark:text-primary-500 tracking-tighter">
                        {Number(item.TotalPrix || 0).toLocaleString(locale)} <span className="text-xs opacity-50">DH</span>
                      </p>
                    </div>
                    <EmployeeOperation module="invoices" operation="details"><button
                      onClick={() => handleOpenInfo(item)}
                      className="px-8 py-4 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white dark:text-slate-300 font-black text-[10px] uppercase tracking-widest hover:bg-primary-600 transition-all active:scale-95"
                    >
                      {t("invoicePage.open")}
                    </button></EmployeeOperation>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredFactures.length === 0 && (view !== "manual" || (!notes.loading && !notes.error)) && (
          <div className="flex flex-col items-center justify-center py-32 bg-white dark:bg-slate-900 rounded-[4rem] border-2 border-dashed border-slate-100 dark:border-slate-800">
            <div className="p-8 bg-slate-50 dark:bg-slate-800 rounded-full mb-6">
              <FaFileInvoice size={60} className="text-slate-200 dark:text-slate-700" />
            </div>
            <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px]">{t(view === "manual" ? "salesDocuments.empty" : historyView ? "historyPage.noDataPeriod" : "invoicePage.emptyToday")}</p>
          </div>
        )}

        <InvoiceDetailsDialog data={data} onClose={() => setOpen(false)} open={open} />
      </div>
    </div>
  );
}

function DocumentBadge({ document }) {
  const { t } = useTranslation();
  return <div className="mb-3 flex flex-wrap gap-2 text-xs">
    <span className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t(`salesDocuments.types.${documentTypeOf(document)}`)}</span>
    {isSalesDocument(document) && <span className="px-1 py-1 text-slate-500 dark:text-slate-400">{t(document.stockUpdated ? "salesDocuments.stockUpdated" : "salesDocuments.stockUnchanged")}</span>}
  </div>;
}
export default Invoices;
