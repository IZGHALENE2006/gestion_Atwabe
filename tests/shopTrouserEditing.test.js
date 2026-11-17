import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, employee, otherOwner } from './helpers/djellabaCostsFixture.js';
import { generateFabricBarcode } from '../shared/fabrics.js';
import { protectWorkerMaterialDeletion } from '../BackEnd/utils/workerMaterials.js';

let server,base;const previousSecret=process.env.JWT_SECRET;
before(async()=>{process.env.JWT_SECRET='isolated-shop-trouser-edit';server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
async function request(url,body,method='POST',staff=false){const response=await fetch(base+url,{method,headers:{Authorization:'Bearer '+jwt.sign({id:staff?employee:owner,role:staff?'Employe':'admin'},process.env.JWT_SECRET),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()};}
const path=f=>'/tailoring-workers/'+f.worker._id+'/work';
function setup(t){const f=workerMaterialsFixture(t);f.worker.categories=['trousers'];f.fabric.colors.push({name:'أحمر',number:'02',pieces:[{meters:12,barcode:generateFabricBarcode()}]},{name:'أخضر',number:'03',pieces:[{meters:10,barcode:generateFabricBarcode()}]});return f;}
const ids=f=>f.fabric.colors.map(color=>String(color._id));
const input=(f,patch={})=>({category:'trousers',workType:'shop',trouserType:'regular',quantity:2,unitWage:12,shopTrouser:{fabricId:String(f.fabric._id),size:'L',length:90,metersPerPiece:2.5,colorIds:ids(f).slice(0,2),...patch},requestId:randomUUID()});
async function assign(f,body=input(f)){const r=await request(path(f),body);assert.equal(r.status,201,JSON.stringify(r.data));return r.data;}
const edit=(f,work,body,staff=false)=>request(path(f)+'/'+work._id,{...body,version:work.__v,requestId:body.requestId||randomUUID()},'PUT',staff);
const balances=f=>f.fabrics[0].colors.map(color=>color.pieces.reduce((sum,p)=>sum+Math.round(p.meters*1000),0)/1000);

test('custom lengths are normalized and persist through addition, editing and completion while sizes stay predefined',async t=>{
  const f=setup(t);
  for(const length of [' 105 ',75,100,'107,5']){const work=await assign(f,input(f,{length,colorIds:[ids(f)[0]],metersPerPiece:0.25}));assert.equal(work.shopTrouser.length,Number(String(length).trim().replace(',','.')));}
  const work=await assign(f,input(f,{length:110}));
  const changed=await edit(f,work,input(f,{length:'112.5',size:'XL'}));assert.equal(changed.status,200,JSON.stringify(changed.data));assert.equal(changed.data.shopTrouser.length,112.5);assert.equal(changed.data.shopTrouser.size,'XL');assert.equal(changed.data.edits[0].beforeSnapshot.shopTrouser.length,110);assert.equal(changed.data.edits[0].afterSnapshot.shopTrouser.length,112.5);
  const complete=await request(path(f)+'/'+work._id+'/completions',{quantity:1,colorIds:[ids(f)[0]],version:changed.data.__v,requestId:randomUUID()});assert.equal(complete.status,201,JSON.stringify(complete.data));assert.equal(complete.data.shopTrouser.length,112.5);
  for(const size of ['46','XXXL','خاص 42']){const r=await request(path(f),input(f,{size}));assert.equal(r.status,400,JSON.stringify(r.data));assert.equal(r.data.fields['shopTrouser.size'],'invalidSize');}
});

test('editing all trouser fields changes colors and fabric, returns old allocations and cancellation returns only the new ones',async t=>{
  const f=setup(t),work=await assign(f),other=f.seedFabric(),body={...input(f,{fabricId:String(other._id),size:'XXL',length:95,metersPerPiece:3.125,colorIds:[String(other.colors[0]._id)]}),trouserType:'qandrissi',unitWage:22};
  const r=await edit(f,work,body);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data._id,work._id);assert.equal(r.data.quantity,1);assert.equal(r.data.trouserType,'qandrissi');assert.equal(r.data.shopTrouser.size,'XXL');assert.equal(r.data.shopTrouser.length,95);assert.equal(r.data.unitWage,22);assert.deepEqual(balances(f),[29,12,10]);assert.equal(f.fabrics[1].colors[0].pieces[0].meters,16.875);assert.equal(r.data.edits[0].beforeSnapshot.shopTrouser.size,'L');assert.equal(r.data.edits[0].afterSnapshot.shopTrouser.size,'XXL');
  const retry=await edit(f,work,body);assert.equal(retry.status,200);assert.equal(retry.data.edits.length,1);assert.equal(f.fabrics[1].colors[0].pieces[0].meters,16.875);
  const cancel=await request(path(f)+'/'+work._id+'/cancel',{requestId:randomUUID(),version:r.data.__v});assert.equal(cancel.status,200,JSON.stringify(cancel.data));assert.equal(f.fabrics[1].colors[0].pieces[0].meters,20);assert.deepEqual(balances(f),[29,12,10]);
});

test('same-fabric edits release removed colors, reserve changed metres and keep increase/edit history consistent',async t=>{
  const f=setup(t),work=await assign(f),added=await request(path(f)+'/'+work._id+'/increases',{shopTrouser:{colorIds:[ids(f)[2]]},requestId:randomUUID(),version:work.__v});assert.equal(added.status,201,JSON.stringify(added.data));
  let r=await edit(f,added.data,input(f,{size:'M',colorIds:[ids(f)[1]],metersPerPiece:4}));assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.quantity,1);assert.equal(r.data.additions.length,1);assert.deepEqual(balances(f),[29,8,10]);
  const more=await request(path(f)+'/'+work._id+'/increases',{shopTrouser:{colorIds:[ids(f)[0]]},requestId:randomUUID(),version:r.data.__v});assert.equal(more.status,201,JSON.stringify(more.data));assert.equal(more.data.quantity,2);assert.deepEqual(balances(f),[25,8,10]);
  r=await edit(f,more.data,input(f,{size:'XL',colorIds:[ids(f)[2]],metersPerPiece:1.125}));assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.quantity,1);assert.deepEqual(balances(f),[29,12,8.875]);
  const cancel=await request(path(f)+'/'+work._id+'/cancel',{requestId:randomUUID(),version:r.data.__v});assert.equal(cancel.status,200,JSON.stringify(cancel.data));assert.deepEqual(balances(f),[29,12,10]);
});

test('fully reserved stock can be edited without free metres, while shortages and foreign fabrics leave the job unchanged',async t=>{
  const f=setup(t);f.fabric.colors[1].pieces[0].meters=2.5;const work=await assign(f);
  const r=await edit(f,work,input(f,{size:'S'}));assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(balances(f)[1],0);
  const shortage=await edit(f,r.data,input(f,{metersPerPiece:3}));assert.equal(shortage.status,409);assert.equal(shortage.data.message,'insufficientFabric');assert.deepEqual(balances(f),[26.5,0,10]);assert.equal(f.records[0].edits.length,1);
  const foreign=f.seedFabric({idAdmin:otherOwner});const invalid=await edit(f,r.data,input(f,{fabricId:String(foreign._id),colorIds:[String(foreign.colors[0]._id)]}));assert.equal(invalid.status,409);assert.equal(f.records[0].edits.length,1);
});

for(const fault of ['failBefore','failAfter','conflictOnce'])test('a '+fault+' stock failure resumes an edit exactly once and protects previous reservations',async t=>{
  const f=setup(t),work=await assign(f),other=f.seedFabric(),body=input(f,{fabricId:String(other._id),colorIds:[String(other.colors[0]._id)],size:'XXL',metersPerPiece:3});f.controls[fault]='fabric';
  const first=await edit(f,work,body);assert.equal(first.status,fault==='conflictOnce'?200:503,JSON.stringify(first.data));
  if(first.status===503){const list=await request(path(f)+'?category=trousers',undefined,'GET');assert.equal(list.status,200);assert.equal(list.data.works[0].editPending,true);await assert.rejects(protectWorkerMaterialDeletion(f.fabrics[0],new Set([String(f.fabric.colors[0].pieces[0]._id)]),'fabric'),e=>e.message==='workerMaterialsInUse');}
  const replay=await edit(f,work,body);assert.equal(replay.status,200,JSON.stringify(replay.data));assert.equal(replay.data.edits.length,1);assert.equal(replay.data.materialStatus,'ready');assert.deepEqual(balances(f),[29,12,10]);assert.equal(f.fabrics[1].colors[0].pieces[0].meters,17);
});

test('completion uses edited colors and wage, and even a partial completion locks future edits',async t=>{
  const f=setup(t),work=await assign(f),r=await edit(f,work,{...input(f,{size:'M'}),unitWage:18});assert.equal(r.status,200,JSON.stringify(r.data));
  const completed=await request(path(f)+'/'+work._id+'/completions',{quantity:1,colorIds:[ids(f)[0]],version:r.data.__v,requestId:randomUUID()});assert.equal(completed.status,201,JSON.stringify(completed.data));assert.equal(completed.data.completions[0].earningAmount,18);
  const locked=await edit(f,completed.data,input(f,{size:'XL'}));assert.equal(locked.status,409);assert.equal(locked.data.message,'cannotEditStartedWork');assert.equal(f.records[0].edits.length,1);
});

test('edit-only employees preserve hidden wages, are named in history and can resume only edit operations',async t=>{
  const f=setup(t),work=await assign(f);f.staff.moduleAccess=['workers'];f.staff.operationPermissions={workers:['editWork']};f.staff.name='موظف السراويل';
  const body={...input(f,{size:'XXL'}),unitWage:''};f.controls.failAfter='fabric';const pending=await edit(f,work,body,true);assert.equal(pending.status,503,JSON.stringify(pending.data));
  const resume=await request(path(f)+'/'+work._id+'/edit/resume',{},'POST',true);assert.equal(resume.status,200,JSON.stringify(resume.data));assert.equal(resume.data.unitWage,undefined);assert.equal(f.records[0].unitWage,12);assert.equal(resume.data.edits[0].actorName,'موظف السراويل');assert.equal(resume.data.edits[0].beforeSnapshot.unitWage,undefined);
  f.staff.operationPermissions.workers=['assign'];const denied=await edit(f,resume.data,input(f,{size:'S'}),true);assert.equal(denied.status,403);
});
