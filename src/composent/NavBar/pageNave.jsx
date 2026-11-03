import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { canOpenEmployeePage } from '../../../shared/employeePermissions.js';
import { Link } from 'react-router-dom';
import {
  IoAppsOutline,
  IoArrowForwardOutline,
  IoBarChartOutline,
  IoBusinessOutline,
  IoCartOutline,
  IoCashOutline,
  IoCutOutline,
  IoConstructOutline,
  IoColorPaletteOutline,
  IoDocumentTextOutline,
  IoGridOutline,
  IoLayersOutline,
  IoLockClosedOutline,
  IoPeopleOutline,
  IoPeopleCircleOutline,
  IoPersonAddOutline,
  IoPersonOutline,
  IoPricetagsOutline,
  IoReceiptOutline,
  IoSettingsOutline,
  IoTimeOutline,
  IoTrendingUpOutline,
  IoWalletOutline,
} from 'react-icons/io5';

const pageGroups = [
  {
    id: 'inventory',
    tone: 'primary',
    pages: [
      { id: 'dashboard', title: 'nav.dashboard', to: '/Home/Dashboard', icon: IoBarChartOutline, adminOnly: true },
      { id: 'products', title: 'nav.products', to: '/Home/products', icon: IoGridOutline },
      { id: 'fabrics', title: 'fabrics.title', description: 'fabrics.subtitle', to: '/Home/Atwabe', icon: IoLayersOutline },
      { id: 'sfifaStock', title: 'sfifaStock.title', description: 'sfifaStock.subtitle', to: '/Home/SfifaStock', icon: IoColorPaletteOutline },
      { id: 'fesla', title: 'fesla.title', description: 'fesla.subtitle', to: '/Home/Fesla', icon: IoCutOutline },
      { id: 'categories', title: 'nav.categories', to: '/Home/Categories', icon: IoPricetagsOutline },
      { id: 'suppliers', title: 'nav.suppliers', to: '/Home/Fornisseur', icon: IoBusinessOutline, adminOnly: true },
    ],
  },
  {
    id: 'sales',
    tone: 'blue',
    pages: [
      { id: 'cashier', title: 'nav.cashier', to: '/Home/Caisse', icon: IoCartOutline },
      { id: 'sales', title: 'salesNav.sales', to: '/Home/Profit/Ventes', icon: IoTrendingUpOutline },
      { id: 'sideExpenses', title: 'sideExpenses.title', description: 'sideExpenses.subtitle', to: '/Home/SideExpenses', icon: IoCashOutline },
      { id: 'invoices', title: 'invoicePage.manualInvoices', to: '/Home/Facture', icon: IoReceiptOutline },
      { id: 'newInvoice', title: 'invoiceCreate.title', to: '/Home/Facture/new', icon: IoDocumentTextOutline },
      { id: 'invoiceSettings', title: 'invoiceSettings.title', to: '/Home/invoice-settings', icon: IoSettingsOutline, adminOnly: true },
      { id: 'cashierInvoices', title: 'invoicePage.cashierInvoices', to: '/Home/Facture/caisse', icon: IoReceiptOutline },
      { id: 'invoiceHistory', title: 'invoicePage.cashierHistory', to: '/Home/Facture/history', icon: IoTimeOutline },
    ],
  },
  {
    id: 'people',
    tone: 'violet',
    pages: [
      { id: 'clients', title: 'clients.title', to: '/Home/Clients', icon: IoPeopleCircleOutline },
      { id: 'workers', title: 'workers.title', description: 'workers.subtitle', to: '/Home/Khadama', icon: IoConstructOutline },
      { id: 'employees', title: 'nav.employees', to: '/Home/employees/EmployeeDashboard', icon: IoPeopleOutline, adminOnly: true },
      { id: 'credit', title: 'nav.creditManagement', to: '/Home/cridit/UserCridit', icon: IoWalletOutline },
      { id: 'newClient', title: 'creditNav.addUser', to: '/Home/cridit/add', icon: IoPersonAddOutline },
    ],
  },
  {
    id: 'account',
    tone: 'amber',
    pages: [
      { id: 'history', title: 'historyPage.title', to: '/Home/Profit/Hestorique', icon: IoTimeOutline },
      { id: 'profile', title: 'nav.profile', to: '/Home/profile', icon: IoPersonOutline },
      { id: 'password', title: 'profile.changePassword', to: '/Home/changePassword', icon: IoLockClosedOutline },
    ],
  },
];

const iconTones = {
  primary: 'bg-primary-50 text-primary-600 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-400 dark:ring-primary-500/20',
  blue: 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20',
};

export default function PageNave() {
  const { t, i18n } = useTranslation();
  const { role, user } = useSelector((state) => state.LoginAdmin);
  const groups = pageGroups
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => (!page.adminOnly || role === 'admin') && canOpenEmployeePage(role, user, page.to)),
    }))
    .filter((group) => group.pages.length > 0);
  const pageCount = groups.reduce((total, group) => total + group.pages.length, 0);

  return (
    <main dir={i18n.dir()} className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-5 border-b border-slate-200 pb-8 dark:border-slate-800">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary-700 dark:text-primary-400">
              <IoAppsOutline size={17} aria-hidden="true" />
              <span>STOCK PRO <span className="mx-1 text-slate-300 dark:text-slate-600">/</span> {t('pageNavigation.workspace')}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('pageNavigation.title')}</h1>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">{pageCount}</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('pageNavigation.availablePages')}</span>
          </div>
        </header>

        <div className="space-y-8 pb-24">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`group-${group.id}`}>
              <h2 id={`group-${group.id}`} className="mb-4 flex items-center gap-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                {t(`pageNavigation.groups.${group.id}`)}
                <span aria-hidden="true" className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {group.pages.map((page) => {
                  const Icon = page.icon;

                  return (
                    <Link
                      key={page.id}
                      to={page.to}
                      aria-labelledby={`page-${page.id}`}
                      aria-describedby={`description-${page.id}`}
                      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:border-primary-400 hover:shadow-lg hover:shadow-primary-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-4 motion-safe:hover:-translate-y-1 motion-reduce:transition-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-primary-500/60 dark:focus-visible:ring-offset-slate-950 sm:p-6"
                    >
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${iconTones[group.tone]}`}>
                          <Icon size={24} aria-hidden="true" />
                        </span>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors group-hover:bg-primary-50 group-hover:text-primary-600 group-focus-visible:text-primary-600 dark:group-hover:bg-primary-500/10 dark:group-hover:text-primary-400">
                          <IoArrowForwardOutline size={18} className="rtl:rotate-180" aria-hidden="true" />
                        </span>
                      </div>
                      <h3 id={`page-${page.id}`} className="text-base font-semibold tracking-tight text-slate-800 dark:text-slate-100">{t(page.title)}</h3>
                      <p id={`description-${page.id}`} className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{t(page.description || `pageNavigation.descriptions.${page.id}`)}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
