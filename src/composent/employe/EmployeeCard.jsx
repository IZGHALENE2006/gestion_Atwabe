import { useTranslation } from "react-i18next";
import React, { useState, useRef, useEffect } from "react";
import { gsap } from "gsap";
import { GetAllEmploye, UpdateEmploye } from "../../slices/sliceEmploye";
import toast, { Toaster } from "react-hot-toast";
import {
  IoPencil,
  IoEyeOutline,
  IoEyeOffOutline,
  IoCallOutline,
  IoMailOutline,
  IoFingerPrintOutline,
  IoCalendarOutline,
  IoCheckmarkCircleOutline,
  IoCloseCircleOutline,
  IoPersonOutline,
  IoArrowBackOutline,
} from "react-icons/io5";
import { useDispatch, useSelector } from "react-redux";

export const EmployeeCard = ({ employee, onUpdated }) => {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const innerRef = useRef(null);

  const employeeFromRedux = useSelector((state) =>
    state.Employe.Employe.find((emp) => emp._id === employee._id)
  );

  const [newinfoEmp, setNewInfoEmp] = useState(employeeFromRedux || employee);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (employeeFromRedux) setNewInfoEmp(employeeFromRedux);
  }, [employeeFromRedux]);

  const { loading } = useSelector((state) => state.Employe);

  // ================= UPDATE =================
  const HandleUpdateEmploye = (id) => {
    dispatch(UpdateEmploye({ id, newinfoEmp }))
      .unwrap()
      .then(() => {
        toast.success(t("employees.updated"));
        setIsFlipped(false);

        gsap.to(innerRef.current, {
          rotateY: 0,
          duration: 0.6,
          ease: "back.inOut(1.7)",
        });

        onUpdated && onUpdated();
      })
      .catch(() => toast.error(t("employees.updateFailed")));
  };

  // ================= FLIP =================
  const toggleFlip = (e) => {
    e.stopPropagation();
    const rotation = isFlipped ? 0 : 180;
    gsap.to(innerRef.current, {
      rotateY: rotation,
      duration: 0.6,
      ease: "power2.inOut",
    });
    setIsFlipped(!isFlipped);
  };

  const togglePassword = (e) => {
    e.stopPropagation();
    setShowPassword(!showPassword);
  };

  return (
    <div className="w-82 h-115" style={{ perspective: "1200px" }}>
      <div
        ref={innerRef}
        className="relative w-full h-full transition-shadow duration-500"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* ================= FRONT ================= */}
        <div
          className="absolute inset-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl dark:shadow-2xl/40 rounded-[2.5rem] p-6 flex flex-col justify-between overflow-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Top accent bar */}
          <div
            className="absolute top-0 left-0 w-full h-1.5"
            style={{ backgroundColor: employee.color || "#10b981" }}
          />

          <div>
            {/* Header Status */}
            <div className="flex justify-end items-center mb-6">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest ${
                employee.isActive
                ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600"
                : "bg-rose-50 dark:bg-rose-900/20 text-rose-600"
              }`}>
                {employee.isActive ? <IoCheckmarkCircleOutline size={14}/> : <IoCloseCircleOutline size={14}/>}
                {employee.isActive ? t("employees.active") : t("employees.inactive")}
              </div>
            </div>

            {/* Profile Info */}
            <div className="flex flex-col items-center text-center mb-6">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-inner"
                  style={{ backgroundColor: `${employee.color}20`, color: employee.color }}
                >
                    <IoPersonOutline size={32} />
                </div>
                <h3 className="text-slate-800 dark:text-slate-100 font-black text-lg leading-tight">
                  {employee.name}
                </h3>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] mt-1 opacity-70" style={{ color: employee.color }}>
                  {employee.role}
                </p>
            </div>

            {/* Contact Details */}
            <div className="space-y-2 px-2">
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                <IoMailOutline className="text-primary-500" size={18} />
                <span className="text-xs font-medium truncate">{employee.email}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                <IoCallOutline className="text-primary-500" size={18} />
                <span className="text-xs font-medium">{employee.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                <IoFingerPrintOutline className="text-primary-500" size={18} />
                <span className="text-xs font-mono font-bold tracking-tighter">
                  {employee.cin.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Area */}
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[8px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">{t("employees.accessKey")} </span>
                <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
                  {showPassword ? employee.password : "••••••••"}
                </div>
              </div>
              <button
                onClick={togglePassword}
                className="p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 transition-colors"
              >
                {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
              </button>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="flex items-center gap-2 text-slate-400">
                <IoCalendarOutline size={14} />
                <span className="text-[10px] font-black uppercase tracking-tighter">
                  {new Date(employee.datecreate).toLocaleDateString(i18n.language === "ar" ? "ar-MA" : "fr-MA")}
                </span>
              </div>

              <button
                onClick={toggleFlip}
                className="w-10 h-10 flex items-center justify-center bg-slate-900 dark:bg-primary-600 text-white rounded-xl hover:scale-110 active:scale-95 transition-all shadow-lg"
              >
                <IoPencil size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* ================= BACK ================= */}
        <div
          className="absolute inset-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-xl"
          style={{
            transform: "rotateY(180deg)",
            backfaceVisibility: "hidden",
          }}
        >
          <div className="flex items-center gap-2 mb-8">
            <button onClick={toggleFlip} className="text-slate-400 hover:text-primary-500 transition-colors">
                <IoArrowBackOutline size={20}/>
            </button>
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-800 dark:text-slate-100">{t("employees.editProfile")} </h4>
          </div>

          <div className="space-y-5">
            {["name", "email", "phone", "cin", "password"].map((field) => (
              <div key={field} className="relative">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest absolute -top-2 left-0 bg-white dark:bg-slate-900 px-1">
                    {t(`employees.${field}`)}
                </label>
                <input
                  type="text"
                  value={newinfoEmp[field]}
                  onChange={(e) =>
                    setNewInfoEmp({ ...newinfoEmp, [field]: e.target.value })
                  }
                  className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-primary-500 transition-colors"
                />
              </div>
            ))}
          </div>

          {/* ===== ACTIVE STATUS ===== */}
          <div className="flex items-center justify-between mt-6 p-4 rounded-xl
                        bg-slate-50 dark:bg-slate-800/50
                        border border-slate-200 dark:border-slate-800">

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={newinfoEmp.isActive}
              onChange={(e) =>
                setNewInfoEmp({
                  ...newinfoEmp,
                  isActive: e.target.checked,
                })
              }
              className="w-5 h-5 accent-primary-500 cursor-pointer"
            />

            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t("employees.activeAccount")} </span>
          </label>

          <span
            className={`text-xs font-black px-3 py-1 rounded-full
              ${
                newinfoEmp.isActive
                  ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
              }
            `}
          >
            {newinfoEmp.isActive ? t("employees.active") : t("employees.inactive")}
          </span>
        </div>

          <button
            onClick={() => HandleUpdateEmploye(employee._id)}
            disabled={loading}
            className={`mt-10 w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-xl transition-all active:scale-95 ${
                loading ? "bg-slate-400" : "hover:brightness-110 shadow-primary-500/20"
            }`}
            style={{ backgroundColor: employee.color || "#10b981" }}
          >
            {loading ? t("common.loading") : t("employees.confirmChanges")}
          </button>
        </div>
      </div>
    </div>
  );
};
