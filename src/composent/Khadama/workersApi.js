import axios from "axios";

const api = `${import.meta.env.VITE_API_URL || "http://localhost:7000"}/tailoring-workers`;
const headers = token => ({ Authorization: `Bearer ${token}` });
export const loadTailoringWorkers = async (token, signal) => (await axios.get(api, { headers: headers(token), signal })).data;
export const saveTailoringWorker = async (input, token, requestId, worker) => (worker
  ? await axios.put(`${api}/${encodeURIComponent(worker._id)}`, { ...input, version: worker.__v }, { headers: headers(token) })
  : await axios.post(api, { ...input, requestId }, { headers: headers(token) })).data;
export const loadWorkerWork = async (token, workerId, category, signal) => (await axios.get(`${api}/${encodeURIComponent(workerId)}/work`, { params: { category }, headers: headers(token), signal })).data;
export const loadWorkerOrderOptions = async (token, workerId, category, signal, garmentType) => (await axios.get(`${api}/${encodeURIComponent(workerId)}/work/orders`, { params: { category, ...(garmentType ? { garmentType } : {}) }, headers: headers(token), signal })).data;
export const assignWorkerWork = async (token, workerId, input, requestId) => (await axios.post(`${api}/${encodeURIComponent(workerId)}/work`, { ...input, requestId }, { headers: headers(token) })).data;
export const completeWorkerWork = async (token, workerId, work, quantity, requestId) => (await axios.post(`${api}/${encodeURIComponent(workerId)}/work/${encodeURIComponent(work._id)}/completions`, { quantity, requestId, version: work.__v }, { headers: headers(token) })).data;
export const increaseWorkerWork = async (token, workerId, work, input, requestId) => (await axios.post(`${api}/${encodeURIComponent(workerId)}/work/${encodeURIComponent(work._id)}/increases`, { ...input, requestId, version: work.__v }, { headers: headers(token) })).data;
export const deleteWorkerWork = async (token, workerId, work) => (await axios.delete(`${api}/${encodeURIComponent(workerId)}/work/${encodeURIComponent(work._id)}`, { data: { version: work.__v }, headers: headers(token) })).data;
