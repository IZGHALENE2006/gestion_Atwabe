export const EMPLOYEE_MODULES = ["cashier", "credit", "tailoring", "sfifa", "fabrics", "workers", "products", "categories", "clients", "invoices", "profits", "expenses"];
export const EMPLOYEE_MODULE_LABELS = { cashier: "nav.cashier", credit: "nav.creditManagement", tailoring: "fesla.title", sfifa: "sfifaStock.title", fabrics: "fabrics.title", workers: "workers.title", products: "nav.products", categories: "nav.categories", clients: "clients.title", invoices: "nav.invoices", profits: "nav.profits", expenses: "sideExpenses.title" };
// One catalogue for the permission editor, UI controls and server authorization.
export const EMPLOYEE_OPERATIONS = {
  cashier: ["history", "sell", "creditSale", "discount", "wholesale", "print"],
  credit: ["add", "details", "addDebt", "payment", "deleteDebt", "delete", "history", "print", "share"],
  tailoring: ["add", "update", "details", "payment", "deliver", "cancel", "settings", "profits", "tracking", "print", "labels"],
  sfifa: ["add", "update", "restock", "delete", "history", "labels"],
  fabrics: ["details", "add", "update", "addColor", "addPiece", "delete", "deleteColor", "deletePiece", "reduce", "history", "labels", "catalog"],
  workers: ["add", "update", "delete", "assign", "complete", "increase", "deleteWork", "cancelWork", "resume", "details", "payroll", "pay", "advance", "download", "labels"],
  products: ["add", "update", "restock", "delete", "details", "labels"],
  categories: ["add", "update", "delete"], clients: ["add", "update"],
  invoices: ["history", "addInvoice", "addQuote", "addDelivery", "addReturn", "addCreditNote", "stockMove", "discount", "wholesale", "details", "print", "download"],
  profits: ["history", "details", "download"], expenses: ["add"],
};
export function employeeModules(user) {
  return user?.moduleAccess == null ? [...EMPLOYEE_MODULES] : EMPLOYEE_MODULES.filter(key => Array.isArray(user.moduleAccess) && user.moduleAccess.includes(key));
}
export function hasModuleAccess(role, user, module) { return role === "admin" || role === "Employe" && employeeModules(user).includes(module); }
function legacyOperation(user, module, operation) {
  if (module === "tailoring" && operation === "cancel") return user?.action?.delete === true;
  if (module === "products" && ["add", "update", "restock", "delete"].includes(operation)) return false;
  if (module === "credit") return !["delete", "deleteDebt"].includes(operation);
  if (["cashier", "categories", "invoices", "profits"].includes(module)) return true;
  const action = operation === "restock" ? "add" : ["assign", "increase"].includes(operation) ? "add" : ["addColor", "addPiece", "complete", "reduce", "payment", "deliver", "settings", "pay", "advance"].includes(operation) ? "update" : ["deleteColor", "deletePiece", "deleteWork", "cancelWork"].includes(operation) ? "delete" : operation;
  if (operation === "resume") return user?.action?.add === true || user?.action?.delete === true;
  return ["add", "update", "delete"].includes(action) ? user?.action?.[action] === true : true;
}
export function employeeOperations(user, module) {
  const available = EMPLOYEE_OPERATIONS[module] || [];
  if (user?.operationPermissions === undefined) return available.filter(operation => legacyOperation(user, module, operation));
  const chosen = user.operationPermissions?.[module];
  return available.filter(operation => Array.isArray(chosen) && chosen.includes(operation));
}
export function canEmployeeOperation(role, user, module, operation) {
  return Boolean(EMPLOYEE_OPERATIONS[module]?.includes(operation)) && (role === "admin" || role === "Employe" && hasModuleAccess(role, user, module) && employeeOperations(user, module).includes(operation));
}
export function moduleOperationPermissions(role, user, module) {
  return Object.fromEntries((EMPLOYEE_OPERATIONS[module] || []).map(operation => [operation, canEmployeeOperation(role, user, module, operation)]));
}
export function employeePermissionValue(user) {
  return { moduleAccess: employeeModules(user), operationPermissions: Object.fromEntries(EMPLOYEE_MODULES.map(module => [module, employeeOperations(user, module)])) };
}
export function validateEmployeePermissions(input) {
  const invalid = () => { throw new Error("invalidPermissions"); };
  if (!input || !Array.isArray(input.moduleAccess) || input.moduleAccess.some(key => !EMPLOYEE_MODULES.includes(key)) || new Set(input.moduleAccess).size !== input.moduleAccess.length) invalid();
  const moduleAccess = EMPLOYEE_MODULES.filter(key => input.moduleAccess.includes(key));
  if (input.operationPermissions === undefined) {
    if (!input.action || Object.keys(input.action).some(key => !["add", "update", "delete"].includes(key)) || ["add", "update", "delete"].some(key => typeof input.action[key] !== "boolean")) invalid();
    return { ...employeePermissionValue(input), moduleAccess, action: { ...input.action } };
  }
  const values = input.operationPermissions;
  if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).some(key => !EMPLOYEE_MODULES.includes(key))) invalid();
  for (const [module, operations] of Object.entries(values)) if (!Array.isArray(operations) || operations.some(operation => !EMPLOYEE_OPERATIONS[module].includes(operation)) || new Set(operations).size !== operations.length) invalid();
  const operationPermissions = Object.fromEntries(EMPLOYEE_MODULES.map(module => [module, EMPLOYEE_OPERATIONS[module].filter(operation => values[module]?.includes(operation))]));
  const action = Object.fromEntries(["add", "update", "delete"].map(operation => [operation, moduleAccess.some(module => operationPermissions[module].includes(operation))]));
  return { moduleAccess, operationPermissions, action };
}
export const invoiceCreationOperation = type => ({ invoice: "addInvoice", quote: "addQuote", delivery: "addDelivery", return: "addReturn", credit: "addCreditNote" })[type];
