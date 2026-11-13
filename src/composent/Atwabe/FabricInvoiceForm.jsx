import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoAddOutline, IoCloseOutline, IoTrashOutline } from 'react-icons/io5';
import { calculateFabricSale, normalizeFabricNumber } from '../../../shared/fabricSales.js';
import { calculateFabricReduction } from '../../../shared/fabrics.js';
import { validateFabricInvoice } from '../../../shared/fabricInvoices.js';
import { createFabricInvoice, loadInvoiceCreditCustomers, fabricInvoiceError } from './fabricInvoicesApi.js';
import { loadFabricSaleClients } from './fabricsApi.js';
import useEmployeeOperations from '../../hooks/useEmployeeOperations.js';

const newLine = () => ({ key: crypto.randomUUID(), fabricId: '', colorId: '', pieceId: '', meters: '', pricingMode: 'retail', discountType: 'percent', discountValue: '' });
export default function FabricInvoiceForm({ fabrics, permissions, token, onClose, onSaved, onReload }) {
  const { t, i18n } = useTranslation(), credit = useEmployeeOperations('credit');
  const dialog = useRef(null), busyRef = useRef(false), request = useRef(null);
  const [lines, setLines] = useState([newLine()]), [mode, setMode] = useState('paid'), [paid, setPaid] = useState('0');
  const [customerId, setCustomerId] = useState(''), [isNew, setIsNew] = useState(false), [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [clients, setClients] = useState([]), [accounts, setAccounts] = useState({ loading: true, rows: [] }), [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [pending, setPending] = useState(false);
  const money = value => Number(value).toLocaleString(i18n.language === 'ar' ? 'ar-MA' : 'fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const patch = (key, value) => { setLines(current => current.map(line => line.key === key ? { ...line, ...value } : line)); setError(''); };
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  useEffect(() => { const controller = new AbortController(); loadFabricSaleClients(token, controller.signal).then(value => { if (!controller.signal.aborted) setClients(value.clients); }).catch(() => {}); return () => controller.abort(); }, [token]);
  useEffect(() => {
    if (!permissions.creditSale || !credit.addDebt) return;
    const controller = new AbortController();
    loadInvoiceCreditCustomers(token, controller.signal).then(value => { if (!controller.signal.aborted) setAccounts({ loading: false, rows: value.customers }); }).catch(() => { if (!controller.signal.aborted) setAccounts({ loading: false, rows: [], error: true }); });
    return () => controller.abort();
  }, [token, attempt, permissions.creditSale, credit.addDebt]);
  const priced = lines.map(line => {
    const fabric = fabrics.find(row => row._id === line.fabricId), color = fabric?.colors.find(row => row._id === line.colorId), piece = color?.pieces.find(row => row._id === line.pieceId);
    let sale, invalid;
    try { if (piece) { calculateFabricReduction(line.meters, piece.meters); sale = calculateFabricSale({ ...line, discountValue: line.discountValue === '' ? 0 : line.discountValue }, fabric); } } catch (failure) { invalid = failure.message; }
    return { ...line, fabric, color, piece, sale, invalid, expectedUnitPrice: fabric?.[line.pricingMode === 'wholesale' ? 'wholesalePricePerMeter' : 'salePricePerMeter'] };
  });
  const valid = priced.every(line => line.sale), total = valid ? priced.reduce((sum, line) => sum + Math.round(line.sale.total * 100), 0) / 100 : null;
  const paidValue = mode === 'paid' ? total : Number(normalizeFabricNumber(paid)), remaining = total === null || !Number.isFinite(paidValue) ? null : (Math.round(total * 100) - Math.round(paidValue * 100)) / 100;
  const close = () => { if (!busyRef.current) { dialog.current.close(); onClose(); } };
  const submit = async event => {
    event.preventDefault(); if (busyRef.current) return; let input;
    try {
      if (!valid) throw new Error(priced.find(line => line.invalid)?.invalid || 'invalidInvoice');
      input = validateFabricInvoice({ requestId: request.current?.id || crypto.randomUUID(), lines: priced, paymentMode: mode, amountPaid: paid, ...(mode === 'credit' ? isNew ? { newCustomer: customer } : { customerId } : { clientName: customer.name, phone: customer.phone }) });
      if (remaining < 0) throw new Error('invalidInvoicePayment');
    } catch (failure) { setError(fabricInvoiceError(failure, t)); return; }
    const hash = JSON.stringify({ ...input, requestId: undefined });
    if (!request.current || request.current.hash !== hash) request.current = { id: crypto.randomUUID(), hash };
    input.requestId = request.current.id; request.current.input = input; await persist(input);
  };
  const persist = async input => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError('');
    try { const result = await createFabricInvoice(input, token); onSaved(result.invoice); }
    catch (failure) { setError(fabricInvoiceError(failure, t)); if (failure.response?.data?.message === 'invoicePending' || !failure.response || failure.response.status >= 500) setPending(true); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const field = (label, id, content) => <div className="fi-field" key={id}><label htmlFor={id}>{label}</label>{content}</div>;
  return <dialog ref={dialog} className="fi-dialog fi-form" dir={i18n.dir()} aria-labelledby="fi-form-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="fi-form-title">{t('fabricInvoices.add')}</h2><p>{t('fabricInvoices.subtitle')}</p></div><button type="button" onClick={close} disabled={busy} aria-label={t('dialog.close')}><IoCloseOutline size={24} /></button></header>
    <form noValidate onSubmit={submit}><fieldset disabled={busy || pending}>
      <section className="fi-lines"><h3>{t('fabricInvoices.lines')}</h3>{priced.map((line, index) => <article className="fi-line" key={line.key} data-invoice-line={index}>
        <div className="fi-line-header"><h4>{t('fabricInvoices.line', { number: index + 1 })}</h4>{lines.length > 1 && <button type="button" onClick={() => setLines(current => current.filter(row => row.key !== line.key))}><IoTrashOutline />{t('fabricInvoices.remove')}</button>}</div>
        <div className="fi-grid fi-four">
          {field(t('fabrics.type'), 'fi-type-' + index, <select id={'fi-type-' + index} value={line.fabricId} onChange={event => patch(line.key, { fabricId: event.target.value, colorId: '', pieceId: '' })}><option value="">{t('fabrics.chooseType')}</option>{fabrics.map(row => <option key={row._id} value={row._id}>{row.type}{row.reference ? ' · ' + row.reference : ''}</option>)}</select>)}
          {field(t('fabrics.color'), 'fi-color-' + index, <select id={'fi-color-' + index} disabled={!line.fabric} value={line.colorId} onChange={event => patch(line.key, { colorId: event.target.value, pieceId: '' })}><option value="">{t('fabrics.chooseColor')}</option>{line.fabric?.colors.map(row => <option key={row._id} value={row._id}>{row.name}{row.number ? ' · ' + row.number : ''}</option>)}</select>)}
          {field(t('fabrics.sales.roll'), 'fi-piece-' + index, <select id={'fi-piece-' + index} disabled={!line.color} value={line.pieceId} onChange={event => patch(line.key, { pieceId: event.target.value })}><option value="">{t('fabrics.sales.chooseRoll')}</option>{line.color?.pieces.map(row => <option key={row._id} value={row._id} disabled={row.meters <= 0}>{row.barcode} · {row.meters} {t('fabricInvoices.meter')}</option>)}</select>)}
          {field(t('fabricInvoices.meters'), 'fi-meters-' + index, <input id={'fi-meters-' + index} inputMode="decimal" dir="ltr" maxLength={16} value={line.meters} onChange={event => patch(line.key, { meters: event.target.value })} />)}
          {field(t('fabrics.sales.pricing'), 'fi-pricing-' + index, <select id={'fi-pricing-' + index} value={line.pricingMode} onChange={event => patch(line.key, { pricingMode: event.target.value })}><option value="retail">{t('fabrics.sales.retail')}</option>{permissions.wholesale && <option value="wholesale">{t('fabrics.sales.wholesale')}</option>}</select>)}
          {permissions.discount && <>{field(t('fabrics.sales.discount'), 'fi-discount-type-' + index, <select id={'fi-discount-type-' + index} value={line.discountType} onChange={event => patch(line.key, { discountType: event.target.value, discountValue: '' })}><option value="percent">%</option><option value="amount">{t('fesla.currency')}</option></select>)}{field(t('fabrics.sales.discount'), 'fi-discount-' + index, <input id={'fi-discount-' + index} value={line.discountValue} inputMode="decimal" dir="ltr" placeholder="0" maxLength={16} onChange={event => patch(line.key, { discountValue: event.target.value })} />)}</>}
          <div className="fi-line-amount"><small>{t('fabricInvoices.price')}: {Number.isFinite(line.expectedUnitPrice) ? money(line.expectedUnitPrice) : '—'}</small><strong>{t('fabricInvoices.amount')}: {line.sale ? money(line.sale.total) : '—'} {t('fesla.currency')}</strong></div>
        </div>{line.invalid && line.meters && <p className="fi-error">{fabricInvoiceError(new Error(line.invalid), t)}</p>}
      </article>)}<button type="button" className="fi-secondary" data-add-invoice-line disabled={lines.length >= 100} onClick={() => setLines(current => [...current, newLine()])}><IoAddOutline />{t('fabricInvoices.addLine')}</button></section>
      <section className="fi-section"><h3>{t('fabricInvoices.payment')}</h3><div className="fi-mode-grid">{['paid', ...(permissions.creditSale && credit.addDebt ? ['credit'] : [])].map(value => <label key={value} className={mode === value ? 'is-selected' : ''}><input type="radio" name="fi-payment-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setError(''); }} /><span><strong>{t('fabricInvoices.' + value + 'Mode')}</strong><small>{t('fabricInvoices.' + value + 'Hint')}</small></span></label>)}</div>
        {mode === 'paid' ? <div className="fi-grid">{clients.length > 0 && field(t('fabricInvoices.savedClient'), 'fi-saved-client', <select id="fi-saved-client" defaultValue="" onChange={event => { const row = clients.find(row => row._id === event.target.value); setCustomer(current => ({ ...current, name: row?.name || '' })); }}><option value="">{t('fabricInvoices.optional')}</option>{clients.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select>)}{field(t('fabricInvoices.name') + ' · ' + t('fabricInvoices.optional'), 'fi-client-name', <input id="fi-client-name" value={customer.name} maxLength={160} onChange={event => setCustomer(current => ({ ...current, name: event.target.value }))} />)}{field(t('fabricInvoices.phone') + ' · ' + t('fabricInvoices.optional'), 'fi-client-phone', <input id="fi-client-phone" value={customer.phone} maxLength={40} dir="ltr" onChange={event => setCustomer(current => ({ ...current, phone: event.target.value }))} />)}</div>
          : <div className="fi-credit-fields">{credit.add && <button type="button" className="fi-secondary" onClick={() => setIsNew(value => !value)}>{t('fabricInvoices.' + (isNew ? 'existingCustomer' : 'newCustomer'))}</button>}{!isNew ? field(t('fabricInvoices.creditCustomer'), 'fi-credit-customer', <select id="fi-credit-customer" value={customerId} disabled={accounts.loading || accounts.error} onChange={event => setCustomerId(event.target.value)}><option value="">{t('fabricInvoices.chooseCustomer')}</option>{accounts.rows.map(row => <option key={row._id} value={row._id}>{row.name}{row.phone ? ' · ' + row.phone : ''}</option>)}</select>) : <div className="fi-grid">{['name', 'phone', 'email'].map(key => field(t('fabricInvoices.' + key) + (key === 'name' ? ' *' : ''), 'fi-new-' + key, <input key={key} id={'fi-new-' + key} value={customer[key]} maxLength={key === 'email' ? 254 : key === 'name' ? 160 : 40} onChange={event => setCustomer(current => ({ ...current, [key]: event.target.value }))} />))}</div>}{accounts.error && <p className="fi-error">{t('fabricInvoices.errors.customersFailed')} <button type="button" onClick={() => { setAccounts(current => ({ ...current, loading: true, error: false })); setAttempt(value => value + 1); }}>{t('fabrics.retry')}</button></p>}{field(t('fabricInvoices.initialPaid'), 'fi-paid', <input id="fi-paid" value={paid} disabled={!credit.payment} inputMode="decimal" maxLength={12} dir="ltr" onChange={event => setPaid(event.target.value)} />)}</div>}
      </section>
      <div className="fi-totals">{[['total', total], ['paid', paidValue], ['remaining', remaining]].map(([key, value]) => <div key={key}><span>{t('fabricInvoices.' + key)}</span><strong data-invoice-total={key} data-value={value ?? ''}>{value === null || !Number.isFinite(value) ? '—' : money(value)} {t('fesla.currency')}</strong></div>)}</div>
      {error && <p role="alert" className="fi-error">{error}</p>}
      <footer><button type="button" className="fi-secondary" onClick={onReload}>{t('fabrics.reloadStock')}</button><button type="button" className="fi-secondary" onClick={close}>{t('dialog.close')}</button><button type="submit" data-confirm-fabric-invoice className="fi-primary" disabled={!valid}>{t(busy ? 'common.loading' : 'fabricInvoices.confirm')}</button></footer>
    </fieldset></form>{pending && <div className="fi-pending-retry"><p role="alert" className="fi-error">{error}</p><button type="button" className="fi-primary" data-retry-fabric-invoice disabled={busy} onClick={() => persist(request.current.input)}>{t(busy ? 'common.loading' : 'fabricInvoices.resume')}</button></div>}
  </dialog>;
}
