import { salesWithRevenue, saleRevenue } from "../../../shared/salesRevenue.js";
import { useTranslation } from "react-i18next";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler } from "chart.js";
import { IoPeopleOutline, IoCubeOutline, IoTrendingUpOutline, IoWalletOutline, IoCalendarOutline } from "react-icons/io5";
import Card from "./Card";
import Time from "../La Caisse/DateTime";
import { getMe } from "../../slices/SliceLoginAdmin";
import { GetAllProduct } from "../../slices/SliceProduct";
import { GetAllEmploye } from '../../slices/sliceEmploye';
import { GetAllCatefory } from "../../slices/SilceCategory";
import { Percentage } from "./logic.js";
import Plan1 from "./Plan1";
import Plan2 from "./Plan2";
import Plan3 from "./Plan3";
import Plan4 from "./Plan4";
import stringToColor from "string-to-color";
import { useDispatch, useSelector } from "react-redux";
import { useEffect, useMemo, useState } from "react";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from "react-router";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler);

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, index + 1).toLocaleDateString(locale, { weekday: "short" }));
  const { user, token, role } = useSelector((state) => state.LoginAdmin);
  const { Employe } = useSelector(state => state.Employe);
  const { Produts } = useSelector((state) => state.Product);
  const { Category } = useSelector((state) => state.category);
  
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // New State for Profit Filter (Day / Week / Month)
  const [profitFilter, setProfitFilter] = useState("week");

  useEffect(() => {
    if (token) {
      dispatch(getMe());
      dispatch(GetAllProduct());
      dispatch(GetAllEmploye());
      dispatch(GetAllCatefory());
    } else {
      navigate("/LoginChoise");
    }
  }, [dispatch, token, navigate]);

  const totalprix = Produts?.reduce((acc, product) => acc + product.prix_vente * product.quantite, 0);

  let allVentes = useMemo(() => {
    if (role === "admin") {
      const adminVentes = salesWithRevenue(user || {});
      const employeVentes = Employe?.flatMap(e => 
        salesWithRevenue(e).map(v => ({ ...v, nameEmp: e.name }))
      ) || [];
      return [...adminVentes, ...employeVentes];
    } else {
      return salesWithRevenue(user || {});
    }
  }, [user, Employe, role]);

  // Logic for Dynamic Profit (Chart and Stat Card)
  const getFilteredProfitData = () => {
    const now = new Date();
    
    if (profitFilter === "day") {
      const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      const result = new Array(24).fill(0);
      const todayStr = now.toLocaleDateString();

      let revenue = 0, legacyCount = 0;
      allVentes.forEach(v => {
        const d = new Date(v.DateVante);
        if (d.toLocaleDateString() === todayStr) {
          result[d.getHours()] += Number(v.profite || 0);
          revenue += Math.round(saleRevenue(v) * 100); legacyCount += v.saleAmountSource === "legacy" ? 1 : 0;
        }
      });
      return { legacyCount, revenue: revenue / 100, labels: hours, data: result, label: t("dashboard.profitDay") };

    } else if (profitFilter === "month") {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const labels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
      const result = new Array(daysInMonth).fill(0);

      let revenue = 0, legacyCount = 0;
      allVentes.forEach(v => {
        const d = new Date(v.DateVante);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          result[d.getDate() - 1] += Number(v.profite || 0);
          revenue += Math.round(saleRevenue(v) * 100); legacyCount += v.saleAmountSource === "legacy" ? 1 : 0;
        }
      });
      return { legacyCount, revenue: revenue / 100, labels, data: result, label: t("dashboard.profitMonth") };

    } else {
      const dayseList = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);
      
      const result = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
      let revenue = 0, legacyCount = 0;
      allVentes.forEach(v => {
        const d = new Date(v.DateVante);
        if (d >= monday) {
          const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
          if (result[dayName] !== undefined) { result[dayName] += Number(v.profite || 0); revenue += Math.round(saleRevenue(v) * 100); legacyCount += v.saleAmountSource === "legacy" ? 1 : 0; }
        }
      });
      return { legacyCount, revenue: revenue / 100, labels: weekdayLabels, data: dayseList.map(d => result[d]), label: t("dashboard.profitWeek") };
    }
  };

  const filteredProfit = getFilteredProfitData();
  const totalFilteredProfit = filteredProfit.data.reduce((acc, val) => acc + val, 0);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: { 
        padding: 12, 
        backgroundColor: "#1e293b", 
        titleFont: { size: 14, weight: 'bold' }, 
        cornerRadius: 12, 
        displayColors: false 
      }
    },
    scales: {
      y: { 
        beginAtZero: true, 
        grid: { color: "rgba(148, 163, 184, 0.1)", drawBorder: false }, 
        ticks: { color: "#94a3b8", callback: (value) => value.toLocaleString(locale) + ' DH' }
      },
      x: { grid: { display: false }, ticks: { color: "#94a3b8" } }
    }
  };

  const Plan1Data = {
    labels: filteredProfit.labels,
    datasets: [{
      label: t("dashboard.profitDH"),
      data: filteredProfit.data,
      borderColor: "#19b393",
      borderWidth: 3,
      pointBackgroundColor: "#19b393",
      pointBorderColor: "#19b393",
      pointHoverRadius: 6,
      backgroundColor: (context) => {
        const ctx = context.chart.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 250);
        gradient.addColorStop(0, "rgba(51, 116, 173, 0.4)");
        gradient.addColorStop(1, "rgba(51, 116, 173, 0)");
        return gradient;
      },
      fill: true,
      tension: 0.4,
    }]
  };

  const isDarkMode = document.documentElement.classList.contains('dark');
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const Plan2Data = {
    labels: Category?.map(cat => cat.name),
    datasets: [{
      data: Category?.map(cat => Produts?.filter(p => p.categorie?._id === cat._id).length),
      backgroundColor: ['#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#6366f1'],
      borderColor: isDarkMode ? '#0f172a' : '#ffffff', 
      borderWidth: 2,
      hoverOffset: 15,
      borderRadius: 8,
    }]
  };

  function ventesParJour(ventes = []) {
    const result = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    ventes.forEach(v => {
      if (!v.DateVante) return;
      const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(v.DateVante).getDay()];
      if(result[day] !== undefined) result[day] += v.profite || 0;
    });
    return days.map(d => result[d]);
  }

  const Employees = useMemo(() => {
    if (!Employe) return [];
    return Employe.map(emp => ({
      name: emp.name,
      data: ventesParJour(emp.ventes),
      color: emp.color || stringToColor(emp._id),
    }));
  }, [Employe]);

  const Plan3Data = {
    labels: weekdayLabels,
    datasets: Employees.map((emp) => ({
      label: emp.name,
      data: emp.data,
      borderColor: emp.color,
      tension: 0.4,
    }))
  };

  const Plan4Data = {
    labels: weekdayLabels,
    datasets: [{
      label: t("dashboard.totalValue"),
      data: (function() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        monday.setHours(0, 0, 0, 0);
        const res = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
        allVentes.forEach(v => {
          const vd = new Date(v.DateVante);
          if (vd >= monday) {
            const dName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][vd.getDay()];
            if (res[dName] !== undefined) res[dName] += saleRevenue(v);
          }
        });
        return days.map(d => res[d]);
      })(),
      backgroundColor: "#8b5cf6",
      borderRadius: 8,
    }]
  };

  const stats = [
    { label: t("employees.title"), value: Employe?.length || "0", icon: <IoPeopleOutline />, gradient: "from-blue-400 to-blue-600", text: "text-blue-500 dark:text-blue-400", bg: "bg-blue-500/50", bgIcon: "bg-blue-50 dark:bg-blue-900/20" },
    { label: t("nav.products"), value: Produts?.length || "0", icon: <IoCubeOutline />, gradient: "from-orange-400 to-orange-600", text: "text-orange-500 dark:text-orange-400", bg: "bg-orange-50/50", bgIcon: "bg-orange-50 dark:bg-orange-900/20" },
    { label: `${t("salesRevenue.total")} · ${t(`dashboard.${profitFilter}`)}`, value: filteredProfit.revenue.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DH", icon: <IoWalletOutline />, gradient: "from-indigo-400 to-indigo-600", text: "text-indigo-500 dark:text-indigo-400", bgIcon: "bg-indigo-50 dark:bg-indigo-900/20" },
    { label: filteredProfit.label, value: totalFilteredProfit.toLocaleString(locale) + " Dh", icon: <IoTrendingUpOutline />, gradient: "from-emerald-400 to-emerald-600", text: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-50/50", bgIcon: "bg-emerald-50 dark:bg-emerald-900/20" },
    { label: t("dashboard.totalValue"), value: totalprix?.toLocaleString(locale) + " DH", icon: <IoWalletOutline />, gradient: "from-purple-400 to-purple-600", text: "text-purple-500 dark:text-purple-400", bg: "bg-purple-50/50", bgIcon: "bg-purple-50 dark:bg-purple-900/20" },
  ];

  const produitperc = Percentage(Produts?.map(p => p.categorie?.name));
  const dataset = Plan2Data.datasets[0];
  const dataPlan2 = dataset.data;
  const maxIndex = dataPlan2?.indexOf(Math.max(...dataPlan2));
  const maxColor = dataset.backgroundColor[maxIndex];

  if (user?.role === "Employe") return null;

  return (
    <div className="p-8 bg-gray-100 dark:bg-[#1e293b] min-h-screen space-y-8 transition-colors duration-300">
      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight uppercase">{t("nav.dashboard")} </h1>
          <p className="text-slate-400 dark:text-slate-500 font-medium italic text-sm">{t("dashboard.activityFor")} {user?.name}</p>
        </div>
        <div className="text-center">
          <h1 className="text-[#19b393] font-black text-xl leading-none"><Time /></h1>
          <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold mt-1 uppercase tracking-widest">{new Date().toLocaleDateString(locale)}</p>
        </div>
      </div>

      {/* Cards Section */}
      <div className="gap-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat, i) => <Card data={stat} key={i} />)}
      </div>

      {filteredProfit.legacyCount > 0 && <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-7 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">{t("salesRevenue.legacyNote")}</p>}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-8">
        <div className="lg:col-span-4 bg-linear-to-br from-white to-slate-50 dark:from-slate-900/40 dark:to-slate-900/70 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 p-8 shadow-sm transition-all hover:shadow-md relative">
          
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-slate-700 dark:text-slate-200 font-bold flex items-center gap-2">
              <IoCalendarOutline className="text-[#19b393]" />{t("dashboard.profitOverview")} </h3>
            {/* Filter Buttons */}
            <div className="flex bg-gray-200/50 dark:bg-slate-800 p-1 rounded-xl">
              {['day', 'week', 'month'].map((f) => (
                <button
                  key={f}
                  onClick={() => setProfitFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase ${
                    profitFilter === f 
                    ? 'bg-white dark:bg-slate-700 text-[#19b393] shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {t(`dashboard.${f}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[300px]">
            <Plan1 data={Plan1Data} options={chartOptions} />
          </div>
        </div>

        <div className="lg:col-span-2 bg-linear-to-br from-white to-slate-50 dark:from-slate-900/40 dark:to-slate-900/70 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 p-8 shadow-sm transition-all hover:shadow-md">
          <Plan2 data={Plan2Data} options={chartOptions} maxColor={maxColor} produitperc={produitperc} /> 
        </div>
        <div className="lg:col-span-3 bg-linear-to-l from-white to-slate-50 dark:from-slate-900/40 dark:to-slate-900/70 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 p-8 shadow-sm transition-all hover:shadow-md">
          <Plan3 data={Plan3Data} options={chartOptions} /> 
        </div>
        <div className="lg:col-span-3 bg-linear-to-br from-white to-slate-50 dark:from-slate-900/30 dark:to-slate-900/70 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 p-8 shadow-sm transition-all hover:shadow-md">
          <Plan4 data={Plan4Data} options={chartOptions} /> 
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}
