import { IoCloseOutline } from "react-icons/io5";
import { FaLock } from "react-icons/fa";

export default function SuspendedDialog({ open, onClose }) {
  if (!open) return null;

  // Fermer si on clique sur le fond sombre
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity"
      onClick={handleBackdropClick}
    >
      <div className="bg-white w-full max-w-sm mx-4 rounded-2xl shadow-2xl p-8 relative animate-in fade-in zoom-in duration-200">
        
        {/* Close icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors"
          aria-label="Fermer"
        >
          <IoCloseOutline size={24} />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Icon Circle */}
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
            <FaLock className="text-red-600" size={28} />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Compte suspendu
          </h2>

          {/* Message */}
          <p className="text-gray-500 mb-8 leading-relaxed">
            Votre compte a été temporairement suspendu par l’administrateur. 
            Veuillez contacter le support pour résoudre ce problème.
          </p>

          {/* Action */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold
                       hover:bg-red-700 active:scale-[0.98] transition-all shadow-lg shadow-red-200"
          >
            J'ai compris
          </button>
        </div>
      </div>
    </div>
  );
}