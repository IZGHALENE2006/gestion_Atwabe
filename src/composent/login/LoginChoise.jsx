import { useEffect, useMemo, useRef } from "react";
import { FaUserTie, FaUser, FaArrowLeft } from "react-icons/fa"; // Added FaArrowLeft
import { Link } from "react-router-dom";
import gsap from "gsap";
import { Box } from "lucide-react";
import "../../App.css";
import { useTranslation } from "react-i18next";

function LoginChoise() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const containerRef = useRef(null);
  const cardsRef = useRef([]);
  const backBtnRef = useRef(null); // Ref for back button animation

  useEffect(() => {
    gsap.set(containerRef.current, { opacity: 0 });
    gsap.set(cardsRef.current, { opacity: 0, y: 60, scale: 0.9 });
    gsap.set(backBtnRef.current, { opacity: 0, x: -20 });

    const tl = gsap.timeline();
    tl.to(containerRef.current, { opacity: 1, duration: 1.2, ease: "power2.out" })
      .to(backBtnRef.current, { opacity: 1, x: 0, duration: 0.8 }, "-=0.8") // Fade in back button
      .to(cardsRef.current, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 1.2,
        stagger: 0.2,
        ease: "elastic.out(1, 0.8)",
      }, "-=0.6");
  }, []);

  const roles = useMemo(
    () => [
      {
        to: "/LoginAdmin",
        icon: <FaUserTie />,
        label: t("loginChoice.administration"),
        gradient: "from-primary-500 to-primary-700",
        lightShadow: "rgba(16, 185, 129, 0.15)",
        darkGlow: "rgba(16, 185, 129, 0.4)",
      },
      {
        to: "/LoginEmploye",
        icon: <FaUser />,
        label: t("loginChoice.employee"),
        gradient: "from-primary-500 to-primary-700",
        lightShadow: "rgba(99, 102, 241, 0.15)",
        darkGlow: "rgba(99, 102, 241, 0.4)",
      },
    ],
    [t]
  );

  return (
    <div ref={containerRef} className="h-screen flex flex-col justify-center items-center transition-colors duration-700
      bg-gray-100 dark:bg-[#1e293b] overflow-hidden relative font-sans">

      {/* Back Button */}
      <Link
        to="/"
        ref={backBtnRef}
        className={`absolute top-8 z-20 flex items-center gap-2 px-4 py-2 rounded-full
                   bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200 dark:border-white/10
                   text-slate-600 dark:text-slate-300 hover:text-primary-500 dark:hover:text-primary-400
                   transition-all duration-300 group shadow-sm hover:shadow-primary-500/20 ${isArabic ? "right-8" : "left-8"}`}
      >
        <FaArrowLeft className={`text-sm transition-transform ${isArabic ? "rotate-180 group-hover:translate-x-1" : "group-hover:-translate-x-1"}`} />
        <span className="text-[10px] font-black uppercase tracking-widest">{t("loginChoice.return")}</span>
      </Link>

      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-5%] w-125 h-125 bg-primary-500/10 dark:bg-primary-600/20 rounded-full blur-[100px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-125 h-125 bg-primary-500/10 dark:bg-primary-600/20 rounded-full blur-[100px] animate-pulse pointer-events-none" />

      {/* Brand Header */}
      <div className="flex flex-col items-center mb-12 z-10">
        <div className="bg-[#00BC7D] drop-shadow-[0_0px_15px_rgba(16,185,129,0.9)] p-1.5 mb-12 scale-110 rounded-lg">
          <Box className="text-white w-9 h-9 " />
        </div>

        <div className="text-center -mt-2">
          <h1 className="text-5xl md:text-6xl font-black tracking-tighter transition-all duration-500
            text-slate-800 dark:text-transparent dark:bg-clip-text dark:bg-linear-to-b dark:from-white dark:to-slate-400">
            STOCK <span className="text-primary-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">PRO</span>
          </h1>

          <p className="text-slate-500 dark:text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2 opacity-80">
            {t("loginChoice.selectPortal")}
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-10 z-10">
        {roles.map((role, i) => (
          <Link
            key={role.label}
            to={role.to}
            ref={el => cardsRef.current[i] = el}
            className="group relative"
          >
            <div className={`absolute -inset-1 bg-linear-to-r ${role.gradient} rounded-[3rem] blur opacity-0 dark:group-hover:opacity-30 transition duration-1000`} />

            <div
              className="relative flex flex-col w-72 h-80 justify-center items-center rounded-[3rem] transition-all duration-500 ease-out border
                bg-white border-slate-200 shadow-xl shadow-slate-200/50 hover:-translate-y-4 hover:shadow-2xl
                dark:bg-slate-900/40 dark:backdrop-blur-2xl dark:border-white/5 dark:shadow-none dark:hover:bg-slate-900/60"
              onMouseEnter={(e) => {
                const isDark = document.documentElement.classList.contains('dark');
                e.currentTarget.style.boxShadow = isDark
                  ? `0px 20px 80px ${role.darkGlow}`
                  : `0px 20px 40px ${role.lightShadow}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div className={`mt-12 relative p-7 rounded-3xl bg-linear-to-br ${role.gradient} mb-8 shadow-xl group-hover:scale-110 transition-all duration-700`}>
                <span className="text-5xl text-white drop-shadow-md">{role.icon}</span>
              </div>

              <h2 className="text-xl font-black tracking-widest uppercase transition-all duration-500
                text-slate-800 dark:text-slate-100 group-hover:tracking-[0.2em]">
                {role.label}
              </h2>

              <div className={`w-0 h-1 mt-4 rounded-full bg-linear-to-r ${role.gradient} group-hover:w-16 transition-all duration-700`} />

              <p className="text-slate-400 dark:text-slate-500 text-[9px] font-bold mt-6 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">
                {t("loginChoice.logIn")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default LoginChoise;
