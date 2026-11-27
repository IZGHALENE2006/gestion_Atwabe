import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import Quagga from 'quagga';
import toast from 'react-hot-toast';
import { IoCameraOutline, IoCloseOutline } from 'react-icons/io5';
import useEmployeeOperations from '../../hooks/useEmployeeOperations.js';
import { apiErrorMessage } from '../../i18n/apiErrors.js';
import { AddCreditLine, AddCreditPayment, UpdateUserCridite } from '../../slices/SliceCridite.jsx';
import { CREDIT_CUSTOMER_FIELDS, validateCreditCustomerProfile } from '../../../shared/creditCustomerProfile.js';
import './creditDocuments.css';
import './creditCustomerActions.css';

const api = import.meta.env.VITE_API_URL || 'http://localhost:7000';
const initialLine = { mode: 'stock', productId: '', nom: '', prix: '', Quantite: 1, Paiement: 0 };

// The list and details page use the same inputs, validation and receipt flow.
export default function CreditCustomerActionDialog({ userId, mode, onClose, onSaved }) {
  const { t, i18n } = useTranslation(), dispatch = useDispatch(), operations = useEmployeeOperations('credit');
  const dialogRef = useRef(null), scannerRef = useRef(null), savingRef = useRef(false), requestRef = useRef(null);
  const [account, setAccount] = useState({ user: null, loading: true, error: '' }), [attempt, setAttempt] = useState(0);
  const [products, setProducts] = useState({ rows: [], loading: mode === 'debt', error: false });
  const [line, setLine] = useState(initialLine), [payment, setPayment] = useState({ amount: '', note: '' });
  const [profile, setProfile] = useState({ name: '', cin: '', phone: '', email: '' });
  const [barcode, setBarcode] = useState(''), [scanning, setScanning] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const allowed = operations[mode === 'debt' ? 'addDebt' : mode === 'payment' ? 'payment' : 'update'];
  const ready = allowed && !account.loading && !account.error && account.user?._id === userId;
  const title = mode === 'debt' ? 'creditDetails.addCreditLine' : mode === 'payment' ? 'creditDetails.registerPayment' : 'creditList.editInfo';
  const close = () => { if (!savingRef.current) { dialogRef.current.close(); onClose(); } };
  const selectedProduct = products.rows.find(product => product._id === line.productId);
  const money = amount => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); return () => dialog.close(); }, []);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController(), config = { signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
    axios.get(`${api}/usercridite/get/${encodeURIComponent(userId)}`, config).then(({ data }) => {
      if (String(data?._id) !== String(userId)) throw Error('User not found');
      if (!controller.signal.aborted) {
        setAccount({ user: data, loading: false, error: '' });
        setProfile(Object.fromEntries(CREDIT_CUSTOMER_FIELDS.map(key => [key, data[key] || ''])));
      }
    }).catch(error => { if (!controller.signal.aborted) setAccount({ user: null, loading: false, error: apiErrorMessage(error, t, 'creditList.loadFailed') }); });
    if (mode === 'debt') axios.get(`${api}/Product/Get`, config).then(({ data }) => {
      if (!Array.isArray(data)) throw Error('Invalid products');
      if (!controller.signal.aborted) setProducts({ rows: data, loading: false, error: false });
    }).catch(() => { if (!controller.signal.aborted) setProducts({ rows: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [userId, mode, attempt, allowed, t]);

  const lookup = useCallback((value) => {
    const found = products.rows.find(product => String(product.barcode || '').trim() === String(value || '').trim());
    if (!found) { toast.error(t('creditDetails.barcodeNotFound')); return; }
    setLine(current => ({ ...current, productId: found._id }));
    setBarcode(value); setScanning(false);
  }, [products.rows, t]);
  useEffect(() => {
    if (!scanning) return;
    let active = true;
    const detected = result => { if (active && result?.codeResult?.code) lookup(result.codeResult.code); };
    Quagga.init({ inputStream: { type: 'LiveStream', target: scannerRef.current, constraints: { facingMode: 'environment' } }, decoder: { readers: ['ean_reader', 'code_128_reader', 'code_39_reader'] }, locate: true }, error => {
      if (!active) return;
      if (error) { toast.error(t('creditDetails.cameraError')); setScanning(false); } else Quagga.start();
    });
    Quagga.onDetected(detected);
    return () => { active = false; try { Quagga.offDetected(detected); Quagga.stop(); } catch { /* Camera already stopped. */ } };
  }, [scanning, lookup, t]);

  const retry = () => { if (savingRef.current) return; setAccount({ user: null, loading: true, error: '' }); setError(''); setAttempt(value => value + 1); };
  const submit = async event => {
    event.preventDefault();
    if (!ready || savingRef.current) return;
    let payload;
    try {
      if (mode === 'edit') payload = { ...validateCreditCustomerProfile(profile), version: account.user.__v ?? 0 };
      else if (mode === 'payment') {
        const amount = Number(payment.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw Error(t('creditDetails.paymentGreaterThanZero'));
        if (amount > account.user.summary.remaining) throw Error(t('errors.paymentExceeded', { amount: money(account.user.summary.remaining) }));
        payload = { amount, note: payment.note.trim() };
      } else {
        const stock = line.mode === 'stock';
        if (stock && (!selectedProduct || products.loading || products.error)) throw Error(t('creditDetails.chooseStockProduct'));
        const nom = stock ? selectedProduct.name : line.nom.trim(), prix = Number(stock ? selectedProduct.prix_vente : line.prix), Quantite = Number(line.Quantite), Paiement = operations.payment ? Number(line.Paiement) : 0;
        if (!nom) throw Error(t('creditDetails.productNameRequired'));
        if (!Number.isFinite(prix) || prix <= 0) throw Error(t('creditDetails.priceGreaterThanZero'));
        if (!Number.isSafeInteger(Quantite) || Quantite < 1) throw Error(t('creditList.invalidQuantity'));
        if (!Number.isFinite(Paiement) || Paiement < 0 || Paiement > prix * Quantite) throw Error(t('creditDetails.initialPaymentExceeded'));
        payload = { nom, prix, Quantite, Paiement };
      }
    } catch (error) { setError(error.message === 'creditCustomerProfileInvalid' ? t('creditList.invalidProfile') : error.message); return; }
    if (mode !== 'edit') {
      const fingerprint = JSON.stringify(payload);
      if (requestRef.current?.fingerprint !== fingerprint) requestRef.current = { fingerprint, requestId: crypto.randomUUID() };
      payload.requestId = requestRef.current.requestId;
    }
    savingRef.current = true; setSaving(true); setError('');
    try {
      const action = mode === 'edit' ? UpdateUserCridite : mode === 'payment' ? AddCreditPayment : AddCreditLine;
      const result = await dispatch(action({ userId, payload })).unwrap();
      toast.success(t(mode === 'edit' ? 'creditList.updated' : mode === 'payment' ? 'creditDetails.paymentSaved' : 'creditDetails.creditLineAdded'));
      onSaved(mode === 'edit' ? { user: result } : result);
    } catch (error) { setError(apiErrorMessage(error, t, mode === 'edit' ? 'creditList.updateFailed' : mode === 'payment' ? 'creditDetails.failedSavePayment' : 'creditDetails.failedToAddCreditLine')); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const setLineField = (key, value) => setLine(current => ({ ...current, [key]: value }));

  return <dialog ref={dialogRef} dir={i18n.dir()} className="credit-document-dialog credit-customer-action-dialog" data-credit-customer-action={mode} aria-labelledby="credit-customer-action-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="credit-customer-action-title">{t(title)}</h2><button type="button" data-close-credit-action disabled={saving} onClick={close} aria-label={t('creditDocuments.close')}><IoCloseOutline size={23} /></button></header>
    <form onSubmit={submit} className="credit-customer-action-form">
      <div className="credit-document-body credit-customer-action-body">
        {!allowed ? <p role="alert">{t('employeePermissions.denied')}</p> : account.loading ? <p role="status">{t('common.loading')}</p> : account.error ? <div role="alert"><p>{account.error}</p><button type="button" data-retry-credit-action onClick={retry}>{t('employeePermissions.retry')}</button></div> : <>
          <div className="credit-customer-action-owner"><strong dir="auto" data-credit-action-owner>{account.user.name}</strong><span>{t('creditDetails.remaining')}: <bdi>{money(account.user.summary?.remaining)} {t('fesla.currency')}</bdi></span></div>
          <fieldset disabled={saving}>
            {mode === 'edit' ? <div className="credit-customer-action-grid">{CREDIT_CUSTOMER_FIELDS.map(key => <label key={key} htmlFor={'credit-profile-' + key}>{t('creditAddClient.' + ({ name: 'fullName', cin: 'idNumberCin', phone: 'phoneNumber', email: 'emailAddress' }[key]))}<input id={'credit-profile-' + key} data-credit-profile={key} required={key === 'name'} type={key === 'phone' ? 'tel' : key === 'email' ? 'email' : 'text'} dir={['phone', 'email', 'cin'].includes(key) ? 'ltr' : 'auto'} maxLength={key === 'name' ? 160 : key === 'email' ? 254 : 40} value={profile[key]} onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div> : mode === 'payment' ? <>
              <label htmlFor="credit-payment-amount">{t('creditDetails.amount')}<input id="credit-payment-amount" data-credit-payment-amount type="number" required min="0.01" max={account.user.summary?.remaining} step="0.01" value={payment.amount} onChange={event => setPayment(current => ({ ...current, amount: event.target.value }))} /></label>
              <label htmlFor="credit-payment-note">{t('creditDetails.noteOptional')}<textarea id="credit-payment-note" value={payment.note} rows={3} onChange={event => setPayment(current => ({ ...current, note: event.target.value }))} /></label>
            </> : <>
              <div className="credit-customer-action-modes" role="group" aria-label={t('creditDetails.product')}>{['stock', 'manual'].map(value => <button type="button" key={value} data-credit-entry-mode={value} aria-pressed={line.mode === value} onClick={() => { setLineField('mode', value); setScanning(false); }}>{t(value === 'stock' ? 'creditDetails.fromStock' : 'creditDetails.manual')}</button>)}</div>
              {line.mode === 'stock' ? <>
                <div className="credit-customer-action-barcode"><input data-credit-barcode aria-label={t('creditDetails.scanOrTypeBarcode')} placeholder={t('creditDetails.scanOrTypeBarcode')} dir="ltr" value={barcode} onChange={event => setBarcode(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); lookup(barcode); } }} /><button type="button" onClick={() => lookup(barcode)}>{t('creditDetails.find')}</button><button type="button" onClick={() => setScanning(value => !value)} aria-label={t('creditDetails.scan')}><IoCameraOutline size={20} /></button></div>
                {scanning && <div ref={scannerRef} className="credit-customer-action-scanner" />}
                {products.error && <p role="alert">{t('creditList.productsFailed')}</p>}
                <label htmlFor="credit-entry-product">{t('creditDetails.chooseProduct')}<select id="credit-entry-product" data-credit-entry-product required disabled={products.loading || products.error} value={line.productId} onChange={event => setLineField('productId', event.target.value)}><option value="">{t(products.loading ? 'common.loading' : 'creditDetails.chooseProduct')}</option>{products.rows.map(product => <option key={product._id} value={product._id}>{product.name} — {money(product.prix_vente)}</option>)}</select></label>
              </> : <div className="credit-customer-action-grid"><label htmlFor="credit-entry-name">{t('creditDetails.productName')}<input id="credit-entry-name" data-credit-entry-name required value={line.nom} onChange={event => setLineField('nom', event.target.value)} /></label><label htmlFor="credit-entry-price">{t('creditDetails.unitPrice')}<input id="credit-entry-price" data-credit-entry-price type="number" required min="0.01" step="0.01" value={line.prix} onChange={event => setLineField('prix', event.target.value)} /></label></div>}
              <div className="credit-customer-action-grid"><label htmlFor="credit-entry-quantity">{t('creditDetails.qty')}<input id="credit-entry-quantity" data-credit-entry-quantity type="number" required min="1" step="1" value={line.Quantite} onChange={event => setLineField('Quantite', event.target.value)} /></label><label htmlFor="credit-entry-paid">{t('creditDetails.initialPayment')}<input id="credit-entry-paid" data-credit-entry-paid disabled={!operations.payment} type="number" min="0" step="0.01" value={operations.payment ? line.Paiement : 0} onChange={event => setLineField('Paiement', event.target.value)} /></label></div>
              {selectedProduct && line.mode === 'stock' && <p>{t('creditDetails.selectedProduct', { name: selectedProduct.name, price: money(selectedProduct.prix_vente) })}</p>}
            </>}
          </fieldset>
        </>}
        {error && <div role="alert" data-credit-action-error className="credit-customer-action-error"><p>{error}</p>{mode === 'edit' && <button type="button" disabled={saving} onClick={retry}>{t('creditList.reloadInfo')}</button>}</div>}
      </div>
      <footer><button type="button" disabled={saving} onClick={close}>{t('common.cancel')}</button><button type="submit" data-submit-credit-action disabled={!ready || saving || mode === 'debt' && line.mode === 'stock' && (products.loading || products.error)}>{t(saving ? 'creditAddClient.saving' : mode === 'edit' ? 'clients.update' : mode === 'payment' ? 'creditDetails.savePayment' : 'creditDetails.saveCreditLine')}</button></footer>
    </form>
  </dialog>;
}
