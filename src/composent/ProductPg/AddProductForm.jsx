import { apiErrorMessage } from "../../i18n/apiErrors.js";
import { useState, useEffect, useRef } from "react";
import {
  IoBarcodeOutline,
  IoSaveOutline,
  IoPricetagOutline,
  IoCubeOutline,
  IoBusinessSharp,
  IoLayersOutline,
  IoRefreshOutline,
  IoCameraOutline,
  IoCloseOutline,
} from "react-icons/io5";
import { AddProduct, GetAllProduct } from "../../slices/SliceProduct";
import { useDispatch, useSelector } from "react-redux";
import { GetAllCatefory } from "../../slices/SilceCategory";
import Barcode from "react-barcode";
import toast, { Toaster } from "react-hot-toast";
import { GetAllFournisseur } from "../../slices/SliceFournisseur.jsx";
import Quagga from "quagga";
import { useTranslation } from "react-i18next";
import ProductPhotoField from "./ProductPhotoField";
import { productFormData } from "./productImageUtils";
import ProductFeesFields from "./ProductFeesFields";
import { calculateProductFees } from "../../../shared/productFees.js";

const generateEAN13 = () => {
  let code = "6";
  for (let i = 0; i < 11; i++) {
    code += Math.floor(Math.random() * 10);
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;
  return code + checksum;
};

const InputWrapper = ({ label, children, icon: Icon, action }) => (
  <div className="flex flex-col flex-1 mb-4 group">
    <label className="text-sm font-semibold text-gray-600 dark:text-slate-400 mb-1 flex justify-between">
      {label}
      {action}
    </label>
    <div className="relative flex items-center">
      {children}
      <div className="absolute right-3 flex items-center pointer-events-none text-gray-400 dark:text-slate-500 group-focus-within:text-primary-500 dark:group-focus-within:text-primary-400 transition-colors">
        {Icon ? Icon({ size: 18 }) : null}
      </div>
    </div>
  </div>
);

export default function AddProductForm() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const { Fournisseur } = useSelector((state) => state.Fournisseur);
  const { Produts } = useSelector((state) => state.Product);
  const dispatch = useDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [openScanner, setOpenScanner] = useState(false);
  const scannerRef = useRef(null);

  const [showDatalist, setShowDatalist] = useState(false);
  const fournisseursArray = Fournisseur.map((e) => e.name);
  const [formData, setFormData] = useState(() => ({
    name: "",
    quantite: "",
    barcode: generateEAN13(),
    prix_achat: "",
    prix_vente: "",
    prix_gros: "",
    frais_total: "",
    categorie: "",
    fournisseur: "",
    datecreate: new Date(),
    status: true,
  }));

  const { Category = [] } = useSelector((state) => state.category);

  useEffect(() => {
    dispatch(GetAllCatefory());
    dispatch(GetAllFournisseur());
    dispatch(GetAllProduct());
  }, [dispatch]);

  const stopScan = () => {
    try {
      Quagga.stop();
    } catch {
      // scanner already stopped
    }
    setOpenScanner(false);
  };

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
          toast.error(t("productForm.cameraError"));
          stopScan();
          return;
        }
        Quagga.start();
      }
    );

    const onDetected = (result) => {
      const code = result?.codeResult?.code;
      if (!code) return;

      setFormData((prev) => ({ ...prev, barcode: code }));
      toast.success(t("productForm.barcodeDetected", { code }));
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
  }, [openScanner, t]);

  const filteredFournisseurs = fournisseursArray.filter((f) =>
    f.toLowerCase().includes(formData.fournisseur.toLowerCase())
  );

  const handlegetCategort = (e) => {
    const val = e.target.value;
    setFormData((prev) => ({ ...prev, categorie: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      calculateProductFees({ retailPrice: formData.prix_vente, wholesalePrice: formData.prix_gros, totalFees: formData.frais_total, quantity: formData.quantite });
      const cleanBarcode = String(formData.barcode || "").trim();
      const productData = {
        ...formData,
        barcode: cleanBarcode || generateEAN13(),
      };

      const barcodeExists = Produts.some(
        (p) => String(p.barcode || "").trim() === productData.barcode
      );
      if (barcodeExists) {
        toast.error(t("productForm.barcodeExists"));
        setIsSubmitting(false);
        return;
      }

      await dispatch(AddProduct(productFormData(productData, photo?.file))).unwrap();
      setPhoto(null);

      setFormData({
        name: "",
        prix_achat: "",
        prix_vente: "",
        prix_gros: "",
        frais_total: "",
        categorie: "",
        quantite: "",
        barcode: generateEAN13(),
        fournisseur: "",
        datecreate: new Date(),
        status: true,
      });

      toast.success(t("productForm.productAdded"));
      dispatch(GetAllProduct());
    } catch (err) {
      const message = typeof err === "string" ? err : err?.message;
      toast.error(t(`pricing.${message}`, { defaultValue: t(`productPhoto.${message}`, { defaultValue: apiErrorMessage(message, t, "productForm.addFailed") }) }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const profit = (
    Number(formData.prix_vente || 0) - Number(formData.prix_achat || 0)
  ).toFixed(2);
  const inputStyles =
    "w-full border p-2.5 pr-10 rounded-xl border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm";

  return (
    <div className="mx-auto rounded-2xl p-6 max-w-4xl">
      <form onSubmit={handleSubmit}>
        <ProductPhotoField selection={photo} onSelect={setPhoto} onRemove={() => setPhoto(null)} disabled={isSubmitting} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <InputWrapper label={t("productForm.productName")} icon={IoCubeOutline}>
            <input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("productForm.productNamePlaceholder")}
              className={inputStyles}
            />
          </InputWrapper>

          <InputWrapper label={t("productForm.stockQuantity")} icon={IoSaveOutline}>
            <input
              type="number"
              name="quantite"
              min="0"
              step="1"
              value={formData.quantite}
              onChange={(e) =>
                setFormData({ ...formData, quantite: e.target.value })
              }
              placeholder="0"
              className={inputStyles}
            />
          </InputWrapper>

          <InputWrapper label={t("productForm.purchasePrice")} icon={IoPricetagOutline}>
            <input
              required
              type="number"
              name="prix_achat"
              min="0"
              step="0.01"
              value={formData.prix_achat}
              onChange={(e) =>
                setFormData({ ...formData, prix_achat: e.target.value })
              }
              placeholder="0.00"
              className={inputStyles}
            />
          </InputWrapper>

          <div className="flex flex-col mb-4">
            <label className="text-sm font-semibold text-gray-600 dark:text-slate-400 mb-1 flex justify-between">
              {t(Number(formData.frais_total) > 0 ? "fees.baseRetail" : "productForm.sellingPrice")}
              <span
                className={
                  Number(profit) >= 0
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-red-600"
                }
              >
                ({Number(profit).toLocaleString(locale)} Dh)
              </span>
            </label>
            <div className="relative flex items-center group">
              <input
                required
                type="number"
                name="prix_vente"
                min="0"
                step="0.01"
                value={formData.prix_vente}
                onChange={(e) =>
                  setFormData({ ...formData, prix_vente: e.target.value })
                }
                placeholder="0.00"
                className={inputStyles}
              />
              <div className="absolute right-3 text-gray-400 group-focus-within:text-primary-500">
                <IoPricetagOutline size={18} />
              </div>
            </div>
          </div>

          <InputWrapper label={t(Number(formData.frais_total) > 0 ? "fees.baseWholesale" : "pricing.wholesalePrice")} icon={IoPricetagOutline}>
            <input
              type="number"
              name="prix_gros"
              min="0"
              step="0.01"
              aria-label={t("pricing.wholesalePrice")}
              value={formData.prix_gros}
              onChange={(e) => setFormData({ ...formData, prix_gros: e.target.value })}
              placeholder={t("pricing.optional")}
              className={inputStyles}
            />
          </InputWrapper>

          <InputWrapper label={t("productForm.category")} icon={IoLayersOutline}>
            <select
              onChange={handlegetCategort}
              value={formData.categorie}
              className={`${inputStyles} appearance-none cursor-pointer`}
            >
              <option value="" className="dark:bg-slate-900">
                {t("productForm.selectCategory")}
              </option>
              {Category.map((item) => (
                <option key={item._id} value={item._id} className="dark:bg-slate-900">
                  {item.name}
                </option>
              ))}
            </select>
          </InputWrapper>

          <div className="relative">
            <InputWrapper label={t("productForm.supplier")} icon={IoBusinessSharp}>
              <input
                value={formData.fournisseur}
                onFocus={() => setShowDatalist(true)}
                onBlur={() => setTimeout(() => setShowDatalist(false), 200)}
                onChange={(e) =>
                  setFormData({ ...formData, fournisseur: e.target.value })
                }
                placeholder={t("productForm.supplierPlaceholder")}
                className={inputStyles}
              />
            </InputWrapper>

            {showDatalist && filteredFournisseurs.length > 0 && (
              <ul className="absolute z-50 w-full -mt-3 bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-slate-700 rounded-xl max-h-48 overflow-y-auto shadow-2xl">
                {filteredFournisseurs.map((fourn, index) => (
                  <li
                    key={index}
                    onClick={() => {
                      setFormData({ ...formData, fournisseur: fourn });
                      setShowDatalist(false);
                    }}
                    className="px-4 py-3 hover:bg-primary-600 hover:text-white cursor-pointer text-sm border-b border-gray-100 dark:border-slate-700/50 last:border-none transition-colors text-gray-700 dark:text-slate-200"
                  >
                    {fourn}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ProductFeesFields total={formData.frais_total} quantity={formData.quantite} retailPrice={formData.prix_vente} wholesalePrice={formData.prix_gros} onTotalChange={(value) => setFormData((previous) => ({ ...previous, frais_total: value }))} disabled={isSubmitting} />

        <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
          <InputWrapper
            label={t("productForm.barcode")}
            icon={IoBarcodeOutline}
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenScanner(true)}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1 font-bold transition-colors"
                >
                  <IoCameraOutline /> {t("productForm.scan")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, barcode: generateEAN13() })
                  }
                  className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1 font-bold transition-colors"
                >
                  <IoRefreshOutline /> {t("productForm.regenerate")}
                </button>
              </div>
            }
          >
            <input
              value={formData.barcode}
              onChange={(e) =>
                setFormData({ ...formData, barcode: e.target.value })
              }
              placeholder={t("productForm.barcodePlaceholder")}
              className="text-center font-mono font-bold tracking-widest text-slate-600 dark:text-slate-300 w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-800"
            />
          </InputWrapper>
          {!!formData.barcode && (
            <div className="mt-3 flex justify-center bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-700 overflow-x-auto">
              <Barcode
                value={formData.barcode}
                height={45}
                fontSize={14}
                displayValue={false}
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`mt-8 w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-white shadow-lg shadow-primary-500/20 transition-all ${
            isSubmitting
              ? "bg-slate-400 cursor-not-allowed"
              : "bg-primary-600 hover:bg-primary-500 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
          }`}
        >
          {isSubmitting ? (
            t("productForm.processing")
          ) : (
            <>
              <IoSaveOutline size={20} />
              {t("productForm.confirmSave")}
            </>
          )}
        </button>
      </form>

      {openScanner && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-5 w-full max-w-md relative shadow-2xl border border-white/20">
            <button
              onClick={stopScan}
              className="absolute -top-12 right-0 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all"
            >
              <IoCloseOutline size={24} />
            </button>
            <div
              ref={scannerRef}
              className="w-full h-80 overflow-hidden rounded-[1.5rem] bg-black border-4 border-primary-500"
            />
            <div className="text-center mt-4">
              <p className="text-slate-900 dark:text-white font-black text-xs uppercase tracking-widest">
                {t("productForm.scanningBarcode")}
              </p>
            </div>
          </div>
        </div>
      )}
      <Toaster position="top-right" />
    </div>
  );
}
