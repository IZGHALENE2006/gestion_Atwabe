import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { IoAddOutline, IoArrowForwardOutline, IoDocumentTextOutline, IoRefreshOutline } from 'react-icons/io5';
import { loadFabricInvoices, resumeFabricInvoice, fabricInvoiceError } from './fabricInvoicesApi.js';
import FabricInvoiceForm from './FabricInvoiceForm.jsx';
import FabricInvoiceDetails from './FabricInvoiceDetails.jsx';
import './fabricInvoices.css';

export default function FabricInvoices({ fabrics, permissions, token, onReload, loading }) {
  const { t, i18n } = useTranslation(), role = useSelector(state => state.LoginAdmin.role), user = useSelector(state => state.LoginAdmin.user);
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0), [editor, setEditor] = useState(false), [selected, setSelected] = useState(null), [search, setSearch] = useState(''), [busy, setBusy] = useState(null), [error, setError] = useState('');
  const state = result?.token === token && result.attempt === attempt ? result : { loading: true, invoices: [] };
  useEffect(() => {
    const controller = new AbortController();
    loadFabricInvoices(token, controller.signal).then(value => { if (!controller.signal.aborted) setResult({ token, attempt, invoices: value.invoices, loading: false }); }).catch(() => { if (!controller.signal.aborted) setResult({ token, attempt, invoices: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [token, attempt]);
  const reload = () => { setAttempt(value => value + 1); onReload(); };
  const changed = invoice => setResult(current => ({ ...current, invoices: [invoice, ...current.invoices.filter(row => row._id !== invoice._id)].sort((a, b) => b.date.localeCompare(a.date)) }));
  const saved = invoice => { changed(invoice); setEditor(false); setSelected(invoice._id); onReload(); };
  const resume = async invoice => { if (busy) return; setBusy(invoice._id); setError(''); try { const result = await resumeFabricInvoice(invoice._id, token); changed(result.invoice); onReload(); } catch (failure) { setError(fabricInvoiceError(failure, t)); setAttempt(value => value + 1); onReload(); } finally { setBusy(null); } };
  const money = value => Number(value).toLocaleString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const completed = state.invoices.filter(row => row.status === 'complete'), query = search.trim().toLocaleLowerCase(), visible = state.invoices.filter(row => [row.reference, row.customer.name, row.customer.phone, ...row.lines.flatMap(line => [line.type, line.color, line.barcode])].some(value => String(value || '').toLocaleLowerCase().includes(query)));
  const invoice = state.invoices.find(row => row._id === selected);
  return <main className="fi-page" dir={i18n.dir()}><div className="fi-container"><header className="fi-page-header"><div><Link to="/Home/Atwabe" className="fi-back"><IoArrowForwardOutline />{t('fabricInvoices.back')}</Link><h1><IoDocumentTextOutline />{t('fabricInvoices.pageTitle')}</h1><p>{t('fabricInvoices.subtitle')}</p></div><div className="fi-document-actions"><button type="button" className="fi-secondary" onClick={reload}><IoRefreshOutline />{t('fabricInvoices.refresh')}</button>{permissions.addInvoice && permissions.sell && <button type="button" data-add-fabric-invoice disabled={loading} className="fi-primary" onClick={() => setEditor(true)}><IoAddOutline />{t('fabricInvoices.add')}</button>}</div></header>
    <div className="fi-totals">{[['total', completed.reduce((sum, row) => sum + Math.round(row.total * 100), 0) / 100], ['paid', completed.reduce((sum, row) => sum + Math.round(row.paidAmount * 100), 0) / 100], ['remaining', completed.reduce((sum, row) => sum + Math.round(row.remaining * 100), 0) / 100]].map(([key, value]) => <div key={key}><span>{t('fabricInvoices.' + key)}</span><strong data-invoice-summary={key}>{money(value)} {t('fesla.currency')}</strong></div>)}</div>
    <input className="fi-search" type="search" aria-label={t('fabricInvoices.search')} placeholder={t('fabricInvoices.search')} value={search} onChange={event => setSearch(event.target.value)} />
    {(error || state.error) && <p role="alert" className="fi-error">{error || t('fabricInvoices.loadFailed')} <button type="button" onClick={reload}>{t('fabrics.retry')}</button></p>}
    {state.loading ? <p role="status">{t('common.loading')}</p> : <div className="fi-table-scroll fi-main-table"><table><thead><tr>{['reference', 'date', 'customer', 'total', 'paid', 'remaining', 'seller', 'status', 'actions'].map(key => <th key={key}>{t('fabricInvoices.' + key)}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row._id} data-fabric-invoice={row._id}><td><bdi>{row.reference}</bdi></td><td>{new Date(row.date).toLocaleDateString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA')}</td><td>{row.customer.name || t('fabricInvoices.emptyCustomer')}</td><td><bdi>{money(row.total)}</bdi></td><td><bdi>{money(row.paidAmount)}</bdi></td><td className={row.remaining > 0 ? 'fi-debt' : 'fi-settled'}><bdi>{money(row.remaining)}</bdi></td><td>{row.actor.name}</td><td><span className={'fi-status ' + (row.status === 'complete' && !row.remaining ? 'fi-settled' : '')}>{t(row.status === 'complete' ? 'fabricInvoices.' + (row.remaining ? 'debtStatus' : 'paidStatus') : 'fabricInvoices.statuses.' + row.status)}</span></td><td>{row.status === 'complete' ? <button type="button" className="fi-secondary" data-invoice-details onClick={() => setSelected(row._id)}>{t('fabricInvoices.details')}</button> : row.status !== 'cancelled' && permissions.addInvoice && (role === 'admin' || String(row.actor.id) === String(user?._id)) && <button type="button" className="fi-primary" disabled={Boolean(busy)} data-resume-fabric-invoice onClick={() => resume(row)}>{t(busy === row._id ? 'common.loading' : 'fabricInvoices.resume')}</button>}</td></tr>)}</tbody></table>{!visible.length && <p className="fi-empty">{t('fabricInvoices.empty')}</p>}</div>}
    {editor && <FabricInvoiceForm token={token} fabrics={fabrics} permissions={permissions} onReload={onReload} onClose={() => { setEditor(false); reload(); }} onSaved={saved} />}
    {invoice?.status === 'complete' && <FabricInvoiceDetails key={invoice._id} invoice={invoice} token={token} permissions={permissions} onChanged={changed} onClose={() => setSelected(null)} />}
  </div></main>;
}
