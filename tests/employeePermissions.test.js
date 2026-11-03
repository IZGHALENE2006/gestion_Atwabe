import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import Employee from '../BackEnd/models/EmployeModele.js';
import Product from '../BackEnd/models/productModel.js';
import { creditCheckoutFixture, owner, otherOwner, employeeId, inactiveId, foreignEmployeeId } from './helpers/creditCheckoutFixture.js';
import { matches } from './helpers/modelMemory.js';
import { EMPLOYEE_MODULES, employeeModules, validateEmployeePermissions, canOpenEmployeePage, employeeCanRequest } from '../shared/employeePermissions.js';
process.env.JWT_SECRET='isolated-employee-permissions';
const {default:app}=await import('../BackEnd/app.js');
let server,base;before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;});after(()=>server.close());
const admin={id:owner,role:'admin'},staff={id:employeeId,role:'Employe',idAdmin:otherOwner,moduleAccess:EMPLOYEE_MODULES};
const request=async(path,body,method=body===undefined?'GET':'PUT',actor=admin)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+jwt.sign(actor,process.env.JWT_SECRET)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
const permissions=(moduleAccess,action={add:true,update:true,delete:false})=>({moduleAccess,action});
function fixture(t){
 const f=creditCheckoutFixture(t),control={};
 t.mock.method(Employee,'findOneAndUpdate',async(scope,change)=>{if(control.fail)throw new Error('Simulated permission failure');const row=f.rows(Employee).find(row=>matches(row,scope));if(!row)return null;Object.assign(row,change.$set||Object.fromEntries(Object.entries(change).filter(([,value])=>value!==undefined)));await row.validate();return new Employee(row.toObject());});
 t.mock.method(Employee,'findOneAndDelete',async scope=>{const index=f.rows(Employee).findIndex(row=>matches(row,scope));return index<0?null:f.rows(Employee).splice(index,1)[0];});
 return {...f,control,employee:f.rows(Employee).find(row=>String(row._id)===employeeId)};
}

test('legacy section access is preserved while an explicit empty list denies all business sections',()=>{
 assert.deepEqual(employeeModules({}),EMPLOYEE_MODULES);assert.deepEqual(employeeModules({moduleAccess:[]}),[]);
 for(const path of ['/Home/Caisse','/Home/cridit/UserCridit','/Home/Fesla','/Home/SfifaStock','/Home/Atwabe','/Home/Khadama/ala/workers/id','/Home/products','/Home/Categories','/Home/Clients','/Home/Facture/new','/Home/Profit/Hestorique','/Home/SideExpenses']){assert.equal(canOpenEmployeePage('Employe',{},path),true,path);assert.equal(canOpenEmployeePage('Employe',{moduleAccess:[]},path),false,path);assert.equal(canOpenEmployeePage('admin',{moduleAccess:[]},path),true,path);}
 for(const path of ['/Home/profile','/Home/changePassword','/Home/pagination'])assert.equal(canOpenEmployeePage('Employe',{moduleAccess:[]},path),true);
 for(const path of ['/Home/employees/EmployeeDashboard','/Home/Dashboard','/Home/Fornisseur','/Home/invoice-settings'])assert.equal(canOpenEmployeePage('Employe',{moduleAccess:EMPLOYEE_MODULES},path),false,path);
 assert.equal(canOpenEmployeePage('',{},'/Home/Caisse'),false);
});
test('section dependencies allow selectors without authorizing writes in another section',()=>{
 const cashier={moduleAccess:['cashier']},tailoring={moduleAccess:['tailoring']},workers={moduleAccess:['workers']};
 assert.equal(employeeCanRequest(cashier,'GET','/Product/Get'),true);assert.equal(employeeCanRequest(cashier,'POST','/addVentes'),true);assert.equal(employeeCanRequest(cashier,'POST','/addVentes/credit'),false);assert.equal(employeeCanRequest(cashier,'GET','/usercridite/get'),false);
 assert.equal(employeeCanRequest({moduleAccess:['cashier','credit']},'POST','/addVentes/credit'),true);
 assert.equal(employeeCanRequest(tailoring,'GET','/fabrics?search=cotton'),true);assert.equal(employeeCanRequest(tailoring,'POST','/fabrics'),false);
 assert.equal(employeeCanRequest(workers,'GET','/tailoring-orders'),true);assert.equal(employeeCanRequest(workers,'POST','/tailoring-orders'),false);assert.equal(employeeCanRequest(workers,'POST','/sfifa-stock'),false);
 assert.equal(employeeCanRequest({moduleAccess:EMPLOYEE_MODULES},'PUT','/Employe/id/permissions'),false);
});
test('permission input requires known unique sections and explicit boolean operation rights',()=>{
 assert.deepEqual(validateEmployeePermissions(permissions(['sfifa','tailoring'])).moduleAccess,['tailoring','sfifa']);
 for(const bad of [null,{},permissions(['admin']),permissions(['cashier','cashier']),{moduleAccess:'cashier',action:{}},{moduleAccess:[],action:{add:'true',update:false,delete:false}},{moduleAccess:[],action:{add:true,update:true,delete:false,promote:true}}])assert.throws(()=>validateEmployeePermissions(bad));
});
test('only the shop owner can save permissions, including an empty list; failures leave the account intact',async t=>{
 const f=fixture(t),url='/Employe/'+employeeId+'/permissions';
 let r=await request(url,permissions(['tailoring','sfifa']));assert.equal(r.status,200);assert.deepEqual(r.data.moduleAccess,['tailoring','sfifa']);
 assert.equal((await request(url,permissions([]),'PUT',staff)).status,403);assert.equal((await request(url,permissions([]),'PUT',{id:otherOwner,role:'admin'})).status,404);
 assert.equal((await request('/Employe/'+foreignEmployeeId+'/permissions',permissions([]))).status,404);
 assert.equal((await request(url,permissions(['admin']))).status,400);
 const before=f.employee.toObject();f.control.fail=true;assert.equal((await request(url,permissions([]))).status,500);assert.deepEqual(f.employee.toObject(),before);f.control.fail=false;
 assert.equal((await request(url,permissions([]))).status,200);assert.deepEqual(f.employee.moduleAccess.toObject(),[]);
});
test('revocation uses the current database record immediately, never module claims cached in a JWT',async t=>{
 const f=fixture(t);f.employee.moduleAccess=['cashier'];
 assert.equal((await request('/Product/Get',undefined,'GET',staff)).status,200);
 for(const [url,method]of [['/usercridite/get','GET'],['/tailoring-orders','GET'],['/sfifa-stock','GET'],['/addVentes/credit','POST'],['/Employe/get','GET'],['/Employe/add','POST'],['/Employe/Delete/'+employeeId,'DELETE']])assert.equal((await request(url,method==='GET'?undefined:{},method,staff)).status,403,url);
 assert.equal((await request('/Employe/'+employeeId+'/permissions',permissions([]))).status,200);
 assert.equal((await request('/Product/Get',undefined,'GET',staff)).status,403);
 let r=await request('/user/getMe',undefined,'GET',staff);assert.equal(r.status,200);assert.deepEqual(r.data.user.moduleAccess,[]);
 f.employee.isActive=false;assert.equal((await request('/user/getMe',undefined,'GET',staff)).status,403);
 assert.equal((await request('/user/getMe',undefined,'GET',{id:inactiveId,role:'Employe'})).status,403);
 assert.equal((await request('/user/getMe',undefined,'GET',{id:'999999999999999999999999',role:'Employe'})).status,403);
});
test('employee creation saves chosen sections and stale profile edits cannot overwrite later permission changes',async t=>{
 const f=fixture(t);let r=await request('/Employe/add',{name:'موظفة جديدة',email:'new@example.ma',cin:'AB987654',phone:'0611111111',password:'synthetic',isActive:true,...permissions(['tailoring'])},'POST');assert.equal(r.status,201);assert.deepEqual(r.data.moduleAccess,['tailoring']);assert.equal(r.data.action.add,true);
 assert.equal((await request('/Employe/'+employeeId+'/permissions',permissions(['credit']))).status,200);
 r=await request('/Employe/Update/'+employeeId,{name:'اسم معدّل',moduleAccess:EMPLOYEE_MODULES,action:{add:true,update:true,delete:true},role:'admin'});assert.equal(r.status,200);assert.deepEqual(r.data.moduleAccess,['credit']);assert.equal(r.data.role,'Employe');
 assert.equal((await request('/Employe/Update/'+foreignEmployeeId,{name:'forged'})).status,404);assert.equal((await request('/Employe/Delete/'+foreignEmployeeId,undefined,'DELETE')).status,404);
 assert.equal(f.rows(Product).length,2);
});
