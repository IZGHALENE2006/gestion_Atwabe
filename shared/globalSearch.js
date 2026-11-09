import { canOpenEmployeePage, hasModuleAccess } from './employeePermissions.js';

export const SEARCH_GROUPS = ['pages', 'products', 'fabrics', 'sfifa', 'tailoring', 'workers', 'work', 'credit', 'employees', 'clients', 'categories', 'suppliers', 'expenses', 'invoices'];
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 120;
export function searchText(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[٠-٩۰-۹]/g, char => String(char.charCodeAt(0) - (char <= '٩' ? 0x660 : 0x6f0))).toLowerCase().trim();
}
export const searchTokens = value => searchText(value).split(/\s+/).filter(Boolean).slice(0, 8);
export const searchMatches = (value, query) => searchTokens(query).every(token => searchText(value).includes(token));

export function allowedSearchGroups(role, user) {
  const has = module => hasModuleAccess(role, user, module);
  return [
    ...['products', 'fabrics', 'sfifa', 'tailoring', 'workers', 'credit', 'clients', 'categories', 'expenses'].filter(has),
    ...(has('workers') ? ['work'] : []),
    ...(role === 'admin' ? ['employees', 'suppliers'] : []),
    ...(has('invoices') ? ['invoices'] : []),
  ];
}

export const SEARCH_PAGES = [
  ['dashboard', '/Home/Dashboard', 'لوحة التحكم إحصائيات dashboard statistiques'],
  ['products', '/Home/products', 'منتجات منتج سلع مخزون produits stock product'],
  ['fabrics', '/Home/Atwabe', 'أثواب ثوب ألوان قطع قماش atwabe tissu tissus fabric'],
  ['sfifa', '/Home/SfifaStock', 'سفيفة رقيقة عريضة مخزون sfifa stock'],
  ['tailoring', '/Home/Fesla', 'فصالة طلبات جلابة جلابيب fesla couture commande djellaba'],
  ['trousers', '/Home/Fesla?garment=trousers', 'سروال سراويل قندريسي عادي pantalon pantalons'],
  ['shirts', '/Home/Fesla?garment=shirts', 'قميص أقمصة chemise chemises'],
  ['jabador', '/Home/Fesla?garment=jabador', 'جبادور jabador'],
  ['malakiya', '/Home/Fesla?garment=malakiya', 'ملكية مالكية malakiya'],
  ['workers', '/Home/Khadama', 'عمال عامل أعمال خياطة آلة تصفية بريم مصبنة ouvriers travail machine finition lavage'],
  ['credit', '/Home/cridit/UserCridit', 'ديون دين كريدي مدين دفعات ذمم crédit credit dette paiement'],
  ['employees', '/Home/employees/EmployeeDashboard', 'موظف موظفون مستخدمون صلاحيات صلاحية أجرة أجور employé employes permissions salaire'],
  ['cashier', '/Home/Caisse', 'صندوق بيع ventes caisse cashier'],
  ['clients', '/Home/Clients', 'زبون زبائن عميل عملاء clients client'],
  ['categories', '/Home/Categories', 'فئة فئات تصنيف catégories categorie'],
  ['suppliers', '/Home/Fornisseur', 'مورد موردون fournisseurs fournisseur'],
  ['expenses', '/Home/SideExpenses', 'مصاريف جانبية ماء كهرباء انترنت كراء dépenses eau électricité wifi loyer'],
  ['invoices', '/Home/Facture', 'فواتير فاتورة وثائق عرض سعر توصيل facture devis documents'],
  ['profits', '/Home/profit/Ventes', 'أرباح ربح مبيعات bénéfices profit ventes'],
  ['tailoringProfits', '/Home/Fesla?view=profits&scope=all', 'أرباح فصالة bénéfices couture'],
  ['profile', '/Home/profile', 'حساب ملف شخصي profil compte'],
  ['password', '/Home/changePassword', 'تغيير كلمة المرور mot de passe password'],
  ['invoiceSettings', '/Home/invoice-settings', 'إعدادات فاتورة شعار paramètres facture logo'],
];
export function searchPages(query, role, user, translate = key => key) {
  return SEARCH_PAGES.filter(([id, path, aliases]) => canOpenEmployeePage(role, user, path) && searchMatches(aliases + ' ' + translate('globalSearch.pages.' + id), query))
    .map(([id, path]) => ({ id: 'page:' + id, titleKey: 'globalSearch.pages.' + id, path, facts: [] }));
}
