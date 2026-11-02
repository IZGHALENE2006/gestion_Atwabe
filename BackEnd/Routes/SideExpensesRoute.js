import express from 'express';
import { auth } from '../middleware/auth.js';
import { addSideExpense, listSideExpenses } from '../controlles/SideExpenses.js';
const router = express.Router();
router.use(auth);
router.get('/', listSideExpenses);
router.post('/', addSideExpense);
export default router;
