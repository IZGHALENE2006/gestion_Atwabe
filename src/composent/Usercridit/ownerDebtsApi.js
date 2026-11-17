import axios from 'axios';
const api=(import.meta.env.VITE_API_URL||'http://localhost:7000')+'/owner-debts';
const config=(token,signal)=>({headers:{Authorization:'Bearer '+token},...(signal?{signal}:{})});
export const loadOwnerDebts=(token,signal)=>axios.get(api,config(token,signal)).then(result=>result.data);
export const saveOwnerDebt=(token,input,requestId)=>axios.post(api,{...input,requestId},config(token)).then(result=>result.data);
export const saveOwnerDebtPayment=(token,input,requestId)=>axios.post(api+'/payments',{...input,requestId},config(token)).then(result=>result.data);
export const loadOwnerDebtPayments=(token,debtId,signal)=>axios.get(api+'/payments',{...config(token,signal),params:debtId?{debtId}:undefined}).then(result=>result.data);
