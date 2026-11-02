import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { invoicePresentation, invoiceLogoUrl } from "./invoicePresentation.js";

const cell = { padding: "4px 7px", verticalAlign: "top", borderBottom: "1px solid #ededed" };
const heading = { ...cell, background: "#e9e9e9", fontWeight: 700, textAlign: "center" };
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 12, lineHeight: 1.5 };
const FacturePrint = forwardRef(({ facture, user, settings, logoSrc }, ref) => {
  const { t, i18n } = useTranslation();
  if (!facture) return null;
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const { config, visible, rows, metadata, columns, productRows, payment, vatBreakdown, title, note } = invoicePresentation(facture, settings, t, user?.name, locale);
  const logo = visible.logo ? logoSrc || invoiceLogoUrl(config.logo) : "";
  const businessFields = ["address", "phone", "email"].filter((key) => visible[key] && config[key]);

  return (
    <div ref={ref} className="invoice-document invoice-paper" dir={i18n.dir()} lang={i18n.language} style={{ padding: 28, width: "100%", maxWidth: 794, margin: "0 auto", boxSizing: "border-box", fontFamily: '"Amiri", Tahoma, Arial, sans-serif', fontSize: 16, lineHeight: 1.7, color: "#000", backgroundColor: "#fff", overflowWrap: "anywhere" }}>
      <style>{`@media print { @page { size: A4; margin: 12mm; } .invoice-paper { padding: 0 !important; max-width: none !important; } .invoice-paper tr, .invoice-business-header { break-inside: avoid; } .invoice-paper thead { display: table-header-group; } .invoice-bottom, .invoice-payment, .invoice-metadata { break-inside: avoid; } .invoice-paper th, .invoice-paper tr { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>
      <header className="invoice-business-header" dir="ltr" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 150px", gap: 24, alignItems: "start", marginBottom: 24, paddingBottom: 20, borderBottom: "2px solid #166b59" }}>
        <div data-invoice-business style={{ textAlign: "left", whiteSpace: "pre-line" }}>
          {visible.shopName && config.shopName && <h2 dir="auto" style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>{config.shopName}</h2>}
          {businessFields.map((key) => <p key={key} dir="auto" style={{ margin: 0 }}>{key !== "address" && <>{t(`invoiceSettings.fields.${key}`)}: </>}<bdi dir={key === "phone" || key === "email" ? "ltr" : "auto"}>{config[key]}</bdi></p>)}
        </div>
        <div data-invoice-logo style={{ display: "flex", justifyContent: "flex-end" }}>
          {logo && <img src={logo} alt={t("invoiceSettings.logo")} style={{ width: 140, height: 100, objectFit: "contain", objectPosition: "right top" }} />}
        </div>
      </header>

      <h1 style={{ display: "inline-block", background: "#ededed", padding: "5px 20px", fontSize: 23, fontWeight: 700, margin: "0 0 16px", color: "#222" }}>{title}</h1>
      {metadata.length > 0 && <table className="invoice-metadata" style={{ ...tableStyle, marginBottom: 18, tableLayout: "fixed" }}>
        <thead><tr>{metadata.map((field) => <th key={field.key} scope="col" style={heading}>{field.label}</th>)}</tr></thead>
        <tbody><tr>{metadata.map((field) => <td key={field.key} style={{ ...cell, textAlign: "center" }}><bdi dir={["client", "seller"].includes(field.key) ? "auto" : "ltr"}>{field.value}</bdi></td>)}</tr></tbody>
      </table>}

      <table className="invoice-products" style={{ ...tableStyle, tableLayout: "fixed", marginBottom: 18 }}>
        <colgroup>{columns.map((column) => <col key={column.key} style={column.width ? { width: column.width / 182 * 100 + "%" } : undefined} />)}</colgroup>
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col" style={{ ...heading, textAlign: column.numeric ? "end" : "start" }}>{column.label}</th>)}</tr></thead>
        <tbody>{productRows.map((line, index) => <tr key={index}>
          {columns.map((column) => <td key={column.key} data-invoice-cell={column.key} style={{ ...cell, textAlign: column.numeric ? "end" : "start", whiteSpace: "pre-line", borderBottom: "none" }}><bdi dir={column.key === "description" ? undefined : "ltr"}>{line[column.key]}</bdi></td>)}
        </tr>)}</tbody>
      </table>

      {payment.length > 0 && <section className="invoice-payment" style={{ marginBottom: 18, breakInside: "avoid" }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, fontStyle: "italic", textDecoration: "underline", margin: "0 0 8px" }}>{t("invoiceLayout.paymentSummary")}</h2>
        <table style={{ ...tableStyle, tableLayout: "fixed" }}>
          <thead><tr>{payment.map((field) => <th key={field.key} scope="col" style={heading}>{field.label}</th>)}</tr></thead>
          <tbody><tr>{payment.map((field) => <td key={field.key} style={{ ...cell, textAlign: "center" }}><bdi dir="ltr">{field.value}</bdi></td>)}</tr></tbody>
        </table>
      </section>}

      {note && <p className="document-note" dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 18 }}>{note}</p>}
      <div className="invoice-bottom" dir="ltr" style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)", gap: 28, alignItems: "start", breakInside: "avoid" }}>
        <div dir={i18n.dir()}>
          {vatBreakdown.length > 0 && <table className="invoice-tax-summary" aria-label={t("invoiceLayout.taxSummary")} style={tableStyle}>
            <thead><tr>{["rate", "taxBase", "taxAmount"].map((key) => <th key={key} scope="col" style={heading}>{t(`invoiceLayout.${key}`)}</th>)}</tr></thead>
            <tbody>{vatBreakdown.map((group) => <tr key={group.vatRate} data-invoice-vat-rate={group.vatRate}>
              <td style={cell}><bdi dir="ltr">{group.vatRate}%</bdi></td>
              <td style={{ ...cell, textAlign: "end" }}><bdi dir="ltr">{group.baseHT.toFixed(2)} DH</bdi></td>
              <td style={{ ...cell, textAlign: "end" }}><bdi dir="ltr">{group.vatAmount.toFixed(2)} DH</bdi></td>
            </tr>)}</tbody>
          </table>}
        </div>
        <table className="invoice-summary" aria-label={t("invoiceSettings.summary")} dir={i18n.dir()} style={tableStyle}>
          <tbody>{rows.map((row) => <tr key={row.key} data-invoice-row={row.key} style={row.key === "total" ? { background: "#e8e8e8", fontWeight: 700, borderTop: "1px solid #b8b8b8", borderBottom: "1px solid #b8b8b8" } : undefined}>
            <th scope="row" style={{ ...cell, textAlign: "start", fontWeight: row.key === "total" ? 700 : 400, background: row.key === "total" ? "transparent" : "#f3f3f3" }}>{row.label}: </th>
            <td style={{ ...cell, textAlign: "end", width: "38%", whiteSpace: "nowrap" }}><bdi dir="ltr">{row.value}</bdi></td>
          </tr>)}</tbody>
        </table>
      </div>
      {visible.footer && <p style={{ textAlign: "center", whiteSpace: "pre-line", borderTop: "1px solid #d8dee5", marginTop: 20, paddingTop: 10 }}><bdi>{config.footer || t("receiptPrint.thanks")}</bdi></p>}
    </div>
  );
});

export default FacturePrint;
