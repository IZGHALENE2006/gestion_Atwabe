import { workerPayrollDay } from "../../../shared/workerPayroll.js";
import { workerSfifaNumberLabel } from "./workerSfifaLabels.js";

export function workerPayrollPeriodLabel(period, t, language) {
  if (period.mode === "all") return t("workers.payroll.periods.all");
  if (period.mode === "week") return t("workers.payroll.pdf.weekRange", { start: "\u200e" + period.start + "\u200e", end: "\u200e" + period.end + "\u200e" });
  if (period.mode === "year") return t("workers.payroll.pdf.yearLabel", { year: period.year });
  return new Intl.DateTimeFormat(language === "ar" ? "ar-MA" : "fr-MA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(period.month + "-01T12:00:00Z"));
}

export const workerPayrollEntryDay = entry => entry.kind === "payment" ? entry.paidOn : workerPayrollDay(entry.date);
export function workerPayrollEntryDetail(entry, t) {
  if (entry.kind === "payment") return [t("workers.payroll.types." + entry.paymentType), entry.note, entry.createdByName ? t("workers.payroll.recordedBy") + " " + entry.createdByName : ""].filter(Boolean).join("\n");
  const detail = entry.sfifa ? t("sfifaStock.widths." + entry.sfifa.width) + " " + workerSfifaNumberLabel(entry.sfifa, t) : entry.productName;
  return [t("workers.categories." + entry.category) + " - " + (detail || ""), String(entry.quantity) + " " + t("workers.payroll." + (entry.category === "sfifa" ? "meters" : "pieces")), entry.barcode, entry.deletedWork ? t("workers.payroll.deletedWork") : ""].filter(Boolean).join("\n");
}
