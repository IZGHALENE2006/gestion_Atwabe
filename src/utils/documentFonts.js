export const documentFontFamily = "Amiri";

// Local assets keep receipts and PDFs independent of installed fonts or a CDN.
export const documentFonts = [
  {
    family: documentFontFamily,
    source: new URL("../assets/fonts/amiri/Amiri-Regular.ttf", import.meta.url).href,
    weight: "400",
    style: "normal",
  },
  {
    family: documentFontFamily,
    source: new URL("../assets/fonts/amiri/Amiri-Bold.ttf", import.meta.url).href,
    weight: "700",
    style: "normal",
  },
];

// FontFace (used by react-to-print) expects a CSS source, not a bare URL.
export const documentPrintFonts = documentFonts.map((font) => ({
  ...font,
  source: `url("${font.source}")`,
}));
