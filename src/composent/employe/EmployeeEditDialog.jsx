import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { IoCloseOutline, IoCreateOutline, IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";
import toast from "react-hot-toast";
import { UpdateEmploye } from "../../slices/sliceEmploye.jsx";
import { employeeErrorKey } from "../../i18n/employeeErrors.js";
import "./employeeEdit.css";

export default function EmployeeEditDialog({ employee, onClose }) {
  const { t, i18n } = useTranslation(), dispatch = useDispatch();
  const [form, setForm] = useState(() => ({ name: employee.name || "", email: employee.email || "", phone: employee.phone || "", cin: employee.cin || "", password: employee.password || "", isActive: employee.isActive === true }));
  const [saving, setSaving] = useState(false), [error, setError] = useState(""), [showPassword, setShowPassword] = useState(false);
  const dialogRef = useRef(null), savingRef = useRef(false);
  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); return () => dialog.close(); }, []);
  const close = () => { if (!savingRef.current) { dialogRef.current.close(); onClose(); } };
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  const save = async event => {
    event.preventDefault(); if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      await dispatch(UpdateEmploye({ id: employee._id, newinfoEmp: { ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), cin: form.cin.trim() } })).unwrap();
      toast.success(t("employees.updated")); savingRef.current = false; close();
    } catch (failure) { setError(employeeErrorKey(failure, "updateFailed")); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <dialog ref={dialogRef} dir={i18n.dir()} className="employee-edit-dialog" aria-labelledby="employee-edit-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><h2 id="employee-edit-title"><IoCreateOutline aria-hidden="true"/>{t("employees.edit")}</h2><p dir="auto">{employee.name}</p></div><button type="button" data-close-employee-edit onClick={close} disabled={saving} aria-label={t("common.cancel")}><IoCloseOutline size={24}/></button></header>
    <form onSubmit={save}><div className="employee-edit-body"><fieldset disabled={saving}><div className="employee-edit-grid">
      {[["name", "text"], ["email", "email"], ["phone", "tel"], ["cin", "text"]].map(([key, type]) => <label key={key} htmlFor={`employee-edit-${key}`}>{t(`employees.${key}`)}<input id={`employee-edit-${key}`} name={key} type={type} required={key !== "phone"} minLength={key === "cin" ? 6 : undefined} maxLength={key === "cin" ? 8 : undefined} autoComplete={key === "phone" ? "tel" : key === "cin" ? "off" : key} dir={key === "email" || key === "phone" || key === "cin" ? "ltr" : "auto"} value={form[key]} onChange={change}/></label>)}
      <div className="employee-edit-password"><label htmlFor="employee-edit-password">{t("employees.password")}</label><div><input id="employee-edit-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required dir="ltr" value={form.password} onChange={change}/><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={t(showPassword ? "employees.hidePassword" : "employees.showPassword")} aria-pressed={showPassword}>{showPassword ? <IoEyeOffOutline size={21}/> : <IoEyeOutline size={21}/>}</button></div></div>
    </div><label className="employee-edit-status" htmlFor="employee-edit-active"><div><strong>{t("employees.activeAccount")}</strong><small>{t("employees.allowAccess")}</small></div><input id="employee-edit-active" name="isActive" type="checkbox" checked={form.isActive} onChange={change}/></label></fieldset>{error && <p role="alert" className="employee-edit-error">{t(error)}</p>}</div>
    <footer><button type="button" disabled={saving} onClick={close}>{t("common.cancel")}</button><button type="submit" data-save-employee-edit disabled={saving}>{t(saving ? "common.loading" : "employees.confirmChanges")}</button></footer></form>
  </dialog>;
}
