import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoPrintOutline } from "react-icons/io5";
import { useReactToPrint } from "react-to-print";
import { tailoringOrderItems, tailoringGarmentType } from "../../../shared/tailoring.js";
import TailoringOrderBarcode from "./TailoringOrderBarcode.jsx";
import { tailoringMeasurementText } from "./tailoringMeasurementText.js";

export default function TailoringOrderLabelDialog({ order, onClose }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), printRef = useRef(null);
  const [error, setError] = useState(false);
  const print = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Fesla - ${order.clientName}`,
    ignoreGlobalStyles: true,
    pageStyle: "@page { margin: 10mm; } body { margin: 0; } .fesla-order-barcode { background: #fff; color: #000; text-align: center; } .fesla-order-barcode svg { display: block; max-width: 100%; height: auto; margin: 0 auto; } .fesla-barcode-value { display: block; margin-top: 4px; direction: ltr; color: #000; font: 11px monospace; overflow-wrap: anywhere; }",
    onPrintError: () => setError(true),
  });
  useEffect(() => {
    const dialog = dialogRef.current; dialog.showModal();
    return () => dialog.close();
  }, []);
  const garmentType = tailoringGarmentType(order);
  const items = tailoringOrderItems(order);
  const measurements = items.map((item, index) => ({ index, text: tailoringMeasurementText(item, t) })).filter(item => item.text.trim());
  const readyDate = new Date(`${order.readyDate}T12:00:00`).toLocaleDateString(i18n.language === "ar" ? "ar-MA" : "fr-MA");
  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="tailoring-label-title" onCancel={event => { event.preventDefault(); onClose(); }} className="fesla-label-dialog">
    <header><div><h2 id="tailoring-label-title">{t("fesla.labelTitle")}</h2><p>{t("fesla.labelHint")}</p></div><button type="button" onClick={onClose} aria-label={t("dialog.close")}><IoCloseOutline size={23} /></button></header>
    <div className="fesla-label-preview">
      <div ref={printRef} data-tailoring-print-label dir={i18n.dir()} style={{ width: "100%", maxWidth: "90mm", boxSizing: "border-box", padding: "4mm", margin: "0 auto", fontFamily: "Tahoma, Arial, sans-serif", color: "#000", background: "#fff", textAlign: "center", border: "1px solid #ddd", breakInside: "auto", overflowWrap: "anywhere" }}>
        <div data-label-header style={{ breakInside: "avoid" }}>
        <p style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 6px" }}>{t("fesla.title")}{garmentType !== "djellaba" ? ` · ${t("fesla.garmentTypes." + garmentType)}` : ""}</p>
        <p dir="auto" style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 5px" }}>{order.clientName}</p>
        <p dir="ltr" style={{ fontSize: "12px", margin: "0 0 7px" }}>{order.phone}</p>
        <p style={{ fontSize: "12px", margin: "0 0 8px" }}>{t("fesla.readyDate")}: {readyDate}</p>
        <p style={{ fontSize: "12px", margin: "0 0 8px" }}>{t(garmentType !== "djellaba" ? `fesla.${garmentType}.garmentsCount` : "fesla.garmentsCount", { count: items.length })}</p>
        <TailoringOrderBarcode order={order} />
        </div>
        {measurements.map(({ index, text }) => <section key={items[index].lineId || index} data-label-measurement-piece={index + 1} style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px dashed #888", textAlign: "start", breakInside: "auto" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 700, margin: "0 0 5px", breakAfter: "avoid" }}>{t("fesla.measurements.title")} · {t(garmentType === "djellaba" ? "fesla.garmentNumber" : `fesla.${garmentType}.garmentNumber`, { number: index + 1 })}</h3>
          <p dir="auto" data-label-measurement-text style={{ fontSize: "12px", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", orphans: 2, widows: 2 }}>{text}</p>
        </section>)}
      </div>
    </div>
    {error && <p role="alert" className="fesla-print-error">{t("fesla.errors.printFailed")}</p>}
    <footer><button type="button" onClick={onClose}>{t("dialog.close")}</button><button type="button" data-print-tailoring-label onClick={() => { setError(false); print(); }}><IoPrintOutline size={20} />{t("fesla.printBarcode")}</button></footer>
  </dialog>;
}
