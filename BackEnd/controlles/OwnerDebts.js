import { createHash } from 'node:crypto';
import OwnerDebtLedger from '../models/OwnerDebtLedger.js';
import { creditAccessFor } from '../utils/creditAccess.js';
import { moduleOperationPermissions } from '../../shared/employeePermissions.js';
import { OWNER_DEBT_OPERATIONS, OWNER_DEBT_REQUEST, validateOwnerDebt, validateOwnerDebtPayment, ownerDebtSummary, allocateOwnerDebtPayment } from '../../shared/ownerDebts.js';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
async function accessFor(req,operation){const access=await creditAccessFor(req),permissions=moduleOperationPermissions(req.user.role,req.employeeAccount,'credit');if(operation?!permissions[operation]:!OWNER_DEBT_OPERATIONS.some(key=>permissions[key]))throw fail('forbidden',403);return{...access,permissions};}
const publicPayment=row=>({_id:String(row._id),scope:row.scope,...(row.debtId?{debtId:String(row.debtId)}:{}),amountCents:row.amountCents,paidOn:row.paidOn,note:row.note,actor:row.actor,createdAt:row.createdAt,allocations:row.allocations.map(value=>({debtId:String(value.debtId),amountCents:value.amountCents}))});
const view=(ledger,permissions)=>({...ownerDebtSummary(ledger||{}),permissions:Object.fromEntries(OWNER_DEBT_OPERATIONS.map(key=>[key,permissions[key]]))});
function sendError(res,error,fallback){return res.status(error.status||500).json({message:error.status?error.message:fallback,...(error.fields?{fields:error.fields}:{})});}
export async function listOwnerDebts(req,res){try{const access=await accessFor(req);const ledger=await OwnerDebtLedger.findOne({idAdmin:access.ownerId});res.set('Cache-Control','no-store');res.json(view(ledger,access.permissions));}catch(error){sendError(res,error,'loadFailed');}}
export async function listOwnerDebtPayments(req,res){try{const access=await accessFor(req,'ownerDebtHistory'),ledger=await OwnerDebtLedger.findOne({idAdmin:access.ownerId});const debtId=req.query.debtId;if(debtId!==undefined&&(!/^[a-f\d]{24}$/.test(debtId)||!ledger?.debts.some(row=>String(row._id)===debtId)))throw fail('debtNotFound',404);res.set('Cache-Control','no-store');res.json({payments:(ledger?.payments||[]).filter(row=>!debtId||row.allocations.some(value=>String(value.debtId)===debtId)).map(publicPayment).reverse()});}catch(error){sendError(res,error,'loadFailed');}}
async function mutate(req,res,kind){
 try{
  const access=await accessFor(req,kind==='debt'?'addOwnerDebt':'payOwnerDebt'),input=kind==='debt'?validateOwnerDebt(req.body):validateOwnerDebtPayment(req.body),requestId=typeof req.body.requestId==='string'?req.body.requestId.toLowerCase():'';
  if(!OWNER_DEBT_REQUEST.test(requestId))throw fail('invalidRequest',400);
  const fingerprint=createHash('sha256').update(JSON.stringify({kind,input,actorId:access.actor.id})).digest('hex');
  for(let attempt=0;attempt<8;attempt++){
   let ledger=await OwnerDebtLedger.findOne({idAdmin:access.ownerId});
   if(!ledger)ledger=new OwnerDebtLedger({idAdmin:access.ownerId});
   const old=[...ledger.debts,...ledger.payments].find(row=>row.requestId===requestId);
   if(old){if(old.fingerprint!==fingerprint)throw fail('requestConflict');return res.json(view(ledger,access.permissions));}
   const record={requestId,fingerprint,actor:access.actor,createdAt:new Date()};
   if(kind==='debt')ledger.debts.push({...input,...record});
   else{
    const allocations=allocateOwnerDebtPayment(ownerDebtSummary(ledger).debts,input);
    if(input.expectedAllocations&&JSON.stringify(input.expectedAllocations)!==JSON.stringify(allocations))throw fail('balancesChanged');
    const {expectedAllocations:_expected,...payment}=input;ledger.payments.push({...payment,...record,allocations});
   }
   try{await ledger.save();return res.status(201).json(view(ledger,access.permissions));}
   catch(error){if(error.name!=='VersionError'&&error.code!==11000)throw error;if(attempt===7)throw fail('balancesChanged');}
  }
 }catch(error){sendError(res,error,'saveFailed');}
}
export const addOwnerDebt=(req,res)=>mutate(req,res,'debt');
export const addOwnerDebtPayment=(req,res)=>mutate(req,res,'payment');
