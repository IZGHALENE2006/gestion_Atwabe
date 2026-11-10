export * from "./employeeOperations.js";
export { employeeCanRequest } from "./employeeRequestPermissions.js";
import { hasModuleAccess, canEmployeeOperation, invoiceCreationOperation } from "./employeeOperations.js";

export function pageModule(path) {
  const section = String(path).split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "").split("/")[2];
  if (!section || ["pagination", "profile", "changepassword"].includes(section)) return null;
  return ({ caisse: "cashier", cridit: "credit", fesla: "tailoring", sfifastock: "sfifa", atwabe: "fabrics", khadama: "workers", products: "products", categories: "categories", clients: "clients", facture: "invoices", profit: "profits", sideexpenses: "expenses" })[section] || "admin";
}
export function canOpenEmployeePage(role, user, path) {
  const module = pageModule(path);
  if (!["admin", "Employe"].includes(role) || module !== null && !hasModuleAccess(role, user, module)) return false;
  const url = new URL(String(path), "http://permissions.local");
  if (module === "invoices" && /\/new\/?$/i.test(url.pathname)) return canEmployeeOperation(role, user, module, invoiceCreationOperation(url.searchParams.get("type") || "invoice"));
  if (module === "invoices" && /\/history\/?$/i.test(url.pathname)) return canEmployeeOperation(role, user, module, "history");
  if (module === "fabrics" && /\/profits\/?$/i.test(url.pathname)) return canEmployeeOperation(role, user, module, "profits");
  if (module === "tailoring" && url.searchParams.get("view") === "profits") return canEmployeeOperation(role, user, module, "profits");
  if (module === "credit" && /\/add\/?$/i.test(url.pathname)) return canEmployeeOperation(role, user, module, "add");
  if (module === "profits" && /\/hestorique\/?$/i.test(url.pathname)) return canEmployeeOperation(role, user, module, "history");
  return true;
}

