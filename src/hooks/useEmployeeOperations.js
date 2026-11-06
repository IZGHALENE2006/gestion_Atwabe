import { useSelector } from "react-redux";
import { moduleOperationPermissions } from "../../shared/employeePermissions.js";

export default function useEmployeeOperations(module) {
  const { role, user } = useSelector(state => state.LoginAdmin);
  return moduleOperationPermissions(role, user, module);
}
