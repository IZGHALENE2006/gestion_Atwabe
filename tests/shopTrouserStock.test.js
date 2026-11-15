import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';
import { protectWorkerMaterialDeletion } from '../BackEnd/utils/workerMaterials.js';
import { generateFabricBarcode } from '../shared/fabrics.js';
import { availableTrouserColors } from '../shared/workerShopTrousers.js';
import { workerCompletionEarning } from '../shared/workerPayroll.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner } from './helpers/djellabaCostsFixture.js';

let server, base;const oldSecret=process.env.JWT_SECRET;
before(async()=>{process.env.JWT_SECRET='isolated-trouser-stock';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;});
async function request(path,body,method='POST') {const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+jwt.sign({id:owner,role:'admin'},process.env.JWT_SECRET),'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
const workPath=f=>'/tailoring-workers/'+f.worker._id+'/work';
function setup(t) {const f=workerMaterialsFixture(t);f.worker.categories=['trousers'];f.fabric.colors.push({name:'أحمر',number:'02',pieces:[{meters:12,barcode:generateFabricBarcode()}]},{name:'أخضر',number:'03',pieces:[{meters:10,barcode:generateFabricBarcode()}]});return f;}
const ids=f=>f.fabric.colors.map(color=>String(color._id));
const bodyFor=(f,selected=ids(f).slice(0,2),meters=2.5)=>({category:'trousers',workType:'shop',trouserType:'regular',shopTrouser:{fabricId:String(f.fabric._id),length:90,size:'L',metersPerPiece:meters,colorIds:selected},quantity:100,unitWage:12,requestId:randomUUID()});
const balances=f=>f.fabrics[0].colors.map(color=>color.pieces.reduce((sum,piece)=>sum+Math.round(piece.meters*1000),0)/1000);
async function assign(f,body=bodyFor(f)) {const result=await request(workPath(f),body);assert.equal(result.status,201,JSON.stringify(result));return result.data;}
const complete=(f,work,colorIds,extra={})=>request(workPath(f)+'/'+work._id+'/completions',{quantity:colorIds.length,colorIds,version:work.__v,requestId:randomUUID(),...extra});

test('the same metres are deducted from each chosen color once, with an immutable stock journal and exact retries',async t=>{
  const f=setup(t),body=bodyFor(f,ids(f),2.125),sfifaBefore=JSON.stringify(f.stocks),work=await assign(f,body);
  assert.equal(work.quantity,3);assert.equal(work.shopTrouser.metersPerPiece,2.125);assert.equal(work.materialStatus,'ready');assert.deepEqual(balances(f),[26.875,9.875,7.875]);
  assert.equal(f.records[0].trouserStockOperations[0].state,'committed');assert.equal(f.fabrics[0].workerMaterialDebits.length,1);assert.equal(JSON.stringify(f.stocks),sfifaBefore);
  const retry=await request(workPath(f),body);assert.equal(retry.status,200);assert.deepEqual(balances(f),[26.875,9.875,7.875]);
  const changed=await request(workPath(f),{...body,shopTrouser:{...body.shopTrouser,metersPerPiece:3}});assert.equal(changed.status,409);
  assert.equal(work.trouserStockOperations,undefined);await new WorkerWork(f.records[0].toObject()).validate();
});

test('a single color can consume several rolls and exact fractional metres are preserved',async t=>{
  const f=setup(t);f.fabric.colors[0].pieces[0].meters=1;
  await assign(f,bodyFor(f,[ids(f)[0]],2.125));assert.deepEqual(f.fabrics[0].colors[0].pieces.map(piece=>piece.meters),[0,7.875]);
  const rows=f.records[0].trouserStockOperations[0].rows;assert.deepEqual(rows.map(row=>row.meters),[1,1.125]);assert.deepEqual(balances(f),[7.875,12,10]);
});

test('invalid metre inputs and insufficient colors reject the entire assignment without deducting other colors',async t=>{
  const f=setup(t);
  for(const meters of ['',0,-1,null,true,{},'2.0001',1000001]) {const result=await request(workPath(f),bodyFor(f,ids(f),meters));assert.equal(result.status,400,JSON.stringify(result));assert.equal(result.data.fields['shopTrouser.metersPerPiece'],'invalidMeters');}
  const result=await request(workPath(f),bodyFor(f,ids(f),11));assert.equal(result.status,409);assert.equal(result.data.message,'insufficientFabric');assert.deepEqual(balances(f),[29,12,10]);assert.equal(f.records.length,0);
  const noColors=bodyFor(f);delete noColors.shopTrouser.length;delete noColors.shopTrouser.colorIds;assert.equal((await request(workPath(f),noColors)).status,400);assert.equal(f.records.length,0);
});

for(const failure of ['before','after','conflict']) test('a '+failure+' fabric save failure cannot duplicate a trouser stock deduction',async t=>{
  const f=setup(t),body=bodyFor(f);f.controls[failure==='before'?'failBefore':failure==='after'?'failAfter':'conflictOnce']='fabric';
  const first=await request(workPath(f),body);assert.equal(first.status,failure==='conflict'?201:503,JSON.stringify(first));
  const retry=await request(workPath(f),body);assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.data.materialStatus,'ready');assert.deepEqual(balances(f),[26.5,9.5,10]);assert.equal(f.records.length,1);assert.equal(f.fabrics[0].workerMaterialDebits.length,1);
});

test('stock removed after planning safely fails the journal and never leaves a half-assigned work',async t=>{
  const f=setup(t);f.controls.afterCreate=()=>{for(const piece of f.fabrics[0].colors[1].pieces)piece.meters=0;};
  const result=await request(workPath(f),bodyFor(f));assert.equal(result.status,409,JSON.stringify(result));assert.equal(result.data.message,'insufficientFabric');assert.ok(f.records[0].deletedAt);assert.equal(f.records[0].trouserStockOperations[0].state,'failed');assert.deepEqual(balances(f),[29,0,10]);assert.equal(f.fabrics[0].workerMaterialDebits?.length||0,0);
});

test('completion records the exact returned colors, prevents duplicates, and pays only for the selected pieces',async t=>{
  const f=setup(t),work=await assign(f,bodyFor(f,ids(f))),selected=[ids(f)[0],ids(f)[2]],before=balances(f);
  const result=await complete(f,work,selected);assert.equal(result.status,201,JSON.stringify(result));assert.equal(result.data.completedQuantity,2);assert.equal(result.data.remainingQuantity,1);assert.equal(result.data.completions[0].earningAmount,24);assert.deepEqual(result.data.completions[0].shopTrouserColorIds,[...selected].sort());assert.deepEqual(availableTrouserColors(result.data).map(color=>color.colorId),[ids(f)[1]]);assert.deepEqual(balances(f),before);
  const retryBody={quantity:2,colorIds:selected,version:work.__v,requestId:f.records[0].completions[0].requestId};assert.equal((await request(workPath(f)+'/'+work._id+'/completions',retryBody)).status,200);
  assert.equal((await request(workPath(f)+'/'+work._id+'/completions',{...retryBody,colorIds:ids(f).slice(0,2)})).status,409);
  for(const colors of [[selected[0]],[],[ids(f)[1],ids(f)[1]],['9'.repeat(24)]]) {const invalid=await complete(f,result.data,colors);assert.equal(invalid.status,400,JSON.stringify(invalid));}
  const last=await complete(f,result.data,[ids(f)[1]]);assert.equal(last.status,201);assert.equal(last.data.completedQuantity,3);assert.equal(last.data.completions[1].earningAmount,12);assert.deepEqual(balances(f),before);
  const cancelled=await request(workPath(f)+'/'+work._id+'/cancel',{version:last.data.__v,requestId:randomUUID()});assert.equal(cancelled.status,409);assert.equal(cancelled.data.message,'cannotCancelCompleted');assert.deepEqual(balances(f),before);
});

test('increases use the stored common metre amount and recover without adding the same color twice',async t=>{
  const f=setup(t),work=await assign(f),path=workPath(f)+'/'+work._id+'/increases',body={shopTrouser:{colorIds:[ids(f)[2]],metersPerPiece:999},quantity:99,version:work.__v,requestId:randomUUID()};
  f.controls.failAfter='fabric';assert.equal((await request(path,body)).status,503);
  const retry=await request(path,body);assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.data.quantity,3);assert.equal(retry.data.shopTrouser.metersPerPiece,2.5);assert.deepEqual(balances(f),[26.5,9.5,7.5]);assert.equal(f.records[0].additions.length,1);assert.equal(f.fabrics[0].workerMaterialDebits.length,2);
});

test('cancelling partial trouser work returns all assigned cloth once and preserves the completion wages',async t=>{
  const f=setup(t),work=await assign(f),done=await complete(f,work,[ids(f)[0]]);assert.equal(done.status,201);
  const path=workPath(f)+'/'+work._id+'/cancel',body={version:done.data.__v,requestId:randomUUID()};f.controls.failAfter='fabric';assert.equal((await request(path,body)).status,503);
  const retry=await request(path,body);assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.data.cancelled,true);assert.deepEqual(balances(f),[29,12,10]);assert.equal(f.records[0].completions[0].earningAmount,12);
  assert.equal((await request(path,body)).status,200);assert.deepEqual(balances(f),[29,12,10]);
});

test('deleting an unfinished stocked trouser work uses the same guarded return path and protects active rolls',async t=>{
  const f=setup(t),work=await assign(f),piece=String(f.fabric.colors[0].pieces[0]._id);
  await assert.rejects(protectWorkerMaterialDeletion(f.fabrics[0],new Set([piece]),'fabric'),error=>error.message==='workerMaterialsInUse');
  const removed=await request(workPath(f)+'/'+work._id,{version:work.__v,requestId:randomUUID()},'DELETE');assert.equal(removed.status,200);assert.equal(removed.data.cancelled,true);assert.deepEqual(balances(f),[29,12,10]);await protectWorkerMaterialDeletion(f.fabrics[0],new Set([piece]),'fabric');
});

test('a legacy numeric completion remains unassigned to a color and later explicit colors stay exact',async t=>{
  const f=setup(t),body=bodyFor(f,ids(f));delete body.shopTrouser.metersPerPiece;const work=await assign(f,body),stored=f.records[0],date=new Date();stored.completedQuantity=1;stored.completions.push({requestId:randomUUID(),quantity:1,before:3,after:2,date,createdBy:owner,sequence:1,...workerCompletionEarning({...work,completedQuantity:0},1,date)});await stored.save();
  assert.equal(stored.completions[0].shopTrouserColorIds,undefined);assert.equal(availableTrouserColors(stored).length,3);
  const finished=await complete(f,{...work,__v:stored.__v},[ids(f)[2]]);assert.equal(finished.status,201,JSON.stringify(finished));assert.deepEqual(finished.data.completions[1].shopTrouserColorIds,[ids(f)[2]]);assert.equal(finished.data.completedQuantity,2);assert.deepEqual(balances(f),[29,12,10]);
});

test('the model rejects forged color completions and metre journals',async t=>{
  const f=setup(t);await assign(f);const source=f.records[0].toObject();
  await new WorkerWork(JSON.parse(JSON.stringify(source))).validate();
  for(const edit of [row=>{row.shopTrouser.metersPerPiece=0;},row=>{row.shopTrouser.metersPerPiece=3;},row=>{row.trouserStockOperations=[];},row=>{row.trouserStockOperations[0].rows[0].colorId='9'.repeat(24);},row=>{row.trouserStockOperations[0].rows.push(row.trouserStockOperations[0].rows[0]);}]) {const value=JSON.parse(JSON.stringify(source));edit(value);await assert.rejects(new WorkerWork(value).validate());}
});
