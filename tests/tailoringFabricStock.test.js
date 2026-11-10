import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import {randomUUID} from 'node:crypto';
import app from '../BackEnd/app.js';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import Fabric from '../BackEnd/models/Fabric.js';
import {tailoringStockFixture} from './helpers/tailoringStockFixture.js';
import {owner,otherOwner,employee,garment,orderInput} from './helpers/djellabaCostsFixture.js';
import {protectTailoringFabricDeletion} from '../BackEnd/utils/tailoringFabricStock.js';
const secret=process.env.JWT_SECRET;let server,base;
before(async()=>{process.env.JWT_SECRET='tailoring-stock-tests';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secret;});
const admin={id:owner,role:'admin'},staff={id:employee,role:'Employe'};
const request=async(suffix,body,method=body===undefined?'GET':'POST',actor=admin)=>{const res=await fetch(base+suffix,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign(actor,process.env.JWT_SECRET)},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:await res.json()};};
const shop=(f,patch={})=>garment({fabricSource:'shop',fabricId:String(f.fabric._id),colorId:String(f.fabric.colors[0]._id),fabricPieceId:String(f.fabric.colors[0].pieces[0]._id),fabricUnitPrice:30,fabricMeters:3,...patch});
const input=(f,patch={})=>orderInput({salePricingVersion:3,deductFabricStock:true,paidAmount:0,items:[shop(f)],...patch});
const create=async(f,patch,actor=admin)=>{const res=await request('/tailoring-orders',input(f,patch),'POST',actor);assert.equal(res.status,201,JSON.stringify(res.data));return res.data;};
const edit=(saved,patch={})=>({...saved,automaticCosting:true,salePricingVersion:3,deductFabricStock:true,costSettingsVersion:saved.costing.settingsVersion,version:saved.__v,items:saved.items.map(row=>({...row,fabricUnitPrice:row.costs.fabricUnitPrice})),...patch});
const report=async()=>{const res=await request('/fabrics/profits?source=tailoring');assert.equal(res.status,200);return res.data;};

test('three metres debit only the selected roll and cancellation restores exactly once',async t=>{
 const f=tailoringStockFixture(t),saved=await create(f,undefined,staff);assert.equal(f.meters(),32);assert.equal(f.meters(f.fabric,1),47);assert.equal(saved.fabricStock.rows[0].meters,3);assert.equal(saved.items[0].fabricPieceBarcode,f.fabric.colors[0].pieces[0].barcode);assert.equal((await report()).summary.profitAmount,45);
 for(let i=0;i<2;i++){const res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:saved.__v},'POST',staff);assert.equal(res.status,200);assert.equal(res.data.cancelledBy.name,'سعيد');assert.equal(res.data.deliveredAt,null);assert.ok(res.data.fabricStock.returnedAt);assert.equal(f.meters(),35);}
 const ledger=await report();assert.equal(ledger.summary.profitAmount,0);assert.equal(ledger.summary.revenueAmount,0);assert.equal(ledger.sales.length,1);assert.ok(ledger.sales[0].cancelledAt);
});
test('replaying and concurrent duplicate submissions never debit the same order twice',async t=>{
 const f=tailoringStockFixture(t),body=input(f),results=await Promise.all([request('/tailoring-orders',body),request('/tailoring-orders',body)]);assert.deepEqual(results.map(row=>row.status).sort(),[200,201]);assert.equal(f.orders.size,1);assert.equal(f.meters(),32);assert.equal((await request('/tailoring-orders',body)).status,200);assert.equal(f.meters(),32);
});
test('each garment is summed against its roll and over-allocation leaves both order and stock unchanged',async t=>{
 const f=tailoringStockFixture(t);let res=await request('/tailoring-orders',input(f,{items:[shop(f,{fabricMeters:20}),shop(f,{fabricMeters:16})]}));assert.equal(res.status,409);assert.equal(res.data.message,'insufficientFabricStock');assert.equal(f.orders.size,0);assert.equal(f.meters(),35);
 const saved=await create(f,{items:[shop(f,{fabricMeters:2.125}),shop(f,{fabricMeters:1.001}),garment({fabricMeters:2})]});assert.equal(f.meters(),31.874);assert.equal(saved.fabricStock.rows.length,2);
});
test('edits adjust only the meter difference and return removed or changed cloth',async t=>{
 const f=tailoringStockFixture(t),saved=await create(f);let res=await request('/tailoring-orders/'+saved._id,edit(saved,{items:[{...saved.items[0],fabricUnitPrice:30,fabricMeters:5}]}),'PUT');assert.equal(res.status,200);assert.equal(f.meters(),30);
 let row=res.data;res=await request('/tailoring-orders/'+row._id,edit(row,{items:[{...row.items[0],fabricUnitPrice:30,fabricMeters:2}]}),'PUT');assert.equal(res.status,200);assert.equal(f.meters(),33);
 row=res.data;res=await request('/tailoring-orders/'+row._id,edit(row,{items:[{...row.items[0],fabricUnitPrice:30,colorId:String(f.fabric.colors[1]._id),fabricPieceId:String(f.fabric.colors[1].pieces[0]._id)}]}),'PUT');assert.equal(res.status,200);assert.equal(f.meters(),35);assert.equal(f.meters(f.fabric,1),45);
 row=res.data;res=await request('/tailoring-orders/'+row._id,edit(row,{items:[{...row.items[0],fabricSource:'client',fabricType:'ثوب الزبون',fabricUnitPrice:0}]}),'PUT');assert.equal(res.status,200);assert.equal(f.meters(f.fabric,1),47);assert.equal(res.data.fabricStock.rows.length,0);assert.equal((await report()).sales.length,0);
});
test('insufficient edits, stale versions and disabling stock cannot change a committed debit',async t=>{
 const f=tailoringStockFixture(t),saved=await create(f);for(const patch of [{items:[{...saved.items[0],fabricUnitPrice:30,fabricMeters:36}]},{deductFabricStock:false},{version:99}]){const res=await request('/tailoring-orders/'+saved._id,edit(saved,patch),'PUT');assert.ok([400,409].includes(res.status));assert.equal(f.meters(),32);assert.equal(f.orders.get(saved._id).items[0].fabricMeters,3);}
});
test('stock from another owner, wrong colors, missing rolls and non-stock client fabric are handled safely',async t=>{
 const f=tailoringStockFixture(t),foreign=f.seedFabric(30,otherOwner);for(const patch of [{fabricPieceId:undefined},{fabricPieceId:'bad'},{fabricPieceId:String(f.fabric.colors[1].pieces[0]._id)},{fabricId:String(foreign._id)}]){const res=await request('/tailoring-orders',input(f,{items:[shop(f,patch)]}));assert.ok([400,404,409].includes(res.status));assert.equal(f.meters(),35);}
 const saved=await create(f,{items:[garment({fabricMeters:3})]});assert.equal(saved.fabricStock.rows.length,0);assert.equal(f.meters(),35);
});
for(const fault of ['failFabricBefore','failFabricAfter','failOrderCreate'])test(fault+' rolls back all stock and financial writes',async t=>{
 const f=tailoringStockFixture(t);f.controls[fault]=true;const res=await request('/tailoring-orders',input(f));assert.equal(res.status,503);assert.equal(f.meters(),35);assert.equal(f.orders.size,0);assert.equal((await report()).summary.profitAmount,0);
});
test('failed order edits and cancellations roll back their stock changes',async t=>{
 const f=tailoringStockFixture(t),saved=await create(f);f.faults.orderSave=true;let res=await request('/tailoring-orders/'+saved._id,edit(saved,{items:[{...saved.items[0],fabricUnitPrice:30,fabricMeters:5}]}),'PUT');assert.equal(res.status,503);assert.equal(f.meters(),32);
 res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:saved.__v});assert.equal(res.status,503);assert.equal(f.meters(),32);assert.equal(f.orders.get(saved._id).cancelledAt,undefined);assert.equal((await report()).summary.profitAmount,45);
});
test('transaction retry does not double-consume or double-restore metres',async t=>{
 const f=tailoringStockFixture(t);f.controls.retryTransactionOnce=true;const saved=await create(f);assert.equal(f.meters(),32);f.controls.retryTransactionOnce=true;const res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:saved.__v});assert.equal(res.status,200);assert.equal(f.meters(),35);
});
test('delivery and payments keep the debit; cancelling a delivered order restores it and excludes profits',async t=>{
 const f=tailoringStockFixture(t),saved=await create(f);let res=await request('/tailoring-orders/'+saved._id+'/payments',{version:saved.__v,requestId:randomUUID(),amount:10});assert.equal(res.status,200);assert.equal(f.meters(),32);
 res=await request('/tailoring-orders/'+saved._id+'/deliver',{version:res.data.__v});assert.equal(res.status,200);assert.equal(f.meters(),32);res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:res.data.__v});assert.equal(res.status,200);assert.equal(f.meters(),35);assert.equal(res.data.paidAmount,10);assert.equal((await report()).summary.profitAmount,0);
});
test('active roll references prevent deleting stock until cancellation',async t=>{
 const f=tailoringStockFixture(t),saved=await create(f);let fabric=f.fabrics.get(String(f.fabric._id));assert.equal(fabric.tailoringOrderIds.length,1);await assert.rejects(protectTailoringFabricDeletion(fabric,null),{message:'tailoringFabricInUse'});await protectTailoringFabricDeletion(fabric,new Set([String(fabric.colors[1].pieces[0]._id)]));
 const res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:saved.__v});assert.equal(res.status,200);fabric=f.fabrics.get(String(f.fabric._id));assert.equal(fabric.tailoringOrderIds.length,0);await protectTailoringFabricDeletion(fabric,null);
});
test('legacy orders have no invented stock to restore',async t=>{
 const f=tailoringStockFixture(t),saved=await create(f,{deductFabricStock:false});assert.equal(saved.fabricStock,undefined);assert.equal(f.meters(),35);let res=await request('/tailoring-orders/'+saved._id+'/deliver',{version:saved.__v});assert.equal(res.status,200);res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:res.data.__v});assert.equal(res.status,200);assert.equal(f.meters(),35);
});
test('multiple fabrics roll back together if a later stock write fails',async t=>{
 const f=tailoringStockFixture(t),other=f.seedFabric(30);other.__v=0;other.purchasePricePerMeter=15;const baseSave=Fabric.prototype.save;let calls=0;t.mock.method(Fabric.prototype,'save',async function(options){if(++calls===2)throw new Error('Second fabric failed');return baseSave.call(this,options);});
 const res=await request('/tailoring-orders',input(f,{items:[shop(f),shop(f,{fabricId:String(other._id),colorId:String(other.colors[0]._id),fabricPieceId:String(other.colors[0].pieces[0]._id)})]}));assert.equal(res.status,503);assert.equal(f.meters(),35);assert.equal(f.meters(other),35);assert.equal(f.orders.size,0);
});

test('standalone MongoDB debits, edits and cancels through durable replay markers',async t=>{
 const f=tailoringStockFixture(t);f.controls.standalone=true;const saved=await create(f);assert.equal(f.meters(),32);assert.equal(saved.stockOperation,undefined);assert.equal(f.fabrics.get(String(f.fabric._id)).tailoringStockOperations.length,1);
 let res=await request('/tailoring-orders/'+saved._id,edit(saved,{items:[{...saved.items[0],fabricUnitPrice:30,fabricMeters:4.125}]}),'PUT');assert.equal(res.status,200,JSON.stringify(res.data));assert.equal(f.meters(),30.875);assert.equal(res.data.fabricStock.rows[0].meters,4.125);
 res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:res.data.__v});assert.equal(res.status,200);assert.equal(f.meters(),35);assert.equal((await report()).summary.profitAmount,0);assert.ok(res.data.fabricStock.returnedAt);
});
test('standalone lost stock acknowledgement resumes without a second debit or duplicate profit',async t=>{
 const f=tailoringStockFixture(t);f.controls.standalone=true;f.controls.failFabricAfter=true;const body=input(f);let res=await request('/tailoring-orders',body);assert.equal(res.status,503);assert.equal(f.meters(),32);assert.ok([...f.orders.values()][0].stockOperation);assert.equal((await report()).summary.profitAmount,0);
 delete f.controls.failFabricAfter;res=await request('/tailoring-orders',body);assert.equal(res.status,200);assert.equal(res.data.stockOperation,undefined);assert.equal(f.meters(),32);assert.equal((await report()).summary.profitAmount,45);assert.equal(f.orders.size,1);
});
test('standalone interrupted order commit is completed by a normal list refresh',async t=>{
 const f=tailoringStockFixture(t);f.controls.standalone=true;f.controls.failOrderCommitOnce=true;let res=await request('/tailoring-orders',input(f));assert.equal(res.status,503);assert.equal(f.meters(),32);assert.equal((await report()).summary.profitAmount,0);
 res=await request('/tailoring-orders');assert.equal(res.status,200);assert.equal(res.data.orders.length,1);assert.equal(res.data.orders[0].stockOperation,undefined);assert.equal(f.meters(),32);assert.equal((await report()).summary.profitAmount,45);
});
test('standalone insufficient stock after reservation intent rolls back earlier fabric debits',async t=>{
 const f=tailoringStockFixture(t);f.controls.standalone=true;const other=f.seedFabric(30);other.__v=0;other.purchasePricePerMeter=15;
 f.controls.afterIntent=()=>{f.fabrics.get(String(other._id)).colors[0].pieces[0].meters=0;};
 const res=await request('/tailoring-orders',input(f,{items:[shop(f),shop(f,{fabricId:String(other._id),colorId:String(other.colors[0]._id),fabricPieceId:String(other.colors[0].pieces[0]._id)})]}));assert.equal(res.status,409,JSON.stringify(res.data));assert.equal(f.meters(),35);assert.equal(f.meters(other),0);assert.equal(f.orders.size,0);assert.equal((await report()).sales.length,0);
});
test('standalone cancellation with a lost acknowledgement returns metres only once',async t=>{
 const f=tailoringStockFixture(t);f.controls.standalone=true;const saved=await create(f);f.controls.failFabricAfter=true;let res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:saved.__v});assert.equal(res.status,503);assert.equal(f.meters(),35);
 delete f.controls.failFabricAfter;res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:saved.__v});assert.equal(res.status,200);assert.equal(f.meters(),35);assert.ok(res.data.cancelledAt);
});
