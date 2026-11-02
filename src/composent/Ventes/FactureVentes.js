import { autoTable } from "jspdf-autotable";
import i18n from "../../i18n/index.js";
import { createPdfDocument, pdfTableStyles, pdfLtr } from "../../utils/createPdfDocument.js";
import { saleRevenue, summarizeSales } from "../../../shared/salesRevenue.js";

export const createFactureVentesPDF = async (facture) => {
  if (!facture || !facture.length) return;

  const t = i18n.getFixedT(i18n.language);
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const rtl = i18n.dir() === "rtl";
  const doc = await createPdfDocument({ rtl, orientation: "landscape" });
  const x = rtl ? doc.internal.pageSize.getWidth() - 14 : 14;
  const textOptions = { align: rtl ? "right" : "left" };
  const orderColumns = (row) => rtl ? [...row].reverse() : row;
  const summary = summarizeSales(facture);

  doc.setFontSize(16);
  doc.setFont("Amiri", "bold");
  doc.text(t("salesPdf.salesReportTitle"), x, 15, textOptions);

  doc.setFont("Amiri", "normal");
  doc.setFontSize(12);
  doc.text(`${t("salesPdf.date")}: ${pdfLtr(new Date().toLocaleString(locale))}`, x, 23, textOptions);

  autoTable(doc, {
    startY: 35,
    ...pdfTableStyles(rtl),
    rowPageBreak: "avoid",
    columnStyles: { [rtl ? 7 : 0]: { cellWidth: 40 }, [rtl ? 6 : 1]: { cellWidth: 58 }, [rtl ? 5 : 2]: { cellWidth: 22 }, [rtl ? 4 : 3]: { cellWidth: 27 }, [rtl ? 3 : 4]: { cellWidth: 35 }, [rtl ? 2 : 5]: { cellWidth: 30 }, [rtl ? 1 : 6]: { cellWidth: 30 }, [rtl ? 0 : 7]: { cellWidth: 27 } },
    head: [
      orderColumns([
        t("salesPdf.seller"),
        t("salesPdf.product"),
        t("salesPdf.quantity"),
        t("salesPdf.salePrice"),
        t("salesRevenue.amount"),
        t("salesPdf.profit"),
        t("salesPdf.dateColumn"),
        t("salesPdf.timeColumn"),
      ]),
    ],
    body: facture.map((p) => {
      const [datePart, timePart] = String(p.DateVante || "").split("T");
      const time = timePart ? timePart.split(".")[0] : "-";
      return orderColumns([
        p.nameEmp || "-",
        p.name || "-",
        p.quantite || 0,
        `${Number(p.price || 0).toFixed(2)} DH`,
        `${saleRevenue(p).toFixed(2)} DH`,
        `${Number(p.profite || 0) > 0 ? "+ " : ""}${Number(p.profite || 0).toFixed(2)} DH`,
        datePart || "-",
        time,
      ]);
    }),
  });

  let y = doc.lastAutoTable.finalY + 10;
  if (y + 25 > doc.internal.pageSize.getHeight() - 14) {
    doc.addPage();
    y = 20;
  }
  autoTable(doc, {
    startY: y, ...pdfTableStyles(rtl), theme: "plain", tableWidth: 105,
    margin: { left: rtl ? doc.internal.pageSize.getWidth() - 119 : 14, right: 14, bottom: 14 },
    body: [[t("salesRevenue.total"), `${summary.revenue.toFixed(2)} DH`], [t("salesRevenue.profit"), `${summary.profit.toFixed(2)} DH`]].map(orderColumns),
    styles: { ...pdfTableStyles(rtl).styles, fontStyle: "bold", fontSize: 12, cellPadding: 3 },
  });
  if (summary.legacyCount) {
    const note = doc.splitTextToSize(t("salesRevenue.legacyNote"), doc.internal.pageSize.getWidth() - 28);
    y = doc.lastAutoTable.finalY + 9;
    if (y + note.length * 5 > doc.internal.pageSize.getHeight() - 14) { doc.addPage(); y = 20; }
    doc.setFont("Amiri", "normal"); doc.setFontSize(10); doc.text(note, x, y, textOptions);
  }

  return doc;
};

export const generateFactureVentesPDF = async (facture) => {
  const doc = await createFactureVentesPDF(facture);
  if (doc) doc.save("sales_report.pdf");
};
