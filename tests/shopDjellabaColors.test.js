import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, employee, otherOwner } from './helpers/djellabaCostsFixture.js';
import { generateFabricBarcode } from '../shared/fabrics.js';
import { shopPieceBarcode } from '../shared/workerShopFlow.js';
import { validateWorkerWork } from '../shared/workerWork.js';
import { workerMaterialRows } from '../shared/workerMaterials.js';

let server,base;const oldSecret=process.env.JWT_SECRET;
before(async()=>{process.env.JWT_SECRET='isolated-djellaba-colors';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;});
async function request(path,body,actor={id:owner,role:'admin'},method=body===undefined?'GET':'POST'){const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+jwt.sign(actor,process.env.JWT_SECRET),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
function setup(t){const f=workerMaterialsFixture(t);f.worker.categories=['machine','finishing','mesbanto'];f.fabric.colors.push({name:'أحمر',number:'02',pieces:[{meters:8,barcode:generateFabricBarcode()}]},{name:'أخضر',number:'03',pieces:[{meters:0,barcode:generateFabricBarcode()}]});return f;}
const ids=f=>f.fabric.colors.map(color=>String(color._id));
const pathFor=f=>'/tailoring-workers/'+f.worker._id+'/work';
const bodyFor=(f,colors=ids(f).slice(0,2))=>({category:'machine',workType:'shop',garmentType:'djellaba',quantity:999,shopDjellaba:{fabricId:String(f.fabric._id),colorIds:colors,size:'XL',meters:2.5,sfifaId:String(f.sfifa._id),variantId:String(f.sfifa.variants[0]._id),unitWage:15},requestId:randomUUID()});
async function assign(f,body=bodyFor(f)){const result=await request(pathFor(f),body);assert.equal(result.status,201,JSON.stringify(result));return result.data;}
const finish=(f,work,lineIds)=>request(pathFor(f)+'/'+work._id+'/completions',{quantity:lineIds.length,lineIds,requestId:randomUUID(),version:work.__v});

test('selecting djellaba colors creates one barcoded piece per color and deducts only 3m of sfifa per piece',async t=>{
  const f=setup(t),fabricBefore=JSON.stringify(f.fabrics),body=bodyFor(f,ids(f)),work=await assign(f,body);
  assert.equal(work.quantity,3);assert.equal(work.materials.length,3);assert.equal(work.materialStatus,'ready');assert.equal(f.stocks[0].quantity,11);assert.equal(f.stocks[0].variants[0].quantity,11);assert.equal(JSON.stringify(f.fabrics),fabricBefore);
  assert.deepEqual(work.materials.map(row=>row.colorId),ids(f).sort());assert.ok(work.materials.every(row=>row.fabricStockDeducted===false&&row.sfifaMeters===3&&row.meters===2.5&&row.size==='XL'&&row.unitWage===15&&row.pieceId===undefined));
  assert.equal(new Set([1,2,3].map(number=>shopPieceBarcode(work,number))).size,3);assert.equal((await request(pathFor(f),body)).status,200);assert.equal(f.stocks[0].quantity,11);assert.equal(JSON.stringify(f.fabrics),fabricBefore);
  const changed=await request(pathFor(f),{...body,shopDjellaba:{...body.shopDjellaba,colorIds:ids(f).slice(0,2)}});assert.equal(changed.status,409);
});

test('fabric metres are optional and even a zero-stock color can be assigned without cloth writes',async t=>{
  const f=setup(t),body=bodyFor(f,[ids(f)[2]]);delete body.shopDjellaba.meters;const fabricBefore=JSON.stringify(f.fabrics);
  const work=await assign(f,body);assert.equal(work.materials[0].meters,0);assert.equal(work.shopDjellaba.meters,0);assert.equal(JSON.stringify(f.fabrics),fabricBefore);assert.equal(f.stocks[0].quantity,17);
});

test('invalid, duplicate and foreign colors and mismatched sections never create work or consume stock',async t=>{
  const f=setup(t),before=JSON.stringify(f.fabrics);
  for(const [key,value] of [['colorIds',[]],['colorIds',[ids(f)[0],ids(f)[0]]],['fabricId','bad'],['variantId','bad'],['unitWage',-1],['size','4XL'],['meters','2.0001'],['sfifaStyle','bad'],['modelNumber',0],['modelNumber',6],['modelNumber',1.5],['modelNumber',[1]]]){const body=bodyFor(f);body.shopDjellaba[key]=value;const result=await request(pathFor(f),body);assert.equal(result.status,400,JSON.stringify(result));assert.ok(result.data.fields['shopDjellaba.'+key]);}
  const foreign=f.seedFabric({idAdmin:otherOwner});let body=bodyFor(f);body.shopDjellaba.fabricId=String(foreign._id);body.shopDjellaba.colorIds=[String(foreign.colors[0]._id)];assert.equal((await request(pathFor(f),body)).status,409);
  for(const patch of [{category:'trousers'},{workType:'client'},{garmentType:'jabador'},{garmentType:'malakiya'}]) assert.throws(()=>validateWorkerWork({...bodyFor(f),...patch}),error=>error.fields.shopDjellaba==='invalidMaterialSection');
  assert.equal(f.records.length,0);assert.equal(f.stocks[0].quantity,20);assert.equal(JSON.stringify(f.fabrics.slice(0,1)),before);
});

test('insufficient sfifa rejects the entire color batch while cloth stays unchanged',async t=>{
  const f=setup(t);f.stocks[0].quantity=5;f.stocks[0].variants[0].quantity=5;const before=JSON.stringify(f.fabrics),result=await request(pathFor(f),bodyFor(f));assert.equal(result.status,409);assert.equal(result.data.message,'insufficientSfifa');assert.equal(f.records.length,0);assert.equal(f.stocks[0].quantity,5);assert.equal(JSON.stringify(f.fabrics),before);
});

for(const failure of ['before','after','conflict']) test('sfifa '+failure+' failure recovers without duplicate deductions or fabric changes',async t=>{
  const f=setup(t),body=bodyFor(f),before=JSON.stringify(f.fabrics);f.controls[failure==='before'?'failBefore':failure==='after'?'failAfter':'conflictOnce']='sfifa';const result=await request(pathFor(f),body);assert.equal(result.status,failure==='conflict'?201:503,JSON.stringify(result));const retry=await request(pathFor(f),body);assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.data.materialStatus,'ready');assert.equal(f.stocks[0].quantity,14);assert.equal(f.stocks[0].workerMaterialDebits.length,1);assert.equal(JSON.stringify(f.fabrics),before);
});

test('completion selects exact djellaba colors and earns only their per-piece wages',async t=>{
  const f=setup(t),work=await assign(f,bodyFor(f,ids(f))),before=JSON.stringify(f.fabrics),selected=[ids(f)[0],ids(f)[2]],done=await finish(f,work,selected);assert.equal(done.status,201,JSON.stringify(done));assert.equal(done.data.completedQuantity,2);assert.equal(done.data.completions[0].earningAmount,30);assert.deepEqual(done.data.completions[0].lineIds,selected.sort());assert.equal(f.stocks[0].quantity,11);assert.equal(JSON.stringify(f.fabrics),before);
  assert.equal((await finish(f,done.data,[selected[0]])).status,400);const last=await finish(f,done.data,[ids(f)[1]]);assert.equal(last.status,201);assert.equal(last.data.completedQuantity,3);assert.equal(last.data.completions[1].earningAmount,15);
});

test('increases add fresh colors with 3m sfifa each and preserve original per-piece barcodes and wages',async t=>{
  const f=setup(t),work=await assign(f),before=JSON.stringify(f.fabrics),barcode=shopPieceBarcode(work,1),body={shopDjellaba:{colorIds:[ids(f)[2]],unitWage:20,fabricId:'9'.repeat(24),meters:999},requestId:randomUUID(),version:work.__v};
  const result=await request(pathFor(f)+'/'+work._id+'/increases',body);assert.equal(result.status,201,JSON.stringify(result));assert.equal(result.data.quantity,3);assert.equal(result.data.materials[2].unitWage,20);assert.equal(result.data.materials[2].meters,2.5);assert.equal(result.data.shopDjellaba.colorIds.length,3);assert.equal(shopPieceBarcode(result.data,1),barcode);assert.equal(f.stocks[0].quantity,11);assert.equal(JSON.stringify(f.fabrics),before);
  assert.equal((await request(pathFor(f)+'/'+work._id+'/increases',body)).status,200);assert.equal((await request(pathFor(f)+'/'+work._id+'/increases',{...body,shopDjellaba:{...body.shopDjellaba,colorIds:[ids(f)[0]]}})).status,409);
  const done=await finish(f,result.data,ids(f));assert.equal(done.status,201);assert.equal(done.data.completions[0].earningAmount,50);
});

test('cancelling partial work returns sfifa once and preserves wages without increasing cloth stock',async t=>{
  const f=setup(t),before=JSON.stringify(f.fabrics),work=await assign(f),done=await finish(f,work,[ids(f)[0]]),body={version:done.data.__v,requestId:randomUUID()},path=pathFor(f)+'/'+work._id+'/cancel';assert.equal(done.status,201);
  f.controls.failAfter='sfifa';assert.equal((await request(path,body)).status,503);const retry=await request(path,body);assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.data.cancelled,true);assert.equal(f.stocks[0].quantity,20);assert.equal(f.records[0].completions[0].earningAmount,15);assert.equal(JSON.stringify(f.fabrics),before);assert.equal((await request(path,body)).status,200);assert.equal(f.stocks[0].quantity,20);
});

test('sfifa style validation uses the selected style balance and the stock journal can roll back a failed addition',async t=>{
  const f=setup(t);f.sfifa.receipts.push({requestId:randomUUID(),quantity:20,code:12,styleMeters:{single:20,double:0,gradient:0},createdBy:owner,date:new Date()});let body=bodyFor(f);assert.equal((await request(pathFor(f),body)).status,400);body.shopDjellaba.sfifaStyle='single';const work=await assign(f,body);
  f.controls.afterWorkSave=()=>{f.stocks[0].quantity=0;f.stocks[0].variants[0].quantity=0;f.stocks[0].variants[0].styleMeters.single=0;};
  const result=await request(pathFor(f)+'/'+work._id+'/increases',{shopDjellaba:{colorIds:[ids(f)[2]],unitWage:15},version:work.__v,requestId:randomUUID()});assert.equal(result.status,409,JSON.stringify(result));assert.equal(f.records[0].quantity,2);assert.equal(f.records[0].shopDjellaba.colorIds.length,2);assert.equal(f.records[0].materialOperations.at(-1).state,'failed');
});

test('finishing and laundry retain selected color snapshots, piece barcodes, and the no-cloth-debit flag',async t=>{
  const f=setup(t),before=JSON.stringify(f.fabrics),machine=await assign(f),completed=await finish(f,machine,ids(f).slice(0,2));assert.equal(completed.status,201);
  let result=await request(pathFor(f),{category:'finishing',workType:'shop',garmentType:'djellaba',shopOriginId:machine._id,unitWage:5,requestId:randomUUID()});assert.equal(result.status,201,JSON.stringify(result));const finishing=result.data;assert.ok(finishing.shopFlow.materials.every(row=>row.fabricStockDeducted===false));assert.equal(shopPieceBarcode(finishing,1),shopPieceBarcode(machine,1));
  result=await request(pathFor(f)+'/'+finishing._id+'/completions',{quantity:2,lineIds:finishing.shopFlow.lineIds,version:finishing.__v,requestId:randomUUID()});assert.equal(result.status,201);
  result=await request(pathFor(f),{category:'mesbanto',workType:'shop',garmentType:'djellaba',shopOriginId:machine._id,unitWage:3,requestId:randomUUID()});assert.equal(result.status,201,JSON.stringify(result));assert.ok(result.data.shopFlow.materials.every(row=>row.fabricStockDeducted===false));assert.equal(f.stocks[0].quantity,14);assert.equal(JSON.stringify(f.fabrics),before);
});

test('employee responses preserve color selection without exposing stored wages',async t=>{
  const f=setup(t);Object.assign(f.staff,{moduleAccess:['workers'],operationPermissions:{workers:['assign','details','increase','complete']}});const work=await assign(f),result=await request(pathFor(f)+'?category=machine',undefined,{id:employee,role:'Employe'});assert.equal(result.status,200);const row=result.data.works.find(row=>row._id===work._id);assert.equal(row.shopDjellaba.unitWage,undefined);assert.equal(row.pieceCompletion,true);assert.ok(row.materials.every(row=>row.unitWage===undefined));assert.equal(row.shopDjellaba.colorIds.length,2);
});

test('model guards prevent reference-only fabric flags outside color-based djellaba work',async t=>{
  const f=setup(t);await assign(f);const source=f.records[0].toObject();await new WorkerWork(source).validate();
  for(const modify of [row=>{row.shopDjellaba=undefined;},row=>{row.garmentType='jabador';},row=>{row.materialOperations[0].rows[0].fabricStockDeducted=undefined;},row=>{row.shopDjellaba.colorIds.pop();},row=>{row.materialOperations[0].rows[0].colorId='9'.repeat(24);}]){const input=JSON.parse(JSON.stringify(source));modify(input);await assert.rejects(new WorkerWork(input).validate());}
  assert.equal(workerMaterialRows(f.records[0]).length,2);
});

test('the selected djellaba number survives saving, editing, additions, completion and the finishing stage',async t=>{
  const f=setup(t),body=bodyFor(f);body.shopDjellaba.modelNumber='3';const work=await assign(f,body);
  assert.equal(work.shopDjellaba.modelNumber,3);assert.ok(work.materials.every(row=>row.modelNumber===3));
  const list=await request(pathFor(f)+'?category=machine');assert.equal(list.data.works[0].shopDjellaba.modelNumber,3);
  const edited=await request(pathFor(f)+'/'+work._id,{...body,shopDjellaba:{...body.shopDjellaba,modelNumber:5},version:work.__v,requestId:randomUUID()},{id:owner,role:'admin'},'PUT');
  assert.equal(edited.status,200,JSON.stringify(edited.data));assert.equal(edited.data.shopDjellaba.modelNumber,5);assert.ok(edited.data.materials.every(row=>row.modelNumber===5));assert.equal(edited.data.edits[0].beforeSnapshot.shopDjellaba.modelNumber,3);assert.equal(edited.data.edits[0].afterSnapshot.shopDjellaba.modelNumber,5);
  const more=await request(pathFor(f)+'/'+work._id+'/increases',{shopDjellaba:{colorIds:[ids(f)[2]],unitWage:20,modelNumber:1},version:edited.data.__v,requestId:randomUUID()});assert.equal(more.status,201,JSON.stringify(more.data));assert.ok(more.data.materials.every(row=>row.modelNumber===5));
  const done=await finish(f,more.data,ids(f));assert.equal(done.status,201,JSON.stringify(done.data));assert.equal(done.data.completions[0].earningAmount,50);assert.equal(f.stocks[0].quantity,11);
  const finishing=await request(pathFor(f),{category:'finishing',workType:'shop',garmentType:'djellaba',shopOriginId:work._id,unitWage:5,requestId:randomUUID()});assert.equal(finishing.status,201,JSON.stringify(finishing.data));assert.ok(finishing.data.shopFlow.materials.every(row=>row.modelNumber===5));
  const document=JSON.parse(JSON.stringify(f.records[0]));document.shopDjellaba.modelNumber=6;await assert.rejects(new WorkerWork(document).validate());
});
