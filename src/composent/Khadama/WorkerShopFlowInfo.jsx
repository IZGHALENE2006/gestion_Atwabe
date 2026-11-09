import { useTranslation } from 'react-i18next';
import { IoCheckmarkCircleOutline, IoTimeOutline } from 'react-icons/io5';
export default function WorkerShopFlowInfo({ flow }) {
  const { t, i18n } = useTranslation();
  if (!flow) return null;
  return <section className="shop-flow-info" data-shop-flow aria-label={t('workers.shopFlow.progress')}><h3>{t('workers.shopFlow.progress')}</h3><ol>{flow.stages.map(stage => <li key={stage.category} data-shop-stage={stage.category} className={stage.done ? 'is-done' : stage.workId ? 'is-current' : ''}>
    {stage.done ? <IoCheckmarkCircleOutline aria-hidden="true" /> : <IoTimeOutline aria-hidden="true" />}<div><strong>{t('workers.categories.' + stage.category)}</strong><span>{t('workers.shopFlow.' + (stage.done ? 'completed' : stage.workId ? 'inProgress' : 'notAssigned'))}</span>{stage.workerName && <small dir="auto">{stage.workerName}</small>}{stage.completedAt && <time dateTime={stage.completedAt}>{new Date(stage.completedAt).toLocaleDateString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA')}</time>}</div>
  </li>)}</ol></section>;
}
