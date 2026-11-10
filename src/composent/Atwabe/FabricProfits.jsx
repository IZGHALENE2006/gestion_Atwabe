import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { IoArrowBackOutline, IoBarChartOutline, IoCashOutline, IoEyeOutline, IoLayersOutline, IoPrintOutline, IoRefreshOutline, IoSearchOutline, IoTrendingUpOutline, IoWalletOutline } from 'react-icons/io5';
import useEmployeeOperations from '../../hooks/useEmployeeOperations.js';
import { FABRIC_PROFIT_PERIODS, fabricProfitPeriodKey, fabricProfitReceiptMovement } from '../../../shared/fabricProfits.js';
import { loadFabricProfits } from './fabricsApi.js';
import FabricSaleDetailsDialog from './FabricSaleDetailsDialog.jsx';
import FabricSaleReceiptDialog from './FabricSaleReceiptDialog.jsx';
import './fabricProfits.css';

export default function FabricProfits() {
  const { t, i18n } = useTranslation(), p = key => t('fabrics.profits.' + key);
  const token = useSelector(state => state.LoginAdmin.token), permissions = useEmployeeOperations('fabrics');
  const [filters, setFilters] = useState({ mode: 'all', period: '', seller: '', source: 'all', offset: 0 });
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [attempt, setAttempt] = useState(0), [result, setResult] = useState(null);
  const [details, setDetails] = useState(null), [receipt, setReceipt] = useState(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const key = JSON.stringify({ ...filters, offset: String(filters.offset), search: query, timeZone });
  const state = result?.key === key && result.token === token && result.attempt === attempt ? result : { loading: true };
  const locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const money = value => value === null || value === undefined ? '—' : t('fabrics.salePriceValue', { value: Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  const number = value => value === null || value === undefined ? '—' : Number(value).toLocaleString(locale, { maximumFractionDigits: 3 });
  const change = values => setFilters(current => ({ ...current, ...values, offset: 0 }));
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search); setFilters(current => current.offset ? { ...current, offset: 0 } : current); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!token || !permissions.profits) return;
    const controller = new AbortController();
    loadFabricProfits(token, JSON.parse(key), controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ ...data, token, key, attempt, loading: false, error: '' });
    }).catch(failure => {
      if (!controller.signal.aborted) setResult({ token, key, attempt, loading: false, error: failure.response?.data?.message === 'invalidProfitQuery' ? 'invalidQuery' : 'loadFailed' });
    });
    return () => controller.abort();
  }, [token, key, attempt, permissions.profits]);
  const changeMode = mode => {
    const anchor = filters.period || fabricProfitPeriodKey();
    change({ mode, period: mode === 'all' ? '' : (anchor + '-01-01').slice(0, mode === 'year' ? 4 : mode === 'month' ? 7 : 10) });
  };
  const periodLabel = (value, unit) => {
    if (unit === 'all') return p('periods.all');
    if (unit === 'year') return value;
    const date = new Date(value + (unit === 'month' ? '-01' : '') + 'T12:00:00');
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale, { year: 'numeric', month: 'long', ...(unit === 'day' ? { day: 'numeric' } : {}) }) : '—';
  };
  const showReceipt = sale => setReceipt(fabricProfitReceiptMovement(sale));
  const summary = state.summary, largest = Math.max(1, ...(state.groups || []).map(group => Math.abs(group.profitAmount || 0)));
  const cards = summary ? [
    { key: 'profitAmount', label: 'profit', hint: 'profitHint', icon: <IoTrendingUpOutline />, color: summary.profitAmount < 0 ? 'loss' : 'green' },
    { key: 'revenueAmount', label: 'revenue', hint: 'revenueHint', icon: <IoCashOutline />, color: 'blue' },
    { key: 'costAmount', label: 'cost', hint: 'costHint', icon: <IoWalletOutline />, color: 'plain' },
    { key: 'totalMeters', label: 'meters', icon: <IoLayersOutline />, color: 'plain' },
  ] : [];
  if (!token) return <Navigate to="/LoginChoise" replace />;
  if (!permissions.profits) return <Navigate to="/Home/Atwabe" replace />;
  return <main className="fabric-profits-page" dir={i18n.dir()} data-fabric-profits>
    <div className="fabric-profits-container">
      <header className="fabric-profits-hero"><div><span><IoBarChartOutline size={20} />{p('eyebrow')}</span><h1>{p('title')}</h1><p>{p('subtitle')}</p></div><Link to="/Home/Atwabe" data-fabric-profits-back><IoArrowBackOutline size={19} />{p('back')}</Link></header>
      <section className="fabric-profits-toolbar" aria-label={p('filters')}>
        <div className="fabric-profit-periods" role="group" aria-label={p('periodType')}>{FABRIC_PROFIT_PERIODS.map(mode => <button type="button" key={mode} data-fabric-profit-period={mode} aria-pressed={mode === filters.mode} onClick={() => changeMode(mode)}>{p('periods.' + mode)}</button>)}</div>
        <div className="fabric-profit-filter-fields">
          {filters.mode !== 'all' && <label><span>{p('selectedPeriod')}</span><input data-fabric-profit-date type={filters.mode === 'day' ? 'date' : filters.mode === 'month' ? 'month' : 'number'} dir="ltr" value={filters.period} min={filters.mode === 'year' ? 1900 : '1900-01' + (filters.mode === 'day' ? '-01' : '')} max={filters.mode === 'year' ? 9999 : '9999-12' + (filters.mode === 'day' ? '-31' : '')} onChange={event => change({ period: event.target.value })} /></label>}
          <label><span>{p('seller')}</span><select data-fabric-profit-seller value={filters.seller} onChange={event => change({ seller: event.target.value })}><option value="">{p('allSellers')}</option>{(state.sellers || (result?.token === token ? result.sellers : []) || []).map(seller => <option key={seller.id} value={seller.id}>{seller.name || p('unknownSeller') + ' · ' + seller.id.slice(-6)}</option>)}</select></label>
          <label><span>{p('source')}</span><select data-fabric-profit-source value={filters.source} onChange={event => change({ source: event.target.value })}>{['all', 'direct', 'tailoring'].map(source => <option key={source} value={source}>{p('sources.' + source)}</option>)}</select></label>
          <label className="fabric-profit-search"><span><IoSearchOutline size={16} />{p('search')}</span><input data-fabric-profit-search type="search" maxLength={120} value={search} placeholder={p('searchPlaceholder')} onChange={event => setSearch(event.target.value)} /></label>
          <div className="fabric-profit-filter-actions"><button type="button" data-fabric-profit-today onClick={() => change({ mode: 'day', period: fabricProfitPeriodKey() })}>{p('today')}</button><button type="button" onClick={() => { change({ mode: 'all', period: '', seller: '', source: 'all' }); setSearch(''); }}>{p('reset')}</button><button type="button" onClick={() => setAttempt(value => value + 1)} aria-label={p('refresh')}><IoRefreshOutline size={20} /></button></div>
        </div>
      </section>
      {state.loading ? <p role="status" className="fabric-profit-empty">{t('common.loading')}</p> : state.error ? <div role="alert" className="fabric-profit-error"><p>{p(state.error)}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{t('fabrics.retry')}</button></div> : <>
        <div className="fabric-profit-period-heading"><h2>{periodLabel(filters.period, filters.mode)}</h2><span>{t('fabrics.profits.saleCount', { count: summary.saleCount })}</span></div>
        <div className="fabric-profit-cards">{cards.map(card => <article key={card.key} className={'fabric-profit-card is-' + card.color}><div><p>{p(card.label)}</p><span>{card.icon}</span></div><strong data-fabric-profit-summary={card.key} data-value={summary[card.key] ?? ''}><bdi>{card.key === 'totalMeters' ? t('fabrics.meterValue', { value: number(summary.totalMeters) }) : money(summary[card.key])}</bdi></strong><p>{card.hint ? p(card.hint) : t('fabrics.profits.saleCount', { count: summary.saleCount })}</p></article>)}</div>
        <p className="fabric-profit-discounts">{t('fabrics.profits.discountTotal', { value: money(summary.discountAmount) })}</p>
        {summary.cancelledCount > 0 && <p role="status" className="fabric-profit-notice">{t("fabrics.profits.cancelledCount", { count: summary.cancelledCount })}</p>}
        {summary.unknownCount > 0 && <p role="status" className="fabric-profit-notice" data-fabric-profit-unknown>{t('fabrics.profits.unknownCosts', { count: summary.unknownCount })}</p>}
        {summary.saleCount > 0 && !summary.unknownCount && [summary.revenueAmount, summary.costAmount, summary.profitAmount, summary.totalMeters].some(value => value === null) && <p role="status" className="fabric-profit-notice">{p('totalsUnavailable')}</p>}
        {filters.mode !== 'day' && state.groups.length > 0 && <section className="fabric-profit-panel"><header><div><h2>{p('history')}</h2><p>{p('historyHint')}</p></div><IoBarChartOutline size={23} /></header><div className="fabric-profit-groups">{state.groups.map(group => <button type="button" key={group.key} data-fabric-profit-group={group.key} onClick={() => change({ mode: group.unit, period: group.key })}><span><strong>{periodLabel(group.key, group.unit)}</strong><small>{t('fabrics.profits.saleCount', { count: group.saleCount })}</small></span><span className={'fabric-profit-track ' + (group.profitAmount < 0 ? 'is-loss' : '')} aria-hidden="true"><span style={{ width: (Math.abs(group.profitAmount || 0) / largest * 100) + '%' }} /></span><bdi className={group.profitAmount < 0 ? 'is-loss' : undefined}>{money(group.profitAmount)}</bdi></button>)}</div></section>}
        <section className="fabric-profit-panel"><header><div><h2>{p('sales')}</h2><p>{p('salesHint')}</p></div><span className="fabric-profit-count">{number(state.totalCount)}</span></header>{state.sales.length ? <><p className="fabric-profit-scroll-hint" id="fabric-profit-scroll-hint">{p('scrollHint')}</p><div className="fabric-profit-table-scroll" tabIndex={0} role="region" aria-label={p('sales')} aria-describedby="fabric-profit-scroll-hint"><table className="fabric-profit-table"><caption className="sr-only">{p('sales')}</caption><thead><tr>{['date', 'fabric', 'meters', 'unitPrice', 'net', 'cost', 'profit', 'seller', 'actions'].map(column => <th key={column} scope="col">{p(column)}</th>)}</tr></thead><tbody>{state.sales.map(sale => <tr key={sale.id} data-fabric-profit-row={sale.id} data-sale-source={sale.source} data-sale-cancelled={sale.cancelledAt ? "true" : undefined}><td><time dateTime={sale.occurredAt}>{new Date(sale.occurredAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</time><bdi dir="ltr" className="fabric-profit-code">{sale.reference}</bdi></td><th scope="row"><strong dir="auto">{sale.type}</strong><small data-fabric-profit-source-label className={"fabric-profit-source" + (sale.cancelledAt ? " is-cancelled" : "")}>{p("sources." + sale.source)}{sale.cancelledAt ? " · " + p("cancelled") : ""}</small>{sale.source === "tailoring" && <bdi className="fabric-profit-code" dir="ltr">{sale.sourceOrderBarcode}</bdi>}<span dir="auto">{sale.color}{sale.colorNumber ? ' · ' + sale.colorNumber : ''}</span><bdi dir="ltr" className="fabric-profit-code">{sale.barcode}</bdi></th><td><bdi>{number(sale.meters)}</bdi></td><td><bdi>{money(sale.unitPrice)}</bdi><small>{t('fabrics.sales.' + sale.pricingMode)}</small></td><td><bdi>{money(sale.revenueAmount)}</bdi></td><td><bdi>{sale.costAmount === null ? p('unknownCost') : money(sale.costAmount)}</bdi></td><td data-fabric-sale-profit={sale.id} data-value={sale.profitAmount ?? ''} className={sale.profitAmount < 0 ? 'is-loss' : 'is-profit'}><bdi>{sale.profitAmount === null ? p('unknownProfit') : money(sale.profitAmount)}</bdi></td><td data-fabric-profit-seller-name dir="auto"><strong>{sale.sellerName || p('unknownSeller')}</strong>{sale.sellerRole && <small>{p('roles.' + sale.sellerRole)}</small>}</td><td><div className="fabric-profit-row-actions"><button type="button" data-fabric-profit-details={sale.id} onClick={() => setDetails(sale)}><IoEyeOutline size={18} />{p('details')}</button><button type="button" data-fabric-profit-receipt={sale.id} onClick={() => showReceipt(sale)}><IoPrintOutline size={18} />{p('receipt')}</button></div></td></tr>)}</tbody></table></div><footer className="fabric-profit-pagination"><p>{t('fabrics.profits.pageRange', { from: filters.offset + 1, to: filters.offset + state.sales.length, total: state.totalCount })}</p><div><button type="button" disabled={filters.offset === 0} onClick={() => setFilters(current => ({ ...current, offset: Math.max(0, current.offset - 50) }))}>{p('previous')}</button><button type="button" disabled={!state.hasMore} onClick={() => setFilters(current => ({ ...current, offset: state.nextOffset }))}>{p('next')}</button></div></footer></> : <div className="fabric-profit-empty"><IoSearchOutline size={34} /><h3>{p('empty')}</h3><p>{p('emptyHint')}</p></div>}</section>
      </>}
    </div>
    {details && <FabricSaleDetailsDialog sale={details} onClose={() => setDetails(null)} onReceipt={showReceipt} />}
    {receipt && <FabricSaleReceiptDialog movement={receipt} onClose={() => setReceipt(null)} />}
  </main>;
}
