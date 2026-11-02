import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "../BackEnd/node_modules/jsonwebtoken/index.js";
import app from "../BackEnd/app.js";
import Employee from "../BackEnd/models/EmployeModele.js";
import Admin from "../BackEnd/models/AdminModel.js";
import { creditActivity, creditDocument } from "../shared/creditDocuments.js";
import { creditCheckoutFixture, owner, otherOwner, employeeId, colleagueId, inactiveId, foreignEmployeeId, productIds } from "./helpers/creditCheckoutFixture.js";
const admin={id:owner,role:"admin"},employee={id:employeeId,role:"Employe",idAdmin:owner,name:"اسم مزوّر في الرمز"},colleague={id:colleagueId,role:"Employe",idAdmin:owner};
const previousSecret=process.env.JWT_SECRET;
let server,base;
before(async()=>{process.env.JWT_SECRET="credit-employee-tests";server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
const request=(path,{body,actor=employee,method=body===undefined?"GET":"POST"}={})=>fetch(base+path,{method,headers:{...(actor?{Authorization:`Bearer ${jwt.sign(actor,process.env.JWT_SECRET)}`} : {}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const line=(patch={})=>({nom:"جلابة",prix:500,Quantite:1,Paiement:100,requestId:randomUUID(),...patch});
const checkout=(f,patch={})=>({requestId:randomUUID(),customerId:String(f.customer._id),cart:[{id:productIds[0],qty:1}],amountPaid:50,...patch});
const actorSnapshot={id:employeeId,name:"خديجة",role:"Employe"};

test("employees can use customers created by the admin or another employee, while the admin sees the trusted customer creator",async t=>{
  const f=creditCheckoutFixture(t);
  let response=await request("/usercridite/add",{body:{name:"زبون المدير",createdBy:actorSnapshot},actor:admin});assert.equal(response.status,201);const byAdmin=(await response.json()).user;
  response=await request("/usercridite/add",{body:{name:"زبون الموظفة",phone:"061234",createdBy:{id:owner,name:"مزوّر",role:"admin"}}});assert.equal(response.status,201);const byEmployee=(await response.json()).user;
  assert.deepEqual(byEmployee.createdBy,actorSnapshot);assert.equal(byAdmin.createdBy.id,owner);assert.equal(byAdmin.idUser,owner);assert.equal(byEmployee.idUser,owner);
  for(const actor of [employee,colleague,admin]){const list=await(await request("/usercridite/get",{actor})).json();assert.ok(list.some(row=>row._id===byAdmin._id));assert.equal(list.find(row=>row._id===byEmployee._id).createdBy.name,"خديجة");assert.equal(list.some(row=>row._id===String(f.foreignCustomer._id)),false);}
  assert.equal((await request(`/usercridite/add-product/${byAdmin._id}`,{body:line(),actor:colleague})).status,201);
  assert.equal((await request(`/usercridite/add-product/${byEmployee._id}`,{body:line(),actor:admin})).status,201);
});

test("manual credit and payments record the actual employee and immutable names on invoices, receipts and the journal",async t=>{
  const f=creditCheckoutFixture(t),body=line({actor:{id:owner,name:"مدير مزوّر",role:"admin"}});
  let response=await request(`/usercridite/add-product/${f.customer._id}`,{body});assert.equal(response.status,201);let result=await response.json();
  const invoice=creditDocument(result.user,result.document);assert.deepEqual(invoice.actor,actorSnapshot);assert.deepEqual(result.user.produit.at(-1).actor,actorSnapshot);assert.deepEqual(result.user.paymentHistory.at(-1).actor,actorSnapshot);
  const paymentBody={amount:50,requestId:randomUUID(),actor:{id:owner,name:"مزوّر",role:"admin"}};
  response=await request(`/usercridite/add-payment/${f.customer._id}`,{body:paymentBody});assert.equal(response.status,200);result=await response.json();
  const receipt=creditDocument(result.user,{kind:"payment",payment:result.user.paymentHistory.at(-1)});assert.deepEqual(receipt.actor,actorSnapshot);assert.equal(receipt.amount,50);assert.equal(receipt.remaining,550);
  f.rows(Employee).find(row=>String(row._id)===employeeId).name="اسم جديد";
  response=await request(`/usercridite/add-payment/${f.customer._id}`,{body:paymentBody});assert.equal(response.status,200);assert.equal((await response.json()).user.paymentHistory.length,2);
  const current=await(await request(`/usercridite/get/${f.customer._id}`,{actor:admin})).json();assert.deepEqual(creditDocument(current,{kind:"payment",payment:current.paymentHistory.at(-1)}),receipt);
  assert.equal(creditActivity(current).filter(event=>event.actor?.name==="خديجة").length,3);
  assert.equal((await request(`/usercridite/add-payment/${f.customer._id}`,{body:paymentBody,actor:colleague})).status,403);
  assert.equal((await request(`/usercridite/add-product/${f.customer._id}`,{body,actor:admin})).status,403);
});

test("employee cashier credit writes the shop debt and stock but attributes sales, initial payment and invoice to that employee",async t=>{
  const f=creditCheckoutFixture(t),body=checkout(f,{actor:{id:owner,name:"مزوّر",role:"admin"}});
  const response=await request("/addVentes/credit",{body});assert.equal(response.status,201);const result=await response.json();
  assert.deepEqual(creditDocument(result.creditUser,result.document).actor,actorSnapshot);assert.equal(result.facture.nameEmp,"خديجة");assert.equal(result.creditUser.idUser,owner);assert.equal(result.creditUser.Total,700);assert.equal(result.creditUser.Paye,150);assert.deepEqual(result.creditUser.paymentHistory[0].actor,actorSnapshot);
  assert.equal(f.actor().Facture.length,0);const actor=f.rows(Employee).find(row=>String(row._id)===employeeId);assert.equal(actor.Facture.length,1);assert.equal(actor.ventes.length,1);assert.equal(f.products()[0].quantite,9);
  assert.equal(creditActivity(result.creditUser).find(event=>event.kind==="sale").actor.name,"خديجة");
  assert.equal((await request("/addVentes/credit",{body})).status,201);assert.equal(actor.Facture.length,1);assert.equal((await request("/addVentes/credit",{body,actor:colleague})).status,403);assert.equal((await request("/addVentes/credit",{body,actor:admin})).status,403);assert.equal(f.products()[0].quantite,9);
});

test("employee checkout creates a shared customer with the original employee snapshot, including after a lost response",async t=>{
  const f=creditCheckoutFixture(t),body=checkout(f,{customerId:undefined,newCustomer:{name:"زبون الصندوق",createdBy:{id:owner,name:"مزوّر"}}});
  f.controls.creditAfterSave=true;assert.equal((await request("/addVentes/credit",{body})).status,503);
  f.rows(Employee).find(row=>String(row._id)===employeeId).name="اسم متغيّر";
  const response=await request("/addVentes/credit",{body});assert.equal(response.status,201);const result=await response.json();assert.deepEqual(result.creditUser.createdBy,actorSnapshot);assert.equal(result.facture.nameEmp,"خديجة");assert.equal(result.creditUser.paymentHistory.length,1);assert.equal(f.accounts().length,3);assert.equal(f.products()[0].quantite,9);
  const adminList=await(await request("/usercridite/get",{actor:admin})).json();assert.equal(adminList.find(row=>row._id===result.creditUser._id).createdBy.name,"خديجة");
});

test("current shop membership overrides forged or stale JWT shop data, and disabled or deleted accounts cannot read or write credit",async t=>{
  const f=creditCheckoutFixture(t),paths=["/usercridite/get",`/usercridite/get/${f.customer._id}`];
  for(const path of paths)assert.equal((await request(path,{actor:{...employee,idAdmin:otherOwner}})).status,200);
  const foreignActor={id:foreignEmployeeId,role:"Employe",idAdmin:owner};
  const foreignList=await(await request("/usercridite/get",{actor:foreignActor})).json();assert.equal(foreignList.length,1);assert.equal(foreignList[0]._id,String(f.foreignCustomer._id));
  assert.equal((await request(`/usercridite/get/${f.customer._id}`,{actor:foreignActor})).status,404);
  assert.equal((await request(`/usercridite/add-payment/${f.customer._id}`,{body:{amount:10},actor:foreignActor})).status,404);
  assert.equal((await request("/addVentes/credit",{body:checkout(f),actor:foreignActor})).status,404);
  assert.equal((await request(`/usercridite/get/${f.foreignCustomer._id}`)).status,404);
  for(const actor of [{id:inactiveId,role:"Employe",idAdmin:owner},{id:"aaaaaaaaaaaaaaaaaaaaaaaa",role:"Employe",idAdmin:owner},{id:owner,role:"visitor"},null]){
    for(const [path,body] of [["/usercridite/get",undefined],["/usercridite/add",{name:"غير مسموح"}],[`/usercridite/add-payment/${f.customer._id}`,{amount:10}],[`/usercridite/add-product/${f.customer._id}`,line()],["/addVentes/credit",checkout(f)]])assert.ok([401,403].includes((await request(path,{body,actor})).status));
  }
  assert.equal((await request(`/usercridite/DeleteProduct/${f.customer._id}/OLD`,{method:"DELETE"})).status,403);assert.equal((await request(`/usercridite/Delete/${f.customer._id}`,{method:"DELETE"})).status,403);
  const staff=f.rows(Employee).find(row=>String(row._id)===employeeId);staff.isActive=false;assert.equal((await request("/usercridite/get")).status,403);assert.equal(f.account().Paye,100);assert.equal(f.actor().Facture.length,0);
});

test("legacy credit documents do not invent an actor or rewrite the account during reads",async t=>{
  const f=creditCheckoutFixture(t),before=f.account().toObject();
  const response=await request(`/usercridite/get/${f.customer._id}`);assert.equal(response.status,200);const user=await response.json();assert.equal(user.createdBy,undefined);assert.equal(user.produit[0].actor,undefined);assert.equal(creditDocument(user,{kind:"invoice",line:user.produit[0]}).actor,undefined);assert.deepEqual(f.account().toObject(),before);assert.equal(creditActivity(user)[0].actor,undefined);
  assert.equal(f.rows(Admin)[0].name,"صاحب المحل");
});
