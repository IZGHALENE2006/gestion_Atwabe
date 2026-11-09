import axios from "axios";

const api = `${import.meta.env.VITE_API_URL || "http://localhost:7000"}/tailoring-orders`;
const headers = (token) => ({ Authorization: `Bearer ${token}` });
export const loadTailoringOrders = async (token, signal) => (await axios.get(api, { headers: headers(token), signal })).data;
export const loadTailoringPhoto = async (order, token, signal, lineId) => (await axios.get(`${api}/${encodeURIComponent(order._id)}${lineId ? `/items/${encodeURIComponent(lineId)}` : ""}/photo`, { headers: headers(token), responseType: "blob", signal })).data;
export const addTailoringPayment = async (order, amount, requestId, token) => (await axios.post(`${api}/${encodeURIComponent(order._id)}/payments`, { amount, requestId, version: order.__v }, { headers: headers(token) })).data;
export const cancelTailoringOrder = async (order, token) => (await axios.post(`${api}/${encodeURIComponent(order._id)}/cancel`, { version: order.__v }, { headers: headers(token) })).data;
export const deliverTailoringOrder = async (order, token) => (await axios.post(`${api}/${encodeURIComponent(order._id)}/deliver`, { version: order.__v }, { headers: headers(token) })).data;
export const saveTailoringOrder = async (input, selection, removeImage, token, order, requestId) => {
  const body = new FormData();
  const images = [];
  const payload = input.items ? { ...input, items: input.items.map(item => {
    const file = selection.find(entry => entry.lineId === item.lineId)?.selection?.file;
    return { ...item, ...(file ? { imageIndex: images.push(file) - 1 } : {}) };
  }) } : input;
  for (const [key, value] of Object.entries(payload)) body.append(key, ["sfifa", "items", "measurements"].includes(key) ? JSON.stringify(value) : value ?? "");
  for (const image of images) body.append("images", image);
  if (!input.items && selection?.file) body.append("image", selection.file);
  if (order) { body.append("version", String(order.__v)); body.append("removeImage", String(removeImage)); }
  else body.append("requestId", requestId);
  return (order ? await axios.put(`${api}/${encodeURIComponent(order._id)}`, body, { headers: headers(token) }) : await axios.post(api, body, { headers: headers(token) })).data;
};

export const loadTailoringTracking = async (token, signal) => (await axios.get(api + "/work-status", { headers: headers(token), signal })).data;

export const loadDjellabaCostSettings = async (token, signal, garmentType = "djellaba") => (await axios.get(api + "/cost-settings", { headers: headers(token), signal, params: garmentType !== "djellaba" ? { garment: garmentType } : undefined })).data;
export const saveDjellabaCostSettings = async (rates, version, token, garmentType = "djellaba") => (await axios.put(api + "/cost-settings", { rates, version }, { headers: headers(token), params: garmentType !== "djellaba" ? { garment: garmentType } : undefined })).data;
