import { useTranslation } from 'react-i18next';
import { IoCreateOutline } from 'react-icons/io5';
import useEmployeeOperations from '../../hooks/useEmployeeOperations.js';
import { formatSfifaCode } from '../../../shared/sfifaStock.js';

export default function WorkerWorkEditHistory({ work }) {
  const { t, i18n } = useTranslation(), financials = useEmployeeOperations('workers').financials;
  const locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-MA';
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const money = value => new Intl.NumberFormat(locale, { style: 'currency', currency: 'MAD' }).format(value);
  const snapshot = (value, key) => <div className="work-edit-snapshot"><h4>{t('workers.work.editing.' + key)}</h4><p><strong>{t(work.category === 'sfifa' ? 'workers.work.sfifa.quantity' : 'workers.work.quantity')}: {number(value.quantity)}</strong></p>
    {value.sfifa && <p>{t('sfifaStock.widths.' + value.sfifa.width)} · {value.sfifa.family === 'customer' ? t('workers.work.sfifa.customerSupplied') : formatSfifaCode(value.sfifa.code, value.sfifa.family)} · {value.sfifa.family !== 'customer' && <bdi>{value.sfifa.family}</bdi>}</p>}
    {value.shopTrouser && <p dir="auto">{t('workers.work.trousers.styles.' + value.trouserType)} · {value.shopTrouser.fabricType} · <bdi>{value.shopTrouser.size}</bdi> · {value.shopTrouser.length} · {value.shopTrouser.metersPerPiece} {t('sfifaStock.unit')}<br />{value.shopTrouser.colors?.map(color => color.name).join('، ')}</p>}
    {value.tailoring && <p dir="auto">{value.tailoring.clientName} · <bdi dir="ltr">{value.tailoring.barcode}</bdi></p>}
    {financials && value.unitWage !== undefined && <p>{t('workers.payroll.wage')}: {money(value.unitWage)}</p>}
    {value.materials?.map((row, index) => <p key={row.lineId} dir="auto">{index + 1}. {row.fabricType} · {row.fabricColor}{row.modelNumber !== undefined && <> · {t("workers.work.shopDjellaba.modelNumber")}: <bdi dir="ltr">{row.modelNumber}</bdi></>} · <bdi>{row.size}</bdi> · {number(row.meters)} {t('sfifaStock.unit')} · {t('sfifaStock.widths.' + row.sfifaWidth)} {row.sfifaCode === undefined ? '' : formatSfifaCode(row.sfifaCode, row.sfifaFamily)}{financials && row.unitWage !== undefined ? ' · ' + money(row.unitWage) : ''}</p>)}
  </div>;
  return <section className="work-detail-history"><div className="work-detail-section-heading"><h3>{t('workers.work.editing.history')}</h3></div>{work.edits?.length ? <ol className="work-detail-timeline">{[...work.edits].reverse().map(event => <li key={event.requestId} data-work-edit-event><span className="work-detail-event-icon"><IoCreateOutline /></span><article className="work-detail-event"><div className="work-detail-event-heading"><strong>{t('workers.work.editing.changedBy')}: <bdi dir="auto">{event.actorName || t('employeePermissions.unrecorded')}</bdi></strong><time dateTime={event.date}>{new Date(event.date).toLocaleString(locale)}</time></div><div className="work-edit-snapshots">{snapshot(event.beforeSnapshot, 'before')}{snapshot(event.afterSnapshot, 'after')}</div></article></li>)}</ol> : <p className="work-detail-empty">{t('workers.work.editing.empty')}</p>}</section>;
}
