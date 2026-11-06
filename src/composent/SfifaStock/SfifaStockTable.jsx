import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoBarcodeOutline, IoCreateOutline, IoTimeOutline, IoTrashOutline } from "react-icons/io5";
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
          <td><bdi className="sfifa-table-barcode" dir="ltr">{sfifaStockBarcode(stock)}</bdi><EmployeeOperation module="sfifa" operation="labels"><button type="button" className="sfifa-barcode-button" data-barcode-sfifa onClick={() => onAction("barcode", stock)}><IoBarcodeOutline size={18} />{t("sfifaStock.showBarcode")}</button></EmployeeOperation></td>
          <td className="sfifa-table-actions"><div>
            <EmployeeOperation module="sfifa" operation="history"><button type="button" className="sfifa-action is-history" data-history-sfifa onClick={() => onAction("history", stock)}><IoTimeOutline size={18} />{t("sfifaStock.history")}</button></EmployeeOperation>
            {!stock.isUnassigned && permissions.restock && <button type="button" className="sfifa-action is-blue" data-restock-sfifa onClick={() => onAction("restock", stock)}><IoAddOutline size={18} />{t("sfifaStock.restock")}</button>}
            {permissions.update && <button type="button" className="sfifa-action" data-edit-sfifa onClick={() => onAction("edit", stock)}><IoCreateOutline size={18} />{t(stock.isUnassigned ? "sfifaStock.classify" : "sfifaStock.edit")}</button>}
            {permissions.delete && <button type="button" className="sfifa-action is-danger" data-delete-sfifa onClick={() => onAction("delete", stock)}><IoTrashOutline size={18} />{t("sfifaStock.delete")}</button>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
