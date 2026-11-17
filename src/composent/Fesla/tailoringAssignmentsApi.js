import axios from 'axios';
const api = `${import.meta.env.VITE_API_URL || 'http://localhost:7000'}/tailoring-orders`;
const headers = token => ({ Authorization: `Bearer ${token}` });
const orderPath = orderId => api + '/' + encodeURIComponent(orderId);
export const loadOrderAssignmentWorkers = async (token, orderId, signal) => (await axios.get(orderPath(orderId) + '/assignment-workers', { headers: headers(token), signal })).data;
export const loadOrderAssignmentOptions = async (token, orderId, workerId, category, signal, garmentType) => (await axios.get(orderPath(orderId) + '/assignment-options', { headers: headers(token), signal, params: { workerId, category, garmentType } })).data;
export const assignTailoringOrderWork = async (token, orderId, workerId, input, requestId) => (await axios.post(orderPath(orderId) + '/assignments', { ...input, workerId, requestId }, { headers: headers(token) })).data;
