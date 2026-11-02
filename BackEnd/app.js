import express from 'express'
import cors from 'cors'
import { productImagesDirectory } from './utils/productImages.js'
import { invoiceLogosDirectory } from './utils/invoiceLogos.js'
import InvoiceSettingsRoute from './Routes/InvoiceSettingsRoute.js'
import SalesDocumentsRoute from './Routes/SalesDocumentsRoute.js'
import ClientsRoute from './Routes/ClientsRoute.js'
import FabricsRoute from './Routes/FabricsRoute.js'
import TailoringOrdersRoute from './Routes/TailoringOrdersRoute.js'
import TailoringWorkersRoute from './Routes/TailoringWorkersRoute.js'
import SfifaStockRoute from './Routes/SfifaStockRoute.js'
import SideExpensesRoute from './Routes/SideExpensesRoute.js'
 import AdminLoginRoute from './Routes/LoginAdmin.js'
//import product
import ProductRoute from './Routes/ProductRoute.js'
//import Category
import CategoryRoute from './Routes/CategoryRoute.js'
//imoprt Employe
import EmployeRoute from './Routes/EmployeRoute.js'
//import getme
import GetMeRoute from './Routes/getMeRoute.js'
// impotr ventes
import ventesRoute from './Routes/routeVents.js'
//import Fournisseur
import FournisseurRoute from './Routes/FournisseurRoute.js'
//import User Cridite 
import UserCriditeRoute from './Routes/Usercridite.js'
const app = express()

 app.use(cors())
 app.use(express.json())
 app.use('/uploads/invoice-logos', express.static(invoiceLogosDirectory, {
   dotfiles: 'deny', index: false,
   setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
 }))
 app.use('/invoice-settings', InvoiceSettingsRoute)
 app.use('/sales-documents', SalesDocumentsRoute)
 app.use('/clients', ClientsRoute)
 app.use('/fabrics', FabricsRoute)
 app.use('/tailoring-orders', TailoringOrdersRoute)
 app.use('/tailoring-workers', TailoringWorkersRoute)
 app.use('/sfifa-stock', SfifaStockRoute)
 app.use('/side-expenses', SideExpensesRoute)
 app.use('/uploads/products', express.static(productImagesDirectory, {
   dotfiles: 'deny',
   index: false,
   setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
 }))
 
  app.use('/api/admin',AdminLoginRoute)
   app.use('/Product',ProductRoute)
   app.use('/Category',CategoryRoute)
   app.use('/Employe',EmployeRoute)
   app.use('/user',GetMeRoute)
   app.use('/addVentes',ventesRoute)
   app.use('/Fournisseur',FournisseurRoute)
   app.use('/usercridite',UserCriditeRoute)


export default app
