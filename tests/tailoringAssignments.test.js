import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';
import { WORKER_CATEGORIES } from '../shared/workers.js';
import { employeeCanRequest } from '../shared/employeePermissions.js';
import { seedClientPrerequisites } from './helpers/clientWorkerFlowFixture.js';

process.env.JWT_SECRET = 'isolated-order-assignment';
const { default: app } = await import('../BackEnd/app.js');
let server, base;
before(async () => { server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port; });
after(async () => { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); });
const admin={id:owner,role:'admin'},staff={id:employee,role:'Employe'};
const request=async(path,body,method=body===undefined?'GET':'POST',actor=admin)=>{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+jwt.sign(actor,process.env.JWT_SECRET),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')};};
const path=order=>'/tailoring-orders/'+order._id;
const input=(f,order,category='machine',patch={})=>({workerId:String(f.worker._id),workType:'client',category,orderId:String(order._id),lineIds:order.items.map(row=>row.lineId),unitWage:3.25,requestId:randomUUID(),...(category==='sfifa'?{quantity:6.125,sfifa:{width:'thin',family:'01-30',code:12}}:{}),...patch});
function fixture(t){const f=workerMaterialsFixture(t);f.worker.categories=WORKER_CATEGORIES;return f;}

test('order assignment has an independent permission and does not grant worker pages, shop assignments, payments or payroll',()=>{
  const user={moduleAccess:['tailoring'],operationPermissions:{tailoring:['assign']}};
  for(const suffix of ['assignment-workers','assignment-options'])assert.equal(employeeCanRequest(user,'GET','/tailoring-orders/id/'+suffix),true);
  assert.equal(employeeCanRequest(user,'POST','/tailoring-orders/id/assignments'),true);
  for(const [method,url]of [['GET','/tailoring-workers'],['GET','/tailoring-workers/id/payroll'],['POST','/tailoring-workers/id/work'],['POST','/tailoring-workers/id/payments'],['PUT','/tailoring-orders/id/assignment-options']])assert.equal(employeeCanRequest(user,method,url),false);
  assert.equal(employeeCanRequest({moduleAccess:['tailoring'],operationPermissions:{tailoring:[]}},'POST','/tailoring-orders/id/assignments'),false);
});

test('worker and piece selectors expose only active compatible workers and the requested owned order without financial information',async t=>{
  const f=fixture(t),order=f.seedGarmentOrder('shirts'),other=f.seedGarmentOrder('djellaba'),deleted=f.seedWorker(owner,['shirts']);deleted.deletedAt=new Date();f.seedWorker(otherOwner,['shirts']);
  const r=await request(path(order)+'/assignment-workers');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.cache,'no-store');assert.deepEqual(r.data.workers.map(row=>row._id),[String(f.worker._id)]);
  const options=await request(path(order)+'/assignment-options?workerId='+f.worker._id+'&category=shirts');assert.equal(options.status,200);assert.deepEqual(options.data.orders.map(row=>row._id),[String(order._id)]);assert.notEqual(options.data.orders[0]._id,String(other._id));
  assert.doesNotMatch(JSON.stringify(options.data),/"(?:totalPrice|expenseAmount|profitAmount|paidAmount|unitWage)"/);
  assert.equal((await request(path(order)+'/assignment-options?workerId='+f.worker._id+'&category=machine')).status,400);
});

for(const [category,garment]of [['machine','djellaba'],['machine','jabador'],['machine','malakiya'],['finishing','djellaba'],['sfifa','djellaba'],['brim','jabador'],['trousers','trousers'],['shirts','shirts'],['mesbanto','shirts'],['mesbanto','malakiya']])test(category+' / '+garment+': order assignment is the same durable worker job, with exact retries, normal completions and tracking',async t=>{
  const f=fixture(t),order=f.seedGarmentOrder(garment),body=input(f,order,category),beforeStock=f.stocks.reduce((sum,row)=>sum+row.quantity,0);
  await seedClientPrerequisites(f, order, category); const predecessorCount = f.records.length;
  let r=await request(path(order)+'/assignments',body);assert.equal(r.status,201,JSON.stringify(r.data));const work=r.data;
  assert.equal(work.workType,'client');assert.equal(work.tailoring.orderId,String(order._id));assert.equal(work.category,category);assert.deepEqual(work.tailoring.lineIds,[...body.lineIds].sort());assert.equal(work.unitWage,3.25);
  const normal=(await request('/tailoring-workers/'+f.worker._id+'/work?category='+category)).data.works;assert.equal(normal.length,1);assert.equal(normal[0]._id,work._id);
  r=await request(path(order)+'/assignments',body);assert.equal(r.status,200);assert.equal(r.data._id,work._id);
  r=await request('/tailoring-workers/'+f.worker._id+'/work',body);assert.equal(r.status,200);assert.equal(r.data._id,work._id);
  const quantity=category==='sfifa'?6.125:body.lineIds.length;
  r=await request('/tailoring-workers/'+f.worker._id+'/work/'+work._id+'/completions',{quantity,version:work.__v,requestId:randomUUID()});assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.remainingQuantity,0);assert.equal(r.data.completions[0].earningAmount,category==='sfifa'?19.91:6.5);
  assert.equal(f.stocks.reduce((sum,row)=>sum+row.quantity,0),beforeStock,'Client assignments and completions must not deduct or credit shop material stock');
  const tracked=(await request('/tailoring-orders/work-status')).data.orders.find(row=>row.orderId===String(order._id));assert.equal(tracked.assignments.length,predecessorCount+1);assert.equal(tracked.assignments.find(row=>row.workId===work._id).remainingQuantity,0);
});

test('tailoring-only staff can assign this order but cannot read wages or bypass their grant through worker endpoints',async t=>{
  const f=fixture(t),order=f.seedGarmentOrder('djellaba');f.staff.moduleAccess=['tailoring'];f.staff.operationPermissions={tailoring:['assign']};
  const body=input(f,order);
  for(const suffix of ['assignment-workers','assignment-options?workerId='+f.worker._id+'&category=machine'])assert.equal((await request(path(order)+'/'+suffix,undefined,'GET',staff)).status,200);
  let r=await request(path(order)+'/assignments',body,'POST',staff);assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.unitWage,undefined);assert.equal(String(f.records[0].createdBy),employee);assert.equal(f.records[0].unitWage,3.25);
  for(const [url,body,method]of [['/tailoring-workers/'+f.worker._id+'/work',input(f,order), 'POST'],['/tailoring-workers/'+f.worker._id+'/payroll',undefined,'GET']])assert.equal((await request(url,body,method,staff)).status,403);
  f.staff.operationPermissions.tailoring=[];r=await request(path(order)+'/assignments',input(f,order),'POST',staff);assert.equal(r.status,403);assert.equal(f.records.length,1);
});

test('cancelled, delivered, foreign and malformed orders, deleted or wrong-section workers and forged shop/other-order inputs cannot be assigned',async t=>{
  const f=fixture(t),order=f.seedGarmentOrder('djellaba'),foreign=f.seedGarmentOrder('djellaba',undefined,otherOwner),delivered=f.seedGarmentOrder('djellaba'),cancelled=f.seedGarmentOrder('djellaba');delivered.deliveredAt=new Date();cancelled.cancelledAt=new Date();
  for(const row of [delivered,cancelled])for(const suffix of ['assignment-workers','assignments'])assert.equal((await request(path(row)+'/'+suffix,suffix==='assignments'?input(f,row):undefined)).status,409);
  assert.equal((await request(path(foreign)+'/assignments',input(f,foreign))).status,404);
  assert.equal((await request('/tailoring-orders/bad/assignment-workers')).status,404);
  for(const patch of [{workType:'shop'},{orderId:String(foreign._id)},{category:'shirts'},{category:'unknown'},{workerId:String(f.seedWorker(otherOwner)._id)}])assert.ok([400,404].includes((await request(path(order)+'/assignments',input(f,order,'machine',patch))).status));
  const wrong=f.seedWorker(owner,['shirts']),deleted=f.seedWorker(owner,['machine']);deleted.deletedAt=new Date();
  assert.equal((await request(path(order)+'/assignments',input(f,order,'machine',{workerId:String(wrong._id)}))).status,409);
  assert.equal((await request(path(order)+'/assignments',input(f,order,'machine',{workerId:String(deleted._id)}))).status,409);assert.equal(f.records.length,0);
});

test('new order actions share section blockers and assignment locks with the existing worker flow',async t=>{
  const f=fixture(t),order=f.seedGarmentOrder('djellaba'),lineIds=[order.items[0].lineId];
  const assigned=await request(path(order)+'/assignments',input(f,order,'machine',{lineIds}));assert.equal(assigned.status,201);const work=assigned.data;
  let r=await request(path(order)+'/assignments',input(f,order,'finishing',{lineIds}));assert.equal(r.status,409);assert.equal(r.data.message,'garmentInProgress');assert.equal(r.data.blockers[0].category,'machine');
  r=await request(path(order)+'/assignment-options?workerId='+f.worker._id+'&category=finishing');assert.equal(r.status,200);assert.deepEqual(r.data.orders,[]);
  assert.equal((await request('/tailoring-workers/'+f.worker._id+'/work/'+work._id+'/completions',{quantity:1,version:work.__v,requestId:randomUUID()})).status,201);
  r=await request(path(order)+'/assignments',input(f,order,'finishing',{lineIds}));assert.equal(r.status,201,JSON.stringify(r.data));
  const secondOrder=f.seedGarmentOrder('djellaba'),body=input(f,secondOrder);
  const concurrent=await Promise.all([request(path(secondOrder)+'/assignments',body),request('/tailoring-workers/'+f.worker._id+'/work',input(f,secondOrder,'finishing'))]);assert.deepEqual(concurrent.map(row=>row.status).sort(),[201,409]);
});
