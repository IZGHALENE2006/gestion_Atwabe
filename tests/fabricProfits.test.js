import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import app from "../BackEnd/app.js";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import Client from "../BackEnd/models/Client.js";
import { publicFabricSaleReceipt } from "../shared/fabricSales.js";
import { employeeCanRequest } from "../shared/employeeRequestPermissions.js";
import { createFabricSaleFinancials, fabricProfitEntries, filterFabricProfits, summarizeFabricProfits, validateFabricProfitQuery } from "../shared/fabricProfits.js";
import { canOpenEmployeePage } from "../shared/employeePermissions.js";
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
  t.mock.method(TailoringOrder, "find", () => query(() => []));
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

const profits = async (params = '', actor = claims) => request('/profits' + (params ? '?' + params : ''), undefined, actor);
const bodyOf = async res => { assert.equal(res.status,200);return res.json(); };

test('sale snapshots purchase cost and net profit atomically, excluding internal amounts from ordinary history and receipts', async t => {
  const f=setup(t),original=f.seed();
  const sale=await request(suffix(original),{...payload(original,2.5),discountValue:10,purchaseUnitPrice:1,costAmount:1,profitAmount:999,createdByName:'Forged name'});
  assert.equal(sale.status,201);const result=await sale.json();
  assert.deepEqual([f.archive[0].sale.purchaseUnitPrice,f.archive[0].sale.costAmount,f.archive[0].sale.profitAmount],[15,37.5,30]);
  for(const key of ['purchaseUnitPrice','costAmount','profitAmount'])assert.equal(result.movement.sale[key],undefined);
  const historySale=(await history()).movements[0];assert.equal(historySale.sale.costAmount,undefined);
  const report=await bodyOf(await profits());assert.deepEqual([report.summary.revenueAmount,report.summary.costAmount,report.summary.profitAmount,report.summary.totalMeters],[67.5,37.5,30,2.5]);
  assert.equal(report.sales[0].sellerName,'Shop owner');assert.equal(report.sales[0].sellerRole,'admin');
  const document=publicFabricSaleReceipt(f.archive[0]);assert.equal(document.createdByName,'Shop owner');
  for(const key of ['purchaseUnitPrice','costAmount','profitAmount'])assert.equal(document[key],undefined);
});

test('saved profit and seller remain stable after fabric prices, employee name and stock change or deletion', async t => {
  const f=setup(t),original=f.seed();
  assert.equal((await request(suffix(original),payload(original,2),staffClaims)).status,201);
  f.staff.name='Renamed employee';f.records[0].purchasePricePerMeter=29;f.records[0].salePricePerMeter=80;f.records[0].type='Renamed fabric';
  let report=await bodyOf(await profits());assert.deepEqual([report.sales[0].revenueAmount,report.sales[0].costAmount,report.sales[0].profitAmount],[60,30,30]);
  assert.equal(report.sales[0].sellerName,'Sales employee');assert.equal(report.sales[0].sellerRole,'Employe');
  assert.equal((await request('/'+original._id,{version:1},claims,'DELETE')).status,200);
  report=await bodyOf(await profits());assert.equal(report.sales[0].type,'Coton');assert.equal(report.sales[0].profitAmount,30);
  assert.equal(publicFabricSaleReceipt(f.archive[0]).createdByName,'Sales employee');
});

test('unknown historic costs stay unknown, while zero purchase cost and a loss remain valid', async t => {
  const f=setup(t),legacy=f.seed({type:'Legacy',salePricePerMeter:30,colors:input.colors});
  assert.equal((await request(suffix(legacy),payload(legacy,1))).status,201);
  let report=await bodyOf(await profits());assert.deepEqual([report.summary.revenueAmount,report.summary.costAmount,report.summary.profitAmount,report.summary.unknownCount],[30,null,null,1]);
  f.records[0].purchasePricePerMeter=18;
  report=await bodyOf(await profits());assert.equal(report.sales[0].profitAmount,null);
  const current=f.records[0];current.purchasePricePerMeter=0;
  assert.equal((await request(suffix(current),payload(current,1))).status,201);
  f.records[0].purchasePricePerMeter=20;
  assert.equal((await request(suffix(f.records[0]),{...payload(f.records[0],1),discountValue:100})).status,201);
  report=await bodyOf(await profits());assert.deepEqual([report.summary.revenueAmount,report.summary.costAmount,report.summary.profitAmount,report.summary.unknownCount],[60,20,10,1]);
  assert.ok(report.sales.some(row=>row.profitAmount===-20));assert.ok(report.sales.some(row=>row.profitAmount===30&&row.costAmount===0));
});

test('pending and archived overlaps count once and sale retries never duplicate profit', async t => {
  const f=setup(t),original=f.seed(),body=payload(original);
  f.trim.mock.mockImplementation(async()=>{throw new Error('Trim unavailable');});
  assert.equal((await request(suffix(original),body)).status,201);assert.equal(f.records[0].movements.length,1);assert.equal(f.archive.length,1);
  assert.equal((await request(suffix(original),body)).status,200);
  const report=await bodyOf(await profits());assert.equal(report.totalCount,1);assert.equal(report.summary.profitAmount,30);
});

test('archive failure leaves pending sale profit readable without ever duplicating stock or revenue', async t => {
  const f=setup(t),original=f.seed();f.bulk.mock.mockImplementation(async()=>{throw new Error('Archive unavailable');});
  assert.equal((await request(suffix(original),payload(original))).status,201);
  const report=await bodyOf(await profits());assert.equal(report.totalCount,1);assert.equal(report.summary.revenueAmount,60);assert.equal(report.summary.costAmount,30);
});

test('date, month, year, search and seller filters apply to full-period totals in the requested timezone', async t => {
  const f=setup(t),original=f.seed();
  assert.equal((await request(suffix(original),payload(original,1))).status,201);f.archive[0].occurredAt=new Date('2026-10-31T23:30:00Z');
  assert.equal((await request(suffix(f.records[0]),{...payload(f.records[0],2),clientName:'أمينة'},staffClaims)).status,201);f.archive[1].occurredAt=new Date('2026-11-10T12:00:00Z');
  let report=await bodyOf(await profits('mode=day&period=2026-11-01&timeZone=Africa%2FCasablanca'));assert.equal(report.totalCount,1);assert.equal(report.summary.totalMeters,1);
  report=await bodyOf(await profits('mode=month&period=2026-11&timeZone=UTC'));assert.equal(report.totalCount,1);assert.equal(report.summary.profitAmount,30);
  report=await bodyOf(await profits('mode=year&period=2026&timeZone=UTC'));assert.equal(report.totalCount,2);assert.deepEqual(report.groups.map(row=>row.key),['2026-11','2026-10']);
  report=await bodyOf(await profits('seller='+employee));assert.equal(report.totalCount,1);assert.equal(report.sales[0].sellerName,'Sales employee');
  report=await bodyOf(await profits('search='+encodeURIComponent('امينة')));assert.equal(report.totalCount,1);
  report=await bodyOf(await profits('search='+first));assert.equal(report.totalCount,2);
  report=await bodyOf(await profits('search='+encodeURIComponent('Sales employee')));assert.equal(report.totalCount,1);
  report=await bodyOf(await profits('search=not-found'));assert.equal(report.totalCount,0);assert.equal(report.summary.profitAmount,0);
});

test('pagination returns 50 rows but summaries cover all matching sales, excluding ordinary deductions', async t => {
  const f=setup(t),original=f.seed();
  assert.equal((await request(suffix(original),payload(original,1))).status,201);
  const template=f.archive[0].toObject();f.archive.splice(0,1);
  for(let i=0;i<61;i++)f.archive.push(new FabricMovement({...template,_id:undefined,requestId:randomUUID(),occurredAt:new Date(1700000000000+i*1000)}));
  f.archive.push(new FabricMovement({...template,_id:undefined,sale:undefined,requestId:randomUUID()}));
  const firstPage=await bodyOf(await profits());assert.equal(firstPage.sales.length,50);assert.equal(firstPage.hasMore,true);assert.equal(firstPage.nextOffset,50);
  assert.equal(firstPage.totalCount,61);assert.equal(firstPage.summary.revenueAmount,1830);assert.equal(firstPage.summary.profitAmount,915);
  const secondPage=await bodyOf(await profits('offset=50'));assert.equal(secondPage.sales.length,11);assert.equal(secondPage.hasMore,false);assert.equal(secondPage.summary.profitAmount,915);
  assert.equal(new Set([...firstPage.sales,...secondPage.sales].map(row=>row.id)).size,61);
});

test('report is owner-scoped and requires the fabric profit permission separately from selling and history', async t => {
  const f=setup(t),original=f.seed(),foreign=f.seed(input,foreignOwner);
  assert.equal((await request(suffix(original),payload(original))).status,201);
  assert.equal((await request(suffix(foreign),payload(foreign),{id:foreignOwner,role:'admin'})).status,201);
  let report=await bodyOf(await profits());assert.equal(report.totalCount,1);assert.equal(report.sales[0].sellerId,owner);
  f.staff.moduleAccess=['fabrics'];f.staff.operationPermissions={fabrics:['sell','history']};
  assert.equal(employeeCanRequest(f.staff,'GET','/fabrics/profits'),false);assert.equal(canOpenEmployeePage('Employe',f.staff,'/Home/Atwabe/profits'),false);
  assert.equal((await profits('',staffClaims)).status,403);
  f.staff.operationPermissions.fabrics.push('profits');assert.equal(canOpenEmployeePage('Employe',f.staff,'/Home/Atwabe/profits'),true);
  report=await bodyOf(await profits('',staffClaims));assert.equal(report.totalCount,1);assert.equal(report.sales[0].sellerId,owner);
  assert.equal((await profits('',null)).status,401);f.staff.isActive=false;assert.equal((await profits('',staffClaims)).status,403);
});

test('invalid dates, query shapes, timezones, offsets and seller identifiers return stable errors without changes', async t => {
  const f=setup(t);f.seed();
  for(const query of ['mode=other','mode=day&period=2026-02-30','mode=month&period=2026-13','mode=year&period=1800','mode=year&period=2026x','timeZone=Invalid%2FZone','offset=-1','offset=1000001','seller=bad-id','search='+encodeURIComponent('x'.repeat(121)),'search=x&search=y']){
    const res=await profits(query);assert.equal(res.status,400,query);assert.deepEqual(await res.json(),{message:'invalidProfitQuery'});
  }
  assert.equal(f.save.mock.callCount(),0);
});

test('report failures return no financial data or private persistence errors', async t => {
  const f=setup(t);f.seed();f.archiveFind.mock.mockImplementation(()=>query(()=>{throw new Error('Private database details');}));
  const res=await profits();assert.equal(res.status,500);assert.deepEqual(await res.json(),{message:'loadProfitsFailed'});
});

test('fractional metres and summary additions remain exact at centime precision', () => {
  assert.deepEqual(createFabricSaleFinancials(2.125,15.99,60),{purchaseUnitPrice:15.99,costAmount:33.98,profitAmount:26.02});
  for(const cost of [undefined,null,-1,NaN,Infinity,'15'])assert.deepEqual(createFabricSaleFinancials(2,cost,60),{});
  const summary=summarizeFabricProfits([{revenueAmount:0.1,costAmount:0.03,meters:0.1,discountAmount:0.01},{revenueAmount:0.2,costAmount:0.04,meters:0.2,discountAmount:0.02}]);
  assert.deepEqual([summary.revenueAmount,summary.costAmount,summary.profitAmount,summary.totalMeters,summary.discountAmount],[0.3,0.07,0.23,0.3,0.03]);
  const entries=fabricProfitEntries([{_id:owner,createdBy:owner,type:'Coton',meters:1,occurredAt:'2026-11-10',sale:{total:30,discountAmount:0,purchaseUnitPrice:10,costAmount:10,createdByName:'Owner'}}]);
  assert.equal(filterFabricProfits(entries,validateFabricProfitQuery({search:'coton'})).length,1);
  assert.deepEqual(fabricProfitEntries([{_id:owner,sale:{total:30}},{_id:employee,occurredAt:'invalid',sale:{total:30}},{_id:foreignOwner,occurredAt:'2026-11-10'}]),[]);
});
