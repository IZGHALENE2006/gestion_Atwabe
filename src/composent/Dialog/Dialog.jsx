import { useEffect } from "react";
import "./Dialog.css";
import { useTranslation } from "react-i18next";

const Dialog = ({ isOpen, onClose, title, children, width, bgcolor }) => {
  const { t } = useTranslation();
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog"
        style={{ width, backgroundColor: bgcolor === '#ffffff' || bgcolor === 'white' ? 'var(--color-white, #f9fafb)' : bgcolor }}
        role="dialog"
        aria-modal="true"
        aria-label={title || t("dialog.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h3 className="tracking-wide font-semibold text-xl">{title || t("dialog.title")}</h3>
          <button className="close-btn scale-150" onClick={onClose} aria-label={t("dialog.close")}>
            ×
          </button>
        </div>

        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
};

export default Dialog;
