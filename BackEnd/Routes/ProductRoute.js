import express from 'express'
import { restockProduct } from '../controlles/ProductRestocks.js';
import { CreateProduct,AllProduct ,DeleteProduct,UpdateProduit} from '../controlles/Product.js'

import { auth } from "../middleware/auth.js";
import { onlyAdmin } from '../middleware/authorize.js';
import { uploadProductImage } from '../middleware/productUpload.js';
const router = express.Router()

router.get('/Get',auth,AllProduct)
router.post('/:id/restocks',auth,onlyAdmin,restockProduct)
router.post('/Add',auth,onlyAdmin,uploadProductImage,CreateProduct)
router.delete('/Delete/:id',auth,onlyAdmin,DeleteProduct)
router.put('/Update/:id',auth,onlyAdmin,uploadProductImage,UpdateProduit)
export default router
