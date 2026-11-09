import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import TailoringWorker from '../BackEnd/models/TailoringWorker.js';
import {workerMaterialsFixture} from './helpers/workerMaterialsFixture.js';
import {owner,otherOwner,employee} from './helpers/djellabaCostsFixture.js';
import {WORKER_CATEGORIES} from '../shared/workers.js';
import {validateWorkerWork} from '../shared/workerWork.js';
import {employeeCanRequest} from '../shared/employeePermissions.js';
import {workerPayrollMonth,workerPayrollDay} from '../shared/workerPayroll.js';
import app from '../BackEnd/app.js';

const admin={id:owner,role:'admin'},staff={id:employee,role:'Employe',idAdmin:otherOwner,action:{delete:true}};
let server,base;const oldSecret=process.env.JWT_SECRET;
before(async()=>{process.env.JWT_SECRET='isolated-worker-removal';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;});
async function request(path,body,actor=admin,method=body?'POST':'GET'){
  const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${jwt.sign(actor,process.env.JWT_SECRET)}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
}
function setup(t){
  const f=workerMaterialsFixture(t),faults={};Object.assign(f.staff,{name:'موظف الحذف',moduleAccess:['workers'],operationPermissions:{workers:['delete']}});
  const workerSave=t.mock.method(TailoringWorker.prototype,'save',async function(){
    if(faults.failSave)throw new Error('Isolated failure');
    await this.validate();const index=f.workers.findIndex(row=>String(row._id)===String(this._id));
    if(index<0||f.workers[index].__v!==this.__v)throw Object.assign(new Error('Concurrent write'),{name:'VersionError'});
    this.__v++;this.updatedAt=new Date();f.workers[index]=new TailoringWorker(this.toObject());return this;
  });
  return {...f,faults,workerSave};
}
const pathFor=worker=>`/tailoring-workers/${worker._id}`;
const body=(extra={})=>({category:'brim',workType:'client',quantity:3,unitWage:5,requestId:randomUUID(),...extra});
async function assign(f,input=body()) {const result=await request(pathFor(f.worker)+'/work',input);assert.equal(result.status,201,JSON.stringify(result));return result.data;}
async function complete(f,work,quantity){const result=await request(pathFor(f.worker)+`/work/${work._id}/completions`,{quantity,version:work.__v,requestId:randomUUID()});assert.equal(result.status,201,JSON.stringify(result));return result.data;}
const remove=(worker,actor=admin,patch={})=>request(pathFor(worker),{version:worker.__v??0,...patch},actor,'DELETE');

test('client brim accepts quantity and wage alone and keeps its own quantities, increases and earnings',async t=>{
  const f=setup(t),client=await assign(f);assert.equal(client.productName,'Brim');assert.equal(client.tailoring,undefined);assert.equal(client.workType,'client');
  const shop=await assign(f,body({workType:'shop',quantity:8}));
  const partial=await complete(f,client,2);assert.equal(partial.remainingQuantity,1);assert.equal(partial.completions[0].earningAmount,10);
  const added=await request(pathFor(f.worker)+`/work/${client._id}/increases`,{quantity:2,version:partial.__v,requestId:randomUUID()});assert.equal(added.status,201);assert.equal(added.data.quantity,5);
  const done=await complete(f,added.data,3);assert.equal(done.remainingQuantity,0);
  const listed=await request(pathFor(f.worker)+'/work?category=brim');assert.equal(listed.data.works.find(row=>row._id===shop._id).completedQuantity,0);
  const account=await request(pathFor(f.worker)+'/payroll');assert.equal(account.data.totals.earned,25);assert.equal(account.data.totals.due,25);
  for(const patch of [{quantity:0},{quantity:1.5},{unitWage:-1},{unitWage:'1.001'}])assert.throws(()=>validateWorkerWork(body(patch)),/invalidWork/);
  for(const category of ['machine','finishing','shirts','mesbanto'])assert.throws(()=>validateWorkerWork(body({category})),/invalidWork/);
});

test('older linked client brim work remains linked, retryable and tracked',async t=>{
  const f=setup(t),order=f.seedGarmentOrder('djellaba'),input=body({orderId:String(order._id),lineIds:[order.items[0].lineId]});
  const work=await assign(f,input);assert.equal(work.quantity,1);assert.equal(work.tailoring.clientName,order.clientName);
  assert.equal((await request(pathFor(f.worker)+'/work',input)).status,200);
  const tracked=await request('/tailoring-orders/work-status');assert.ok(JSON.stringify(tracked.data).includes(work._id));
  const done=await complete(f,work,1);assert.equal(done.completions[0].earningAmount,5);
});

test('worker deletion supports every section and hides a multi-section worker from all active lists',async t=>{
  const f=setup(t);f.worker.categories=[...WORKER_CATEGORIES];
  const removed=await remove(f.worker,staff,{deletedBy:otherOwner,deletedAt:'1900-01-01'});assert.equal(removed.status,200,JSON.stringify(removed));assert.ok(removed.data.deletedAt);assert.deepEqual(removed.data.categories,WORKER_CATEGORIES);
  const listing=await request('/tailoring-workers');assert.equal(listing.data.workers.length,0);assert.equal(listing.data.deletedWorkers.length,1);assert.equal(listing.data.deletedWorkers[0]._id,String(f.worker._id));
  assert.equal(String(f.workers[0].deletedBy),employee);
  for(const category of WORKER_CATEGORIES){const worker=f.seedWorker(owner,[category]);const result=await remove(worker);assert.equal(result.status,200,JSON.stringify(result));}
  assert.equal((await request('/tailoring-workers')).data.deletedWorkers.length,WORKER_CATEGORIES.length+1);
});

test('deleted workers retain pending work, stock, earned wages and payments, and can settle their account',async t=>{
  const f=setup(t),work=await assign(f),partial=await complete(f,work,2);
  const month=workerPayrollMonth(),paidOn=workerPayrollDay();
  const paid=await request(pathFor(f.worker)+'/payments',{type:'settlement',month,paidOn,amount:4,requestId:randomUUID()});assert.equal(paid.status,201);
  const before=(await request(pathFor(f.worker)+'/payroll')).data,stocks=JSON.stringify(f.stocks),fabrics=JSON.stringify(f.fabrics),current=f.workers[0];
  const removed=await remove(current);assert.equal(removed.status,200);
  const after=(await request(pathFor(f.worker)+'/payroll')).data;assert.deepEqual(after.totals,before.totals);assert.deepEqual(after.entries,before.entries);assert.ok(after.worker.deletedAt);
  const listing=await request(pathFor(f.worker)+'/work?category=brim');assert.equal(listing.status,200);assert.equal(listing.data.canAssign,false);assert.equal(listing.data.works.length,1);
  assert.equal((await request(pathFor(f.worker)+'/work',body())).data.message,'workerDeleted');
  assert.equal((await request(pathFor(f.worker)+`/work/${work._id}/increases`,{quantity:2,version:partial.__v,requestId:randomUUID()})).data.message,'workerDeleted');
  assert.equal((await request(pathFor(f.worker),{name:'اسم جديد',phone:'0612345678',categories:['brim'],version:removed.data.__v},admin,'PUT')).data.message,'workerDeleted');
  const done=await complete(f,partial,1);assert.equal(done.remainingQuantity,0);
  assert.equal((await request(pathFor(f.worker)+'/payments',{type:'settlement',month,paidOn,amount:11,requestId:randomUUID()})).status,201);
  assert.equal((await request(pathFor(f.worker)+'/payroll')).data.totals.due,0);
  assert.equal(JSON.stringify(f.stocks),stocks);assert.equal(JSON.stringify(f.fabrics),fabrics);
});

test('worker removal preserves order assignments and permits completing work to release a garment',async t=>{
  const f=setup(t),order=f.seedGarmentOrder('djellaba'),work=await assign(f,body({category:'finishing',orderId:String(order._id),lineIds:[order.items[0].lineId]}));
  assert.equal((await remove(f.worker)).status,200);
  let tracked=await request('/tailoring-orders/work-status');assert.ok(JSON.stringify(tracked.data).includes(work._id));assert.ok(JSON.stringify(tracked.data).includes('أمينة'));
  await complete(f,work,1);tracked=await request('/tailoring-orders/work-status');assert.ok(JSON.stringify(tracked.data).includes(work._id));
});

test('failed, stale and concurrent deletes cannot erase accounts or overwrite the original deletion audit',async t=>{
  const f=setup(t);assert.equal((await remove(f.worker,admin,{version:99})).status,409);assert.equal(f.workers[0].deletedAt,undefined);
  f.faults.failSave=true;assert.equal((await remove(f.worker)).status,500);assert.equal(f.workers[0].deletedAt,undefined);f.faults.failSave=false;
  const results=await Promise.all([remove(f.worker,staff),remove(f.worker,admin)]);assert.ok(results.some(row=>row.status===200));assert.ok(results.every(row=>[200,409].includes(row.status)));
  const persisted=f.workers[0].toObject(),savedVersion=persisted.__v;
  const retry=await remove(f.worker);assert.equal(retry.status,200);assert.equal(retry.data.__v,savedVersion);assert.equal(new Date(retry.data.deletedAt).getTime(),persisted.deletedAt.getTime());assert.equal(String(f.workers[0].deletedBy),String(persisted.deletedBy));assert.equal(f.workers.length,1);
});

test('worker delete needs its own current permission and owner, independent from assignment deletion',async t=>{
  const f=setup(t);
  for(const operations of [[],['deleteWork'],['cancelWork'],['update'],['complete']]){f.staff.operationPermissions.workers=operations;assert.equal((await remove(f.worker,staff)).status,403);}
  f.staff.operationPermissions.workers=['delete'];f.staff.moduleAccess=[];assert.equal((await remove(f.worker,staff)).status,403);f.staff.moduleAccess=['workers'];f.staff.isActive=false;assert.equal((await remove(f.worker,staff)).status,403);f.staff.isActive=true;
  assert.equal((await remove(f.worker,{id:otherOwner,role:'admin'})).status,404);assert.equal((await request('/tailoring-workers/bad-id',{version:0},admin,'DELETE')).status,404);
  assert.equal(employeeCanRequest({moduleAccess:['workers'],operationPermissions:{workers:['delete']}},'DELETE','/tailoring-workers/id/work/job'),false);
  assert.equal((await remove(f.worker,staff)).status,200);f.staff.operationPermissions.workers=[];assert.equal((await remove(f.worker,staff)).status,403);
});
