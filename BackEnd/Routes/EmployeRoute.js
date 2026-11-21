import express from 'express'
import { AddEmploye,LoginEmploye,AllEmploye,DeleteEmploye,UpdateEmploye,UpdateEmployeePermissions } from '../controlles/Employe.js'
import { auth } from '../middleware/auth.js'
import { onlyAdmin } from '../middleware/authorize.js'
import { getAllProfits } from '../controlles/AllProfits.js'
import { getEmployeePayroll, setEmployeeCompensation, addEmployeePayment, getAdminSalesProfit } from '../controlles/EmployeePayroll.js'
const router = express.Router()
router.get('/all-profits',auth,onlyAdmin,getAllProfits)
router.get('/profit-summary',auth,onlyAdmin,getAdminSalesProfit)

router.get('/:id/payroll',auth,onlyAdmin,getEmployeePayroll)
router.post('/:id/compensation',auth,onlyAdmin,setEmployeeCompensation)
router.post('/:id/payments',auth,onlyAdmin,addEmployeePayment)

router.post('/add',auth,onlyAdmin,AddEmploye)
router.post('/Login',LoginEmploye)
router.get('/get',auth,onlyAdmin,AllEmploye)
router.delete('/Delete/:id',auth,onlyAdmin,DeleteEmploye)
router.put('/Update/:id',auth,onlyAdmin,UpdateEmploye)
router.put('/:id/permissions',auth,onlyAdmin,UpdateEmployeePermissions)

export default router
