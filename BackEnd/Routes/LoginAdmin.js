import { LoginAdmin,getAdminFromToken,CreatAdmin,UpdatePassword} from "../controlles/Admin.js";
import express from 'express'
import { auth } from "../middleware/auth.js";
import { onlyAdmin } from '../middleware/authorize.js';
import { recoveryStatus, saveRecoveryCode, verifyRecoveryCode, resetAdminPassword } from '../controlles/AdminRecovery.js';
import { createRecoveryLimit } from '../middleware/adminRecoveryLimit.js';

const router = express.Router()

router.post("/register", CreatAdmin);
router.post("/Login",LoginAdmin)
router.post('/UpdatePassword',auth,UpdatePassword)
router.get('/GetAdmin',auth,getAdminFromToken)
router.get('/recovery-code', auth, onlyAdmin, recoveryStatus);
router.put('/recovery-code', auth, onlyAdmin, createRecoveryLimit({ key: req => req.user.id }), saveRecoveryCode);
router.post('/recovery/verify', createRecoveryLimit({ limit: 30 }), createRecoveryLimit({ key: req => typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'invalid' }), verifyRecoveryCode);
router.post('/recovery/reset', createRecoveryLimit({ limit: 30 }), resetAdminPassword);
export default router
