import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { useTranslation } from "react-i18next";

export default function ProductBarcode({ value }) {
  const ref = useRef(null), { t } = useTranslation();
  const code = String(value || "").trim();
  useEffect(() => {
    const svg = ref.current;
    svg.replaceChildren();
    if (!code) return;
    const options = { lineColor: "#000", background: "#fff", width: 1, height: 40, displayValue: false, margin: 10 };
    try { JsBarcode(svg, code, { ...options, format: /^\d{12,13}$/.test(code) ? "EAN13" : "CODE128" }); }
    catch {
      try { JsBarcode(svg, code, { ...options, format: "CODE128" }); }
      catch { svg.replaceChildren(); }
    }
  }, [code]);
  return <div className="product-barcode-label" dir="ltr"><svg ref={ref} role="img" aria-label={`${t("productBatches.barcode")}: ${code}`} /><bdi data-barcode-value>{code || "—"}</bdi></div>;
}
