import { productBatches, batchRowKey, stockPriceRange } from '../../../shared/productBatches.js';
import { apiErrorMessage } from "../../i18n/apiErrors.js";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { IoAddOutline, IoArrowBackOutline, IoReceiptOutline, IoTrashOutline } from "react-icons/io5";
import { Toaster, toast } from "react-hot-toast";
import { GetAllProduct } from "../../slices/SliceProduct";
import { addVentes } from "../../slices/SliceLoginAdmin";
import { calculateCartTotals, roundMoney } from "../../../shared/saleTotals.js";
import { PAYMENT_METHODS } from "../../../shared/paymentMethods.js";
import { isSalesDocument, isStockNote, documentQuantity } from "../../../shared/salesDocuments.js";
import { invoiceDateKey } from "../../../shared/invoiceFilters.js";
import { saveSalesDocument } from "./salesDocumentsApi.js";
import DocumentClientFields from "./DocumentClientFields.jsx";

const inputClass = "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-3 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";

export default function AddInvoice({ documentType = "invoice", onCancel, onSaved }) {
  const isNote = isSalesDocument({ documentType });
  const canUpdateStock = isStockNote({ documentType });
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const { Produts } = useSelector((state) => state.Product);
  const products = Produts || [];
  const [{ clientId, clientName }, setClient] = useState({ clientId: "", clientName: "" });
  const [documentDate, setDocumentDate] = useState(() => invoiceDateKey());
  const [note, setNote] = useState("");
  const [updateStock, setUpdateStock] = useState(false);
  const [requestId] = useState(() => uuidv4());
  const limitStock = !isNote || (documentType === "delivery" && updateStock);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [lines, setLines] = useState([]);
  const [amountPaid, setAmountPaid] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    dispatch(GetAllProduct()).then((result) => {
      if (!active) return;
      setLoadingProducts(false);
      setLoadError(!Array.isArray(result.payload));
    });
    return () => { active = false; };
  }, [dispatch]);

  const money = (value) => `${Number(value).toFixed(2)} DH`;
  const translateError = (code) => ["invalidClientSelection", "clientUnavailable"].includes(code)
    ? t(`documentClient.${code}`)
    : t(isNote ? `salesDocuments.${code}` : `invoiceCreate.${code}`, {
    defaultValue: t(`discount.${code}`, { defaultValue: apiErrorMessage(code, t, "invoiceCreate.saveFailed") }),
  });

  let totals = calculateCartTotals([]);
  let lineError = "";
  try {
    totals = calculateCartTotals(lines);
    const unavailable = limitStock && lines.find((line) => Number(line.qty) > line.stockMax);
    if (unavailable) lineError = t("invoiceCreate.stockExceeded", { name: unavailable.name, max: unavailable.stockMax });
  } catch (error) {
    const name = lines[error.lineIndex]?.name;
    lineError = `${name ? `${name}: ` : ""}${translateError(error.message)}`;
  }
  const received = amountPaid === null ? totals.total : Number(amountPaid);
  const validPayment = amountPaid !== "" && Number.isFinite(received) && received >= 0 && roundMoney(received) >= totals.total;
  const change = validPayment ? roundMoney(received - totals.total) : 0;
  const productPriceLabel = product => { const range = stockPriceRange(product); return money(range.min) + (range.min === range.max ? '' : ' – ' + money(range.max)); };
  const selectedProduct = products.find(product => product._id === selectedId);
  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.barcode || ""}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  const updateLine = (id, patch) => setLines((current) => current.map((line) => batchRowKey(line) === id ? { ...line, ...patch } : line));
  const addProduct = () => {
    const product = products.find((item) => item._id === selectedId);
    if (!product) return;
    const batches = productBatches(product), batch = batches.find(entry => entry.batchId === selectedBatch) || (batches.length === 1 ? batches[0] : null);
    if (!batch) return toast.error(t('productBatches.productBatchRequired'));
    const key = batchRowKey({ id: product._id, batchId: batch.batchId }), existing = lines.find(line => batchRowKey(line) === key);
    const qty = existing ? Number(existing.qty) + 1 : 1;
    if (limitStock && qty > batch.quantite) return toast.error(t('cashier.maxStockReached', { max: batch.quantite }));
    if (existing) updateLine(key, { qty });
    else setLines(current => [...current, { id: product._id, batchId: batch.batchId, batchNumber: batch.number, name: product.name, price: Number(batch.prix_vente), qty: 1, stockMax: batch.quantite, discountType: 'percent', discountValue: '', vatRate: '0' }]);
    setSelectedBatch('');
    setSelectedId("");
    setSearch("");
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!lines.length) return toast.error(t("cashier.cartEmpty"));
    if (lineError) return toast.error(lineError);
    if (!isNote && !validPayment) return toast.error(t("invoiceCreate.invalidPayment"));
    savingRef.current = true;
    setSaving(true);
    try {
      const cart = lines.map((line) => ({
          id: line.id, batchId: line.batchId, qty: Number(line.qty),
          discountType: line.discountType, discountValue: Number(line.discountValue || 0),
          vatRate: Number(line.vatRate),
        }));
      let saved;
      const client = { clientName: clientName.trim(), ...(clientId ? { clientId } : {}) };
      if (isNote) {
        saved = await saveSalesDocument({ documentType, documentDate, note, updateStock, requestId, cart, ...client });
      } else {
        const result = await dispatch(addVentes({ invoiceOrigin: "manual", requestId, cart, ...client, amountPaid: received, paymentMethod })).unwrap();
        saved = result.facture;
      }
      dispatch(GetAllProduct());
      onSaved(saved);
    } catch (error) {
      toast.error(translateError(typeof error === "string" ? error : error?.response?.data?.message || (isNote ? "saveFailed" : error?.message) || "saveFailed"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div dir={i18n.dir()} className="max-w-7xl mx-auto p-4 text-slate-900 dark:text-slate-100">
      <Toaster position="top-center" />
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-primary-600 text-white"><IoReceiptOutline size={28} /></div>
          <div>
            <h1 className="text-2xl font-black">{t(isNote ? `salesDocuments.createTitles.${documentType}` : "invoiceCreate.title")}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t(isNote ? (canUpdateStock ? "salesDocuments.createSubtitle" : "salesDocuments.documentSubtitle") : "invoiceCreate.subtitle")}</p>
          </div>
        </div>
        <button type="button" disabled={saving} onClick={onCancel} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-bold disabled:opacity-50">
          <IoArrowBackOutline /> {t("common.back")}
        </button>
      </div>

      <form onSubmit={handleSave}>
        <fieldset disabled={saving} className="min-w-0 space-y-6 disabled:opacity-70">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <DocumentClientFields clientId={clientId} clientName={clientName} onChange={setClient} inputClass={inputClass} />
              {isNote ? <div>
                <label htmlFor="document-date" className="block text-sm font-bold mb-2">{t("salesDocuments.date")}</label>
                <input id="document-date" type="date" required value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} className={inputClass} />
              </div> : <div>
                <label htmlFor="invoice-payment-method" className="block text-sm font-bold mb-2">{t("invoiceCreate.paymentMethod")}</label>
                <select id="invoice-payment-method" required dir="ltr" lang="fr" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>
                  {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </select>
              </div>}
            </div>
            {canUpdateStock && <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-4 dark:border-primary-900 dark:bg-primary-950/30">
              <label className="flex items-center gap-3 font-bold cursor-pointer">
                <input id="document-update-stock" type="checkbox" checked={updateStock} onChange={(event) => setUpdateStock(event.target.checked)} aria-describedby="document-stock-hint" className="size-5 accent-primary-600" />
                {t("salesDocuments.updateStock")}
              </label>
              <p id="document-stock-hint" aria-live="polite" className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t(updateStock ? `salesDocuments.stockEffects.${documentType}` : "salesDocuments.noStockEffect")}</p>
            </div>}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_auto] gap-3 items-end">
              <div>
                <label htmlFor="invoice-search" className="block text-sm font-bold mb-2">{t("invoiceCreate.search")}</label>
                <input id="invoice-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedId(""); }} className={inputClass} />
              </div>
              <div>
                <label htmlFor="invoice-product" className="block text-sm font-bold mb-2">{t("invoiceCreate.chooseProduct")}</label>
                <select id="invoice-product" value={selectedId} disabled={loadingProducts || loadError} onChange={(event) => { setSelectedId(event.target.value); setSelectedBatch(''); }} className={inputClass}>
                  <option value="">{loadingProducts ? t("common.loading") : t("invoiceCreate.chooseProduct")}</option>
                  {filteredProducts.map((product) => (
                    <option key={product._id} value={product._id} disabled={limitStock && product.quantite <= 0}>
                      {product.name} — {productPriceLabel(product)} — {t("cashier.stockLabel")}: {product.quantite}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={addProduct} disabled={!selectedId || loadingProducts || loadError || (productBatches(selectedProduct).length > 1 && !selectedBatch)} className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 text-white px-5 py-3 font-bold disabled:opacity-40">
                <IoAddOutline size={22} /> {t("invoiceCreate.addProduct")}
              </button>
            </div>
            {selectedId && <div><label htmlFor="invoice-batch" className="mb-2 block text-sm font-bold">{t('productBatches.choose')}</label><select id="invoice-batch" className={inputClass} value={selectedBatch} onChange={event => setSelectedBatch(event.target.value)}><option value="">{t('productBatches.choose')}</option>{productBatches(products.find(product => product._id === selectedId)).map(batch => <option key={batch.batchId} value={batch.batchId} disabled={limitStock && batch.quantite <= 0}>{t('productBatches.batch', { number: batch.number })} — {money(batch.prix_vente)} — {t('productBatches.remaining')}: {batch.quantite}</option>)}</select></div>}
            {loadError && <p role="alert" className="text-sm text-rose-500">{t("invoiceCreate.loadFailed")}</p>}
            {!loadingProducts && !loadError && filteredProducts.length === 0 && <p className="text-sm text-slate-500">{t("invoiceCreate.noProducts")}</p>}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <p id="invoice-vat-hint" className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">{t("invoiceCreate.vatHint")}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] text-start text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                  <tr>
                    {["product", "quantity", "unitPriceHT", "lineDiscount", "vatRate", "totalHT", "totalTTC", "actions"].map((key) => <th key={key} scope="col" className="p-4 text-start font-bold">{t(`invoiceCreate.${key}`)}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lines.map((line, index) => {
                    const lineTotals = totals.lines[index];
                    return (
                      <tr key={batchRowKey(line)}>
                        <td className="p-4 min-w-36"><p className="font-bold">{line.name}</p>{line.batchNumber && <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{t('productBatches.batch', { number: line.batchNumber })}</p>}<p className="mt-1 text-xs text-slate-400">{t("cashier.stockLabel")}: {line.stockMax}</p></td>
                        <td className="p-4 w-28"><input aria-label={`${t("invoiceCreate.quantity")} — ${line.name}`} type="number" min="1" max={limitStock ? line.stockMax : undefined} step="1" required value={line.qty} onChange={(event) => updateLine(batchRowKey(line), { qty: event.target.value })} className={inputClass} />{documentType === "return" && line.qty !== "" && <p className="mt-2 text-xs text-slate-500">{t("salesDocuments.printedQuantity")}: <bdi dir="ltr">{documentQuantity({ documentType }, line.qty)}</bdi></p>}</td>
                        <td className="p-4 whitespace-nowrap font-semibold">{money(line.price)}</td>
                        <td className="p-4 min-w-52">
                          <div className="flex gap-2">
                            <input aria-label={`${t("discount.label")} — ${line.name}`} type="number" min="0" max={line.discountType === "percent" ? 100 : roundMoney(line.price * Number(line.qty))} step="0.01" placeholder="0" value={line.discountValue} onChange={(event) => updateLine(batchRowKey(line), { discountValue: event.target.value })} className={inputClass} />
                            <select aria-label={`${t("discount.type")} — ${line.name}`} value={line.discountType} onChange={(event) => updateLine(batchRowKey(line), { discountType: event.target.value })} className={`${inputClass} max-w-20`}><option value="percent">%</option><option value="amount">DH</option></select>
                          </div>
                          {lineTotals?.discountAmount > 0 && <p className="text-xs text-primary-600 mt-1">-{money(lineTotals.discountAmount)}</p>}
                        </td>
                        <td className="p-4 min-w-32">
                          <input aria-label={`${t("invoiceCreate.vatRate")} — ${line.name}`} aria-describedby="invoice-vat-hint" type="number" min="0" max="100" step="0.01" required dir="ltr" value={line.vatRate} onChange={(event) => updateLine(batchRowKey(line), { vatRate: event.target.value })} className={inputClass} />
                          {lineTotals && <p className="mt-1 text-xs text-slate-500"><bdi dir="ltr">{money(lineTotals.vatAmount)}</bdi></p>}
                        </td>
                        <td className="p-4 whitespace-nowrap font-semibold">{lineTotals ? money(lineTotals.totalHT) : "—"}</td>
                        <td className="p-4 whitespace-nowrap font-black text-primary-600">{lineTotals ? money(lineTotals.totalTTC) : "—"}</td>
                        <td className="p-4"><button type="button" aria-label={`${t("invoiceCreate.removeProduct")} — ${line.name}`} onClick={() => setLines((current) => current.filter((item) => batchRowKey(item) !== batchRowKey(line)))} className="p-3 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><IoTrashOutline size={20} /></button></td>
                      </tr>
                    );
                  })}
                  {!lines.length && <tr><td colSpan={8} className="p-12 text-center text-slate-400">{t(isNote ? "salesDocuments.emptyProducts" : "invoiceCreate.empty")}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {lineError && <p role="alert" className="text-sm font-bold text-rose-500">{lineError}</p>}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6">
              {isNote ? <><label htmlFor="document-note" className="block font-bold mb-3">{t("salesDocuments.note")}</label><textarea id="document-note" maxLength={1000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} className={inputClass} /></> : <><label htmlFor="invoice-paid" className="block font-bold mb-3">{t("cashier.totalReceived")} (DH)</label>
              <input id="invoice-paid" type="number" min="0" step="0.01" required value={amountPaid ?? totals.total.toFixed(2)} onChange={(event) => setAmountPaid(event.target.value)} className={inputClass} />
              <button type="button" onClick={() => setAmountPaid(null)} className="mt-3 text-sm font-bold text-primary-600 hover:underline">{t("invoiceCreate.exactAmount")}</button>
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("cashier.customerChange")}: <strong>{money(change)}</strong></p>
              {!validPayment && <p role="alert" className="mt-2 text-sm text-rose-500">{t("invoiceCreate.invalidPayment")}</p>}</>}
            </div>
            <div className="bg-slate-900 dark:bg-primary-950 rounded-3xl p-6 text-white space-y-4" aria-live="polite">
              <div className="flex justify-between gap-3 text-slate-300"><span>{t("discount.subtotal")}</span><strong>{lineError ? "—" : money(totals.subtotal)}</strong></div>
              <div className="flex justify-between gap-3 text-primary-300"><span>{t("invoiceCreate.totalDiscounts")}</span><strong>{lineError ? "—" : `-${money(totals.discountAmount)}`}</strong></div>
              <div className="flex justify-between gap-3 text-slate-300"><span>{t("invoiceCreate.totalHT")}</span><strong><bdi dir="ltr">{lineError ? "—" : money(totals.totalHT)}</bdi></strong></div>
              {totals.vatBreakdown.map((group) => <div key={group.vatRate} className="flex justify-between gap-3 text-slate-300"><span>{t("invoiceCreate.vat")} (<bdi dir="ltr">{group.vatRate}%</bdi>)</span><strong><bdi dir="ltr">{money(group.vatAmount)}</bdi></strong></div>)}
              <div className="flex justify-between gap-3 items-center border-t border-white/10 pt-4"><span className="font-bold">{t("invoiceCreate.totalTTC")}</span><strong className="text-3xl"><bdi dir="ltr">{lineError ? "—" : money(totals.total)}</bdi></strong></div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end items-center gap-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">{t(isNote ? (updateStock ? `salesDocuments.stockEffects.${documentType}` : "salesDocuments.noStockEffect") : "invoiceCreate.saveHint")}</p>
            <button type="submit" disabled={!lines.length || Boolean(lineError) || (!isNote && !validPayment) || loadingProducts || loadError} className="px-8 py-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-black disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? t("common.loading") : t(isNote ? "salesDocuments.save" : "invoiceCreate.save")}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
