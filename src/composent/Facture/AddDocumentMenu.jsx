import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoChevronDownOutline, IoDocumentTextOutline, IoCarOutline, IoReturnDownBackOutline, IoClipboardOutline, IoReceiptOutline } from "react-icons/io5";
import { invoiceCreationOperation } from "../../../shared/employeePermissions.js";
import { SALES_DOCUMENT_TYPES } from "../../../shared/salesDocuments.js";

const icons = { invoice: IoDocumentTextOutline, quote: IoClipboardOutline, delivery: IoCarOutline, return: IoReturnDownBackOutline, credit: IoReceiptOutline };

export default function AddDocumentMenu() {
  const operations = useEmployeeOperations('invoices');
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector("a")?.focus();
    const outside = (event) => { if (!container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const onKeyDown = (event) => {
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !open) return;
    event.preventDefault();
    const links = Array.from(menu.current.querySelectorAll("a"));
    const current = links.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
    links[next]?.focus();
  };
  if (!SALES_DOCUMENT_TYPES.some(type => operations[invoiceCreationOperation(type)])) return null;
  return <div ref={container} className="relative" onKeyDown={onKeyDown} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls="add-sales-document-menu" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">
      <IoAddOutline size={20} />{t("salesDocuments.add")}<IoChevronDownOutline size={16} />
    </button>
    {open && <div ref={menu} id="add-sales-document-menu" role="menu" aria-label={t("salesDocuments.chooseType")} className="absolute start-0 sm:start-auto sm:end-0 top-full z-50 mt-2 w-64 max-w-[80vw] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="px-3 py-2 text-xs font-semibold text-slate-400">{t("salesDocuments.chooseType")}</p>
      {SALES_DOCUMENT_TYPES.filter(type => operations[invoiceCreationOperation(type)]).map((type) => {
        const Icon = icons[type];
        return <Link key={type} role="menuitem" to={`/Home/Facture/new?type=${type}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-primary-50 focus:bg-primary-50 focus:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800"><Icon size={21} />{t(`salesDocuments.types.${type}`)}</Link>;
      })}
    </div>}
  </div>;
}
