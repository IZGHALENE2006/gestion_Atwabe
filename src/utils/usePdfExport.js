import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function usePdfExport(generatePDF) {
  const { t } = useTranslation();
  const busy = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const exportPdf = async (data) => {
    if (busy.current) return;
    busy.current = true;
    setIsExporting(true);
    setExportError("");
    try {
      await generatePDF(data);
    } catch {
      setExportError(t("salesPdf.exportError"));
    } finally {
      busy.current = false;
      setIsExporting(false);
    }
  };

  return { exportPdf, isExporting, exportError };
}
