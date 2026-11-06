import useEmployeeOperations from "../../hooks/useEmployeeOperations.js";

export default function EmployeeOperation({ module, operation, anyOf, children }) {
  const permissions = useEmployeeOperations(module);
  return (anyOf ? anyOf.some(key => permissions[key]) : permissions[operation]) ? children : null;
}
