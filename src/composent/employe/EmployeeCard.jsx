import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoPencil, IoEyeOutline, IoEyeOffOutline, IoCallOutline, IoMailOutline, IoFingerPrintOutline, IoCalendarOutline, IoCheckmarkCircleOutline, IoCloseCircleOutline, IoPersonOutline } from "react-icons/io5";
import EmployeePermissionsButton from "./EmployeePermissionsDialog.jsx";
import "./employeeEdit.css";

export const EmployeeCard = ({ employee, onEdit }) => {
  const { t, i18n } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const color = employee.color || "#168365";
  return <article className="employee-summary-card" data-employee-card={employee._id}>
    <header><span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${employee.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"}`}>{employee.isActive ? <IoCheckmarkCircleOutline/> : <IoCloseCircleOutline/>}{t(employee.isActive ? "employees.active" : "employees.inactive")}</span></header>
    <div className="employee-summary-profile"><div style={{ backgroundColor: `${color}20`, color }}><IoPersonOutline size={30}/></div><h3 dir="auto">{employee.name}</h3></div>
    <div className="employee-summary-contact"><div><IoMailOutline size={18}/><span dir="ltr">{employee.email || t("employees.unavailable")}</span></div><div><IoCallOutline size={18}/><span dir="ltr">{employee.phone || t("employees.unavailable")}</span></div><div><IoFingerPrintOutline size={18}/><span dir="ltr">{employee.cin?.toUpperCase() || t("employees.unavailable")}</span></div></div>
    <div className="employee-summary-password"><div><small>{t("employees.accessKey")}</small><bdi>{showPassword ? employee.password : "••••••••"}</bdi></div><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={t(showPassword ? "employees.hidePassword" : "employees.showPassword")} aria-pressed={showPassword}>{showPassword ? <IoEyeOffOutline size={20}/> : <IoEyeOutline size={20}/>}</button></div>
    <footer><span className="employee-summary-date"><IoCalendarOutline size={14}/>{employee.datecreate ? new Date(employee.datecreate).toLocaleDateString(i18n.language === "ar" ? "ar-MA" : "fr-MA") : "—"}</span><button type="button" data-edit-employee={employee._id} onClick={() => onEdit(employee)} className="employee-edit-button"><IoPencil size={17}/>{t("employees.edit")}</button><EmployeePermissionsButton employee={employee}/></footer>
  </article>;
};
