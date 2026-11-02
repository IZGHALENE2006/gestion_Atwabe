import i18n from "../../i18n/index.js";
import { createPdfDocument } from "../../utils/createPdfDocument.js";

// Only these customer-facing fields may be written to the catalogue.
const catalogEntries = fabrics => fabrics.map(fabric => ({
  id: fabric._id,
  type: fabric.type,
  hasPhoto: fabric.hasPhoto === true,
  colors: fabric.colors.map(color => color.name),
}));

// Resize the authenticated photo and remove its metadata before sharing it.
export async function prepareFabricCatalogPhoto(blob, { signal } = {}) {
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener("abort", aborted); };
      const aborted = () => { cleanup(); image.src = ""; reject(signal.reason); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error("catalogPhotoFailed")); };
      signal?.addEventListener("abort", aborted, { once: true });
      image.src = url;
    });
    signal?.throwIfAborted();
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL("image/jpeg", 0.88), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createFabricCatalogPDF({ fabrics, language = i18n.language, loadPhoto, signal }) {
  if (!Array.isArray(fabrics) || !fabrics.length) throw new Error("catalogEmpty");
  signal?.throwIfAborted();
  const entries = catalogEntries(fabrics);
  const t = i18n.getFixedT(language);
  const rtl = i18n.dir(language) === "rtl";
  const doc = await createPdfDocument({ rtl });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14, cardWidth = pageWidth - margin * 2, pageBottom = pageHeight - 25;
  const imageWidth = 64, textWidth = cardWidth - 16 - imageWidth - 10;
  const textLeft = rtl ? margin + 8 : margin + 8 + imageWidth + 10;
  const textX = rtl ? textLeft + textWidth : textLeft;
  const align = { align: rtl ? "right" : "left" };
  const lineHeight = 6.5;
  let y;
  doc.setProperties({ title: t("fabrics.catalog.title"), subject: t("fabrics.catalog.subtitle"), creator: "Atwabe" });

  const header = () => {
    doc.setFillColor(15, 49, 87).rect(0, 0, pageWidth, 40, "F");
    doc.setFont("Amiri", "bold").setFontSize(24).setTextColor(255, 255, 255);
    doc.text(t("fabrics.catalog.title"), rtl ? pageWidth - margin : margin, 20, align);
    doc.setFont("Amiri", "normal").setFontSize(12).setTextColor(218, 234, 250);
    doc.text(t("fabrics.catalog.subtitle"), rtl ? pageWidth - margin : margin, 31, align);
    doc.setDrawColor(16, 185, 129).setLineWidth(1).line(margin, 43, pageWidth - margin, 43);
    y = 52;
  };
  const nextPage = () => { doc.addPage(); header(); };
  header();

  for (const [index, entry] of entries.entries()) {
    signal?.throwIfAborted();
    let photo;
    if (entry.hasPhoto) {
      try {
        if (!loadPhoto) throw new Error("Missing photo loader");
        photo = await loadPhoto(entry);
        if (!photo?.data || !(photo.width > 0 && photo.height > 0)) throw new Error("Invalid photo");
      } catch (error) {
        signal?.throwIfAborted();
        throw new Error("catalogPhotoFailed", { cause: error });
      }
    }
    signal?.throwIfAborted();
    doc.setFont("Amiri", "bold").setFontSize(17);
    const titleLines = doc.splitTextToSize(entry.type, textWidth);
    doc.setFont("Amiri", "normal").setFontSize(12.5);
    const lines = entry.colors.flatMap(name => doc.splitTextToSize(name, textWidth - 6).map((text, line) => ({ text, bullet: line === 0 })));
    const overhead = 12 + titleLines.length * 8 + 10 + 8;
    const fullHeight = Math.max(82, overhead + lines.reduce((sum, line) => sum + lineHeight + (line.bullet ? 1 : 0), 0));
    if (fullHeight > pageBottom - y && fullHeight <= pageBottom - 52) nextPage();
    let offset = 0, continued = false;
    do {
      if (pageBottom - y < Math.max(82, overhead + lineHeight + 1)) nextPage();
      const available = pageBottom - y - overhead;
      let count = 0, colorsHeight = 0;
      while (offset + count < lines.length) {
        const rowHeight = lineHeight + (lines[offset + count].bullet ? 1 : 0);
        if (colorsHeight + rowHeight > available) break;
        colorsHeight += rowHeight;
        count += 1;
      }
      const height = Math.max(82, overhead + colorsHeight);
      doc.setFillColor(255, 255, 255).setDrawColor(220, 229, 239).setLineWidth(0.3);
      doc.roundedRect(margin, y, cardWidth, height, 4, 4, "FD");
      const imageX = rtl ? pageWidth - margin - 8 - imageWidth : margin + 8;
      const imageY = y + 8, imageHeight = Math.min(66, height - 16);
      doc.setFillColor(242, 246, 250).roundedRect(imageX, imageY, imageWidth, imageHeight, 3, 3, "F");
      if (photo) {
        const scale = Math.min((imageWidth - 4) / photo.width, (imageHeight - 4) / photo.height);
        const width = photo.width * scale, photoHeight = photo.height * scale;
        doc.addImage(photo.data, imageX + (imageWidth - width) / 2, imageY + (imageHeight - photoHeight) / 2, width, photoHeight, `fabric-${index}`, "FAST");
      } else {
        doc.setFont("Amiri", "normal").setFontSize(11).setTextColor(100, 116, 139);
        doc.text(t("fabrics.catalog.noPhoto"), imageX + imageWidth / 2, imageY + imageHeight / 2 + 2, { align: "center" });
      }
      doc.setFont("Amiri", "bold").setFontSize(17).setTextColor(15, 49, 87);
      titleLines.forEach((line, lineIndex) => doc.text(line, textX, y + 12 + lineIndex * 8, align));
      let textY = y + 12 + titleLines.length * 8 + 2;
      doc.setFontSize(11).setTextColor(4, 120, 87);
      doc.text(t(continued ? "fabrics.catalog.colorsContinued" : "fabrics.colors"), textX, textY, align);
      textY += 8;
      doc.setFont("Amiri", "normal").setFontSize(12.5).setTextColor(51, 65, 85);
      for (const line of lines.slice(offset, offset + count)) {
        if (line.bullet) {
          textY += 1;
          doc.setFillColor(16, 185, 129).circle(rtl ? textX - 1 : textX + 1, textY - 1.5, 0.8, "F");
        }
        doc.text(line.text, rtl ? textX - 6 : textX + 6, textY, align);
        textY += lineHeight;
      }
      offset += count;
      continued = true;
      y += height + 8;
    } while (offset < lines.length);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240).setLineWidth(0.3).line(margin, pageHeight - 18, pageWidth - margin, pageHeight - 18);
    doc.setFont("Amiri", "normal").setFontSize(10).setTextColor(100, 116, 139);
    doc.text(t("fabrics.catalog.title"), rtl ? pageWidth - margin : margin, pageHeight - 11, align);
    doc.text(`${page} / ${pages}`, rtl ? margin : pageWidth - margin, pageHeight - 11, { align: rtl ? "left" : "right" });
  }
  signal?.throwIfAborted();
  return doc;
}

export async function generateFabricCatalogPDF(input) {
  const doc = await createFabricCatalogPDF(input);
  input.signal?.throwIfAborted();
  doc.save("catalogue-atwabe.pdf");
}
