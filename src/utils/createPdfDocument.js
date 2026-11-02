import { jsPDF } from "jspdf";
import { documentFontFamily, documentFonts } from "./documentFonts.js";

let fontDataPromise;

function loadFonts() {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all(documentFonts.map(async ({ source }) => {
      const response = await fetch(source);
      if (!response.ok) throw new Error("Could not load invoice font");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return btoa(binary);
    })).catch((error) => {
      fontDataPromise = undefined; // A failed download must be retryable.
      throw error;
    });
  }
  return fontDataPromise;
}

export async function createPdfDocument({ rtl = false, orientation = "portrait" } = {}) {
  const fonts = await loadFonts();
  const doc = new jsPDF({ orientation, putOnlyUsedFonts: true, compress: true });
  fonts.forEach((data, index) => {
    const fileName = index === 0 ? "Amiri-Regular.ttf" : "Amiri-Bold.ttf";
    doc.addFileToVFS(fileName, data);
    doc.addFont(fileName, documentFontFamily, index === 0 ? "normal" : "bold");
  });
  doc.setFont(documentFontFamily, "normal");
  doc.setLanguage(rtl ? "ar-MA" : "fr-MA");
  doc.viewerPreferences({ Direction: rtl ? "R2L" : "L2R" });

  // jsPDF has already shaped and wrapped these lines (including AutoTable).
  // Reorder each line once, then remove invisible direction marks before font
  // encoding: some PDF readers otherwise draw those marks as missing glyphs.
  doc.internal.events.subscribe("preProcessText", (payload) => {
    const reorder = (text) => {
      if (Array.isArray(text)) return text.map(reorder);
      if (typeof text !== "string") return text;
      const firstLetter = text.normalize("NFKC").match(/\p{L}/u)?.[0] || "";
      const bidi = new jsPDF.__bidiEngine__({
        isInputVisual: false,
        isInputRtl: /\p{Script=Arabic}/u.test(firstLetter),
        isOutputVisual: true,
        isOutputRtl: false,
        isSymmetricSwapping: true,
      });
      return bidi.doBidiReorder(text).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
    };
    payload.text = reorder(payload.text);
    Object.assign(payload.options, {
      R2L: false,
      isInputVisual: true,
      isInputRtl: false,
      isOutputVisual: true,
      isOutputRtl: false,
      isSymmetricSwapping: false,
    });
  });
  return doc;
}

// Keep an amount and its currency (or a date/identifier) together in RTL text.
export const pdfLtr = (value) => `\u200e${value}\u200e`;

export function pdfTableStyles(rtl) {
  return {
    styles: {
      font: documentFontFamily,
      fontStyle: "normal",
      fontSize: 12,
      cellPadding: 3,
      overflow: "linebreak",
      halign: rtl ? "right" : "left",
    },
    headStyles: { font: documentFontFamily, fontStyle: "bold" },
    margin: { top: 14, right: 14, bottom: 14, left: 14 },
  };
}
