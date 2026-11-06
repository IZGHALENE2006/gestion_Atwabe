import { autoTable } from "jspdf-autotable";
import i18n from "../../i18n/index.js";
import { createPdfDocument, pdfTableStyles, pdfLtr } from "../../utils/createPdfDocument.js";
import { buildWorkerPayrollReport } from "../../../shared/workerPayrollReports.js";
import { WORKER_PAYROLL_TIMEZONE } from "../../../shared/workerPayroll.js";
import { workerPayrollPeriodLabel, workerPayrollEntryDay, workerPayrollEntryDetail } from "./workerPayrollReportLabels.js";

export async function createWorkerPayrollPDF({ worker, account, filter = { mode: "all" }, language = i18n.language, issuedAt = new Date() }) {
  if (!worker?.name || !account?.totals || !Array.isArray(account.entries)) throw new Error("invalidPayrollReport");
  const report = buildWorkerPayrollReport(account, filter), t = i18n.getFixedT(language), rtl = i18n.dir(language) === "rtl";
  const doc = await createPdfDocument({ rtl }), width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const margin = 14, contentWidth = width - margin * 2, x = rtl ? width - margin : margin, align = { align: rtl ? "right" : "left" };
  const money = value => pdfLtr(Number(value).toFixed(2) + " DH");
  const columns = row => rtl ? [...row].reverse() : row;
  const columnStyles = widths => Object.fromEntries((rtl ? [...widths].reverse() : widths).map((cellWidth, index) => [index, { cellWidth }]));
  const date = new Intl.DateTimeFormat(language === "ar" ? "ar-MA" : "fr-MA", { dateStyle: "short", timeStyle: "short", timeZone: WORKER_PAYROLL_TIMEZONE }).format(new Date(issuedAt));
  const periodLabel = report.period.mode === "week" ? t("workers.payroll.pdf.weekRange", { start: pdfLtr(report.period.start), end: pdfLtr(report.period.end) }) : workerPayrollPeriodLabel(report.period, t, language);
  doc.setProperties({ title: t("workers.payroll.pdf.title") + " - " + worker.name, subject: periodLabel, creator: "Atwabe" });
  let y = 44;
  const ensureSpace = needed => { if (y + needed > height - 23) { doc.addPage(); y = 31; } };
  const text = (value, { size = 11, bold = false, color = [68, 89, 112], gap = 4 } = {}) => {
    doc.setFont("Amiri", bold ? "bold" : "normal").setFontSize(size).setTextColor(...color);
    const lines = doc.splitTextToSize(String(value), contentWidth), lineHeight = size * .42;
    for (const line of lines) {
      if (y + lineHeight > height - 23) { doc.addPage(); y = 31; }
      doc.text(line, x, y, align); y += lineHeight;
    }
    y += gap;
  };
  const table = (head, body, widths, options = {}) => {
    if (y > height - 40) { doc.addPage(); y = 30; }
    autoTable(doc, { ...pdfTableStyles(rtl), startY: y, margin: { top: 28, bottom: 23, left: margin, right: margin }, styles: { ...pdfTableStyles(rtl).styles, fontSize: 10.5, cellPadding: 2.5 }, headStyles: { ...pdfTableStyles(rtl).headStyles, fillColor: [26, 75, 124], textColor: 255 }, alternateRowStyles: { fillColor: [243, 248, 253] }, rowPageBreak: "avoid", head: head ? [columns(head)] : undefined, body: body.map(columns), columnStyles: columnStyles(widths), ...options });
    y = doc.lastAutoTable.finalY + 9;
  };
  doc.setFillColor(17, 50, 84).rect(0, 0, width, 33, "F");
  doc.setFont("Amiri", "bold").setFontSize(22).setTextColor(255, 255, 255).text(t("workers.payroll.pdf.title"), x, 21, align);
  doc.setDrawColor(23, 166, 118).setLineWidth(1).line(margin, 36, width - margin, 36);
  text(worker.name, { size: 17, bold: true, color: [23, 52, 84], gap: 2 });
  if (worker.phone) text(t("workers.payroll.pdf.phone") + ": " + pdfLtr(worker.phone), { gap: 2 });
  text(t("workers.payroll.pdf.generated") + ": " + pdfLtr(date), { size: 10, gap: 6 });
  text(t("workers.payroll.pdf.overall"), { size: 14, bold: true, color: [23, 52, 84], gap: 3 });
  if (y + 30 > height - 23) { doc.addPage(); y = 31; }
  const cardWidth = (contentWidth - 8) / 3;
  ["earned", "paid", "due"].forEach((key, index) => {
    const physical = rtl ? 2 - index : index, left = margin + physical * (cardWidth + 4);
    const color = key === "earned" ? [18, 119, 81] : key === "paid" ? [32, 92, 166] : [139, 93, 20];
    doc.setFillColor(...(key === "earned" ? [234, 249, 241] : key === "paid" ? [236, 244, 255] : [255, 247, 227])).roundedRect(left, y, cardWidth, 25, 2, 2, "F");
    doc.setTextColor(...color).setFont("Amiri", "normal").setFontSize(10).text(t("workers.payroll.total." + key), rtl ? left + cardWidth - 4 : left + 4, y + 8, align);
    doc.setFont("Amiri", "bold").setFontSize(14).text(money(report.accountTotals[key]), rtl ? left + cardWidth - 4 : left + 4, y + 19, align);
  });
  y += 32;
  if (report.accountTotals.advance > 0) text(t("workers.payroll.advanceBalance", { amount: money(report.accountTotals.advance) }), { size: 10 });
  text(t("workers.payroll.pdf.accountHint"), { size: 10 });
  if (report.accountTotals.unpriced > 0) text(t("workers.payroll.unpricedHint", { count: report.accountTotals.unpriced }), { size: 10, color: [139, 93, 20] });
  text(t("workers.payroll.pdf.periodSummary") + " - " + periodLabel, { size: 14, bold: true, color: [32, 92, 166] });
  text(t(report.period.mode === "week" ? "workers.payroll.pdf.weekHint" : "workers.payroll.pdf.monthHint"), { size: 10 });
  const amounts = report.period.mode === "week" ? ["earned", "paid", "balance"] : ["earned", "paid", "due", "advance"];
  table(null, amounts.map(key => [t("workers.payroll.selected." + key), money(report.totals[key])]), [125, contentWidth - 125], { theme: "grid", columnStyles: { ...columnStyles([125, contentWidth - 125]), [rtl ? 0 : 1]: { cellWidth: contentWidth - 125, fontStyle: "bold", textColor: [18, 119, 81] } } });
  if (report.totals.unpriced > 0) text(t("workers.payroll.unpricedHint", { count: report.totals.unpriced }), { size: 10, color: [139, 93, 20] });
  if (report.months.length > 1) {
    ensureSpace(55);
    text(t("workers.payroll.monthSummary"), { size: 13, bold: true });
    const fields = report.period.mode === "week" ? ["earned", "paid", "balance"] : ["earned", "paid", "due", "advance"];
    const firstWidth = 38, amountWidth = (contentWidth - firstWidth) / fields.length;
    table([t("workers.payroll.columns.month"), ...fields.map(key => t("workers.payroll.columns." + key))], report.months.map(row => [pdfLtr(row.month), ...fields.map(key => money(row[key]))]), [firstWidth, ...fields.map(() => amountWidth)]);
  }
  ensureSpace(report.entries.length ? 65 : 25);
  text(t("workers.payroll.history"), { size: 13, bold: true });
  if (report.kind !== "all") text(t("workers.payroll.pdf.filtered", { kind: t("workers.payroll.kinds." + report.kind) }), { size: 10 });
  if (!report.entries.length) text(t("workers.payroll.empty"));
  else table(["date", "month", "detail", "earned", "paid"].map(key => t("workers.payroll.columns." + key)), report.entries.map(entry => [pdfLtr(workerPayrollEntryDay(entry) || "-"), pdfLtr(entry.month), workerPayrollEntryDetail(entry, t), entry.kind === "earning" ? money(entry.amount) : entry.kind === "unpriced" ? t("workers.payroll.unpriced") : "-", entry.kind === "payment" ? money(entry.amount) : "-"]), [24, 24, contentWidth - 106, 29, 29]);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFont("Amiri", "bold").setFontSize(11).setTextColor(23, 52, 84).text(t("workers.payroll.pdf.title"), x, 15, align);
      doc.setDrawColor(23, 166, 118).setLineWidth(.5).line(margin, 20, width - margin, 20);
    }
    doc.setDrawColor(218, 229, 239).setLineWidth(.2).line(margin, height - 18, width - margin, height - 18);
    doc.setFont("Amiri", "normal").setFontSize(9).setTextColor(91, 112, 132).text(t("workers.payroll.pdf.pageLabel") + " " + pdfLtr(page + " / " + pages), width / 2, height - 11, { align: "center" });
  }
  return doc;
}

export async function generateWorkerPayrollPDF(options) {
  const doc = await createWorkerPayrollPDF(options), { period } = buildWorkerPayrollReport(options.account, options.filter || { mode: "all" });
  const suffix = period.mode === "all" ? "all" : period.mode === "week" ? period.start + "_" + period.end : period.month || period.year;
  const id = String(options.worker._id || "worker").replace(/[^a-zA-Z0-9_-]/g, "");
  doc.save("worker-account_" + id + "_" + suffix + ".pdf");
}
