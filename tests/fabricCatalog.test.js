import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

globalThis.localStorage = { getItem: () => "ar" };
globalThis.fetch = async url => new Response(await readFile(new URL(url)));
const { createFabricCatalogPDF } = await import("../src/composent/Atwabe/fabricCatalogPDF.js");

const photo = { data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4XmMQy478D8IMMAYAPUQHZZffFX4AAAAASUVORK5CYII=", width: 2, height: 2 };
const fabrics = [
  { _id: "PRIVATE-FABRIC-ID", type: "قطن Coton 120", hasPhoto: true, reference: "PRIVATE-REFERENCE", salePricePerMeter: 987654.32, createdBy: "PRIVATE-ACTOR", colors: [
    { name: "أزرق فاتح", number: "PRIVATE-COLOR-CODE", pieces: [{ meters: 123456.789, barcode: "2987654321098" }] },
    { name: "أحمر", pieces: [{ meters: 0, barcode: "2345678901234" }] },
  ] },
  { _id: "PRIVATE-SECOND-ID", type: "كتان Lin", hasPhoto: false, colors: [{ name: "Vert émeraude", pieces: [{ meters: 35, barcode: "2123456789012" }] }] },
];

async function inspect(doc) {
  const task = getDocument({ data: new Uint8Array(doc.output("arraybuffer")) });
  const pdf = await task.promise;
  const pages = [];
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const ops = await page.getOperatorList();
      for (const item of content.items.filter(item => item.str.trim())) {
        assert.ok(item.transform[4] >= 30, `Left clipping: ${item.str}`);
        assert.ok(item.transform[4] + item.width <= page.view[2] - 30, `Right clipping: ${item.str}`);
        assert.ok(item.transform[5] >= 25, `Bottom clipping: ${item.str}`);
      }
      const runs = ops.argsArray.filter((_, index) => ops.fnArray[index] === OPS.showText).flatMap(([glyphs]) => glyphs.filter(glyph => typeof glyph === "object"));
      for (const glyph of runs) if (glyph.unicode.trim()) {
        assert.equal(glyph.isInFont, true, `Missing glyph: ${glyph.unicode}`);
        assert.doesNotMatch(glyph.unicode, /[\uFFFD\u200e\u200f]/);
      }
      pages.push({ text: content.items.map(item => item.str.normalize("NFKC")).join(" "), images: ops.fnArray.filter(op => op === OPS.paintImageXObject).length });
    }
    pages.metadata = (await pdf.getMetadata()).info;
    return pages;
  } finally { await task.destroy(); }
}

test("Arabic catalogue shares every fabric, color and registered photo without stock or commercial data", async () => {
  const loaded = [];
  const doc = await createFabricCatalogPDF({ fabrics, language: "ar", loadPhoto: async entry => { loaded.push(entry.id); return photo; } });
  assert.deepEqual(loaded, ["PRIVATE-FABRIC-ID"]);
  const pages = await inspect(doc), text = pages.map(page => page.text).join(" ");
  for (const value of ["كتالوج الأثواب", "قطن", "Coton 120", "كتان", "Lin", "أزرق فاتح", "أحمر", "Vert émeraude", "لا توجد صورة"]) assert.ok(text.includes(value), value);
  for (const value of ["PRIVATE-", "987654", "123456", "2987654321098", "2345678901234", "2123456789012", "درهم", "الأمتار", "الباركود", "كمية", "سعر"]) assert.ok(!text.includes(value), `Private detail in catalogue: ${value}`);
  assert.equal(pages[0].images, 1);
  const metadata = pages.metadata;
  assert.equal(metadata.Title, "كتالوج الأثواب");
  assert.ok(!JSON.stringify(metadata).includes("PRIVATE-"));
});

test("French catalogue preserves Arabic fabric names, accented colors and photographs", async () => {
  const pages = await inspect(await createFabricCatalogPDF({ fabrics, language: "fr", loadPhoto: async () => photo }));
  const text = pages.map(page => page.text).join(" ");
  for (const value of ["Catalogue des tissus", "قطن", "Coton 120", "أزرق فاتح", "Vert émeraude", "Photo non disponible"]) assert.ok(text.includes(value), value);
  assert.equal(pages[0].images, 1);
});

test("long types and 100 long colors continue across numbered pages without clipping or omissions", async () => {
  const colors = Array.from({ length: 100 }, (_, index) => ({ name: `COLOR-${String(index).padStart(3, "0")} ${"أزرق سماوي فاتح فاخر ".repeat(4)}` }));
  const long = { ...fabrics[0], type: "ثوب مغربي فاخر من القطن الطبيعي عالي الجودة بألوان متنوعة للاستعمال اليومي والمناسبات الخاصة", colors };
  for (const language of ["ar", "fr"]) {
    let requests = 0;
    const pages = await inspect(await createFabricCatalogPDF({ fabrics: [long, fabrics[1]], language, loadPhoto: async () => { requests += 1; return photo; } }));
    assert.equal(requests, 1, "Load each photo only once even when its colors continue");
    assert.ok(pages.length > 3);
    const text = pages.map(page => page.text).join(" ");
    for (let index = 0; index < colors.length; index += 1) assert.ok(text.includes(`COLOR-${String(index).padStart(3, "0")}`));
    for (let index = 0; index < pages.length; index += 1) assert.ok(pages[index].text.includes(`${index + 1} / ${pages.length}`));
    assert.ok(text.includes("كتان") && text.includes("Lin"));
    assert.ok(pages.slice(0, -1).every(page => page.images === 1));
  }
});

test("a failed registered photo prevents an incomplete catalogue and can be retried", async () => {
  await assert.rejects(createFabricCatalogPDF({ fabrics, loadPhoto: async () => { throw new Error("HTTP 403"); } }), /catalogPhotoFailed/);
  await assert.rejects(createFabricCatalogPDF({ fabrics }), /catalogPhotoFailed/);
  await assert.rejects(createFabricCatalogPDF({ fabrics, loadPhoto: async () => null }), /catalogPhotoFailed/);
  assert.ok(await createFabricCatalogPDF({ fabrics, loadPhoto: async () => photo }));
});

test("empty catalogues and cancelled exports never return a downloadable PDF", async () => {
  await assert.rejects(createFabricCatalogPDF({ fabrics: [] }), /catalogEmpty/);
  const before = new AbortController(); before.abort();
  await assert.rejects(createFabricCatalogPDF({ fabrics, signal: before.signal }), { name: "AbortError" });
  const during = new AbortController();
  await assert.rejects(createFabricCatalogPDF({ fabrics, signal: during.signal, loadPhoto: async () => { during.abort(); return photo; } }), { name: "AbortError" });
});
