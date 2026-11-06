import EmployeeOperation from "../permissions/EmployeeOperation.jsx";
import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";
import { IoArrowForwardOutline, IoCreateOutline, IoTrashOutline } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import ProductImage from './ProductImage';
import ProductPrice from './ProductPrice.jsx';
import { hasProductBatches } from '../../../shared/productBatches.js';
import { IoAddOutline } from 'react-icons/io5';
import { hasWholesalePrice } from '../../../shared/productPricing.js';

export default function ProductCards({ products, onDetails, onEdit, onDelete, onRestock, onPrintLabels, canManage }) {
  const operations = useEmployeeOperations('products');
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-product-view="cards">
      {products.map((product) => (
        <article key={product._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg hover:shadow-primary-900/5 dark:border-slate-800 dark:bg-slate-900">
          <button type="button" disabled={!operations.details} onClick={() => onDetails(product)} aria-label={t('productList.viewDetails', { name: product.name })} className="group block w-full text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500">
            <div className="relative p-3 pb-0">
              <ProductImage image={product.image} name={product.name} className="aspect-[4/3] w-full rounded-xl" contain />
              <span className={`absolute end-5 top-5 rounded-full border px-2.5 py-1 text-[10px] font-semibold backdrop-blur-sm ${product.quantite > 0 ? 'border-primary-200 bg-primary-50/95 text-primary-700 dark:border-primary-800 dark:bg-primary-950/95 dark:text-primary-300' : 'border-rose-200 bg-rose-50/95 text-rose-600 dark:border-rose-900 dark:bg-rose-950/95 dark:text-rose-300'}`}>
                {t(product.quantite > 0 ? 'productTable.inStock' : 'productTable.outOfStock')}
              </span>
            </div>
            <div className="p-5">
              <p className="mb-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{product.categorie?.name || t('productDialog.general')}</p>
              <h3 className="truncate text-base font-semibold text-slate-800 dark:text-slate-100">{product.name}</h3>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
                <p className="text-xl font-bold text-primary-700 dark:text-primary-300"><ProductPrice product={product} /></p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{product.quantite} {t('productTable.pcs')}</p>
              </div>
              {!hasProductBatches(product) && hasWholesalePrice(product) && <p className="mt-2 text-xs font-medium text-violet-600 dark:text-violet-400">{t('pricing.wholesale')}: {Number(product.prix_gros).toLocaleString()} DH</p>}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-primary-600 dark:border-slate-800 dark:text-primary-400">
                {t('productList.details')}<IoArrowForwardOutline className="rtl:rotate-180" aria-hidden="true" />
              </div>
            </div>
          </button>
          {canManage && (
            <div className="flex gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800"><EmployeeOperation module="products" operation="labels"><button type="button" data-print-product-labels={product._id} onClick={() => onPrintLabels(product)} className="rounded-lg px-3 py-2 text-xs font-semibold text-blue-600">{t("productTable.print")}</button></EmployeeOperation>
              <EmployeeOperation module="products" operation="restock"><button type="button" data-restock-product={product._id} onClick={() => onRestock(product)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><IoAddOutline size={16} />{t('productBatches.restock')}</button></EmployeeOperation>
              <EmployeeOperation module="products" operation="update"><button type="button" onClick={() => onEdit(product._id)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-300"><IoCreateOutline size={16} />{t('productList.edit')}</button></EmployeeOperation>
              <EmployeeOperation module="products" operation="delete"><button type="button" onClick={() => onDelete(product._id)} aria-label={`${t('productTable.deleteProduct')} — ${product.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><IoTrashOutline size={17} /></button></EmployeeOperation>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
