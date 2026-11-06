import { canEmployeeOperation } from "../../shared/employeePermissions.js";
export const authorize = (roles)=>{
  return(req,res,next)=>{
 if(!roles.includes(req.user.role)){
        return res.status(403).json({
        message: "Access denied"
      });
 }
 next()
  }
}

export const onlyAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};
export const requireOperation = (module, operation) => (req, res, next) => {
  if (!canEmployeeOperation(req.user?.role, req.employeeAccount, module, operation)) return res.status(403).json({ message: "forbidden" });
  next();
};
