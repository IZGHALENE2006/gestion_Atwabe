import { useTranslation } from 'react-i18next';
export default function ClientTailoringSummary({ client }) {
  const { t } = useTranslation(), stats = client.tailoringStats;
  return <div className="client-tailoring-counts"><span data-client-tailoring-total={stats?.total || 0}>{t('clientTailoring.compact', { count: stats?.total || 0 })}</span>{stats?.cancelled > 0 && <span className="is-cancelled" data-client-tailoring-cancelled={stats.cancelled}>{t('clientTailoring.cancelledCompact', { count: stats.cancelled })}</span>}</div>;
}
