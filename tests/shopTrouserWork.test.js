import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';
import {workerMaterialsFixture} from './helpers/workerMaterialsFixture.js';
import {owner,otherOwner,employee} from './helpers/djellabaCostsFixture.js';
import {validateWorkerWork,SHOP_TROUSER_LENGTHS} from '../shared/workerWork.js';
import {WORKER_GARMENT_SIZES} from '../shared/workerMaterials.js';
import {employeeCanRequest} from '../shared/employeePermissions.js';

let server,base;const previousSecret=process.env.JWT_SECRET,admin={id:owner,role:'admin'},staff={id:employee,role:'Employe',idAdmin:otherOwner};
before(async()=>{process.env.JWT_SECRET='isolated-shop-trousers';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
async function request(path,body,actor=admin,method=body?'POST':'GET'){
  const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${jwt.sign(actor,process.env.JWT_SECRET)}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};
}
function setup(t){const f=workerMaterialsFixture(t);f.worker.categories=['trousers','machine'];return f;}
const workPath=f=>`/tailoring-workers/${f.worker._id}/work`;
const input=(f,patch={})=>({category:'trousers',workType:'shop',trouserType:'regular',shopTrouser:{fabricId:String(f.fabric._id),size:'XL'},quantity:5,unitWage:12.5,requestId:randomUUID(),...patch});
async function assign(f,body=input(f)){const result=await request(workPath(f),body);assert.equal(result.status,201,JSON.stringify(result));return result.data;}

test('fabric choices expose owner-scoped fabric and color labels without prices or roll details to permitted workers staff',async t=>{
  const f=setup(t);f.seedFabric({idAdmin:otherOwner});Object.assign(f.staff,{moduleAccess:['workers'],operationPermissions:{workers:['assign']}});
  let result=await request(workPath(f)+'/fabric-options',undefined,staff);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.fabrics.length,1);assert.deepEqual(Object.keys(result.data.fabrics[0]).sort(),['_id','colors','reference','type']);assert.equal(result.data.fabrics[0]._id,String(f.fabric._id));
  assert.deepEqual(result.data.fabrics[0].colors,[{_id:String(f.fabric.colors[0]._id),name:f.fabric.colors[0].name,number:f.fabric.colors[0].number,meters:29}]);
  assert.equal(JSON.stringify(result.data).includes('pieces'),false);assert.equal(JSON.stringify(result.data).includes('Price'),false);
  for(const permissions of [[],['details'],['complete']]){f.staff.operationPermissions.workers=permissions;assert.equal((await request(workPath(f)+'/fabric-options',undefined,staff)).status,403);}
  f.staff.operationPermissions.workers=['assign'];assert.equal((await request(workPath(f)+'/fabric-options',undefined,{id:otherOwner,role:'admin'})).status,404);
  assert.equal(employeeCanRequest({moduleAccess:['workers'],operationPermissions:{workers:['assign']}},'GET',workPath(f)+'/fabric-options'),true);
  assert.equal(employeeCanRequest({moduleAccess:['workers'],operationPermissions:{workers:['complete']}},'GET',workPath(f)+'/fabric-options'),false);
  f.worker.categories=['machine'];assert.equal((await request(workPath(f)+'/fabric-options')).status,409);
});

test('shop trousers save every requested size and type with trusted fabric labels, quantity and per-piece wage',async t=>{
  const f=setup(t),fabricBefore=JSON.stringify(f.fabrics),sfifaBefore=JSON.stringify(f.stocks);
  for(const [index,size]of WORKER_GARMENT_SIZES.entries()){
    const body=input(f,{trouserType:index%2?'qandrissi':'regular',productName:'FORGED',shopTrouser:{fabricId:String(f.fabric._id),size,fabricType:'FORGED',fabricReference:'FORGED'}}),work=await assign(f,body);
    assert.deepEqual(work.shopTrouser,{fabricId:String(f.fabric._id),size,fabricType:f.fabric.type,fabricReference:f.fabric.reference});assert.equal(work.productName,f.fabric.type);assert.equal(work.quantity,5);assert.equal(work.unitWage,12.5);assert.equal(work.trouserType,body.trouserType);assert.equal(work.tailoring,undefined);
    assert.equal((await request(workPath(f),body)).status,200);
    const changed=await request(workPath(f),{...body,shopTrouser:{...body.shopTrouser,size:size==='S'?'M':'S'}});assert.equal(changed.status,409);
  }
  const listing=await request(workPath(f)+'?category=trousers');assert.equal(listing.data.works.length,6);assert.ok(listing.data.works.every(work=>work.shopTrouser.fabricType===f.fabric.type));
  assert.equal(JSON.stringify(f.fabrics),fabricBefore);assert.equal(JSON.stringify(f.stocks),sfifaBefore);
});

test('size and fabric validation target their fields and malformed or foreign choices never create work',async t=>{
  const f=setup(t);
  for(const [patch,field]of [[{trouserType:'other'},'trouserType'],[{shopTrouser:{fabricId:'bad',size:'S'}},'shopTrouser.fabricId'],[{shopTrouser:{fabricId:String(f.fabric._id),size:'XXXL'}},'shopTrouser.size'],[{shopTrouser:null},'shopTrouser.fabricId'],[{quantity:0},'quantity'],[{unitWage:-1},'unitWage']]){
    const result=await request(workPath(f),input(f,patch));assert.equal(result.status,400,JSON.stringify(result));assert.ok(result.data.fields[field]);
  }
  const foreign=f.seedFabric({idAdmin:otherOwner});assert.equal((await request(workPath(f),input(f,{shopTrouser:{fabricId:String(foreign._id),size:'S'}}))).status,409);assert.equal(f.records.length,0);
  const normalized=validateWorkerWork(input(f,{shopTrouser:{fabricId:String(f.fabric._id).toUpperCase(),size:' 3xl '}}));assert.equal(normalized.shopTrouser.size,'3XL');assert.equal(normalized.shopTrouser.fabricId,String(f.fabric._id));
  assert.throws(()=>validateWorkerWork(input(f,{category:'machine'})),error=>error.fields.shopTrouser==='invalidShopTrouser');
});

test('fabric snapshots survive later stock edits and completion and increases keep their original metadata and earnings',async t=>{
  const f=setup(t),body=input(f),work=await assign(f,body),stockBefore=JSON.stringify(f.stocks);
  const oldName=f.fabric.type;f.fabric.type='اسم جديد';f.fabric.reference='NEW';assert.equal((await request(workPath(f),body)).data.shopTrouser.fabricType,oldName);
  const complete=await request(workPath(f)+`/${work._id}/completions`,{quantity:2,version:work.__v,requestId:randomUUID()});assert.equal(complete.status,201);assert.equal(complete.data.completions[0].earningAmount,25);assert.equal(complete.data.shopTrouser.fabricType,oldName);
  const added=await request(workPath(f)+`/${work._id}/increases`,{quantity:3,version:complete.data.__v,requestId:randomUUID(),shopTrouser:{fabricId:'9'.repeat(24),size:'S'},trouserType:'qandrissi'});assert.equal(added.status,201);assert.equal(added.data.quantity,8);assert.deepEqual(added.data.shopTrouser,work.shopTrouser);assert.equal(added.data.trouserType,'regular');
  const account=await request(`/tailoring-workers/${f.worker._id}/payroll`);assert.equal(account.data.totals.earned,25);assert.equal(account.data.totals.due,25);assert.equal(JSON.stringify(f.stocks),stockBefore);
});

test('existing shop work and customer-order trousers preserve their previous workflows',async t=>{
  const f=setup(t),legacyBody={category:'trousers',workType:'shop',productName:'سراويل قديمة',quantity:3,unitWage:5,requestId:randomUUID()},legacy=await assign(f,legacyBody);assert.equal(legacy.shopTrouser,undefined);assert.equal(legacy.trouserType,undefined);assert.equal((await request(workPath(f),legacyBody)).status,200);
  const order=f.seedGarmentOrder('trousers'),client=await assign(f,{category:'trousers',workType:'client',orderId:String(order._id),lineIds:[order.items[0].lineId],unitWage:7,requestId:randomUUID()});assert.equal(client.trouserType,'regular');assert.equal(client.tailoring.clientName,order.clientName);assert.equal(client.shopTrouser,undefined);assert.equal(client.quantity,1);
});

test('the model rejects mismatched shop-trouser metadata without invalidating older work',async t=>{
  const f=setup(t);await assign(f);const source=f.records[0].toObject();
  for(const patch of [{category:'machine'},{workType:'client'},{trouserType:'bad'},{shopTrouser:{...source.shopTrouser,size:'XXXL'}},{shopTrouser:{...source.shopTrouser,fabricType:''}}])await assert.rejects(new WorkerWork({...source,...patch}).validate());
  await new WorkerWork({...source,shopTrouser:undefined,trouserType:undefined}).validate();
});

function coloredInput(f,patch={}) {
  return input(f,{quantity:999,shopTrouser:{fabricId:String(f.fabric._id),size:'XL',length:85,colorIds:f.fabric.colors.slice(0,2).map(color=>String(color._id))},...patch});
}
function seedColors(f) {
  f.fabric.colors.push({name:'أحمر',number:'02',pieces:[]},{name:'أخضر',number:'03',pieces:[]});
}

test('shop trouser lengths and selected colors derive quantity and save trusted snapshots without changing stock',async t=>{
  const f=setup(t);seedColors(f);const stockBefore=JSON.stringify(f.fabrics);
  for(const length of SHOP_TROUSER_LENGTHS) {
    const body=coloredInput(f);body.shopTrouser.length=String(length);body.shopTrouser.colors=[{name:'FORGED'}];
    const work=await assign(f,body);
    assert.equal(work.shopTrouser.length,length);assert.equal(work.quantity,2);assert.equal(work.remainingQuantity,2);
    assert.deepEqual(work.shopTrouser.colors,body.shopTrouser.colorIds.sort().map(id=>{const color=f.fabric.colors.find(color=>String(color._id)===id);return {colorId:id,name:color.name,number:color.number};}));
    assert.equal(work.shopTrouser.colorIds,undefined);assert.equal(work.unitWage,12.5);
    assert.equal((await request(workPath(f),{...body,quantity:1,shopTrouser:{...body.shopTrouser,colorIds:[...body.shopTrouser.colorIds].reverse()}})).status,200);
    assert.equal((await request(workPath(f),{...body,shopTrouser:{...body.shopTrouser,length:length===80?85:80}})).status,409);
  }
  assert.equal(JSON.stringify(f.fabrics),stockBefore);
});

test('invalid lengths and empty, duplicated or foreign colors never create a trouser assignment',async t=>{
  const f=setup(t);seedColors(f);
  for(const length of ['',null,[],{},75,100,'85.5']) {
    const body=coloredInput(f);body.shopTrouser.length=length;const result=await request(workPath(f),body);
    assert.equal(result.status,400,JSON.stringify(result));assert.equal(result.data.fields['shopTrouser.length'],'invalidTrouserLength');
  }
  for(const colorIds of [[],null,['bad'],[String(f.fabric.colors[0]._id),String(f.fabric.colors[0]._id)],{}]) {
    const body=coloredInput(f);body.shopTrouser.colorIds=colorIds;const result=await request(workPath(f),body);
    assert.equal(result.status,400,JSON.stringify(result));assert.equal(result.data.fields['shopTrouser.colorIds'],'chooseTrouserColors');
  }
  for(const fabric of [f.seedFabric(),f.seedFabric({idAdmin:otherOwner})]) {
    const body=coloredInput(f);body.shopTrouser.colorIds=[String(fabric.colors[0]._id)];const result=await request(workPath(f),body);
    assert.equal(result.status,400);assert.equal(result.data.fields['shopTrouser.colorIds'],'trouserColorsChanged');
  }
  assert.equal(f.records.length,0);
});

test('color snapshots survive edits and removal, retries preserve them, and earnings use the actual selected count',async t=>{
  const f=setup(t);seedColors(f);const body=coloredInput(f),work=await assign(f,body),oldColors=structuredClone(work.shopTrouser.colors);
  f.fabric.colors[0].name='لون جديد';f.fabric.colors.splice(1,1);
  const retry=await request(workPath(f),body);assert.equal(retry.status,200);assert.deepEqual(retry.data.shopTrouser.colors,oldColors);
  const first=await request(workPath(f)+`/${work._id}/completions`,{quantity:1,colorIds:[oldColors[0].colorId],version:work.__v,requestId:randomUUID()});assert.equal(first.status,201);assert.equal(first.data.completions[0].earningAmount,12.5);
  const last=await request(workPath(f)+`/${work._id}/completions`,{quantity:1,colorIds:[oldColors[1].colorId],version:first.data.__v,requestId:randomUUID()});assert.equal(last.status,201);assert.equal(last.data.completedQuantity,2);assert.deepEqual(last.data.shopTrouser.colors,oldColors);
  const account=await request(`/tailoring-workers/${f.worker._id}/payroll`);assert.equal(account.data.totals.earned,25);
});

test('increasing color-based work selects extra colors, retains measurements and replays exact additions only',async t=>{
  const f=setup(t);seedColors(f);const work=await assign(f,coloredInput(f)),third=String(f.fabric.colors[2]._id),path=workPath(f)+`/${work._id}/increases`;
  let result=await request(path,{quantity:5,version:work.__v,requestId:randomUUID()});assert.equal(result.status,400);
  result=await request(path,{shopTrouser:{colorIds:[work.shopTrouser.colors[0].colorId]},version:work.__v,requestId:randomUUID()});assert.equal(result.status,400);
  const body={quantity:99,shopTrouser:{colorIds:[third],length:95,size:'S',fabricId:'9'.repeat(24)},version:work.__v,requestId:randomUUID()};
  result=await request(path,body);assert.equal(result.status,201,JSON.stringify(result));assert.equal(result.data.quantity,3);assert.equal(result.data.shopTrouser.length,85);assert.equal(result.data.shopTrouser.size,'XL');assert.equal(result.data.shopTrouser.fabricId,work.shopTrouser.fabricId);assert.equal(result.data.shopTrouser.colors.length,3);assert.deepEqual(result.data.additions[0].shopTrouserColorIds,[third]);
  assert.equal((await request(path,body)).status,200);
  assert.equal((await request(path,{...body,shopTrouser:{colorIds:[work.shopTrouser.colors[0].colorId]}})).status,409);
  const completed=await request(workPath(f)+`/${work._id}/completions`,{quantity:3,colorIds:result.data.shopTrouser.colors.map(color=>color.colorId),version:result.data.__v,requestId:randomUUID()});assert.equal(completed.status,201);assert.equal(completed.data.completions[0].earningAmount,37.5);
});

test('the model enforces paired length/color snapshots and color-count quantities',async t=>{
  const f=setup(t);seedColors(f);await assign(f,coloredInput(f));const source=f.records[0].toObject();
  await new WorkerWork(source).validate();
  for(const shopTrouser of [{...source.shopTrouser,length:100},{...source.shopTrouser,length:undefined},{...source.shopTrouser,colors:undefined},{...source.shopTrouser,colors:[]},{...source.shopTrouser,colors:[source.shopTrouser.colors[0]]},{...source.shopTrouser,colors:[source.shopTrouser.colors[0],source.shopTrouser.colors[0]]}])await assert.rejects(new WorkerWork({...source,shopTrouser}).validate());
});
