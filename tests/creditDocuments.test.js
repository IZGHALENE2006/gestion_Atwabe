import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import UserCredit from "../BackEnd/models/userCidit.js";
import Admin from "../BackEnd/models/AdminModel.js";
import Employee from "../BackEnd/models/EmployeModele.js";
import { creditDocument } from "../shared/creditDocuments.js";

const owner="111111111111111111111111",otherOwner="222222222222222222222222";
const admin={id:owner,role:"admin"},stranger={id:otherOwner,role:"admin"},previousSecret=process.env.JWT_SECRET;
let server,base;
before(async()=>{process.env.JWT_SECRET="credit-documents-tests";server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${server.address().port}/usercridite`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
const query=fn=>({sort(){return this;},then(resolve,reject){return Promise.resolve().then(fn).then(resolve,reject);}});
function setup(t){
  t.mock.method(Admin,"findById",async id=>[owner,otherOwner].includes(String(id))?new Admin({_id:id,name:"المدير"}):null);
  t.mock.method(Employee,"findById",async()=>null);
  const records=[],controls={failSave:false};
  const matches=(row,scope)=>Object.entries(scope).every(([key,value])=>String(row[key])===String(value));
  t.mock.method(UserCredit,"findOne",async scope=>{const row=records.find(value=>matches(value,scope));return row?new UserCredit(row.toObject()):null;});
  t.mock.method(UserCredit,"find",scope=>query(()=>records.filter(row=>matches(row,scope)).map(row=>new UserCredit(row.toObject()))));
  t.mock.method(UserCredit,"create",async value=>{const row=new UserCredit({...value,__v:0,createdAt:new Date(),updatedAt:new Date()});await row.validate();records.push(row);return row;});
  const save=t.mock.method(UserCredit.prototype,"save",async function(){
    await this.validate();if(controls.failSave){controls.failSave=false;throw new Error("private database detail");}
    const index=records.findIndex(row=>String(row._id)===String(this._id));if(index<0||records[index].__v!==this.__v)throw Object.assign(new Error("stale"),{name:"VersionError"});
    this.__v+=1;this.updatedAt=new Date();records[index]=new UserCredit(this.toObject());return this;
  });
  const seed=(patch={})=>{const row=new UserCredit({idUser:owner,name:"فاطمة",phone:"0612345678",cin:"AA1234",__v:0,createdAt:new Date(),updatedAt:new Date(),...patch});records.push(row);return row;};
  return{records,controls,save,seed};
}
async function request(path,{body,method=body===undefined?"GET":"POST",actor=admin}={}){return fetch(base+path,{method,headers:{...(actor?{Authorization:`Bearer ${jwt.sign(actor,process.env.JWT_SECRET)}`} : {}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const lineInput=(patch={})=>({nom:"جلابة",prix:500,Quantite:2,Paiement:200,requestId:randomUUID(),...patch});
const addLine=(user,body=lineInput())=>request(`/add-product/${user._id}`,{body});
const pay=(user,body)=>request(`/add-payment/${user._id}`,{body:{requestId:randomUUID(),...body}});

test("adding credit creates an immutable invoice and an initial-payment receipt in one write",async t=>{
  const f=setup(t),user=f.seed(),body=lineInput({Date:"2000-01-01",balanceSnapshot:{remainingAfter:0}}),start=Date.now();
  const response=await addLine(user,body);assert.equal(response.status,201);const saved=await response.json();
  assert.deepEqual(saved.user.summary,{total:1000,paid:200,remaining:800,totalQuantity:2});assert.equal(saved.user.creditInvoices.length,1);assert.equal(saved.user.paymentHistory.length,1);
  assert.match(saved.document.reference,/^CI-[A-F\d]{24}$/);assert.equal(saved.document.kind,"invoice");
  const invoice=creditDocument(saved.user,saved.document);assert.equal(invoice.total,1000);assert.equal(invoice.paid,200);assert.equal(invoice.remaining,800);assert.equal(invoice.lines[0].nom,"جلابة");assert.ok(new Date(invoice.date).getTime()>=start);
  const receipt=saved.user.paymentHistory[0];assert.equal(receipt.source,"initial");assert.equal(receipt.amount,200);assert.equal(receipt.balanceSnapshot.remainingBefore,1000);assert.equal(receipt.balanceSnapshot.remainingAfter,800);
  assert.equal(JSON.stringify(saved).includes("requestId"),false);assert.equal(JSON.stringify(saved).includes("requestFingerprint"),false);assert.equal(f.save.mock.callCount(),1);
});

test("a receipt retains the original date, customer and balance after more debt, payments or deletion of the original purchase",async t=>{
  const f=setup(t),user=f.seed();let result=await(await addLine(user)).json();const firstInvoice=result.document.reference;
  const paid=await pay(user,{amount:300,note:"نقدًا",Date:"2000-01-01"});assert.equal(paid.status,200);result=await paid.json();
  const receipt=result.user.paymentHistory.find(payment=>payment.reference===result.document.reference),original=creditDocument(result.user,{kind:"payment",payment:receipt});
  assert.equal(original.historical,true);assert.equal(original.amount,300);assert.equal(original.remainingBefore,800);assert.equal(original.remaining,500);assert.equal(original.paid,500);
  f.records[0].name="اسم جديد";await addLine(user,lineInput({nom:"سفيفة",prix:250,Quantite:1,Paiement:0}));
  let current=await(await request(`/get/${user._id}`)).json();assert.equal(current.summary.remaining,750);
  const reprint=creditDocument(current,{kind:"payment",payment:current.paymentHistory.find(payment=>payment.reference===receipt.reference)});assert.deepEqual(reprint,original);assert.equal(reprint.customer.name,"فاطمة");
  const firstLine=current.produit[0],deleted=await request(`/DeleteProduct/${user._id}/${firstLine.id}`,{method:"DELETE"});assert.equal(deleted.status,200);current=(await deleted.json()).user;
  const kept=creditDocument(current,{kind:"invoice",reference:firstInvoice});assert.equal(kept.total,1000);assert.equal(kept.paid,200);assert.equal(kept.remaining,800);assert.equal(kept.lines[0].nom,"جلابة");assert.equal(current.paymentHistory.length,2);
});

test("invoice and payment retries never duplicate money or documents, even after full settlement or purchase deletion",async t=>{
  const f=setup(t),user=f.seed(),body=lineInput();const first=await(await addLine(user,body)).json();
  const retry=await addLine(user,body);assert.equal(retry.status,200);assert.equal((await retry.json()).document.reference,first.document.reference);assert.equal(f.records[0].Total,1000);assert.equal(f.records[0].paymentHistory.length,1);
  assert.equal((await addLine(user,{...body,prix:600})).status,409);
  const payment={amount:800,requestId:randomUUID()},results=await Promise.all([pay(user,payment),pay(user,payment)]);assert.deepEqual(results.map(result=>result.status),[200,200]);assert.equal(f.records[0].Paye,1000);assert.equal(f.records[0].paymentHistory.length,2);
  assert.equal((await pay(user,payment)).status,200);assert.equal((await pay(user,{...payment,amount:700})).status,409);assert.equal((await pay(user,{amount:1,requestId:body.requestId})).status,409);
  const line=f.records[0].produit[0];assert.equal((await request(`/DeleteProduct/${user._id}/${line.id}`,{method:"DELETE"})).status,200);
  assert.equal((await addLine(user,body)).status,200);assert.equal(f.records[0].produit.length,0);assert.equal(f.records[0].creditInvoices.length,1);
});

test("concurrent payments cannot overpay and decimal receipts reflect the actual committed balance",async t=>{
  const f=setup(t),user=f.seed();await addLine(user,lineInput({Paiement:0}));
  const tooMuch=await Promise.all([pay(user,{amount:600}),pay(user,{amount:600})]);assert.deepEqual(tooMuch.map(response=>response.status).sort(),[200,400]);assert.equal(f.records[0].Paye,600);assert.equal(f.records[0].paymentHistory.length,1);
  const decimal=f.seed();await addLine(decimal,lineInput({prix:1,Quantite:1,Paiement:0}));
  const responses=await Promise.all([pay(decimal,{amount:0.1}),pay(decimal,{amount:0.2})]);assert.ok(responses.every(response=>response.status===200));
  const row=f.records.find(row=>String(row._id)===String(decimal._id));assert.equal(row.Paye,0.3);assert.equal(row.paymentHistory.at(-1).balanceSnapshot.remainingAfter,0.7);assert.equal(row.paymentHistory.length,2);
});

test("failed writes leave money and receipts unchanged, and ownership, roles and invalid operations are enforced",async t=>{
  const f=setup(t),user=f.seed();await addLine(user,lineInput({Paiement:0}));f.controls.failSave=true;
  const body={amount:200,requestId:randomUUID()},failed=await pay(user,body);assert.equal(failed.status,500);assert.deepEqual(await failed.json(),{message:"creditSaveFailed"});assert.equal(f.records[0].Paye,0);assert.equal(f.records[0].paymentHistory.length,0);assert.equal((await pay(user,body)).status,200);
  for(const actor of [stranger,null,{id:owner,role:"Employe"}]){const response=await request(`/add-payment/${user._id}`,{body:{amount:100},actor});assert.ok([401,403,404].includes(response.status));}
  assert.equal((await pay(user,{amount:0})).status,400);assert.equal((await pay(user,{amount:900})).status,400);assert.equal((await pay(user,{amount:1,requestId:"bad"})).status,400);assert.equal((await addLine(user,lineInput({Paiement:1001}))).status,400);
});

test("old payments stay printable with a stable reference and clearly lack historical balances; reads do not rewrite them",async t=>{
  const f=setup(t),date=new Date("2026-01-03T10:00:00Z"),user=f.seed({Total:300,Paye:100,Qauntite:1,produit:[{id:"OLD",nom:"قميص",prix:300,Quantite:1,Paiement:50,Date:new Date("2026-01-01")}],paymentHistory:[{amount:50,note:"قديم",Date:date}]});
  const first=await(await request(`/get/${user._id}`)).json(),second=await(await request(`/get/${user._id}`)).json();assert.equal(first.paymentHistory[0].reference,second.paymentHistory[0].reference);assert.equal(first.paymentHistory[0].Date,date.toISOString());assert.equal(f.save.mock.callCount(),0);
  const doc=creditDocument(first,{kind:"payment",payment:first.paymentHistory[0]});assert.equal(doc.historical,false);assert.equal(doc.amount,50);assert.equal(doc.remaining,200);assert.equal(first.paymentHistory[0].balanceSnapshot,undefined);
  await pay(user,{amount:50});assert.equal(f.records[0].Paye,150);assert.equal(f.records[0].paymentHistory[0].id,undefined);assert.equal(f.records[0].paymentHistory[0].balanceSnapshot,undefined);assert.equal(f.records[0].paymentHistory[1].balanceSnapshot.remainingAfter,150);
});

test("the model rejects inconsistent historical receipt balances",async t=>{
  const f=setup(t),user=f.seed();await addLine(user);const corrupt=new UserCredit(f.records[0].toObject());corrupt.paymentHistory[0].balanceSnapshot.remainingAfter=1;await assert.rejects(corrupt.validate());
});

test("a legacy purchase never matches an unrelated stored invoice with no computed reference",()=>{
  const line={id:"OLD",nom:"Legacy garment",prix:120,Quantite:2,Paiement:40,Date:"2026-01-01T10:00:00Z"};
  const user={_id:owner,name:"Customer",produit:[line],creditInvoices:[{id:"333333333333333333333333",line:{nom:"New garment"},total:900,paid:0,remaining:900}]};
  const document=creditDocument(user,{kind:"invoice",line});
  assert.deepEqual(document.lines,[line]);assert.equal(document.total,240);assert.equal(document.paid,40);assert.equal(document.remaining,200);assert.equal(document.reference,`CI-${owner}-OLD`);
});
