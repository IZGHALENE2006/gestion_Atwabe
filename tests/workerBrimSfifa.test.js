import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import WorkerWork from '../BackEnd/models/WorkerWork.js';
import SfifaStock from '../BackEnd/models/SfifaStock.js';
import { validateWorkerWork } from '../shared/workerWork.js';
import { validateSfifaStock } from '../shared/sfifaStock.js';
import { workerSfifaCreditsStock } from '../shared/workerSfifa.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner } from './helpers/djellabaCostsFixture.js';

process.env.JWT_SECRET = 'isolated-brim-customer-sfifa';
const { default: app } = await import('../BackEnd/app.js');
let server, base;
before(async () => { server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`; });
after(()=>{server.closeAllConnections();server.close();});
const request = async (path,body,method=body===undefined?'GET':'POST') => {
  const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${jwt.sign({id:owner,role:'admin'},process.env.JWT_SECRET)}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json()};
};
const pathFor = worker=>`/tailoring-workers/${worker._id}/work`;
const customerInput = (workType='client')=>({category:'sfifa',workType,quantity:12,unitWage:2.5,sfifa:{width:'thick',family:'customer'},requestId:randomUUID()});

test('brim shop work accepts quantity and wage alone while other shop sections still require names',()=>{
  assert.deepEqual(validateWorkerWork({category:'brim',workType:'shop',quantity:'3',unitWage:'4.50'}),{category:'brim',workType:'shop',productName:'Brim',quantity:3,unitWage:4.5});
  assert.equal(validateWorkerWork({category:'brim',quantity:2,productName:'عمل سابق'}).productName,'عمل سابق');
  for(const category of ['machine','finishing','shirts','mesbanto'])assert.throws(()=>validateWorkerWork({category,workType:'shop',quantity:2}),error=>error.fields.productName==='required');
  assert.throws(()=>validateWorkerWork({category:'brim',workType:'client',quantity:2}),error=>error.fields.orderId==='chooseOrder');
});
test('customer sfifa retains width and exact metres without a stock number',()=>{
  const value=validateWorkerWork({...customerInput(),quantity:'1,125',sfifa:{width:'thin',family:'customer',code:''}});
  assert.deepEqual(value.sfifa,{width:'thin',family:'customer'});assert.equal(value.quantity,1.125);
  for(const patch of [{quantity:0},{quantity:'0.0001'},{sfifa:{width:'other',family:'customer'}},{sfifa:{width:'thin',family:'customer',code:12}}])assert.throws(()=>validateWorkerWork({...customerInput(),...patch}),/invalidWork/);
  assert.throws(()=>validateSfifaStock({...customerInput().sfifa,quantity:3}));
  assert.equal(workerSfifaCreditsStock({workType:'shop',sfifa:{family:'customer'}}),false);
});
for(const workType of ['shop','client'])test(`customer-owned ${workType} sfifa earns wages without stock or restock receipts, even on retries`,async t=>{
  const f=workerMaterialsFixture(t),before=(await request('/sfifa-stock')).data.items;
  const input=customerInput(workType),assigned=await request(pathFor(f.worker),input);assert.equal(assigned.status,201,JSON.stringify(assigned));
  assert.deepEqual(assigned.data.sfifa,{width:'thick',family:'customer'});
  const replay=await request(pathFor(f.worker),input);assert.equal(replay.status,200);assert.equal(replay.data._id,assigned.data._id);
  const body={quantity:4,requestId:randomUUID(),version:assigned.data.__v};
  const complete=await request(`${pathFor(f.worker)}/${assigned.data._id}/completions`,body);assert.equal(complete.status,201,JSON.stringify(complete));
  assert.equal(complete.data.remainingQuantity,8);assert.equal(complete.data.completions[0].earningAmount,10);
  assert.equal((await request(`${pathFor(f.worker)}/${assigned.data._id}/completions`,body)).status,200);
  const group=f.stocks.find(stock=>stock.family==='customer');assert.equal(group.quantity,0);assert.equal(group.receipts.length,0);assert.equal(group.variants.length,0);assert.equal(group.production[0].completions[0].stockCredited,false);
  assert.deepEqual((await request('/sfifa-stock')).data.items,before);
  const payroll=await request(`/tailoring-workers/${f.worker._id}/payroll`);assert.equal(payroll.status,200);assert.equal(payroll.data.totals.earned,10);
});
test('customer sfifa can link to an order and remains in order tracking',async t=>{
  const f=workerMaterialsFixture(t),order=f.seedGarmentOrder('djellaba');
  const result=await request(pathFor(f.worker),{...customerInput(),linkOrder:true,orderId:String(order._id),lineIds:[order.items[0].lineId]});
  assert.equal(result.status,201,JSON.stringify(result));assert.equal(result.data.tailoring.orderId,String(order._id));assert.equal(result.data.sfifa.family,'customer');
  const tracking=await request('/tailoring-orders/work-status');assert.equal(tracking.status,200,JSON.stringify(tracking));assert.ok(JSON.stringify(tracking.data).includes('customer'));
});
test('customer-supplied production containers cannot hold shop stock or fabricated stock credits',async()=>{
  const base={idAdmin:owner,createdBy:owner,width:'thick',family:'customer',quantity:0,unassignedQuantity:0,variants:[]};
  await new SfifaStock(base).validate();
  for(const patch of [{quantity:1,unassignedQuantity:1},{variants:[{code:1,quantity:0}]},{receipts:[{requestId:randomUUID(),quantity:1,createdBy:owner,date:new Date()}]}])await assert.rejects(()=>new SfifaStock({...base,...patch}).validate());
  const work=new WorkerWork({...validateWorkerWork(customerInput('shop')),idAdmin:owner,createdBy:owner,workerId:owner,requestId:randomUUID(),requestFingerprint:'test',completedQuantity:1,completions:[{requestId:randomUUID(),quantity:1,before:12,after:11,date:new Date(),createdBy:owner,sequence:1,stockCredited:true}]});
  await assert.rejects(()=>work.validate());
});
test('nameless brim assignment can be saved, completed and paid per piece',async t=>{
  const f=workerMaterialsFixture(t),result=await request(pathFor(f.worker),{category:'brim',workType:'shop',quantity:3,unitWage:5,requestId:randomUUID()});assert.equal(result.status,201,JSON.stringify(result));
  const complete=await request(`${pathFor(f.worker)}/${result.data._id}/completions`,{quantity:2,requestId:randomUUID(),version:result.data.__v});assert.equal(complete.status,201,JSON.stringify(complete));assert.equal(complete.data.remainingQuantity,1);assert.equal(complete.data.completions[0].earningAmount,10);
});
