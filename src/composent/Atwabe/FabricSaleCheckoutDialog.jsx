import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCashOutline, IoWalletOutline, IoPersonAddOutline, IoCloseOutline } from 'react-icons/io5';
import useEmployeeOperations from '../../hooks/useEmployeeOperations.js';
import { validateFabricInvoice } from '../../../shared/fabricInvoices.js';
import { loadFabricCreditSaleCustomers, sellFabricOnCredit, sellFabricPiece } from './fabricsApi.js';
import { fabricInvoiceError } from './fabricInvoicesApi.js';
import '../La Caisse/checkout.css';

export default function FabricSaleCheckoutDialog({ snapshot, recovery, storageKey, token, permissions, onClose, onSold }) {
  const { t, i18n } = useTranslation(), credit = useEmployeeOperations('credit');
  const dialog = useRef(null), busyRef = useRef(false);
  const [pending, setPending] = useState(recovery?.pending || null), [mode, setMode] = useState(recovery?.pending?.mode || 'choose');
  const [customerMode, setCustomerMode] = useState(recovery?.pending?.body?.newCustomer ? 'new' : 'existing');
  const [customerId, setCustomerId] = useState(recovery?.pending?.body?.customerId || '');
  const [customer, setCustomer] = useState(recovery?.pending?.body?.newCustomer || { name: '', phone: '', cin: '', email: '' });
  const [amountPaid, setAmountPaid] = useState(recovery?.pending?.body?.amountPaid ?? '');
  const [customers, setCustomers] = useState({ rows: [], loading: true, error: false }), [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const creditAllowed = permissions.sell && permissions.creditSale && credit.addDebt;
  const locked = busy || Boolean(pending), allowed = mode === 'cash' ? permissions.sell : mode === 'credit' && creditAllowed;
  const money = value => new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const paid = pending?.mode === 'credit' ? Number(pending.body.amountPaid) : credit.payment ? Number(amountPaid || 0) : 0;
  const invalidPaid = !Number.isFinite(paid) || paid < 0 || Math.round(paid * 100) > Math.round(snapshot.total * 100);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  useEffect(() => {
    if (mode !== 'credit' || !creditAllowed) return;
    const controller = new AbortController();
    loadFabricCreditSaleCustomers(token, controller.signal).then(data => {
      if (!Array.isArray(data.customers)) throw Error('Invalid customers');
      if (!controller.signal.aborted) setCustomers({ rows: data.customers, loading: false, error: false });
    }).catch(() => { if (!controller.signal.aborted) setCustomers({ rows: [], loading: false, error: true }); });
    return () => controller.abort();
  }, [mode, token, creditAllowed, attempt]);
  const close = () => { if (!busyRef.current && (!pending || !allowed)) { dialog.current.close(); onClose(); } };
  const clearPending = () => { try { sessionStorage.removeItem(storageKey); } catch { /* The in-memory request remains usable. */ } setPending(null); };
  const submit = async event => {
    event.preventDefault();
    if (busyRef.current || !allowed) return;
    let operation = pending;
    if (!operation) {
      const requestId = crypto.randomUUID();
      if (mode === 'credit') {
        if (invalidPaid || customerMode === 'existing' && !customerId) { setError(t(invalidPaid ? 'creditCheckout.paymentInvalid' : 'creditCheckout.customerRequired')); return; }
        try {
          const body = validateFabricInvoice({ requestId, paymentMode: 'credit', amountPaid: credit.payment ? amountPaid || 0 : 0,
            lines: [{ fabricId: snapshot.match.fabric._id, colorId: snapshot.match.color._id, pieceId: snapshot.match.piece._id, meters: snapshot.input.meters, pricingMode: snapshot.input.pricingMode, discountType: snapshot.input.discountType, discountValue: snapshot.input.discountValue, expectedUnitPrice: snapshot.unitPrice }],
            ...(customerMode === 'new' ? { newCustomer: customer } : { customerId }) });
          operation = { mode, requestId, body };
        } catch (failure) { setError(fabricInvoiceError(failure, t)); return; }
      } else operation = { mode, requestId };
    }
    busyRef.current = true; setBusy(true); setError(''); setPending(operation);
    // Persist the exact payload before sending so a lost response or refresh
    // can only resume this sale, rather than create another debit or payment.
    try { sessionStorage.setItem(storageKey, JSON.stringify({ snapshot, pending: operation })); } catch { /* Retry still uses the in-memory payload. */ }
    try {
      const result = operation.mode === 'credit' ? await sellFabricOnCredit(operation.body, token) : await sellFabricPiece(snapshot.match, snapshot.input, operation.requestId, token);
      clearPending(); onSold(result);
    } catch (failure) {
      const status = failure.response?.status, code = failure.response?.data?.message;
      if ([400, 401, 403, 404].includes(status) || status === 409 && ['invoiceCancelled', 'invoicePriceChanged', 'invoiceCustomerExists', 'insufficientMeters', 'notFound', 'conflict', 'clientUnavailable'].includes(code)) clearPending();
      setError(operation.mode === 'credit' ? fabricInvoiceError(failure, t) : t('fabrics.errors.' + code, { defaultValue: t('fabrics.errors.saleFailed') }));
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="checkout-dialog" dir={i18n.dir()} data-fabric-sale-checkout aria-labelledby="fabric-sale-checkout-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="fabric-sale-checkout-title">{t(mode === 'choose' ? 'creditCheckout.title' : 'creditCheckout.' + mode)}</h2><p dir="auto">{snapshot.description}</p></div><button type="button" disabled={locked && allowed} onClick={close} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <form noValidate onSubmit={submit}><div className="checkout-body">
      <div className="checkout-summary"><div><span>{t('creditCheckout.total')}</span><strong data-fabric-checkout-total data-value={snapshot.total}>{money(snapshot.total)} {t('fesla.currency')}</strong></div>{mode === 'credit' && <div><span>{t('creditCheckout.remaining')}</span><strong data-fabric-checkout-remaining data-value={snapshot.total - (invalidPaid ? 0 : paid)}>{money(Math.max(0, snapshot.total - (invalidPaid ? 0 : paid)))} {t('fesla.currency')}</strong></div>}</div>
      <p className="checkout-muted" style={{ margin: '14px 0' }}><bdi>{snapshot.input.meters} {t('fabricInvoices.meter')}</bdi> · <bdi dir="ltr">{snapshot.match.piece.barcode}</bdi></p>
      {mode === 'choose' ? <div className="checkout-options"><button type="button" data-fabric-checkout-mode="cash" disabled={!permissions.sell} onClick={() => setMode('cash')}><IoCashOutline size={36} /><strong>{t('creditCheckout.cash')}</strong><span>{t('creditCheckout.cashHint')}</span></button><button type="button" data-fabric-checkout-mode="credit" disabled={!creditAllowed} onClick={() => setMode('credit')}><IoWalletOutline size={36} /><strong>{t('creditCheckout.credit')}</strong><span>{t(creditAllowed ? 'creditCheckout.creditHint' : 'creditAudit.accessDenied')}</span></button></div> : <>
        {pending && <p role="status" className="checkout-notice">{t(busy ? 'creditCheckout.saving' : 'creditCheckout.pending')}</p>}
        {mode === 'cash' ? <p className="checkout-muted">{t('creditCheckout.cashHint')}</p> : <fieldset disabled={locked} className="checkout-fields">
          <div className="checkout-customer-tabs"><button type="button" data-fabric-credit-customer-mode="existing" aria-pressed={customerMode === 'existing'} onClick={() => setCustomerMode('existing')}>{t('creditCheckout.existing')}</button><button type="button" data-fabric-credit-customer-mode="new" disabled={!credit.add} aria-pressed={customerMode === 'new'} onClick={() => setCustomerMode('new')}><IoPersonAddOutline size={19} />{t('creditCheckout.new')}</button></div>
          {customerMode === 'existing' ? <>
            {customers.loading && <p role="status">{t('common.loading')}</p>}
            {customers.error && <div role="alert" className="checkout-error"><p>{t('creditCheckout.loadFailed')}</p><button type="button" onClick={() => { setCustomers(current => ({ ...current, loading: true, error: false })); setAttempt(value => value + 1); }}>{t('creditCheckout.retryLoad')}</button></div>}
            <label className="checkout-field" htmlFor="fabric-credit-customer">{t('creditCheckout.customer')}<select id="fabric-credit-customer" disabled={customers.loading || customers.error} value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">{t('creditCheckout.chooseCustomer')}</option>{pending?.body?.customerId && !customers.rows.some(row => row._id === pending.body.customerId) && <option value={pending.body.customerId}>{t('creditCheckout.selectedCustomer')}</option>}{customers.rows.map(row => <option key={row._id} value={row._id}>{row.name}{row.phone ? ' · ' + row.phone : ''}</option>)}</select></label>
            {!customers.loading && !customers.error && !customers.rows.length && <p className="checkout-muted">{t('creditCheckout.empty')}</p>}
          </> : <div className="checkout-customer-form">{[['name', 'text', 160], ['phone', 'tel', 40], ['cin', 'text', 80], ['email', 'email', 254]].map(([key, type, limit]) => <label className="checkout-field" key={key} htmlFor={'fabric-credit-new-' + key}>{t('creditCheckout.' + key)}{key === 'name' && ' *'}<input id={'fabric-credit-new-' + key} type={type} maxLength={limit} dir={['phone', 'email', 'cin'].includes(key) ? 'ltr' : 'auto'} value={customer[key]} onChange={event => setCustomer(current => ({ ...current, [key]: event.target.value }))} /></label>)}<p className="checkout-muted">{t('creditCheckout.newHint')}</p></div>}
          <label className="checkout-field" htmlFor="fabric-credit-paid">{t('creditCheckout.initialPaid')}<input id="fabric-credit-paid" disabled={!credit.payment} inputMode="decimal" type="number" min="0" max={snapshot.total} step="0.01" value={pending?.mode === 'credit' ? pending.body.amountPaid : credit.payment ? amountPaid : 0} onChange={event => setAmountPaid(event.target.value)} /></label>
          {invalidPaid && <p role="alert" className="checkout-error">{t('creditCheckout.paymentInvalid')}</p>}
        </fieldset>}
      </>}
      {mode === 'credit' && !creditAllowed && <p role="alert" className="checkout-error">{t('creditAudit.accessDenied')}</p>}
      {error && <p role="alert" className="checkout-error" data-fabric-checkout-error>{error}</p>}
    </div><footer><button type="button" disabled={locked && allowed} onClick={mode === 'choose' || !allowed ? close : () => { setMode('choose'); setError(''); }}>{t(mode === 'choose' ? 'common.cancel' : 'creditCheckout.back')}</button>{mode !== 'choose' && <button type="submit" data-confirm-fabric-checkout disabled={busy || !allowed || !pending && mode === 'credit' && (invalidPaid || customerMode === 'existing' && (!customerId || customers.loading || customers.error))}>{t(busy ? 'creditCheckout.saving' : pending ? 'creditCheckout.resume' : mode === 'cash' ? 'cashier.confirmSale' : 'creditCheckout.confirmCredit')}</button>}</footer></form>
  </dialog>;
}
