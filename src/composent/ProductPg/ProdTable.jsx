import { IoAddOutline, IoInformationCircleOutline } from "react-icons/io5";
import { MdDeleteOutline } from "react-icons/md";
import { CiEdit } from "react-icons/ci";
import { useEffect, useState, useRef, forwardRef } from "react";
import ConfirmDelete from "../Dialog/ConfirmDelete";
import Dialog from "../Dialog/Dialog";
import {
  HiOutlineCube,
  HiOutlineUser,
  HiOutlineCalendar,
  HiOutlineCash,
  HiOutlineTrendingUp,
} from "react-icons/hi";
import { FaPrint, FaLock } from "react-icons/fa";
import toast, { Toaster } from "react-hot-toast";
import { useReactToPrint } from "react-to-print";
import JsBarcode from "jsbarcode";
import { useDispatch, useSelector } from "react-redux";
import { DeleteProduit, GetAllProduct } from "../../slices/SliceProduct";
import UpdateProduit from "./updateProduit";
import { useTranslation } from "react-i18next";
import ProductRestockDialog from './ProductRestockDialog.jsx';
import ProductBatchesTable from './ProductBatchesTable.jsx';
import ProductPrice from './ProductPrice.jsx';
import { productBatches, hasProductBatches } from '../../../shared/productBatches.js';
import ProductCards from "./ProductCards";
import ProductImage from "./ProductImage";
import { hasWholesalePrice } from "../../../shared/productPricing.js";

const PrintContainer = forwardRef(({ product }, ref) => {
  if (!product) return null;
  const labels = productBatches(product).flatMap(batch => Array.from({ length: batch.quantite || 0 }, () => batch));
  return (
    <div
      ref={ref}
      style={{ padding: "10px", display: "flex", flexWrap: "wrap", gap: "15px" }}
    >
      {labels.map((batch, i) => (
        <div
          key={i}
          style={{ border: "1px solid #eee", padding: "10px", textAlign: "center", width: "180px" }}
        >
          <p style={{ fontSize: "10px", fontWeight: "bold", marginBottom: "5px" }}>
            {product.name}
          </p>
          <BarcodeDisplay value={product.barcode} />
          <p style={{ fontSize: "12px", marginTop: "5px", fontWeight: "900" }}>
            {batch.prix_vente} DH • #{batch.number}
          </p>
        </div>
      ))}
    </div>
  );
});

const BarcodeDisplay = ({ value }) => {
  const barcodeRef = useRef(null);
  useEffect(() => {
    const cleanValue = String(value || "").trim();
    if (barcodeRef.current && cleanValue) {
      const preferredFormat = /^\d{12,13}$/.test(cleanValue) ? "EAN13" : "CODE128";

      try {
        JsBarcode(barcodeRef.current, cleanValue, {
          format: preferredFormat,
          lineColor: document.documentElement.classList.contains("dark") ? "#fff" : "#000",
          background: "transparent",
          width: 1.2,
          height: 40,
          displayValue: true,
          fontSize: 12,
        });
      } catch {
        JsBarcode(barcodeRef.current, cleanValue, {
          format: "CODE128",
          lineColor: document.documentElement.classList.contains("dark") ? "#fff" : "#000",
          background: "transparent",
          width: 1.2,
          height: 40,
          displayValue: true,
          fontSize: 12,
        });
      }
    }
  }, [value]);
  return <svg ref={barcodeRef} className="mx-auto" />;
};

const InfoItem = ({ icon, label, value, color }) => (
  <div className="bg-slate-50/80 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center gap-4">
    <div className={`p-3 bg-white dark:bg-slate-900 rounded-xl shadow-sm ${color}`}>{icon}</div>
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest leading-none mb-1">
        {label}
      </p>
      <p className="text-sm font-black text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  </div>
);

export default function ProdTable({ products, viewMode = 'table' }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const dispatch = useDispatch();
  const printRef = useRef();
  const { loading } = useSelector((state) => state.Product);
  const { role } = useSelector((state) => state.LoginAdmin);

  const [openDailgoConfirmation, setOpenDailgoConfirmation] = useState(false);
  const [iddelete, setIdDelete] = useState("");
  const [openInfo, setOpenInfo] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [restockProduct, setRestockProduct] = useState(null);
  const [openupdate, setopeopenupdaten] = useState(false);
  const [idupdate2, setidupdate] = useState("");

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Labels_${selectedProduct?.name}`,
  });

  useEffect(() => {
    dispatch(GetAllProduct());
  }, [dispatch]);

  const handleOpenDelete = (id) => {
    setIdDelete(id);
    setOpenDailgoConfirmation(true);
  };
  const handleOpenInfo = (product) => {
    setSelectedProduct(product);
    setOpenInfo(true);
  };
  const handleopenUpdate = (id) => {
    setidupdate(id);
    setopeopenupdaten(true);
  };

  const handleConfirmDeleteProduit = async () => {
    try {
      await dispatch(DeleteProduit(iddelete)).unwrap();
      setOpenDailgoConfirmation(false);
      toast.success(t("productTable.productDeleted"));
    } catch {
      toast.error(t("productList.deleteFailed"));
    }
  };



  if (loading && products.length === 0) {
    return (
      <div className="p-20 text-center font-black text-primary-500 animate-pulse">
        {t("productTable.loading")}
      </div>
    );
  }

  return (
    <div>
      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">{t('productList.empty')}</div>
      ) : viewMode === 'cards' ? (
        <ProductCards products={products} onDetails={handleOpenInfo} onEdit={handleopenUpdate} onDelete={handleOpenDelete} canManage={role === 'admin'} onRestock={setRestockProduct} />
      ) : (
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" data-product-view="table">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
              <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-800 dark:text-slate-500 tracking-widest">
                {t("productTable.product")}
              </th>
              <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-800 dark:text-slate-500 tracking-widest">
                {t("productTable.status")}
              </th>
              <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-800 dark:text-slate-500 tracking-widest">
                {t("productTable.price")}
              </th>
              <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-800 dark:text-slate-500 tracking-widest">
                {t("productTable.category")}
              </th>
              <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-800 dark:text-slate-500 tracking-widest">
                {t("productTable.stock")}
              </th>
              <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-800 dark:text-slate-500 tracking-widest text-center">
                {t("productTable.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {products?.map((item) => (
              <tr
                key={item._id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all group"
              >
                <td className="px-6 py-4 font-black text-slate-700 dark:text-slate-200 uppercase text-xs">
                  <button type="button" onClick={() => handleOpenInfo(item)} className="flex items-center gap-3 text-start hover:text-primary-600">
                    <ProductImage image={item.image} name={item.name} className="size-11 shrink-0 rounded-lg" contain />
                    {item.name}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                      item.quantite > 0
                        ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
                        : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {item.quantite > 0
                      ? t("productTable.inStock")
                      : t("productTable.outOfStock")}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-400 text-sm">
                  <ProductPrice product={item} />
                  {!hasProductBatches(item) && hasWholesalePrice(item) && <p className="mt-1 text-xs font-medium text-violet-600 dark:text-violet-400">{t('pricing.wholesale')}: {Number(item.prix_gros).toLocaleString(locale)} DH</p>}
                </td>
                <td className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">
                  {item.categorie?.name || t("productTable.notValid")}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`font-black text-sm ${
                      item.quantite < 10 ? "text-rose-500" : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {item.quantite}{" "}
                    <span className="text-[10px] opacity-50">{t("productTable.pcs")}</span>
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-center gap-2">
                    {role === "admin" ? (
                      <>
                        <button type="button" data-restock-product={item._id} onClick={() => setRestockProduct(item)} aria-label={t('productBatches.restock') + ' — ' + item.name} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><IoAddOutline size={17} />{t('productBatches.restock')}</button>
                        <button
                          onClick={() => handleopenUpdate(item._id)}
                          aria-label={`${t('productTable.updateProduct')} — ${item.name}`}
                          className="p-2 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-primary-500 rounded-lg transition-colors"
                        >
                          <CiEdit size={20} />
                        </button>
                        <button
                          onClick={() => handleOpenInfo(item)}
                          aria-label={t('productList.viewDetails', { name: item.name })}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 rounded-lg transition-colors"
                        >
                          <IoInformationCircleOutline size={20} />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(item._id)}
                          aria-label={`${t('productTable.deleteProduct')} — ${item.name}`}
                          className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-400 rounded-lg transition-colors"
                        >
                          <MdDeleteOutline size={20} />
                        </button>
                      </>
                    ) : (
                      <FaLock className="text-slate-200 dark:text-slate-700" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <Dialog
        title={t("productTable.infoTitle")}
        bgcolor={document.documentElement.classList.contains("dark") ? "#0f172a" : "#ffffff"}
        isOpen={openInfo}
        onClose={() => setOpenInfo(false)}
        width="1000px"
      >
        {selectedProduct && (
          <div className="p-2">
            <div className="flex flex-col md:flex-row gap-8">
              <div className="w-full md:w-2/5 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/40 rounded-[2.5rem] border border-slate-100 dark:border-slate-700">
                <ProductImage image={selectedProduct.image} name={selectedProduct.name} className="mb-4 aspect-square w-full max-w-52 rounded-2xl" contain />
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase text-center leading-tight">
                  {selectedProduct.name}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                  {selectedProduct.categorie?.name || t("productTable.notValid")}
                </p>

                <div className="p-3">
                  <BarcodeDisplay value={selectedProduct.barcode} />
                </div>

                <button
                  onClick={handlePrint}
                  className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-slate-900 dark:bg-primary-600 hover:bg-primary-600 dark:hover:bg-primary-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                >
                  <FaPrint size={14} /> {t("productTable.print")} ({selectedProduct.quantite})
                </button>
              </div>

              <div className="flex-1 grid grid-cols-1 gap-3 py-2">
                <InfoItem
                  icon={<HiOutlineCube size={20} />}
                  label={t("productTable.currentStock")}
                  value={`${selectedProduct.quantite} ${t("productTable.units")}`}
                  color="text-primary-500"
                />
                <InfoItem
                  icon={<HiOutlineUser size={20} />}
                  label={t("productTable.supplier")}
                  value={selectedProduct.fournisseur || t("productTable.direct")}
                  color="text-violet-500"
                />
                {role === 'admin' && !hasProductBatches(selectedProduct) && <InfoItem
                  icon={<HiOutlineCash size={20} />}
                  label={t("productTable.purchasePrice")}
                  value={`${Number(selectedProduct.prix_achat || 0).toLocaleString(locale)} DH`}
                  color="text-rose-500"
                />}
                <InfoItem
                  icon={<HiOutlineTrendingUp size={20} />}
                  label={t("productTable.sellingPrice")}
                  value={<ProductPrice product={selectedProduct} />}
                  color="text-primary-500"
                />

                {!hasProductBatches(selectedProduct) && hasWholesalePrice(selectedProduct) && <InfoItem
                  icon={<HiOutlineCash size={20} />}
                  label={t("pricing.wholesalePrice")}
                  value={`${Number(selectedProduct.prix_gros).toLocaleString(locale)} DH`}
                  color="text-violet-500"
                />}

                {role === 'admin' && !hasProductBatches(selectedProduct) && Number(selectedProduct.frais_total) > 0 && <InfoItem
                  icon={<HiOutlineCash size={20} />}
                  label={t('fees.total')}
                  value={<bdi dir="ltr">{t('fees.calculation', { total: `${Number(selectedProduct.frais_total).toLocaleString(locale)} DH`, quantity: selectedProduct.frais_quantite, unit: `${Number(selectedProduct.frais_unitaire).toLocaleString(locale)} DH` })}</bdi>}
                  color="text-amber-500"
                />}

                <div className="mt-4 flex items-center justify-center gap-2 text-slate-300 dark:text-slate-600">
                  <HiOutlineCalendar size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-tighter">
                    {t("productTable.createdOn")}:{" "}
                    {new Date(selectedProduct.datecreate).toLocaleDateString(locale)}
                  </span>
                </div>
              </div>
            </div>
            <ProductBatchesTable product={selectedProduct} canManage={role === 'admin'} />
          </div>
        )}
      </Dialog>

      <ConfirmDelete
        open={openDailgoConfirmation}
        onClose={() => setOpenDailgoConfirmation(false)}
        onConfirm={handleConfirmDeleteProduit}
        title={t("productTable.deleteProduct")}
      />
      <div style={{ display: "none" }}>
        <PrintContainer ref={printRef} product={selectedProduct} />
      </div>
      <Dialog
        bgcolor={document.documentElement.classList.contains("dark") ? "#0f172a" : "#ffffff"}
        isOpen={openupdate}
        onClose={() => setopeopenupdaten(false)}
        title={t("productTable.updateProduct")}
        width="550px"
      >
        <UpdateProduit key={idupdate2} idupdate2={idupdate2} close={() => setopeopenupdaten(false)} />
      </Dialog>
      {restockProduct && <ProductRestockDialog product={restockProduct} onClose={() => setRestockProduct(null)} />}
      <Toaster position="bottom-right" />
    </div>
  );
}
