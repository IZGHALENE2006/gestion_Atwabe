import SfifaStockActionsMenu from "./SfifaStockActionsMenu.jsx";
import { useTranslation } from "react-i18next";
import { SFIFA_STOCK_FAMILIES, formatSfifaCode, sfifaStockBarcode } from "../../../shared/sfifaStock.js";

export default function SfifaStockTable({ items, permissions, onAction }) {
  const { t, i18n } = useTranslation();
  const number = value => new Intl.NumberFormat(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 }).format(value);
  return <section className="sfifa-table-panel">
    <p id="sfifa-table-hint" className="sfifa-table-hint">{t("sfifaStock.scrollTable")}</p>
    <div className="sfifa-table-scroll" tabIndex={0} role="region" aria-label={t("sfifaStock.title")} aria-describedby="sfifa-table-hint">
      <table className="sfifa-stock-table">
        <caption className="sr-only">{t("sfifaStock.title")}</caption>
        <thead><tr>{["code", "width", "family", "quantity", "barcode", "actions"].map(key => <th key={key} scope="col" className={key === "actions" ? "sfifa-table-actions" : undefined}>{t(`sfifaStock.${key}`)}</th>)}</tr></thead>
        <tbody>{items.map(stock => <tr key={stock._id} data-sfifa-item={stock._id} data-sfifa-code={stock.code ?? "unassigned"} data-sfifa-item-width={stock.width}>
          <th scope="row" className="sfifa-table-code">{stock.isUnassigned ? t("sfifaStock.unassigned") : <bdi dir="ltr">{formatSfifaCode(stock.code, stock.family)}</bdi>}</th>
          <td><span className={`sfifa-width-badge is-${stock.width}`}>{t(`sfifaStock.widths.${stock.width}`)}</span></td>
          <td><bdi dir="ltr">{SFIFA_STOCK_FAMILIES.find(family => family.value === stock.family)?.label}</bdi></td>
          <td className="sfifa-table-quantity" data-sfifa-quantity data-value={stock.quantity}><bdi>{number(stock.quantity)} {t("sfifaStock.unit")}</bdi></td>
          <td><bdi className="sfifa-table-barcode" dir="ltr">{sfifaStockBarcode(stock)}</bdi></td>
          <td className="sfifa-table-actions"><SfifaStockActionsMenu stock={stock} permissions={permissions} onAction={onAction} /></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
