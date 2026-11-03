

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Sidebar from "./NavBar/Navbar";
import { getMe, logoutAdmin } from "../slices/SliceLoginAdmin.jsx";
import { canOpenEmployeePage } from "../../shared/employeePermissions.js";

export default function Home() {
  const { t } = useTranslation(), dispatch = useDispatch(), { pathname } = useLocation();
  const { user, role, token, sessionReady, sessionError } = useSelector(state => state.LoginAdmin);
  useEffect(() => {
    if (!token) return;
    const refresh = () => { if (document.visibilityState !== "hidden") dispatch(getMe()); };
    refresh(); window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [dispatch, token]);
  if (!token) return <Navigate to="/LoginChoise" replace/>;
  if (!sessionReady) return <main className="min-h-screen flex flex-col items-center justify-center gap-5 p-6 dark:bg-slate-950 dark:text-white"><p role={sessionError ? "alert" : "status"}>{t(sessionError ? "employeePermissions.sessionFailed" : "common.loading")}</p>{sessionError && <><button type="button" className="employee-permissions-button" onClick={() => dispatch(getMe())}>{t("employeePermissions.retry")}</button><button type="button" onClick={() => dispatch(logoutAdmin())}>{t("employeePermissions.signOut")}</button></>}</main>;
  const allowed = canOpenEmployeePage(role, user, pathname);
  return <div className="h-screen"><Sidebar/><div className="ms-20">{allowed ? <Outlet/> : <main className="min-h-screen flex flex-col items-center justify-center gap-5 p-8 text-center dark:bg-slate-950 dark:text-white" data-module-access-denied><h1 className="text-2xl font-bold">{t("employeePermissions.denied")}</h1><p>{t("employeePermissions.deniedHint")}</p><Link className="employee-permissions-button" to="/Home/pagination">{t("employeePermissions.availableSections")}</Link></main>}</div></div>;
}
