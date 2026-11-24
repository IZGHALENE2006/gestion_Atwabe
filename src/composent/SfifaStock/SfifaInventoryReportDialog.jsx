import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline, IoDocumentTextOutline, IoDownloadOutline, IoRefreshOutline } from 'react-icons/io5';
import { SFIFA_METER_TYPES, SFIFA_STOCK_FAMILIES, formatSfifaCode } from '../../../shared/sfifaStock.js';
import { loadSfifaInventoryReport } from './sfifaStockApi.js';
import './sfifaInventoryReport.css';

export default function SfifaInventoryReportDialog({ token, onClose }) {
  const { t, i18n } = useTranslation(), p = key => t('sfifaInventoryReport.' + key);
  const dialogRef = useRef(null), busyRef = useRef(false);
  const [includeUnavailable, setIncludeUnavailable] = useState(false), [result, setResult] = useState(null), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false), [exportError, setExportError] = useState(false);
  const scope = JSON.stringify([token, includeUnavailable, attempt]), state = result?.scope === scope ? result : { loading: true };
  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); return () => dialog.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadSfifaInventoryReport(token, includeUnavailable, controller.signal).then(data => {
      if (!Array.isArray(data.report?.rows) || !data.report?.totals || !data.issuedAt) throw Error('invalidInventoryReport');
      if (!controller.signal.aborted) setResult({ scope, ...data, loading: false });
    }).catch(error => { if (!controller.signal.aborted) setResult({ scope, loading: false, error: error.response?.status === 403 ? 'forbidden' : 'loadFailed' }); });
    return () => controller.abort();
  }, [token, includeUnavailable, scope]);
  const close = () => { if (!busyRef.current) onClose(); };
  const number = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { maximumFractionDigits: 3 }).format(value);
  async function download() {
    if (busyRef.current || state.loading || state.error || !state.report?.rows.length) return;
    busyRef.current = true; setBusy(true); setExportError(false);
    try { const { downloadSfifaInventoryPDF } = await import('./sfifaInventoryPDF.js'); await downloadSfifaInventoryPDF({ report: state.report, issuedAt: state.issuedAt, language: i18n.language }); }
    catch { if (dialogRef.current?.open) setExportError(true); }
    finally { busyRef.current = false; if (dialogRef.current?.open) setBusy(false); }
  }
  const report = state.report;
  return <dialog ref={dialogRef} className="work-dialog sfifa-report-dialog" dir={i18n.dir()} aria-labelledby="sfifa-report-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="work-dialog-header"><span className="work-dialog-icon"><IoDocumentTextOutline aria-hidden="true" /></span><div><h2 id="sfifa-report-title">{p('title')}</h2><p>{p('hint')}</p></div><button type="button" className="work-close" data-close-sfifa-report onClick={close} disabled={busy} aria-label={t('dialog.close')}><IoCloseOutline /></button></header>
    <div className="work-dialog-body sfifa-report-body">
      <label className="sfifa-report-option"><input type="checkbox" data-sfifa-report-include-empty autoFocus checked={includeUnavailable} disabled={busy} onChange={event => { setIncludeUnavailable(event.target.checked); setExportError(false); }} /><span><strong>{p('includeUnavailable')}</strong><small>{p('includeHint')}</small></span></label>
      {state.loading ? <p role="status">{t('common.loading')}</p> : state.error ? <div className="work-feedback work-feedback-error" role="alert"><p>{state.error === 'forbidden' ? t('sfifaStock.errors.forbidden') : p('loadFailed')}</p><button type="button" data-retry-sfifa-report className="work-text-button" onClick={() => setAttempt(value => value + 1)}>{t('sfifaStock.retry')}</button></div> : <>
        <dl className="sfifa-report-summary">{['quantity', 'thin', 'thick'].map(key => <div key={key}><dt>{t(key === 'quantity' ? 'sfifaStock.total' : 'sfifaStock.' + key + 'Total')}</dt><dd data-sfifa-report-total={key} data-value={report.totals[key]}><bdi>{number(report.totals[key])}</bdi> <small>{t('sfifaStock.unit')}</small></dd></div>)}</dl>
        <div className="sfifa-report-meta"><strong>{p('rows')}: <bdi data-sfifa-report-count>{number(report.count)}</bdi></strong><span>{p('unit')}</span></div>
        {report.rows.length ? <div className="sfifa-table-scroll sfifa-report-table-scroll" role="region" tabIndex={0} aria-label={p('title')}><table className="sfifa-stock-table sfifa-report-table"><caption className="sr-only">{p('title')}</caption><thead><tr><th scope="col">{t('sfifaStock.width')}</th><th scope="col">{t('sfifaStock.family')}</th><th scope="col">{p('colorCode')}</th>{SFIFA_METER_TYPES.map(key => <th key={key} scope="col">{t('sfifaStock.meterTypes.' + key)}</th>)}{report.hasUnclassified && <th scope="col">{p('unclassified')}</th>}<th scope="col">{p('total')}</th></tr></thead><tbody>{report.rows.map(row => <tr key={row.id} data-sfifa-report-row={row.id} data-unavailable={row.quantity === 0}><th scope="row">{t('sfifaStock.widths.' + row.width)}</th><td><bdi dir="ltr">{SFIFA_STOCK_FAMILIES.find(family => family.value === row.family)?.label}</bdi></td><td>{row.isUnassigned ? t('sfifaStock.unassigned') : <bdi dir="ltr">{formatSfifaCode(row.code, row.family)}</bdi>}</td>{SFIFA_METER_TYPES.map(key => <td key={key} data-sfifa-report-style={key}><bdi>{number(row.styleMeters[key])}</bdi></td>)}{report.hasUnclassified && <td><bdi>{number(row.unclassifiedMeters)}</bdi></td>}<td className="sfifa-report-row-total"><bdi>{number(row.quantity)}</bdi></td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={3}>{p('total')}</th>{SFIFA_METER_TYPES.map(key => <td key={key}><bdi>{number(report.totals[key])}</bdi></td>)}{report.hasUnclassified && <td><bdi>{number(report.totals.unclassifiedMeters)}</bdi></td>}<td><bdi>{number(report.totals.quantity)}</bdi></td></tr></tfoot></table></div> : <p className="work-feedback" data-sfifa-report-empty>{p('empty')}</p>}
        {report.hasUnclassified && <p className="work-field-hint">{p('unclassifiedHint')}</p>}
        <p className="work-field-hint">{p('issuedAt')}: <bdi>{new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Casablanca' }).format(new Date(state.issuedAt))}</bdi></p>
      </>}
      {exportError && <p role="alert" className="work-feedback work-feedback-error" data-sfifa-report-export-error>{p('exportFailed')}</p>}
    </div>
    <footer className="work-dialog-footer"><button type="button" className="work-button work-button-quiet" data-refresh-sfifa-report disabled={state.loading || busy} onClick={() => { setAttempt(value => value + 1); setExportError(false); }}><IoRefreshOutline />{p('refresh')}</button><button type="button" className="work-button work-button-blue" data-download-sfifa-report disabled={state.loading || Boolean(state.error) || !report?.rows.length || busy} onClick={download}><IoDownloadOutline />{p(busy ? 'preparing' : 'download')}</button></footer>
  </dialog>;
}
