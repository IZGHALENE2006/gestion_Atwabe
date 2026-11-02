import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoPrintOutline } from "react-icons/io5";
import { useReactToPrint } from "react-to-print";
import Barcode from "react-barcode";

export default function FabricLabelsDialog({ fabric, pieceBarcode, onClose }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  const printRef = useRef(null);
  const [error, setError] = useState(false);
  const labels = fabric.colors.flatMap((color) => color.pieces.filter((piece) => !pieceBarcode || piece.barcode === pieceBarcode).map((piece) => ({ ...piece, color: color.name, number: color.number })));
  const print = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Atwabe - ${fabric.type}`,
    ignoreGlobalStyles: true,
    pageStyle: "@page { margin: 10mm; } body { margin: 0; }",
    onPrintError: () => setError(true),
  });
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const formatMeters = (value) => Number(value).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 });

  return <dialog ref={dialogRef} dir={i18n.dir()} aria-labelledby="fabric-labels-title" onCancel={(event) => { event.preventDefault(); onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <header className="mb-4 flex items-start justify-between gap-3"><div><h2 id="fabric-labels-title" className="text-xl font-bold">{t("fabrics.labelsTitle")}</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("fabrics.labelsHint")}</p></div><button type="button" onClick={onClose} aria-label={t("dialog.close")} className="rounded-lg p-2 hover:bg-slate-200 dark:hover:bg-slate-800"><IoCloseOutline size={24} /></button></header>
    <div className="overflow-x-auto rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
      <div ref={printRef} dir={i18n.dir()} style={{ display: "flex", flexWrap: "wrap", gap: "5mm", fontFamily: "Tahoma, Arial, sans-serif", color: "#000", background: "#fff", padding: "3mm" }}>
        {labels.map((label) => <div key={label.barcode} style={{ width: "65mm", boxSizing: "border-box", padding: "3mm", textAlign: "center", border: "1px solid #ddd", breakInside: "avoid", pageBreakInside: "avoid", overflowWrap: "anywhere" }}>
          <p dir="auto" style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 4px" }}>{fabric.type}{fabric.reference ? ` · ${fabric.reference}` : ""}</p>
          <p dir="auto" style={{ fontSize: "12px", margin: "0 0 4px" }}>{label.color}{label.number ? ` · ${label.number}` : ""}</p>
          <p dir="ltr" style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 4px" }}>{t("fabrics.meterValue", { value: formatMeters(label.meters) })}</p>
          <div dir="ltr"><Barcode value={label.barcode} format="EAN13" width={1.4} height={42} fontSize={12} margin={6} background="#ffffff" lineColor="#000000" /></div>
        </div>)}
      </div>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-rose-600">{t("fabrics.errors.printFailed")}</p>}
    <footer className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold dark:border-slate-700">{t("common.cancel")}</button><button type="button" onClick={() => { setError(false); print(); }} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700"><IoPrintOutline size={20} />{t("fabrics.print")}</button></footer>
  </dialog>;
}
