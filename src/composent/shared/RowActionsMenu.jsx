import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IoEllipsisVertical } from 'react-icons/io5';
import './rowActionsMenu.css';

const controls = panel => [...(panel?.querySelectorAll('button, a[href]') || [])];
const enabledControls = panel => controls(panel).filter(item => !item.disabled && item.getAttribute('aria-disabled') !== 'true');

// Keep the original controls mounted: their permission gates, handlers and busy
// states continue to work. Only their presentation moves into the shared menu.
export default function RowActionsMenu({ children, label, className = '', menuKey }) {
  const { t, i18n } = useTranslation();
  const id = useId(), trigger = useRef(null), panel = useRef(null), focusEnd = useRef(false);
  const [count, setCount] = useState(0), [position, setPosition] = useState(null);
  const [container, setContainer] = useState(() => document.body);
  const name = label || t('clients.fields.actions');
  const close = useCallback((restoreFocus = false) => {
    panel.current?.hidePopover?.(); setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) return;
    const update = () => {
      const items = controls(node);
      items.forEach(item => {
        item.setAttribute('role', 'menuitem'); item.tabIndex = -1;
        const text = item.textContent.trim(), fallback = item.getAttribute('aria-label') || item.title || name;
        item.dataset.menuIconOnly = String(!text);
        item.dataset.menuLabel = fallback;
        item.dataset.menuDanger = String(/(?:rose|red-|danger|delete|cancel-button)/.test(item.className));
      });
      setCount(items.length);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(node, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'aria-label', 'title'] });
    return () => observer.disconnect();
  }, [container, name]);
  useLayoutEffect(() => {
    if (!position || !panel.current) return;
    panel.current.showPopover?.();
    const items = enabledControls(panel.current);
    (focusEnd.current ? items.at(-1) : items[0])?.focus();
    if (!items.length) panel.current.focus();
  }, [position]);
  useEffect(() => {
    if (!position) return;
    const dismiss = event => { if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } };
    const scroll = event => { if (!panel.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', dismiss, true); document.addEventListener('keydown', escape, true);
    window.addEventListener('scroll', scroll, true); window.addEventListener('resize', scroll);
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll); };
  }, [position, close]);
  const open = (last = false) => {
    const rect = trigger.current.getBoundingClientRect(), viewport = window.visualViewport;
    const viewportWidth = viewport?.width || window.innerWidth, viewportHeight = viewport?.height || window.innerHeight;
    const width = Math.min(264, viewportWidth - 24), height = Math.min(count * 44 + 16, viewportHeight - 24);
    const top = rect.bottom + height + 6 <= viewportHeight ? rect.bottom + 6 : rect.top - height - 6;
    setContainer(trigger.current.closest("dialog") || document.body);
    focusEnd.current = last;
    setPosition({ width, left: Math.max(12, Math.min(viewportWidth - width - 12, i18n.dir() === 'rtl' ? rect.left : rect.right - width)), top: Math.max(12, Math.min(viewportHeight - height - 12, top)), maxHeight: height });
  };
  const navigate = event => {
    const items = enabledControls(panel.current), index = items.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (next !== null && items.length) { event.preventDefault(); items[next].focus(); }
    if (event.key === 'Tab') close(true);
  };
  return <span className={'app-row-actions ' + className} onClick={event => event.stopPropagation()}>
    <button ref={trigger} hidden={!count} type="button" className="app-row-actions-trigger" data-row-actions={menuKey || ''} aria-label={name} title={name} aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} onClick={() => position ? close(true) : open()} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(event.key === 'ArrowUp'); } }}><IoEllipsisVertical size={21} aria-hidden="true" /></button>
    {container && createPortal(<div ref={panel} id={id} popover="manual" hidden={!position} data-row-actions-menu={menuKey || ''} role="menu" tabIndex={-1} aria-label={name} dir={i18n.dir()} className="app-row-actions-menu" style={position || undefined} onKeyDown={navigate} onClickCapture={event => { const item = event.target.closest('button, a[href]'); if (item && !item.disabled && item.getAttribute('aria-disabled') !== 'true') close(true); }}><div data-menu-content>{children}</div></div>, container)}
  </span>;
}
