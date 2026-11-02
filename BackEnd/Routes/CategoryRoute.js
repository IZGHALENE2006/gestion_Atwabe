import { AddCategory,GetCategory,DeleteCategory,UpdateCategory } from "../controlles/Category.js";
import { auth } from "../middleware/auth.js";
import express from 'express'

const router = express.Router()

router.post('/Add',auth,AddCategory)
router.get('/Get',auth,GetCategory)
router.delete('/Delete/:id',auth,DeleteCategory)
router.patch('/Update/:id',auth,UpdateCategory)
export default router