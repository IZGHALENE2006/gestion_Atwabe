import test from "node:test";
import assert from "node:assert/strict";
import { fabricTotals, filterFabrics, findFabricPieces, generateFabricBarcode } from "../shared/fabrics.js";

const used = new Set();
const codes = Array.from({ length: 5 }, () => { const code = generateFabricBarcode(used); used.add(code); return code; });
const fabrics = [
  { _id: "fabric-cotton", type: "Coton", reference: "T-001", colors: [
    { _id: "blue", name: "Bleu marine", number: "007", pieces: [{ _id: "blue-35", meters: 35, barcode: codes[0] }, { _id: "blue-47", meters: 47, barcode: codes[1] }] },
    { _id: "red", name: "Rouge", number: "008", pieces: [{ _id: "red-12", meters: 12, barcode: codes[2] }] },
  ] },
  { _id: "fabric-linen", type: "Lin", reference: "T-002", colors: [
    { _id: "green", name: "Vert", number: "009", pieces: [{ _id: "green-25", meters: 25, barcode: codes[3] }] },
  ] },
];

test("barcode search returns only the 47m piece with its original fabric, color and piece number", () => {
  const matches = findFabricPieces(fabrics, codes[1]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].fabric.type, "Coton");
  assert.equal(matches[0].fabric.reference, "T-001");
  assert.equal(matches[0].color.name, "Bleu marine");
  assert.equal(matches[0].color.number, "007");
  assert.equal(matches[0].piece.meters, 47);
  assert.equal(matches[0].piece.barcode, codes[1]);
  assert.equal(matches[0].pieceNumber, 2);
  assert.strictEqual(matches[0].fabric, fabrics[0]);
  assert.strictEqual(matches[0].color, fabrics[0].colors[0]);
  assert.strictEqual(matches[0].piece, fabrics[0].colors[0].pieces[1]);
});

test("a barcode from another color or fabric retains the right parent context", () => {
  const red = findFabricPieces(fabrics, codes[2])[0];
  assert.equal(red.fabric.type, "Coton");
  assert.equal(red.color.name, "Rouge");
  assert.equal(red.pieceNumber, 1);
  const linen = findFabricPieces(fabrics, codes[3])[0];
  assert.equal(linen.fabric.type, "Lin");
  assert.equal(linen.color.name, "Vert");
  assert.equal(linen.piece.meters, 25);
});

test("an exact barcode takes priority over matching fabric and color reference text", () => {
  const shadow = { ...fabrics[1], reference: codes[1], colors: [{ ...fabrics[1].colors[0], number: codes[1] }] };
  assert.deepEqual(findFabricPieces([fabrics[0], shadow], codes[1]).map(({ fabric, piece }) => [fabric._id, piece.barcode]), [["fabric-cotton", codes[1]]]);
});

test("a nonexistent full barcode has no results even if a reference matches it", () => {
  const shadow = { ...fabrics[0], reference: codes[4] };
  assert.deepEqual(findFabricPieces([shadow], codes[4]), []);
});

test("barcode search trims whitespace and does not match a different piece by substring", () => {
  assert.equal(findFabricPieces(fabrics, `  ${codes[1]}\n`)[0].piece.barcode, codes[1]);
  assert.deepEqual(findFabricPieces(fabrics, codes[4]), []);
});

test("clearing search and searching names or color numbers keeps the ordinary fabric search", () => {
  for (const query of ["", " ", "coton", "T-001", "marine", "007", codes[0].slice(0, 5)]) assert.equal(findFabricPieces(fabrics, query), null);
  assert.deepEqual(filterFabrics(fabrics, ""), fabrics);
  assert.deepEqual(filterFabrics(fabrics, "marine"), [fabrics[0]]);
  assert.deepEqual(filterFabrics(fabrics, "007"), [fabrics[0]]);
});

test("barcode results keep the full original inventory for editing and never mutate or discard siblings", () => {
  const before = JSON.stringify(fabrics);
  const { fabric, color } = findFabricPieces(fabrics, codes[1])[0];
  assert.equal(fabric.colors.length, 2);
  assert.equal(color.pieces.length, 2);
  assert.deepEqual(fabricTotals(fabric.colors), { quantity: 3, meters: 94 });
  assert.equal(JSON.stringify(fabrics), before);
});

test("empty inventories return no match for a barcode and ordinary mode for empty search", () => {
  assert.deepEqual(findFabricPieces([], codes[0]), []);
  assert.equal(findFabricPieces([], ""), null);
});
