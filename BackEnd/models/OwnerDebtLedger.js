import mongoose from 'mongoose';
import { OWNER_DEBT_REQUEST, ownerDebtSummary, validateOwnerDebt, validateOwnerDebtPayment } from '../../shared/ownerDebts.js';
const cents={type:Number,required:true,min:1,validate:Number.isSafeInteger};
const actor=new mongoose.Schema({id:{type:mongoose.Schema.Types.ObjectId,required:true},name:{type:String,default:''},role:{type:String,enum:['admin','Employe'],required:true}},{_id:false});
const request={requestId:{type:String,required:true,match:OWNER_DEBT_REQUEST},fingerprint:{type:String,required:true},actor:{type:actor,required:true},createdAt:{type:Date,required:true}};
const debt=new mongoose.Schema({...request,name:{type:String,required:true,maxlength:160},creditor:{type:String,default:'',maxlength:160},amountCents:cents,date:{type:String,required:true},dueDate:{type:String,default:''}});
const payment=new mongoose.Schema({...request,scope:{type:String,enum:['debt','all'],required:true},debtId:{type:mongoose.Schema.Types.ObjectId,default:undefined},amountCents:cents,paidOn:{type:String,required:true},note:{type:String,default:'',maxlength:500},allocations:{type:[new mongoose.Schema({debtId:{type:mongoose.Schema.Types.ObjectId,required:true},amountCents:cents},{_id:false})],required:true}});
const schema=new mongoose.Schema({idAdmin:{type:mongoose.Schema.Types.ObjectId,required:true,unique:true},debts:{type:[debt],default:[]},payments:{type:[payment],default:[]}},{timestamps:true,optimisticConcurrency:true});
schema.pre('validate',function(){
 const requests=new Set(),debtIds=new Set(this.debts.map(row=>String(row._id)));
 for(const row of [...this.debts,...this.payments]){if(requests.has(row.requestId))this.invalidate('debts','Repeated operation');requests.add(row.requestId);}
 for(const row of this.debts)try{validateOwnerDebt({name:row.name,creditor:row.creditor,amount:row.amountCents/100,date:row.date,dueDate:row.dueDate});}catch{this.invalidate('debts','Invalid debt');}
 for(const row of this.payments){
  try{validateOwnerDebtPayment({scope:row.scope,debtId:row.debtId&&String(row.debtId),amount:row.amountCents/100,paidOn:row.paidOn,note:row.note},'9999-12-31');}catch{this.invalidate('payments','Invalid payment');}
  if(!row.allocations.length||new Set(row.allocations.map(value=>String(value.debtId))).size!==row.allocations.length||row.allocations.some(value=>!debtIds.has(String(value.debtId))||row.scope==='debt'&&String(value.debtId)!==String(row.debtId))||row.allocations.reduce((sum,value)=>sum+value.amountCents,0)!==row.amountCents)this.invalidate('payments','Invalid allocation');
 }
 try{ownerDebtSummary(this);}catch{this.invalidate('payments','Invalid ledger balances');}
});
export default mongoose.model('OwnerDebtLedger',schema);
