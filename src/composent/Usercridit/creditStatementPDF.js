import { autoTable } from "jspdf-autotable";
import { normalizeInvoiceSettings } from "../../../shared/invoiceSettings.js";
import { creditRound } from "../../../shared/creditDocuments.js";
import { createPdfDocument, pdfTableStyles, pdfLtr } from "../../utils/createPdfDocument.js";
import { invoiceLogoUrl } from "../Facture/invoicePresentation.js";

// Render only the customer-facing statement or the selected payment receipt.
export async function createCreditStatementPDF(data, settings, { t, rtl, locale }) {
  const doc = await createPdfDocument({ rtl });
  const config = normalizeInvoiceSettings(settings || {}), visible = config.visibility;
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const receipt = data.kind === 'payment', title = t(receipt ? 'creditDocuments.paymentTitle' : 'creditDocuments.share.pdfTitle');
  const order = cells => rtl ? [...cells].reverse() : cells;
  const textOptions = { align: rtl ? "right" : "left" }, x = rtl ? width - 14 : 14;
  const money = value => pdfLtr(`${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(creditRound(value))} ${rtl ? "درهم" : "DH"}`);
  const date = (value, time = false) => value && Number.isFinite(new Date(value).getTime()) ? pdfLtr(new Date(value).toLocaleString(locale, { dateStyle: "short", ...(time ? { timeStyle: "short" } : {}) }).replace(/[\u061c\u200e\u200f]/g, "")) : "-";
  const base = pdfTableStyles(rtl);
  const table = { ...base, theme: "grid", rowPageBreak: "avoid", styles: { ...base.styles, fontSize: 10, cellPadding: 2.5, textColor: [30, 45, 65], lineColor: [219, 228, 238], lineWidth: 0.2 }, headStyles: { ...base.headStyles, fillColor: [37, 83, 158], textColor: [255, 255, 255] } };
  let y = 15;
  const business = [visible.shopName && config.shopName || t("creditDocuments.shopFallback"), ...["address", "phone", "email"].filter(key => visible[key] && config[key]).map(key => key === "address" ? config[key] : pdfLtr(config[key]))];
  autoTable(doc, { ...table, theme: "plain", startY: y, tableWidth: 130, margin: { ...base.margin, left: rtl ? width - 144 : 14, right: rtl ? 14 : width - 144 }, body: business.map(text => [text]), styles: { ...table.styles, cellPadding: 0.6, lineWidth: 0 }, didParseCell: cell => { if (cell.row.index === 0) { cell.cell.styles.fontSize = 17; cell.cell.styles.fontStyle = "bold"; cell.cell.styles.textColor = [22, 107, 89]; } } });
  y = doc.lastAutoTable.finalY + 8;
  const logoUrl = visible.logo ? invoiceLogoUrl(config.logo) : "";
  if (logoUrl) {
    const response = await fetch(logoUrl);
    if (!response.ok) throw new Error("Credit statement logo unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer()), info = doc.getImageProperties(bytes);
    const scale = Math.min(32 / info.width, 23 / info.height);
    doc.addImage(bytes, info.fileType, rtl ? 14 : width - 46, 15, info.width * scale, info.height * scale);
    y = Math.max(y, 44);
  }
  autoTable(doc, { ...table, startY: y, theme: "plain", body: [[title], [`${t("creditDocuments.reference")}: ${pdfLtr(data.reference)}`], [`${t(receipt ? "creditDocuments.date" : "creditDocuments.issuedAt")}: ${date(data.date, true)}`]], styles: { ...table.styles, cellPadding: 1.2, lineWidth: 0 }, didParseCell: cell => { if (cell.row.index === 0) { cell.cell.styles.fontSize = 19; cell.cell.styles.fontStyle = "bold"; } } });
  y = doc.lastAutoTable.finalY + 5;
  const customer = [[`${t("creditDocuments.customer")}: ${data.customer?.name || "-"}`], ...(data.customer?.phone ? [[`${t("creditDocuments.phone")}: ${pdfLtr(data.customer.phone)}`]] : []), ...(data.customer?.cin ? [[`${t("creditDocuments.cin")}: ${pdfLtr(data.customer.cin)}`]] : [])];
  autoTable(doc, { ...table, startY: y, theme: "plain", body: customer, styles: { ...table.styles, fillColor: [238, 245, 253], lineWidth: 0, cellPadding: 2 } });
  y = doc.lastAutoTable.finalY + 7;
  if (receipt) {
    if (data.actor) {
      autoTable(doc, { ...table, startY: y, theme: 'plain', body: [[t('creditAudit.performedBy') + ': ' + (data.actor.name || t('creditAudit.unrecorded'))]], styles: { ...table.styles, lineWidth: 0 } });
      y = doc.lastAutoTable.finalY + 5;
    }
    if (!data.historical) {
      autoTable(doc, { ...table, startY: y, theme: 'plain', body: [[t('creditDocuments.legacyNote')]], styles: { ...table.styles, textColor: [135, 76, 12], fillColor: [255, 248, 231], lineWidth: 0 } });
      y = doc.lastAutoTable.finalY + 6;
    }
    const rows = data.historical ? [['remainingBefore', data.remainingBefore], ['received', data.amount], ['remainingAfter', data.remaining]] : [['received', data.amount], ['currentTotal', data.total], ['currentPaid', data.paid], ['currentBalance', data.remaining]];
    autoTable(doc, { ...table, startY: y, pageBreak: 'avoid', body: rows.map(([key, amount]) => order([t('creditDocuments.' + key), money(amount)])), didParseCell: cell => { if (cell.row.index === rows.length - 1) { cell.cell.styles.fillColor = [221, 243, 232]; cell.cell.styles.textColor = [14, 100, 68]; cell.cell.styles.fontStyle = 'bold'; } } });
    y = doc.lastAutoTable.finalY + 6;
    const notes = [...(data.historical ? [t('creditDocuments.totalAtPayment') + ': ' + money(data.total), t('creditDocuments.paidAfter') + ': ' + money(data.paid)] : []), ...(data.note ? [t('creditDocuments.note') + ': ' + data.note] : []), ...(visible.footer && config.footer ? [config.footer] : [])];
    if (notes.length) autoTable(doc, { ...table, startY: y, theme: 'plain', body: notes.map(text => [text]), styles: { ...table.styles, fontSize: 10, textColor: [85, 103, 125], lineWidth: 0 } });
  } else {
  const discounts = data.lines.some(line => Number(line.discountAmount) > 0);
  const columns = ["product", "quantity", "unitPrice", ...(discounts ? ["discount"] : []), "lineTotal", "purchaseDate"];
  autoTable(doc, { ...table, startY: y, head: [order(columns.map(key => t(`creditDocuments.${key}`)))], body: data.lines.length ? data.lines.map(line => order([line.nom || "-", pdfLtr(line.Quantite + (line.unit === "meter" ? " " + t("fabricInvoices.meter") : "")),  money(line.prix), ...(discounts ? [money(line.discountAmount || 0)] : []), money(line.lineTotal ?? line.prix * line.Quantite), date(line.Date)])) : [[{ content: t("creditDocuments.empty"), colSpan: columns.length }]], columnStyles: { [rtl ? columns.length - 1 : 0]: { cellWidth: discounts ? 49 : 58 } }, alternateRowStyles: { fillColor: [247, 250, 253] } });
  y = doc.lastAutoTable.finalY + 8;
  autoTable(doc, { ...table, startY: y, pageBreak: "avoid", tableWidth: 105, margin: { ...base.margin, left: width - 119 }, body: ["total", "paid", "remaining"].map(key => order([t(`creditDocuments.${key}`), money(data[key])])), didParseCell: cell => { if (cell.row.index === 2) { cell.cell.styles.fillColor = [221, 243, 232]; cell.cell.styles.textColor = [14, 100, 68]; cell.cell.styles.fontStyle = "bold"; } } });
  y = doc.lastAutoTable.finalY + 6;
  autoTable(doc, { ...table, startY: y, theme: "plain", body: [[t("creditDocuments.statementNote")], ...(visible.footer && config.footer ? [[config.footer]] : [])], styles: { ...table.styles, fontSize: 10, textColor: [85, 103, 125], lineWidth: 0 } });
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont("Amiri", "normal"); doc.setFontSize(9); doc.setTextColor(85, 103, 125);
    doc.text(pdfLtr(`${page} / ${pages}`), width / 2, height - 7, { align: "center" });
    doc.text(pdfLtr(data.reference), x, height - 7, textOptions);
  }
  doc.setProperties({ title: title, subject: data.reference, author: visible.shopName ? config.shopName : "" });
  return doc;
}
