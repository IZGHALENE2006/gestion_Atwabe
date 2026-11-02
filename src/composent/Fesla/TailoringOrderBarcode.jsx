import Barcode from "react-barcode";
import { useTranslation } from "react-i18next";
import { tailoringOrderBarcode } from "../../../shared/tailoringBarcode.js";

export default function TailoringOrderBarcode({ order }) {
  const { t } = useTranslation();
  const value = tailoringOrderBarcode(order);
  if (!value) return null;
  return <div className="fesla-order-barcode" data-fesla-barcode={value} dir="ltr" role="img" aria-label={`${t("fesla.barcode")}: ${value}`}>
    <Barcode value={value} format="CODE128" width={1.2} height={48} displayValue={false} margin={12} background="#ffffff" lineColor="#000000" />
    <bdi className="fesla-barcode-value">{value}</bdi>
  </div>;
}
