import { employeeModules, canEmployeeOperation, invoiceCreationOperation } from "./employeeOperations.js";

// Selectors may read dependencies; mutations always require the owning operation.
export function employeeCanRequest(user, method, rawPath, input) {
  const path = String(rawPath).split("?")[0].toLowerCase().replace(/\/+$/, "");
  const body = input && typeof input === "object" ? input : {}, cart = Array.isArray(body.cart) ? body.cart : [];
  const read = method === "GET" || method === "HEAD", allowed = (...keys) => keys.some(key => employeeModules(user).includes(key));
  const can = (module, operation) => canEmployeeOperation("Employe", user, module, operation);
  const any = (module, ...operations) => operations.some(operation => can(module, operation));
  if (path === "/user/getme" || path === "/api/admin/updatepassword") return true;
  if (path.startsWith("/employe") || path.startsWith("/api/admin") || path.startsWith("/fournisseur")) return false;
  if (path.startsWith("/product")) {
    if (read) return path === "/product/get" && allowed("products", "categories", "cashier", "credit", "invoices");
    return path === "/product/add" && method === "POST" ? can("products", "add") : /\/restocks$/.test(path) && method === "POST" ? can("products", "restock") : path.startsWith("/product/update/") && method === "PUT" ? can("products", "update") : path.startsWith("/product/delete/") && method === "DELETE" && can("products", "delete");
  }
  if (path.startsWith("/category")) return read ? allowed("categories", "products", "cashier", "invoices") : path === "/category/add" && method === "POST" ? can("categories", "add") : path.startsWith("/category/update/") && method === "PATCH" ? can("categories", "update") : path.startsWith("/category/delete/") && method === "DELETE" && can("categories", "delete");
  if (path.startsWith("/usercridite")) {
    if (read) return /\/get\/.+/.test(path) ? any("credit", "details", "addDebt", "payment", "history", "print", "share") : allowed("credit");
    if (path === "/usercridite/add" && method === "POST") return can("credit", "add");
    if (path.startsWith("/usercridite/add-product/") && method === "POST") return can("credit", "addDebt") && (!(Number(body.Paiement) > 0) || can("credit", "payment"));
    if (path.startsWith("/usercridite/add-payment/") && method === "POST") return can("credit", "payment");
    return method === "DELETE" && (path.startsWith("/usercridite/deleteproduct/") ? can("credit", "deleteDebt") : path.startsWith("/usercridite/delete/") && can("credit", "delete"));
  }
  if (["/addventes", "/addventes/credit", "/sales-documents"].includes(path)) {
    if (read) return path === "/sales-documents" && allowed("invoices");
    if (method !== "POST") return false;
    const module = path === "/sales-documents" || path === "/addventes" && body.invoiceOrigin === "manual" ? "invoices" : "cashier";
    const operation = path === "/sales-documents" ? invoiceCreationOperation(body.documentType) || "addQuote" : module === "invoices" ? "addInvoice" : path.endsWith("/credit") ? "creditSale" : "sell";
    if (!can(module, operation)) return false;
    if ((Number(body.discountValue) > 0 || cart.some(row => Number(row?.discountValue) > 0)) && !can(module, "discount")) return false;
    if (cart.some(row => row?.priceType === "wholesale") && !can(module, "wholesale")) return false;
    if (path === "/sales-documents" && body.updateStock === true && !can("invoices", "stockMove")) return false;
    if (path.endsWith("/credit") && (!can("credit", "addDebt") || body.newCustomer && !can("credit", "add") || Number(body.amountPaid) > 0 && !can("credit", "payment"))) return false;
    return true;
  }
  if (path.startsWith("/tailoring-orders")) {
    if (read) return path.endsWith("/cost-settings") ? any("tailoring", "settings", "add", "update") : path.endsWith("/work-status") ? can("tailoring", "tracking") : allowed("tailoring", "workers");
    if (path.endsWith("/cost-settings") && method === "PUT") return can("tailoring", "settings");
    if (path.endsWith("/payments") && method === "POST") return can("tailoring", "payment");
    if (path.endsWith("/deliver") && method === "POST") return can("tailoring", "deliver");
    return path === "/tailoring-orders" && method === "POST" ? can("tailoring", "add") && (user?.operationPermissions === undefined || !(Number(body.paidAmount) > 0) || can("tailoring", "payment")) : method === "PUT" && can("tailoring", "update");
  }
  if (path.startsWith("/tailoring-workers")) {
    if (read) return path.endsWith("/payroll") ? any("workers", "payroll", "pay", "advance", "download") : path.endsWith("/orders") || path.endsWith("/material-options") ? any("workers", "assign", "increase") : allowed("workers");
    if (path.endsWith("/payments") && method === "POST") return can("workers", body.type === "advance" ? "advance" : "pay");
    if (path.endsWith("/completions") && method === "POST") return can("workers", "complete");
    if (path.endsWith("/increases") && method === "POST") return can("workers", "increase");
    if (path.endsWith("/cancel") && method === "POST") return can("workers", "cancelWork");
    if (path.endsWith("/materials/resume") && method === "POST") return can("workers", "resume");
    if (path.endsWith("/work") && method === "POST") return can("workers", "assign");
    if (/\/work\/.+/.test(path) && method === "DELETE") return can("workers", "deleteWork");
    return path === "/tailoring-workers" && method === "POST" ? can("workers", "add") : method === "PUT" && can("workers", "update");
  }
  if (path.startsWith("/sfifa-stock")) {
    if (read) return path.endsWith("/history") ? can("sfifa", "history") : allowed("sfifa", "workers");
    return method === "POST" ? can("sfifa", path.endsWith("/restock") ? "restock" : "add") : method === "PUT" ? can("sfifa", "update") : method === "DELETE" && can("sfifa", "delete");
  }
  if (path.startsWith("/fabrics")) {
    if (read) return path.endsWith("/movements") ? can("fabrics", "history") : allowed("fabrics", "tailoring");
    if (method === "DELETE") return can("fabrics", path.includes("/pieces/") ? "deletePiece" : path.includes("/colors/") ? "deleteColor" : "delete");
    return method === "POST" ? can("fabrics", path.endsWith("/reductions") ? "reduce" : "add") : method === "PUT" && any("fabrics", "update", "addColor", "addPiece");
  }
  if (path.startsWith("/clients")) return read ? allowed("clients", "cashier", "invoices") : method === "POST" ? can("clients", "add") : method === "PUT" && can("clients", "update");
  if (path.startsWith("/invoice-settings")) return read && allowed("invoices", "cashier", "credit", "tailoring");
  if (path.startsWith("/side-expenses")) return read ? allowed("expenses") : method === "POST" && can("expenses", "add");
  return false;
}
