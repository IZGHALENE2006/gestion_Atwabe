import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import { garmentWorkerFixture } from "./helpers/garmentWorkerFixture.js";
import { owner, otherOwner, employee } from "./helpers/djellabaCostsFixture.js";
import { validateWorkerWork, workerWorkGarmentType, workerWorkTotals, trouserWorkTotals } from "../shared/workerWork.js";
const previousSecret = process.env.JWT_SECRET;
let server, base;
before(async () => { process.env.JWT_SECRET = "isolated-worker-garment-orders"; server = app.listen(0,"127.0.0.1"); await new Promise(resolve => server.once("listening",resolve)); base = "http://127.0.0.1:" + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if(previousSecret === undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret; });
const admin = { id: owner, role: "admin" }, staff = { id: employee, role: "Employe", idAdmin: otherOwner, action: { add: true, update: true } };
const request = (path, method = "GET", body, actor = admin) => fetch(base + path, { method, headers: { ...(actor ? { Authorization: "Bearer " + jwt.sign(actor,process.env.JWT_SECRET) } : {}), "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const workPath = worker => "/tailoring-workers/" + worker._id + "/work";
const selected = (order, category = "machine", lineIds = order.items.map(item => item.lineId)) => ({ workType: "client", category, orderId: String(order._id), lineIds, requestId: randomUUID() });
const assign = async (worker, body, actor) => { const response = await request(workPath(worker),"POST",body,actor); const value = await response.json(); assert.equal(response.status,201,JSON.stringify(value)); return value; };

test("shirts are a worker section with shop/client work and can share an artisan with other sections", async t => {
  const f = garmentWorkerFixture(t);
  let response = await request("/tailoring-workers","POST",{ name:"عامل الأقمصة",phone:"0612345678",categories:["shirts","machine"],requestId:randomUUID() });
  assert.equal(response.status,201); const worker = await response.json(); assert.deepEqual(worker.categories,["machine","shirts"]);
  const work = await assign(worker,{ category:"shirts",workType:"shop",productName:"أقمصة للبيع",quantity:3,requestId:randomUUID() });
  assert.equal(work.quantity,3); assert.equal(work.tailoring,undefined);
  assert.equal(f.records.length,1);
});

test("machine order options and work totals separate djellabas, jabadors and malakiyas", async t => {
  const f = garmentWorkerFixture(t);
  const orders = ["djellaba","jabador","malakiya"].map(type => f.seedGarmentOrder(type));
  f.seedGarmentOrder("shirts");f.seedGarmentOrder("trousers");
  for(const order of orders) {
    const kind = order.garmentType;
    const response = await request(workPath(f.worker)+"/orders?category=machine&garmentType="+kind);
    assert.equal(response.status,200);const options=(await response.json()).orders;
    assert.equal(options.length,1);assert.equal(options[0].garmentType,kind);
    await assign(f.worker,selected(order));
  }
  const works=(await (await request(workPath(f.worker)+"?category=machine")).json()).works;
  for(const kind of ["djellaba","jabador","malakiya"]) assert.equal(workerWorkTotals(works.filter(work=>workerWorkGarmentType(work)===kind),"machine").quantity,2);
  assert.equal((await request(workPath(f.worker)+"/orders?category=machine&garmentType=shirts")).status,400);
});

test("machine shop garment types persist while old unclassified shop work stays identifiable", async t => {
  const f=garmentWorkerFixture(t);
  for(const garmentType of ["djellaba","jabador"]) {
    const work=await assign(f.worker,{category:"machine",workType:"shop",garmentType,productName:"منتج",quantity:3,requestId:randomUUID()});assert.equal(workerWorkGarmentType(work),garmentType);
  }
  const old=await assign(f.worker,{category:"machine",productName:"عمل قديم",quantity:1,requestId:randomUUID()});assert.equal(workerWorkGarmentType(old),null);
  assert.throws(()=>validateWorkerWork({category:"machine",workType:"shop",garmentType:"shirts",productName:"منتج",quantity:1}),error=>error.fields.garmentType==="invalidGarmentType");
});

test("shirt client work comes only from shirt orders and retains types without sfifa", async t => {
  const f=garmentWorkerFixture(t),worker=f.seedWorker(owner,["shirts"]),order=f.seedGarmentOrder("shirts"),other=f.seedGarmentOrder("jabador");
  const options=await (await request(workPath(worker)+"/orders?category=shirts")).json();assert.equal(options.orders.length,1);assert.equal(options.orders[0].items[0].shirtType,"قميص رجالي 0");
  const work=await assign(worker,{...selected(order,"shirts"),productName:"مزور",quantity:99});
  assert.equal(work.productName,order.clientName);assert.equal(work.quantity,2);assert.equal(work.tailoring.garmentType,"shirts");assert.equal(work.tailoring.items[0].shirtType,"قميص رجالي 0");
  assert.equal((await request(workPath(worker),"POST",selected(other,"shirts"))).status,404);
  assert.equal((await request(workPath(worker),"POST",{category:"shirts",workType:"client",productName:"زبون",quantity:2,requestId:randomUUID()})).status,400);
  let response=await request(workPath(worker)+"/"+work._id+"/completions","POST",{quantity:1,requestId:randomUUID(),version:work.__v});assert.equal(response.status,201);assert.equal((await response.json()).remainingQuantity,1);
});

test("trouser clients use saved orders and homogeneous style counts including completions", async t => {
  const f=garmentWorkerFixture(t),worker=f.seedWorker(owner,["trousers"]),order=f.seedGarmentOrder("trousers",["regular","qandrissi","regular"]);
  const options=await (await request(workPath(worker)+"/orders?category=trousers")).json();assert.equal(options.orders.length,1);assert.equal(options.orders[0].items[1].trouserType,"qandrissi");
  const normal=await assign(worker,{...selected(order,"trousers",[order.items[0].lineId,order.items[2].lineId]),trouserType:"qandrissi",quantity:999,productName:"مزور"});
  const qandrissi=await assign(worker,selected(order,"trousers",[order.items[1].lineId]));
  assert.equal(normal.quantity,2);assert.equal(normal.trouserType,"regular");assert.equal(normal.productName,order.clientName);assert.equal(qandrissi.trouserType,"qandrissi");
  const response=await request(workPath(worker)+"/"+normal._id+"/completions","POST",{quantity:1,requestId:randomUUID(),version:normal.__v});assert.equal(response.status,201);
  const works=(await (await request(workPath(worker)+"?category=trousers")).json()).works;
  assert.deepEqual(trouserWorkTotals(works),{regular:{quantity:2,completedQuantity:1,remainingQuantity:1},qandrissi:{quantity:1,completedQuantity:0,remainingQuantity:1}});
});

test("mixed trouser assignments and increases cannot corrupt style statistics", async t => {
  const f=garmentWorkerFixture(t),worker=f.seedWorker(owner,["trousers"]),order=f.seedGarmentOrder("trousers",["regular","qandrissi","regular"]);
  let response=await request(workPath(worker),"POST",selected(order,"trousers"));assert.equal(response.status,400);assert.equal((await response.json()).fields.lineIds,"mixedTrouserTypes");assert.equal(f.records.length,0);
  const work=await assign(worker,selected(order,"trousers",[order.items[0].lineId]));
  response=await request(workPath(worker)+"/"+work._id+"/increases","POST",{lineIds:[order.items[1].lineId],requestId:randomUUID(),version:work.__v});assert.equal(response.status,400);assert.equal(f.records[0].quantity,1);assert.equal(f.records[0].additions.length,0);
  response=await request(workPath(worker)+"/"+work._id+"/increases","POST",{lineIds:[order.items[2].lineId],requestId:randomUUID(),version:work.__v});assert.equal(response.status,201);assert.equal((await response.json()).quantity,2);
});

test("duplicate assignments, wrong categories, delivered orders and other shops are rejected", async t => {
  const f=garmentWorkerFixture(t),worker=f.seedWorker(owner,["shirts","trousers"]),order=f.seedGarmentOrder("shirts"),body=selected(order,"shirts");
  const work=await assign(worker,body);assert.equal((await request(workPath(worker),"POST",body)).status,200);
  assert.equal((await request(workPath(worker),"POST",{...body,requestId:randomUUID()})).status,409);
  assert.equal((await request(workPath(worker),"POST",selected(order,"trousers"))).status,404);
  const foreign=f.seedGarmentOrder("shirts",["regular"],otherOwner);assert.equal((await request(workPath(worker),"POST",selected(foreign,"shirts"))).status,404);
  const delivered=f.seedGarmentOrder("shirts",["regular"],owner,{deliveredAt:new Date()});assert.equal((await request(workPath(worker),"POST",selected(delivered,"shirts"))).status,409);
  const tracking=await (await request("/tailoring-orders/work-status")).json();assert.equal(tracking.orders.find(row=>row.orderId===String(order._id)).assignments[0].workId,work._id);
});

test("legacy manual trouser history stays usable and retries work without allowing new manual entries", async t => {
  const f=garmentWorkerFixture(t),worker=f.seedWorker(owner,["trousers"]),body={productName:"زبون قديم",quantity:3,trouserType:"regular",requestId:randomUUID()};
  const legacy=await f.seedLegacyTrouser(worker,body);
  assert.equal((await request(workPath(worker),"POST",{...body,category:"trousers",workType:"client"})).status,200);
  assert.equal((await request(workPath(worker),"POST",{...body,requestId:randomUUID(),category:"trousers",workType:"client",allowLegacyTrouserClient:true})).status,400);
  const response=await request(workPath(worker)+"/"+legacy._id+"/completions","POST",{quantity:1,requestId:randomUUID(),version:0});assert.equal(response.status,201);assert.equal((await response.json()).remainingQuantity,2);
});

test("new categories and order work enforce live employee permissions", async t => {
  const f=garmentWorkerFixture(t),worker=f.seedWorker(owner,["shirts"]),order=f.seedGarmentOrder("shirts");f.staff.action.add=false;
  assert.equal((await request(workPath(worker)+"/orders?category=shirts","GET",undefined,staff)).status,403);
  assert.equal((await request(workPath(worker),"POST",selected(order,"shirts"),staff)).status,403);
  assert.equal((await request(workPath(worker)+"/orders?category=shirts","GET",undefined,null)).status,401);
});
