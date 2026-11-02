import {
  AddFournisseur,
  GetFournisseur,
  DeleteFournisseur,
  UpdateFournisseur,
} from "../controlles/Fournisseur.js";

import { auth } from "../middleware/auth.js";
import express from "express";
import { GetSupplierInvoices, AddSupplierInvoice, AddSupplierPayment } from "../controlles/SupplierInvoices.js";

const router = express.Router();

router.post("/Add", auth, AddFournisseur);
router.get("/Get", auth, GetFournisseur);
router.delete("/Delete/:id", auth, DeleteFournisseur);
router.patch("/Update/:id", auth, UpdateFournisseur);
router.get("/:id/invoices", auth, GetSupplierInvoices);
router.post("/:id/invoices", auth, AddSupplierInvoice);
router.post("/:id/invoices/:invoiceId/payments", auth, AddSupplierPayment);

export default router;
