import { useTranslation } from "react-i18next";
import { IoBarcodeOutline, IoCreateOutline, IoPrintOutline, IoTrashOutline } from "react-icons/io5";
import Barcode from "react-barcode";
import FabricPhoto from "./FabricPhoto.jsx";

export default function FabricPieceResult({ match, token, canEdit, canDelete, onEdit, onPrint, onDelete }) {
  const { t, i18n } = useTranslation();
  const { fabric, color, piece, pieceNumber } = match;
  const meters = Number(piece.meters).toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA", { maximumFractionDigits: 3 });

  return <article data-fabric-piece={piece.barcode} className="min-w-0 rounded-2xl border border-primary-200 bg-white p-5 dark:border-primary-800 dark:bg-slate-900">
    <header className="mb-5 flex items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400"><IoBarcodeOutline size={24} /></span>
      <h2 className="text-lg font-bold">{t("fabrics.piece", { number: pieceNumber })}</h2>
    </header>
    {fabric.hasPhoto && <div className="mb-5 flex items-center gap-3"><FabricPhoto fabric={fabric} token={token} className="h-28 w-28" /><p className="text-sm text-slate-500 dark:text-slate-400">{t("fabrics.photo")}<span className="mt-1 block text-xs">{t("fabrics.enlargePhoto")}</span></p></div>}
    <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("fabrics.type")}</dt><dd dir="auto" className="break-words font-semibold">{fabric.type}</dd></div>
      {fabric.reference && <div><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("fabrics.reference")}</dt><dd className="break-words"><bdi>{fabric.reference}</bdi></dd></div>}
      <div data-fabric-price><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("fabrics.salePricePerMeter")}</dt><dd className="font-bold text-blue-700 dark:text-blue-300">{Number.isFinite(fabric.salePricePerMeter) && fabric.salePricePerMeter > 0 ? <bdi>{t("fabrics.salePriceValue", { value: fabric.salePricePerMeter.toLocaleString(i18n.language === "ar" ? "ar-MA" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</bdi> : t("fabrics.priceUnknown")}</dd></div>
      <div><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("fabrics.color")}</dt><dd dir="auto" className="break-words font-semibold">{color.name}</dd></div>
      {color.number && <div><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("fabrics.colorNumber")}</dt><dd className="break-words"><bdi>{color.number}</bdi></dd></div>}
      <div><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("fabrics.meters")}</dt><dd className="text-lg font-bold text-primary-700 dark:text-primary-400"><bdi dir="ltr">{t("fabrics.meterValue", { value: meters })}</bdi></dd></div>
      <div><dt className="mb-1 text-xs text-slate-500 dark:text-slate-400">{t("fabrics.barcode")}</dt><dd dir="ltr" className="break-all font-mono">{piece.barcode}</dd></div>
    </dl>
    <div className="my-5 overflow-x-auto rounded-xl border border-slate-100 bg-white p-3 text-center dark:border-slate-700" dir="ltr"><Barcode value={piece.barcode} format="EAN13" width={1.4} height={42} fontSize={13} margin={6} background="#ffffff" lineColor="#000000" /></div>
    <footer className="flex flex-wrap gap-2">
      {canDelete && <button type="button" onClick={() => onDelete(fabric, color, piece)} aria-label={t("fabrics.deletePieceNamed", { number: pieceNumber })} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/30"><IoTrashOutline size={19} />{t("fabrics.deleteAction")}</button>}
      {canEdit && <button type="button" onClick={() => onEdit(fabric)} aria-label={t("fabrics.editNamed", { type: fabric.type })} className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300"><IoCreateOutline size={19} />{t("fabrics.editAction")}</button>}
      <button type="button" onClick={() => onPrint(fabric, piece.barcode)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><IoPrintOutline size={19} />{t("fabrics.printPiece", { number: pieceNumber })}</button>
    </footer>
  </article>;
}
