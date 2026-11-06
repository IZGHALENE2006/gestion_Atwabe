import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { IoShieldCheckmarkOutline, IoCloseOutline } from "react-icons/io5";
import axios from "axios";
import toast from "react-hot-toast";
import { employeePermissionValue } from "../../../shared/employeePermissions.js";
import { GetAllEmploye } from "../../slices/sliceEmploye.jsx";
import EmployeePermissionsFields from "./EmployeePermissionsFields.jsx";

function EmployeePermissionsDialog({ employee, onClose }) {
  const { t, i18n } = useTranslation(), dispatch = useDispatch();
  const [value, setValue] = useState(() => employeePermissionValue(employee));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const dialogRef = useRef(null), savingRef = useRef(false);
  useEffect(() => { const dialog = dialogRef.current, opener = document.activeElement; dialog.showModal(); return () => { dialog.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); }; }, []);
  const close = () => { if (!savingRef.current) { dialogRef.current.close(); onClose(); } };
  const save = async event => {
    event.preventDefault(); if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      await axios.put(`${import.meta.env.VITE_API_URL || "http://localhost:7000"}/Employe/${encodeURIComponent(employee._id)}/permissions`, value, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      dispatch(GetAllEmploye()); toast.success(t("employeePermissions.saved")); savingRef.current = false; close();
    } catch { setError("saveFailed"); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <dialog ref={dialogRef} dir={i18n.dir()} className="employee-permissions-dialog" aria-labelledby="employee-permissions-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="employee-permissions-title"><IoShieldCheckmarkOutline/>{t("employeePermissions.title")}</h2><p dir="auto">{employee.name}</p></div><button type="button" data-close-employee-permissions disabled={saving} onClick={close} aria-label={t("common.cancel")}><IoCloseOutline size={24}/></button></header>
    <form onSubmit={save}><div className="employee-permissions-body"><EmployeePermissionsFields value={value} onChange={setValue} disabled={saving}/><p className="employee-permissions-note">{t("employeePermissions.appliesHint")}</p>{error && <p role="alert">{t(`employeePermissions.${error}`)}</p>}</div><footer><button type="button" disabled={saving} onClick={close}>{t("common.cancel")}</button><button type="submit" data-save-employee-permissions disabled={saving}>{t(saving ? "common.loading" : "employeePermissions.save")}</button></footer></form>
  </dialog>;
}

export default function EmployeePermissionsButton({ employee }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <><button type="button" className="employee-permissions-button" data-edit-employee-permissions={employee._id} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setOpen(true); }}><IoShieldCheckmarkOutline size={18}/>{t("employeePermissions.button")}</button>{open && <EmployeePermissionsDialog employee={employee} onClose={() => setOpen(false)}/>}</>;
}
