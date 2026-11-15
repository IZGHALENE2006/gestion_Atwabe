import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import Fabric from '../BackEnd/models/Fabric.js';
import FabricMovement from '../BackEnd/models/FabricMovement.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';
import { matches } from './helpers/modelMemory.js';
import { generateFabricBarcode } from '../shared/fabrics.js';
import { validateFabricReductionLines, prepareFabricReductionLines } from '../shared/fabricReductions.js';

let server, base;const oldSecret=process.env.JWT_SECRET;
before(async()=>{process.env.JWT_SECRET='isolated-bulk-reductions';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port+'/fabrics';});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;});
const admin={id:owner,role:'admin'},staff={id:employee,role:'Employe',idAdmin:otherOwner};
async function request(suffix,body,actor=admin){const response=await fetch(base+suffix,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+jwt.sign(actor,process.env.JWT_SECRET)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
const query=action=>({cap:Infinity,select(){return this;},sort(){return this;},limit(cap){this.cap=cap;return this;},lean(){return this;},then(resolve,reject){return Promise.resolve().then(action).then(rows=>Array.isArray(rows)?rows.slice(0,this.cap):rows).then(resolve,reject);}});
function setup(t){const f=workerMaterialsFixture(t),archive=[];f.fabric.colors.push({name:'أحمر',number:'02',pieces:[{meters:12,barcode:generateFabricBarcode()}]});Object.assign(f.staff,{name:'موظف الإنقاص',moduleAccess:['fabrics'],operationPermissions:{fabrics:['reduce','history']}});
  t.mock.method(FabricMovement,'find',scope=>query(()=>archive.filter(row=>matches(row,scope)).map(row=>row.toObject())));
  t.mock.method(FabricMovement,'findOne',scope=>query(()=>archive.find(row=>matches(row,scope))||null));
  t.mock.method(FabricMovement,'bulkWrite',async operations=>{if(f.controls.archiveBefore){delete f.controls.archiveBefore;throw new Error('Archive unavailable');}for(const operation of operations){const value=operation.updateOne.update.$setOnInsert;if(!archive.some(row=>String(row._id)===String(value._id))){const movement=new FabricMovement(value);await movement.validate();archive.push(movement);}if(f.controls.archivePartial){delete f.controls.archivePartial;throw new Error('Partial archive acknowledgement');}}if(f.controls.archiveAfter){delete f.controls.archiveAfter;throw new Error('Lost archive acknowledgement');}return {acknowledged:true};});
  t.mock.method(Fabric,'updateOne',async(scope,update)=>{if(f.controls.trimBefore){delete f.controls.trimBefore;throw new Error('Trim unavailable');}const row=f.fabrics.find(row=>matches(row,scope));if(!row)return {modifiedCount:0};const ids=new Set(update.$pull.movements._id.$in.map(String));row.movements=row.movements.filter(row=>!ids.has(String(row._id)));return {modifiedCount:1};});
  return {...f,archive};
}
const path=f=>'/'+f.fabric._id+'/reductions';
const lines=f=>f.fabric.colors.flatMap(color=>color.pieces.map(piece=>({colorId:String(color._id),pieceId:String(piece._id),barcode:piece.barcode,meters:1.125})));
const body=f=>({requestId:randomUUID(),version:f.fabric.__v,lines:lines(f)});
const balance=f=>f.fabrics[0].colors.map(color=>color.pieces.map(piece=>piece.meters));
async function history(){const result=await request('/movements');assert.equal(result.status,200,JSON.stringify(result));return result.data.movements;}

test('one batch reduces pieces in several colors atomically and saves trusted per-piece dated history',async t=>{
  const f=setup(t),input=body(f),start=Date.now();input.createdByName='FORGED';const result=await request(path(f),input,staff);assert.equal(result.status,201,JSON.stringify(result));assert.deepEqual(balance(f),[[18.875,7.875],[10.875]]);assert.deepEqual(result.data.summary,{pieceCount:3,meters:3.375});assert.equal(result.data.movements.length,3);
  for(const row of result.data.movements){assert.equal(row.createdBy,employee);assert.equal(row.createdByName,f.staff.name);assert.equal(row.createdByRole,'Employe');assert.equal(row.sale,undefined);assert.equal(row.reductionBatch.requestId,input.requestId);assert.equal(row.reductionBatch.size,3);assert.ok(new Date(row.occurredAt).getTime()>=start);assert.equal(row.beforeMeters-row.remainingMeters,row.meters);}
  assert.equal(new Set(result.data.movements.map(row=>row.occurredAt)).size,1);assert.equal(new Set(result.data.movements.map(row=>row.requestId)).size,3);assert.equal((await history()).length,3);assert.equal(f.fabrics[0].movements.length,0);
});

test('one insufficient, stale or misplaced piece rejects every reduction without changing any stock',async t=>{
  const f=setup(t),before=JSON.stringify(f.fabrics);
  const excessive=body(f);excessive.lines[1].meters=20;assert.equal((await request(path(f),excessive)).status,409);assert.equal(JSON.stringify(f.fabrics),before);
  for(const patch of [input=>{input.lines[1].barcode=generateFabricBarcode();},input=>{input.lines[1].colorId=String(f.fabric.colors[1]._id);},input=>{input.lines[1].pieceId='9'.repeat(24);},input=>{input.version=1;}]){const input=body(f);patch(input);assert.ok([404,409].includes((await request(path(f),input)).status));assert.equal(JSON.stringify(f.fabrics),before);}
  assert.equal(f.archive.length,0);
});

test('empty lines, malformed meters, duplicates and invalid request identities are rejected',async t=>{
  const f=setup(t),before=JSON.stringify(f.fabrics);
  for(const change of [input=>{input.lines=[];},input=>{input.lines=[input.lines[0],input.lines[0]];},input=>{input.lines[0].meters=0;},input=>{input.lines[0].meters=-1;},input=>{input.lines[0].meters='0.0001';},input=>{input.lines[0].barcode='123';},input=>{input.requestId='bad';},input=>{input.version='0';},input=>{input.lines=Array(501).fill(input.lines[0]);}]){const input=body(f);change(input);assert.ok([400,409].includes((await request(path(f),input)).status));assert.equal(JSON.stringify(f.fabrics),before);}
});

test('exact retries accept a different line order, never reapply stock, and conflict with altered amounts or pieces',async t=>{
  const f=setup(t),input=body(f),first=await request(path(f),input);assert.equal(first.status,201);const after=JSON.stringify(f.fabrics);
  const retry=await request(path(f),{...input,lines:[...input.lines].reverse()});assert.equal(retry.status,200,JSON.stringify(retry));assert.deepEqual(new Set(retry.data.movements.map(row=>row._id)),new Set(first.data.movements.map(row=>row._id)));assert.equal(JSON.stringify(f.fabrics),after);
  for(const changed of [{...input,lines:input.lines.slice(0,2)},{...input,lines:input.lines.map((row,i)=>i?row:{...row,meters:2})}])assert.equal((await request(path(f),changed)).status,409);assert.equal(JSON.stringify(f.fabrics),after);
});

test('concurrent copies of one batch create exactly one reduction per piece',async t=>{
  const f=setup(t),input=body(f),results=await Promise.all([request(path(f),input),request(path(f),input)]);assert.deepEqual(results.map(row=>row.status).sort(),[200,201]);assert.deepEqual(balance(f),[[18.875,7.875],[10.875]]);assert.equal((await history()).length,3);
});

test('different concurrent batches cannot oversell through an old stock version',async t=>{
  const f=setup(t),first=body(f),second=body(f);first.lines=first.lines.slice(0,1);second.lines=second.lines.slice(0,1);first.lines[0].meters=15;second.lines[0].meters=15;const results=await Promise.all([request(path(f),first),request(path(f),second)]);assert.deepEqual(results.map(row=>row.status).sort(),[201,409]);assert.deepEqual(balance(f),[[5,9],[12]]);assert.equal((await history()).length,1);
});

for(const failure of ['before','after'])test('a '+failure+' stock-save failure preserves atomicity and exact retry behavior',async t=>{
  const f=setup(t),input=body(f);f.controls[failure==='before'?'failBefore':'failAfter']='fabric';const result=await request(path(f),input);assert.equal(result.status,500);assert.deepEqual(balance(f),failure==='before'?[[20,9],[12]]:[[18.875,7.875],[10.875]]);const retry=await request(path(f),input);assert.equal(retry.status,failure==='before'?201:200,JSON.stringify(retry));assert.deepEqual(balance(f),[[18.875,7.875],[10.875]]);assert.equal((await history()).length,3);
});

for(const key of ['archiveBefore','archivePartial','archiveAfter','trimBefore'])test(key+' leaves complete history and replay available without duplicate stock deductions',async t=>{
  const f=setup(t),input=body(f);f.controls[key]=true;const result=await request(path(f),input);assert.equal(result.status,201,JSON.stringify(result));assert.equal(f.fabrics[0].movements.length,3);assert.equal((await history()).length,3);const retry=await request(path(f),input);assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.data.movements.length,3);assert.deepEqual(balance(f),[[18.875,7.875],[10.875]]);assert.equal((await history()).length,3);
});

test('archived batches remain replayable after their fabric was deleted',async t=>{
  const f=setup(t),input=body(f);assert.equal((await request(path(f),input)).status,201);f.fabrics.splice(0,1);const retry=await request(path(f),input);assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.data.fabric,null);assert.equal(retry.data.movements.length,3);
});

test('current employee reduce permission, shop ownership and authentication control every batch',async t=>{
  const f=setup(t),foreign=f.seedFabric({idAdmin:otherOwner});assert.equal((await request('/'+foreign._id+'/reductions',body(f))).status,404);assert.equal((await request(path(f),body(f),null)).status,401);
  for(const operations of [[],['add'],['sell'],['history']]){f.staff.operationPermissions.fabrics=operations;assert.equal((await request(path(f),body(f),staff)).status,403);}
  f.staff.operationPermissions.fabrics=['reduce'];f.staff.isActive=false;assert.equal((await request(path(f),body(f),staff)).status,403);assert.deepEqual(balance(f),[[20,9],[12]]);f.staff.isActive=true;assert.equal((await request(path(f),body(f),staff)).status,201);
});

test('blank and zero UI fields are ignored, decimals are exact and every invalid or removed draft piece blocks confirmation',async t=>{
  const f=setup(t),rows=lines(f),draft={[rows[0].pieceId]:'0,125',[rows[1].pieceId]:'',[rows[2].pieceId]:'0.000'};let prepared=prepareFabricReductionLines(f.fabric,draft);assert.equal(prepared.lines.length,1);assert.equal(prepared.meters,.125);assert.deepEqual(prepared.errors,{});
  draft[rows[1].pieceId]='100';draft['9'.repeat(24)]='1';prepared=prepareFabricReductionLines(f.fabric,draft);assert.equal(prepared.errors[rows[1].pieceId],'insufficientMeters');assert.equal(prepared.errors['9'.repeat(24)],'notFound');assert.equal(prepared.lines.length,1);
  const normalized=validateFabricReductionLines([{...rows[0],colorId:rows[0].colorId.toUpperCase(),pieceId:rows[0].pieceId.toUpperCase(),meters:'0,125'}]);assert.equal(normalized[0].meters,.125);assert.equal(normalized[0].pieceId,rows[0].pieceId);
});
