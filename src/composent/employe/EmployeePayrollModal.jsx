import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCloseOutline } from 'react-icons/io5';

export default function EmployeePayrollModal({ title, subtitle, onClose, busy, children, footer, wide = false }) {
  const { t, i18n } = useTranslation(), ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement, overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} dir={i18n.dir()} className={`ep-modal ${wide ? 'ep-modal-wide' : ''}`} aria-labelledby="ep-modal-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><h2 id="ep-modal-title">{title}</h2>{subtitle && <p dir="auto">{subtitle}</p>}</div><button type="button" aria-label={t('employeePayroll.close')} disabled={busy} onClick={onClose}><IoCloseOutline size={24}/></button></header>
    <div className="ep-modal-body">{children}</div><footer>{footer || <button type="button" disabled={busy} onClick={onClose}>{t('employeePayroll.close')}</button>}</footer>
  </dialog>;
}
