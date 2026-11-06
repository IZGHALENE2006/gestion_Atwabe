import express from 'express'
import { auth } from '../middleware/auth.js'
import { requireOperation } from '../middleware/authorize.js'
import {
  AddUserCridite,
  AllUserCridite,
  GetUserCriditeById,
  AddCreditProduct,
  AddUserPayment,
  DeleteCreditProduct,
  DeleteUsercridite,
} from '../controlles/UserCridite.js'
const router = express.Router()

router.post('/add', auth, AddUserCridite)
router.get('/get', auth, AllUserCridite)
router.get('/get/:id', auth, GetUserCriditeById)
router.post('/add-product/:id', auth, AddCreditProduct)
router.post('/add-payment/:id', auth, AddUserPayment)
router.delete('/DeleteProduct/:id/:productId', auth, requireOperation('credit','deleteDebt'), DeleteCreditProduct)
router.delete('/Delete/:id', auth, requireOperation('credit','delete'), DeleteUsercridite)

export default router
