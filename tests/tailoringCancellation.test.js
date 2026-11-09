import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import TailoringOrder from '../BackEnd/models/TailoringOrder.js';
import JabadorCostSettings from '../BackEnd/models/JabadorCostSettings.js';
import MalakiyaCostSettings from '../BackEnd/models/MalakiyaCostSettings.js';
import { djellabaFixture, owner, otherOwner, employee, garment, orderInput } from './helpers/djellabaCostsFixture.js';
import { validateTailoringOrder, TAILORING_GARMENT_TYPES, tailoringUsesSfifa } from '../shared/tailoring.js';
import { tailoringProfitEntries, summarizeTailoringProfits, filterTailoringProfits, groupTailoringProfits } from '../shared/tailoringProfits.js';
import { employeeCanRequest, canEmployeeOperation } from '../shared/employeePermissions.js';
import app from '../BackEnd/app.js';

const admin={id:owner,role:'admin'},staff={id:employee,role:'Employe',idAdmin:otherOwner,name:'FORGED'};
const previousSecret=process.env.JWT_SECRET;
let server,base;
before(async()=>{process.env.JWT_SECRET='isolated-tailoring-cancellation';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/tailoring-orders`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
async function request(suffix='',body,actor=admin,method=body?'POST':'GET') {
  const response=await fetch(base+suffix,{method,headers:{Authorization:`Bearer ${jwt.sign(actor,process.env.JWT_SECRET)}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
}
function setup(t) {const f=djellabaFixture(t);Object.assign(f.staff,{name:'خديجة الأصلية',role:'Employe',moduleAccess:['tailoring'],operationPermissions:{tailoring:['payment','cancel']}});return f;}
async function create(type='trousers',patch={}) {
  const input=orderInput({garmentType:type,automaticCosting:false,expenseAmount:75,items:[garment({trouserType:'regular',shirtType:'قميص رجالي'})],...patch});
  const result=await request('',input);assert.equal(result.status,201,JSON.stringify(result));return result.data;
}
async function deliver(order) {const result=await request(`/${order._id}/deliver`,{version:order.__v});assert.equal(result.status,200,JSON.stringify(result));return result.data;}
const cancel=(order,actor=admin,extra={})=>request(`/${order._id}/cancel`,{version:order.__v,...extra},actor);
const pay=(order,actor=staff,extra={})=>request(`/${order._id}/payments`,{version:order.__v,amount:20,requestId:randomUUID(),...extra},actor);

test('cancellation removes revenue and profit for all five sections and retains an auditable order',async t=>{
  const f=setup(t);f.seedSettings();
  for(const model of [JabadorCostSettings,MalakiyaCostSettings])t.mock.method(model,'findOne',async()=>f.settings.get(owner));
  for(const type of TAILORING_GARMENT_TYPES){
    const automatic=tailoringUsesSfifa({garmentType:type});
    const saved=await deliver(await create(type,{automaticCosting:automatic}));
    assert.equal(summarizeTailoringProfits(tailoringProfitEntries([saved],type)).profitAmount,automatic?460:425);
    const result=await cancel(saved,staff,{cancelledAt:'1900-01-01',cancelledBy:{id:otherOwner,name:'FORGED',role:'admin'},deliveryFinancials:{revenueAmount:0,expenseAmount:0,garmentCount:50}});
    assert.equal(result.status,200,JSON.stringify(result));const cancelled=result.data;
    assert.deepEqual(cancelled.cancelledBy,{id:employee,name:'خديجة الأصلية',role:'Employe'});
    assert.ok(new Date(cancelled.cancelledAt).getFullYear()>=2026);
    assert.equal(cancelled.deliveredAt,saved.deliveredAt);assert.deepEqual(cancelled.deliveryFinancials,saved.deliveryFinancials);
    assert.deepEqual([cancelled.totalPrice,cancelled.paidAmount,cancelled.remainingAmount],[500,100,400]);
    assert.equal(tailoringProfitEntries([cancelled],type).length,0);
    const history=tailoringProfitEntries([cancelled],type,{includeCancelled:true});assert.equal(history.length,1);
    assert.deepEqual(summarizeTailoringProfits(history),{revenueAmount:0,expenseAmount:0,profitAmount:0,orderCount:0,garmentCount:0,unknownCount:0});
    assert.equal(history[0].cancelledBy.name,'خديجة الأصلية');
  }
  assert.equal(f.orders.size,5);
  const listing=await request();assert.equal(listing.data.orders.length,5);
  assert.equal(summarizeTailoringProfits(tailoringProfitEntries(listing.data.orders,'all')).profitAmount,0);
});

test('repeated and concurrent cancellation cannot deduct twice or replace the original actor and date',async t=>{
  const f=setup(t),saved=await deliver(await create());
  const results=await Promise.all([cancel(saved,staff),cancel(saved,admin)]);
  assert.equal(results.filter(row=>row.status===200).length>=1,true);
  assert.ok(results.every(row=>[200,409].includes(row.status)));
  const original=results.find(row=>row.status===200).data,version=original.__v;
  f.staff.name='اسم آخر';
  const repeated=await cancel(saved,staff);assert.equal(repeated.status,200);
  assert.equal(repeated.data.__v,version);assert.equal(repeated.data.cancelledAt,original.cancelledAt);assert.deepEqual(repeated.data.cancelledBy,original.cancelledBy);
  assert.equal(f.orders.get(saved._id).__v,version);
});

test('pending orders, failed saves and stale writes do not remove recognized profit',async t=>{
  const f=setup(t),pending=await create();
  assert.deepEqual((await cancel(pending)).data,{message:'orderNotDelivered'});
  const saved=await deliver(pending);
  assert.equal((await cancel({...saved,__v:99})).status,409);
  f.faults.orderSave=true;assert.equal((await cancel(saved)).status,500);
  assert.equal(f.orders.get(saved._id).cancelledAt,undefined);
  assert.equal(summarizeTailoringProfits(tailoringProfitEntries([f.orders.get(saved._id)],'all')).profitAmount,425);
  f.faults.orderSave=false;assert.equal((await cancel(saved)).status,200);
});

test('cancelled orders reject updates, new payments and delivery while retaining existing receipts',async t=>{
  setup(t);const saved=await deliver(await create()),paid=await pay(saved);
  assert.equal(paid.status,200);const cancelled=await cancel(paid.data);assert.equal(cancelled.status,200);
  const order=cancelled.data;
  for(const result of [await pay(order),await request(`/${order._id}/deliver`,{version:order.__v}),await request(`/${order._id}`,{...validateTailoringOrder(order),version:order.__v},admin,'PUT')]){
    assert.equal(result.status,409);assert.equal(result.data.message,'orderCancelled');
  }
  assert.equal(order.addedPayments.length,1);assert.deepEqual(order.addedPayments[0],paid.data.addedPayments[0]);
});

test('a concurrent payment and cancellation cannot overwrite each other',async t=>{
  const f=setup(t),order=await deliver(await create());
  const results=await Promise.all([pay(order),cancel(order)]);
  assert.equal(results.filter(row=>row.status===200).length,1);
  assert.equal(results.filter(row=>row.status===409).length,1);
  let current=(await request()).data.orders[0];
  if(!current.cancelledAt){assert.equal(current.paidAmount,120);current=(await cancel(current)).data;}
  assert.equal(current.paidAmount,f.orders.get(order._id).paidAmount);
  assert.equal(current.paidAmount===120?current.addedPayments.length===1:current.addedPayments.length===0,true);
  assert.equal(tailoringProfitEntries([current],'all').length,0);
});

test('cancellation has a separate live employee permission and remains owner scoped',async t=>{
  const f=setup(t),order=await deliver(await create());
  for(const operations of [[],['deliver'],['payment'],['update']]){f.staff.operationPermissions.tailoring=operations;assert.equal((await cancel(order,staff)).status,403);}
  f.staff.operationPermissions.tailoring=['cancel'];f.staff.moduleAccess=[];assert.equal((await cancel(order,staff)).status,403);
  f.staff.moduleAccess=['tailoring'];f.staff.isActive=false;assert.equal((await cancel(order,staff)).status,403);f.staff.isActive=true;
  assert.equal((await cancel(order,{id:otherOwner,role:'admin'})).status,404);
  assert.equal((await request('/not-an-id/cancel',{version:0})).status,404);
  assert.equal((await cancel(order,staff)).status,200);
  f.staff.operationPermissions.tailoring=[];assert.equal((await cancel(order,staff)).status,403);
  const legacy={action:{delete:false},moduleAccess:['tailoring']};assert.equal(canEmployeeOperation('Employe',legacy,'tailoring','cancel'),false);
  legacy.action.delete=true;assert.equal(canEmployeeOperation('Employe',legacy,'tailoring','cancel'),true);
  assert.equal(employeeCanRequest({moduleAccess:['tailoring'],operationPermissions:{tailoring:['cancel']}},'POST','/tailoring-orders/id/cancel'),true);
});

test('payment history snapshots trusted employee identity, including lost-response retries and later renames',async t=>{
  const f=setup(t),order=await create(),requestId=randomUUID();
  const paid=await pay(order,staff,{requestId,actor:{id:otherOwner,name:'FORGED',role:'admin'},createdBy:otherOwner});assert.equal(paid.status,200);
  assert.deepEqual(paid.data.paymentReceipt.actor,{id:employee,name:'خديجة الأصلية',role:'Employe'});
  assert.deepEqual(paid.data.addedPayments[0].actor,paid.data.paymentReceipt.actor);
  assert.equal(String(f.orders.get(order._id).paymentReceipts[0].createdBy),employee);
  f.staff.name='اسم جديد';const retry=await pay(order,staff,{requestId});assert.equal(retry.status,200);assert.equal(retry.data.paymentReceipt.actor.name,'خديجة الأصلية');assert.equal(retry.data.paidAmount,120);
  f.staff.isActive=false;const listing=await request();assert.equal(listing.data.orders[0].addedPayments[0].actor.name,'خديجة الأصلية');
  const adminPaid=await pay(paid.data,admin);assert.equal(adminPaid.status,200);assert.equal(adminPaid.data.addedPayments[1].actor.role,'admin');assert.equal(adminPaid.data.addedPayments[1].actor.id,owner);
});

test('legacy deliveries freeze their figures on cancellation and legacy payment actors stay unknown',async t=>{
  const f=setup(t),order=await create(),legacy=f.orders.get(order._id);
  legacy.deliveredAt=new Date('2025-01-12T12:00:00Z');legacy.paymentReceipts.push({requestId:randomUUID(),amount:10,paidAt:new Date('2025-01-12T12:00:00Z'),createdBy:employee});
  const result=await cancel(order);assert.equal(result.status,200);assert.deepEqual(result.data.deliveryFinancials,{revenueAmount:500,expenseAmount:75,garmentCount:1});
  assert.equal(result.data.deliveredAt,'2025-01-12T12:00:00.000Z');assert.equal(result.data.addedPayments[0].actor,undefined);
});

test('cancelled history uses the cancellation calendar date and does not affect period or section totals',()=>{
  const make=(id,type,expense,extra={})=>({_id:id.repeat(24),clientName:'زبون',phone:'0612345678',garmentType:type,deliveredAt:'2026-10-31T10:00:00Z',totalPrice:100,expenseAmount:expense,...extra});
  const rows=[make('1','trousers',30),make('2','shirts',20,{cancelledAt:'2026-11-02T10:00:00Z',cancelledBy:{name:'خديجة'}}),make('3','djellaba',undefined,{cancelledAt:'2026-11-02T10:00:00Z'}),make('4','jabador',120)];
  const entries=tailoringProfitEntries(rows,'all',{includeCancelled:true}),summary=summarizeTailoringProfits(entries);
  assert.deepEqual(summary,{revenueAmount:200,expenseAmount:150,profitAmount:50,orderCount:2,garmentCount:2,unknownCount:0});
  const november=filterTailoringProfits(entries,{mode:'month',period:'2026-11',timeZone:'UTC'});assert.equal(november.length,2);assert.equal(summarizeTailoringProfits(november).revenueAmount,0);
  assert.deepEqual(groupTailoringProfits(entries,'year','UTC').map(row=>[row.key,row.profitAmount]),[['2026-11',0],['2026-10',50]]);
  assert.equal(filterTailoringProfits(entries,{mode:'day',period:'2026-11-02',timeZone:'UTC',search:'زبون'}).length,2);
});

test('the model requires a complete cancellation audit and optional payment actors must be valid',async t=>{
  const f=setup(t),order=await deliver(await create()),source=f.orders.get(order._id).toObject();
  for(const patch of [{cancelledAt:new Date()},{cancelledBy:{id:owner,role:'admin'}},{cancelledAt:new Date(),cancelledBy:{id:owner,role:'admin'},deliveredAt:null},{cancelledAt:new Date(),cancelledBy:{id:owner,role:'admin'},deliveryFinancials:undefined}])await assert.rejects(new TailoringOrder({...source,...patch}).validate());
  await new TailoringOrder({...source,cancelledAt:new Date(),cancelledBy:{id:owner,role:'admin'}}).validate();
  await assert.rejects(new TailoringOrder({...source,paymentReceipts:[{requestId:randomUUID(),amount:10,paidAt:new Date(),createdBy:owner,actor:{id:owner,role:'unknown'}}]}).validate());
});
