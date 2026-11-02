import { useState, useEffect } from "react";
import { IoSaveOutline, IoGridOutline } from "react-icons/io5";
import { UpdateCategory } from "../../slices/SilceCategory";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";

export default function UpdateCategoryForma(props) {
  const { t } = useTranslation();
  const { idupdate, onClose } = props;
  const { Category } = useSelector((state) => state.category);

  const item = Category.find((cat) => cat._id === idupdate);

  const dispatch = useDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: item ? item.name : "",
  });

  useEffect(() => {
    if (item) {
      setFormData({ name: item.name });
    }
  }, [item]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await dispatch(UpdateCategory({ name: formData.name, id: idupdate })).unwrap();
      if (onClose) onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="text-sm text-gray-700 dark:text-slate-300 mb-2 block font-medium">
          {t("categoryForm.enterNewName")}
        </label>

        <div className="relative">
          <IoGridOutline className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t("categoryForm.placeholder")}
            className="w-full bg-[#071a2f]/5 dark:bg-slate-800/50 border border-[#19b393]/30 dark:border-slate-700
                       rounded-lg pl-10 pr-4 py-3 text-slate-800 dark:text-slate-100
                       placeholder:text-gray-400 dark:placeholder:text-slate-500
                       focus:outline-none focus:ring-2
                       focus:ring-[#19b393] transition-all"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full flex justify-center text-white items-center gap-2 py-3 rounded-lg font-semibold transition ${
          isSubmitting
            ? "bg-gray-500 cursor-not-allowed"
            : "bg-[#19b393] hover:bg-[#137964] active:scale-95"
        }`}
      >
        <IoSaveOutline size={20} />
        {isSubmitting ? t("categoryForm.saving") : t("categoryForm.saveChanges")}
      </button>
    </form>
  );
}
