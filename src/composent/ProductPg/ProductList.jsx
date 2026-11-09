import useSearchTarget from "../../hooks/useSearchTarget.js";
import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import { productBatches } from "../../../shared/productBatches.js";
import {
  IoSearchOutline,
  IoAddOutline,
  IoFilterOutline,
  IoLayersOutline,
  IoCameraOutline,
  IoClose,
  IoGridOutline,
  IoListOutline,
} from "react-icons/io5";
import Dialog from "../Dialog/Dialog";
import { useEffect, useState, useRef } from "react";
import AddProductForm from "./AddProductForm";
import ProdTable from "./ProdTable";
import { useDispatch, useSelector } from "react-redux";
import { GetAllCatefory } from "../../slices/SilceCategory";
import Quagga from "quagga";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

export default function ProductList() {
  const operations = useEmployeeOperations('products');
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const [openScanner, setOpenScanner] = useState(false);
  const scannerRef = useRef(null);

  const matchesSearchTarget = useSearchTarget();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCat, setSelectedCat] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('productView') === 'cards' ? 'cards' : 'table');

  const changeView = (view) => {
    setViewMode(view);
    localStorage.setItem('productView', view);
  };

  const { Category } = useSelector((state) => state.category);
  const { Produts } = useSelector((state) => state.Product);

  useEffect(() => {
    dispatch(GetAllCatefory());
  }, [dispatch]);

  const startScan = () => setOpenScanner(true);
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
        decoder: { readers: ["ean_reader", "code_128_reader", "code_39_reader"] },
        locate: true,
      },
      (err) => {
        if (err) {
          toast.error(t("productList.cameraError"));
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
  }, [openScanner, t]);

  const filteredProducts = Produts?.filter(matchesSearchTarget).filter((product) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      product.name?.toLowerCase().includes(searchLower) ||
      product.barcode?.toString().includes(searchTerm) || productBatches(product).some(batch => batch.barcode?.toLowerCase().includes(searchLower.trim()));
    const matchesCategory =
      selectedCat === "" || product.categorie?.name === selectedCat;
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    if (sortBy === "quantity") return b.quantite - a.quantite;
    if (sortBy === "price") return b.prix_vente - a.prix_vente;
    if (sortBy === "date") return new Date(b.datecreate) - new Date(a.datecreate);
    return 0;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('productList.resultCount', { count: filteredProducts?.length || 0 })}</p>
        <div role="group" aria-label={t('productList.displayMode')} className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
          {[{ value: 'table', icon: <IoListOutline size={18} aria-hidden="true" />, label: 'tableView' }, { value: 'cards', icon: <IoGridOutline size={18} aria-hidden="true" />, label: 'cardsView' }].map(({ value, icon, label }) => (
            <button key={value} type="button" onClick={() => changeView(value)} aria-pressed={viewMode === value} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${viewMode === value ? 'bg-primary-100 text-primary-800 dark:bg-primary-500/20 dark:text-primary-300' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
              {icon}{t(`productList.${label}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-7 p-4 px-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-4xl flex flex-wrap justify-between items-center gap-4 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <div className="flex min-w-0 flex-1 basis-full items-center bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-1 focus-within:ring-2 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/30 transition-all sm:basis-64">
            <IoSearchOutline className="text-slate-400 dark:text-slate-500 mr-2" size={18} />
            <input
              type="text"
              placeholder={t("productList.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-w-0 bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none flex-1 py-2 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <button
              onClick={startScan}
              className="ml-2 p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-xl transition-all active:scale-90"
            >
              <IoCameraOutline size={20} />
            </button>
          </div>

          <div className="relative group min-w-0 w-full sm:min-w-[180px] sm:w-auto">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none transition-colors group-hover:text-primary-500">
              <IoLayersOutline size={16} />
            </div>
            <select
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
              className="w-full appearance-none bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700 rounded-2xl pl-10 pr-8 py-2.5 text-xs font-black uppercase tracking-tight outline-none hover:bg-white dark:hover:bg-slate-800 hover:border-primary-200 dark:hover:border-primary-900 transition-all cursor-pointer"
            >
              <option value="">{t("productList.allCategories")}</option>
              {Category?.map((cat, i) => (
                <option key={i} value={cat.name} className="dark:bg-slate-900">
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none group-hover:text-primary-500">
              <IoFilterOutline size={16} />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700 rounded-2xl pl-10 pr-8 py-2.5 text-xs font-black uppercase tracking-tight outline-none hover:bg-white dark:hover:bg-slate-800 hover:border-primary-200 dark:hover:border-primary-900 transition-all cursor-pointer"
            >
              <option value="">{t("productList.sortBy")}</option>
              <option value="quantity">{t("productList.sortQuantity")}</option>
              <option value="price">{t("productList.sortPrice")}</option>
              <option value="date">{t("productList.sortDate")}</option>
            </select>
          </div>
        </div>

        {operations.add && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 text-[#19b393] border border-primary-300 dark:border-primary-800/50 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
          >
            <IoAddOutline size={20} />
            {t("productList.addProduct")}
          </button>
        )}
      </div>

      {openScanner && (
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
            <div className="text-center mt-6 text-white uppercase tracking-widest font-black text-xs">
              {t("productList.scanning")}
            </div>
          </div>
        </div>
      )}

      <Dialog
        bgcolor={document.documentElement.classList.contains("dark") ? "#0f172a" : "#ffffff"}
        width="550px"
        isOpen={open}
        onClose={() => setOpen(false)}
        title={t("productList.newProductTitle")}
      >
        <AddProductForm close={() => setOpen(false)} />
      </Dialog>

      <ProdTable products={filteredProducts || []} viewMode={viewMode} />
    </div>
  );
}
