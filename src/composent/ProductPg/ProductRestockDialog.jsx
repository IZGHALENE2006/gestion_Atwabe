import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import toast from 'react-hot-toast';
import { IoAddOutline, IoCloseOutline, IoLayersOutline } from 'react-icons/io5';
import { productBatches, normalizeRestock } from '../../../shared/productBatches.js';
import { productRestocked } from '../../slices/SliceProduct.jsx';
import { apiErrorMessage } from '../../i18n/apiErrors.js';
import ProductBatchesTable from './ProductBatchesTable.jsx';
import ProductFeesFields from './ProductFeesFields.jsx';
import ProductImage from './ProductImage.jsx';
import './productBatches.css';

export default function ProductRestockDialog({ product: initialProduct, onClose }) {
  const { t, i18n } = useTranslation(), dispatch = useDispatch();
  const product = useSelector(state => state.Product.Produts.find(entry => entry._id === initialProduct._id)) || initialProduct;
  const userId = useSelector(state => state.LoginAdmin.user?._id) || 'admin';
  const storageKey = 'atwabe-product-restock:' + userId + ':' + product._id;
  const [recovery] = useState(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { return null; } });
  const latest = productBatches(product).at(-1);
  const [form, setForm] = useState(() => recovery || ({ quantite: '', prix_achat: latest.prix_achat ?? '', prix_vente_base: latest.prix_vente, prix_gros_base: latest.prix_gros ?? "", frais_total: '', fournisseur: latest.fournisseur || '', note: '' }));
  const [requestId] = useState(() => recovery?.requestId || crypto.randomUUID()), [busy, setBusy] = useState(false), [pending, setPending] = useState(recovery), [error, setError] = useState('');
  const dialog = useRef(null), guard = useRef(false), locked = busy || Boolean(pending);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  const close = () => { if (!busy) onClose(); };
  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); if (guard.current) return;
    let input;
    try { input = pending || { ...form, requestId }; normalizeRestock(input); } catch (failure) { setError(apiErrorMessage(failure, t)); return; }
    guard.current = true; setBusy(true); setError(''); setPending(input); sessionStorage.setItem(storageKey, JSON.stringify(input));
    try {
      const response = await axios.post((import.meta.env.VITE_API_URL || 'http://localhost:7000') + '/Product/' + product._id + '/restocks', input, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
      sessionStorage.removeItem(storageKey); dispatch(productRestocked(response.data)); toast.success(t('productBatches.saved')); onClose();
    } catch (failure) {
      if ([400, 401, 403, 404, 409].includes(failure.response?.status)) { setPending(null); sessionStorage.removeItem(storageKey); }
      setError(apiErrorMessage(failure, t, 'productBatches.productRestockFailed'));
    } finally { guard.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="product-stock-dialog" dir={i18n.dir()} aria-labelledby="restock-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div className="batch-dialog-heading"><span className="batch-dialog-icon"><IoLayersOutline size={25} /></span><div><h2 id="restock-title">{t('productBatches.restockTitle')}</h2><p>{t('productBatches.restockHint')}</p></div></div><button type="button" onClick={close} disabled={busy} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <div className="batch-dialog-body"><div className="batch-product-banner"><ProductImage image={product.image} name={product.name} className="size-14 rounded-xl" contain /><div><h3 dir="auto">{product.name}</h3><bdi dir="ltr">{product.barcode}</bdi></div></div>
      <div className="batch-stats"><div><span>{t('productBatches.current')}</span><strong>{product.quantite}</strong></div><div><span>{t('productBatches.after')}</span><strong>{Number(product.quantite) + (Number(form.quantite) > 0 ? Number(form.quantite) : 0)}</strong></div><div><span>{t('productBatches.batches')}</span><strong>{productBatches(product).length}</strong></div></div>
      <form id="product-restock-form" onSubmit={submit}><fieldset disabled={locked} className="batch-form-grid">
        {['quantite', 'prix_achat', 'prix_vente_base', 'prix_gros_base'].map((key, index) => <label key={key} htmlFor={'restock-' + key}>{t('productBatches.' + ['quantity', 'purchase', 'retail', 'wholesale'][index])}<input id={'restock-' + key} name={key} type="number" min={key === 'quantite' ? 1 : 0} max="1000000000" step={key === 'quantite' ? 1 : '0.01'} inputMode={key === 'quantite' ? 'numeric' : 'decimal'} required={key !== 'prix_gros_base'} value={form[key]} onChange={change} autoFocus={index === 0} /></label>)}
        <label htmlFor="restock-fournisseur">{t('productBatches.supplier')}<input id="restock-fournisseur" name="fournisseur" maxLength={160} value={form.fournisseur} onChange={change} /></label>
        <label htmlFor="restock-note">{t('productBatches.note')}<input id="restock-note" name="note" maxLength={500} value={form.note} onChange={change} /></label>
      </fieldset><ProductFeesFields total={form.frais_total} quantity={form.quantite} retailPrice={form.prix_vente_base} wholesalePrice={form.prix_gros_base} onTotalChange={value => setForm(previous => ({ ...previous, frais_total: value }))} disabled={locked} />
      {pending && !busy && <p className="batch-notice" role="status">{t('productBatches.pending')}</p>}{error && <p className="batch-error" role="alert">{error}</p>}</form>
      <p className="batch-price-policy">{t("productBatches.pricePolicy")}</p>
      <ProductBatchesTable product={product} canManage />
    </div><footer><button type="button" onClick={close} disabled={busy}>{t('dialog.close')}</button><button type="submit" form="product-restock-form" data-save-restock disabled={busy}><IoAddOutline size={20} />{t(busy ? 'productBatches.saving' : pending ? 'productBatches.retry' : 'productBatches.save')}</button></footer>
  </dialog>;
}
