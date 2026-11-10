import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import app from '../BackEnd/app.js';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import TailoringOrder from '../BackEnd/models/TailoringOrder.js';
import JabadorCostSettings from '../BackEnd/models/JabadorCostSettings.js';
import MalakiyaCostSettings from '../BackEnd/models/MalakiyaCostSettings.js';
import FabricMovement from '../BackEnd/models/FabricMovement.js';
import { djellabaFixture, owner, otherOwner, employee, garment, orderInput, query } from './helpers/djellabaCostsFixture.js';
import { djellabaItemCosts, djellabaItemSalePrice, validateDjellabaRates } from '../shared/tailoringCosts.js';
import { tailoringProfitAmount } from '../shared/tailoring.js';

const previousSecret=process.env.JWT_SECRET;let server,base;
before(async()=>{process.env.JWT_SECRET='sfifa-margins-tests';server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
const admin={id:owner,role:'admin'},staff={id:employee,role:'Employe'};
const request=(suffix,body,actor=admin,method=body===undefined?'GET':'POST')=>fetch(base+suffix,{method,headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+jwt.sign(actor,process.env.JWT_SECRET)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const rates={thinSfifaCostPrice:25,thinSfifaPrice:40,thickSfifaCostPrice:50,thickSfifaPrice:70};
const settingsUrl='/tailoring-orders/cost-settings?pricingVersion=3';
const setup=t=>{const f=djellabaFixture(t);f.staff.name='سعيد';f.staff.moduleAccess=['tailoring','fabrics'];f.staff.operationPermissions={tailoring:['add','details','settings','payment','cancel'],fabrics:['profits']};t.mock.method(FabricMovement,'find',()=>query(()=>[]));return f;};
const seed=f=>{f.seedSettings({...rates,laborPrice:999});const fabric=f.seedFabric(30);fabric.purchasePricePerMeter=15;return fabric;};
const shop=(fabric,patch)=>garment({fabricSource:'shop',fabricId:String(fabric._id),colorId:String(fabric.colors[0]._id),fabricUnitPrice:30,fabricMeters:2.5,...patch});
const modern=patch=>orderInput({salePricingVersion:3,paidAmount:0,...patch});
const create=async(body,actor=admin)=>{const res=await request('/tailoring-orders',body,actor),data=await res.json();assert.equal(res.status,201,JSON.stringify(data));return data;};
const editInput=(saved,patch)=>({...saved,automaticCosting:true,salePricingVersion:3,costSettingsVersion:saved.costing.settingsVersion,version:saved.__v,items:saved.items.map(item=>({...item,fabricUnitPrice:item.costs.fabricUnitPrice})),...patch});
const ledger=async()=>{const res=await request('/fabrics/profits?source=tailoring');assert.equal(res.status,200);return res.json();};

test('four prices are required, persisted and returned without adding worker labor',async t=>{
  const f=setup(t);let res=await request(settingsUrl,{rates,version:null},admin,'PUT');assert.equal(res.status,200);let data=await res.json();assert.deepEqual(data.rates,rates);assert.equal(data.configured,true);assert.equal(f.settings.get(owner).laborPrice,0);
  res=await request(settingsUrl);data=await res.json();assert.deepEqual(data.rates,rates);assert.equal(data.version,0);
  for(const key of Object.keys(rates))for(const invalid of [undefined,null,'',-1,'2.001','NaN',Infinity]){
    res=await request(settingsUrl,{rates:{...rates,[key]:invalid},version:0},admin,'PUT');assert.equal(res.status,400,key+':'+invalid);assert.equal((await res.json()).fields[key],'invalidMoney');
  }
  assert.equal(f.settings.get(owner).__v,0);
});

test('upgrading settings preserves sale prices and requires explicit costs instead of guessing zero',async t=>{
  const f=setup(t);f.seedSettings({thinSfifaPrice:40,thickSfifaPrice:70,laborPrice:999});let res=await request(settingsUrl);let data=await res.json();assert.equal(data.configured,false);assert.equal(data.version,0);assert.deepEqual(data.rates,{...rates,thinSfifaCostPrice:null,thickSfifaCostPrice:null});
  res=await request('/tailoring-orders',modern({items:[garment()]}));assert.equal(res.status,409);assert.equal((await res.json()).message,'costSettingsRequired');assert.equal(f.orders.size,0);
  res=await request(settingsUrl,{rates,version:0},admin,'PUT');assert.equal(res.status,200);data=await res.json();assert.equal(data.configured,true);assert.equal(data.version,1);
  const saved=await create(modern({costSettingsVersion:1,items:[garment()]}));assert.deepEqual([saved.totalPrice,saved.expenseAmount,saved.profitAmount],[40,25,15]);
});

test('thin and wide prices each produce sale minus cost as tailoring profit, with cloth margin separate',async t=>{
  const f=setup(t),fabric=seed(f);const saved=await create(modern({items:[shop(fabric),shop(fabric,{sfifa:{width:'thick',style:'fabric'}}),garment({sfifa:{width:'thick',style:'fabric'}})]}),staff);
  assert.deepEqual(saved.items.map(item=>item.price),[115,145,70]);assert.deepEqual(saved.items.map(item=>item.costs.totalAmount),[100,125,50]);assert.deepEqual([saved.totalPrice,saved.expenseAmount,saved.profitAmount],[330,275,55]);
  assert.equal(saved.costing.pricingVersion,3);assert.deepEqual({...saved.costing.rates},{...rates,laborPrice:0});assert.deepEqual(saved.items.map(item=>item.costs.sfifaCostAmount),[25,50,50]);
  const report=await ledger();assert.equal(report.sales.length,2);assert.equal(report.summary.profitAmount,75);assert.equal(saved.profitAmount+report.summary.profitAmount,330-75-125);assert.equal(report.sales[0].sellerName,'سعيد');
  assert.equal(saved.customerReceipt.totalPrice,330);assert.equal(saved.customerReceipt.items[0].costs,undefined);assert.equal(saved.customerReceipt.items[0].sfifaCostAmount,undefined);assert.equal(saved.customerReceipt.costing,undefined);
});

test('cost and sale snapshots survive settings changes, edits and deleted stock',async t=>{
  const f=setup(t),fabric=seed(f),saved=await create(modern({items:[shop(fabric)]}));f.fabrics.clear();const settings=f.settings.get(owner);settings.thinSfifaCostPrice=900;settings.thickSfifaCostPrice=950;settings.thickSfifaPrice=999;settings.__v=4;
  const res=await request('/tailoring-orders/'+saved._id,editInput(saved,{salePricingVersion:2,items:saved.items.map(item=>({...item,fabricUnitPrice:30,fabricMeters:3,sfifa:{width:'thick',style:'fabric'}}))}),admin,'PUT');assert.equal(res.status,200);const edited=await res.json();assert.deepEqual([edited.totalPrice,edited.expenseAmount,edited.profitAmount],[160,140,20]);assert.equal(edited.costing.pricingVersion,3);assert.equal(edited.costing.rates.thickSfifaCostPrice,50);assert.equal((await ledger()).summary.profitAmount,45);
});

test('historical version two orders keep their recorded amounts after new cost settings are saved',async t=>{
  const f=setup(t),fabric=seed(f),saved=await create(modern({salePricingVersion:2,items:[shop(fabric)]}));assert.deepEqual([saved.totalPrice,saved.expenseAmount,saved.profitAmount],[115,75,40]);
  const res=await request('/tailoring-orders/'+saved._id,editInput(saved,{phone:'0611111111'}),admin,'PUT');assert.equal(res.status,200);const edited=await res.json();assert.equal(edited.costing.pricingVersion,2);assert.deepEqual([edited.totalPrice,edited.expenseAmount,edited.profitAmount],[115,75,40]);assert.equal(edited.items[0].costs.sfifaCostAmount,undefined);
});

test('zero costs, zero sale prices and losses retain exact centimes and never add labor',()=>{
  const item={fabricMeters:2.125,fabricUnitPrice:15.99,sfifa:{width:'thin'}};
  const cost=djellabaItemCosts(item,{...rates,thinSfifaCostPrice:2.15,thinSfifaPrice:3.25,laborPrice:999},3);assert.equal(cost.fabricAmount,33.98);assert.equal(cost.totalAmount,36.13);assert.equal(djellabaItemSalePrice(cost),37.23);assert.equal(tailoringProfitAmount(djellabaItemSalePrice(cost),cost.totalAmount),1.1);
  for(const [buy,sell,profit] of [[0,20,20],[20,0,-20],[0,0,0]]){const costs=djellabaItemCosts({...item,fabricUnitPrice:0},{...rates,thinSfifaCostPrice:buy,thinSfifaPrice:sell},3);assert.equal(tailoringProfitAmount(djellabaItemSalePrice(costs),costs.totalAmount),profit);}
  assert.equal(djellabaItemCosts(item,{thinSfifaPrice:3.25,thickSfifaPrice:4},3),null);
  assert.equal(djellabaItemCosts({...item,fabricMeters:999999,fabricUnitPrice:999999999.99},rates,3),null);
  assert.throws(()=>validateDjellabaRates({...rates,thickSfifaCostPrice:null},'djellaba',3));
});

test('model rejects forged cost, expense, sale and incomplete rate snapshots',async t=>{
  const f=setup(t),fabric=seed(f),saved=await create(modern({items:[shop(fabric)]})),stored=f.orders.get(saved._id).toObject();
  for(const mutate of [row=>{row.items[0].costs.sfifaCostAmount=1;},row=>{delete row.items[0].costs.sfifaCostAmount;},row=>{row.expenseAmount=1;},row=>{row.items[0].price=999;},row=>{delete row.costing.rates.thickSfifaCostPrice;},row=>{row.items[0].fabricSale.profitAmount=999;}]){const value=structuredClone(stored);mutate(value);await assert.rejects(new TailoringOrder(value).validate());}
});

test('settings conflicts, permissions, ownership and failed writes preserve saved rates',async t=>{
  const f=setup(t);seed(f);let res=await request(settingsUrl,{rates:{...rates,thinSfifaCostPrice:30},version:99},admin,'PUT');assert.equal(res.status,409);
  res=await request(settingsUrl,{rates,version:99},admin,'PUT');assert.equal(res.status,200);
  f.staff.moduleAccess=['tailoring'];f.staff.operationPermissions={tailoring:['add']};res=await request(settingsUrl,{rates,version:0},staff,'PUT');assert.equal(res.status,403);assert.equal((await request(settingsUrl)).status,200);assert.equal((await request(settingsUrl,undefined,{id:otherOwner,role:'admin'})).status,200);assert.equal((await (await request(settingsUrl,undefined,{id:otherOwner,role:'admin'})).json()).configured,false);
  f.faults.settingsSave=true;res=await request(settingsUrl,{rates:{...rates,thinSfifaCostPrice:30},version:0},admin,'PUT');assert.equal(res.status,500);assert.equal(f.settings.get(owner).thinSfifaCostPrice,25);
});

test('stale settings and overpayment above recomputed total cannot register an order',async t=>{
  const f=setup(t);seed(f);for(const [patch,status,field] of [[{costSettingsVersion:9},409,null],[{paidAmount:41,items:[garment({price:999})]},400,'paidAmount']]){const res=await request('/tailoring-orders',modern(patch));assert.equal(res.status,status);const result=await res.json();if(field)assert.equal(result.fields[field],'paidExceedsPrice');}assert.equal(f.orders.size,0);
});

test('request retries and later payments do not duplicate either margin',async t=>{
  const f=setup(t),fabric=seed(f),input=modern({paidAmount:10,items:[shop(fabric)]}),saved=await create(input);let res=await request('/tailoring-orders',input);assert.equal(res.status,200);assert.equal(f.orders.size,1);
  const payment={amount:15,requestId:randomUUID(),version:0};for(let i=0;i<2;i++){res=await request('/tailoring-orders/'+saved._id+'/payments',payment,staff);assert.equal(res.status,200);const data=await res.json();assert.equal(data.paidAmount,25);assert.equal(data.profitAmount,15);assert.equal(data.addedPayments.length,1);assert.equal(data.addedPayments[0].document.items[0].costs,undefined);assert.equal(data.addedPayments[0].actor.name,'سعيد');}
  assert.equal((await ledger()).summary.profitAmount,37.5);
});

test('delivery freezes both margins and cancellation removes recognized amounts while retaining history',async t=>{
  const f=setup(t),fabric=seed(f),saved=await create(modern({items:[shop(fabric)]}));let res=await request('/tailoring-orders/'+saved._id+'/deliver',{version:0});assert.equal(res.status,200);const delivered=await res.json();assert.equal(delivered.deliveryFinancials.expenseAmount,100);assert.equal(delivered.deliveryFinancials.revenueAmount,115);assert.equal(f.orders.get(saved._id).deliveryFabricItems[0].costs.sfifaCostAmount,25);
  res=await request('/tailoring-orders/'+saved._id,editInput(delivered,{items:delivered.items.map(item=>({...item,fabricUnitPrice:30,fabricMeters:3,sfifa:{width:'thick',style:'fabric'}}))}),admin,'PUT');assert.equal(res.status,200);const edited=await res.json();assert.equal(edited.deliveryFinancials.expenseAmount,100);assert.equal((await ledger()).summary.profitAmount,37.5);
  res=await request('/tailoring-orders/'+saved._id+'/cancel',{version:edited.__v},staff);assert.equal(res.status,200);assert.equal((await res.json()).cancelledBy.name,'سعيد');const report=await ledger();assert.equal(report.summary.profitAmount,0);assert.equal(report.summary.revenueAmount,0);assert.equal(report.sales.length,1);assert.ok(report.sales[0].cancelledAt);
});

for(const [type,Model] of [['jabador',JabadorCostSettings],['malakiya',MalakiyaCostSettings]])test(type+' uses its own two cost and two sale prices',async t=>{
  const f=setup(t);seed(f);let document=null;
  t.mock.method(Model,'findOne',async scope=>String(scope.idAdmin)===owner?document:null);
  t.mock.method(Model,'create',async value=>{document=new Model(value);await document.validate();return document;});
  const ownRates={thinSfifaCostPrice:50,thinSfifaPrice:80,thickSfifaCostPrice:90,thickSfifaPrice:150};let res=await request(settingsUrl+'&garment='+type,{rates:ownRates,version:null},admin,'PUT');assert.equal(res.status,200);assert.deepEqual((await res.json()).rates,ownRates);
  const saved=await create(modern({garmentType:type,items:[garment({sfifa:{width:'thick',style:'fabric'}})]}));assert.deepEqual([saved.totalPrice,saved.expenseAmount,saved.profitAmount],[150,90,60]);assert.equal(saved.costing.rates.thickSfifaCostPrice,90);assert.equal(f.settings.get(owner).thickSfifaCostPrice,50);
});
