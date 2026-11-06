import express from 'express'
import { restockProduct } from '../controlles/ProductRestocks.js';
import { CreateProduct,AllProduct ,DeleteProduct,UpdateProduit} from '../controlles/Product.js'

import { auth } from "../middleware/auth.js";
import { requireOperation } from '../middleware/authorize.js';
import { uploadProductImage } from '../middleware/productUpload.js';
const router = express.Router()

router.get('/Get',auth,AllProduct)
router.post('/:id/restocks',auth,requireOperation('products','restock'),restockProduct)
router.post('/Add',auth,requireOperation('products','add'),uploadProductImage,CreateProduct)
router.delete('/Delete/:id',auth,requireOperation('products','delete'),DeleteProduct)
router.put('/Update/:id',auth,requireOperation('products','update'),uploadProductImage,UpdateProduit)
export default router
