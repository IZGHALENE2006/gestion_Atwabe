import axios from 'axios';
const api = `${import.meta.env.VITE_API_URL || 'http://localhost:7000'}/fabrics`;
const config = token => ({ headers: { Authorization: 'Bearer ' + token } });
export const loadFabricInvoices = async (token, signal) => (await axios.get(api + '/invoices', { ...config(token), signal })).data;
export const createFabricInvoice = async (body, token) => (await axios.post(api + '/invoices', body, config(token))).data;
export const resumeFabricInvoice = async (id, token) => (await axios.post(api + '/invoices/' + encodeURIComponent(id) + '/resume', {}, config(token))).data;
export const payFabricInvoice = async (id, body, token) => (await axios.post(api + '/invoices/' + encodeURIComponent(id) + '/payments', body, config(token))).data;
export const loadInvoiceCreditCustomers = async (token, signal) => (await axios.get(api + '/invoice-customers', { ...config(token), signal })).data;
export function fabricInvoiceError(error, t) {
  const code = error?.response?.data?.message || error?.message || 'invoiceFailed';
  if (t('fabricInvoices.errors.' + code, { defaultValue: '' })) return t('fabricInvoices.errors.' + code);
  return t('fabrics.errors.' + code, { defaultValue: t('fabricInvoices.errors.invoiceFailed') });
}
