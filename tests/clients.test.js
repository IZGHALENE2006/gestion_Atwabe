import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import app from "../BackEnd/app.js";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import Client from "../BackEnd/models/Client.js";
import { validateClient, filterClients, normalizeClientWebsite } from "../shared/clients.js";

const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
const clientId = "444444444444444444444444", foreignId = "555555555555555555555555";
const input = { type: "person", name: "  محمد العلوي  ", address: "  12 rue Hassan II\nCasablanca  ", phone: " 06 12 34 56 78 ", fax: "", cin: "", website: "" };
const secret = process.env.JWT_SECRET;
let server, base;
before(async () => {
  process.env.JWT_SECRET = "client-directory-test-secret";
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/clients`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secret;
});
const claims = { id: owner, role: "admin" };
const employeeClaims = { id: employee, idAdmin: otherOwner, role: "Employe" };
const request = (method = "GET", body, auth = claims, suffix = "") => fetch(base + suffix, {
  method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${jwt.sign(auth, process.env.JWT_SECRET)}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const query = (fn) => ({ select() { return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } });
function setup(t) {
  const actors = new Map([[owner, { _id: owner }], [otherOwner, { _id: otherOwner }]]);
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: true } };
  const records = new Map();
  const readActor = t.mock.method(AdminModel, "findById", (id) => query(() => actors.get(String(id))));
  t.mock.method(EmployeModel, "findById", (id) => query(() => String(id) === employee ? staff : null));
  const clone = (doc) => doc ? new Client(doc.toObject()) : null;
  t.mock.method(Client, "find", (scope) => query(() => [...records.values()].filter((doc) => String(doc.idAdmin) === String(scope.idAdmin)).map((doc) => doc.toObject())));
  const create = t.mock.method(Client, "create", async (data) => {
    const document = new Client(data);
    await document.validate();
    records.set(String(document._id), document);
    return clone(document);
  });
  const update = t.mock.method(Client, "findOneAndUpdate", async (scope, patch, options) => {
    assert.equal(options.runValidators, true);
    assert.equal(options.new, true);
    const document = records.get(String(scope._id));
    if (!document || String(document.idAdmin) !== String(scope.idAdmin)) return null;
    document.set(patch.$set);
    await document.validate();
    return clone(document);
  });
  const seed = (id = clientId, idAdmin = owner) => {
    const doc = new Client({ ...validateClient(input), _id: id, idAdmin, createdBy: idAdmin });
    records.set(id, doc);
    return doc;
  };
  return { records, actors, staff, create, update, seed, readActor };
}

test("person can be created without CIN, fax or website and reloaded with all fields", async (t) => {
  const f = setup(t);
  const response = await request("POST", input);
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.name, "محمد العلوي");
  assert.equal(saved.address, "12 rue Hassan II\nCasablanca");
  assert.equal(saved.phone, "06 12 34 56 78");
  assert.equal(saved.cin, "");
  assert.equal(saved.fax, "");
  assert.equal(saved.website, "");
  const list = await (await request()).json();
  assert.equal(list.clients.length, 1);
  assert.equal(list.clients[0]._id, saved._id);
  assert.deepEqual(list.permissions, { add: true, update: true });
  assert.equal(f.create.mock.callCount(), 1);
});

test("company creation and update preserve phone zeros, normalize website/CIN and can clear optional fields", async (t) => {
  setup(t);
  const created = await request("POST", { ...input, type: "company", name: "Société Atlas", fax: "05 22 12 34 56", cin: " ab12345 ", website: "atlas.example/contact" });
  assert.equal(created.status, 201);
  const saved = await created.json();
  assert.equal(saved.cin, "AB12345");
  assert.equal(saved.website, "https://atlas.example/contact");
  assert.equal(saved.fax, "05 22 12 34 56");
  const edited = await request("PUT", { ...input, name: "Nouveau nom", address: "Rabat", type: "person", fax: "", cin: "", website: "" }, claims, `/${saved._id}`);
  assert.equal(edited.status, 200);
  const update = await edited.json();
  assert.equal(update._id, saved._id);
  assert.equal(update.name, "Nouveau nom");
  assert.equal(update.type, "person");
  for (const field of ["fax", "cin", "website"]) assert.equal(update[field], "");
  const list = await (await request()).json();
  assert.equal(list.clients.length, 1);
  assert.equal(list.clients[0].address, "Rabat");
});

test("client ownership and creation metadata cannot be supplied or transferred through the payload", async (t) => {
  const f = setup(t);
  const created = await (await request("POST", { ...input, _id: foreignId, idAdmin: otherOwner, createdBy: otherOwner, createdAt: "2000-01-01", permissions: { add: false } })).json();
  assert.notEqual(created._id, foreignId);
  assert.equal(created.idAdmin, owner);
  assert.equal(created.createdBy, owner);
  assert.equal(created.permissions, undefined);
  const updated = await request("PUT", { ...input, idAdmin: otherOwner, createdBy: otherOwner }, claims, `/${created._id}`);
  assert.equal(updated.status, 200);
  assert.equal(f.records.get(created._id).idAdmin.toString(), owner);
  assert.equal(f.records.get(created._id).createdBy.toString(), owner);
  assert.equal(f.update.mock.calls[0].arguments[1].$set.idAdmin, undefined);
});

test("each shop can only list and update its own clients", async (t) => {
  const f = setup(t);
  f.seed(); f.seed(foreignId, otherOwner);
  const ownList = await (await request()).json();
  assert.deepEqual(ownList.clients.map((client) => client._id), [clientId]);
  assert.equal((await request("PUT", input, claims, `/${foreignId}`)).status, 404);
  assert.equal((await request("PUT", input, { id: otherOwner, role: "admin" }, `/${clientId}`)).status, 404);
  const foreignList = await (await request("GET", undefined, { id: otherOwner, role: "admin" })).json();
  assert.deepEqual(foreignList.clients.map((client) => client._id), [foreignId]);
});

test("employee uses the shop and permissions in the current database record", async (t) => {
  const f = setup(t);
  f.seed(); f.seed(foreignId, otherOwner);
  const list = await (await request("GET", undefined, employeeClaims)).json();
  assert.deepEqual(list.clients.map((client) => client._id), [clientId]);
  assert.deepEqual(list.permissions, { add: true, update: true });
  const saved = await (await request("POST", input, employeeClaims)).json();
  assert.equal(saved.idAdmin, owner);
  assert.equal(saved.createdBy, employee);
  assert.equal((await request("PUT", { ...input, name: "Employé" }, employeeClaims, `/${clientId}`)).status, 200);
  f.staff.action = { add: false, update: false };
  const readOnly = await (await request("GET", undefined, employeeClaims)).json();
  assert.deepEqual(readOnly.permissions, { add: false, update: false });
  assert.equal((await request("POST", input, { ...employeeClaims, action: { add: true } })).status, 403);
  assert.equal((await request("PUT", input, employeeClaims, `/${clientId}`)).status, 403);
  assert.equal(f.create.mock.callCount(), 1);
  assert.equal(f.update.mock.callCount(), 1);
});

test("inactive, removed and unknown-role accounts cannot access clients", async (t) => {
  const f = setup(t);
  f.staff.isActive = false;
  for (const [method, body, suffix] of [["GET", undefined, ""], ["POST", input, ""], ["PUT", input, `/${clientId}`]]) assert.equal((await request(method, body, employeeClaims, suffix)).status, 403);
  f.actors.delete(owner);
  assert.equal((await request()).status, 403);
  assert.equal((await request("POST", input, { id: owner, role: "visitor" })).status, 403);
  assert.equal(f.create.mock.callCount(), 0);
});

test("authentication is required before database access", async (t) => {
  const f = setup(t);
  assert.equal((await request("GET", undefined, null)).status, 401);
  assert.equal((await request("POST", input, null)).status, 401);
  assert.equal((await request("PUT", input, null, `/${clientId}`)).status, 401);
  assert.equal(f.readActor.mock.callCount(), 0);
  assert.equal(f.create.mock.callCount(), 0);
});

for (const [field, value] of [
  ["name", " "], ["address", ""], ["phone", ""], ["type", "unknown"],
  ["name", { $ne: "" }], ["phone", 612345678], ["cin", null], ["address", "a".repeat(501)],
  ["name", "Invalid\u0000name"],
  ["phone", "abc123"], ["phone", "123"], ["fax", "not-a-number"],
  ["website", "javascript:alert(1)"], ["website", "data:text/html,test"], ["website", "https://user:password@example.com"],
  ["website", "not a website"], ["website", "ftp://example.com"], ["website", "example"],
]) test(`invalid ${field} is rejected on creation and update without saving`, async (t) => {
  const f = setup(t); f.seed();
  for (const [method, suffix] of [["POST", ""], ["PUT", `/${clientId}`]]) {
    const response = await request(method, { ...input, [field]: value }, claims, suffix);
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields[field]);
  }
  assert.equal(f.create.mock.callCount(), 0);
  assert.equal(f.update.mock.callCount(), 0);
});

test("invalid and missing client IDs return not-found without creating a record", async (t) => {
  const f = setup(t);
  assert.equal((await request("PUT", input, claims, "/invalid-id")).status, 404);
  assert.equal((await request("PUT", input, claims, `/${clientId}`)).status, 404);
  assert.equal(f.records.size, 0);
});

test("database errors return stable localized error codes", async (t) => {
  const f = setup(t);
  f.create.mock.mockImplementation(async () => { throw new Error("Internal database details"); });
  const response = await request("POST", input);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: "saveFailed" });
});

test("search finds accented and Arabic names, formatted phones, CIN and types", () => {
  const clients = [
    { ...validateClient(input), cin: "AB123", name: "Émilie", type: "person" },
    { ...validateClient(input), name: "مؤسسة الأطلس", type: "company", phone: "+212 522 12 34 56", website: "https://atlas.example/" },
  ];
  assert.deepEqual(filterClients(clients, "emilie"), [clients[0]]);
  assert.deepEqual(filterClients(clients, "061234"), [clients[0]]);
  assert.deepEqual(filterClients(clients, "ab123"), [clients[0]]);
  assert.deepEqual(filterClients(clients, "الأطلس"), [clients[1]]);
  assert.deepEqual(filterClients(clients, "+212522"), [clients[1]]);
  assert.deepEqual(filterClients(clients, "", "company"), [clients[1]]);
  assert.deepEqual(filterClients(clients, "atlas.example", "person"), []);
});

test("website normalization allows only clickable HTTP/HTTPS links", () => {
  assert.equal(normalizeClientWebsite("www.example.ma"), "https://www.example.ma/");
  assert.equal(normalizeClientWebsite("http://example.ma/path"), "http://example.ma/path");
  assert.equal(normalizeClientWebsite(""), "");
  assert.throws(() => normalizeClientWebsite("javascript:alert(1)"));
});
