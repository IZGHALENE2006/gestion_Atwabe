import { hasProductBatches } from '../../../shared/productBatches.js';
import { apiErrorMessage } from "../../i18n/apiErrors.js";
import { useEffect, useState } from "react";
import {
  IoPricetagOutline,
  IoBarcodeOutline,
  IoCubeOutline,
  IoCashOutline,
  IoSaveOutline,
  IoLayersOutline,
  IoPeopleOutline,
} from "react-icons/io5";
import { useDispatch, useSelector } from "react-redux";
import { GetAllProduct, updateProduit } from "../../slices/SliceProduct";
import toast, { Toaster } from "react-hot-toast";
import { GetAllFournisseur } from "../../slices/SliceFournisseur.jsx";
import { useTranslation } from "react-i18next";
import ProductPhotoField from "./ProductPhotoField";
import { productFormData } from "./productImageUtils";
import ProductFeesFields from "./ProductFeesFields";
import { calculateProductFees, getProductBasePrices } from "../../../shared/productFees.js";

function UpdateProduit(props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { idupdate2, close } = props;
  const { Produts, loading } = useSelector((state) => state.Product);
  const { Category = [] } = useSelector((state) => state.category);
  const { Fournisseur } = useSelector((state) => state.Fournisseur);

  const [showDatalist, setShowDatalist] = useState(false);
  const fournisseursList = Fournisseur.map((f) => f.name);

  const currentproduit = Produts.find((item) => item._id == idupdate2);
  const batched = hasProductBatches(currentproduit);
  const [photo, setPhoto] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [formData, setFormData] = useState(() => currentproduit ? {
        name: currentproduit.name,
        quantite: currentproduit.quantite,
        barcode: currentproduit.barcode || "",
        prix_achat: currentproduit.prix_achat,
        ...getProductBasePrices(currentproduit),
        frais_total: currentproduit.frais_total || "",
        frais_quantite: currentproduit.frais_quantite || currentproduit.quantite,
        categorie: currentproduit.categorie?._id || currentproduit.categorie,
        fournisseur: currentproduit.fournisseur,
      } : null);

  useEffect(() => { dispatch(GetAllFournisseur()); }, [dispatch]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const filteredFournisseurs = fournisseursList.filter((f) =>
    formData?.fournisseur
      ? f.toLowerCase().includes(formData.fournisseur.toLowerCase())
      : true
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      calculateProductFees({ retailPrice: formData.prix_vente, wholesalePrice: formData.prix_gros, totalFees: formData.frais_total, quantity: formData.frais_quantite });
      const payload = { ...formData };
      if (batched) for (const key of ['quantite', 'prix_achat', 'prix_vente', 'prix_gros', 'frais_total', 'frais_quantite']) delete payload[key];
      await dispatch(updateProduit({ formData: productFormData(payload, photo?.file, removeImage), idupdate2 })).unwrap();

      toast.success(t("productUpdate.updatedSuccess"));
      dispatch(GetAllProduct());
      dispatch(GetAllFournisseur());
      close();
    } catch (err) {
      const message = typeof err === "string" ? err : err?.message;
      toast.error(t(`pricing.${message}`, { defaultValue: t(`productPhoto.${message}`, { defaultValue: apiErrorMessage(message, t, "productUpdate.updatedFailed") }) }));
    }
  };

  if (!currentproduit || !formData) {
    return (
      <p className="p-10 text-center font-bold text-primary-500 animate-pulse">
        {t("productUpdate.loadingProduct")}
      </p>
    );
  }

  const inputBaseStyle = `
    w-full pl-10 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 
    bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 
    focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all
  `;

  return (
    <div className="rounded-2xl shadow-xl p-1 w-full max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        {batched && <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-7 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">{t('productBatches.editHint')}</p>}
        <ProductPhotoField
          selection={photo}
          currentImage={removeImage ? '' : currentproduit.image}
          onSelect={(value) => { setPhoto(value); setRemoveImage(false); }}
          onRemove={() => { setPhoto(null); setRemoveImage(true); }}
          disabled={loading}
        />
        <div>
          <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">
            {t("productForm.productName")}
          </label>
          <div className="relative group">
            <IoPricetagOutline className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
            <input
              required
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder={t("productForm.productNamePlaceholder")}
              className={inputBaseStyle}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">
              {t("productForm.stockQuantity")}
            </label>
            <div className="relative group">
              <IoCubeOutline className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
              <input
                type="number"
                disabled={batched}
                name="quantite"
                value={formData.quantite}
                onChange={handleChange}
                placeholder="0"
                className={inputBaseStyle}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">
              {t("productForm.barcode")}
            </label>
            <div className="relative group">
              <IoBarcodeOutline className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
              <input
                required
                name="barcode"
                value={formData.barcode}
                onChange={handleChange}
                placeholder={t("productForm.barcodePlaceholder")}
                className={inputBaseStyle}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">
              {t("productForm.category")}
            </label>
            <div className="relative group">
              <IoLayersOutline className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
              <select
                name="categorie"
                value={formData.categorie}
                onChange={handleChange}
                className={`${inputBaseStyle} appearance-none cursor-pointer`}
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
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">
              {t("productForm.purchasePrice")}
            </label>
            <div className="relative group">
              <IoCashOutline className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
              <input
                type="number"
                step="0.01"
                disabled={batched}
                name="prix_achat"
                value={formData.prix_achat}
                onChange={handleChange}
                className={inputBaseStyle}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">
              {t(Number(formData.frais_total) > 0 ? "fees.baseRetail" : "productForm.sellingPrice")}
            </label>
            <div className="relative group">
              <IoCashOutline className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
              <input
                type="number"
                step="0.01"
                disabled={batched}
                name="prix_vente"
                value={formData.prix_vente}
                onChange={handleChange}
                className={inputBaseStyle}
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="edit-wholesale-price" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">{t(Number(formData.frais_total) > 0 ? "fees.baseWholesale" : "pricing.wholesalePrice")}</label>
          <div className="relative group">
            <IoPricetagOutline className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-500" />
            <input id="edit-wholesale-price" disabled={batched} name="prix_gros" type="number" min="0" step="0.01" value={formData.prix_gros} onChange={handleChange} placeholder={t("pricing.optional")} className={inputBaseStyle} />
          </div>
        </div>

        <ProductFeesFields total={formData.frais_total} quantity={formData.frais_quantite} retailPrice={formData.prix_vente} wholesalePrice={formData.prix_gros} onTotalChange={(value) => setFormData((previous) => ({ ...previous, frais_total: value }))} onQuantityChange={(value) => setFormData((previous) => ({ ...previous, frais_quantite: value }))} disabled={loading || batched} />

        <div className="relative">
          <label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">
            {t("productForm.supplier")}
          </label>
          <div className="relative group">
            <IoPeopleOutline className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
            <input
              name="fournisseur"
              value={formData.fournisseur}
              onFocus={() => setShowDatalist(true)}
              onBlur={() => setTimeout(() => setShowDatalist(false), 200)}
              onChange={handleChange}
              placeholder={t("productForm.supplierPlaceholder")}
              className={inputBaseStyle}
              autoComplete="off"
            />
          </div>

          {showDatalist && filteredFournisseurs.length > 0 && (
            <ul className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl max-h-40 overflow-y-auto shadow-2xl">
              {filteredFournisseurs.map((fourn, index) => (
                <li
                  key={index}
                  onClick={() => {
                    setFormData({ ...formData, fournisseur: fourn });
                    setShowDatalist(false);
                  }}
                  className="px-4 py-2.5 hover:bg-primary-600 hover:text-white cursor-pointer text-sm border-b border-gray-100 dark:border-slate-700/50 last:border-none transition-colors text-gray-700 dark:text-slate-200"
                >
                  {fourn}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full flex justify-center items-center gap-2
          ${loading ? "bg-slate-400 cursor-not-allowed" : "bg-primary-600 hover:bg-primary-500 active:scale-[0.98]"}
          text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-primary-500/20`}
        >
          <IoSaveOutline size={20} />
          {loading ? t("productUpdate.updating") : t("productUpdate.saveChanges")}
        </button>
      </form>
      <Toaster position="bottom-right" />
    </div>
  );
}

export default UpdateProduit;
