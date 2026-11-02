import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import process from "node:process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import app from "../BackEnd/app.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import { normalizeInvoiceSettings } from "../shared/invoiceSettings.js";
import { deleteInvoiceLogo, invoiceLogosDirectory } from "../BackEnd/utils/invoiceLogos.js";

const require = createRequire(new URL("../BackEnd/package.json", import.meta.url));
const jwt = require("jsonwebtoken");
const owner = "111111111111111111111111";
const otherOwner = "222222222222222222222222";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4XmMQy478D8IMMAYAPUQHZZffFX4AAAAASUVORK5CYII=", "base64");
const logos = new Set();
const previousSecret = process.env.JWT_SECRET;
let server, base, token, employeeToken;
before(async () => {
  process.env.JWT_SECRET = "invoice-settings-test-key";
  token = jwt.sign({ id: owner, idAdmin: owner, role: "admin" }, process.env.JWT_SECRET);
  employeeToken = jwt.sign({ id: otherOwner, idAdmin: owner, role: "Employe" }, process.env.JWT_SECRET);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  for (const logo of logos) await deleteInvoiceLogo(logo);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
const request = (method, body, auth = token) => fetch(`${base}/invoice-settings`, { method, body, headers: auth ? { Authorization: `Bearer ${auth}` } : {} });
function form(settings, file, extra = {}) {
  const data = new FormData();
  data.append("settings", JSON.stringify(settings));
  if (file) data.append("logo", new Blob([file.bytes || png], { type: file.type || "image/png" }), "logo.png");
  for (const [key, value] of Object.entries(extra)) data.append(key, value);
  return data;
}
function setup(t) {
  let stored = new AdminModel({ _id: owner, name: "Owner" });
  const read = t.mock.method(AdminModel, "findById", (id) => {
    assert.equal(String(id), owner, "Only read the authenticated shop's settings");
    return { select: async () => stored };
  });
  const update = t.mock.method(AdminModel, "findOneAndUpdate", async (query, patch, options) => {
    assert.deepEqual(query, { _id: owner });
    assert.equal(options.new, false);
    assert.equal(options.runValidators, true);
    const previous = new AdminModel(stored.toObject());
    for (const [key, value] of Object.entries(patch.$set)) stored.set(key, value);
    await stored.validate();
    stored = new AdminModel(stored.toObject());
    if (stored.invoiceSettings.logo) logos.add(stored.invoiceSettings.logo);
    return previous;
  });
  return { read, update };
}

test("shop settings persist Arabic details and hidden rows and are shared with its employees", async (t) => {
  const { update } = setup(t);
  const settings = normalizeInvoiceSettings({ shopName: "  محل الأطلس  ", address: "شارع محمد الخامس\nالدار البيضاء", phone: "+212 612345678", visibility: { vat: false, paid: false } });
  const response = await request("PUT", form({ ...settings, idAdmin: otherOwner, logo: "https://untrusted.example/logo.svg" }));
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.shopName, "محل الأطلس");
  assert.equal(saved.logo, "");
  assert.equal(saved.visibility.vat, false);
  assert.equal(saved.visibility.paid, false);
  assert.equal(saved.visibility.totalHT, true);
  assert.equal(update.mock.callCount(), 1);
  assert.deepEqual(await (await request("GET")).json(), saved);
  assert.deepEqual(await (await request("GET", undefined, employeeToken)).json(), saved);
});

test("PNG logo uploads, serves, remains on text edits, replaces and removes cleanly", async (t) => {
  setup(t);
  const settings = normalizeInvoiceSettings({ shopName: "Shop" });
  const firstResponse = await request("PUT", form(settings, {}));
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.match(first.logo, /^\/uploads\/invoice-logos\/[a-f0-9-]{36}\.png$/);
  const image = await fetch(`${base}${first.logo}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  const retained = await (await request("PUT", form({ ...settings, phone: "0612345678" }))).json();
  assert.equal(retained.logo, first.logo);
  const second = await (await request("PUT", form(settings, {}))).json();
  assert.notEqual(second.logo, first.logo);
  await assert.rejects(readFile(path.join(invoiceLogosDirectory, path.basename(first.logo))), { code: "ENOENT" });
  const removed = await (await request("PUT", form(settings, null, { removeLogo: "true" }))).json();
  assert.equal(removed.logo, "");
  await assert.rejects(readFile(path.join(invoiceLogosDirectory, path.basename(second.logo))), { code: "ENOENT" });
});

test("unauthenticated and employee updates are rejected before accepting a logo", async (t) => {
  const { update } = setup(t);
  assert.equal((await request("GET", undefined, null)).status, 401);
  assert.equal((await request("PUT", form(normalizeInvoiceSettings(), {}), null)).status, 401);
  assert.equal((await request("PUT", form(normalizeInvoiceSettings(), {}), employeeToken)).status, 403);
  assert.equal(update.mock.callCount(), 0);
});

test("invalid settings, SVG, forged images and oversized logos never save", async (t) => {
  const { update } = setup(t);
  const settings = normalizeInvoiceSettings();
  for (const body of [
    form({ ...settings, shopName: "x".repeat(161) }),
    form({ ...settings, visibility: { vat: "false" } }),
    form({ ...settings, visibility: [] }),
    form({ ...settings, phone: {} }),
    form(settings, { bytes: "<svg></svg>", type: "image/svg+xml" }),
    form(settings, { bytes: "<html>not a png</html>" }),
  ]) assert.equal((await request("PUT", body)).status, 400);
  assert.equal((await request("PUT", form(settings, { bytes: Buffer.alloc(2 * 1024 * 1024 + 1) }))).status, 413);
  assert.equal(update.mock.callCount(), 0);
});

test("a failed database write cleans its uploaded logo", async (t) => {
  const { update } = setup(t);
  update.mock.mockImplementation(async () => { throw new Error("Database offline"); });
  const beforeFiles = (await readdir(invoiceLogosDirectory).catch(() => [])).sort();
  const result = await request("PUT", form(normalizeInvoiceSettings(), {}));
  assert.equal(result.status, 500);
  assert.deepEqual((await readdir(invoiceLogosDirectory)).sort(), beforeFiles);
});
