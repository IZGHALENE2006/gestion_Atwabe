import {
  IoSearchOutline,
  IoAddOutline,
  IoFileTrayStackedOutline,
  IoGridOutline,
  IoListOutline,
  IoCreateOutline,
  IoTrashOutline,
  IoCalendarOutline,
  IoLayersOutline,
} from "react-icons/io5";
import CardCategories from "./CardCategories";
import Dialog from "../Dialog/Dialog";
import AddCategoryorm from "./AddForm";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { GetAllCatefory, DeleteCategory } from "../../slices/SilceCategory";
import { GetAllProduct } from "../../slices/SliceProduct";
import ConfirmDelete from "../Dialog/ConfirmDelete";
import UpdateCategoryForma from "./UpdateCategoryForma";
import toast, { Toaster } from "react-hot-toast";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

function Categories() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";
  const dispatch = useDispatch();
  const { Category } = useSelector((state) => state.category);
  const { Produts } = useSelector((state) => state.Product);
  const { role, token } = useSelector((state) => state.LoginAdmin);
  const navigate = useNavigate();

  useEffect(() => {
    dispatch(GetAllCatefory());
    dispatch(GetAllProduct());
  }, [dispatch]);

  const [openAdd, setOpenAdd] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openUpdate, setOpenUpdate] = useState(false);
  const [idDelete, setIdDelete] = useState("");
  const [idUpdate, setIdUpdate] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCategories = Category.filter((cat) =>
    String(cat.name || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  function handleDelete(id) {
    setIdDelete(id);
    setOpenDelete(true);
  }

  function confirmDelete() {
    dispatch(DeleteCategory(idDelete))
      .unwrap()
      .then(() => {
        toast.success(t("categories.deleted"));
        setOpenDelete(false);
      });
  }

  function handleUpdate(id) {
    setIdUpdate(id);
    setOpenUpdate(true);
  }

  useEffect(() => {
    if (!token) {
      navigate("/LoginChoise");
    }
  }, [token, navigate]);

  return (
    <div className="p-6 bg-gray-100 dark:bg-[#0f172a] min-h-screen transition-colors duration-300">
      <div className="flex flex-col lg:flex-row gap-6 mb-8">
        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex items-center gap-5">
          <div className="p-4 rounded-2xl bg-primary-50 dark:bg-primary-500/10 text-[#19b393]">
            <IoFileTrayStackedOutline size={30} />
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
              {t("categories.totalCategories")}
            </p>
            <h1 className="text-4xl font-black text-slate-800 dark:text-slate-100">
              {filteredCategories.length}
            </h1>
          </div>
        </div>

        <div className="flex-[2] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center">
          <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-700 shadow-md text-[#19b393]"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <IoGridOutline size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-700 shadow-md text-[#19b393]"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <IoListOutline size={18} />
            </button>
          </div>

          <div className="flex-1 flex items-center bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden px-4 group focus-within:border-primary-500/50 transition-all">
            <IoSearchOutline className="text-slate-400 group-focus-within:text-primary-500" />
            <input
              type="text"
              placeholder={t("categories.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-sm py-3 outline-none w-full text-slate-700 dark:text-slate-200 ml-3"
            />
          </div>

          {role === "admin" && (
            <button
              onClick={() => setOpenAdd(true)}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#19b393] text-white text-sm font-bold hover:bg-primary-600 shadow-lg shadow-primary-500/20 active:scale-95 transition-all"
            >
              <IoAddOutline size={20} />
              {t("categories.newCategory")}
            </button>
          )}
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="flex flex-wrap gap-6 justify-start">
          {filteredCategories.map((item, i) => (
            <div
              key={item._id || i}
              className="basis-full sm:basis-[calc(50%-1.5rem)] lg:basis-[calc(33.333%-1.5rem)] xl:basis-[calc(25%-1.5rem)]"
            >
              <CardCategories
                id={item._id}
                name={item.name}
                Datee={item.DateCreate}
                btn={handleDelete}
                update={handleUpdate}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="w-full overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-slate-400">
                    {t("categories.categoryDetails")}
                  </th>
                  <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-slate-400 text-center">
                    {t("categories.itemsCount")}
                  </th>
                  <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-slate-400 text-center">
                    {t("categories.createdAt")}
                  </th>
                  {role === "admin" && (
                    <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-slate-400 text-right">
                      {t("categories.actions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCategories.map((item) => {
                  const productCount =
                    Produts?.filter((prod) => prod.categorie?._id === item._id).length || 0;

                  return (
                    <tr
                      key={item._id}
                      className="group hover:bg-primary-50/30 dark:hover:bg-primary-500/5 transition-all"
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#19b393] border border-slate-200/50 dark:border-slate-700 font-bold">
                            <IoLayersOutline size={18} />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-tighter">
                              ID: {item._id.slice(-6).toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="px-4 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-sm font-black text-[#19b393] border border-primary-100 dark:border-primary-500/20 shadow-sm">
                          {productCount}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
                          <IoCalendarOutline size={14} className="text-slate-400" />
                          {new Date(item.DateCreate).toLocaleDateString(locale, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                      {role === "admin" && (
                        <td className="px-8 py-5">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleUpdate(item._id)}
                              className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-primary-500/20 transition-all active:scale-90"
                              title={t("categories.edit")}
                            >
                              <IoCreateOutline size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(item._id)}
                              className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/20 transition-all active:scale-90"
                              title={t("categories.delete")}
                            >
                              <IoTrashOutline size={18} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredCategories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
          <div className="p-4 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 mb-4">
            <IoSearchOutline size={40} />
          </div>
          <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">
            {t("categories.noMatch")}
          </p>
        </div>
      )}

      <Dialog
        bgcolor={document.documentElement.classList.contains("dark") ? "#0f172a" : "#ffffff"}
        width="550px"
        isOpen={openAdd}
        onClose={() => setOpenAdd(false)}
        title={t("categories.createTitle")}
      >
        <AddCategoryorm />
      </Dialog>

      <ConfirmDelete
        open={openDelete}
        onClose={() => setOpenDelete(false)}
        onConfirm={confirmDelete}
        title={t("categories.deleteTitle")}
        message={t("categories.deleteMessage")}
      />

      <Dialog
        bgcolor={document.documentElement.classList.contains("dark") ? "#0f172a" : "#ffffff"}
        width="550px"
        isOpen={openUpdate}
        onClose={() => setOpenUpdate(false)}
        title={t("categories.editTitle")}
      >
        <UpdateCategoryForma idupdate={idUpdate} onClose={() => setOpenUpdate(false)} />
      </Dialog>

      <Toaster position="top-right" />
    </div>
  );
}

export default Categories;
