import { workerPayrollSummary } from "../../shared/workerPayroll.js";
export const reportWorker = { _id: "123456789abcdef1234567890", name: "أمينة العلوي Atelier 12", phone: "0612345678" };
export function reportAccount(extra = []) {
  const earning = (id, month, date, amount, patch = {}) => ({ id, kind: "earning", month, date, amount, category: "machine", workType: "shop", productName: "جلابيب المحل", quantity: 2, unitWage: amount / 2, ...patch });
  const entries = [
    earning("october", "2026-10", "2026-10-15T10:00:00Z", 200),
    earning("boundary", "2026-11", "2026-10-31T23:30:00Z", 150.25, { category: "sfifa", sfifa: { width: "thick", family: "customer" }, quantity: 3.5 }),
    earning("november", "2026-11", "2026-11-03T10:00:00Z", 50.75, { barcode: "FS-123456789ABCDEF1234567890", deletedWork: true }),
    { id: "unpriced", kind: "unpriced", month: "2026-11", date: "2026-11-04T10:00:00Z", amount: null, category: "brim", productName: "البريم", quantity: 1 },
    { id: "settlement", kind: "payment", paymentType: "settlement", month: "2026-10", paidOn: "2026-11-04", date: "2026-11-05T10:00:00Z", amount: 100, note: "تسديد مستحقات أكتوبر", createdByName: "محمد المسؤول" },
    { id: "advance", kind: "payment", paymentType: "advance", month: "2026-12", paidOn: "2026-11-05", date: "2026-11-06T10:00:00Z", amount: 60, note: "تسبيق ديسمبر" },
    ...extra,
  ].sort((a,b)=>new Date(b.date)-new Date(a.date));
  return { entries, ...workerPayrollSummary(entries) };
}
