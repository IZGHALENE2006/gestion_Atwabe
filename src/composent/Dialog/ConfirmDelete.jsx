import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";

const ConfirmDelete = ({ open, onClose, onConfirm, title, message }) => {
  const { t } = useTranslation();
  const { loading } = useSelector((state) => state.category);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* Overlay - Blurred for a modern look */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
      ></div>

      {/* Dialog */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
        
        {/* Header Icon (Optional visual cue) */}
        <div className="mb-4 flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-900/20">
          <svg className="w-6 h-6 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
          {title || t("confirmDelete.title")}
        </h2>

        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
          {message || t("confirmDelete.message")}
        </p>

        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-8">
          {/* Cancel Button */}
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
          >
            {t("common.cancel")}
          </button>

          {/* Delete Button - Using Emerald/Rose logic */}
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest text-white transition-all shadow-lg active:scale-95 ${
              loading 
                ? "bg-slate-400 cursor-not-allowed" 
                : "bg-rose-600 hover:bg-rose-500 shadow-rose-500/20"
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t("confirmDelete.deleting")}
              </span>
            ) : (
              t("categories.delete")
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDelete;
