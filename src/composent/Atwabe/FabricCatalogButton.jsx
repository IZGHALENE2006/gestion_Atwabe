import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoDownloadOutline, IoReloadOutline } from "react-icons/io5";
import { loadFabrics, loadFabricPhoto } from "./fabricsApi.js";

export default function FabricCatalogButton({ token, disabled }) {
  const { t, i18n } = useTranslation();
  const active = useRef(null);
  const [exporting, setExporting] = useState(false), [error, setError] = useState("");
  useEffect(() => () => active.current?.abort(), []);
  const download = async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setExporting(true); setError("");
    const language = i18n.language;
    try {
      const { fabrics } = await loadFabrics(token, controller.signal);
      const { generateFabricCatalogPDF, prepareFabricCatalogPhoto } = await import("./fabricCatalogPDF.js");
      await generateFabricCatalogPDF({
        fabrics, language, signal: controller.signal,
        loadPhoto: async entry => prepareFabricCatalogPhoto(await loadFabricPhoto(entry.id, token, controller.signal), { signal: controller.signal }),
      });
    } catch (failure) {
      if (!controller.signal.aborted) setError(["catalogPhotoFailed", "catalogEmpty"].includes(failure.message) ? failure.message : "exportFailed");
    } finally {
      if (!controller.signal.aborted) { active.current = null; setExporting(false); }
    }
  };
  return <div className="flex max-w-full flex-col items-start gap-2">
    <button type="button" data-export-fabric-catalog disabled={disabled || exporting} aria-busy={exporting} aria-describedby={error ? "fabric-catalog-error" : undefined} onClick={download} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40">
      {exporting ? <IoReloadOutline size={21} className="animate-spin" aria-hidden="true" /> : <IoDownloadOutline size={21} aria-hidden="true" />}{t(exporting ? "fabrics.catalog.preparing" : "fabrics.catalog.download")}
    </button>
    {error && <p id="fabric-catalog-error" role="alert" className="max-w-sm text-sm text-rose-600 dark:text-rose-400">{t(`fabrics.catalog.${error}`)}</p>}
  </div>;
}
