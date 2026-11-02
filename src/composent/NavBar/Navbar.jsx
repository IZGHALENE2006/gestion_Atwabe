import { useEffect, useState } from 'react';
import { 
  IoAppsOutline, IoGridOutline, IoPeopleOutline, IoPeopleCircleOutline, IoCartOutline,
  IoBarChartOutline, IoCardOutline, IoReceiptOutline, IoDocumentTextOutline,
  IoPersonOutline, IoLogOutOutline, IoSettingsOutline, IoPricetagsOutline, IoBusinessOutline, IoLayersOutline, IoCutOutline, IoConstructOutline, IoColorPaletteOutline
} from "react-icons/io5";
import { useSelector, useDispatch } from 'react-redux';
import { NavLink, useMatch, useNavigate } from 'react-router-dom';
import { getMe, logoutAdmin } from '../../slices/SliceLoginAdmin';
import {Box} from "lucide-react"
import { IoCashOutline, IoWalletOutline } from "react-icons/io5";
import { useTranslation } from "react-i18next";
export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const addingInvoice = Boolean(useMatch('/Home/Facture/new'));
  const [isExpanded, setIsExpanded] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, role, token } = useSelector(state => state.LoginAdmin);

  const dispatch = useDispatch();
  const nav = useNavigate();

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (token && !loaded) {
      dispatch(getMe());
      setLoaded(true);
    }
  }, [dispatch, token, loaded]);

  const handleProfileClick = () => {
    setProfileOpen(!profileOpen);
  }

  function HanleLogoutAdmin() {
    dispatch(logoutAdmin());
    nav('/LoginAdmin');
  }

  return (
    <div className="fixed z-50 flex min-h-screen">
      <div
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        className={`fixed left-0 top-0 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 
          transition-all duration-300 ease-in-out flex flex-col overflow-hidden shadow-[4px_0_24px_rgba(36,63,91,0.04)]
          ${isExpanded ? 'w-57' : 'w-20'} ${isArabic ? 'right-0 left-auto border-l border-r-0' : 'left-0'}`}
      >
        
        {/* Logo */}
        <div className="flex shrink-0 items-center h-20 px-6">
          <div className="bg-primary-100 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300 p-2 rounded-xl min-w-10 h-10 flex items-center justify-center">
            <Box />
          </div>
          <span className={`${isArabic ? 'mr-4' : 'ml-4'} font-black text-slate-800 dark:text-slate-100 text-lg transition-opacity duration-300 whitespace-nowrap
            ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
            STOCK <span className='text-[#19b393]'>PRO</span>
          </span>
        </div>

        {/* Nav Links */}

        <nav className="min-h-0 grow overflow-x-hidden overflow-y-auto px-3 mt-4 space-y-1.5 pb-3">
          <NavItem to="/Home/pagination" icon={<IoAppsOutline size={22} />} label={t("pageNavigation.title")} expanded={isExpanded} />

          {role === 'admin' && <NavItem to="/Home/Dashboard" icon={<IoBarChartOutline size={22} />} label={t("nav.dashboard")} expanded={isExpanded} />}
          <NavItem to="/Home/Categories" icon={<IoPricetagsOutline size={22} />} label={t("nav.categories")} expanded={isExpanded} />
          <NavItem to="/Home/products" icon={<IoGridOutline size={22} />} label={t("nav.products")} expanded={isExpanded} />
          <NavItem to="/Home/Atwabe" icon={<IoLayersOutline size={22} />} label={t("fabrics.title")} expanded={isExpanded} />
          <NavItem to="/Home/SfifaStock" icon={<IoColorPaletteOutline size={22} />} label={t("sfifaStock.title")} expanded={isExpanded} />
          <NavItem to="/Home/Fesla" icon={<IoCutOutline size={22} />} label={t("fesla.title")} expanded={isExpanded} />
          <NavItem to="/Home/Khadama" icon={<IoConstructOutline size={22} />} label={t("workers.title")} expanded={isExpanded} />
          {role === 'admin' && <NavItem to="/Home/employees/EmployeeDashboard" icon={<IoPeopleOutline size={22} />} label={t("nav.employees")} expanded={isExpanded} />}
         {role === 'admin' && <NavItem to="/Home/Fornisseur" icon={<IoBusinessOutline size={22} />} label={t("nav.suppliers")} expanded={isExpanded} />}

          <NavItem to="/Home/Caisse" icon={<IoCartOutline size={22} />} label={t("nav.cashier")} expanded={isExpanded} />
          <NavItem to="/Home/Facture" icon={<IoReceiptOutline size={22} />} label={t("nav.invoices")} expanded={isExpanded} end={addingInvoice} />
          <NavItem to="/Home/Clients" icon={<IoPeopleCircleOutline size={22} />} label={t("clients.title")} expanded={isExpanded} />
          {role === 'admin' && <NavItem to="/Home/invoice-settings" icon={<IoSettingsOutline size={22} />} label={t("invoiceSettings.title")} expanded={isExpanded} />}
          <NavItem to="/Home/Profit/Ventes" icon={<IoCardOutline size={22} />} label={t("nav.profits")} expanded={isExpanded} />
          <NavItem to="/Home/SideExpenses" icon={<IoCashOutline size={22} />} label={t("sideExpenses.title")} expanded={isExpanded} />
      
          {['admin', 'Employe'].includes(role) && (
            <NavItem
              to="/Home/cridit/add"
              icon={<IoWalletOutline size={22} />}
              label={t("nav.creditManagement")}
              expanded={isExpanded}
            />
          )}
        </nav>


        {/* Profile Section */}
        <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 relative">
          <div className="flex items-center cursor-pointer p-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={handleProfileClick}>
            <div className="min-w-10 h-10 rounded-xl bg-[#19b393]/20 border border-primary-100 dark:border-primary-900/30 flex items-center justify-center text-[#19b393] font-bold">
              <IoPersonOutline size={20} />
            </div>
            <div className={`${isArabic ? 'mr-3' : 'ml-3'} transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap capitalize">{user?.name || t("nav.user")}</p>
              <p className="text-[10px] text-[#19b393] font-black uppercase tracking-wider">{role}</p>
            </div>
          </div>

          {/* Dropdown Menu */}
          {profileOpen && isExpanded && (
            <div className={`absolute bottom-20 w-48 bg-white dark:bg-slate-800 shadow-2xl rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-2 ${isArabic ? 'right-4' : 'left-4'}`}>
              <NavLink
                to="/Home/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center w-full px-4 py-3 text-sm font-medium
                           text-slate-600 dark:text-slate-300
                           hover:bg-slate-50 dark:hover:bg-slate-700/50
                           hover:text-[#19b393] transition"
              >
                <IoSettingsOutline className={isArabic ? "ml-3" : "mr-3"} size={18}/>
                {t("nav.profile")}
              </NavLink>

              <button className="flex items-center w-full px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition" onClick={HanleLogoutAdmin}>
                <IoLogOutOutline className={isArabic ? "ml-3" : "mr-3"} size={18}/> {t("nav.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// NavItem Helper
function NavItem({ to, icon, label, expanded, end = false }) {
  return (
    <NavLink 
      to={to} 
      end={end}
      className={({ isActive }) => `
        flex items-center h-12 rounded-xl transition-all duration-200 
        ${isActive 
          ? 'bg-primary-100 text-primary-800 dark:bg-primary-500/15 dark:text-primary-300'
          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
        }
      `}
    >
      <div className="min-w-14 flex justify-center items-center">
        {icon}
      </div>
      <span className={`font-bold text-sm transition-opacity duration-300 whitespace-nowrap
        ${expanded ? 'opacity-100' : 'opacity-0'}`}>
        {label}
      </span>
    </NavLink>
  );
}
