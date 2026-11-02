import { useEffect, useState } from "react";
import { loadSalesDocuments } from "./salesDocumentsApi.js";

export function useSalesDocuments(token, active) {
  const [state, setState] = useState({ token: null, documents: [], loading: true, error: false });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!token || !active) return;
    const controller = new AbortController();
    loadSalesDocuments(controller.signal).then((documents) => {
      if (!Array.isArray(documents)) throw new Error("Invalid documents response");
      if (!controller.signal.aborted) setState({ token, documents, loading: false, error: false });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ token, documents: [], loading: false, error: true });
    });
    return () => controller.abort();
  }, [token, active, version]);
  const current = state.token === token ? state : { documents: [], loading: true, error: false };
  const retry = () => { setState((value) => ({ ...value, loading: true, error: false })); setVersion((value) => value + 1); };
  return { ...current, retry };
}
