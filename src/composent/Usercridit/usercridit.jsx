import { Outlet, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useEffect } from "react";
import NaveCridit from "./Navecridi";
import { Toaster } from "react-hot-toast";

export default function Usercridit() {
      const { token } = useSelector((state) => state.LoginAdmin);
const navigate = useNavigate()
useEffect(() => {
  if (!token) {
    navigate("/LoginChoise");
  }
}, [token, navigate]);
  return (
    <div className="flex flex-col gap-4 p-4 min-h-screen bg-slate-50 dark:bg-[#1e293b] text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Toaster position="top-right" />
      <NaveCridit/>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
