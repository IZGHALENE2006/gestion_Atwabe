import { useEffect, useState } from "react";
import { loadInvoiceSettings } from "./invoiceSettingsApi.js";

export function useInvoiceSettings(active = true) {
  const [result, setResult] = useState({ settings: null, error: "", loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    loadInvoiceSettings(controller.signal).then((settings) => {
      if (!controller.signal.aborted) setResult({ settings, loading: false, error: "" });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ settings: null, loading: false, error: "loadFailed" });
    });
    return () => controller.abort();
  }, [active, attempt]);
  const retry = () => {
    setResult({ settings: null, error: "", loading: true });
    setAttempt((value) => value + 1);
  };
  return { ...result, retry };
}
