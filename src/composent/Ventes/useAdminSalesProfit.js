import { useEffect, useState } from 'react';
import axios from 'axios';

export default function useAdminSalesProfit(token, role) {
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const state = result?.token === token && result.attempt === attempt ? result : { loading: true, sales: [], employees: [] };
  useEffect(() => {
    if (!token || role !== 'admin') return;
    const controller = new AbortController();
    axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:7000'}/Employe/profit-summary`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).then(({ data }) => {
      if (!Array.isArray(data.sales) || !Array.isArray(data.employees)) throw new Error('Invalid profit report');
      if (!controller.signal.aborted) setResult({ ...data, token, attempt, loading: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ token, attempt, loading: false, error: true, sales: [], employees: [] }); });
    return () => controller.abort();
  }, [token, role, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
