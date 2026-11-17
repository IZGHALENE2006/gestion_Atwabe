import { createElement, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { IoAddOutline, IoWalletOutline, IoCashOutline, IoTimeOutline, IoSearchOutline, IoReceiptOutline } from 'react-icons/io5';
import useEmployeeOperations from '../../hooks/useEmployeeOperations.js';
import RowActionsMenu from '../shared/RowActionsMenu.jsx';
import { OWNER_DEBT_OPERATIONS, ownerDebtToday } from '../../../shared/ownerDebts.js';
import { loadOwnerDebts } from './ownerDebtsApi.js';
import { OwnerDebtForm, OwnerDebtPaymentDialog, OwnerDebtHistoryDialog } from './OwnerDebtDialogs.jsx';
import './ownerDebts.css';

export default function OwnerDebts(){
 const {t,i18n}=useTranslation(),token=useSelector(state=>state.LoginAdmin.token),operations=useEmployeeOperations('credit');
 const allowed=OWNER_DEBT_OPERATIONS.some(key=>operations[key]);
 const [result,setResult]=useState(null),[revision,setRevision]=useState(0),[editor,setEditor]=useState(null),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState('all');
 const state=result?.token===token&&result.revision===revision?result:{loading:true,debts:[],totals:{amountCents:0,paidCents:0,remainingCents:0},permissions:{},error:''};
 useEffect(()=>{if(!token||!allowed)return;const controller=new AbortController();loadOwnerDebts(token,controller.signal).then(data=>{if(!controller.signal.aborted)setResult({...data,token,revision,loading:false,error:''});}).catch(error=>{if(!controller.signal.aborted)setResult({token,revision,loading:false,debts:[],totals:{amountCents:0,paidCents:0,remainingCents:0},permissions:{},error:error.response?.status===403?'forbidden':'loadFailed'});});return()=>controller.abort();},[token,allowed,revision]);
 const reload=()=>{setEditor(null);setMessage('');setRevision(value=>value+1);};
 const saved=(data,key)=>{setResult({...data,token,revision,loading:false,error:''});setEditor(null);setMessage(key);};
 if(!token)return <Navigate to="/LoginChoise" replace/>;
 if(!allowed)return <p role="alert" className="od-feedback od-error">{t('ownerDebts.forbidden')}</p>;
 const money=cents=>new Intl.NumberFormat(i18n.language==='ar'?'ar-MA':'fr-MA',{style:'currency',currency:'MAD'}).format(cents/100);
 const date=day=>new Date(day+'T12:00:00').toLocaleDateString(i18n.language==='ar'?'ar-MA':'fr-MA');
 const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
 const today=ownerDebtToday();
 const rows=state.debts.filter(debt=>(status==='all'||status==='settled'&&debt.remainingCents===0||status==='open'&&debt.remainingCents>0||status==='overdue'&&debt.remainingCents>0&&debt.dueDate&&debt.dueDate<today)&&normalize(debt.name+' '+debt.creditor).includes(normalize(query.trim()))).sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt).localeCompare(String(a.createdAt)));
 const permissions=state.permissions;
 return <main className="od-page" dir={i18n.dir()}><header className="od-hero"><div><span className="od-eyebrow"><IoWalletOutline/>{t('ownerDebts.title')}</span><h1>{t('ownerDebts.title')}</h1><p>{t('ownerDebts.subtitle')}</p></div><div className="od-buttons">{permissions.ownerDebtHistory&&<button type="button" data-owner-debt-history onClick={()=>setEditor({mode:'history'})}><IoTimeOutline/>{t('ownerDebts.history')}</button>}{permissions.payOwnerDebt&&<button type="button" className="od-green" data-pay-all-owner-debts disabled={!state.totals.remainingCents} onClick={()=>setEditor({mode:'payment'})}><IoCashOutline/>{t('ownerDebts.payAll')}</button>}{permissions.addOwnerDebt&&<button type="button" className="od-blue" data-add-owner-debt onClick={()=>setEditor({mode:'add'})}><IoAddOutline/>{t('ownerDebts.add')}</button>}</div></header>
 {message&&<p className="od-feedback od-success" role="status">{t('ownerDebts.'+message)}</p>}
 {state.loading?<p className="od-empty" role="status">{t('ownerDebts.loading')}</p>:state.error?<div className="od-feedback od-error" role="alert"><p>{t('ownerDebts.errors.'+state.error)}</p><button type="button" onClick={reload}>{t('ownerDebts.retry')}</button></div>:<>
 <section className="od-totals" aria-label={t('ownerDebts.title')}>{[['amountCents','total',IoWalletOutline],['paidCents','paid',IoCashOutline],['remainingCents','remaining',IoReceiptOutline]].map(([key,label,Icon])=><article key={key} className={'od-total od-'+key}><span className="od-total-icon">{createElement(Icon)}</span><div><p>{t('ownerDebts.'+label)}</p><strong data-owner-debt-total={key} data-value={state.totals[key]}><bdi>{money(state.totals[key])}</bdi></strong></div></article>)}</section>
 <section className="od-list"><div className="od-list-heading"><h2>{t('ownerDebts.title')} <span>{state.debts.length}</span></h2><div className="od-filters"><label className="od-search"><IoSearchOutline/><span className="sr-only">{t('ownerDebts.search')}</span><input type="search" data-search-owner-debts value={query} placeholder={t('ownerDebts.search')} onChange={event=>setQuery(event.target.value)}/></label><select data-owner-debt-status aria-label={t('ownerDebts.status')} value={status} onChange={event=>setStatus(event.target.value)}>{['all','open','settled','overdue'].map(key=><option key={key} value={key}>{t('ownerDebts.'+key)}</option>)}</select></div></div>
 {rows.length?<><p className="od-scroll-hint">{t('ownerDebts.scroll')}</p><div className="od-table-scroll" tabIndex={0} role="region" aria-label={t('ownerDebts.title')}><table className="od-table"><thead><tr>{['name','date','dueDate','amount','debtPaid','debtRemaining','actions'].map(key=><th key={key} scope="col">{t('ownerDebts.'+key)}</th>)}</tr></thead><tbody>{rows.map(debt=><tr key={debt._id} data-owner-debt={debt._id}><th scope="row"><strong dir="auto">{debt.name}</strong><small dir="auto">{debt.creditor||t('ownerDebts.notRecorded')}</small>{debt.actor?.name&&<small>{t('ownerDebts.createdBy')}: {debt.actor.name}</small>}</th><td><time dateTime={debt.date}>{date(debt.date)}</time></td><td>{debt.dueDate?<><time dateTime={debt.dueDate}>{date(debt.dueDate)}</time>{debt.remainingCents>0&&debt.dueDate<today&&<small className="od-overdue">{t('ownerDebts.overdue')}</small>}</>:t('ownerDebts.noDueDate')}</td><td><bdi>{money(debt.amountCents)}</bdi></td><td className="od-paid"><bdi>{money(debt.paidCents)}</bdi></td><td><span className={debt.remainingCents?'od-balance':'od-settled'} data-owner-debt-balance={debt.remainingCents}><bdi>{money(debt.remainingCents)}</bdi></span></td><td data-row-actions-cell><RowActionsMenu menuKey="OwnerDebts">{permissions.payOwnerDebt&&debt.remainingCents>0&&<button type="button" data-pay-owner-debt={debt._id} onClick={()=>setEditor({mode:'payment',debt})}><IoCashOutline/>{t('ownerDebts.pay')}</button>}{permissions.ownerDebtHistory&&<button type="button" data-owner-debt-payments={debt._id} onClick={()=>setEditor({mode:'history',debt})}><IoTimeOutline/>{t('ownerDebts.history')}</button>}</RowActionsMenu></td></tr>)}</tbody></table></div></>:<div className="od-empty"><IoWalletOutline/><h3>{t('ownerDebts.'+(state.debts.length?'noResults':'empty'))}</h3><p>{t('ownerDebts.emptyHint')}</p>{state.debts.length>0&&<button type="button" onClick={()=>{setQuery('');setStatus('all');}}>{t('ownerDebts.clear')}</button>}</div>}
 </section></>}
 {editor?.mode==='add'&&<OwnerDebtForm token={token} onClose={()=>setEditor(null)} onSaved={data=>saved(data,'added')}/>}
 {editor?.mode==='payment'&&<OwnerDebtPaymentDialog token={token} debts={state.debts} debt={editor.debt} onClose={()=>setEditor(null)} onSaved={data=>saved(data,'paymentSaved')} onReload={reload}/>}
 {editor?.mode==='history'&&<OwnerDebtHistoryDialog token={token} debts={state.debts} debt={editor.debt} onClose={()=>setEditor(null)}/>}
 </main>;
}
