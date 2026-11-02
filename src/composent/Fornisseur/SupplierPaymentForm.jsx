import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { localInvoiceDate, supplierPayment } from "../../../shared/supplierInvoices.js";
import { supplierInvoiceError } from "./supplierInvoiceApi.js";

export default function SupplierPaymentForm({ invoice, onSave }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localInvoiceDate);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900";

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    try {
      supplierPayment(invoice, { amount, date, note });
      busy.current = true;
      setSaving(true);
      await onSave({ requestId: requestId.current, amount, date, note });
      setAmount(""); setNote(""); requestId.current = crypto.randomUUID();
    } catch (failure) { setError(supplierInvoiceError(failure, t)); }
    finally { busy.current = false; setSaving(false); }
  }

  return <form onSubmit={submit} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
    <fieldset disabled={saving} className="space-y-4">
      <h3 className="font-bold">{t("supplierInvoices.addPayment")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">{t("supplierInvoices.paymentAmount")}
          <input id="supplier-payment-amount" className={inputClass} dir="ltr" type="number" min="0.01" max={Number((invoice.total - invoice.amountPaid).toFixed(2))} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="text-sm font-semibold">{t("supplierInvoices.paymentDate")}
          <input id="supplier-payment-date" className={inputClass} type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>
      <label className="block text-sm font-semibold">{t("supplierInvoices.note")}
        <input className={inputClass} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <button className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700" type="submit">{saving ? t("supplierInvoices.saving") : t("supplierInvoices.savePayment")}</button>
    </fieldset>
  </form>;
}
