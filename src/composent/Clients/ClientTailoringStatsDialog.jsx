import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline, IoStatsChartOutline } from 'react-icons/io5';
import { TAILORING_GARMENT_TYPES } from '../../../shared/tailoring.js';
import { emptyClientTailoringStats } from '../../../shared/clientTailoringStats.js';
import './clientTailoring.css';

export default function ClientTailoringStatsDialog({ client, onClose }) {
  const { t, i18n } = useTranslation(), dialog = useRef(null);
  const stats = client.tailoringStats || emptyClientTailoringStats();
  const count = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA').format(value);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} dir={i18n.dir()} className="client-tailoring-dialog" data-client-tailoring-dialog={client._id} aria-labelledby="client-tailoring-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><p><IoStatsChartOutline aria-hidden="true" />{t('clientTailoring.title')}</p><h2 id="client-tailoring-title" dir="auto">{client.name}</h2><bdi dir="ltr">{client.phone}</bdi></div><button type="button" data-close-client-tailoring onClick={onClose} aria-label={t('dialog.close')}><IoCloseOutline size={25} /></button></header>
    <div className="client-tailoring-body">
      <dl className="client-tailoring-totals">{['total', 'active', 'delivered', 'cancelled'].map(key => <div key={key} className={'is-' + key}><dt>{t('clientTailoring.' + key)}</dt><dd data-client-tailoring-stat={key} data-value={stats[key]}>{count(stats[key])}</dd></div>)}</dl>
      <p className="client-tailoring-hint">{t('clientTailoring.hint')}</p>
      {!stats.total && <p className="client-tailoring-empty">{t('clientTailoring.empty')}</p>}
      <div className="client-tailoring-table-wrap"><table><thead><tr><th scope="col">{t('clientTailoring.type')}</th>{['total', 'active', 'delivered', 'cancelled'].map(key => <th scope="col" key={key}>{t('clientTailoring.' + key)}</th>)}</tr></thead><tbody>{TAILORING_GARMENT_TYPES.map(type => <tr key={type} data-client-tailoring-type={type}><th scope="row">{t('fesla.garmentTypes.' + type)}</th>{['total', 'active', 'delivered', 'cancelled'].map(key => <td key={key} className={key === 'cancelled' ? 'is-cancelled' : ''} data-count-kind={key} data-value={stats.byType[type][key]}>{count(stats.byType[type][key])}</td>)}</tr>)}</tbody></table></div>
    </div><footer><button type="button" onClick={onClose}>{t('dialog.close')}</button></footer>
  </dialog>;
}
