import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import app from "../BackEnd/app.js";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import Client from "../BackEnd/models/Client.js";
import { calculateFabricSale, publicFabricSaleReceipt, validateFabricSaleInput } from "../shared/fabricSales.js";
import { employeeCanRequest } from "../shared/employeeRequestPermissions.js";
import Fabric from "../BackEnd/models/Fabric.js";
import FabricMovement from "../BackEnd/models/FabricMovement.js";
import { generateFabricBarcode, validateFabric } from "../shared/fabrics.js";

const owner = "111111111111111111111111", foreignOwner = "222222222222222222222222", employee = "333333333333333333333333";
const claims = { id: owner, role: "admin" };
const staffClaims = { id: employee, role: "Employe", idAdmin: foreignOwner, action: { update: true } };
const first = generateFabricBarcode(), second = generateFabricBarcode(new Set([first])), third = generateFabricBarcode(new Set([first, second]));
const input = { purchasePricePerMeter: 15, wholesalePricePerMeter: 25, salePricePerMeter: 30, type: "Coton", reference: "T-001", colors: [
  { name: "Bleu marine", number: "007", pieces: [{ meters: 30, barcode: first }, { meters: 47, barcode: second }] },
  { name: "Rouge", number: "008", pieces: [{ meters: 12, barcode: third }] },
] };
let server, base;
const previousSecret = process.env.JWT_SECRET;
before(async () => {
  process.env.JWT_SECRET = "fabric-reductions-test";
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/fabrics`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
const request = (suffix, body, actor = claims, method = body === undefined ? "GET" : "POST") => fetch(base + suffix, {
  method, headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const query = (fn) => ({
  cap: Infinity, select() { return this; }, sort() { return this; }, limit(value) { this.cap = value; return this; }, lean() { return this; },
  then(resolve, reject) { return Promise.resolve().then(fn).then((rows) => Array.isArray(rows) ? rows.slice(0, this.cap) : rows).then(resolve, reject); },
});

function setup(t) {
  const records = [], archive = [];
  const clients = [{ _id: "444444444444444444444444", idAdmin: owner, name: "Registered client" }, { _id: "555555555555555555555555", idAdmin: foreignOwner, name: "Foreign client" }];
  t.mock.method(Client, "find", scope => query(() => clients.filter(row => String(row.idAdmin) === String(scope.idAdmin))));
  t.mock.method(Client, "findOne", scope => query(() => clients.find(row => row._id === String(scope._id) && row.idAdmin === String(scope.idAdmin)) || null));
  const staff = { _id: employee, idAdmin: owner, isActive: true, name: "Sales employee", action: { update: true } };
  const actor = t.mock.method(AdminModel, "findById", (id) => query(() => [owner, foreignOwner].includes(String(id)) ? { _id: String(id), name: "Shop owner" } : null));
  t.mock.method(EmployeModel, "findById", (id) => query(() => String(id) === employee ? staff : null));
  const findOne = t.mock.method(Fabric, "findOne", async (scope) => {
    const document = records.find((row) => String(row._id) === String(scope._id).toLowerCase() && String(row.idAdmin) === String(scope.idAdmin));
    return document ? new Fabric(document.toObject()) : null;
  });
  t.mock.method(Fabric, "find", (scope) => query(() => records.filter((row) => String(row.idAdmin) === String(scope.idAdmin)).map((row) => row.toObject())));
  t.mock.method(Fabric, "exists", async (scope) => records.some((row) => String(row.idAdmin) === String(scope.idAdmin) && String(row._id) !== String(scope._id?.$ne) && row.colors.some((color) => color.pieces.some((piece) => scope["colors.pieces.barcode"].$in.includes(piece.barcode)))) ? { _id: records[0]._id } : null);
  const save = t.mock.method(Fabric.prototype, "save", async function () {
    await this.validate();
    const index = records.findIndex((row) => String(row._id) === String(this._id));
    if (index < 0 || records[index].__v !== this.__v) throw Object.assign(new Error("Concurrent write"), { name: "VersionError" });
    this.__v += 1;
    records[index] = new Fabric(this.toObject());
    return this;
  });
  const trim = t.mock.method(Fabric, "updateOne", async (scope, update) => {
    const document = records.find((row) => String(row._id) === String(scope._id) && String(row.idAdmin) === String(scope.idAdmin) && row.__v === scope.__v);
    if (!document) return { modifiedCount: 0 };
    const ids = new Set(update.$pull.movements._id.$in.map(String));
    document.movements = document.movements.filter((row) => !ids.has(String(row._id)));
    return { modifiedCount: 1 };
  });
  const remove = t.mock.method(Fabric, "deleteOne", async (scope) => {
    const index = records.findIndex((row) => String(row._id) === String(scope._id) && String(row.idAdmin) === String(scope.idAdmin) && row.__v === scope.__v);
    if (index < 0) return { deletedCount: 0 };
    records.splice(index, 1);
    return { deletedCount: 1 };
  });
  const bulk = t.mock.method(FabricMovement, "bulkWrite", async (operations) => {
    for (const operation of operations) {
      const value = operation.updateOne.update.$setOnInsert;
      assert.equal(String(operation.updateOne.filter.idAdmin), String(value.idAdmin));
      const document = new FabricMovement(value);
      await document.validate();
      if (!archive.some((row) => String(row._id) === String(value._id))) archive.push(document);
    }
    return { acknowledged: true };
  });
  const archiveFind = t.mock.method(FabricMovement, "find", (scope) => query(() => archive.filter((row) => String(row.idAdmin) === String(scope.idAdmin) && (!scope.barcode || row.barcode === scope.barcode))
    .map((row) => row.toObject()).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || String(b._id).localeCompare(String(a._id)))));
  t.mock.method(FabricMovement, "findOne", async (scope) => archive.find((row) => String(row.idAdmin) === String(scope.idAdmin) && String(row.fabricId) === String(scope.fabricId).toLowerCase() && row.requestId === scope.requestId) || null);
  const seed = (data = input, idAdmin = owner) => {
    const document = new Fabric({ ...validateFabric(data), idAdmin, createdBy: idAdmin, __v: 0 });
    records.push(document);
    return document;
  };
  return { records, archive, clients, staff, actor, findOne, save, trim, remove, bulk, archiveFind, seed };
}
const suffix = (fabric, color = fabric.colors[0], piece = color.pieces[0]) => `/${fabric._id}/colors/${color._id}/pieces/${piece._id}/sales`;
const payload = (fabric, meters = 2, piece = fabric.colors[0].pieces[0]) => ({ version: fabric.__v, meters, pricingMode: "retail", discountType: "percent", discountValue: 0, barcode: piece.barcode, requestId: randomUUID() });
const history = async (barcode = "", offset = 0, actor = claims) => {
  const response = await request(`/movements?barcode=${encodeURIComponent(barcode)}&offset=${offset}`, undefined, actor);
  assert.equal(response.status, 200);
  return response.json();
};

test('retail sale uses server prices, discounts and dated receipt, changing only the selected roll', async t => {
  const f=setup(t), original=f.seed();
  const start=Date.now();
  const res=await request(suffix(original), {...payload(original, '2,5'),discountValue:10,clientName:'  Ahmed  ',unitPrice:1,total:1,createdBy:foreignOwner,occurredAt:'2000-01-01'});
  assert.equal(res.status,201); const data=await res.json(), sale=data.movement.sale;
  assert.deepEqual([sale.unitPrice,sale.subtotal,sale.discountAmount,sale.total],[30,75,7.5,67.5]);
  assert.equal(sale.clientName,'Ahmed');assert.equal(sale.createdByName,'Shop owner');assert.equal(data.movement.createdBy,owner);
  assert.ok(new Date(data.movement.occurredAt).getTime()>=start);
  assert.deepEqual(data.fabric.colors[0].pieces.map(row=>row.meters),[27.5,47]);assert.equal(data.fabric.colors[1].pieces[0].meters,12);
  assert.equal(f.archive.length,1);assert.equal(f.records[0].movements.length,0);
  assert.equal((await history()).movements[0].sale.total,67.5);
});

test('wholesale sale accepts a fixed discount and takes the registered client name from the owner-scoped record', async t => {
  const f=setup(t),original=f.seed();
  const res=await request(suffix(original),{...payload(original,3),pricingMode:'wholesale',discountType:'amount',discountValue:'5.50',clientId:f.clients[0]._id,clientName:'Forged name'});
  assert.equal(res.status,201);const data=await res.json();
  assert.deepEqual([data.movement.sale.unitPrice,data.movement.sale.subtotal,data.movement.sale.discountAmount,data.movement.sale.total],[25,75,5.5,69.5]);
  assert.equal(data.movement.sale.clientId,f.clients[0]._id);assert.equal(data.movement.sale.clientName,'Registered client');
});

test('customer details and discount are optional, including Arabic numbers and full length sale', async t => {
  const f=setup(t),original=f.seed();
  const res=await request(suffix(original),{...payload(original,'٣٠'),discountValue:'٠'});
  assert.equal(res.status,201);const data=await res.json();assert.equal(data.fabric.colors[0].pieces[0].meters,0);
  assert.equal(data.movement.sale.clientName,'');assert.equal(data.movement.sale.clientId,undefined);assert.equal(data.movement.sale.total,900);
});

test('registered client names at the existing 160-character limit remain printable in sales', async t => {
  const f=setup(t),original=f.seed();f.clients[0].name='أ'.repeat(160);
  const res=await request(suffix(original),{...payload(original),clientId:f.clients[0]._id});assert.equal(res.status,201);
  const data=await res.json();assert.equal(publicFabricSaleReceipt(data.movement).clientName,f.clients[0].name);
});

test('negative, excessive, malformed discounts and unknown clients cannot change stock or history', async t => {
  const f=setup(t),original=f.seed();const before=JSON.stringify(f.records);
  for(const patch of [{discountValue:-1},{discountValue:101},{discountValue:'1.001'},{discountValue:true},{discountType:'amount',discountValue:60.01},{discountType:'other'},{pricingMode:'other'},{meters:30.001},{meters:0},{clientId:f.clients[1]._id},{clientId:'777777777777777777777777'},{clientId:{}},{clientName:{}},{clientName:'x'.repeat(161)}]){
    const res=await request(suffix(original),{...payload(original),...patch});assert.ok([400,404,409].includes(res.status),JSON.stringify(patch));
  }
  assert.equal(JSON.stringify(f.records),before);assert.equal(f.save.mock.callCount(),0);assert.equal(f.archive.length,0);
});

test('legacy stock can still be reduced but cannot be sold with an unknown tariff', async t => {
  const f=setup(t),original=f.seed({type:'Legacy',salePricePerMeter:30,colors:input.colors});
  assert.equal((await request(suffix(original),{...payload(original),pricingMode:'wholesale'})).status,400);
  original.salePricePerMeter=undefined;
  assert.equal((await request(suffix(original),payload(original))).status,400);
  assert.equal((await request(suffix(original).replace('/sales','/reductions'),payload(original))).status,201);
  assert.equal(f.archive[0].sale,undefined);
});

test('sale retry preserves the original price and client snapshot even after edits and deletion', async t => {
  const f=setup(t),original=f.seed(),body={...payload(original),clientId:f.clients[0]._id,discountValue:5};
  const firstResult=await(await request(suffix(original),body)).json();
  f.clients[0].name='Changed client';f.records[0].salePricePerMeter=80;f.records[0].type='Changed fabric';
  let replay=await request(suffix(original),body);assert.equal(replay.status,200);assert.deepEqual((await replay.json()).movement,firstResult.movement);
  assert.equal((await request(suffix(original),{...body,discountValue:6})).status,409);
  assert.equal((await request(suffix(original).replace('/sales','/reductions'),body)).status,409);
  assert.equal((await request('/'+original._id,{version:1},claims,'DELETE')).status,200);
  f.clients.splice(0,1);replay=await request(suffix(original),body);assert.equal(replay.status,200);
  const data=await replay.json();assert.equal(data.fabric,null);assert.deepEqual(data.movement,firstResult.movement);
  assert.equal((await history()).movements.length,1);
});

test('duplicate submissions and competing sales cannot deduct twice or oversell', async t => {
  const f=setup(t),original=f.seed(),body=payload(original,20);
  let results=await Promise.all([request(suffix(original),body),request(suffix(original),body)]);
  assert.deepEqual(results.map(row=>row.status).sort(),[200,201]);assert.equal(f.records[0].colors[0].pieces[0].meters,10);
  const current=f.records[0];results=await Promise.all([request(suffix(current),payload(current,7)),request(suffix(current),payload(current,7))]);
  assert.deepEqual(results.map(row=>row.status).sort(),[201,409]);assert.equal(f.records[0].colors[0].pieces[0].meters,3);assert.equal((await history()).movements.length,2);
});

test('failed archive leaves sale receipt durable and retryable without another stock change', async t => {
  const f=setup(t),original=f.seed(),body=payload(original);
  f.bulk.mock.mockImplementation(async()=>{throw new Error('Archive outage');});
  assert.equal((await request(suffix(original),body)).status,201);assert.equal(f.records[0].movements.length,1);
  assert.equal((await request(suffix(original),body)).status,200);assert.equal(f.save.mock.callCount(),1);
  const rows=(await history()).movements;assert.equal(rows.length,1);assert.equal(rows[0].sale.total,60);
});

test('failed save leaves no sale or stock mutation', async t => {
  const f=setup(t),original=f.seed(),before=JSON.stringify(f.records);f.save.mock.mockImplementation(async()=>{throw new Error('Private save error');});
  const res=await request(suffix(original),payload(original));assert.equal(res.status,500);assert.deepEqual(await res.json(),{message:'saleFailed'});
  assert.equal(JSON.stringify(f.records),before);assert.equal(f.archive.length,0);
});

test('fabric-only employee can sell and select clients without client-module access, with separate wholesale and discount rights', async t => {
  const f=setup(t),original=f.seed();f.staff.moduleAccess=['fabrics'];f.staff.operationPermissions={fabrics:['sell']};
  assert.equal(employeeCanRequest(f.staff,'GET','/fabrics/sale-clients'),true);
  let res=await request('/sale-clients',undefined,staffClaims);assert.equal(res.status,200);assert.deepEqual(await res.json(),{clients:[{_id:f.clients[0]._id,name:'Registered client'}]});
  assert.equal(employeeCanRequest(f.staff,'GET','/clients'),false);
  assert.equal((await request(suffix(original),{...payload(original),pricingMode:'wholesale'},staffClaims)).status,403);
  assert.equal((await request(suffix(original),{...payload(original),discountValue:5},staffClaims)).status,403);
  res=await request(suffix(original),{...payload(original),clientId:f.clients[0]._id},staffClaims);assert.equal(res.status,201);
  assert.equal((await res.json()).movement.sale.createdByName,'Sales employee');
  f.staff.operationPermissions.fabrics=['reduce'];assert.equal((await request(suffix(f.records[0]),payload(f.records[0]),staffClaims)).status,403);
  assert.equal((await request('/sale-clients',undefined,staffClaims)).status,403);
  f.staff.operationPermissions.fabrics=['sell','wholesale','discount'];assert.equal((await request(suffix(f.records[0]),{...payload(f.records[0]),pricingMode:'wholesale',discountValue:5},staffClaims)).status,201);
  f.staff.isActive=false;assert.equal((await request(suffix(f.records[0]),payload(f.records[0]),staffClaims)).status,403);
});

test('foreign owners, unauthenticated requests, stale versions and changed roll barcodes cannot sell', async t => {
  const f=setup(t),original=f.seed(),foreign=f.seed(input,foreignOwner);
  assert.equal((await request(suffix(foreign),payload(foreign))).status,404);
  assert.equal((await request(suffix(original),payload(original),null)).status,401);
  assert.equal((await request(suffix(original),{...payload(original),version:1})).status,409);
  assert.equal((await request(suffix(original),{...payload(original),barcode:second})).status,404);
  assert.equal(f.save.mock.callCount(),0);
});

test('three type-level prices validate, persist and cannot be changed through add-color-only rights', async t => {
  const f=setup(t),original=f.seed();await original.validate();
  assert.deepEqual([original.purchasePricePerMeter,original.wholesalePricePerMeter,original.salePricePerMeter],[15,25,30]);
  assert.equal(validateFabric({...input,purchasePricePerMeter:'٠',wholesalePricePerMeter:'٢٥٫٥٠'},{requirePrices:true}).wholesalePricePerMeter,25.5);
  assert.throws(()=>validateFabric({type:'Legacy',colors:input.colors},{requirePrices:true}),{message:'invalidFabric'});
  for(const key of ['purchasePricePerMeter','wholesalePricePerMeter','salePricePerMeter']){
    for(const value of [-1,1000001,'1.001',null,true])assert.throws(()=>validateFabric({...input,[key]:value}),{message:'invalidFabric'});
  }
  f.staff.moduleAccess=['fabrics'];f.staff.operationPermissions={fabrics:['addColor']};
  for(const key of ['purchasePricePerMeter','wholesalePricePerMeter','salePricePerMeter']){
    const body=JSON.parse(JSON.stringify(original));body.version=0;body[key]+=1;
    assert.equal((await request('/'+original._id,body,staffClaims,'PUT')).status,403);
  }
  const body=JSON.parse(JSON.stringify(original));body.version=0;body.purchasePricePerMeter=19;body.wholesalePricePerMeter=32;body.salePricePerMeter=40;
  assert.equal((await request('/'+original._id,body,claims,'PUT')).status,200);
  assert.deepEqual([f.records[0].purchasePricePerMeter,f.records[0].wholesalePricePerMeter,f.records[0].salePricePerMeter],[19,32,40]);
});

test('centime arithmetic, zero and maximum discounts are exact and receipt fields exclude internal data', () => {
  const price={salePricePerMeter:19.99,wholesalePricePerMeter:25};
  assert.deepEqual(calculateFabricSale({meters:'1.125',pricingMode:'retail',discountType:'percent',discountValue:12.5},price),{pricingMode:'retail',unitPrice:19.99,subtotal:22.49,discountType:'percent',discountValue:12.5,discountAmount:2.81,total:19.68});
  assert.equal(calculateFabricSale({meters:1,pricingMode:'retail',discountValue:100},price).total,0);
  assert.equal(calculateFabricSale({meters:1000000,pricingMode:'retail',discountValue:100},{salePricePerMeter:1000000}).total,0);
  assert.equal(validateFabricSaleInput({meters:'٢٫٥',pricingMode:'retail'}).meters,2.5);
  const receipt=publicFabricSaleReceipt({_id:owner,type:'Coton',meters:2,beforeMeters:30,remainingMeters:28,photo:'private',sale:{unitPrice:30,total:60,purchaseCost:15,requestFingerprint:'secret',clientId:foreignOwner}});
  for(const key of ['beforeMeters','remainingMeters','photo','purchaseCost','requestFingerprint','clientId'])assert.equal(receipt[key],undefined);
});
