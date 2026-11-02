import { apiErrorMessage } from "../../i18n/apiErrors.js";
import { Link, useNavigate } from "react-router-dom";
import { IoIosPersonAdd } from "react-icons/io";
import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RegistreAdmin } from "../../slices/sliceLogin";
import gsap from "gsap";
import { useTranslation } from "react-i18next";

function RegesterAdmin() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const dispatch = useDispatch();
  const nav = useNavigate();
  const formRef = useRef(null);
  const { loading, error } = useSelector((state) => state.register);
  const [adminInfo, setAdminInfo] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [errorLocal, setErrorLocal] = useState(false);

  useEffect(() => {
    gsap.fromTo(
      formRef.current,
      { scale: 0.9, opacity: 0, y: 20 },
      { scale: 1, opacity: 1, y: 0, duration: 0.8, ease: "back.out(1.2)" }
    );
  }, []);

  function handeladdAdmin(e) {
    e.preventDefault();
    if (!adminInfo.name || !adminInfo.email || !adminInfo.password) {
      setErrorLocal(true);
      return;
    }
    dispatch(RegistreAdmin(adminInfo))
      .unwrap()
      .then(() => nav("/LoginAdmin"));
  }

  return (
    <div className="h-screen w-full flex flex-col justify-center items-center p-4 overflow-hidden relative transition-colors duration-700 bg-gray-100 dark:bg-[#1e293b] font-sans">
      <div className="absolute top-[-10%] left-[-5%] w-125 h-125 bg-primary-500/10 dark:bg-primary-600/15 rounded-full blur-[120px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-125 h-125 bg-primary-400/10 dark:bg-primary-400/10 rounded-full blur-[120px] animate-pulse pointer-events-none" />

      <div className="mt-5 flex flex-col items-center mb-6 z-10 text-center">
        <h1 className="text-4xl font-black tracking-tighter text-slate-800 dark:text-white leading-none">
          STOCK <span className="text-primary-500">PRO</span>
        </h1>
        <p className="text-slate-400 dark:text-slate-600 text-[9px] font-black uppercase tracking-[0.4em] mt-2 italic">
          {t("registerAdmin.portal")}
        </p>
      </div>

      <div
        ref={formRef}
        className="relative w-full max-w-md rounded-[2.5rem] p-10 z-10 border transition-all duration-500
          bg-white border-slate-200 shadow-2xl shadow-slate-200/50
          dark:bg-slate-900/40 dark:backdrop-blur-2xl dark:border-slate-700 dark:shadow-none"
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
            {t("registerAdmin.title")}
          </h2>
          <div className="p-3 rounded-2xl bg-primary-500 text-white shadow-lg shadow-primary-500/30">
            <IoIosPersonAdd size={24} />
          </div>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handeladdAdmin}>
          <div className="space-y-1">
            <label
              className={`text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ${
                isArabic ? "mr-2" : "ml-2"
              }`}
            >
              {t("registerAdmin.nameLabel")}
            </label>
            <input
              type="text"
              placeholder={t("registerAdmin.namePlaceholder")}
              className={`w-full px-5 py-4 rounded-2xl outline-none transition-all duration-300 border
                ${
                  errorLocal && !adminInfo.name
                    ? "border-red-500 bg-red-50/50"
                    : "bg-slate-50 border-slate-100 dark:bg-white/5 dark:border-white/10"
                }
                text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500`}
              onChange={(e) => {
                setAdminInfo({ ...adminInfo, name: e.target.value });
                setErrorLocal(false);
              }}
            />
          </div>

          <div className="space-y-1">
            <label
              className={`text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ${
                isArabic ? "mr-2" : "ml-2"
              }`}
            >
              {t("registerAdmin.emailLabel")}
            </label>
            <input
              type="email"
              placeholder={t("registerAdmin.emailPlaceholder")}
              className={`w-full px-5 py-4 rounded-2xl outline-none transition-all duration-300 border
                ${
                  errorLocal && !adminInfo.email
                    ? "border-red-500 bg-red-50/50"
                    : "bg-slate-50 border-slate-100 dark:bg-white/5 dark:border-white/10"
                }
                text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500`}
              onChange={(e) => {
                setAdminInfo({ ...adminInfo, email: e.target.value });
                setErrorLocal(false);
              }}
            />
          </div>

          <div className="space-y-1">
            <label
              className={`text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest ${
                isArabic ? "mr-2" : "ml-2"
              }`}
            >
              {t("registerAdmin.passwordLabel")}
            </label>
            <input
              type="password"
              placeholder={t("registerAdmin.passwordPlaceholder")}
              className={`w-full px-5 py-4 rounded-2xl outline-none transition-all duration-300 border
                ${
                  errorLocal && !adminInfo.password
                    ? "border-red-500 bg-red-50/50"
                    : "bg-slate-50 border-slate-100 dark:bg-white/5 dark:border-white/10"
                }
                text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500`}
              onChange={(e) => {
                setAdminInfo({ ...adminInfo, password: e.target.value });
                setErrorLocal(false);
              }}
            />
          </div>

          <button className="mt-4 bg-primary-600 hover:bg-primary-500 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-primary-600/20 active:scale-[0.98] transition-all">
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t("registerAdmin.loading")}</span>
              </div>
            ) : (
              t("registerAdmin.joinTeam")
            )}
          </button>

          <Link
            to="/LoginAdmin"
            className="text-center text-slate-400 dark:text-slate-600 text-[10px] font-black uppercase tracking-widest hover:text-primary-500 dark:hover:text-primary-400 transition-colors mt-2"
          >
            {t("registerAdmin.alreadyHave")}
          </Link>

          {error && (
            <p className="text-red-500 text-center text-[10px] font-bold uppercase mt-2">
              {apiErrorMessage(error, t)}
            </p>
          )}
          {errorLocal && (
            <p className="text-red-500 text-center text-[10px] font-bold uppercase mt-2">
              {t("registerAdmin.allFieldsMandatory")}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

export default RegesterAdmin;
