import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoChevronDownOutline, IoSearchOutline, IoShieldCheckmarkOutline } from "react-icons/io5";
import { EMPLOYEE_MODULES, EMPLOYEE_MODULE_LABELS, EMPLOYEE_OPERATIONS, employeeModules, employeePermissionValue } from "../../../shared/employeePermissions.js";
import "./employeePermissions.css";

export default function EmployeePermissionsFields({ value, onChange, disabled = false }) {
  const { t } = useTranslation(), id = useId();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => employeeModules(value));
  const modules = employeeModules(value), permissions = employeePermissionValue(value);
  const operationCount = modules.reduce((sum, module) => sum + permissions.operationPermissions[module].length, 0);
  const update = patch => onChange({ ...value, ...permissions, ...patch });
  const toggle = module => {
    update({ moduleAccess: modules.includes(module) ? modules.filter(key => key !== module) : [...modules, module] });
    if (!modules.includes(module)) setExpanded(current => [...new Set([...current, module])]);
  };
  const choose = (module, operations) => update({ operationPermissions: { ...permissions.operationPermissions, [module]: operations } });
  const visible = EMPLOYEE_MODULES.filter(module => [t(EMPLOYEE_MODULE_LABELS[module]), ...EMPLOYEE_OPERATIONS[module].map(operation => t(`employeePermissions.operationLabels.${operation}`))].some(label => label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  return <div className="employee-permissions-fields">
    <div className="employee-permissions-summary"><IoShieldCheckmarkOutline aria-hidden="true" /><div><strong>{t("employeePermissions.granularTitle")}</strong><p>{t("employeePermissions.operationsHint")}</p></div><span data-permission-count>{t("employeePermissions.counts", { count: modules.length, operations: operationCount })}</span></div>
    <div className="employee-permissions-toolbar"><label className="employee-permissions-search"><IoSearchOutline aria-hidden="true" /><span className="sr-only">{t("employeePermissions.search")}</span><input type="search" data-search-permissions value={query} onChange={event => setQuery(event.target.value)} placeholder={t("employeePermissions.search")} /></label><div className="employee-permissions-shortcuts"><button type="button" disabled={disabled} onClick={() => update({ moduleAccess: [...EMPLOYEE_MODULES] })}>{t("employeePermissions.enableSections")}</button><button type="button" disabled={disabled} onClick={() => update({ moduleAccess: [] })}>{t("employeePermissions.disableSections")}</button></div></div>
    <p className="employee-permissions-view-hint">{t("employeePermissions.viewHint")}</p>
    <div className="employee-module-cards">{visible.map(module => {
      const enabled = modules.includes(module), open = expanded.includes(module) || Boolean(query.trim());
      const operations = permissions.operationPermissions[module];
      return <section key={module} className={`employee-module-card${enabled ? " is-enabled" : ""}`} data-permission-module={module}>
        <div className="employee-module-heading"><label htmlFor={`${id}-${module}`}><input id={`${id}-${module}`} data-module-permission={module} type="checkbox" disabled={disabled} checked={enabled} onChange={() => toggle(module)} /><span>{t(EMPLOYEE_MODULE_LABELS[module])}<small>{t(enabled ? operations.length ? "employeePermissions.operationCount" : "employeePermissions.viewOnly" : "employeePermissions.sectionDisabled", { count: operations.length })}</small></span></label><button type="button" aria-expanded={open} aria-controls={`${id}-${module}-operations`} aria-label={t("employeePermissions.expandSection", { name: t(EMPLOYEE_MODULE_LABELS[module]) })} onClick={() => setExpanded(current => current.includes(module) ? current.filter(key => key !== module) : [...current, module])}><IoChevronDownOutline aria-hidden="true" /></button></div>
        {open && <fieldset id={`${id}-${module}-operations`} disabled={disabled || !enabled} className="employee-module-operations"><legend className="sr-only">{t("employeePermissions.sectionOperations", { name: t(EMPLOYEE_MODULE_LABELS[module]) })}</legend><div className="employee-module-tools"><button type="button" onClick={() => choose(module, [...EMPLOYEE_OPERATIONS[module]])}>{t("employeePermissions.allOperations")}</button><button type="button" onClick={() => choose(module, [])}>{t("employeePermissions.viewOnly")}</button><bdi>{operations.length} / {EMPLOYEE_OPERATIONS[module].length}</bdi></div><div className="employee-operation-grid">{EMPLOYEE_OPERATIONS[module].map(operation => <label key={operation} className={operations.includes(operation) ? "is-selected" : ""} htmlFor={`${id}-${module}-${operation}`}><input id={`${id}-${module}-${operation}`} data-operation-module={module} data-operation-permission={operation} type="checkbox" checked={operations.includes(operation)} onChange={event => choose(module, event.target.checked ? [...operations, operation] : operations.filter(key => key !== operation))} /><span>{t(`employeePermissions.operationLabels.${operation}`)}</span></label>)}</div>{module === "workers" && <p className="employee-module-dependency">{t("employeePermissions.workersFinancialDependency")}</p>}{module === "cashier" && <p className="employee-module-dependency">{t("employeePermissions.creditDependency")}</p>}</fieldset>}
      </section>;
    })}</div>
    {!visible.length && <p className="employee-permissions-empty">{t("employeePermissions.noResults")}</p>}
  </div>;
}

import "./employeeOperationPermissions.css";
