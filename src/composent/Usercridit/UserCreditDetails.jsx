import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import CreditActivity from "./CreditActivity.jsx";
import { apiErrorMessage } from "../../i18n/apiErrors.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IoAddCircleOutline,
  IoCameraOutline,
  IoCashOutline,
  IoDocumentTextOutline,
  IoShareSocialOutline,
  IoCloseOutline,
  IoPricetagOutline,
  IoTrashOutline,
  IoWalletOutline,
} from "react-icons/io5";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import Quagga from "quagga";
import { useTranslation } from "react-i18next";
import {
  AddCreditLine,
  AddCreditPayment,
  DeleteCreditLine,
  GetUserCriditeById,
} from "../../slices/SliceCridite";
import { GetAllProduct } from "../../slices/SliceProduct";

import CreditDocumentDialog from "./CreditDocumentDialog.jsx";
import CreditShareDialog from "./CreditShareDialog.jsx";
import "./creditDocuments.css";

const defaultLineForm = {
  mode: "stock",
  productId: "",
  nom: "",
  prix: "",
  Quantite: 1,
  Paiement: 0,
};

export default function UserCreditDetails() {
  const operations = useEmployeeOperations('credit');
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";

  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [openScanner, setOpenScanner] = useState(false);
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [lineForm, setLineForm] = useState(defaultLineForm);
  const [paymentForm, setPaymentForm] = useState({ amount: "", note: "" });
  const scannerRef = useRef(null), lineRequestRef = useRef(null), paymentRequestRef = useRef(null), savingRef = useRef(false);
  const [documentView, setDocumentView] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

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
  const { Produts } = useSelector((state) => state.Product);
  const canDelete = operations.deleteDebt;

  useEffect(() => {
    if (!id) return;
    dispatch(GetUserCriditeById(id));
    dispatch(GetAllProduct());
  }, [dispatch, id]);

  const selectedProduct = useMemo(() => {
    return Produts.find((p) => p._id === lineForm.productId);
  }, [Produts, lineForm.productId]);

  const stopScan = () => {
    try {
      Quagga.stop();
    } catch {
      // scanner already stopped
    }
    setOpenScanner(false);
  };

  const handleBarcodeLookup = useCallback(
    (rawCode = barcodeSearch) => {
      const code = String(rawCode || "").trim();
      if (!code) return;

      const found = Produts.find(
        (p) => String(p.barcode || "").trim() === code
      );

      if (!found) {
        toast.error(t("creditDetails.barcodeNotFound"));
        return;
      }

      setLineForm((prev) => ({ ...prev, productId: found._id }));
      toast.success(t("creditDetails.selectedProduct", { name: found.name, price: found.prix_vente }));
    },
    [Produts, barcodeSearch, t]
  );

  useEffect(() => {
    if (!openScanner) return;

    Quagga.init(
      {
        inputStream: {
          type: "LiveStream",
          target: scannerRef.current,
          constraints: { facingMode: "environment" },
        },
        decoder: {
          readers: ["ean_reader", "code_128_reader", "code_39_reader"],
        },
        locate: true,
      },
      (err) => {
        if (err) {
          toast.error(t("creditDetails.cameraError"));
          stopScan();
          return;
        }
        Quagga.start();
      }
    );

    const onDetected = (result) => {
      const code = result?.codeResult?.code;
      if (!code) return;

      setBarcodeSearch(code);
      handleBarcodeLookup(code);
      stopScan();
    };

    Quagga.onDetected(onDetected);

    return () => {
      try {
        Quagga.offDetected(onDetected);
      } catch {
        // ignore
      }
      stopScan();
    };
  }, [openScanner, Produts, handleBarcodeLookup, t]);

  const handleOpenLineModal = () => {
    lineRequestRef.current = null;
    setLineForm(defaultLineForm);
    setBarcodeSearch("");
    setIsLineModalOpen(true);
  };

  const openDocument = (user, selection = { kind: "statement" }) => {
    const payment = selection.kind === "payment" ? user.paymentHistory.find(entry => entry.reference === selection.reference) : null;
    if (selection.kind === "payment" && !payment) { toast.error(t("creditDocuments.errors.unavailable")); return; }
    if (!operations.print) return;
    setDocumentView({ user, selection: { ...selection, ...(payment ? { payment } : {}) } });
  };
  const requestFor = (ref, payload) => {
    const fingerprint = JSON.stringify(payload);
    if (ref.current?.fingerprint !== fingerprint) ref.current = { fingerprint, requestId: crypto.randomUUID() };
    return ref.current.requestId;
  };
  const handleOpenPaymentModal = () => { paymentRequestRef.current = null; setPaymentForm({ amount: "", note: "" }); setIsPaymentModalOpen(true); };
  const handleAddCreditLine = async e => {
    e.preventDefault(); if (savingRef.current) return;
    const qty = Math.max(1, Number(lineForm.Quantite || 1)), upfront = Math.max(0, Number(lineForm.Paiement || 0));
    let productName = lineForm.nom, productPrice = Number(lineForm.prix);
    if (lineForm.mode === "stock") {
      if (!selectedProduct) { toast.error(t("creditDetails.chooseStockProduct")); return; }
      productName = selectedProduct.name; productPrice = Number(selectedProduct.prix_vente);
    }
    if (!productName?.trim()) { toast.error(t("creditDetails.productNameRequired")); return; }
    if (!productPrice || productPrice <= 0) { toast.error(t("creditDetails.priceGreaterThanZero")); return; }
    if (upfront > productPrice * qty) { toast.error(t("creditDetails.initialPaymentExceeded")); return; }
    const payload = { nom: productName.trim(), prix: productPrice, Quantite: qty, Paiement: upfront };
    savingRef.current = true;
    try {
      const result = await dispatch(AddCreditLine({ userId: id, payload: { ...payload, requestId: requestFor(lineRequestRef, payload) } })).unwrap();
      toast.success(t("creditDetails.creditLineAdded")); setIsLineModalOpen(false); setLineForm(defaultLineForm); setBarcodeSearch("");
      openDocument(result.user, result.document);
    } catch (error) { toast.error(apiErrorMessage(error, t, "creditDetails.failedToAddCreditLine")); }
    finally { savingRef.current = false; }
  };
  const handleAddPayment = async e => {
    e.preventDefault(); if (savingRef.current) return;
    const amount = Number(paymentForm.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error(t("creditDetails.paymentGreaterThanZero")); return; }
    const payload = { amount, note: paymentForm.note.trim() };
    savingRef.current = true;
    try {
      const result = await dispatch(AddCreditPayment({ userId: id, payload: { ...payload, requestId: requestFor(paymentRequestRef, payload) } })).unwrap();
      toast.success(t("creditDetails.paymentSaved")); setIsPaymentModalOpen(false); setPaymentForm({ amount: "", note: "" });
      openDocument(result.user, result.document);
    } catch (error) { toast.error(apiErrorMessage(error, t, "creditDetails.failedSavePayment")); }
    finally { savingRef.current = false; }
  };

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
              onClick={handleOpenLineModal}
              className="flex items-center gap-2 px-5 py-3 bg-slate-900 dark:bg-primary-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
            >
              <IoAddCircleOutline size={18} /> {t("creditDetails.addCredit")}
            </button></EmployeeOperation>
            <EmployeeOperation module="credit" operation="payment"><button
              data-add-credit-payment onClick={handleOpenPaymentModal}
              className="flex items-center gap-2 px-5 py-3 bg-primary-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
            >
              <IoCashOutline size={18} /> {t("creditDetails.addPayment")}
            </button></EmployeeOperation>
          </div>
        </div>

        <EmployeeOperation module="credit" operation="details"><div className="overflow-x-auto">
          <table className="w-full text-left">
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
              {produit.map((line) => (
                <tr key={line.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200">
                    {line.nom}
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
                  <td className="px-6 py-4">
                    <div className="flex justify-center gap-2">
                      <EmployeeOperation module="credit" operation="print"><button type="button" data-credit-line-invoice={line.id} onClick={() => openDocument(selectedUser, { kind: "invoice", line })} className="credit-document-icon" title={t("creditDocuments.printInvoice")} aria-label={t("creditDocuments.printInvoice")}><IoDocumentTextOutline size={18} /></button></EmployeeOperation>
                      {canDelete && <button
                        disabled={actionLoading}
                        onClick={() => handleDeleteLine(line.id)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50"
                      >
                        <IoTrashOutline size={16} />
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></EmployeeOperation>

        {produit.length === 0 && (
          <div className="py-10 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
            {t("creditDetails.noCreditLinesYet")}
          </div>
        )}
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
                  <td className="px-6 py-4"><EmployeeOperation module="credit" operation="print"><button type="button" data-credit-payment-receipt={payment.reference} onClick={() => openDocument(selectedUser, { kind: "payment", reference: payment.reference })} className="credit-document-icon" title={t("creditDocuments.printReceipt")} aria-label={t("creditDocuments.printReceipt")}><IoDocumentTextOutline size={20} /></button></EmployeeOperation></td>
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
      {documentView?.user._id === id && <EmployeeOperation module="credit" operation="print"><CreditDocumentDialog user={documentView.user} selection={documentView.selection} onClose={() => setDocumentView(null)} /></EmployeeOperation>}
      <EmployeeOperation module="credit" operation="history"><CreditActivity user={selectedUser} /></EmployeeOperation>

      {isLineModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-[2.5rem] p-8 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-slate-800 dark:text-white">
                <IoPricetagOutline className="text-primary-500" /> {t("creditDetails.addCreditLine")}
              </h3>
              <button
                onClick={() => setIsLineModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <IoCloseOutline size={24} className="text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleAddCreditLine} className="space-y-5">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setLineForm({ ...defaultLineForm, mode: "stock" })
                  }
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
                    lineForm.mode === "stock"
                      ? "bg-primary-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                  }`}
                >
                  {t("creditDetails.fromStock")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLineForm({ ...defaultLineForm, mode: "custom" })
                  }
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
                    lineForm.mode === "custom"
                      ? "bg-primary-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                  }`}
                >
                  {t("creditDetails.manual")}
                </button>
              </div>

              {lineForm.mode === "stock" ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={barcodeSearch}
                      onChange={(e) => setBarcodeSearch(e.target.value)}
                      placeholder={t("creditDetails.scanOrTypeBarcode")}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 outline-none font-bold text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleBarcodeLookup()}
                      className="px-4 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-black uppercase tracking-widest"
                    >
                      {t("creditDetails.find")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenScanner(true)}
                      className="px-4 rounded-xl bg-primary-600 text-white text-xs font-black uppercase tracking-widest flex items-center gap-2"
                    >
                      <IoCameraOutline size={16} />
                      {t("creditDetails.scan")}
                    </button>
                  </div>

                  <select
                    required
                    value={lineForm.productId}
                    onChange={(e) =>
                      setLineForm((prev) => ({ ...prev, productId: e.target.value }))
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 outline-none font-bold text-sm"
                  >
                    <option value="">{t("creditDetails.chooseProduct")}</option>
                    {Produts.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} - {p.prix_vente} DH
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    required
                    type="text"
                    placeholder={t("creditDetails.productName")}
                    value={lineForm.nom}
                    onChange={(e) =>
                      setLineForm((prev) => ({ ...prev, nom: e.target.value }))
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 outline-none font-bold text-sm"
                  />
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("creditDetails.unitPrice")}
                    value={lineForm.prix}
                    onChange={(e) =>
                      setLineForm((prev) => ({ ...prev, prix: e.target.value }))
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 outline-none font-bold text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={lineForm.Quantite}
                  onChange={(e) =>
                    setLineForm((prev) => ({ ...prev, Quantite: e.target.value }))
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 outline-none font-bold text-sm"
                  placeholder={t("creditDetails.quantityPlaceholder")}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!operations.payment} value={lineForm.Paiement}
                  onChange={(e) =>
                    setLineForm((prev) => ({ ...prev, Paiement: e.target.value }))
                  }
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 outline-none font-bold text-sm"
                  placeholder={t("creditDetails.initialPayment")}
                />
              </div>

              {lineForm.mode === "stock" && selectedProduct && (
                <p className="text-xs font-bold text-slate-500 dark:text-slate-300">
                  {t("creditDetails.selectedProduct", {
                    name: selectedProduct.name,
                    price: selectedProduct.prix_vente,
                  })}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsLineModalOpen(false);
                    stopScan();
                  }}
                  className="flex-1 py-4 border-2 border-slate-100 dark:border-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-[2] py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary-600/20 disabled:opacity-50"
                >
                  {actionLoading ? t("creditAddClient.saving") : t("creditDetails.saveCreditLine")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {openScanner && (
        <div className="fixed inset-0 z-[150] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-5 w-full max-w-md relative shadow-2xl border border-white/20">
            <button
              type="button"
              onClick={stopScan}
              className="absolute -top-12 right-0 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all"
            >
              <IoCloseOutline size={24} />
            </button>
            <div
              ref={scannerRef}
              className="w-full h-80 overflow-hidden rounded-[1.5rem] bg-black border-4 border-primary-500"
            />
            <p className="text-center mt-4 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest">
              {t("creditDetails.scanningBarcode")}
            </p>
          </div>
        </div>
      )}

      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white">
                {t("creditDetails.registerPayment")}
              </h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <IoCloseOutline size={24} className="text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleAddPayment} className="space-y-4">
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) =>
                  setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))
                }
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 outline-none font-bold text-sm"
                placeholder={t("creditDetails.amount")}
              />
              <textarea
                value={paymentForm.note}
                onChange={(e) =>
                  setPaymentForm((prev) => ({ ...prev, note: e.target.value }))
                }
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 outline-none font-bold text-sm"
                placeholder={t("creditDetails.noteOptional")}
                rows={3}
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 py-4 border-2 border-slate-100 dark:border-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-[2] py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-primary-600/20 disabled:opacity-50"
                >
                  {actionLoading ? t("creditAddClient.saving") : t("creditDetails.savePayment")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
