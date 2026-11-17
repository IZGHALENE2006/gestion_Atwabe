import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, employee, otherOwner } from './helpers/djellabaCostsFixture.js';
import { generateFabricBarcode } from '../shared/fabrics.js';
import { employeeCanRequest } from '../shared/employeePermissions.js';
process.env.JWT_SECRET='isolated-work-edits';
const {default:app}=await import('../BackEnd/app.js');
let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
const request=async(url,body,method=body?'POST':'GET',role='admin',id=owner)=>{const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+jwt.sign({id,role},process.env.JWT_SECRET),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};};
const path=f=>'/tailoring-workers/'+f.worker._id+'/work';
function setup(t){const f=workerMaterialsFixture(t);f.fabric.colors.push({name:'أحمر',number:'02',pieces:[{meters:20,barcode:generateFabricBarcode()}]});return f;}
const sfifaBody=(f,patch={})=>({category:'sfifa',workType:'shop',quantity:12,sfifa:{width:'thin',family:'01-30',code:12},unitWage:3,requestId:randomUUID(),...patch});
const batchBody=(f,patch={})=>({category:'machine',workType:'shop',garmentType:'djellaba',shopDjellaba:{fabricId:String(f.fabric._id),colorIds:f.fabric.colors.map(c=>String(c._id)),sfifaId:String(f.sfifa._id),variantId:String(f.sfifa.variants[0]._id),size:'L',meters:2,unitWage:10,...patch},requestId:randomUUID()});
async function assign(f,body){const r=await request(path(f),body);assert.equal(r.status,201,JSON.stringify(r.data));return r.data;}
const edit=(f,work,body)=>request(path(f)+'/'+work._id,{...body,version:work.__v,requestId:body.requestId||randomUUID()},'PUT');

test('edit permission is distinct from worker-account updates and assignment',()=>{
  const user={moduleAccess:['workers'],operationPermissions:{workers:['editWork']}};
  assert.equal(employeeCanRequest(user,'PUT','/tailoring-workers/id/work/workId'),true);
  assert.equal(employeeCanRequest(user,'GET','/tailoring-workers/id/work/material-options'),true);
  for(const [m,p]of [['PUT','/tailoring-workers/id'],['POST','/tailoring-workers/id/work'],['POST','/tailoring-workers/id/work/workId/completions']])assert.equal(employeeCanRequest(user,m,p),false);
});

test('machine shop batch edits all materials, colors, size, meters and wage with a net stock correction and stable work barcode',async t=>{
  const f=setup(t),work=await assign(f,batchBody(f)),beforeFabric=JSON.stringify(f.fabrics),next=f.seedSfifa({width:'thick'}),fabric=f.seedFabric();
  const body=batchBody(f,{fabricId:String(fabric._id),colorIds:[String(fabric.colors[0]._id)],sfifaId:String(next._id),variantId:String(next.variants[0]._id),size:'XXL',meters:4.25,unitWage:22});
  const r=await edit(f,work,body);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data._id,work._id);assert.equal(r.data.shopBarcode,work.shopBarcode);assert.equal(r.data.quantity,1);assert.equal(r.data.materials[0].unitWage,22);assert.equal(r.data.materials[0].size,'XXL');assert.equal(r.data.materials[0].meters,4.25);assert.equal(f.stocks[0].quantity,20);assert.equal(f.stocks[1].quantity,17);assert.equal(JSON.stringify(f.fabrics.slice(0,1)),beforeFabric);
  const replay=await edit(f,work,body);assert.equal(replay.status,200);assert.equal(replay.data.edits.length,1);assert.equal(f.stocks[1].quantity,17);
  const complete=await request(path(f)+'/'+work._id+'/completions',{quantity:1,lineIds:[String(fabric.colors[0]._id)],version:r.data.__v,requestId:randomUUID()});assert.equal(complete.status,201,JSON.stringify(complete.data));assert.equal(complete.data.completions[0].earningAmount,22);
  assert.equal((await edit(f,complete.data,{...body,requestId:randomUUID()})).data.message,'cannotEditStartedWork');
});

for(const garmentType of ['jabador','malakiya'])test(garmentType+': editing piece cards returns old fabric and sfifa, reserves new allocations and cancellation returns only the current ones',async t=>{
  const f=setup(t),lineId=randomUUID().replaceAll('-','').slice(0,24),body={category:'machine',workType:'shop',garmentType,productName:'قطعة',quantity:1,materials:[{...f.selection(lineId),unitWage:12,size:'M'}],requestId:randomUUID()},work=await assign(f,body);
  const other=f.seedFabric(),next=f.seedSfifa({width:'thick'}),input={...body,materials:[{...f.selection(lineId,3,other,next),unitWage:18,size:'XL'}],requestId:randomUUID()};
  const r=await edit(f,work,input);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(f.fabrics[0].colors[0].pieces[0].meters,20);assert.equal(f.fabrics[1].colors[0].pieces[0].meters,17);assert.equal(f.stocks[0].quantity,20);assert.equal(f.stocks[1].quantity,17);
  const cancel=await request(path(f)+'/'+work._id+'/cancel',{requestId:randomUUID(),version:r.data.__v});assert.equal(cancel.status,200,JSON.stringify(cancel.data));assert.equal(f.fabrics[0].colors[0].pieces[0].meters,20);assert.equal(f.fabrics[1].colors[0].pieces[0].meters,20);assert.equal(f.stocks[0].quantity,20);assert.equal(f.stocks[1].quantity,20);assert.equal((await edit(f,work,input)).status,409);
});

test('unchanged machine materials can be edited with no free stock and shortages reject before saving any edit',async t=>{
  const f=setup(t);f.sfifa.variants[0].quantity=6;f.sfifa.quantity=6;const work=await assign(f,batchBody(f));assert.equal(f.stocks[0].quantity,0);
  const r=await edit(f,work,batchBody(f,{size:'S',unitWage:25}));assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(f.stocks[0].quantity,0);
  const input=batchBody(f,{colorIds:[...f.fabric.colors.map(c=>String(c._id)),'aaaaaaaaaaaaaaaaaaaaaaaa']});const invalid=await edit(f,r.data,input);assert.equal(invalid.status,409);assert.equal(f.records[0].edits.length,1);
});

test('machine edit retries resume a lost stock acknowledgement without double deductions or returns',async t=>{
  const f=setup(t),work=await assign(f,batchBody(f)),body=batchBody(f,{colorIds:[String(f.fabric.colors[0]._id)],unitWage:15});f.controls.failAfter='sfifa';
  const first=await edit(f,work,body);assert.equal(first.status,503,JSON.stringify(first.data));assert.equal(f.stocks[0].quantity,17);assert.equal(f.records[0].materialStatus,'pending');
  const retry=await edit(f,work,body);assert.equal(retry.status,200,JSON.stringify(retry.data));assert.equal(retry.data.materialStatus,'ready');assert.equal(f.stocks[0].quantity,17);assert.equal(retry.data.edits.length,1);
});

for(const workType of ['shop','client'])test('sfifa '+workType+': width/family/code, meters and wage can change across stock groups while keeping a single work and its history',async t=>{
  const f=setup(t),originalBody=sfifaBody(f,{workType}),work=await assign(f,originalBody);f.seedSfifa({width:'thick'});const input={quantity:15.125,unitWage:4.25,sfifa:{width:'thick',family:'01-30',code:12},requestId:randomUUID()};
  let r=await edit(f,work,input);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data._id,work._id);assert.equal(r.data.sfifa.width,'thick');assert.equal(r.data.quantity,15.125);assert.equal(r.data.unitWage,4.25);assert.equal(r.data.edits.length,1);assert.equal(f.stocks[0].quantity,20);assert.equal(f.stocks[1].quantity,20);
  r=await edit(f,work,input);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.edits.length,1);
  const list=await request(path(f)+'?category=sfifa');assert.equal(list.data.works.length,1);assert.equal(list.data.works[0].sfifa.width,'thick');
  const creationRetry=await request(path(f),originalBody);assert.equal(creationRetry.status,200,JSON.stringify(creationRetry.data));assert.equal(creationRetry.data.sfifa.width,'thick');
  const back=await edit(f,r.data,{quantity:8.125,unitWage:5,sfifa:{width:'thin',family:'01-30',code:12}});assert.equal(back.status,200,JSON.stringify(back.data));assert.equal(back.data.edits.length,2);assert.equal((await request(path(f)+'?category=sfifa')).data.works.length,1);
  const completed=await request(path(f)+'/'+work._id+'/completions',{quantity:2.125,version:back.data.__v,requestId:randomUUID()});assert.equal(completed.status,201,JSON.stringify(completed.data));assert.equal(completed.data.completions[0].earningAmount,10.63);assert.equal(f.stocks[0].quantity,workType==='shop'?22.125:20);assert.equal(f.stocks[1].quantity,20);
  const denied=await edit(f,completed.data,{...input,requestId:randomUUID()});assert.equal(denied.status,409);assert.equal(denied.data.message,'cannotEditStartedWork');
});

test('sfifa can change to a new family or customer-owned classification and never credits customer sfifa',async t=>{
  const f=setup(t),work=await assign(f,sfifaBody(f));const r=await edit(f,work,{quantity:5,unitWage:2,sfifa:{width:'thick',family:'customer'}});assert.equal(r.status,200,JSON.stringify(r.data));
  const complete=await request(path(f)+'/'+work._id+'/completions',{quantity:5,version:r.data.__v,requestId:randomUUID()});assert.equal(complete.status,201,JSON.stringify(complete.data));assert.equal(f.stocks.reduce((sum,s)=>sum+s.quantity,0),20);
});

test('sfifa edit requires the current version and checks retry payload, ownership, worker state and independent permission',async t=>{
  const f=setup(t),work=await assign(f,sfifaBody(f)),body={quantity:14,unitWage:7,sfifa:{width:'thin',family:'01-30',code:12},requestId:randomUUID()};
  assert.equal((await request(path(f)+'/'+work._id,{...body,version:99},'PUT')).status,409);
  const first=await edit(f,work,body);assert.equal(first.status,200,JSON.stringify(first.data));assert.equal((await edit(f,work,{...body,quantity:16})).status,409);
  f.staff.name='سعيد';f.staff.moduleAccess=['workers'];f.staff.operationPermissions={workers:['editWork']};
  const r=await request(path(f)+'/'+work._id,{...body,quantity:16,unitWage:'',version:first.data.__v,requestId:randomUUID()},'PUT','Employe',employee);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.unitWage,undefined);assert.doesNotMatch(JSON.stringify(r.data.edits),/unitWage/);assert.equal(r.data.edits.at(-1).actorName,'سعيد');
  f.staff.operationPermissions.workers=[];assert.equal((await request(path(f)+'/'+work._id,{...body,version:r.data.__v},'PUT','Employe',employee)).status,403);
  assert.equal((await request(path(f)+'/'+work._id,{...body,version:r.data.__v},'PUT','admin',otherOwner)).status,404);
});

test('a lost sfifa relocation acknowledgement recovers from the saved intent through list and exact edit retry',async t=>{
  const f=setup(t),work=await assign(f,sfifaBody(f));f.seedSfifa({width:'thick'});const input={quantity:18.125,unitWage:4,sfifa:{width:'thick',family:'01-30',code:12},requestId:randomUUID()};f.controls.failAfter='sfifa';
  assert.equal((await edit(f,work,input)).status,500);
  const listed=await request(path(f)+'?category=sfifa');assert.equal(listed.status,200,JSON.stringify(listed.data));assert.equal(listed.data.works.length,1);assert.equal(listed.data.works[0].sfifa.width,'thick');
  const retried=await edit(f,work,input);assert.equal(retried.status,200,JSON.stringify(retried.data));assert.equal(retried.data.edits.length,1);assert.equal(retried.data.quantity,18.125);assert.equal(f.stocks.reduce((n,s)=>n+s.quantity,0),40);
});

test('an edit-only employee can finish a pending material correction without gaining resume access to ordinary assignments',async t=>{
  const f=setup(t),work=await assign(f,batchBody(f));f.controls.failAfter='sfifa';assert.equal((await edit(f,work,batchBody(f,{unitWage:19}))).status,503);
  f.staff.moduleAccess=['workers'];f.staff.operationPermissions={workers:['editWork']};
  assert.equal((await request(path(f)+'/'+work._id+'/materials/resume',{},'POST','Employe',employee)).status,403);
  const r=await request(path(f)+'/'+work._id+'/edit/resume',{},'POST','Employe',employee);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.editPending,false);assert.equal(r.data.unitWage,undefined);assert.equal(r.data.materialStatus,'ready');
  const completed=await request(path(f)+'/'+work._id+'/completions',{quantity:1,lineIds:[String(f.fabric.colors[0]._id)],version:r.data.__v,requestId:randomUUID()});assert.equal(completed.status,201,JSON.stringify(completed.data));assert.equal(completed.data.completions[0].earningAmount,19);
});
