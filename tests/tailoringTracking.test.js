import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "../BackEnd/node_modules/mongoose/index.js";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import AdminModel from "../BackEnd/models/AdminModel.js";
import EmployeModel from "../BackEnd/models/EmployeModele.js";
import TailoringWorker from "../BackEnd/models/TailoringWorker.js";
import WorkerWork from "../BackEnd/models/WorkerWork.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import { validateTailoringOrder } from "../shared/tailoring.js";
import SfifaStock from "../BackEnd/models/SfifaStock.js";
import { validateWorkerWork } from "../shared/workerWork.js";

const owner = "111111111111111111111111", otherOwner = "222222222222222222222222", employee = "333333333333333333333333";
const admin = { id: owner, role: "admin" }, stranger = { id: otherOwner, role: "admin" }, staffClaims = { id: employee, role: "Employe", idAdmin: otherOwner, action: { add: true, update: true } };
const previousSecret = process.env.JWT_SECRET;
let server, base;
before(async () => {
  process.env.JWT_SECRET = "sfifa-production-tests";
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});
const query = fn => ({ transaction: null, select() { return this; }, session(value) { this.transaction = value; return this; }, sort() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve().then(() => fn(this.transaction)).then(resolve, reject); } });
const input = (patch = {}) => ({ category: "sfifa", quantity: 12, sfifa: { width: "thick", family: "01-30", code: 12 }, requestId: randomUUID(), ...patch });
function setup(t) {
  const workers = [], stocks = [], records = [], orders = [], accounts = new Set([owner, otherOwner]);
  const staff = { _id: employee, idAdmin: owner, isActive: true, action: { add: true, update: true } };
  const controls = { failSave: false, conflictOnce: false, duplicateGroup: false, failList: false };
  const same = (a, b) => String(a) === String(b);
  const valuesAt = (value, parts) => Array.isArray(value) ? value.flatMap(entry => valuesAt(entry, parts)) : !parts.length ? [value] : value == null ? [] : valuesAt(value[parts[0]], parts.slice(1));
  const matches = (row, scope) => Object.entries(scope).every(([key,value]) => valuesAt(row,key.split(".")).some(candidate => value?.$in ? value.$in.some(id => same(candidate,id)) : same(candidate,value)));
  t.mock.method(AdminModel, "findById", id => query(() => accounts.has(String(id)) ? { _id: id } : null));
  t.mock.method(EmployeModel, "findById", id => query(() => String(id) === employee ? staff : null));
  const seedWorker = (idAdmin = owner, categories = ["sfifa", "machine", "finishing", "brim"]) => {
    const row = new TailoringWorker({ name: "أمينة", phone: "0612345678", categories, idAdmin, createdBy: idAdmin, requestId: randomUUID(), requestFingerprint: "test", __v: 0 }); workers.push(row); return row;
  };
  const worker = seedWorker();
  t.mock.method(TailoringWorker, "findOne", scope => query(() => { const row = workers.find(row => matches(row, scope)); return row ? new TailoringWorker(row.toObject()) : null; }));
  t.mock.method(TailoringWorker, "find", scope => query(() => workers.filter(worker => same(worker.idAdmin, scope.idAdmin) && scope._id.$in.includes(String(worker._id)))));
  const seedOrder = (idAdmin = owner, patch = {}) => {
    const items = [0,1].map(index => ({ lineId: randomUUID().replaceAll("-", "").slice(0,24), price: 500, fabricSource: "client", fabricType: index ? "مخمل" : "ساتان", fabricColor: index ? "أخضر" : "أزرق", sfifa: { width: "thin", style: "fabric" } }));
    const row = new TailoringOrder({ ...validateTailoringOrder({ clientName: "فاطمة", phone: "0612345678", orderDate: "2026-10-23", readyDate: "2026-11-04", paidAmount: 200, items }), idAdmin, createdBy: idAdmin, requestId: randomUUID(), requestFingerprint: "test", __v: 0, ...patch });
    orders.push(row); return row;
  };
  t.mock.method(TailoringOrder, "find", scope => query(() => orders.filter(row => matches(row,scope)).map(row => row.toObject())));
  t.mock.method(TailoringOrder, "findOne", scope => query(() => { const row=orders.find(row=>matches(row,scope));return row?new TailoringOrder(row.toObject()):null; }));
  t.mock.method(WorkerWork, "findOne", scope => query(() => { const row=records.find(row=>matches(row,scope));return row?new WorkerWork(row.toObject()):null; }));
  t.mock.method(WorkerWork, "find", scope => query(() => records.filter(row=>matches(row,scope)).map(row=>row.toObject())));
  t.mock.method(WorkerWork, "create", async value => {
    const row=new WorkerWork({...value,__v:0,createdAt:new Date(),updatedAt:new Date()});await row.validate();
    if(records.some(other=>same(other.idAdmin,row.idAdmin)&&(other.requestId===row.requestId || (row.tailoring && other.category===row.category && same(other.tailoring?.orderId,row.tailoring.orderId) && other.tailoring.lineIds.some(id=>row.tailoring.lineIds.includes(id)))))) throw Object.assign(new Error("duplicate"),{code:11000});
    records.push(row);return row;
  });
  t.mock.method(WorkerWork.prototype, "save", async function(){
    await this.validate();const index=records.findIndex(row=>same(row._id,this._id));if(index<0||records[index].__v!==this.__v)throw Object.assign(new Error("stale"),{name:"VersionError"});
    this.__v+=1;this.updatedAt=new Date();records[index]=new WorkerWork(this.toObject());return this;
  });
  t.mock.method(SfifaStock, "findOne", scope => query(() => { const row = stocks.find(row => matches(row, scope)); return row ? new SfifaStock(row.toObject()) : null; }));
  t.mock.method(SfifaStock, "find", scope => query(() => { if (controls.failList) throw new Error("private read failure"); return stocks.filter(row => matches(row, scope)).map(row => row.toObject()); }));
  const saveStock = t.mock.method(SfifaStock.prototype, "save", async function () {
    await this.validate();
    if (controls.failSave) { controls.failSave = false; throw new Error("private stock failure"); }
    if (controls.conflictOnce) { controls.conflictOnce = false; throw Object.assign(new Error("concurrent write"), { name: "VersionError" }); }
    if (controls.duplicateGroup) { controls.duplicateGroup = false; throw Object.assign(new Error("concurrent parent"), { code: 11000 }); }
    const index = stocks.findIndex(row => same(row._id, this._id));
    if (index >= 0 && stocks[index].__v !== this.__v) throw Object.assign(new Error("stale"), { name: "VersionError" });
    for (const row of stocks.filter(row => same(row.idAdmin, this.idAdmin) && !same(row._id, this._id))) {
      if ((row.width === this.width && row.family === this.family) || (row.production || []).some(work => (this.production || []).some(other => other.requestId === work.requestId)) || row.receipts.some(receipt => this.receipts.some(other => other.requestId === receipt.requestId))) throw Object.assign(new Error("duplicate"), { code: 11000 });
    }
    this.__v = index < 0 ? 0 : this.__v + 1; this.createdAt ||= new Date(); this.updatedAt = new Date();
    if (index < 0) stocks.push(new SfifaStock(this.toObject())); else stocks[index] = new SfifaStock(this.toObject());
    return this;
  });
  const startSession = t.mock.method(mongoose, "startSession", async () => { throw new Error("Standalone MongoDB: transactions must not be used"); });
  const seedStock = ({ width = "thick", family = "01-30", code = 12, quantity = 10, idAdmin = owner, legacy = false } = {}) => {
    let row = stocks.find(row => row.width === width && row.family === family && same(row.idAdmin, idAdmin));
    const value = { width, family, quantity, idAdmin, createdBy: idAdmin, __v: row?.__v ?? 0, unassignedQuantity: legacy ? undefined : 0, variants: legacy ? undefined : [{ code, quantity }] };
    if (row) row.set(value); else { row = new SfifaStock(value); stocks.push(row); } return row;
  };
  return { worker, workers, records, orders, seedOrder, stocks, accounts, staff, controls, seedWorker, seedStock, startSession, saveStock };
}
async function request(path, { body, method = body === undefined ? "GET" : "POST", actor = admin } = {}) {
  return fetch(`${base}${path}`, { method, headers: { ...(actor ? { Authorization: `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const workPath = worker => `/tailoring-workers/${worker._id}/work`;
const assign = async (worker, body = input(), actor) => { const response = await request(workPath(worker), { body, ...(actor === undefined ? {} : { actor }) }); assert.equal(response.status, 201); return response.json(); };
const completionBody = (work, quantity, patch = {}) => ({ quantity, requestId: randomUUID(), version: work.__v, ...patch });
const complete = (worker, work, body, actor) => request(`${workPath(worker)}/${work._id}/completions`, { body, ...(actor === undefined ? {} : { actor }) });

const orderWork = (order, category="machine", patch={}) => ({workType:"client",category,orderId:String(order._id),lineIds:order.items.map(item=>item.lineId),requestId:randomUUID(),...(category==="sfifa"?{quantity:12,sfifa:{width:"thin",family:"01-30",code:12}}:{}),...patch});

test("sfifa increases preserve exact meters and deletion keeps credited stock and receipts", async t => {
  const f = setup(t), work = await assign(f.worker, input({ quantity: '3,125' }));
  const completed = await (await complete(f.worker, work, completionBody(work, '1,125'))).json();
  const body = { quantity: '2,005', version: completed.__v, requestId: randomUUID() }, route = `${workPath(f.worker)}/${work._id}`;
  const response = await request(route + '/increases', { body }); assert.equal(response.status, 201);
  const increased = await response.json(); assert.deepEqual([increased.quantity, increased.completedQuantity, increased.remainingQuantity], [5.13, 1.125, 4.005]);
  assert.equal((await request(route + '/increases', { body })).status, 200); assert.equal(f.stocks[0].quantity, 1.125);
  const next = await (await complete(f.worker, increased, completionBody(increased, '0,005'))).json();
  assert.equal(next.remainingQuantity, 4); assert.equal(f.stocks[0].quantity, 1.13);
  assert.equal((await request(route, { method: 'DELETE', body: { version: next.__v } })).status, 200);
  assert.equal(f.stocks[0].quantity, 1.13); assert.equal(f.stocks[0].receipts.length, 2); assert.ok(f.stocks[0].production[0].deletedAt);
  assert.equal((await (await request(workPath(f.worker) + '?category=sfifa')).json()).works.length, 0);
  assert.equal((await request(route, { method: 'DELETE', body: { version: next.__v } })).status, 200);
  assert.equal((await complete(f.worker, next, completionBody(next, 1))).status, 409);
});
test("sfifa increase retries survive parent conflicts and failed deletes leave work active", async t => {
  const f = setup(t), work = await assign(f.worker, input({ quantity: 3 })), route = `${workPath(f.worker)}/${work._id}`;
  const body = { quantity: 2, version: work.__v, requestId: randomUUID() }; f.controls.conflictOnce = true;
  const response = await request(route + '/increases', { body }); assert.equal(response.status, 201);
  const increased = await response.json(); assert.equal(increased.quantity, 5);
  f.controls.failSave = true;
  assert.equal((await request(route, { method: 'DELETE', body: { version: increased.__v } })).status, 500);
  assert.equal(f.stocks[0].production[0].deletedAt, undefined); assert.equal(f.stocks[0].quantity, 0);
});
const tracking = actor => request("/tailoring-orders/work-status",actor===undefined?{}:{actor});
const assignedFor = async order => (await (await tracking()).json()).orders.find(row=>row.orderId===String(order._id)).assignments;

test("an order reports only its actual linked workers and sections, across different garments",async t=>{
  const f=setup(t),order=f.seedOrder(),other=f.seedOrder();
  assert.deepEqual(await assignedFor(order),[]);
  await assign(f.worker,orderWork(order,"machine",{lineIds:[order.items[0].lineId]}));
  await assign(f.worker,orderWork(order,"brim",{lineIds:[order.items[1].lineId]}));
  await assign(f.worker,{productName:order.clientName,quantity:2,category:"finishing",requestId:randomUUID()});
  await assign(f.worker,input({workType:"client"}));
  const rows=await assignedFor(order);assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.category).sort(),["brim","machine"]);
  assert.ok(rows.every(row=>row.workerName==="أمينة"&&row.remainingQuantity===1));assert.deepEqual(await assignedFor(other),[]);
  assert.equal(rows.find(row=>row.category==="machine").items[0].lineId,order.items[0].lineId);
});

test("completing the machine and client sfifa updates order tracking without crediting shop stock",async t=>{
  const f=setup(t),order=f.seedOrder(),before=JSON.stringify(order.toObject());
  const machine=await assign(f.worker,orderWork(order));const partial=await complete(f.worker,machine,completionBody(machine,1));assert.equal(partial.status,201);
  assert.equal((await assignedFor(order))[0].remainingQuantity,1);
  const mid=await partial.json();assert.equal((await complete(f.worker,mid,completionBody(mid,1))).status,201);
  const sfifa=await assign(f.worker,orderWork(order,"sfifa"));assert.equal(sfifa.quantity,12);assert.equal(sfifa.tailoring.items.length,2);
  const done=await complete(f.worker,sfifa,completionBody(sfifa,4));assert.equal(done.status,201);
  let rows=await assignedFor(order);assert.equal(rows.find(row=>row.category==="machine").remainingQuantity,0);assert.ok(rows.find(row=>row.category==="machine").completedAt);
  assert.equal(rows.find(row=>row.category==="sfifa").remainingQuantity,8);assert.equal(rows.find(row=>row.category==="sfifa").completedQuantity,4);assert.equal(f.stocks.find(row=>row.width==="thin").quantity,0);
  const sfifaPartial=await done.json();assert.equal((await complete(f.worker,sfifaPartial,completionBody(sfifaPartial,8))).status,201);
  rows=await assignedFor(order);assert.ok(rows.every(row=>row.remainingQuantity===0));assert.equal(f.stocks.find(row=>row.width==="thin").quantity,0);assert.equal(f.stocks.find(row=>row.width==="thin").receipts.length,0);
  assert.equal(JSON.stringify(order.toObject()),before);assert.equal(order.deliveredAt,null);
});

test("optional sfifa order links validate selections, preserve decimal meter quantities, and reject foreign or delivered orders",async t=>{
  const f=setup(t),order=f.seedOrder(),foreign=f.seedOrder(otherOwner),delivered=f.seedOrder(owner,{deliveredAt:new Date()});
  const body=orderWork(order,"sfifa",{quantity:"2,125"}),normalized=validateWorkerWork(body);assert.equal(normalized.quantity,2.125);assert.equal(normalized.lineIds.length,2);
  for(const patch of [{orderId:"bad"},{lineIds:[]},{lineIds:[order.items[0].lineId,order.items[0].lineId]}])assert.equal((await request(workPath(f.worker),{body:{...body,...patch}})).status,400);
  assert.equal((await request(workPath(f.worker),{body:orderWork(foreign,"sfifa")})).status,404);
  assert.equal((await request(workPath(f.worker),{body:orderWork(delivered,"sfifa")})).status,409);
  assert.equal((await request(workPath(f.worker),{body:orderWork(order,"sfifa",{lineIds:["999999999999999999999999"]})})).status,409);
  const saved=await assign(f.worker,body);assert.equal(saved.quantity,2.125);assert.equal(saved.tailoring.clientName,"فاطمة");
  const legacy=await assign(f.worker,input({workType:"client",quantity:3}));assert.equal(legacy.tailoring,undefined);assert.equal(legacy.quantity,3);
});

test("linked sfifa retries remain idempotent after the source order changes or is removed",async t=>{
  const f=setup(t),order=f.seedOrder(),body=orderWork(order,"sfifa"),first=await assign(f.worker,body);
  f.orders.length=0;const replay=await request(workPath(f.worker),{body:{...body,lineIds:[...body.lineIds].reverse()}});assert.equal(replay.status,200);assert.equal((await replay.json())._id,first._id);
  assert.equal(f.stocks.flatMap(row=>row.production||[]).length,1);assert.equal((await complete(f.worker,first,completionBody(first,1.125))).status,201);
  assert.equal(f.stocks[0].quantity,0);assert.equal(f.stocks[0].receipts.length,0);assert.equal(f.stocks[0].production[0].completedQuantity,1.125);assert.equal((await tracking()).status,200);
});

test("tracking checks current account ownership and read access, and hides private request and payment data",async t=>{
  const f=setup(t),order=f.seedOrder(),foreign=f.seedOrder(otherOwner),work=await assign(f.worker,orderWork(order));
  f.staff.action={add:false,update:false};assert.equal((await tracking(staffClaims)).status,200);
  const value=await (await tracking()).json();assert.equal(value.orders.length,1);assert.equal(value.orders[0].orderId,String(order._id));
  const own=JSON.stringify(value);for(const key of ["requestId","requestFingerprint","paidAmount","totalPrice","createdBy","photo","idAdmin"])assert.equal(own.includes('"'+key+'"'),false,key);
  const other=await (await tracking(stranger)).json();assert.deepEqual(other.orders,[{orderId:String(foreign._id),assignments:[]}]);
  assert.equal((await tracking(null)).status,401);f.staff.isActive=false;assert.equal((await tracking(staffClaims)).status,403);
  f.workers.length=0;const missing=(await assignedFor(order))[0];assert.equal(missing.workId,work._id);assert.equal(missing.workerName,"");assert.equal(missing.workerAvailable,false);
});

const orderOptions = async (worker, category) => {
  const response=await request(workPath(worker)+"/orders?category="+category);assert.equal(response.status,200);return response.json();
};

test("a pending machine job warns in finishing choices and blocks a direct assignment until that job is completed",async t=>{
  const f=setup(t),order=f.seedOrder(),worker=f.seedWorker(),machine=await assign(f.worker,orderWork(order,"machine",{lineIds:[order.items[0].lineId]}));
  const options=await orderOptions(worker,"finishing"),item=options.orders.find(row=>row._id===String(order._id)).items[0];
  assert.equal(item.available,false);assert.deepEqual(item.blockedBy,[{category:"machine",workerName:"أمينة"}]);
  assert.equal(options.orders[0].items[1].available,true);
  const body=orderWork(order,"finishing",{lineIds:[order.items[0].lineId]});
  const response=await request(workPath(worker),{body});assert.equal(response.status,409);const blocked=await response.json();
  assert.equal(blocked.message,"garmentInProgress");assert.equal(blocked.blockers[0].category,"machine");assert.equal(blocked.blockers[0].workerName,"أمينة");assert.equal(f.records.length,1);
  assert.equal((await complete(f.worker,machine,completionBody(machine,1))).status,201);
  const ready=await orderOptions(worker,"finishing");assert.equal(ready.orders[0].items[0].available,true);assert.deepEqual(ready.orders[0].items[0].blockedBy,[]);
  const finishing=await assign(worker,body);assert.equal(finishing.category,"finishing");assert.equal(f.records.length,2);
});

test("partial completion keeps all garments in that assignment blocked, while another garment or order remains independent",async t=>{
  const f=setup(t),order=f.seedOrder(),other=f.seedOrder(),worker=f.seedWorker();
  const machine=await assign(f.worker,orderWork(order));const first=await complete(f.worker,machine,completionBody(machine,1));assert.equal(first.status,201);
  for(const item of order.items){const blocked=await request(workPath(worker),{body:orderWork(order,"finishing",{lineIds:[item.lineId]})});assert.equal(blocked.status,409);}
  await assign(worker,orderWork(other,"finishing"));
  const partial=await first.json();assert.equal((await complete(f.worker,partial,completionBody(partial,1))).status,201);
  await assign(worker,orderWork(order,"finishing"));
  assert.equal(f.records.length,3);
});

test("work on another garment in the same order can be assigned to a different section",async t=>{
  const f=setup(t),order=f.seedOrder();
  await assign(f.worker,orderWork(order,"machine",{lineIds:[order.items[0].lineId]}));
  const other=await assign(f.worker,orderWork(order,"finishing",{lineIds:[order.items[1].lineId]}));assert.equal(other.quantity,1);
  assert.equal(f.records.length,2);
});

test("linked sfifa cannot receive a garment still at the machine, and incomplete sfifa blocks finishing without changing stock",async t=>{
  const f=setup(t),order=f.seedOrder(),machine=await assign(f.worker,orderWork(order));
  const rejected=await request(workPath(f.worker),{body:orderWork(order,"sfifa")});assert.equal(rejected.status,409);assert.equal((await rejected.json()).blockers[0].category,"machine");assert.equal(f.stocks.length,0);
  assert.equal((await complete(f.worker,machine,completionBody(machine,2))).status,201);
  const sfifa=await assign(f.worker,orderWork(order,"sfifa"));const first=await complete(f.worker,sfifa,completionBody(sfifa,4));assert.equal(first.status,201);
  const blocked=await request(workPath(f.worker),{body:orderWork(order,"finishing")});assert.equal(blocked.status,409);assert.equal((await blocked.json()).blockers[0].category,"sfifa");assert.equal(f.stocks[0].quantity,0);
  const options=await orderOptions(f.worker,"finishing");assert.ok(options.orders[0].items.every(item=>!item.available&&item.blockedBy[0].category==="sfifa"));
  const partial=await first.json();assert.equal((await complete(f.worker,partial,completionBody(partial,8))).status,201);assert.equal(f.stocks[0].quantity,0);assert.equal(f.stocks[0].receipts.length,0);
  await assign(f.worker,orderWork(order,"finishing"));
});

test("simultaneous cross-section assignments cannot both commit for the same garment, including sfifa stock assignments",async t=>{
  const f=setup(t),other=f.seedWorker();
  for(const categories of [["machine","finishing"],["machine","sfifa"],["sfifa","brim"]]){
    const order=f.seedOrder(),countBefore=f.records.length+f.stocks.flatMap(stock=>stock.production||[]).length;
    const results=await Promise.all(categories.map((category,index)=>request(workPath(index?other:f.worker),{body:orderWork(order,category,{lineIds:[order.items[0].lineId]})})));
    assert.deepEqual(results.map(response=>response.status).sort(),[201,409]);
    const loser=results.find(response=>response.status===409);assert.equal((await loser.json()).message,"garmentInProgress");
    assert.equal(f.records.length+f.stocks.flatMap(stock=>stock.production||[]).length,countBefore+1);
  }
});

test("a failed write releases assignment serialization and committed request retries remain valid after the garment moves on",async t=>{
  const f=setup(t),order=f.seedOrder();f.controls.failSave=true;
  assert.equal((await request(workPath(f.worker),{body:orderWork(order,"sfifa")})).status,500);assert.equal(f.stocks.length,0);
  const body=orderWork(order),machine=await assign(f.worker,body);assert.equal((await complete(f.worker,machine,completionBody(machine,2))).status,201);
  await assign(f.worker,orderWork(order,"finishing"));
  const retry=await request(workPath(f.worker),{body});assert.equal(retry.status,200);assert.equal((await retry.json())._id,machine._id);assert.equal(f.records.length,2);
});
