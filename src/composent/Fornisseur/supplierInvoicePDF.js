import { autoTable } from "jspdf-autotable";
import i18n from "../../i18n/index.js";
import { createPdfDocument, pdfTableStyles, pdfLtr } from "../../utils/createPdfDocument.js";

export async function createSupplierInvoicePDF({ supplier, invoice }) {
  const t = i18n.getFixedT(i18n.language);
  const rtl = i18n.dir() === "rtl";
  const doc = await createPdfDocument({ rtl });
  const x = rtl ? doc.internal.pageSize.getWidth() - 14 : 14;
  const align = { align: rtl ? "right" : "left" };
  const columns = (row) => rtl ? [...row].reverse() : row;
  doc.setFont("Amiri", "bold").setFontSize(17);
  doc.text(t("supplierInvoices.documentTitle"), x, 17, align);
  doc.setFont("Amiri", "normal").setFontSize(12);
  let y = 27;
  for (const line of [
    `${t("supplierInvoices.invoiceId")}: ${pdfLtr(invoice._id)}`,
    `${t("supplierInvoices.date")}: ${pdfLtr(invoice.invoiceDate)}`,
    ...(invoice.reference ? [`${t("supplierInvoices.reference")}: ${invoice.reference}`] : []),
    `${t("supplierInvoices.supplier")}: ${invoice.supplierName || supplier.name}`,
    `${t("supplierInvoices.supplierId")}: ${pdfLtr(supplier._id)}`,
  ]) {
    const lines = doc.splitTextToSize(line, 180);
    doc.text(lines, x, y, align);
    y += lines.length * 6;
  }
  autoTable(doc, {
    ...pdfTableStyles(rtl), startY: y + 3,
    head: [columns([t("supplierInvoices.product"), t("supplierInvoices.quantity"), t("supplierInvoices.unitPrice"), t("supplierInvoices.total")])],
    body: invoice.items.map((item) => columns([item.name, item.quantity, `${item.unitPrice.toFixed(2)} DH`, `${item.total.toFixed(2)} DH`])),
    columnStyles: { [rtl ? 3 : 0]: { cellWidth: 70 }, [rtl ? 2 : 1]: { minCellWidth: 24 } },
  });
  y = doc.lastAutoTable.finalY + 10;
  if (y + 18 > doc.internal.pageSize.getHeight() - 14) { doc.addPage(); y = 20; }
  for (const [key, amount] of [["total", invoice.total], ["amountPaid", invoice.amountPaid], ["remaining", invoice.total - invoice.amountPaid]]) {
    doc.text(`${t(`supplierInvoices.${key}`)}: ${pdfLtr(`${amount.toFixed(2)} DH`)}`, x, y, align);
    y += 7;
  }
  return doc;
}

export async function generateSupplierInvoicePDF(data) {
  const doc = await createSupplierInvoicePDF(data);
  doc.save(`supplier_invoice_${data.invoice._id}.pdf`);
}
