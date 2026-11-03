import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoTimeOutline, IoWalletOutline } from "react-icons/io5";

export default function WorkerPayrollHistoryDialog({ worker, canPay, onRecordPayment, onClose, children }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialogRef} id="worker-payroll-history" className="work-dialog payroll-history-dialog" dir={i18n.dir()} aria-labelledby="worker-payroll-history-title" aria-describedby="worker-payroll-history-worker" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="work-dialog-header">
      <span className="work-dialog-icon" aria-hidden="true"><IoTimeOutline /></span>
      <div><h2 id="worker-payroll-history-title">{t("workers.payroll.history")}</h2><p id="worker-payroll-history-worker" className="work-dialog-worker" dir="auto">{worker.name}</p></div>
      <button type="button" data-close-payroll-history className="work-close" aria-label={t("dialog.close")} onClick={onClose} autoFocus><IoCloseOutline /></button>
    </header>
    <div className="payroll-history-dialog-body">{children}</div>
    <footer className="work-dialog-footer">
      <button type="button" className="work-button work-button-quiet" onClick={onClose}>{t("dialog.close")}</button>
      {canPay && <button type="button" data-record-worker-payment-history className="work-button work-button-blue" onClick={onRecordPayment}><IoWalletOutline />{t("workers.payroll.recordPayment")}</button>}
    </footer>
  </dialog>;
}
