import { useState } from "react";
import { IoSaveOutline, IoGridOutline } from "react-icons/io5";
import { AddCategory } from "../../slices/SilceCategory";
import { useDispatch } from "react-redux";
import toast, { Toaster } from "react-hot-toast";
import { useTranslation } from "react-i18next";

export default function AddCategoryForm() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    DateCreate: new Date(),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await dispatch(AddCategory(formData)).unwrap();
      setFormData({ name: "" });

      toast.success(t("categoryForm.added"));
    } catch {
      toast.error(t("categoryForm.failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 flex flex-col gap-4 justify-between transition-colors">
      <div>
        <label className="text-sm text-gray-700 dark:text-slate-300 mb-2 block font-medium">
          {t("categoryForm.categoryName")}
        </label>

        <div className="relative">
          <IoGridOutline
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500"
            size={20}
          />
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
            : "bg-[#19b393] hover:bg-[#0e6b58] active:scale-95 shadow-lg shadow-primary-500/10"
        }`}
      >
        <IoSaveOutline size={20} />
        {isSubmitting ? t("categoryForm.adding") : t("categoryForm.addCategory")}
      </button>
      <Toaster />
    </form>
  );
}
