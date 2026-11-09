import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function SearchTarget() {
  const [params, setParams] = useSearchParams(), { t } = useTranslation();
  if (!params.get('record')) return null;
  const clear = () => {
    const next = new URLSearchParams(params);
    for (const key of ['record', 'recordLabel', 'piece']) next.delete(key);
    setParams(next, { replace: true });
  };
  return <div className="global-search-target" data-global-search-target><span>{t('globalSearch.target', { name: params.get('recordLabel') || params.get('record') })}</span><button type="button" onClick={clear}>{t('globalSearch.clearTarget')}</button></div>;
}
