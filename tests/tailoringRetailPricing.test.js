import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import app from '../BackEnd/app.js';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import TailoringOrder from '../BackEnd/models/TailoringOrder.js';
import FabricMovement from '../BackEnd/models/FabricMovement.js';
import { djellabaFixture, owner, otherOwner, employee, garment, orderInput, query } from './helpers/djellabaCostsFixture.js';
import { djellabaItemCosts, djellabaItemSalePrice } from '../shared/tailoringCosts.js';
import { publicFabricSaleReceipt } from '../shared/fabricSales.js';
import { fabricProfitReceiptMovement } from '../shared/fabricProfits.js';

const secret=process.env.JWT_SECRET;let server,base;
before(async()=>{process.env.JWT_SECRET='tailoring-retail-tests';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secret;});
const admin={id:owner,role:'admin'},staff={id:employee,role:'Employe',idAdmin:otherOwner};
const request=(suffix,body,actor=admin,method=body===undefined?'GET':'POST')=>fetch(base+suffix,{method,headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+jwt.sign(actor,process.env.JWT_SECRET)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
function setup(t){const f=djellabaFixture(t);f.staff.name='سعيد';t.mock.method(FabricMovement,'find',()=>query(()=>[]));return f;}
const modern=patch=>orderInput({salePricingVersion:2,paidAmount:0,...patch});
const shop=(fabric,patch)=>garment({fabricSource:'shop',fabricId:String(fabric._id),colorId:String(fabric.colors[0]._id),fabricUnitPrice:fabric.salePricePerMeter,fabricMeters:2.5,price:500,...patch});
const seed=f=>{f.seedSettings({thinSfifaPrice:10,thickSfifaPrice:20,laborPrice:999});const fabric=f.seedFabric(30);fabric.purchasePricePerMeter=15;fabric.wholesalePricePerMeter=22;return fabric;};
const create=async(body,actor=admin)=>{const res=await request('/tailoring-orders',body,actor);const result=await res.json();assert.equal(res.status,201,JSON.stringify(result));return result;};
const report=async(params='',actor=admin)=>{const res=await request('/fabrics/profits'+(params?'?'+params:''),undefined,actor);const result=await res.json();assert.equal(res.status,200,JSON.stringify(result));return result;};
const editInput=(order,patch)=>({...order,automaticCosting:true,salePricingVersion:2,costSettingsVersion:order.costing.settingsVersion,version:order.__v,items:order.items.map(item=>({...item,fabricUnitPrice:item.costs.fabricUnitPrice})),...patch});

test('garment price uses retail metres plus selected sfifa, ignoring labor and forged selling prices',async t=>{
  const f=setup(t),fabric=seed(f);const saved=await create(modern({items:[shop(fabric,{price:999})]}));
  assert.deepEqual([saved.totalPrice,saved.expenseAmount,saved.profitAmount],[85,75,10]);
  assert.deepEqual([saved.items[0].price,saved.items[0].costs.fabricUnitPrice,saved.items[0].costs.sfifaAmount,saved.items[0].costs.laborAmount],[85,30,10,0]);
  assert.equal(saved.costing.pricingVersion,2);assert.equal(saved.costing.rates.laborPrice,0);assert.equal(saved.items[0].fabricSale,undefined);
  const ledger=await report('source=tailoring');assert.equal(ledger.sales.length,1);const row=ledger.sales[0];
  assert.deepEqual([row.meters,row.unitPrice,row.revenueAmount,row.costAmount,row.profitAmount],[2.5,30,75,37.5,37.5]);
  assert.equal(row.source,'tailoring');assert.equal(row.sourceOrderId,saved._id);assert.equal(row.sourceOrderBarcode,saved.barcode);
  assert.equal(saved.profitAmount+row.profitAmount,saved.totalPrice-row.costAmount);
});

test('each garment independently selects thin or wide sfifa, while client cloth generates no fabric sale',async t=>{
  const f=setup(t),fabric=seed(f);const saved=await create(modern({items:[shop(fabric),shop(fabric,{fabricMeters:2,sfifa:{width:'thick',style:'fabric'}}),garment({fabricMeters:3,price:999})]}));
  assert.deepEqual(saved.items.map(item=>item.price),[85,80,10]);assert.equal(saved.totalPrice,175);assert.equal(saved.expenseAmount,135);assert.equal(saved.profitAmount,40);
  const ledger=await report();assert.equal(ledger.summary.saleCount,2);assert.equal(ledger.summary.totalMeters,4.5);assert.equal(ledger.summary.profitAmount,67.5);
});

test('two-field settings can be saved without a labor rate; old stored labor does not enter new quotes',async t=>{
  const f=setup(t);let res=await request('/tailoring-orders/cost-settings?pricingVersion=2',{rates:{thinSfifaPrice:15,thickSfifaPrice:25},version:null},admin,'PUT');assert.equal(res.status,200);
  let data=await res.json();assert.deepEqual(data.rates,{thinSfifaPrice:15,thickSfifaPrice:25});assert.equal(f.settings.get(owner).laborPrice,0);
  res=await request('/tailoring-orders/cost-settings?pricingVersion=2',{rates:{thinSfifaPrice:16,thickSfifaPrice:26,laborPrice:999},version:0},admin,'PUT');assert.equal(res.status,200);data=await res.json();assert.deepEqual(data.rates,{thinSfifaPrice:16,thickSfifaPrice:26});
  const saved=await create(modern({costSettingsVersion:data.version,items:[garment()]}));assert.equal(saved.totalPrice,16);assert.equal(saved.profitAmount,16);
});

test('employee identity is kept in the order-sourced fabric record and cloth statement',async t=>{
  const f=setup(t),fabric=seed(f);const saved=await create(modern({items:[shop(fabric)]}),staff);
  f.staff.name='اسم جديد';const ledger=await report();const row=ledger.sales[0];assert.equal(row.sellerName,'سعيد');assert.equal(row.sellerRole,'Employe');
  const receipt=publicFabricSaleReceipt(fabricProfitReceiptMovement(row));assert.equal(receipt.createdByName,'سعيد');assert.equal(receipt.source,'tailoring');assert.equal(receipt.sourceOrderBarcode,saved.barcode);assert.equal(receipt.costAmount,undefined);assert.equal(receipt.purchaseUnitPrice,undefined);
  assert.equal(saved.customerReceipt.totalPrice,85);assert.equal(saved.customerReceipt.items[0].fabricSale,undefined);
});

test('cloth profit is recognized at registration and later payments never create a second cloth sale',async t=>{
  const f=setup(t),fabric=seed(f),saved=await create(modern({paidAmount:25,items:[shop(fabric)]}));
  assert.equal(saved.totalPrice,85);assert.equal(saved.remainingAmount,60);assert.equal(saved.deliveredAt,null);assert.equal(saved.customerReceipt.totalPrice,85);assert.equal(saved.customerReceipt.paidAmount,25);
  let ledger=await report();assert.equal(ledger.sales.length,1);assert.equal(ledger.summary.profitAmount,37.5);
  const body={amount:10,requestId:randomUUID(),version:0};let res=await request('/tailoring-orders/'+saved._id+'/payments',body);assert.equal(res.status,200);assert.equal((await res.json()).remainingAmount,50);
  res=await request('/tailoring-orders/'+saved._id+'/payments',body);assert.equal(res.status,200);ledger=await report();assert.equal(ledger.sales.length,1);assert.equal(ledger.summary.profitAmount,37.5);
});

test('creating an order can record its cloth sale without granting the employee direct fabric sales or profit access',async t=>{
  const f=setup(t),fabric=seed(f);f.staff.moduleAccess=['tailoring'];f.staff.operationPermissions={tailoring:['add']};
  await create(modern({items:[shop(fabric)]}),staff);assert.equal((await request('/fabrics/profits',undefined,staff)).status,403);const ledger=await report();assert.equal(ledger.sales[0].sellerName,'سعيد');
});

test('retrying the same order and concurrent submissions produce one cloth profit entry',async t=>{
  const f=setup(t),fabric=seed(f),body=modern({items:[shop(fabric)]});
  const responses=await Promise.all([request('/tailoring-orders',body),request('/tailoring-orders',body)]);assert.deepEqual(responses.map(row=>row.status).sort(),[200,201]);
  fabric.purchasePricePerMeter=29;fabric.salePricePerMeter=90;f.settings.get(owner).thinSfifaPrice=999;
  const retry=await request('/tailoring-orders',body);assert.equal(retry.status,200);const ledger=await report();assert.equal(ledger.summary.saleCount,1);assert.equal(ledger.summary.profitAmount,37.5);
});

test('failed order persistence never creates orphan fabric profits',async t=>{
  const f=setup(t),fabric=seed(f);f.orderCreate.mock.mockImplementation(async()=>{throw new Error('Private write failure');});
  const res=await request('/tailoring-orders',modern({items:[shop(fabric)]}));assert.equal(res.status,500);assert.equal(f.orders.size,0);assert.equal((await report()).summary.saleCount,0);
});

test('editing meters or sfifa preserves original retail and purchase rates even if stock is deleted',async t=>{
  const f=setup(t),fabric=seed(f),saved=await create(modern({items:[shop(fabric)]}));f.fabrics.clear();f.settings.get(owner).thinSfifaPrice=999;f.settings.get(owner).__v=2;
  const input=editInput(saved,{items:saved.items.map(item=>({...item,fabricMeters:3,fabricUnitPrice:30,sfifa:{width:'thick',style:'fabric'}}))});
  const res=await request('/tailoring-orders/'+saved._id,input,admin,'PUT');assert.equal(res.status,200);const changed=await res.json();assert.deepEqual([changed.totalPrice,changed.expenseAmount,changed.profitAmount],[110,90,20]);
  const ledger=await report();assert.equal(ledger.sales.length,1);assert.equal(ledger.sales[0].profitAmount,45);assert.equal(ledger.sales[0].purchaseUnitPrice,15);
});

test('removed pieces no longer contribute to the order cloth totals',async t=>{
  const f=setup(t),fabric=seed(f),saved=await create(modern({items:[shop(fabric),shop(fabric,{fabricMeters:1})]}));assert.equal((await report()).summary.saleCount,2);
  const res=await request('/tailoring-orders/'+saved._id,editInput(saved,{items:[{...saved.items[0],fabricUnitPrice:30}]}),admin,'PUT');assert.equal(res.status,200);assert.equal((await report()).summary.saleCount,1);
});

test('delivery freezes cloth financials and cancellation retains the history while excluding its profit',async t=>{
  const f=setup(t),fabric=seed(f),saved=await create(modern({items:[shop(fabric)]}));
  let res=await request('/tailoring-orders/'+saved._id+'/deliver',{version:0});assert.equal(res.status,200);const delivered=await res.json();assert.equal(delivered.deliveryFabricItems,undefined);
  res=await request('/tailoring-orders/'+saved._id,editInput(delivered,{items:delivered.items.map(item=>({...item,fabricMeters:3,fabricUnitPrice:30}))}),admin,'PUT');assert.equal(res.status,200);const edited=await res.json();assert.equal((await report()).sales[0].meters,2.5);
  res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:edited.__v});assert.equal(res.status,200);const ledger=await report();assert.equal(ledger.sales.length,1);assert.ok(ledger.sales[0].cancelledAt);assert.equal(ledger.summary.profitAmount,0);assert.equal(ledger.summary.revenueAmount,0);assert.equal(ledger.summary.cancelledCount,1);
});

test('purchase-price absence stays unknown and cloth from another owner is rejected',async t=>{
  const f=setup(t),fabric=seed(f);fabric.purchasePricePerMeter=undefined;await create(modern({items:[shop(fabric)]}));const ledger=await report();assert.equal(ledger.sales[0].profitAmount,null);assert.equal(ledger.summary.unknownCount,1);
  const foreign=f.seedFabric(30,otherOwner);const res=await request('/tailoring-orders',modern({items:[shop(foreign)]}));assert.equal(res.status,404);
});

test('a forged high item price cannot authorize a payment above the computed garment total',async t=>{
  const f=setup(t);seed(f);const res=await request('/tailoring-orders',modern({paidAmount:50,items:[garment({price:999})]}));assert.equal(res.status,400);assert.equal((await res.json()).fields.paidAmount,'paidExceedsPrice');assert.equal(f.orders.size,0);
});

test('same line identifier in different orders remains two distinct fabric sales',async t=>{
  const f=setup(t),fabric=seed(f),lineId=randomUUID().replaceAll('-','').slice(0,24);await create(modern({items:[shop(fabric,{lineId})]}));await create(modern({items:[shop(fabric,{lineId})]}));
  const ledger=await report('source=tailoring');assert.equal(ledger.sales.length,2);assert.notEqual(ledger.sales[0].id,ledger.sales[1].id);assert.equal(ledger.summary.profitAmount,75);
});

test('modern model validates the computed customer price and fabric purchase-profit snapshot',async t=>{
  const f=setup(t),fabric=seed(f),saved=await create(modern({items:[shop(fabric)]}));const stored=f.orders.get(saved._id).toObject();
  for(const mutate of [row=>{row.items[0].price=999;},row=>{row.items[0].fabricSale.costAmount=1;},row=>{row.items[0].fabricSale.profitAmount=999;}]){const value=structuredClone(stored);mutate(value);await assert.rejects(new TailoringOrder(value).validate());}
  assert.equal(djellabaItemSalePrice(djellabaItemCosts({fabricMeters:2.125,fabricUnitPrice:15.99,sfifa:{width:'thin'}},{thinSfifaPrice:10,thickSfifaPrice:20},2)),43.98);
});

test('metered trouser orders record their stock cloth sale while retaining the editable expense total',async t=>{
  const f=setup(t),fabric=seed(f);const body=orderInput({garmentType:'trousers',automaticCosting:undefined,salePricingVersion:undefined,fabricCosting:true,recordFabricSales:true,paidAmount:0,expenseAmount:80,items:[shop(fabric,{trouserType:'regular',price:200})]});
  const saved=await create(body);assert.equal(saved.totalPrice,200);assert.equal(saved.expenseAmount,80);assert.equal(saved.fabricSalesVersion,1);
  const ledger=await report();assert.equal(ledger.sales[0].sourceGarmentType,'trousers');assert.equal(ledger.sales[0].profitAmount,37.5);assert.equal(ledger.sales[0].revenueAmount,75);
});
