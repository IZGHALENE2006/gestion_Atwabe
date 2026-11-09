import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoTrashOutline } from "react-icons/io5";
import { deleteTailoringWorker, loadTailoringWorkers } from "./workersApi.js";

export default function WorkerDeleteDialog({ worker, token, onClose, onSaved, onReload }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null), busyRef = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  const close = () => { if (!busyRef.current) onClose(); };
  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { const saved = await deleteTailoringWorker(token, worker); if (dialogRef.current?.open) onSaved(saved); }
    catch (failure) {
      const code = failure.response?.data?.message;
      if (dialogRef.current?.open) setError(["conflict", "notFound", "forbidden"].includes(code) ? code : "deleteFailed");
    } finally { busyRef.current = false; if (dialogRef.current?.open) setBusy(false); }
  }
  async function reload() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { const data = await loadTailoringWorkers(token); if (dialogRef.current?.open) { setError(""); onReload(data); } }
    catch { if (dialogRef.current?.open) setError("loadFailed"); }
    finally { busyRef.current = false; if (dialogRef.current?.open) setBusy(false); }
  }
  return <dialog ref={dialogRef} className="work-dialog worker-delete-dialog" dir={i18n.dir()} aria-labelledby="worker-delete-title" aria-describedby="worker-delete-hint" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="work-dialog-header"><span className="work-dialog-icon" aria-hidden="true"><IoTrashOutline /></span><div><h2 id="worker-delete-title">{t("workers.removal.title")}</h2><p className="work-dialog-worker" dir="auto">{worker.name}</p></div><button type="button" disabled={busy} className="work-close" onClick={close} aria-label={t("dialog.close")} autoFocus><IoCloseOutline /></button></header>
    <form onSubmit={submit}><div className="work-dialog-body"><p className="work-action-delete-copy" id="worker-delete-hint">{t("workers.removal.confirm")}</p><p className="worker-removal-note">{t("workers.removal.historyHint")}</p>{error && <div role="alert" className="work-feedback work-feedback-error"><p>{t(`workers.errors.${error}`)}</p>{["conflict", "loadFailed", "notFound"].includes(error) && <button type="button" disabled={busy} className="work-text-button" data-reload-workers onClick={reload}>{t("workers.retry")}</button>}</div>}</div><footer className="work-dialog-footer"><button type="button" className="work-button work-button-quiet" disabled={busy} onClick={close}>{t("common.cancel")}</button><button type="submit" className="work-button work-button-red-quiet" data-confirm-delete-worker disabled={busy}><IoTrashOutline aria-hidden="true" />{t(busy ? "common.loading" : "workers.removal.title")}</button></footer></form>
  </dialog>;
}
