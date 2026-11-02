import { documentReference, documentTypeOf } from "../../../shared/salesDocuments.js";
import { autoTable } from "jspdf-autotable";
import i18n from "../../i18n/index.js";
import { createPdfDocument, pdfTableStyles, pdfLtr } from "../../utils/createPdfDocument.js";
import { invoicePresentation, invoiceLogoUrl } from "./invoicePresentation.js";

export const createFacturePDF = async (facture, settings) => {
  if (!facture || !facture.Product?.length) return;
  const t = i18n.getFixedT(i18n.language);
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const rtl = i18n.dir() === "rtl";
  const doc = await createPdfDocument({ rtl });
  const width = doc.internal.pageSize.getWidth();
  const x = rtl ? width - 14 : 14;
  const textOptions = { align: rtl ? "right" : "left" };
  const orderColumns = (row) => rtl ? [...row].reverse() : row;
  const { config, visible, rows, metadata, columns, productRows, payment, vatBreakdown, title, note } = invoicePresentation(facture, settings, t, "", locale);

  let headerBottom = 14;
  let businessY = 18;
  const business = [
    ...(visible.shopName && config.shopName ? [{ text: config.shopName, bold: true }] : []),
    ...["address", "phone", "email"].filter((key) => visible[key] && config[key]).map((key) => ({
      text: key === "address" ? config[key] : `${t(`invoiceSettings.fields.${key}`)}: ${pdfLtr(config[key])}`,
    })),
  ];
  for (const item of business) {
    doc.setFont("Amiri", item.bold ? "bold" : "normal");
    doc.setFontSize(item.bold ? 16 : 11);
    const lines = doc.splitTextToSize(item.text, 118);
    // Physical left/right placement stays the same in Arabic and French.
    doc.text(lines, 14, businessY, { align: "left" });
    businessY += lines.length * doc.getLineHeight() / doc.internal.scaleFactor + 2;
  }
  headerBottom = Math.max(headerBottom, businessY);
  const logoUrl = visible.logo ? invoiceLogoUrl(config.logo) : "";
  if (logoUrl) {
    const response = await fetch(logoUrl);
    if (!response.ok) throw new Error("Could not load invoice logo");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const info = doc.getImageProperties(bytes);
    const scale = Math.min(46 / info.width, 30 / info.height);
    doc.addImage(bytes, info.fileType, width - 14 - info.width * scale, 14, info.width * scale, info.height * scale);
    headerBottom = Math.max(headerBottom, 46);
  }
  doc.setDrawColor(22, 107, 89);
  doc.setLineWidth(0.5);
  doc.line(14, headerBottom + 3, width - 14, headerBottom + 3);
  doc.setFont("Amiri", "bold");
  doc.setFontSize(19);
  const titleWidth = doc.getTextWidth(title) + 12;
  doc.setFillColor(237, 237, 237);
  doc.rect(rtl ? width - 14 - titleWidth : 14, headerBottom + 8, titleWidth, 11, "F");
  doc.setTextColor(35, 35, 35);
  doc.text(title, rtl ? width - 20 : 20, headerBottom + 15, textOptions);

  const base = pdfTableStyles(rtl);
  const tableStyles = {
    ...base, theme: "plain", rowPageBreak: "avoid",
    styles: { ...base.styles, fontSize: 10, cellPadding: 1.8, textColor: [30, 30, 30], lineWidth: 0 },
    headStyles: { ...base.headStyles, fillColor: [233, 233, 233], textColor: [35, 35, 35], halign: "center" },
  };
  let nextY = headerBottom + 26;
  if (metadata.length) {
    autoTable(doc, {
      ...tableStyles, startY: nextY, pageBreak: "avoid",
      head: [orderColumns(metadata.map((field) => field.label))],
      body: [orderColumns(metadata.map((field) => ["seller", "client"].includes(field.key) ? field.value : pdfLtr(field.value)))],
    });
    nextY = doc.lastAutoTable.finalY + 6;
  }

  const visualColumns = orderColumns(columns);
  autoTable(doc, {
    ...tableStyles, startY: nextY,
    head: [visualColumns.map((column) => column.label)],
    body: productRows.map((line) => visualColumns.map((column) => column.key === "description" ? line[column.key] : pdfLtr(line[column.key]))),
    columnStyles: Object.fromEntries(visualColumns.map((column, index) => [index, {
      ...(column.width ? { cellWidth: column.width } : {}),
      halign: column.numeric ? (rtl ? "left" : "right") : (rtl ? "right" : "left"),
    }])),
  });
  nextY = doc.lastAutoTable.finalY + 9;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (payment.length) {
    if (nextY + 30 > pageHeight - 14) { doc.addPage(); nextY = 18; }
    doc.setFont("Amiri", "bold");
    doc.setFontSize(10);
    doc.text(t("invoiceLayout.paymentSummary"), x, nextY, textOptions);
    autoTable(doc, {
      ...tableStyles, startY: nextY + 3, pageBreak: "avoid",
      head: [orderColumns(payment.map((field) => field.label))],
      body: [orderColumns(payment.map((field) => pdfLtr(field.value)))],
    });
    nextY = doc.lastAutoTable.finalY + 10;
  }

  if (note) {
    autoTable(doc, { ...tableStyles, startY: nextY, body: [[note]], styles: { ...tableStyles.styles, overflow: "linebreak" } });
    nextY = doc.lastAutoTable.finalY + 8;
  }

  // The reference has a tax table on the physical left and totals on the right.
  // Keep both together when they fit; large rate tables can continue onto more pages.
  doc.setFont("Amiri", "normal");
  doc.setFontSize(11);
  const footer = visible.footer ? doc.splitTextToSize(config.footer || t("receiptPrint.thanks"), 180) : [];
  const footerLineHeight = doc.getLineHeight() / doc.internal.scaleFactor;
  const footerSpace = footer.length ? 12 + footer.length * footerLineHeight : 0;
  const blockHeight = Math.max(rows.length * 8, (vatBreakdown.length + 1) * 8) + footerSpace;
  if (nextY + Math.min(blockHeight, pageHeight - 32) > pageHeight - 14) { doc.addPage(); nextY = 18; }
  const startPage = doc.getNumberOfPages();
  let taxLastPage = startPage;
  let taxEndY = nextY;
  if (vatBreakdown.length) {
    autoTable(doc, {
      ...tableStyles, startY: nextY, tableWidth: 78,
      margin: { top: 14, bottom: 14, left: 14, right: width - 92 },
      head: [orderColumns([t("invoiceLayout.rate"), t("invoiceLayout.taxBase"), t("invoiceLayout.taxAmount")])],
      body: vatBreakdown.map((group) => orderColumns([`${group.vatRate}%`, `${group.baseHT.toFixed(2)} DH`, `${group.vatAmount.toFixed(2)} DH`]).map(pdfLtr)),
      columnStyles: { [rtl ? 2 : 0]: { cellWidth: 18 }, [rtl ? 0 : 2]: { cellWidth: 30 } },
    });
    taxLastPage = doc.getNumberOfPages();
    taxEndY = doc.lastAutoTable.finalY;
  }
  doc.setPage(startPage);
  autoTable(doc, {
    ...tableStyles, startY: nextY, tableWidth: 92, pageBreak: "avoid",
    margin: { top: 14, bottom: 14, left: width - 106, right: 14 },
    body: rows.map((row) => orderColumns([`${row.label}:`, pdfLtr(row.value)])),
    columnStyles: {
      [rtl ? 0 : 1]: { cellWidth: 32, halign: rtl ? "left" : "right" },
      [rtl ? 1 : 0]: { fillColor: [243, 243, 243] },
    },
    didParseCell: (data) => {
      if (rows[data.row.index]?.key === "total") {
        data.cell.styles.fillColor = [232, 232, 232];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  const summaryLastPage = doc.internal.getCurrentPageInfo().pageNumber;
  const summaryEndY = doc.lastAutoTable.finalY;
  const lastPage = Math.max(taxLastPage, summaryLastPage);
  doc.setPage(lastPage);
  let footerY = Math.max(taxLastPage === lastPage ? taxEndY : 0, summaryLastPage === lastPage ? summaryEndY : 0) + 12;
  if (visible.footer) {
    doc.setFont("Amiri", "normal");
    doc.setFontSize(11);
    for (const line of footer) {
      if (footerY + footerLineHeight > pageHeight - 14) { doc.addPage(); footerY = 20; }
      doc.text(line, x, footerY, textOptions);
      footerY += footerLineHeight;
    }
  }
  return doc;
};

export const generateFacturePDF = async (facture, settings) => {
  const doc = await createFacturePDF(facture, settings);
  if (doc) {
    const prefix = { invoice: "facture", quote: "devis", delivery: "bon_livraison", return: "bon_retour", credit: "avoir" }[documentTypeOf(facture)];
    doc.save(`${prefix}_${documentReference(facture)}.pdf`);
  }
};
