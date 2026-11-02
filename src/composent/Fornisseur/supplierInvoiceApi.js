import axios from "axios";

const config = (signal) => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, signal });
const url = (id) => `http://localhost:7000/Fournisseur/${encodeURIComponent(id)}/invoices`;

export const getSupplierInvoices = async (id, signal) => (await axios.get(url(id), config(signal))).data;
export const addSupplierInvoice = async (id, data) => (await axios.post(url(id), data, config())).data;
export const addSupplierPayment = async (id, invoiceId, data) => (await axios.post(`${url(id)}/${encodeURIComponent(invoiceId)}/payments`, data, config())).data;

export const supplierInvoiceError = (error, t) => t(`supplierInvoices.errors.${error.response?.data?.message || error.message}`, { defaultValue: t("supplierInvoices.errors.saveFailed") });
