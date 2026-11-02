import ProductBatchPicker from '../ProductPg/ProductBatchPicker.jsx';
import ProductPrice from '../ProductPg/ProductPrice.jsx';
import { cashierBatchChoices, cashierCartRows } from '../../../shared/cashierBatches.js';
import { hasProductBatches } from '../../../shared/productBatches.js';
import { IoSearchOutline, IoCartOutline, IoCameraOutline, IoClose } from "react-icons/io5";
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { getMe, addVentes } from "../../slices/SliceLoginAdmin";
import { GetAllProduct } from "../../slices/SliceProduct";
import LiveClock from "./DateTime";
import { useEffect, useRef, useState } from "react";
import Quagga from "quagga";
import FacturePrint from "./CashierReceipt";
import { useReactToPrint } from "react-to-print";
import { useTranslation } from "react-i18next";
import { calculateSaleTotals, roundMoney } from "../../../shared/saleTotals.js";
import { hasWholesalePrice } from "../../../shared/productPricing.js";
import ProductImage from "../ProductPg/ProductImage";
import { documentPrintFonts } from "../../utils/documentFonts.js";
import CheckoutDialog from "./CheckoutDialog.jsx";
import CreditDocumentDialog from "../Usercridit/CreditDocumentDialog.jsx";
import "../Usercridit/creditDocuments.css";

export default function CaisseSection({ cart, onAddToCart, onClearCart, discount, onDiscountChange }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-FR";
  const [batchProduct, setBatchProduct] = useState(null);
  const [open, setOpen] = useState(false);
  const scannerRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { user, token } = useSelector((state) => state.LoginAdmin);
  const { Produts } = useSelector((state) => state.Product);
  const dispatch = useDispatch();
  const [amountPaid, setAmountPaid] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [creditDocument, setCreditDocument] = useState(null);
  useEffect(() => {
    if (user?._id && sessionStorage.getItem(`atwabe-credit-checkout:${user._id}`)) setCheckoutOpen(true);
  }, [user?._id]);
  const [facture, setFacture] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const printRef = useRef();

  const startScan = () => setOpen(true);
  const stopScan = () => {
    try {
      Quagga.stop();
    } catch {
      // scanner already stopped
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    Quagga.init(
      {
        inputStream: {
          type: "LiveStream",
          target: scannerRef.current,
          constraints: { facingMode: "user" },
        },
        decoder: { readers: ["ean_reader", "code_128_reader"] },
        locate: true,
      },
      (err) => {
        if (err) {
          toast.error(t("cashier.cameraError"));
          return;
        }
        Quagga.start();
      }
    );
    Quagga.onDetected((result) => {
      setSearchTerm(result.codeResult.code);
      stopScan();
    });
    return () => {
      stopScan();
      Quagga.offDetected();
    };
  }, [open, t]);

  useEffect(() => {
    if (token && !user) dispatch(getMe());
    dispatch(GetAllProduct());
  }, [token, dispatch, user]);

  const cashValues = [
    { label: "20 DH", value: 20, img: "/20dh.png", color: "#10b981" },
    { label: "50 DH", value: 50, img: "/50dh.png", color: "#059669" },
    { label: "100 DH", value: 100, img: "/100dh.png", color: "#047857" },
    { label: "200 DH", value: 200, img: "/200dh.png", color: "#065f46" },
  ];

  const filteredProducts = Produts?.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode?.includes(searchTerm)
  );

  const subtotal = roundMoney(cart.reduce((acc, item) => acc + roundMoney(item.price * item.qty), 0));
  let totals = calculateSaleTotals(subtotal);
  let discountError = "";
  try {
    totals = calculateSaleTotals(subtotal, discount.type, discount.value);
  } catch (error) {
    discountError = t(`discount.${error.message}`);
  }
  const totalOrder = totals.total;
  const parsedAmountPaid = amountPaid === "" ? 0 : Number(amountPaid);
  const changeToReturn = roundMoney(parsedAmountPaid - totalOrder);

  async function handlePay(receivedValue = amountPaid, pendingPayload) {
    const parsedAmountPaid = Number(receivedValue);
    const changeToReturn = roundMoney(parsedAmountPaid - totalOrder);
    if (submittingRef.current) return;
    if (!pendingPayload) {
    if (!cart || cart.length === 0) {
      return toast.error(t("cashier.cartEmpty"));
    }

    if (discountError) return toast.error(discountError);

    if (receivedValue === "" || !Number.isFinite(parsedAmountPaid) || parsedAmountPaid < 0) {
      return toast.error(t("cashier.enterReceivedAmount"));
    }

    if (changeToReturn < 0) {
      const missing = (totalOrder - parsedAmountPaid).toFixed(2);
      return toast.error(t("cashier.insufficientAmount", { missing }));
    }

    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const res = await dispatch(
        addVentes(pendingPayload || {
          requestId: crypto.randomUUID(),
          invoiceOrigin: "cashier",
          cart,
          totalOrder,
          amountPaid: parsedAmountPaid,
          changeToReturn,
          discountType: totals.discountType,
          discountValue: totals.discountValue,
        })
      ).unwrap();

      toast.success(t("cashier.saleSaved"));
      setFacture(res.facture);
      onClearCart();
      setAmountPaid("");
      dispatch(GetAllProduct());
      return true;
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    fonts: documentPrintFonts,
    onAfterPrint: () => setFacture(null),
  });

  useEffect(() => {
    if (facture) {
      handlePrint();
    }
  }, [facture, handlePrint]);

  const handleQuickPay = (val) => {
    setAmountPaid(val.toString());
  };

  const handleAddToCartWithCheck = (product) => {
    if (product.quantite <= 0) {
      return toast.error(t("cashier.productOutOfStock"));
    }
    if (cashierBatchChoices(product).length > 1) { setBatchProduct(product); return; }
    onAddToCart(product);
    if (searchTerm) setSearchTerm("");
  };

  return (
    <div className="flex-1 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
            {t("cashier.cashierLabel")}:{" "}
            <span className="text-primary-600">{user?.name || "Admin"}</span>
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 bg-primary-500 text-white text-[8px] font-black rounded-md uppercase">
              {user?.role}
            </span>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <LiveClock />
            </p>
          </div>
        </div>
        <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-primary-600 shadow-sm relative">
          <IoCartOutline size={24} />
          {cart.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-rose-500 text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full text-white border-4 border-white dark:border-slate-800">
              {cashierCartRows(cart).length}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex gap-3 bg-white dark:bg-slate-900">
        <div className="relative flex-1 group">
          <IoSearchOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
          <input
            type="text"
            placeholder={t("cashier.searchProduct")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all text-sm font-bold text-slate-700 dark:text-slate-200"
          />
        </div>
        <button
          onClick={startScan}
          className="w-14 h-14 bg-primary-50 dark:bg-primary-500/10 text-primary-600 border border-primary-100 dark:border-primary-500/20 rounded-2xl flex items-center justify-center hover:bg-primary-600 hover:text-white transition-all active:scale-95"
        >
          <IoCameraOutline size={26} />
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto min-h-87.5 bg-slate-50/50 dark:bg-slate-950/20">
        <div className="flex flex-col gap-3">
          {(searchTerm.length > 0 ? filteredProducts : Produts)?.map((item) => (
            <button
              type="button"
              key={item._id}
              aria-label={`${t('cashier.cart')}: ${item.name}`}
              onClick={() => handleAddToCartWithCheck(item)}
              className={`product-item flex justify-between items-center p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer transition-all group shadow-sm ${
                item.quantite > 0
                  ? "hover:bg-primary-50 dark:hover:bg-primary-500/5 hover:border-primary-300 dark:hover:border-primary-700"
                  : "opacity-60 grayscale cursor-not-allowed"
              }`}
            >
              <div className="flex min-w-0 items-center gap-4 text-start">
                <ProductImage image={item.image} name={item.name} className="size-12 shrink-0 rounded-xl" contain />
                <div className="flex flex-col">
                  <span className="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-tight group-hover:text-primary-600 transition-colors">
                    {item.name}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-[8px] font-black px-2 py-0.5 rounded-md ${
                        item.quantite > 0
                          ? "bg-primary-100 text-primary-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {item.quantite > 0
                        ? t("cashier.available")
                        : t("cashier.outOfStock")}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      {t("cashier.stockLabel")}: {item.quantite}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="font-black text-slate-900 dark:text-white text-lg">
                    <ProductPrice product={item} />
                  </p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {t("pricing.retail")}
                  </p>
                  {!hasProductBatches(item) && hasWholesalePrice(item) && <p className="mt-1 text-xs font-semibold text-violet-600 dark:text-violet-400">{t('pricing.wholesale')}: {Number(item.prix_gros).toLocaleString(locale)} DH</p>}
                </div>
                <div className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded-xl text-slate-400 group-hover:bg-primary-600 group-hover:text-white transition-all transform group-active:scale-90">
                  <IoCartOutline size={20} />
                </div>
              </div>
            </button>
          ))}

          {(!Produts || Produts.length === 0) && (
            <div className="flex flex-col items-center justify-center py-24 opacity-20 dark:text-white">
              <IoCartOutline size={80} />
              <p className="font-black uppercase tracking-[0.3em] text-[10px] mt-4">
                {t("cashier.noProduct")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <fieldset disabled={cart.length === 0 || isSubmitting} className="mb-6 rounded-2xl border border-primary-100 dark:border-primary-900 bg-primary-50/50 dark:bg-primary-950/20 p-4 disabled:opacity-50">
          <legend className="px-2 text-xs font-black text-primary-700 dark:text-primary-400">
            {t("discount.label")}
          </legend>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-1 rounded-xl bg-white dark:bg-slate-800 p-1" role="group" aria-label={t("discount.type")}>
              {[{ type: "percent", label: "%" }, { type: "amount", label: "DH" }].map((option) => (
                <button
                  key={option.type}
                  type="button"
                  aria-pressed={discount.type === option.type}
                  aria-label={t(option.type === "percent" ? "discount.percentage" : "discount.fixedAmount")}
                  onClick={() => onDiscountChange({ ...discount, type: option.type })}
                  className={`px-5 py-3 rounded-lg text-sm font-black transition-colors ${discount.type === option.type ? "bg-primary-600 text-white shadow-sm" : "text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-32">
              <label htmlFor="sale-discount" className="block mb-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                {t(discount.type === "percent" ? "discount.percentage" : "discount.fixedAmount")}
              </label>
              <input
                id="sale-discount"
                type="number"
                min="0"
                max={discount.type === "percent" ? 100 : subtotal}
                step="0.01"
                inputMode="decimal"
                placeholder="0"
                value={discount.value}
                onChange={(e) => onDiscountChange({ ...discount, value: e.target.value })}
                aria-invalid={Boolean(discountError)}
                aria-describedby={discountError ? "sale-discount-error" : undefined}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:border-primary-500"
              />
            </div>
            {discount.value !== "" && (
              <button type="button" onClick={() => onDiscountChange({ type: "percent", value: "" })} className="py-3 text-xs font-bold text-rose-500 hover:underline">
                {t("discount.remove")}
              </button>
            )}
          </div>
          {discountError && <p id="sale-discount-error" role="alert" className="mt-2 text-xs font-bold text-rose-500">{discountError}</p>}
        </fieldset>

        <div className="mb-5 space-y-2 text-sm font-bold" aria-live="polite">
          <div className="flex justify-between gap-3 text-slate-500 dark:text-slate-400">
            <span>{t("discount.subtotal")}</span>
            <span>{subtotal.toFixed(2)} DH</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between gap-3 text-primary-600 dark:text-primary-400">
              <span>{t("discount.label")} ({totals.discountValue}{discount.type === "percent" ? "%" : " DH"})</span>
              <span>-{totals.discountAmount.toFixed(2)} DH</span>
            </div>
          )}
        </div>

        <div className="flex justify-between items-end mb-6">
          <div className="flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
              {t("cashier.totalReceived")}
            </p>
            <input
              type="number"
              min="0"
              step="0.01"
              aria-label={t("cashier.totalReceived")}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="amount-display bg-transparent text-5xl font-black text-primary-600 outline-none w-full placeholder:text-slate-100 dark:placeholder:text-slate-800"
              placeholder="0.00"
            />
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
              {t("cashier.customerChange")}
            </p>
            <p className={`text-3xl font-black ${changeToReturn < 0 ? "text-rose-500" : "text-primary-500"}`}>
              {Math.max(0, changeToReturn).toFixed(2)} <span className="text-sm font-bold">DH</span>
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center py-5 border-t border-dashed border-slate-200 dark:border-slate-700">
          <span className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em]">
            {t("cashier.netAmountDue")}
          </span>
          <span className="text-4xl font-black text-slate-900 dark:text-white">
            {totalOrder.toFixed(2)} <span className="text-sm">DH</span>
          </span>
        </div>
      </div>

      <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50/50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 backdrop-blur-xl">
        {cashValues.map((cash) => (
          <button
            key={cash.value}
            onClick={() => handleQuickPay(cash.value)}
            className="group relative h-28 rounded-4xl transition-all duration-500 overflow-hidden border bg-white/50 border-slate-200 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] hover:shadow-2xl hover:-translate-y-2 dark:bg-slate-900/40 dark:border-slate-800 dark:shadow-none"
          >
            <div className="absolute inset-0 z-0">
              <div
                className="w-full h-full bg-center bg-no-repeat bg-cover opacity-30 dark:opacity-30 group-hover:grayscale-0 group-hover:scale-110 transition-all duration-700"
                style={{ backgroundImage: `url(${cash.img})` }}
              />
              <div className="absolute inset-0 bg-linear-to-t from-slate-900/80 via-slate-900/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
            </div>

            <div
              className="absolute -right-4 -bottom-4 w-24 h-24 blur-3xl rounded-full opacity-0 group-hover:opacity-60 transition-all duration-700"
              style={{ backgroundColor: cash.color }}
            />

            <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1">
              <div
                className="px-3 py-1 rounded-full text-[10px] font-black text-white mb-1 shadow-lg"
                style={{ backgroundColor: cash.color }}
              >
                {cash.value} DH
              </div>
              <span className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter uppercase group-hover:scale-110 transition-transform duration-500 drop-shadow-sm">
                {cash.label}
              </span>
              <div
                className="w-0 h-1.5 rounded-full transition-all duration-500 opacity-0 group-hover:opacity-100 group-hover:w-12"
                style={{ backgroundColor: cash.color, boxShadow: `0 0 15px ${cash.color}` }}
              />
            </div>
          </button>
        ))}
      </div>

      <div className="p-6 bg-white dark:bg-slate-900">
        <button
          onClick={() => setCheckoutOpen(true)}
          disabled={isSubmitting || Boolean(discountError) || cart.length === 0}
          className="w-full py-5 bg-primary-600 hover:bg-primary-500 text-white rounded-4xl font-black text-sm uppercase tracking-[0.2em] transition-all active:scale-[0.98] shadow-2xl shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? t("common.loading") : t("cashier.confirmSale")}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-6 w-full max-w-md relative shadow-2xl border border-white/20">
            <button
              onClick={stopScan}
              className="absolute -top-14 right-0 p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all"
            >
              <IoClose size={28} />
            </button>
            <div
              ref={scannerRef}
              className="w-full h-80 overflow-hidden rounded-[2.5rem] bg-black border-4 border-primary-500 shadow-2xl shadow-primary-500/20"
            />
            <div className="text-center mt-6">
              <p className="text-slate-900 dark:text-white font-black text-xs uppercase tracking-widest">
                {t("cashier.scanningInProgress")}
              </p>
              <p className="text-slate-400 font-bold text-[9px] mt-2 uppercase">
                {t("cashier.centerBarcode")}
              </p>
            </div>
          </div>
        </div>
      )}

      {batchProduct && <ProductBatchPicker product={batchProduct} cart={cart} onChoose={batch => { onAddToCart(batchProduct, batch); setSearchTerm(''); }} onClose={() => setBatchProduct(null)} />}
      {checkoutOpen && <CheckoutDialog cart={cart} total={totalOrder} discount={discount} received={amountPaid} user={user} onCashPay={handlePay} onClose={() => setCheckoutOpen(false)} onCreditSaved={result => {
        setCheckoutOpen(false); onClearCart(); setAmountPaid(""); dispatch(GetAllProduct());
        toast.success(t("creditCheckout.saved")); setCreditDocument(result);
      }} />}
      {creditDocument && <CreditDocumentDialog user={creditDocument.creditUser} selection={creditDocument.document} onClose={() => setCreditDocument(null)} />}
      <div style={{ display: "none" }}>
        <FacturePrint ref={printRef} facture={facture} user={user} />
      </div>
    </div>
  );
}
