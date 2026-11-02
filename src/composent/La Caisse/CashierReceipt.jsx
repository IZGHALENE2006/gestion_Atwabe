import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { getInvoiceTotals } from "../../../shared/saleTotals.js";
import { getPaymentMethodLabel } from "../../../shared/paymentMethods.js";

// The cashier keeps its compact receipt; client invoices use the A4 document.
const CashierReceipt = forwardRef(({ facture, user }, ref) => {
  const { t, i18n } = useTranslation();
  if (!facture) return null;
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const totals = getInvoiceTotals(facture);
  const hasLineDiscounts = totals.lineDiscountAmount > 0;
  const paymentMethod = getPaymentMethodLabel(facture.paymentMethod);
  return (
    <div ref={ref} className="invoice-document" dir={i18n.dir()} lang={i18n.language} style={{ padding: 20, width: hasLineDiscounts ? 480 : 320, maxWidth: "100%", fontFamily: '"Amiri", Tahoma, Arial, sans-serif', fontSize: 16, lineHeight: 1.7, color: "#000", backgroundColor: "#fff", overflowWrap: "anywhere" }}>
      <h2 style={{ textAlign: "center", marginBottom: 10 }}>{t("receiptPrint.title")}</h2>
      <p>{t("receiptPrint.employee")}: <bdi>{facture.nameEmp || user?.name || "-"}</bdi> - <bdi>{facture.DateFacture ? new Date(facture.DateFacture).toLocaleString(locale) : "-"}</bdi></p>
      {facture.clientName && <p>{t("invoicePage.client")}: <bdi>{facture.clientName}</bdi></p>}
      {paymentMethod && <p>{t("invoiceCreate.paymentMethod")}: <bdi dir="ltr" lang="fr">{paymentMethod}</bdi></p>}
      <hr />
      <table className="w-full border-collapse text-sm text-center">
        <thead><tr className="border-b border-gray-300">
          <th className="py-2 px-1 font-semibold">{t("receiptPrint.product")}</th>
          <th className="py-2 px-1 font-semibold">{t("receiptPrint.quantity")}</th>
          <th className="py-2 px-1 font-semibold">{t(totals.hasVat ? "invoiceCreate.unitPriceHT" : "receiptPrint.price")}</th>
          {hasLineDiscounts && <th className="py-2 px-1 font-semibold">{t("discount.label")}</th>}
          <th className="py-2 px-1 font-semibold">{t(totals.hasVat ? "invoiceCreate.totalHT" : "receiptPrint.total")}</th>
        </tr></thead>
        <tbody>{facture.Product?.map((line, index) => <tr key={index} className="border-b border-dashed border-gray-200 last:border-none">
          <td className="py-1 px-1"><bdi>{line.name}</bdi>{line.batchNumber && <small style={{ display: 'block' }}>{t('productBatches.batch', { number: line.batchNumber })}</small>}</td>
          <td className="py-1 px-1"><bdi dir="ltr">{line.quantite}</bdi></td>
          <td className="py-1 px-1"><bdi dir="ltr">{Number(line.price || 0).toFixed(2)} DH</bdi></td>
          {hasLineDiscounts && <td className="py-1 px-1 text-xs">{Number(line.discountAmount || 0) > 0 ? <>
            <div><bdi dir="ltr">{line.discountValue}{line.discountType === "percent" ? "%" : " DH"}</bdi></div>
            <div><bdi dir="ltr">-{Number(line.discountAmount).toFixed(2)} DH</bdi></div>
          </> : "—"}</td>}
          <td className="py-1 px-1 font-medium"><bdi dir="ltr">{Number(line.TotalPrix || 0).toFixed(2)} DH</bdi></td>
        </tr>)}</tbody>
      </table>
      <hr />
      <p>{t("receiptPrint.totalQty")}: <bdi dir="ltr">{facture.TotalQauntite || 0}</bdi></p>
      {totals.discountAmount > 0 && <>
        <p>{t("discount.subtotal")}: <bdi dir="ltr">{totals.subtotal.toFixed(2)} DH</bdi></p>
        {hasLineDiscounts && <p>{t("invoiceCreate.productDiscounts")}: <bdi dir="ltr">-{totals.lineDiscountAmount.toFixed(2)} DH</bdi></p>}
        {totals.orderDiscountAmount > 0 && <p>{t("discount.label")} (<bdi dir="ltr">{totals.discountValue}{totals.discountType === "percent" ? "%" : " DH"}</bdi>): <bdi dir="ltr">-{totals.orderDiscountAmount.toFixed(2)} DH</bdi></p>}
      </>}
      {totals.hasVat && <>
        <p>{t("invoiceCreate.totalHT")}: <bdi dir="ltr">{totals.totalHT.toFixed(2)} DH</bdi></p>
        <p>{t("invoiceCreate.vat")} (<bdi dir="ltr">{totals.vatRate}%</bdi>): <bdi dir="ltr">{totals.vatAmount.toFixed(2)} DH</bdi></p>
      </>}
      <p><strong>{t(totals.hasVat ? "invoiceCreate.totalTTC" : "receiptPrint.total")}: <bdi dir="ltr">{totals.total.toFixed(2)} DH</bdi></strong></p>
      <p>{t("receiptPrint.paid")}: <bdi dir="ltr">{totals.paid.toFixed(2)} DH</bdi></p>
      <p>{t("receiptPrint.change")}: <bdi dir="ltr">{totals.change.toFixed(2)} DH</bdi></p>
      <p style={{ textAlign: "center", marginTop: 10 }}>{t("receiptPrint.thanks")}</p>
    </div>
  );
});
export default CashierReceipt;
