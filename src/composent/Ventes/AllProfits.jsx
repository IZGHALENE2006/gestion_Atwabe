import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IoArrowForwardOutline, IoBarChartOutline, IoCalendarOutline, IoLayersOutline, IoRefreshOutline, IoTrendingUpOutline, IoWalletOutline } from 'react-icons/io5';
import { fabricProfitPeriodKey, FABRIC_PROFIT_PERIODS } from '../../../shared/fabricProfits.js';
import './allProfits.css';

export default function AllProfits() {
  const { t, i18n } = useTranslation(), p = key => t('allProfits.' + key);
  const { token, role } = useSelector(state => state.LoginAdmin);
  const [filters, setFilters] = useState({ mode: 'all', period: '' }), [attempt, setAttempt] = useState(0), [result, setResult] = useState(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, key = JSON.stringify({ ...filters, timeZone });
  const state = result?.key === key && result.token === token && result.attempt === attempt ? result : { loading: true };
  useEffect(() => {
    if (!token || role !== 'admin') return;
    const controller = new AbortController();
    axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:7000'}/Employe/all-profits`, { headers: { Authorization: `Bearer ${token}` }, params: JSON.parse(key), signal: controller.signal }).then(({ data }) => {
      if (!data.summary || !Array.isArray(data.sections) || !Array.isArray(data.groups)) throw new Error('Invalid profit report');
      if (!controller.signal.aborted) setResult({ ...data, token, key, attempt, loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ token, key, attempt, loading: false, error: error.response?.data?.message === 'invalidProfitQuery' ? 'invalid' : 'failed' });
    });
    return () => controller.abort();
  }, [token, role, key, attempt]);
  const locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const money = value => value == null ? '—' : value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + t('fesla.currency');
  const periodLabel = (period, mode) => {
    if (mode === 'all') return p('periods.all');
    if (mode === 'year') return period;
    const date = new Date(period + (mode === 'month' ? '-01' : '') + 'T12:00:00');
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale, { year: 'numeric', month: 'long', ...(mode === 'day' ? { day: 'numeric' } : {}) }) : '—';
  };
  const changeMode = mode => setFilters(current => ({ mode, period: mode === 'all' ? '' : ((current.period || fabricProfitPeriodKey()) + '-01-01').slice(0, mode === 'year' ? 4 : mode === 'month' ? 7 : 10) }));
  if (!token) return <Navigate to="/LoginChoise" replace />;
  if (role !== 'admin') return <Navigate to="/Home/profit/Ventes" replace />;
  const summary = state.summary;
  const cards = summary ? [
    { source: 'tailoring', key: 'tailoringProfit', hint: 'tailoringHint', count: 'orders', quantity: summary.tailoringOrderCount, icon: <IoLayersOutline />, link: '/Home/Fesla?garment=djellaba&view=profits&scope=all' },
    { source: 'fabrics', key: 'fabricProfit', hint: 'fabricHint', count: 'transactions', quantity: summary.fabricSaleCount, icon: <IoTrendingUpOutline />, link: '/Home/Atwabe/profits' },
    { source: 'sales', key: 'salesProfit', hint: 'salesHint', count: 'transactions', quantity: summary.productSaleCount, icon: <IoWalletOutline />, link: '/Home/profit/Hestorique' },
  ] : [];
  return <main className="all-profits" dir={i18n.dir()} data-all-profits>
    <header className="all-profits-header"><div><span><IoBarChartOutline aria-hidden="true" />{t('salesNav.history')}</span><h1>{p('title')}</h1><p>{p('subtitle')}</p></div><button type="button" data-all-profits-refresh onClick={() => setAttempt(value => value + 1)} aria-label={p('refresh')}><IoRefreshOutline size={21} /><span>{p('refresh')}</span></button></header>
    <section className="all-profits-filters" aria-label={p('filters')}>
      <div role="group" aria-label={p('filters')}>{FABRIC_PROFIT_PERIODS.map(mode => <button type="button" data-all-profit-period={mode} aria-pressed={mode === filters.mode} key={mode} onClick={() => changeMode(mode)}>{p('periods.' + mode)}</button>)}</div>
      {filters.mode !== 'all' && <label><span><IoCalendarOutline aria-hidden="true" />{p('selectedPeriod')}</span><input data-all-profit-date type={filters.mode === 'day' ? 'date' : filters.mode === 'month' ? 'month' : 'number'} dir="ltr" value={filters.period} min={filters.mode === 'year' ? 1900 : '1900-01' + (filters.mode === 'day' ? '-01' : '')} max={filters.mode === 'year' ? 9999 : '9999-12' + (filters.mode === 'day' ? '-31' : '')} onChange={event => setFilters(current => ({ ...current, period: event.target.value }))} /></label>}
      <button type="button" className="all-profits-today" onClick={() => setFilters({ mode: 'day', period: fabricProfitPeriodKey() })}>{p('today')}</button>
    </section>
    {state.loading ? <p className="all-profits-message" role="status">{t('common.loading')}</p> : state.error ? <div className="all-profits-message is-error" role="alert"><p>{p(state.error)}</p><button type="button" data-all-profits-retry onClick={() => setAttempt(value => value + 1)}>{p('retry')}</button></div> : <>
      <section className={'all-profits-total' + (summary.totalProfit < 0 ? ' is-loss' : '')} aria-labelledby="all-profits-total-title"><div><span>{periodLabel(filters.period, filters.mode)}</span><h2 id="all-profits-total-title">{p('total')}</h2><strong data-all-profit-summary="totalProfit" data-value={summary.totalProfit ?? ''}><bdi>{money(summary.totalProfit)}</bdi></strong><p>{p('formula')}</p></div><IoBarChartOutline size={76} aria-hidden="true" /></section>
      {summary.totalProfit === null && <p role="status" className="all-profits-notice" data-all-profits-incomplete>{p('incomplete')}</p>}
      <div className="all-profits-cards">{cards.map(card => <article className={'all-profits-card is-' + card.source} key={card.key} data-all-profit-source={card.source}><div className="all-profits-card-heading"><h2>{p(card.source)}</h2><span>{card.icon}</span></div><strong className={summary[card.key] < 0 ? 'is-loss' : undefined} data-all-profit-summary={card.key} data-value={summary[card.key] ?? ''}><bdi>{money(summary[card.key])}</bdi></strong><p>{p(card.hint)}</p>{card.source === 'sales' && <dl>{[['gross', 'salesGrossProfit'], ['shares', 'employeeShares']].map(([label, key]) => <div key={key}><dt>{p(label)}</dt><dd data-all-profit-summary={key} data-value={summary[key] ?? ''}><bdi>{money(summary[key])}</bdi></dd></div>)}</dl>}<footer><span>{t('allProfits.' + card.count, { count: card.quantity })}</span><Link to={card.link}>{p('view')}<IoArrowForwardOutline aria-hidden="true" /></Link></footer></article>)}</div>
      <section className="all-profits-panel"><h2>{p('breakdown')}</h2><div className="all-profits-sections">{state.sections.map(section => <Link key={section.garmentType} to={'/Home/Fesla?garment=' + section.garmentType + '&view=profits'} data-all-profit-garment={section.garmentType}><span>{t('fesla.garmentTypes.' + section.garmentType)}</span><strong className={section.profitAmount < 0 ? 'is-loss' : undefined} data-value={section.profitAmount ?? ''}><bdi>{money(section.profitAmount)}</bdi></strong><small>{t('allProfits.orders', { count: section.orderCount })}</small></Link>)}</div></section>
      <section className="all-profits-panel"><header><h2>{p('history')}</h2><p>{p('historyHint')}</p></header>{state.groups.length ? <div className="all-profits-table-scroll" tabIndex={0} role="region" aria-label={p('history')}><table><caption className="sr-only">{p('history')}</caption><thead><tr>{['date', 'tailoring', 'fabrics', 'sales', 'total'].map(label => <th scope="col" key={label}>{p(label)}</th>)}</tr></thead><tbody>{state.groups.map(group => <tr key={group.key} data-all-profit-group={group.key}><th scope="row"><button type="button" onClick={() => setFilters({ mode: group.unit, period: group.key })}>{periodLabel(group.key, group.unit)}</button></th>{['tailoringProfit', 'fabricProfit', 'salesProfit', 'totalProfit'].map(key => <td key={key} data-value={group[key] ?? ''} className={group[key] < 0 ? 'is-loss' : undefined}><bdi>{money(group[key])}</bdi></td>)}</tr>)}</tbody></table></div> : <p className="all-profits-message">{p('empty')}</p>}</section>
    </>}
  </main>;
}
