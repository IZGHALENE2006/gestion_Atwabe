import { apiErrorMessage } from "../../i18n/apiErrors.js";
import { useEffect, useMemo, useState } from "react";
import {
  IoSearchOutline,
  IoPeopleOutline,
  IoTrashOutline,
  IoEyeOutline,
  IoShareSocialOutline,
  IoWalletOutline,
} from "react-icons/io5";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  DeleteUserCridite,
  GetAllUserCridite,
} from "../../slices/SliceCridite";
import CreditShareDialog from "./CreditShareDialog.jsx";

const ListUsercridite = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [shareUserId, setShareUserId] = useState(null);
  const canDelete = useSelector(state => state.LoginAdmin.role === "admin");
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-MA";

  const formatMoney = (value) =>
    `${Number(value || 0).toLocaleString(locale)} DH`;

  const { users, loading, actionLoading } = useSelector(
    (state) => state.userCridite
  );

  useEffect(() => {
    dispatch(GetAllUserCridite());
  }, [dispatch]);

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => {
      const name = String(user.name || "").toLowerCase();
      const cin = String(user.cin || "").toLowerCase();
      const phone = String(user.phone || "").toLowerCase();

      return (
        name.includes(query) || cin.includes(query) || phone.includes(query)
      );
    });
  }, [users, searchTerm]);

  const globalRemaining = useMemo(() => {
    return filteredUsers.reduce(
      (sum, user) => sum + Number(user?.summary?.remaining || 0),
      0
    );
  }, [filteredUsers]);

  const handleDelete = async (id) => {
    try {
      await dispatch(DeleteUserCridite(id)).unwrap();
      toast.success(t("creditList.clientRemoved"));
    } catch (error) {
      toast.error(apiErrorMessage(error, t, "creditList.deleteFailed"));
    }
  };

  return (
    <div className="w-full animate-in fade-in duration-500 space-y-8">
      <div className="flex flex-col lg:flex-row gap-6 items-center">
        <div className="w-full lg:w-96 p-6 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
          <div className="p-4 rounded-2xl bg-primary-50 dark:bg-primary-500/10 text-primary-600">
            <IoPeopleOutline size={28} />
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">
              {t("creditList.clients")}
            </p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white">
              {filteredUsers.length}
            </h3>
          </div>
        </div>

        <div className="w-full lg:w-96 p-6 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600">
            <IoWalletOutline size={28} />
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">
              {t("creditList.remainingFiltered")}
            </p>
            <h3 className="text-2xl font-black text-rose-600">
              {formatMoney(globalRemaining)}
            </h3>
          </div>
        </div>

        <div className="flex-1 w-full relative group">
          <IoSearchOutline
            className={`absolute top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors ${i18n.language === "ar" ? "right-6" : "left-6"}`}
            size={22}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("creditList.searchPlaceholder")}
            className={`w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] py-5 outline-none text-slate-700 dark:text-slate-200 font-bold focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all shadow-sm ${i18n.language === "ar" ? "pr-16 pl-8" : "pl-16 pr-8"}`}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {t("creditList.client")}
                </th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {t("creditList.cin")}
                </th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {t("creditList.total")}
                </th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {t("creditList.paid")}
                </th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {t("creditList.remaining")}
                </th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  {t("creditList.phone")}
                </th>
                <th className="px-8 py-6 text-xs font-bold text-slate-500">{t("creditAudit.createdBy")}</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">
                  {t("creditList.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((user) => (
                <tr
                  key={user._id}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all"
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-500/10 flex items-center justify-center text-primary-600 font-black text-xs">
                        {user.name?.charAt(0)?.toUpperCase() || "C"}
                      </div>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {user.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 font-bold text-slate-500 dark:text-slate-400">
                    {user.cin || "-"}
                  </td>
                  <td className="px-8 py-5 font-black text-slate-700 dark:text-slate-200">
                    {formatMoney(user?.summary?.total)}
                  </td>
                  <td className="px-8 py-5 font-black text-primary-600">
                    {formatMoney(user?.summary?.paid)}
                  </td>
                  <td className="px-8 py-5">
                    <span className="px-4 py-1.5 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 font-black text-xs">
                      {formatMoney(user?.summary?.remaining)}
                    </span>
                  </td>
                  <td className="px-8 py-5 font-bold text-slate-500 dark:text-slate-400">
                    {user.phone || "-"}
                  </td>
                  <td className="px-8 py-5" data-credit-customer-creator><span dir="auto">{user.createdBy?.name || t("creditAudit.unrecorded")}</span>{user.createdBy && <small className="block text-xs text-slate-500 dark:text-slate-400">{t(user.createdBy.role === "admin" ? "creditAudit.admin" : "creditAudit.employee")}</small>}</td>
                  <td className="px-8 py-5">
                    <div className="flex items-center justify-center gap-2">
                      <button type="button" className="credit-document-icon" data-share-credit={user._id} onClick={() => setShareUserId(user._id)} title={t("creditDocuments.share.title")} aria-label={t("creditDocuments.share.named", { name: user.name })}><IoShareSocialOutline size={18} /></button>
                      <button
                        onClick={() =>
                          navigate(`/Home/cridit/UserCreditDetails/${user._id}`)
                        }
                        className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-primary-500 hover:text-white transition-all shadow-sm"
                      >
                        <IoEyeOutline size={18} />
                      </button>
                      {canDelete && <button
                        disabled={actionLoading}
                        onClick={() => handleDelete(user._id)}
                        className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-rose-500 hover:text-white transition-all shadow-sm disabled:opacity-50"
                      >
                        <IoTrashOutline size={18} />
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filteredUsers.length === 0 && (
          <div className="py-16 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
            {t("creditList.noClientsFound")}
          </div>
        )}
      </div>
      {shareUserId && <CreditShareDialog key={shareUserId} userId={shareUserId} onClose={() => setShareUserId(null)} />}
    </div>
  );
};

export default ListUsercridite;
