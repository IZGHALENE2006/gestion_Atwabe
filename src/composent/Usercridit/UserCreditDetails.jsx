import RowActionsMenu from '../shared/RowActionsMenu.jsx';
import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import CreditActivity from "./CreditActivity.jsx";
import { apiErrorMessage } from "../../i18n/apiErrors.js";
import { useEffect, useState } from "react";
import {
  IoAddCircleOutline,
  IoCashOutline,
  IoDocumentTextOutline,
  IoShareSocialOutline,
  IoTrashOutline,
  IoWalletOutline,
} from "react-icons/io5";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  DeleteCreditLine,
  GetUserCriditeById,
} from "../../slices/SliceCridite";
import CreditCustomerActionDialog from './CreditCustomerActionDialog.jsx';

import CreditDocumentDialog from "./CreditDocumentDialog.jsx";
import CreditShareDialog from "./CreditShareDialog.jsx";
import { creditInvoiceReference } from '../../../shared/creditDocuments.js';
import "./creditDocuments.css";

export default function UserCreditDetails() {
  const operations = useEmployeeOperations('credit');
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";

  const [entryMode, setEntryMode] = useState(null);
  const [documentView, setDocumentView] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [lineFilter, setLineFilter] = useState({ customerId: id, value: 'all' });

  const formatMoney = (value) =>
    `${Number(value || 0).toLocaleString(locale)} DH`;
  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString(locale);
  };

  const { selectedUser: loadedUser, loading, actionLoading } = useSelector(
    (state) => state.userCridite
  );
  const selectedUser = loadedUser?._id === id ? loadedUser : null;
  const canDelete = operations.deleteDebt;

  useEffect(() => {
    if (!id) return;
    dispatch(GetUserCriditeById(id));
  }, [dispatch, id]);

  const openDocument = (user, selection = { kind: "statement" }) => {
    const payment = selection.kind === "payment" ? user.paymentHistory.find(entry => entry.reference === selection.reference) : null;
    if (selection.kind === "payment" && !payment) { toast.error(t("creditDocuments.errors.unavailable")); return; }
    if (!operations.print && !(operations.share && selection.kind === 'payment')) return;
    setDocumentView({ user, selection: { ...selection, ...(payment ? { payment } : {}) } });
  };
  const entrySaved = result => { setEntryMode(null); if (result.document) openDocument(result.user, result.document); };

  const handleDeleteLine = async (productId) => {
    if (!window.confirm(t("creditDetails.deleteCreditLineConfirm"))) return;

    try {
      await dispatch(DeleteCreditLine({ userId: id, productId })).unwrap();
      toast.success(t("creditDetails.creditLineRemoved"));
    } catch (error) {
      toast.error(apiErrorMessage(error, t, "creditDetails.failedRemoveLine"));
    }
  };

  if (loading && !selectedUser) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500 dark:text-slate-300 font-black uppercase tracking-widest">
        {t("creditDetails.loadingCreditDetails")}
      </div>
    );
  }

  if (!selectedUser) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500 dark:text-slate-300 font-black uppercase tracking-widest">
          {t("creditDetails.clientNotFound")}
        </p>
        <button
          onClick={() => navigate("/Home/cridit/UserCridit")}
          className="px-6 py-3 rounded-2xl bg-primary-600 text-white font-black text-xs uppercase tracking-widest"
        >
          {t("creditDetails.backToList")}
        </button>
      </div>
    );
  }

  const { summary = {}, produit = [], paymentHistory = [] } = selectedUser;
  const activeLineFilter = lineFilter.customerId === id ? lineFilter.value : 'all';
  const invoices = new Map((selectedUser.creditInvoices || []).map(invoice => [String(invoice.id), invoice]));
  const creditRows = produit.map(line => {
    const invoice = invoices.get(String(line.invoiceId));
    // Manual credit also has printable invoice snapshots. Distinguish the
    // original sale source, including older sales stored with a lines array.
    const isInvoice = Boolean(line.fabricInvoiceId || invoice && (['cashier', 'fabric', 'tailoring'].includes(invoice.origin) || !invoice.origin && Array.isArray(invoice.lines)));
    const reference = isInvoice ? invoice ? invoice.reference || creditInvoiceReference(invoice) : 'FI-' + String(line.fabricInvoiceId).toUpperCase() : '';
    return { line, source: isInvoice ? 'invoices' : 'regular', reference };
  });
  const lineCounts = { all: creditRows.length, invoices: creditRows.filter(row => row.source === 'invoices').length, regular: creditRows.filter(row => row.source === 'regular').length };
  const visibleRows = activeLineFilter === 'all' ? creditRows : creditRows.filter(row => row.source === activeLineFilter);
  const sortedPayments = [...paymentHistory].sort(
    (a, b) => new Date(b.Date) - new Date(a.Date)
  );

  return (
    <div dir={i18n.dir()} className="credit-details-page w-full space-y-8 pb-10 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">
            {t("creditDetails.totalCredit")}
          </p>
          <h3 className="text-2xl font-black text-rose-500">
            {formatMoney(summary.total)}
          </h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">
            {t("creditDetails.totalPaid")}
          </p>
          <h3 className="text-2xl font-black text-primary-500">
            {formatMoney(summary.paid)}
          </h3>
        </div>

        <div className="bg-primary-600 p-6 rounded-[2rem] shadow-xl shadow-primary-600/20 text-white relative overflow-hidden">
          <IoWalletOutline className="absolute -right-4 -bottom-4 opacity-20" size={90} />
          <p className="text-primary-100 text-[10px] font-black uppercase tracking-widest mb-2">
            {t("creditDetails.remaining")}
          </p>
          <h3 className="text-3xl font-black">{formatMoney(summary.remaining)}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">
            {t("creditDetails.quantity")}
          </p>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white">
            {summary.totalQuantity || 0}
          </h3>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">
              {selectedUser.name}
            </h3>
            <p className="text-slate-400 text-xs font-bold">
              {t("creditDetails.cin")}: {selectedUser.cin || "-"} | {t("creditDetails.phone")}: {selectedUser.phone || "-"}
            </p>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300" data-credit-created-by>{t("creditAudit.createdBy")}: <span dir="auto">{selectedUser.createdBy?.name || t("creditAudit.unrecorded")}</span>{selectedUser.createdBy && <small className="block text-xs text-slate-500 dark:text-slate-400">{t(selectedUser.createdBy.role === "admin" ? "creditAudit.admin" : "creditAudit.employee")}</small>}</p>
          <div className="flex flex-wrap items-center gap-3">
            <EmployeeOperation module="credit" operation="print"><button type="button" data-credit-statement onClick={() => openDocument(selectedUser)} className="credit-document-button"><IoDocumentTextOutline size={19} />{t("creditDocuments.printInvoice")}</button></EmployeeOperation>
            <EmployeeOperation module="credit" operation="share"><button type="button" data-share-credit onClick={() => setShareOpen(true)} className="credit-document-button"><IoShareSocialOutline size={19} />{t("creditDocuments.share.title")}</button></EmployeeOperation>
            <EmployeeOperation module="credit" operation="addDebt"><button data-add-credit-line
              onClick={() => setEntryMode("debt")}
              className="flex items-center gap-2 px-5 py-3 bg-slate-900 dark:bg-primary-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
            >
              <IoAddCircleOutline size={18} /> {t("creditDetails.addCredit")}
            </button></EmployeeOperation>
            <EmployeeOperation module="credit" operation="payment"><button
              data-add-credit-payment onClick={() => setEntryMode("payment")}
              className="flex items-center gap-2 px-5 py-3 bg-primary-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
            >
              <IoCashOutline size={18} /> {t("creditDetails.addPayment")}
            </button></EmployeeOperation>
          </div>
        </div>

        <EmployeeOperation module="credit" operation="details">
        <div className="credit-line-filters" data-credit-line-filters>
          <div><p id="credit-line-filter-label">{t('creditDetails.lineSource')}</p><span role="status" aria-live="polite" data-credit-filter-count>{t('creditDetails.filteredLines', { shown: visibleRows.length, total: produit.length })}</span></div>
          <div className="credit-line-filter-options" role="group" aria-labelledby="credit-line-filter-label">{['all', 'invoices', 'regular'].map(value => <button key={value} type="button" data-credit-filter={value} aria-pressed={activeLineFilter === value} onClick={() => setLineFilter({ customerId: id, value })}>{t('creditDetails.lineFilters.' + value)}<span>{lineCounts[value]}</span></button>)}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-credit-lines-table>
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.product")}
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.qty")}
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.unitPrice")}
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.lineTotal")}
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.paid")}
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.remaining")}
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.date")}
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500">{t("creditAudit.performedBy")}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 text-center">
                  {t("creditDetails.action")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleRows.map(({ line, source, reference }) => (
                <tr key={line.id} data-credit-line={line.id} data-credit-source={source} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200">
                    {line.nom}
                    <div className="credit-line-source"><span className={'credit-line-source-badge is-' + source}>{t('creditDetails.' + (source === 'invoices' ? 'invoiceSource' : 'regularSource'))}</span>{reference && <bdi dir="ltr">{reference}</bdi>}</div>
                  </td>
                  <td className="px-6 py-4 font-black text-slate-500">{line.Quantite}</td>
                  <td className="px-6 py-4 font-black text-slate-500">
                    {formatMoney(line.prix)}
                  </td>
                  <td className="px-6 py-4 font-black text-slate-700 dark:text-slate-200">
                    {formatMoney(line.lineTotal)}
                  </td>
                  <td className="px-6 py-4 font-black text-primary-600">
                    {formatMoney(line.Paiement)}
                  </td>
                  <td className="px-6 py-4 font-black text-rose-600">
                    {formatMoney(line.lineRemaining)}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-400">
                    {formatDate(line.Date)}
                  </td>
                  <td className="px-6 py-4" data-credit-line-actor><span dir="auto">{line.actor?.name || t("creditAudit.unrecorded")}</span>{line.actor && <small className="block text-xs text-slate-500 dark:text-slate-400">{t(line.actor.role === "admin" ? "creditAudit.admin" : "creditAudit.employee")}</small>}</td>
                  <td className="px-6 py-4" data-row-actions-cell><RowActionsMenu menuKey="UserCreditDetails">
                    <div className="flex justify-center gap-2">
                      <EmployeeOperation module="credit" operation="print"><button type="button" data-credit-line-invoice={line.id} onClick={() => openDocument(selectedUser, { kind: "invoice", line })} className="credit-document-icon" title={t("creditDocuments.printInvoice")} aria-label={t("creditDocuments.printInvoice")}><IoDocumentTextOutline size={18} /></button></EmployeeOperation>
                      {canDelete && !line.fabricInvoiceId && !line.tailoringOrderId && <button
                        disabled={actionLoading}
                        onClick={() => handleDeleteLine(line.id)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50"
                       aria-label={t("categories.delete")}>
                        <IoTrashOutline size={16} />
                      </button>}
                    </div>
                  </RowActionsMenu></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleRows.length === 0 && (
          <div className="py-10 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
            {t(produit.length === 0 ? 'creditDetails.noCreditLinesYet' : 'creditDetails.noFilteredLines')}
          </div>
        )}
        </EmployeeOperation>
      </div>

      <EmployeeOperation module="credit" operation="history"><div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">
            {t("creditDetails.paymentHistory")}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.amount")}
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.note")}
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">
                  {t("creditDetails.date")}
                </th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400">{t("creditAudit.performedBy")}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400">{t("creditDocuments.remainingAfter")}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400">{t("creditDocuments.receipt")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedPayments.map((payment, idx) => (
                <tr key={payment.reference || `${payment.Date}-${idx}`} data-credit-payment={payment.reference}>
                  <td className="px-6 py-4 font-black text-primary-600">
                    {formatMoney(payment.amount)}<small className="credit-payment-source">{t(payment.source === "initial" ? "creditDocuments.initialPayment" : "creditDocuments.payment")}</small>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-500 dark:text-slate-300">
                    {payment.note || "-"}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-400">
                    {formatDate(payment.Date)}
                  </td>
                  <td className="px-6 py-4" data-credit-payment-actor><span dir="auto">{payment.actor?.name || t("creditAudit.unrecorded")}</span>{payment.actor && <small className="block text-xs text-slate-500 dark:text-slate-400">{t(payment.actor.role === "admin" ? "creditAudit.admin" : "creditAudit.employee")}</small>}</td>
                  <td className="px-6 py-4 text-sm font-bold">{payment.balanceSnapshot ? formatMoney(payment.balanceSnapshot.remainingAfter) : "—"}</td>
                  <td className="px-6 py-4" data-row-actions-cell><RowActionsMenu menuKey="UserCreditDetails">{(operations.print || operations.share) && <button type="button" data-credit-payment-receipt={payment.reference} onClick={() => openDocument(selectedUser, { kind: "payment", reference: payment.reference })} className="credit-document-icon" title={t(operations.print ? "creditDocuments.printReceipt" : "creditDocuments.receipt")} aria-label={t(operations.print ? "creditDocuments.printReceipt" : "creditDocuments.receipt")}><IoDocumentTextOutline size={20} /></button>}</RowActionsMenu></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedPayments.length === 0 && (
          <div className="py-8 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
            {t("creditDetails.noPaymentsYet")}
          </div>
        )}
      </div></EmployeeOperation>

      {shareOpen && <EmployeeOperation module="credit" operation="share"><CreditShareDialog key={id} userId={id} onClose={() => setShareOpen(false)} /></EmployeeOperation>}
      {documentView?.user._id === id && (operations.print || operations.share && documentView.selection.kind === "payment") && <CreditDocumentDialog user={documentView.user} selection={documentView.selection} onClose={() => setDocumentView(null)} />}
      <EmployeeOperation module="credit" operation="history"><CreditActivity user={selectedUser} /></EmployeeOperation>

      {entryMode && operations[entryMode === 'debt' ? 'addDebt' : 'payment'] && <CreditCustomerActionDialog key={id + entryMode} userId={id} mode={entryMode} onClose={() => setEntryMode(null)} onSaved={entrySaved} />}
    </div>
  );
}
