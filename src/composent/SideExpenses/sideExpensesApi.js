import axios from 'axios';
const api = `${import.meta.env.VITE_API_URL || 'http://localhost:7000'}/side-expenses`;
const headers = token => ({ Authorization: `Bearer ${token}` });
export const loadSideExpenses = async (token, signal) => (await axios.get(api, { headers: headers(token), signal })).data;
export const saveSideExpense = async (input, token) => (await axios.post(api, input, { headers: headers(token) })).data;

// Keep the original request after a lost response, including across refreshes.
const pendingKey = token => `side-expense-pending:${token}`;
export function readPendingExpense(token) {
  try { return JSON.parse(sessionStorage.getItem(pendingKey(token)) || 'null'); }
  catch { return null; }
}
export const keepPendingExpense = (token, input) => sessionStorage.setItem(pendingKey(token), JSON.stringify(input));
export const clearPendingExpense = token => { try { sessionStorage.removeItem(pendingKey(token)); } catch { /* A confirmed response can still be displayed if browser storage is unavailable. */ } };
