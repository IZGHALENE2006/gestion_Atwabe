import axios from "axios";

const api = `${import.meta.env.VITE_API_URL || "http://localhost:7000"}/sfifa-stock`;
const headers = token => ({ Authorization: `Bearer ${token}` });
export const loadSfifaStock = async (token, signal) => (await axios.get(api, { headers: headers(token), signal })).data;
export const saveSfifaStock = async (input, token, requestId, stock) => {
  if (!stock) return (await axios.post(api, { ...input, requestId }, { headers: headers(token) })).data;
  const path = stock.isUnassigned ? `${api}/${encodeURIComponent(stock.parentId)}` : `${api}/${encodeURIComponent(stock.parentId)}/variants/${encodeURIComponent(stock._id)}`;
  return (await axios.put(path, { quantity: input.quantity, version: stock.__v, ...(stock.isUnassigned ? { code: input.code } : {}) }, { headers: headers(token) })).data;
};

const stockPath = stock => api + "/" + encodeURIComponent(stock.parentId) + (stock.isUnassigned ? "" : "/variants/" + encodeURIComponent(stock._id));
export const restockSfifaStock = async (stock, quantity, requestId, token) => (await axios.post(stockPath(stock) + "/restock", { quantity, requestId }, { headers: headers(token) })).data;
export const deleteSfifaStock = async (stock, token) => (await axios.delete(stockPath(stock), { data: { version: stock.__v }, headers: headers(token) })).data;

export const loadSfifaRestocks = async (stock, token, signal) => (await axios.get(stockPath(stock) + "/history", { headers: headers(token), signal })).data;
