import { tailoringMoneyCents, validTailoringDate, todayTailoringDate } from './tailoring.js';

export const OWNER_DEBT_OPERATIONS = ['ownerDebts', 'addOwnerDebt', 'payOwnerDebt', 'ownerDebtHistory'];
export const OWNER_DEBT_REQUEST = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
export const ownerDebtToday = todayTailoringDate;
const id = value => typeof value === 'string' && /^[a-f\d]{24}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.length <= max && [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127);
const validDay = value => validTailoringDate(value) && value >= '1900-01-01';
const invalid = fields => Object.assign(new Error('invalidOwnerDebt'), { fields, status: 400 });

export function validateOwnerDebt(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '', creditor = typeof input?.creditor === 'string' ? input.creditor.trim() : '';
  const amountCents = tailoringMoneyCents(input?.amount), date = input?.date, dueDate = input?.dueDate || '';
  const fields = {};
  if (!name || !text(name,160)) fields.name='invalidName';
  if (input?.creditor !== undefined && (typeof input.creditor !== 'string' || !text(creditor,160))) fields.creditor='invalidCreditor';
  if (amountCents === null || amountCents <= 0) fields.amount='invalidAmount';
  if (!validDay(date)) fields.date='invalidDate';
  if (input?.dueDate!==undefined && typeof input.dueDate!=='string' || dueDate && (!validDay(dueDate) || !fields.date && dueDate < date)) fields.dueDate='invalidDueDate';
  if (Object.keys(fields).length) throw invalid(fields);
  return { name, creditor, amountCents, date, dueDate };
}
export function validateOwnerDebtPayment(input, today=ownerDebtToday()) {
  const fields={}, scope=input?.scope, debtId=typeof input?.debtId==='string'?input.debtId.toLowerCase():'', amountCents=tailoringMoneyCents(input?.amount), paidOn=input?.paidOn;
  const note=typeof input?.note==='string'?input.note.trim():'';
  if (!['debt','all'].includes(scope)) fields.scope='invalidScope';
  if (scope==='debt' && !id(debtId)) fields.debtId='debtNotFound';
  if (amountCents===null || amountCents<=0) fields.amount='invalidAmount';
  if (!validDay(paidOn) || paidOn>today) fields.paidOn='invalidPaymentDate';
  if (input?.note!==undefined && (typeof input.note!=='string'||!text(note,500))) fields.note='invalidNote';
  const expectedAllocations=input?.expectedAllocations;
  if (expectedAllocations!==undefined && (!Array.isArray(expectedAllocations)||!expectedAllocations.length||expectedAllocations.length>5000||new Set(expectedAllocations.map(row=>row?.debtId)).size!==expectedAllocations.length||expectedAllocations.some(row=>!id(row?.debtId)||!Number.isSafeInteger(row?.amountCents)||row.amountCents<=0))) fields.amount='balancesChanged';
  if (Object.keys(fields).length) throw invalid(fields);
  return {scope,...(scope==='debt'?{debtId}:{}),amountCents,paidOn,note,...(expectedAllocations?{expectedAllocations:expectedAllocations.map(row=>({debtId:row.debtId,amountCents:row.amountCents}))}:{})};
}
export function ownerDebtSummary(ledger={}) {
  const paid=new Map();
  for(const payment of ledger.payments||[])for(const allocation of payment.allocations||[])paid.set(String(allocation.debtId),(paid.get(String(allocation.debtId))||0)+allocation.amountCents);
  const debts=(ledger.debts||[]).map(row=>({ _id:String(row._id),name:row.name,creditor:row.creditor||'',date:row.date,dueDate:row.dueDate||'',amountCents:row.amountCents,paidCents:paid.get(String(row._id))||0,remainingCents:row.amountCents-(paid.get(String(row._id))||0),createdAt:row.createdAt,actor:row.actor?.toObject?row.actor.toObject():row.actor }));
  const totals={amountCents:0,paidCents:0,remainingCents:0};for(const debt of debts)for(const key of Object.keys(totals))totals[key]+=debt[key];
  if(Object.values(totals).some(value=>!Number.isSafeInteger(value)||value<0)||debts.some(debt=>debt.remainingCents<0))throw new Error('invalidOwnerDebtLedger');
  return {debts,totals};
}
export function allocateOwnerDebtPayment(debts,payment) {
  const candidates=debts.filter(debt=>debt.remainingCents>0&&(payment.scope==='all'||debt._id===payment.debtId)).sort((a,b)=>(a.dueDate||a.date).localeCompare(b.dueDate||b.date)||a.date.localeCompare(b.date)||new Date(a.createdAt)-new Date(b.createdAt)||a._id.localeCompare(b._id));
  if(payment.scope==='debt'&&!debts.some(debt=>debt._id===payment.debtId))throw Object.assign(new Error('debtNotFound'),{status:404});
  let remaining=payment.amountCents;const allocations=[];
  for(const debt of candidates){const take=Math.min(remaining,debt.remainingCents);if(take>0)allocations.push({debtId:debt._id,amountCents:take});remaining-=take;if(!remaining)break;}
  if(remaining>0)throw Object.assign(new Error('paymentExceedsRemaining'),{status:409});
  return allocations;
}
