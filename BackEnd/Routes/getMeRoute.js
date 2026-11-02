import { getMe } from '../controlles/getMe.js'
import express from 'express'
import { auth } from '../middleware/auth.js'
const router = express.Router()


router.get('/getMe',auth,getMe)

export default router