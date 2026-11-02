import { useTranslation } from 'react-i18next';
import { GiTrousers } from 'react-icons/gi';
import { TROUSER_TYPES, trouserWorkTotals } from '../../../shared/workerWork.js';

export default function TrouserSummary({ works }) {
  const { t, i18n } = useTranslation();
  const totals = trouserWorkTotals(works);
  const number = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA').format(value);
  return <section className="trouser-summary" aria-labelledby="trouser-summary-title">
    <h2 id="trouser-summary-title">{t('workers.work.trousers.statistics')}</h2>
    <div className="trouser-summary-grid">{TROUSER_TYPES.map(type => <article key={type} className={`trouser-summary-card trouser-summary-${type}`} data-trouser-summary={type}>
      <header><h3>{t(`workers.work.trousers.totals.${type}`)}</h3><span aria-hidden="true"><GiTrousers size={27} /></span></header>
      <dl>{['quantity', 'completedQuantity', 'remainingQuantity'].map(key => <div key={key}><dt>{t(`workers.work.design.${key}`)}</dt><dd data-trouser-total={key} data-value={totals[type][key]}><bdi>{number(totals[type][key])}</bdi></dd></div>)}</dl>
    </article>)}</div>
  </section>;
}
