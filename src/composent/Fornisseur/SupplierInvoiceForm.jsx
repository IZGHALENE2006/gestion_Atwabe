import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoTrashOutline } from "react-icons/io5";
import { calculateSupplierInvoice, localInvoiceDate } from "../../../shared/supplierInvoices.js";
import { supplierInvoiceError } from "./supplierInvoiceApi.js";

const blankLine = () => ({ key: crypto.randomUUID(), productId: null, name: "", quantity: 1, unitPrice: "" });
const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800";

export default function SupplierInvoiceForm({ products, onSave, onCancel }) {
  const { t } = useTranslation();
  const [requestId] = useState(() => crypto.randomUUID());
  const [reference, setReference] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(localInvoiceDate);
  const [items, setItems] = useState(() => [blankLine()]);
  const [amountPaid, setAmountPaid] = useState("0");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  let total = 0;
  const completeRows = items.filter((item) => item.unitPrice !== "" && Number(item.quantity) > 0);
  try { total = calculateSupplierInvoice(completeRows.map((item) => ({ ...item, name: item.name || "-" })), 0).total; } catch { /* Incomplete rows are validated on save. */ }
  const paid = Number(amountPaid) || 0;
  const updateLine = (key, update) => setItems((rows) => rows.map((row) => row.key === key ? { ...row, ...update } : row));

  function addProduct(id) {
    const product = products.find((entry) => entry._id === id);
    if (!product) return;
    const line = { ...blankLine(), productId: product._id, name: product.name, unitPrice: product.prix_achat ?? 0 };
    setItems((rows) => rows.length === 1 && !rows[0].name.trim() ? [line] : [...rows, line]);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    try {
      calculateSupplierInvoice(items, amountPaid);
      busy.current = true;
      setSaving(true);
      await onSave({ requestId, reference, invoiceDate, items: items.map(({ productId, name, quantity, unitPrice }) => ({ productId, name, quantity, unitPrice })), amountPaid });
    } catch (failure) { setError(supplierInvoiceError(failure, t)); }
    finally { busy.current = false; setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-7">
      <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
        <h2 className="text-xl font-bold">{t("supplierInvoices.add")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold">{t("supplierInvoices.referenceOptional")}
            <input id="supplier-invoice-reference" className={inputClass} value={reference} maxLength={80} onChange={(event) => setReference(event.target.value)} />
          </label>
          <label className="space-y-2 text-sm font-semibold">{t("supplierInvoices.date")}
            <input id="supplier-invoice-date" type="date" required className={inputClass} value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="min-w-0 flex-1 space-y-2 text-sm font-semibold">{t("supplierInvoices.chooseProduct")}
            <select className={inputClass} value="" onChange={(event) => addProduct(event.target.value)} disabled={items.length >= 200}>
              <option value="">{t("supplierInvoices.chooseProductPlaceholder")}</option>
              {products.map((product) => <option key={product._id} value={product._id}>{product.name}{product.barcode ? ` · ${product.barcode}` : ""}</option>)}
            </select>
          </label>
          <button type="button" disabled={items.length >= 200} onClick={() => setItems((rows) => [...rows, blankLine()])} className="inline-flex items-center gap-2 rounded-xl border border-primary-200 px-4 py-2.5 text-sm font-bold text-primary-700 dark:border-primary-800 dark:text-primary-300">
            <IoAddOutline size={20} />{t("supplierInvoices.addLine")}
          </button>
        </div>
        <div className="space-y-3">
          {items.map((item, index) => <div key={item.key} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <label className="col-span-2 space-y-1 text-xs font-semibold sm:col-span-1">{t("supplierInvoices.product")} {index + 1}
              <input aria-label={`${t("supplierInvoices.product")} ${index + 1}`} required maxLength={200} className={inputClass} value={item.name} onChange={(event) => updateLine(item.key, { name: event.target.value, productId: null })} />
            </label>
            <label className="space-y-1 text-xs font-semibold">{t("supplierInvoices.quantity")}
              <input aria-label={`${t("supplierInvoices.quantity")} ${index + 1}`} type="number" min="0.001" max="1000000" step="0.001" required dir="ltr" className={inputClass} value={item.quantity} onChange={(event) => updateLine(item.key, { quantity: event.target.value })} />
            </label>
            <label className="space-y-1 text-xs font-semibold">{t("supplierInvoices.unitPrice")}
              <input aria-label={`${t("supplierInvoices.unitPrice")} ${index + 1}`} type="number" min="0" max="1000000000" step="0.01" required dir="ltr" className={inputClass} value={item.unitPrice} onChange={(event) => updateLine(item.key, { unitPrice: event.target.value })} />
            </label>
            <div className="py-2 text-sm font-bold"><bdi dir="ltr">{(Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2)} DH</bdi></div>
            <button type="button" disabled={items.length === 1} aria-label={`${t("supplierInvoices.removeLine")} ${index + 1}`} onClick={() => setItems((rows) => rows.filter((row) => row.key !== item.key))} className="justify-self-end rounded-lg p-3 text-rose-500 hover:bg-rose-50 disabled:opacity-30 dark:hover:bg-rose-900/20"><IoTrashOutline size={20} /></button>
          </div>)}
        </div>
        <div className="grid items-center gap-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800 sm:grid-cols-3">
          <div><p className="text-sm text-slate-500 dark:text-slate-400">{t("supplierInvoices.total")}</p><bdi dir="ltr" className="text-xl font-bold">{total.toFixed(2)} DH</bdi></div>
          <label className="space-y-2 text-sm font-semibold">{t("supplierInvoices.amountPaid")}
            <input id="supplier-invoice-paid" type="number" min="0" max={total} step="0.01" required dir="ltr" className={inputClass} value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} />
          </label>
          <div><p className="text-sm text-slate-500 dark:text-slate-400">{t("supplierInvoices.remaining")}</p><bdi dir="ltr" className="text-xl font-bold text-amber-700 dark:text-amber-400">{Math.max(total - paid, 0).toFixed(2)} DH</bdi></div>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("supplierInvoices.stockNote")}</p>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold dark:border-slate-700">{t("common.cancel")}</button>
          <button type="submit" className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-bold text-white hover:bg-primary-700">{saving ? t("supplierInvoices.saving") : t("supplierInvoices.save")}</button>
        </div>
      </fieldset>
    </form>
  );
}
