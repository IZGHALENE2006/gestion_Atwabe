import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import TailoringOrder from "../BackEnd/models/TailoringOrder.js";
import { TAILORING_GARMENT_TYPES, validateTailoringOrder, tailoringOrderItems } from "../shared/tailoring.js";
import { TAILORING_MEASUREMENT_FIELDS, tailoringMeasurement, validateTailoringMeasurements } from "../shared/tailoringMeasurements.js";
import { malakiyaFixture } from "./helpers/malakiyaFixture.js";
import { owner, orderInput, garment } from "./helpers/djellabaCostsFixture.js";

let server, base;
const previousSecret = process.env.JWT_SECRET;
before(async () => { process.env.JWT_SECRET = "isolated-tailoring-measurements"; server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = "http://127.0.0.1:" + server.address().port + "/tailoring-orders"; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const allMeasurements = Object.fromEntries(TAILORING_MEASUREMENT_FIELDS.map((key, index) => [key, 25 + index + 0.5]));
const bodyFor = type => orderInput({ garmentType: type, ...(type === "shirts" || type === "trousers" ? { automaticCosting: false, expenseAmount: 50 } : {}), items: [garment({ measurements: allMeasurements, ...(type === "shirts" ? { shirtType: "قميص طويل" } : type === "trousers" ? { trouserType: "regular" } : {}) }), garment({ measurements: { shoulder: 48 }, ...(type === "shirts" ? { shirtType: "قميص قصير" } : type === "trousers" ? { trouserType: "qandrissi" } : {}) })] });
async function request(body, suffix = "", method = body === undefined ? "GET" : "POST", multipart = false) {
  const headers = { Authorization: "Bearer " + jwt.sign({ id: owner, role: "admin" }, process.env.JWT_SECRET) };
  let payload;
  if (body !== undefined) { if (multipart) { payload = new FormData(); for (const [key, value] of Object.entries(body)) payload.append(key, typeof value === "object" ? JSON.stringify(value) : String(value)); } else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); } }
  return fetch(base + suffix, { method, headers, ...(payload ? { body: payload } : {}) });
}

test("centimetres accept decimal commas and Arabic digits, rejecting malformed or implausible values", () => {
  for (const [value, expected] of [["42,75",42.75],["٤٢٫٧٥",42.75],["۴۲.۵",42.5],[1000,1000],["0.01",0.01]]) assert.equal(tailoringMeasurement(value), expected);
  for (const value of [0,-1,1000.01,"1e2","1.001",true,[],{},null,Infinity,"42cm"]) assert.equal(tailoringMeasurement(value),null);
  assert.deepEqual(validateTailoringMeasurements({ shoulder: "٤٢٫٧٥", sleeve: " ", chest: "90" }), { shoulder:42.75,chest:90 });
  assert.equal(validateTailoringMeasurements(undefined),undefined);assert.equal(validateTailoringMeasurements({}),undefined);
  for (const measurements of [null,[],true,"bad",{unexpected:5}]) assert.throws(()=>validateTailoringMeasurements(measurements),error=>error.fields.measurements === "invalidMeasurements");
});

test("optional measurements leave old payloads stable and errors target the correct piece and measurement", () => {
  const body=bodyFor("djellaba");delete body.items[0].measurements;delete body.items[1].measurements;
  const previous=validateTailoringOrder(body);assert.ok(!Object.hasOwn(previous.items[0],"measurements"));
  assert.deepEqual(validateTailoringOrder({...body,items:body.items.map(item=>({...item,measurements:{shoulder:" "}}))}),previous);
  body.items[1].measurements={sleeve:"-2",collar:"12.345"};
  assert.throws(()=>validateTailoringOrder(body),error=>error.fields["items.1.measurements.sleeve"] === "invalidMeasurement" && error.fields["items.1.measurements.collar"] === "invalidMeasurement");
});

for (const type of TAILORING_GARMENT_TYPES) test(type + ": saves each piece's measurements through multipart, retries, lists, edits and clearing", async t => {
  const f=malakiyaFixture(t);f.seedSettings();f.seedJabadorSettings();f.seedMalakiyaSettings();
  const body=bodyFor(type),response=await request(body,"","POST",true);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
  const saved=await response.json();assert.deepEqual(saved.items[0].measurements,allMeasurements);assert.deepEqual(saved.items[1].measurements,{shoulder:48});
  assert.deepEqual(f.orders.get(saved._id).items[0].measurements.toObject(),allMeasurements);
  const retry=await request(body);assert.equal(retry.status,200);assert.equal((await retry.json())._id,saved._id);assert.equal(f.orders.size,1);
  const conflict=await request({...body,items:body.items.map((item,index)=>index ? item : {...item,measurements:{chest:99}})});assert.equal(conflict.status,409);
  const list=await (await request()).json();assert.deepEqual(list.orders[0].items[0].measurements,allMeasurements);
  const edited=await request({...body,version:saved.__v,items:body.items.map((item,index)=>({...item,measurements:index ? {shoulder:""} : {...item.measurements,shoulder:"٤٥٫٢٥"}}))},"/"+saved._id,"PUT",true);assert.equal(edited.status,200);
  const updated=await edited.json();assert.equal(updated.items[0].measurements.shoulder,45.25);assert.ok(!updated.items[1].measurements);assert.equal(updated.items[0].measurements.chest,allMeasurements.chest);assert.equal(updated.totalPrice,saved.totalPrice);assert.equal(updated.paidAmount,saved.paidAmount);assert.equal(updated.expenseAmount,saved.expenseAmount);
  const invalid=await request({...body,requestId:randomUUID(),items:[{...body.items[0],measurements:{length:0}}]});assert.equal(invalid.status,400);assert.equal((await invalid.json()).fields["items.0.measurements.length"],"invalidMeasurement");assert.equal(f.orders.size,1);
});

test("single-piece legacy orders retain optional measurements when converted to item cards", async t => {
  const f=malakiyaFixture(t),source=bodyFor("djellaba"),body={...source,...source.items[0],totalPrice:500,automaticCosting:false,measurements:{length:"١٤٥٫٥",collar:18}};delete body.items;
  const response=await request(body,"","POST",true);assert.equal(response.status,201);const saved=await response.json();assert.deepEqual(saved.items[0].measurements,{length:145.5,collar:18});
  const stored=f.orders.get(saved._id);assert.deepEqual(tailoringOrderItems(stored.toObject())[0].measurements,{length:145.5,collar:18});
  stored.measurements.length=-1;await assert.rejects(stored.validate(),error=>Boolean(error.errors["measurements.length"]));
});

test("the database model rejects invalid measurements without requiring them on older records", async () => {
  const value=validateTailoringOrder(bodyFor("shirts")),document=new TailoringOrder({...value,fabricId:null,colorId:null,items:value.items.map(item=>({...item,fabricId:null,colorId:null})),idAdmin:owner,createdBy:owner,requestId:randomUUID(),requestFingerprint:"test"});
  await document.validate();document.items[1].measurements={shoulder:0};await assert.rejects(document.validate(),error=>Boolean(error.errors["items.1.measurements.shoulder"]));
  document.items[1].measurements=undefined;await document.validate();
});
