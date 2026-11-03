import express from 'express'
import { AddEmploye,LoginEmploye,AllEmploye,DeleteEmploye,UpdateEmploye,UpdateEmployeePermissions } from '../controlles/Employe.js'
import { auth } from '../middleware/auth.js'
import { onlyAdmin } from '../middleware/authorize.js'
const router = express.Router()

router.post('/add',auth,onlyAdmin,AddEmploye)
router.post('/Login',LoginEmploye)
router.get('/get',auth,onlyAdmin,AllEmploye)
router.delete('/Delete/:id',auth,onlyAdmin,DeleteEmploye)
router.put('/Update/:id',auth,onlyAdmin,UpdateEmploye)
router.put('/:id/permissions',auth,onlyAdmin,UpdateEmployeePermissions)

export default router
