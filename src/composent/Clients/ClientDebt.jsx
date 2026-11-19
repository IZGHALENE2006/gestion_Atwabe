import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useEmployeeOperations from '../../hooks/useEmployeeOperations.js';
export default function ClientDebt({ client }) {
  const { t, i18n } = useTranslation(), permissions = useEmployeeOperations('credit');
  const amount = client.creditRemainingAmount || 0;
  const value = <span data-client-debt={amount} className={'mt-2 inline-block rounded-lg px-2 py-1 text-xs font-bold '+(amount > 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200')}>{t(amount > 0 ? 'tailoringCredit.clientBalance' : 'tailoringCredit.noDebt', { amount: new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) })}</span>;
  return client.creditUserId && permissions.details ? <Link to={'/Home/cridit/UserCreditDetails/'+client.creditUserId}>{value}</Link> : value;
}
