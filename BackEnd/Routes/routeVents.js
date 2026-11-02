import express from 'express'
import { AddVente } from '../controlles/Ventes.js';
import { auth } from "../middleware/auth.js";
import { AddCreditCheckout } from "../controlles/CreditCheckout.js";
const router = express.Router()

router.post('/',auth,AddVente)
router.post('/credit', auth, AddCreditCheckout)

export default router   
