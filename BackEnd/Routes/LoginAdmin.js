import { LoginAdmin,getAdminFromToken,CreatAdmin,UpdatePassword} from "../controlles/Admin.js";
import express from 'express'
import { auth } from "../middleware/auth.js";

const router = express.Router()

router.post("/register", CreatAdmin);
router.post("/Login",LoginAdmin)
router.post('/UpdatePassword',auth,UpdatePassword)
router.get('/GetAdmin',auth,getAdminFromToken)
export default router
