import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IoAddOutline, IoBarcodeOutline, IoCreateOutline, IoEllipsisVertical, IoEyeOutline, IoTimeOutline, IoTrashOutline } from 'react-icons/io5';
import useEmployeeOperations from '../../hooks/useEmployeeOperations.js';

export default function SfifaStockActionsMenu({ stock, permissions, onAction }) {
  const { t, i18n } = useTranslation(), operations = useEmployeeOperations('sfifa');
  const buttonRef = useRef(null), menuRef = useRef(null), id = useId();
  const [position, setPosition] = useState(null);
  const choices = [
    { mode: 'details', allowed: permissions.details && operations.details, icon: <IoEyeOutline size={19} aria-hidden="true" />, label: 'details' },
    { mode: 'restock', allowed: !stock.isUnassigned && permissions.restock && operations.restock, icon: <IoAddOutline size={19} aria-hidden="true" />, label: 'restock' },
    { mode: 'history', allowed: operations.history, icon: <IoTimeOutline size={19} aria-hidden="true" />, label: 'history' },
    { mode: 'edit', allowed: permissions.update && operations.update, icon: <IoCreateOutline size={19} aria-hidden="true" />, label: stock.isUnassigned ? 'classify' : 'edit' },
    { mode: 'barcode', allowed: operations.labels, icon: <IoBarcodeOutline size={19} aria-hidden="true" />, label: 'showBarcode' },
    { mode: 'delete', allowed: permissions.delete && operations.delete, icon: <IoTrashOutline size={19} aria-hidden="true" />, label: 'delete' },
  ].filter(choice => choice.allowed);
  const open = () => {
    const rect = buttonRef.current.getBoundingClientRect(), height = Math.min(choices.length * 46 + 14, window.innerHeight - 24), width = Math.min(240, window.innerWidth - 24);
    const preferredTop = rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 8 : rect.top - height - 8;
    setPosition({ width, left: Math.max(12, Math.min(window.innerWidth - width - 12, i18n.dir() === 'rtl' ? rect.left : rect.right - width)), top: Math.max(12, Math.min(window.innerHeight - height - 12, preferredTop)), maxHeight: height });
  };
  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const dismiss = event => { if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) setPosition(null); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); setPosition(null); buttonRef.current?.focus(); } };
    const scroll = event => { if (!menuRef.current?.contains(event.target)) setPosition(null); };
    window.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', escape); window.addEventListener('scroll', scroll, true); window.addEventListener('resize', scroll);
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll); };
  }, [position]);
  if (!choices.length) return null;
  const navigate = event => {
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')], index = items.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (next !== null) { event.preventDefault(); items[next].focus(); }
    if (event.key === 'Tab') setPosition(null);
  };
  return <><button ref={buttonRef} type="button" data-actions-sfifa={stock._id} className="sfifa-actions-trigger" aria-label={t('sfifaStock.rowActions')} aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} onClick={() => position ? setPosition(null) : open()} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); } }}><IoEllipsisVertical size={22} aria-hidden="true" /></button>{position && createPortal(<div ref={menuRef} id={id} data-sfifa-actions-menu role="menu" dir={i18n.dir()} aria-label={t('sfifaStock.rowActions')} className="sfifa-actions-menu" style={position} onKeyDown={navigate}>{choices.map(({ mode, icon, label }) => <button key={mode} type="button" role="menuitem" tabIndex={-1} data-sfifa-menu-action={mode} className={mode === 'delete' ? 'is-danger' : undefined} onClick={() => { setPosition(null); buttonRef.current?.focus(); onAction(mode, stock); }}>{icon}<span>{t('sfifaStock.' + label)}</span></button>)}</div>, document.body)}</>;
}
