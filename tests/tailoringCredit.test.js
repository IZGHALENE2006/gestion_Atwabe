import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import Order from '../BackEnd/models/TailoringOrder.js';
import Client from '../BackEnd/models/Client.js';
import Credit from '../BackEnd/models/userCidit.js';
import Admin from '../BackEnd/models/AdminModel.js';
import { djellabaFixture, query, orderInput, garment, owner, otherOwner, employee } from './helpers/djellabaCostsFixture.js';
import { tailoringStockFixture } from './helpers/tailoringStockFixture.js';
import { matches } from './helpers/modelMemory.js';
import { creditInvoiceBalances } from '../shared/creditInvoiceBalances.js';
import { creditDocument } from '../shared/creditDocuments.js';
import { creditDeliveryDepositValid, matchingClientCredits, tailoringCreditInput } from '../shared/tailoringCredit.js';

const clientId = '999999999999999999999999', foreignClientId = '888888888888888888888888';
const admin = { id: owner, role: 'admin' }, staffActor = { id: employee, role: 'Employe', idAdmin: otherOwner };
const previous = process.env.JWT_SECRET;
let server, base;
before(async () => { process.env.JWT_SECRET = 'tailoring-credit-isolated'; server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = 'http://127.0.0.1:'+server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
async function request(path, body, actor = admin, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base+path, { method, headers: { ...(actor ? { Authorization: 'Bearer '+jwt.sign(actor,process.env.JWT_SECRET) } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, value: await response.json() };
}
function setup(t, { oldAccount = true, stock = false } = {}) {
  const f = stock ? tailoringStockFixture(t) : djellabaFixture(t), accounts = new Map(), clients = new Map();
  if (!stock) f.seedSettings();
  t.mock.method(Admin,'findById',id=>query(()=>[owner,otherOwner].includes(String(id))?{_id:String(id),role:'admin',name:'صاحب المحل'}:null));
  f.staff.role='Employe';f.staff.name='الموظف';
  clients.set(clientId, new Client({ _id: clientId, idAdmin: owner, createdBy: owner, type: 'person', name: 'فاطمة', phone: '0612345678', address: 'الدار البيضاء' }));
  clients.set(foreignClientId, new Client({ _id: foreignClientId, idAdmin: otherOwner, createdBy: otherOwner, type: 'person', name: 'زبون آخر', phone: '0699999999', address: 'عنوان' }));
  const clone = row => row ? new Credit(row.toObject()) : null;
  t.mock.method(Client,'find',scope=>query(()=>[...clients.values()].filter(row=>matches(row,scope)).map(row=>row.toObject())));
  t.mock.method(Client,'findOne',scope=>query(()=>[...clients.values()].find(row=>matches(row,scope))));
  t.mock.method(Credit,'find',scope=>query(()=>[...accounts.values()].filter(row=>matches(row,scope)).map(clone)));
  t.mock.method(Credit,'findOne',scope=>query(()=>clone([...accounts.values()].find(row=>matches(row,scope)))));
  t.mock.method(Credit,'create',async value=>{ if(accounts.has(String(value._id)))throw Object.assign(Error('duplicate'),{code:11000});const row=new Credit({...value,__v:0});await row.validate();accounts.set(String(row._id),row);return clone(row); });
  t.mock.method(Credit.prototype,'save',async function(){
    await this.validate();if(f.faults?.creditBefore){delete f.faults.creditBefore;throw Error('credit outage');}
    const current=accounts.get(String(this._id));if(!current||current.__v!==this.__v)throw Object.assign(Error('stale'),{name:'VersionError'});
    this.__v+=1;accounts.set(String(this._id),clone(this));
    if(f.faults?.creditAfter){delete f.faults.creditAfter;throw Error('lost credit acknowledgement');}return this;
  });
  const account = new Credit({idUser:owner,name:'فاطمة',phone:'06 12 34 56 78',Total:300,Paye:100,Qauntite:1,produit:[{id:'OLD',nom:'دين قديم',prix:300,Quantite:1,Paiement:100}],__v:0});
  if(oldAccount)accounts.set(String(account._id),account);
  const input = patch => orderInput({ clientId, clientName:'اسم غير موثوق', phone:'0612345678', deliverOnCredit:true, paidAmount:250, items:[garment({price:500})], ...patch });
  return { ...f, accounts, clients, account:()=>[...accounts.values()][0], input };
}
const create = body => request('/tailoring-orders',body);
const list = () => request('/tailoring-orders');
const pay = (order,amount,requestId=randomUUID()) => request('/tailoring-orders/'+order._id+'/payments',{amount,requestId,version:order.__v});

test('selected client uses trusted identity, existing debt account, delivery profit and customer balance without double-counting the advance',async t=>{
 const f=setup(t),result=await create(f.input());assert.equal(result.status,201,JSON.stringify(result.value));const order=result.value;
 assert.equal(order.clientName,'فاطمة');assert.equal(order.phone,'0612345678');assert.ok(order.deliveredAt);assert.equal(order.creditDelivery.remainingAmount,250);assert.equal(order.paidAmount,250);
 assert.deepEqual([f.account().Total,f.account().Paye,f.account().creditInvoices.length],[800,350,1]);assert.equal(f.account().creditInvoices[0].origin,'tailoring');assert.ok(order.deliveryFinancials);
 const clients=await request('/clients');assert.equal(clients.value.clients[0].creditRemainingAmount,450);
 const options=await request('/tailoring-orders/client-options');assert.equal(options.value.clients.length,1);assert.equal(options.value.clients[0].creditRemainingAmount,450);
 const debt=await request('/usercridite/get/'+f.account()._id);assert.equal(debt.status,200);assert.equal(debt.value.summary.remaining,450);
});
test('ordinary creation remains unshipped and delivery can explicitly transfer its remaining balance once',async t=>{
 const f=setup(t),made=await create(f.input({deliverOnCredit:false}));assert.equal(made.status,201);assert.equal(made.value.deliveredAt,null);assert.equal(f.account().Total,300);
 const body={version:made.value.__v,deliverOnCredit:true,clientId};
 const first=await request('/tailoring-orders/'+made.value._id+'/deliver',body);assert.equal(first.status,200);assert.ok(first.value.deliveredAt);
 assert.equal((await request('/tailoring-orders/'+made.value._id+'/deliver',body)).status,200);assert.equal(f.account().creditInvoices.length,1);
});
test('credit delivery requires a registered owned client, any valid advance and separate permission',async t=>{
 const f=setup(t);
 for(const patch of [{paidAmount:500},{clientId:foreignClientId},{clientId:''},{deliverOnCredit:'bad'}]){const result=await create(f.input(patch));assert.ok([400,404].includes(result.status),JSON.stringify(result));}
 assert.equal(f.orders.size,0);assert.equal(f.account().Total,300);
 Object.assign(f.staff,{moduleAccess:['tailoring'],operationPermissions:{tailoring:['add','payment','deliver']}});
 assert.equal((await request('/tailoring-orders',f.input(),staffActor)).status,403);
 const options=await request('/tailoring-orders/client-options',undefined,staffActor);assert.equal(options.status,200);assert.equal(Object.hasOwn(options.value.clients[0],'creditRemainingAmount'),false);
 f.staff.operationPermissions.tailoring.push('creditDelivery');const allowed=await request('/tailoring-orders',f.input(),staffActor);assert.equal(allowed.status,201);assert.equal(f.account().creditInvoices[0].actor.role,'Employe');assert.equal(String(f.account().creditInvoices[0].actor.id),employee);
});
test('new debtor is created once for concurrent orders of the same registered client',async t=>{
 const f=setup(t,{oldAccount:false});const results=await Promise.all([create(f.input()),create(f.input())]);assert.deepEqual(results.map(r=>r.status),[201,201]);assert.equal(f.accounts.size,1);assert.deepEqual([f.account().Total,f.account().Paye,f.account().creditInvoices.length],[1000,500,2]);
});
test('debt retries after lost acknowledgement do not duplicate the advance, debt, receipt or delivery',async t=>{
 const f=setup(t),input=f.input();f.faults.creditAfter=true;
 assert.equal((await create(input)).status,500);assert.equal(f.orders.size,1);assert.equal(f.account().creditInvoices.length,1);
 const retry=await create(input);assert.equal(retry.status,200);assert.ok(retry.value.deliveredAt);assert.equal(f.account().creditInvoices.length,1);assert.equal(f.account().paymentHistory.length,1);assert.equal(f.account().Paye,350);
 assert.equal((await create({...input,paidAmount:300})).status,409);
});
test('order payments and general credit payments share one live balance without changing the recognized delivery profit',async t=>{
 const f=setup(t),made=await create(f.input()),before=made.value.deliveryFinancials,requestId=randomUUID();
 const paid=await pay(made.value,50,requestId);assert.equal(paid.status,200);assert.equal(paid.value.paidAmount,300);assert.equal(paid.value.creditDelivery.remainingAmount,200);assert.ok(paid.value.paymentReceipt.document);
 assert.equal((await pay(made.value,50,requestId)).status,200);assert.equal((await pay(made.value,51,requestId)).status,409);
 const general=await request('/usercridite/add-payment/'+f.account()._id,{amount:225,requestId:randomUUID()});assert.equal(general.status,200,JSON.stringify(general.value));
 const current=(await list()).value.orders[0];assert.equal(current.paidAmount,325);assert.equal(current.creditDelivery.remainingAmount,175);assert.deepEqual(current.deliveryFinancials,before);
 assert.equal((await pay(current,176)).status,400);const full=await pay(current,175);assert.equal(full.value.creditDelivery.remainingAmount,0);assert.equal(full.value.paidAmount,500);
});
test('competing payments cannot overpay or leave a partial ledger entry',async t=>{
 const f=setup(t,{oldAccount:false}),made=await create(f.input());const results=await Promise.all([pay(made.value,200),pay(made.value,200)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(f.account().Paye,450);assert.equal(creditInvoiceBalances(f.account()).get(made.value._id).remaining,50);
});
test('cancelled delivered credit keeps payment history, voids only the unpaid debt and preserves the original invoice',async t=>{
 const f=setup(t),made=await create(f.input());await pay(made.value,50);const current=(await list()).value.orders[0];
 const cancelled=await request('/tailoring-orders/'+current._id+'/cancel',{version:current.__v});assert.equal(cancelled.status,200,JSON.stringify(cancelled.value));assert.ok(cancelled.value.cancelledAt);assert.equal(cancelled.value.creditDelivery.remainingAmount,0);assert.equal(cancelled.value.paidAmount,300);
 assert.equal(f.account().Total,600);assert.equal(f.account().Paye,400);assert.equal(f.account().creditInvoices[0].total,500);assert.ok(f.account().creditInvoices[0].cancelledAt);assert.equal(f.account().paymentHistory.length,2);
 assert.ok(creditDocument(f.account(),{kind:'invoice',line:{invoiceId:current._id}}).cancelledAt);
 assert.equal((await request('/tailoring-orders/'+current._id+'/cancel',{version:current.__v})).status,200);assert.equal(f.account().Total,600);
});
test('linked financial data cannot be edited or deleted through unrelated credit actions',async t=>{
 const f=setup(t),made=await create(f.input());
 assert.equal((await request('/tailoring-orders/'+made.value._id,{...f.input(),version:made.value.__v},admin,'PUT')).status,409);
 assert.equal((await request('/usercridite/deleteproduct/'+f.account()._id+'/'+made.value._id,undefined,admin,'DELETE')).status,409);
 assert.equal((await request('/usercridite/delete/'+f.account()._id,undefined,admin,'DELETE')).status,409);
});
test('standalone stock reservation survives a debt write outage and retries without reserving cloth twice',async t=>{
 const f=setup(t,{oldAccount:false,stock:true}),before=f.meters();f.controls.standalone=true;f.faults.creditBefore=true;
 const input=f.input({salePricingVersion:3,deductFabricStock:true,paidAmount:35,items:[garment({price:70,fabricSource:'shop',fabricId:String(f.fabric._id),colorId:String(f.fabric.colors[0]._id),fabricPieceId:String(f.fabric.colors[0].pieces[0]._id),fabricMeters:1,fabricUnitPrice:30})]});
 assert.equal((await create(input)).status,500);assert.equal(f.meters(),before-1);const retry=await create(input);assert.equal(retry.status,200,JSON.stringify(retry.value));assert.equal(f.meters(),before-1);assert.equal(f.account().creditInvoices.length,1);assert.equal(retry.value.creditDelivery.remainingAmount,35);
});
test('credit input validation and account matching handle exact centimes and phone formatting',()=>{
 assert.equal(creditDeliveryDepositValid(100.01,50),true);assert.equal(creditDeliveryDepositValid(100.01,50.01),true);assert.equal(creditDeliveryDepositValid(100,100),false);
 assert.throws(()=>tailoringCreditInput({clientId:'x',deliverOnCredit:true}));assert.throws(()=>tailoringCreditInput({deliverOnCredit:'yes'}));
 assert.equal(matchingClientCredits({_id:clientId,phone:'0612345678'},[{phone:'+212 612 345 678'}]).length,1);
});
for (const garmentType of ['jabador','malakiya','shirts','trousers']) test(garmentType+' shares client selection and credit delivery without changing garment pricing',async t=>{
 const f=setup(t,{oldAccount:false}),expenses=['shirts','trousers'].includes(garmentType);
 const item=garment({price:500,...(garmentType==='shirts'?{shirtType:'عادي'}:garmentType==='trousers'?{trouserType:'regular'}:{})});
 const result=await create(f.input({garmentType,automaticCosting:false,...(expenses?{expenseAmount:100}:{}),items:[item]}));
 assert.equal(result.status,201,JSON.stringify(result.value));assert.equal(result.value.garmentType,garmentType);assert.equal(result.value.creditDelivery.remainingAmount,250);assert.equal(result.value.deliveryFinancials.revenueAmount,500);
});
test('the entire balance or any partial advance can be delivered on credit without a 50 percent minimum',async t=>{
 const f=setup(t,{oldAccount:false});
 for (const paidAmount of [0,10,249.99]) {
  const result=await create(f.input({paidAmount}));assert.equal(result.status,201,JSON.stringify(result.value));assert.ok(result.value.deliveredAt);assert.equal(result.value.creditDelivery.remainingAmount,500-paidAmount);
 }
 assert.equal(f.accounts.size,1);assert.equal(f.account().Total,1500);assert.equal(f.account().Paye,259.99);assert.equal(f.account().paymentHistory.length,2);
});
test('the debt reminder also recognizes legacy accounts whose totals were not materialized',async t=>{
 const f=setup(t);f.account().Total=0;f.account().Paye=0;
 const result=await request('/tailoring-orders/client-options');assert.equal(result.status,200);assert.equal(result.value.clients[0].creditRemainingAmount,200);assert.equal(f.account().Total,0);assert.equal(f.account().Paye,0);
});
test('payments received before delivery retain their original receipts and remain idempotent after the credit transfer',async t=>{
 const f=setup(t),made=await create(f.input({deliverOnCredit:false,paidAmount:0})),requestId=randomUUID();
 const partial=await pay(made.value,100,requestId);assert.equal(partial.status,200);const receipt=partial.value.paymentReceipt;
 const delivered=await request('/tailoring-orders/'+made.value._id+'/deliver',{version:partial.value.__v,clientId,deliverOnCredit:true});assert.equal(delivered.status,200);assert.equal(delivered.value.addedPayments.length,1);assert.deepEqual(delivered.value.addedPayments[0],receipt);assert.equal(f.account().Paye,200);
 const retry=await pay(delivered.value,100,requestId);assert.equal(retry.status,200);assert.deepEqual(retry.value.paymentReceipt,receipt);assert.equal(f.account().Paye,200);assert.equal(f.account().creditInvoices.length,1);
});
