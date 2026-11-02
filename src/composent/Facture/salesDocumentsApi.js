import axios from "axios";

const api = `${import.meta.env.VITE_API_URL || "http://localhost:7000"}/sales-documents`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
export const loadSalesDocuments = async (signal) => (await axios.get(api, { headers: headers(), signal })).data;
export const saveSalesDocument = async (data) => (await axios.post(api, data, { headers: headers() })).data;
