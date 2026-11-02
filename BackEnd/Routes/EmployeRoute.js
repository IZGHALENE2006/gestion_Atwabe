import express from 'express'
import { AddEmploye,LoginEmploye,AllEmploye,DeleteEmploye,UpdateEmploye } from '../controlles/Employe.js'
import { auth } from '../middleware/auth.js'
const router = express.Router()

router.post('/add',auth,AddEmploye)
router.post('/Login',LoginEmploye)
router.get('/get',auth,AllEmploye)
router.delete('/Delete/:id',auth,DeleteEmploye)
router.put('/Update/:id',auth,UpdateEmploye)

export default router