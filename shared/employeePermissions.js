export const EMPLOYEE_MODULES = ["cashier", "credit", "tailoring", "sfifa", "fabrics", "workers", "products", "categories", "clients", "invoices", "profits", "expenses"];
export const EMPLOYEE_MODULE_LABELS = { cashier: "nav.cashier", credit: "nav.creditManagement", tailoring: "fesla.title", sfifa: "sfifaStock.title", fabrics: "fabrics.title", workers: "workers.title", products: "nav.products", categories: "nav.categories", clients: "clients.title", invoices: "nav.invoices", profits: "nav.profits", expenses: "sideExpenses.title" };

// Accounts without an explicit list retain their existing section access.
export function employeeModules(user) {
  return user?.moduleAccess == null ? [...EMPLOYEE_MODULES] : EMPLOYEE_MODULES.filter(key => Array.isArray(user.moduleAccess) && user.moduleAccess.includes(key));
}
export function hasModuleAccess(role, user, module) {
  return role === "admin" || role === "Employe" && employeeModules(user).includes(module);
}
export function validateEmployeePermissions(input) {
  if (!input || !Array.isArray(input.moduleAccess) || input.moduleAccess.some(key => !EMPLOYEE_MODULES.includes(key)) || new Set(input.moduleAccess).size !== input.moduleAccess.length || !input.action || Object.keys(input.action).some(key => !["add", "update", "delete"].includes(key)) || ["add", "update", "delete"].some(key => typeof input.action[key] !== "boolean")) throw new Error("invalidPermissions");
  return { moduleAccess: EMPLOYEE_MODULES.filter(key => input.moduleAccess.includes(key)), action: { add: input.action.add, update: input.action.update, delete: input.action.delete } };
}
export function pageModule(path) {
  const section = String(path).split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "").split("/")[2];
  if (!section || ["pagination", "profile", "changepassword"].includes(section)) return null;
  return ({ caisse: "cashier", cridit: "credit", fesla: "tailoring", sfifastock: "sfifa", atwabe: "fabrics", khadama: "workers", products: "products", categories: "categories", clients: "clients", facture: "invoices", profit: "profits", sideexpenses: "expenses" })[section] || "admin";
}
export function canOpenEmployeePage(role, user, path) {
  const module = pageModule(path);
  return ["admin", "Employe"].includes(role) && (module === null || hasModuleAccess(role, user, module));
}

// Read dependencies support selectors/receipts without granting access to another page.
// All writes still require the owning module and its existing operation permissions.
export function employeeCanRequest(user, method, path) {
  path = String(path).split("?")[0].toLowerCase().replace(/\/+$/, "");
  const read = method === "GET" || method === "HEAD", allowed = (...keys) => keys.some(key => employeeModules(user).includes(key));
  if (path === "/user/getme" || path === "/api/admin/updatepassword") return true;
  if (path.startsWith("/employe") || path.startsWith("/api/admin") || path.startsWith("/fournisseur")) return false;
  if (path.startsWith("/product")) return read && allowed("products", "cashier", "credit", "invoices");
  if (path.startsWith("/category")) return read ? allowed("categories", "products", "cashier", "invoices") : allowed("categories");
  if (path.startsWith("/usercridite")) return allowed("credit");
  if (path === "/addventes/credit") return allowed("cashier") && allowed("credit");
  if (path === "/addventes") return allowed("cashier");
  if (path.startsWith("/tailoring-orders")) return read && !path.includes("/cost-settings") ? allowed("tailoring", "workers") : allowed("tailoring");
  if (path.startsWith("/tailoring-workers")) return allowed("workers") || read && path.endsWith("/tracking") && allowed("tailoring");
  if (path.startsWith("/sfifa-stock")) return allowed("sfifa") || read && allowed("workers");
  if (path.startsWith("/fabrics")) return allowed("fabrics") || read && allowed("tailoring");
  if (path.startsWith("/clients")) return allowed("clients") || read && allowed("cashier", "invoices");
  if (path.startsWith("/sales-documents")) return allowed("invoices");
  if (path.startsWith("/invoice-settings")) return read && allowed("invoices", "cashier", "credit", "tailoring");
  if (path.startsWith("/side-expenses")) return allowed("expenses");
  return false;
}
