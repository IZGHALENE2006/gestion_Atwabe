import { Outlet, useNavigate } from "react-router-dom";
import NaveProfite from "./NaveProfite";
import { useSelector } from "react-redux";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function Profite() {
  const { token } = useSelector((state) => state.LoginAdmin);
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (!token) {
      navigate("/LoginChoise");
    }
  }, [token, navigate]);

  return (
    <div
      dir={i18n.dir()}
      className="flex flex-col gap-4 p-4 min-h-screen bg-slate-50 dark:bg-[#1e293b] text-slate-900 dark:text-slate-100 transition-colors duration-300"
    >
      <NaveProfite />
      <div>
        <Outlet />
      </div>
    </div>
  );
}
