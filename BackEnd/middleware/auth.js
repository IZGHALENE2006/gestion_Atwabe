import jwt from 'jsonwebtoken'
import Employee from '../models/EmployeModele.js';
import { employeeCanRequest } from '../../shared/employeePermissions.js';
export const auth= async (req,res,next)=>{
    const authHeader = req.headers.authorization
    if(!authHeader) return res.status(401).json({message:"No token provided"})
        const Token  = authHeader.split(" ")[1]
    try{
        const decoded = jwt.verify(Token,process.env.JWT_SECRET)
        req.user = decoded
    }catch(error){
         return res.status(401).json({ message: "Invalid token" });
    }
    if (req.user.role === 'Employe') {
      try {
        const account = await Employee.findById(req.user.id).select('_id idAdmin isActive role moduleAccess operationPermissions action name');
        if (!account || account.isActive !== true || (account.role && account.role !== 'Employe')) return res.status(403).json({ message: 'forbidden' });
        req.employeeAccount = account;
        req.user.idAdmin = account.idAdmin;
        if (!employeeCanRequest(account, req.method, req.originalUrl, req.body)) return res.status(403).json({ message: 'forbidden', code: 'moduleAccessDenied' });
      } catch { return res.status(500).json({ message: 'accessCheckFailed' }); }
    }
    if (req.user.role === 'admin') req.user.idAdmin = req.user.id;
    next();
}

