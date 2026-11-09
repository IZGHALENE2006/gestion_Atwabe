import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, X, ArrowUpLeft, LoaderCircle, ArrowRight, SearchX } from 'lucide-react';
import axios from 'axios';
import { SEARCH_PAGES, SEARCH_GROUPS, SEARCH_MIN_LENGTH, SEARCH_MAX_LENGTH, searchPages, allowedSearchGroups } from '../../../shared/globalSearch.js';
import { canOpenEmployeePage } from '../../../shared/employeePermissions.js';
import './globalSearch.css';

export default function GlobalSearch() {
  const { token, role, user, sessionReady } = useSelector(state => state.LoginAdmin);
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const location = useLocation();
  const { t } = useTranslation();
  const enabled = Boolean(token && sessionReady && ['admin', 'Employe'].includes(role));
  useEffect(() => {
    if (!enabled) return;
    const shortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(value => !value); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [enabled]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  if (!enabled) return null;
  return <>
    <button ref={trigger} type="button" className="app-global-search-trigger" data-global-search-trigger onClick={() => setOpen(true)} aria-haspopup="dialog"><Search size={19} aria-hidden="true"/><span>{t('globalSearch.placeholder')}</span><kbd dir="ltr">Ctrl K</kbd></button>
    {open && createPortal(<SearchDialog key={location.key + ':' + JSON.stringify([token, role, user?.moduleAccess, user?.operationPermissions, user?.action])} token={token} role={role} user={user} onClose={close}/>, document.body)}
  </>;
}

function SearchDialog({ token, role, user, onClose }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState(''), [group, setGroup] = useState(''), [attempt, setAttempt] = useState(0), [result, setResult] = useState(null);
  const input = useRef(null), panel = useRef(null);
  const trimmed = query.trim(), ready = trimmed.length >= SEARCH_MIN_LENGTH;
  const permissions = JSON.stringify([role, user?.moduleAccess, user?.operationPermissions, user?.action]);
  const current = result?.query === trimmed && result.group === group && result.attempt === attempt && result.permissions === permissions ? result : null;
  const pages = searchPages(trimmed, role, user, t);
  const dataGroups = current?.groups || [];
  const groups = [{ key: 'pages', items: ready ? pages : [] }, ...dataGroups].filter(entry => (!group || entry.key === group) && entry.items.length);
  const count = groups.reduce((sum, entry) => sum + entry.items.length, 0);
  const loading = ready && group !== 'pages' && !current;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; input.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    if (!ready || group === 'pages') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      axios.get((import.meta.env.VITE_API_URL || 'http://localhost:7000') + '/search', { params: { q: trimmed, ...(group ? { group } : {}) }, signal: controller.signal, headers: { Authorization: 'Bearer ' + token }, timeout: 12000 })
        .then(({ data }) => {
          if (!Array.isArray(data.groups) || !Array.isArray(data.availableGroups)) throw new Error('Invalid search response');
          if (!controller.signal.aborted) setResult({ ...data, query: trimmed, group, attempt, permissions });
        })
        .catch(() => { if (!controller.signal.aborted) setResult({ query: trimmed, group, attempt, permissions, groups: [], error: true }); });
    }, 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed, ready, group, token, attempt, permissions]);
  const available = SEARCH_GROUPS.filter(key => key === 'pages' || allowedSearchGroups(role, user).includes(key));
  const retry = () => setAttempt(value => value + 1);
  const keyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const controls = [...panel.current.querySelectorAll('button:not([disabled]), input, a[href]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === 'ArrowDown' && event.target === input.current) { event.preventDefault(); panel.current.querySelector('[data-global-search-result]')?.focus(); }
  };
  const number = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { maximumFractionDigits: 3 }).format(value);
  const valueText = entry => entry.format === 'key' ? t(entry.value) : entry.format === 'money' ? number(entry.value) + ' DH' : typeof entry.value === 'number' ? number(entry.value) : entry.value;
  const partial = dataGroups.some(entry => entry.error);
  const sectionPath = key => SEARCH_PAGES.find(([id]) => id === (key === 'work' ? 'workers' : key))?.[1] || '/Home/pagination';
  return <div className="global-search-overlay" dir={i18n.dir()} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title" onKeyDown={keyDown} ref={panel} data-global-search-dialog>
      <header className="global-search-heading"><div><span className="global-search-eyebrow">STOCK PRO</span><h2 id="global-search-title">{t('globalSearch.title')}</h2></div><button type="button" className="global-search-icon-button" onClick={onClose} aria-label={t('globalSearch.close')}><X size={21}/></button></header>
      <form className="global-search-input" role="search" onSubmit={event => { event.preventDefault(); panel.current.querySelector('[data-global-search-result]')?.focus(); }}>
        <Search aria-hidden="true" size={23}/><input ref={input} type="search" value={query} maxLength={SEARCH_MAX_LENGTH} onChange={event => setQuery(event.target.value)} autoComplete="off" spellCheck={false} aria-label={t('globalSearch.inputLabel')} placeholder={t('globalSearch.placeholder')} data-global-search-input/>
        {query && <button type="button" className="global-search-icon-button" onClick={() => { setQuery(''); input.current?.focus(); }} aria-label={t('globalSearch.clear')}><X size={18}/></button>}
      </form>
      <nav className="global-search-tabs" aria-label={t('globalSearch.title')}><button type="button" aria-pressed={!group} onClick={() => setGroup('')}>{t('globalSearch.all')}</button>{available.map(key => <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)} data-search-group={key}>{t('globalSearch.groups.' + key)}</button>)}</nav>
      <div className="global-search-results" aria-busy={loading}>
        {!ready && <div className="global-search-empty"><span className="global-search-empty-icon"><Search size={30}/></span><p>{t('globalSearch.hint')}</p></div>}
        {loading && <p className="global-search-status" role="status"><LoaderCircle size={18} className="global-search-spinner"/>{t('globalSearch.loading')}</p>}
        {(current?.error || partial) && <div className="global-search-error" role="alert"><p>{t(current?.error ? 'globalSearch.failed' : 'globalSearch.partial')}</p><button type="button" onClick={retry}>{t('globalSearch.retry')}</button></div>}
        {ready && !loading && !current?.error && !partial && !count && <div className="global-search-empty"><span className="global-search-empty-icon"><SearchX size={30}/></span><h3>{t('globalSearch.empty')}</h3><p>{t('globalSearch.emptyHint')}</p></div>}
        {groups.map(section => <section className="global-search-group" key={section.key} data-global-search-section={section.key}><div className="global-search-group-heading"><h3>{t('globalSearch.groups.' + section.key)} <span>{section.items.length}{section.hasMore ? '+' : ''}</span></h3>{section.hasMore && group && <Link to={sectionPath(section.key)} onClick={onClose}>{t('globalSearch.openSection')}<ArrowRight size={15} className="rtl:rotate-180"/></Link>}{section.hasMore && !group && <button type="button" onClick={() => setGroup(section.key)}>{t('globalSearch.more')}<ArrowRight size={15} className="rtl:rotate-180"/></button>}</div>
          <div className="global-search-list">{section.items.filter(row => canOpenEmployeePage(role, user, row.path)).map(row => <Link key={row.id} to={row.path} onClick={onClose} className="global-search-result" data-global-search-result data-result-id={row.id}>
            <span className="global-search-result-icon" aria-hidden="true">{section.key === 'pages' ? <ArrowUpLeft size={19}/> : <Search size={18}/>}</span>
            <div className="global-search-result-content"><h4 dir="auto">{row.titleKey ? t(row.titleKey, { value: row.titleValue }) : row.title}</h4>{row.barcode && <code dir="ltr">{row.barcode}</code>}<dl>{row.facts.map((entry, index) => <div key={index}><dt>{t('globalSearch.fields.' + entry.label)}</dt><dd dir="auto">{valueText(entry)}</dd></div>)}</dl></div>
            <span className="global-search-open">{t('globalSearch.open')}<ArrowRight size={16} className="rtl:rotate-180"/></span>
          </Link>)}</div></section>)}
      </div>
      <footer className="global-search-footer"><span role="status" aria-live="polite">{ready && !loading ? t('globalSearch.count', { count }) : t('globalSearch.hint')}</span><kbd>Esc</kbd></footer>
    </section>
  </div>;
}
