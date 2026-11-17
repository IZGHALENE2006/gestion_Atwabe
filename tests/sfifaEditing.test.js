import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import SfifaStock from '../BackEnd/models/SfifaStock.js';
import { tailoringSfifaFixture } from './helpers/tailoringSfifaFixture.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, employee, otherOwner, garment, orderInput, query } from './helpers/djellabaCostsFixture.js';
import { matches } from './helpers/modelMemory.js';
import { validateSfifaStockCorrection, sfifaVariantIdentity, sfifaStockBarcode } from '../shared/sfifaStock.js';

process.env.JWT_SECRET = 'isolated-sfifa-editing';
const { default: app } = await import('../BackEnd/app.js');
let server, base;
before(async () => { server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port; });
after(async () => { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); });
const request=async(path,body,method=body===undefined?'GET':'POST',actor={id:owner,role:'admin'})=>{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+jwt.sign(actor,process.env.JWT_SECRET),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
const stockPath=row=>'/sfifa-stock/'+row._id+'/variants/'+row.variants[0]._id;
const update=(row,body,actor)=>request(stockPath(row),{version:row.__v,...body},'PUT',actor);
function tailoring(t) {
  const f=tailoringSfifaFixture(t);
  t.mock.method(SfifaStock,'findOne',scope=>query(()=>{const row=[...f.stocks.values()].find(row=>matches(row,scope));return row?new SfifaStock(row.toObject()):null;}));
  return f;
}

test('correction validates the independent total, exact per-type balances and zero or blank lengths',()=>{
  const identity={width:'thick',family:'01-30',code:12};
  assert.deepEqual(validateSfifaStockCorrection({...identity,quantity:4,styleMeters:{single:'1,125',double:'0.2',gradient:0}}),{...identity,quantity:4,styleMeters:{single:1.125,double:0.2,gradient:0}});
  assert.deepEqual(validateSfifaStockCorrection({...identity,quantity:0,styleMeters:{single:'',double:'',gradient:''}}).styleMeters,{single:0,double:0,gradient:0});
  for(const styleMeters of [{single:-1},{single:'0.0001'},{single:5}]) assert.throws(()=>validateSfifaStockCorrection({...identity,quantity:4,styleMeters}),/invalidStock/);
});

test('classification and length changes preserve the barcode, linked order amounts, history and exact cancellation returns',async t=>{
  const f=tailoring(t);f.controls.standalone=true;
  let r=await request('/tailoring-orders',orderInput({deductFabricStock:true,salePricingVersion:3,paidAmount:0,items:[garment({fabricSource:'shop',fabricId:String(f.fabric._id),colorId:String(f.fabric.colors[0]._id),fabricPieceId:String(f.fabric.colors[0].pieces[0]._id),fabricUnitPrice:30,fabricMeters:3,sfifa:{width:'thin',style:'fabric',stock:f.selection()}})]}));
  assert.equal(r.status,201,JSON.stringify(r.data));const order=r.data,originalReceipt=structuredClone(order.customerReceipt),row=f.stocks.get(String(f.sfifa._id)),barcode=sfifaStockBarcode(row.variants[0]);
  r=await update(row,{width:'thick',family:'1426-1432',code:1430,quantity:30.125,styleMeters:{single:20.125,double:5,gradient:5}});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.barcode,barcode);assert.equal(String(r.data.parentId),String(row._id));assert.equal(String(r.data._id),String(row.variants[0]._id));
  assert.deepEqual([r.data.width,r.data.family,r.data.code,r.data.quantity],['thick','1426-1432',1430,30.125]);
  const linked=(await request('/tailoring-orders')).data.orders[0];assert.equal(linked.items[0].sfifa.width,'thick');assert.equal(linked.items[0].sfifa.stock.code,1430);assert.equal(linked.items[0].sfifa.stock.family,'1426-1432');
  assert.equal(linked.totalPrice,order.totalPrice);assert.deepEqual(linked.customerReceipt,originalReceipt);
  const options=(await request('/tailoring-orders/sfifa-options')).data.items;assert.equal(options.find(item=>String(item.variantId)===String(row.variants[0]._id)).width,'thick');
  const history=(await request(stockPath(row)+'/history')).data.entries;assert.equal(history.length,1);assert.equal(history[0].quantity,20);
  r=await request('/tailoring-orders/'+order._id+'/cancel',{version:order.__v});assert.equal(r.status,200,JSON.stringify(r.data));
  const detail=(await request(stockPath(row)+'/details')).data.item;assert.equal(detail.quantity,33.125);assert.deepEqual(detail.styleMeters,{single:23.125,double:5,gradient:5});
  r=await request('/tailoring-orders/'+order._id+'/cancel',{version:order.__v});assert.equal(r.status,200);assert.equal((await request(stockPath(row)+'/details')).data.item.quantity,33.125);
});

test('renamed numbers receive new restocks and production under the new classification while original receipt retries stay idempotent',async t=>{
  const f=tailoring(t),initial=f.stocks.get(String(f.sfifa._id)),originalReceipt=initial.receipts[0].toObject();
  let r=await update(initial,{width:'thick',family:'8080-8097',code:8081,quantity:20,styleMeters:{single:10,double:6,gradient:4}});assert.equal(r.status,200,JSON.stringify(r.data));
  const addition={width:'thick',family:'8080-8097',code:8081,quantity:2.125,requestId:randomUUID()};
  for(const status of [201,200]){r=await request('/sfifa-stock',addition);assert.equal(r.status,status,JSON.stringify(r.data));assert.equal(r.data.quantity,22.125);assert.equal(String(r.data._id),String(initial.variants[0]._id));}
  r=await request('/sfifa-stock',{width:'thin',family:'01-30',code:12,quantity:20,styleMeters:originalReceipt.styleMeters,requestId:originalReceipt.requestId});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.code,8081);assert.equal(r.data.quantity,22.125);
  r=await request('/sfifa-stock',{width:'thin',family:'01-30',code:12,quantity:1,requestId:randomUUID()});assert.equal(r.status,201,JSON.stringify(r.data));assert.notEqual(String(r.data._id),String(initial.variants[0]._id));
  const rows=(await request('/sfifa-stock')).data.items;assert.equal(rows.length,2);assert.equal(rows.find(row=>row.code===8081).quantity,22.125);assert.equal(rows.find(row=>row.code===12).quantity,1);
  assert.equal((await request(stockPath(initial)+'/history')).data.entries.length,2);
});

test('invalid classifications, conflicting numbers, stale versions, unauthorized actors and invalid totals do not mutate stock',async t=>{
  const f=tailoring(t),initial=f.stocks.get(String(f.sfifa._id));initial.variants.push({code:13,quantity:0,styleMeters:{single:0,double:0,gradient:0}});
  const snapshot=JSON.stringify(initial);
  for(const [body,code]of [[{code:13,quantity:20},409],[{family:'8080-8097',code:13,quantity:20},400],[{quantity:1,styleMeters:{single:2,double:0,gradient:0}},400],[{quantity:20,version:99},409]]){const r=await update(initial,body);assert.equal(r.status,code,JSON.stringify(r.data));}
  const other=f.seedSfifa({width:'thick'});assert.equal((await update(initial,{width:'thick',quantity:20})).status,409);
  assert.equal((await update(initial,{quantity:20},{id:otherOwner,role:'admin'})).status,404);
  f.staff.moduleAccess.push('sfifa');f.staff.operationPermissions.sfifa=[];assert.equal((await update(initial,{quantity:20},{id:employee,role:'Employe'})).status,403);
  assert.equal(JSON.stringify(f.stocks.get(String(initial._id))),snapshot);assert.equal(f.stocks.get(String(other._id)).quantity,20);
});

test('worker material views use the current classification and cancellation still restores the original selected variant',async t=>{
  const f=workerMaterialsFixture(t),path='/tailoring-workers/'+f.worker._id+'/work';
  let r=await request(path,{category:'machine',workType:'shop',garmentType:'djellaba',productName:'جلابة',quantity:1,materials:[f.selection(randomUUID().replaceAll('-','').slice(0,24))],unitWage:15,requestId:randomUUID()});assert.equal(r.status,201,JSON.stringify(r.data));const work=r.data;
  const row=f.stocks.find(row=>String(row._id)===String(f.sfifa._id));r=await update(row,{width:'thick',family:'8080-8097',code:8082,quantity:17,styleMeters:{single:10,double:7,gradient:0}});assert.equal(r.status,200,JSON.stringify(r.data));
  const view=(await request(path+'?category=machine')).data.works[0];assert.deepEqual([view.materials[0].sfifaWidth,view.materials[0].sfifaFamily,view.materials[0].sfifaCode],['thick','8080-8097',8082]);
  r=await request(path+'/'+work._id+'/cancel',{version:work.__v,requestId:randomUUID()});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await request(stockPath(row)+'/details')).data.item.quantity,20);
});

test('partially completed sfifa production follows renamed stock for later completions and retains its earnings and receipt history',async t=>{
  const f=workerMaterialsFixture(t),path='/tailoring-workers/'+f.worker._id+'/work';
  let r=await request(path,{category:'sfifa',workType:'shop',quantity:12,sfifa:{width:'thin',family:'01-30',code:12},unitWage:3,requestId:randomUUID()});assert.equal(r.status,201,JSON.stringify(r.data));let work=r.data;
  r=await request(path+'/'+work._id+'/completions',{quantity:2,version:work.__v,requestId:randomUUID()});assert.equal(r.status,201,JSON.stringify(r.data));work=r.data;
  const row=f.stocks.find(row=>String(row._id)===String(f.sfifa._id));r=await update(row,{width:'thick',family:'1426-1432',code:1428,quantity:22,styleMeters:{single:10,double:6,gradient:4}});assert.equal(r.status,200,JSON.stringify(r.data));
  r=await request(path+'/'+work._id+'/completions',{quantity:2,version:work.__v,requestId:randomUUID()});assert.equal(r.status,201,JSON.stringify(r.data));assert.deepEqual(r.data.sfifa,{width:'thick',family:'1426-1432',code:1428});assert.equal(r.data.completedQuantity,4);
  assert.equal((await request(stockPath(row)+'/details')).data.item.quantity,24);const history=(await request(stockPath(row)+'/history')).data.entries;assert.equal(history.length,2);assert.ok(history.every(row=>row.source==='worker'));
  const latest=f.stocks.find(row=>String(row._id)===String(f.sfifa._id));assert.deepEqual(sfifaVariantIdentity(latest,latest.variants[0]),{width:'thick',family:'1426-1432',code:1428});assert.equal(latest.production[0].completions.reduce((sum,row)=>sum+row.earningAmount,0),12);
});
