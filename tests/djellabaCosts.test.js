import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import { tailoringFabricMeters, validateTailoringOrder } from "../shared/tailoring.js";
import { djellabaItemCosts, djellabaCostsTotal, validateDjellabaRates } from "../shared/tailoringCosts.js";
import { djellabaFixture, owner, otherOwner, employee, garment, orderInput } from "./helpers/djellabaCostsFixture.js";
const previousDirectory = process.env.TAILORING_PHOTOS_DIRECTORY, previousSecret = process.env.JWT_SECRET;
const directory = await mkdtemp(path.join(tmpdir(), "djellaba-costs-photos-")); process.env.TAILORING_PHOTOS_DIRECTORY = directory;
const { default: app } = await import("../BackEnd/app.js");
let server, base;
before(async () => { process.env.JWT_SECRET = "djellaba-costs-tests"; server = app.listen(0,"127.0.0.1"); await new Promise(resolve => server.once("listening",resolve)); base = "http://127.0.0.1:" + server.address().port + "/tailoring-orders"; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; if (previousDirectory === undefined) delete process.env.TAILORING_PHOTOS_DIRECTORY; else process.env.TAILORING_PHOTOS_DIRECTORY = previousDirectory; });
const admin = { id: owner, role: "admin" }, stranger = { id: otherOwner, role: "admin" }, staffClaims = { id: employee, role: "Employe", idAdmin: otherOwner, action: { update: true } };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=","base64");
async function request(method = "GET", suffix = "", body, { actor = admin, images } = {}) {
  const headers = actor ? { Authorization: "Bearer " + jwt.sign(actor,process.env.JWT_SECRET) } : {};
  let payload;
  if (body !== undefined) {
    if (images) { payload = new FormData(); for (const [key,value] of Object.entries(body)) payload.append(key, typeof value === "object" ? JSON.stringify(value) : String(value)); for (const bytes of images) payload.append("images",new Blob([bytes],{type:"image/png"}),"cloth.png"); }
    else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  }
  return fetch(base + suffix,{ method,headers,...(payload ? {body:payload}: {}) });
}
async function create(body, options) { const response = await request("POST","",body,options); const value = await response.json(); assert.equal(response.status,201,JSON.stringify(value)); return value; }
const shopItem = (fabric,patch) => garment({ fabricSource:"shop", fabricId:String(fabric._id), colorId:String(fabric.colors[0]._id), fabricUnitPrice:fabric.salePricePerMeter, fabricType:"FORGED",...patch });
const editBody = (order,patch) => ({ ...order, automaticCosting:true, costSettingsVersion:order.costing?.settingsVersion ?? 0, version:order.__v, items:order.items.map(item=>({...item,fabricUnitPrice:item.costs?.fabricUnitPrice ?? 0})), ...patch });

test("fabric metres and money use exact precision and round fabric cost once to a centime", () => {
  for (const value of ["2", "2,125", "٢٫١٢٥", 0.001,1000000]) assert.ok(tailoringFabricMeters(value)>0);
  for (const value of [undefined,"",null,true,{},0,-1,"1.0001","1e2",1000001]) assert.equal(tailoringFabricMeters(value),null);
  const rates={thinSfifaPrice:10,thickSfifaPrice:20,laborPrice:30};
  assert.deepEqual(djellabaItemCosts({fabricMeters:2,fabricUnitPrice:25,sfifa:{width:"thin"}},rates),{fabricUnitPrice:25,fabricAmount:50,sfifaAmount:10,laborAmount:30,totalAmount:90});
  assert.equal(djellabaItemCosts({fabricMeters:0.001,fabricUnitPrice:5,sfifa:{width:"thin"}},rates).fabricAmount,0.01);
  assert.equal(djellabaItemCosts({fabricMeters:1000000,fabricUnitPrice:1000000,sfifa:{width:"thin"}},rates),null);
  assert.equal(djellabaCostsTotal([null]),null);assert.equal(djellabaCostsTotal([{totalAmount:""}]),null);assert.equal(djellabaCostsTotal(undefined),null);
  assert.deepEqual(validateDjellabaRates({thinSfifaPrice:0,thickSfifaPrice:"10,25",laborPrice:30}),{thinSfifaPrice:0,thickSfifaPrice:10.25,laborPrice:30});
  for (const value of [undefined,"",-1,"1.001",{},true]) assert.throws(()=>validateDjellabaRates({thinSfifaPrice:value,thickSfifaPrice:10,laborPrice:30}));
});

test("settings start unconfigured and save only the three rates under the current shop", async t => {
  const f=djellabaFixture(t);let response=await request("GET","/cost-settings");assert.deepEqual(await response.json(),{configured:false,version:null,rates:null,fourFillePrice:0,canEdit:true});assert.equal(f.settings.size,0);
  response=await request("PUT","/cost-settings",{rates:{thinSfifaPrice:"10,25",thickSfifaPrice:20,laborPrice:30,idAdmin:otherOwner},version:null,idAdmin:otherOwner});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.version,0);assert.equal(saved.rates.thinSfifaPrice,10.25);assert.equal(f.settings.get(owner).updatedBy.toString(),owner);
  assert.equal((await (await request("GET","/cost-settings",undefined,{actor:stranger})).json()).configured,false);
  assert.equal((await (await request("GET","/cost-settings",undefined,{actor:staffClaims})).json()).rates.laborPrice,30);
});

test("settings enforce live permissions, strict amounts, ownership and stale versions", async t => {
  const f=djellabaFixture(t);f.seedSettings();f.staff.action.update=false;
  assert.equal((await request("PUT","/cost-settings",{rates:{thinSfifaPrice:1,thickSfifaPrice:2,laborPrice:3},version:0},{actor:staffClaims})).status,403);
  assert.equal((await request("GET","/cost-settings",undefined,{actor:null})).status,401);
  for(const rates of [{thinSfifaPrice:-1,thickSfifaPrice:2,laborPrice:3},{thinSfifaPrice:1,thickSfifaPrice:"1.001",laborPrice:3},{}])assert.equal((await request("PUT","/cost-settings",{rates,version:0})).status,400);
  const rates={thinSfifaPrice:11,thickSfifaPrice:21,laborPrice:31};
  let response=await request("PUT","/cost-settings",{rates,version:0});assert.equal(response.status,200);assert.equal((await response.json()).version,1);
  response=await request("PUT","/cost-settings",{rates:{...rates,laborPrice:99},version:0});assert.equal(response.status,409);assert.equal((await response.json()).message,"costSettingsConflict");
  assert.equal((await request("PUT","/cost-settings",{rates,version:0})).status,200);
  f.staff.isActive=false;assert.equal((await request("GET","/cost-settings",undefined,{actor:staffClaims})).status,403);
});

test("two djellabas add fabric, selected sfifa and one total labor charge per garment", async t => {
  const f=djellabaFixture(t);f.seedSettings();const fabric=f.seedFabric();const stock=JSON.stringify(fabric.colors);
  const body=orderInput({items:[shopItem(fabric),shopItem(fabric,{fabricMeters:"2.5",colorId:String(fabric.colors[1]._id),sfifa:{width:"thick",style:"fabric"},price:300})],expenseAmount:1,costing:{rates:{laborPrice:0}},profitAmount:9999});
  const saved=await create(body);assert.equal(saved.totalPrice,800);assert.equal(saved.expenseAmount,202.5);assert.equal(saved.profitAmount,597.5);assert.equal(saved.remainingAmount,700);
  assert.deepEqual(saved.items.map(item=>item.costs.totalAmount),[90,112.5]);assert.equal(saved.costing.rates.laborPrice,30);assert.equal(saved.items[0].fabricType,"قطن المحل");assert.equal(JSON.stringify(fabric.colors),stock);
  const listed=(await (await request()).json()).orders[0];assert.equal(listed.expenseAmount,202.5);assert.equal(listed.items[1].fabricMeters,2.5);
});

test("client fabric costs zero while sfifa and labor still count once for each djellaba", async t => {
  const f=djellabaFixture(t);f.seedSettings();
  const saved=await create(orderInput({items:[garment({fabricMeters:3,fabricUnitPrice:999}),garment({fabricMeters:2,sfifa:{width:"thick",style:"fabric"},price:300})]}));
  assert.equal(saved.expenseAmount,90);assert.deepEqual(saved.items.map(item=>item.costs.fabricUnitPrice),[0,0]);assert.equal(saved.items[0].costs.fabricAmount,0);assert.equal(saved.profitAmount,710);
});

test("missing settings, unpriced stock or changed quotes cannot silently create wrong expenses", async t => {
  const f=djellabaFixture(t);let response=await request("POST","",orderInput());assert.equal(response.status,409);assert.equal((await response.json()).message,"costSettingsRequired");
  f.seedSettings();const fabric=f.seedFabric();const body=orderInput({items:[shopItem(fabric)]});
  fabric.salePricePerMeter=30;response=await request("POST","",body);assert.equal(response.status,409);assert.equal((await response.json()).message,"fabricPriceChanged");
  fabric.salePricePerMeter=undefined;response=await request("POST","",body);assert.equal(response.status,409);assert.equal((await response.json()).message,"fabricPriceMissing");
  const rates=f.settings.get(owner);rates.__v=1;response=await request("POST","",orderInput());assert.equal(response.status,409);assert.equal((await response.json()).message,"costSettingsChanged");assert.equal(f.orders.size,0);
});

test("invalid meters and missing fabric prices fail before persistence", async t => {
  const f=djellabaFixture(t);f.seedSettings();const fabric=f.seedFabric();
  for(const meters of [undefined,"",0,-1,"1.0001",{},1000001]){const response=await request("POST","",orderInput({items:[shopItem(fabric,{fabricMeters:meters})]}));assert.equal(response.status,400);assert.equal((await response.json()).fields["items.0.fabricMeters"],"invalidFabricMeters");}
  const response=await request("POST","",orderInput({items:[shopItem(fabric,{fabricUnitPrice:""})]}));assert.equal(response.status,400);assert.equal((await response.json()).fields["items.0.fabricUnitPrice"],"fabricPriceMissing");assert.equal(f.orders.size,0);
});

test("retries retain the committed costs even after defaults and stock prices change", async t => {
  const f=djellabaFixture(t);f.seedSettings();const fabric=f.seedFabric(),body=orderInput({items:[shopItem(fabric)]});const original=await create(body);
  f.settings.get(owner).laborPrice=999;f.settings.get(owner).__v=2;f.fabrics.clear();
  const response=await request("POST","",body);assert.equal(response.status,200);const repeated=await response.json();assert.equal(repeated._id,original._id);assert.equal(repeated.expenseAmount,90);assert.equal(f.orders.size,1);
  const conflict=await request("POST","",{...body,items:[{...body.items[0],fabricMeters:3}]});assert.equal(conflict.status,409);assert.equal((await conflict.json()).message,"requestConflict");
});

test("editing meters or sfifa uses the stored rates and original fabric price even after stock deletion", async t => {
  const f=djellabaFixture(t);f.seedSettings();const fabric=f.seedFabric();const original=await create(orderInput({items:[shopItem(fabric)]}));
  f.settings.get(owner).laborPrice=999;f.settings.get(owner).thinSfifaPrice=555;f.settings.get(owner).__v=1;f.fabrics.clear();
  const items=original.items.map(item=>({...item,fabricMeters:3,fabricUnitPrice:item.costs.fabricUnitPrice,sfifa:{width:"thick",style:"fabric"}}));
  const response=await request("PUT","/"+original._id,editBody(original,{items}));assert.equal(response.status,200);const edited=await response.json();assert.equal(edited.expenseAmount,125);assert.equal(edited.costing.rates.laborPrice,30);assert.equal(edited.barcode,original.barcode);assert.equal(edited.items[0].lineId,original.items[0].lineId);
});

test("reordering, adding or removing garments recalculates the sum without losing line identity", async t => {
  const f=djellabaFixture(t);f.seedSettings();const original=await create(orderInput({items:[garment(),garment({sfifa:{width:"thick",style:"fabric"},price:300})]}));
  const added=garment({price:100});const response=await request("PUT","/"+original._id,editBody(original,{items:[...original.items].reverse().map(item=>({...item,fabricUnitPrice:0})).concat(added)}));assert.equal(response.status,200);const edited=await response.json();assert.equal(edited.expenseAmount,130);assert.equal(edited.items[0].lineId,original.items[1].lineId);
  const removed=await request("PUT","/"+original._id,editBody(edited,{items:[{...edited.items[1],fabricUnitPrice:0}]}));assert.equal(removed.status,200);assert.equal((await removed.json()).expenseAmount,40);
});

test("old orders remain unknown until explicitly upgraded and costed orders cannot be downgraded", async t => {
  const f=djellabaFixture(t);f.seedSettings();const oldBody=orderInput();delete oldBody.automaticCosting;delete oldBody.costSettingsVersion;
  const legacy=await create(oldBody);assert.equal(legacy.costing,undefined);assert.equal(legacy.expenseAmount,undefined);assert.equal(legacy.profitAmount,undefined);
  const response=await request("PUT","/"+legacy._id,editBody(legacy,{items:legacy.items.map(item=>({...item,fabricMeters:2,fabricUnitPrice:0}))}));assert.equal(response.status,200);const upgraded=await response.json();assert.equal(upgraded.expenseAmount,40);assert.equal(upgraded.barcode,legacy.barcode);
  const downgraded=editBody(upgraded);delete downgraded.automaticCosting;const rejected=await request("PUT","/"+legacy._id,downgraded);assert.equal(rejected.status,400);assert.equal((await rejected.json()).fields.automaticCosting,"costsRequired");assert.equal(f.orders.get(legacy._id).expenseAmount,40);
});

test("payments, delivery and stale edits preserve the cost snapshot and independent balance", async t => {
  const f=djellabaFixture(t);f.seedSettings();const original=await create(orderInput());
  const paid=await request("POST","/"+original._id+"/payments",{amount:25.15,requestId:randomUUID(),version:0});assert.equal(paid.status,200);const value=await paid.json();assert.equal(value.remainingAmount,374.85);assert.equal(value.expenseAmount,40);assert.equal(value.profitAmount,460);
  const delivered=await request("POST","/"+original._id+"/deliver",{version:value.__v});assert.equal(delivered.status,200);const completed=await delivered.json();assert.equal(completed.expenseAmount,40);assert.equal(completed.profitAmount,460);assert.ok(completed.deliveredAt);
  assert.equal((await request("PUT","/"+original._id,editBody(original))).status,409);assert.equal(f.orders.get(original._id).paidAmount,125.15);
});

test("automatic cost snapshots reject inconsistent amounts at model validation", async t => {
  const f=djellabaFixture(t);f.seedSettings();const saved=await create(orderInput());const stored=f.orders.get(saved._id).toObject();
  for(const mutate of [row=>{row.expenseAmount=1;},row=>{row.items[0].costs.laborAmount=0;},row=>{row.items[0].costs.fabricUnitPrice=25;}]){const value=structuredClone(stored);mutate(value);await assert.rejects(new TailoringOrder(value).validate());}
});

test("automatic orders keep photos private and allow full multipart edits", async t => {
  const f=djellabaFixture(t);f.seedSettings();const body=orderInput({items:[garment({imageIndex:0})]});const saved=await create(body,{images:[png]});assert.equal(saved.items[0].hasPhoto,true);
  const before=f.orders.get(saved._id).items[0].photo;const response=await request("PUT","/"+saved._id,{...validateTailoringOrder(editBody(saved)),version:saved.__v,removeImage:false},{images:[]});assert.equal(response.status,200);assert.equal(f.orders.get(saved._id).items[0].photo,before);
  assert.equal((await request("GET","/"+saved._id+"/items/"+saved.items[0].lineId+"/photo")).status,200);
  assert.equal((await request("GET","/"+saved._id+"/items/"+saved.items[0].lineId+"/photo",undefined,{actor:stranger})).status,404);
  const files=await readdir(directory);assert.ok(files.includes(before));
});

test("settings and fabric ownership come from live accounts, while failed writes leave costs unchanged", async t => {
  const f=djellabaFixture(t);f.seedSettings();f.seedSettings({thinSfifaPrice:100,thickSfifaPrice:200,laborPrice:300},otherOwner);
  const foreign=f.seedFabric(25,otherOwner);assert.equal((await request("POST","",orderInput({items:[shopItem(foreign)]}))).status,404);
  const saved=await create(orderInput(),{actor:staffClaims});assert.equal(saved.expenseAmount,40);assert.equal(saved.createdBy,employee);assert.equal(saved.idAdmin,owner);
  f.faults.orderSave=true;const response=await request("PUT","/"+saved._id,editBody(saved,{items:[{...saved.items[0],fabricMeters:3,fabricUnitPrice:0}]}));assert.equal(response.status,500);assert.equal(f.orders.get(saved._id).__v,0);assert.equal(f.orders.get(saved._id).expenseAmount,40);
});
