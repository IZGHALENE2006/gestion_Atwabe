import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import TailoringOrder from '../BackEnd/models/TailoringOrder.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';
import {malakiyaFixture} from './helpers/malakiyaFixture.js';
import {workerMaterialsFixture} from './helpers/workerMaterialsFixture.js';
import {owner,orderInput,garment} from './helpers/djellabaCostsFixture.js';
import {TAILORING_GARMENT_TYPES,validateTailoringOrder,tailoringOrderItems} from '../shared/tailoring.js';
import {validateTailoringMeasurementNotes,TAILORING_MEASUREMENT_NOTES_LIMIT} from '../shared/tailoringMeasurements.js';
import {WORKER_GARMENT_SIZES,workerMaterialInputKey,workerMaterialRows} from '../shared/workerMaterials.js';
import {validateWorkerWork} from '../shared/workerWork.js';
import {tailoringMeasurementText} from '../src/composent/Fesla/tailoringMeasurementText.js';

const actor={id:owner,role:'admin'},notes='الكتف: ٤٢ سم\nالكم: 60 cm\nالطول: ١٤٥\nملاحظة: كم واسع';
let server,base;const oldSecret=process.env.JWT_SECRET;
before(async()=>{process.env.JWT_SECRET='isolated-notes-sizes';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;});
async function request(path,body,method=body?'POST':'GET',multipart=false){
  const headers={Authorization:`Bearer ${jwt.sign(actor,process.env.JWT_SECRET)}`};let payload;
  if(body){if(multipart){payload=new FormData();for(const [key,value] of Object.entries(body))payload.append(key,typeof value==='object'?JSON.stringify(value):String(value));}else{headers['Content-Type']='application/json';payload=JSON.stringify(body);}}
  const response=await fetch(base+path,{method,headers,...(payload?{body:payload}:{})});return {status:response.status,data:await response.json()};
}
const bodyFor=type=>orderInput({garmentType:type,...(['shirts','trousers'].includes(type)?{automaticCosting:false,expenseAmount:50}:{}),items:[garment({measurementNotes:notes,shirtType:'قميص عادي',trouserType:'regular'}),garment({measurementNotes:'قياسات القطعة الثانية',shirtType:'قميص طويل',trouserType:'qandrissi'})]});

test('free text keeps multiline Arabic measurements, normalizes line endings and rejects invalid values',()=>{
  assert.equal(validateTailoringMeasurementNotes('  '+notes.replaceAll('\n','\r\n')+'  '),notes);assert.equal(validateTailoringMeasurementNotes(' \n '),undefined);assert.equal(validateTailoringMeasurementNotes(undefined),undefined);
  assert.equal(validateTailoringMeasurementNotes('x'.repeat(TAILORING_MEASUREMENT_NOTES_LIMIT)).length,4000);
  for(const value of [null,42,{},[],true,'x'.repeat(4001),'hidden\u0000text'])assert.throws(()=>validateTailoringMeasurementNotes(value),error=>error.fields.measurementNotes==='invalidMeasurementNotes');
  const body=bodyFor('shirts');body.items[1].measurementNotes={shoulder:42};assert.throws(()=>validateTailoringOrder(body),error=>error.fields['items.1.measurementNotes']==='invalidMeasurementNotes');
});

for(const type of TAILORING_GARMENT_TYPES)test(type+': text measurements survive multipart, retries, editing, listing and clearing independently per piece',async t=>{
  const f=malakiyaFixture(t);f.seedSettings();f.seedJabadorSettings();f.seedMalakiyaSettings();const body=bodyFor(type);
  const result=await request('/tailoring-orders',body,'POST',true);assert.equal(result.status,201,JSON.stringify(result));const saved=result.data;
  assert.equal(saved.items[0].measurementNotes,notes);assert.equal(saved.items[1].measurementNotes,'قياسات القطعة الثانية');assert.equal(f.orders.get(saved._id).items[0].measurementNotes,notes);
  assert.equal(JSON.stringify(saved.customerReceipt).includes('كم واسع'),false);
  const retry=await request('/tailoring-orders',{...body,items:body.items.map(item=>({...item,measurementNotes:item.measurementNotes.replaceAll('\n','\r\n')}))});assert.equal(retry.status,200);assert.equal(f.orders.size,1);
  assert.equal((await request('/tailoring-orders',{...body,items:body.items.map((item,index)=>index?item:{...item,measurementNotes:'مختلف'})})).status,409);
  const listing=await request('/tailoring-orders');assert.equal(listing.data.orders[0].items[0].measurementNotes,notes);
  const edited=await request('/tailoring-orders/'+saved._id,{...body,version:saved.__v,items:body.items.map((item,index)=>({...item,measurementNotes:index?' ':'مقاسات معدلة\nالطول: 150'}))},'PUT',true);assert.equal(edited.status,200,JSON.stringify(edited));
  assert.equal(edited.data.items[0].measurementNotes,'مقاسات معدلة\nالطول: 150');assert.equal(edited.data.items[1].measurementNotes,undefined);assert.equal(edited.data.totalPrice,saved.totalPrice);assert.equal(edited.data.expenseAmount,saved.expenseAmount);assert.equal(edited.data.paidAmount,saved.paidAmount);
});

test('old numeric measurements remain readable and move to free text when edited or cleared',async t=>{
  const f=malakiyaFixture(t),body=bodyFor('shirts');body.items=body.items.slice(0,1).map(item=>({...item,measurementNotes:undefined,measurements:{shoulder:42,length:145.5}}));
  const saved=await request('/tailoring-orders',body);assert.equal(saved.status,201);assert.deepEqual(saved.data.items[0].measurements,{shoulder:42,length:145.5});
  const text=tailoringMeasurementText(saved.data.items[0],key=>({'fesla.measurements.fields.shoulder':'الكتف','fesla.measurements.fields.length':'الطول'})[key]);assert.equal(text,'الكتف: 42\nالطول: 145.5');
  const changed=await request('/tailoring-orders/'+saved.data._id,{...body,version:saved.data.__v,items:body.items.map(item=>({...item,measurementNotes:text+'\nالكم: 60'}))},'PUT');assert.equal(changed.status,200);assert.equal(changed.data.items[0].measurements,undefined);assert.equal(changed.data.items[0].measurementNotes,text+'\nالكم: 60');
  const cleared=await request('/tailoring-orders/'+saved.data._id,{...body,version:changed.data.__v,items:body.items.map(item=>({...item,measurementNotes:''}))},'PUT');assert.equal(cleared.status,200);assert.equal(cleared.data.items[0].measurements,undefined);assert.equal(cleared.data.items[0].measurementNotes,undefined);
  assert.equal(tailoringMeasurementText({measurementNotes:'',measurements:{shoulder:42}},key=>key),'');
  const single=validateTailoringOrder({...body,...body.items[0],totalPrice:500,items:undefined,measurementNotes:notes});assert.equal(tailoringOrderItems(single)[0].measurementNotes,notes);
  const document=f.orders.get(saved.data._id);document.items[0].measurementNotes='x'.repeat(4001);await assert.rejects(document.validate());
  await assert.rejects(new TailoringOrder({...document.toObject(),measurementNotes:'bad\u0000text'}).validate());
});

const lineId=()=>randomUUID().replaceAll('-','').slice(0,24);
const pathFor=f=>`/tailoring-workers/${f.worker._id}/work`;
const job=(f,garmentType='djellaba')=>({category:'machine',workType:'shop',garmentType,productName:'عمل المحل',quantity:6,materials:WORKER_GARMENT_SIZES.map(size=>({...f.selection(lineId(),1),size,unitWage:5})),requestId:randomUUID()});
for(const garmentType of ['djellaba','jabador','malakiya'])test(garmentType+': shop-piece sizes persist through assignment, completion, listing and cancellation without changing material accounting',async t=>{
  const f=workerMaterialsFixture(t),body=job(f,garmentType),result=await request(pathFor(f),body);assert.equal(result.status,201,JSON.stringify(result));const work=result.data;
  assert.deepEqual(work.materials.map(row=>row.size),WORKER_GARMENT_SIZES);assert.equal(f.fabrics[0].colors[0].pieces[0].meters,14);assert.equal(f.stocks[0].quantity,2);
  assert.equal((await request(pathFor(f),body)).status,200);assert.equal((await request(pathFor(f),{...body,materials:body.materials.map((row,index)=>index?row:{...row,size:'XL'})})).status,409);
  const listed=await request(pathFor(f)+'?category=machine');assert.deepEqual(listed.data.works[0].materials.map(row=>row.size),WORKER_GARMENT_SIZES);
  const done=await request(pathFor(f)+`/${work._id}/completions`,{quantity:1,lineIds:[work.materials[5].lineId],version:work.__v,requestId:randomUUID()});assert.equal(done.status,201);assert.equal(done.data.completions[0].earningAmount,5);assert.equal(done.data.materials[5].size,'3XL');
  const cancel=await request(pathFor(f)+`/${work._id}/cancel`,{version:done.data.__v,requestId:randomUUID()});assert.equal(cancel.status,200);assert.equal(f.fabrics[0].colors[0].pieces[0].meters,20);assert.equal(f.stocks[0].quantity,20);assert.deepEqual(workerMaterialRows(f.records[0]).map(row=>row.size),WORKER_GARMENT_SIZES);
  assert.equal((await request(`/tailoring-workers/${f.worker._id}/payroll`)).data.totals.earned,5);
});

test('sizes validate on the exact piece, new pieces have independent sizes and replay conflicts include size',async t=>{
  const f=workerMaterialsFixture(t),body=job(f);body.quantity=1;body.materials=body.materials.slice(0,1);body.materials[0].size=' xl ';
  const result=await request(pathFor(f),body);assert.equal(result.status,201);assert.equal(result.data.materials[0].size,'XL');
  const invalid=job(f);invalid.materials[2].size='XXXL';assert.throws(()=>validateWorkerWork(invalid),error=>error.fields['materials.2.size']==='invalidSize');
  const missing=job(f);missing.materials.forEach(row=>delete row.size);assert.equal(validateWorkerWork(missing).materials[0].size,undefined);
  assert.notEqual(workerMaterialInputKey(result.data.materials),workerMaterialInputKey(result.data.materials.map(row=>({...row,size:'M'}))));
  const increase={quantity:1,materials:[{...f.selection(lineId(),1),size:'M',unitWage:8}],version:result.data.__v,requestId:randomUUID()};
  const added=await request(pathFor(f)+`/${result.data._id}/increases`,increase);assert.equal(added.status,201);assert.deepEqual(added.data.materials.map(row=>row.size),['XL','M']);
  assert.equal((await request(pathFor(f)+`/${result.data._id}/increases`,increase)).status,200);assert.equal((await request(pathFor(f)+`/${result.data._id}/increases`,{...increase,materials:increase.materials.map(row=>({...row,size:'L'}))})).status,409);
  const model=new WorkerWork(f.records[0].toObject());model.materialOperations[0].rows[0].size='invalid';await assert.rejects(model.validate());
});
