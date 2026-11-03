import { useId } from "react";
import { useTranslation } from "react-i18next";
import { EMPLOYEE_MODULES, EMPLOYEE_MODULE_LABELS, employeeModules } from "../../../shared/employeePermissions.js";
import "./employeePermissions.css";

export default function EmployeePermissionsFields({ value, onChange, disabled = false }) {
  const { t } = useTranslation(), id = useId();
  const modules = employeeModules(value);
  const toggle = key => onChange({ ...value, moduleAccess: modules.includes(key) ? modules.filter(item => item !== key) : [...modules, key] });
  return <div className="employee-permissions-fields">
    <fieldset disabled={disabled}><legend>{t("employeePermissions.sections")}</legend><p>{t("employeePermissions.sectionsHint")}</p>
      <div className="employee-permissions-shortcuts"><button type="button" onClick={() => onChange({ ...value, moduleAccess: [...EMPLOYEE_MODULES] })}>{t("employeePermissions.selectAll")}</button><button type="button" onClick={() => onChange({ ...value, moduleAccess: [] })}>{t("employeePermissions.clearAll")}</button><span data-permission-count>{t("employeePermissions.selected", { count: modules.length })}</span></div>
      <div className="employee-permissions-grid">{EMPLOYEE_MODULES.map(key => <label key={key} htmlFor={`${id}-${key}`} className={modules.includes(key) ? "is-selected" : ""}><input id={`${id}-${key}`} data-module-permission={key} type="checkbox" checked={modules.includes(key)} onChange={() => toggle(key)}/><span>{t(EMPLOYEE_MODULE_LABELS[key])}</span></label>)}</div>
    </fieldset>
    <fieldset disabled={disabled} className="employee-permissions-operations"><legend>{t("employeePermissions.operations")}</legend><p>{t("employeePermissions.operationsHint")}</p><div>{["add", "update", "delete"].map(key => <label key={key} htmlFor={`${id}-operation-${key}`}><input id={`${id}-operation-${key}`} data-operation-permission={key} type="checkbox" checked={value.action?.[key] === true} onChange={event => onChange({ ...value, action: { add: false, update: false, delete: false, ...value.action, [key]: event.target.checked } })}/>{t(`employeePermissions.${key}`)}</label>)}</div></fieldset>
  </div>;
}
