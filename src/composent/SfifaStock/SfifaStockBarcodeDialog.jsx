import { useEffect, useRef, useState } from "react";
import Barcode from "react-barcode";
import { useReactToPrint } from "react-to-print";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoPrintOutline } from "react-icons/io5";
import { formatSfifaCode, sfifaStockBarcode } from "../../../shared/sfifaStock.js";

export default function SfifaStockBarcodeDialog({ stock, onClose }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), printRef = useRef(null), [error, setError] = useState(false);
  const value = sfifaStockBarcode(stock);
  const print = useReactToPrint({
    contentRef: printRef, documentTitle: `Sfifa-${value}`, ignoreGlobalStyles: true,
    pageStyle: "@page { margin: 10mm; } body { margin: 0; } [data-sfifa-barcode] { background: #fff; color: #000; text-align: center; } [data-sfifa-barcode] svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }",
    onPrintError: () => setError(true),
  });
  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); return () => dialog.close(); }, []);
  const close = () => { dialogRef.current.close(); onClose(); };
  return <dialog ref={dialogRef} dir={i18n.dir()} className="sfifa-dialog" aria-labelledby="sfifa-barcode-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="sfifa-barcode-title">{t("sfifaStock.barcodeTitle")}</h2><p>{t("sfifaStock.barcodeHint")}</p></div><button type="button" onClick={close} aria-label={t("dialog.close")}><IoCloseOutline size={24} /></button></header>
    <div className="sfifa-label-preview"><div ref={printRef} data-sfifa-print-label dir={i18n.dir()} style={{ boxSizing: "border-box", width: "100%", maxWidth: "95mm", padding: "4mm", margin: "0 auto", textAlign: "center", fontFamily: "Tahoma, Arial, sans-serif", background: "#fff", color: "#000", breakInside: "avoid" }}>
      <p style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 8px" }}>{t(`sfifaStock.widths.${stock.width}`)}</p>
      <p style={{ fontSize: "14px", margin: "0 0 8px" }}>{t("sfifaStock.code")}: {stock.isUnassigned ? t("sfifaStock.unassigned") : <bdi dir="ltr">{formatSfifaCode(stock.code, stock.family)}</bdi>}</p>
      <p style={{ fontSize: "12px", margin: "0 0 8px" }}>{t("sfifaStock.family")}: <bdi dir="ltr">{stock.family}</bdi></p>
      <div data-sfifa-barcode={value} dir="ltr" role="img" aria-label={`${t("sfifaStock.barcode")}: ${value}`}><Barcode value={value} format="CODE128" width={1.2} height={55} displayValue={false} margin={10} background="#ffffff" lineColor="#000000" /><bdi style={{ display: "block", font: "11px monospace", overflowWrap: "anywhere" }}>{value}</bdi></div>
    </div></div>
    {error && <p role="alert" className="sfifa-dialog-error">{t("sfifaStock.errors.printFailed")}</p>}
    <footer><button type="button" onClick={close}>{t("dialog.close")}</button><button type="button" className="is-blue" data-print-sfifa onClick={() => { setError(false); print(); }}><IoPrintOutline size={20} />{t("sfifaStock.printBarcode")}</button></footer>
  </dialog>;
}
