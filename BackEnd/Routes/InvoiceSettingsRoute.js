import express from "express";
import { auth } from "../middleware/auth.js";
import { uploadInvoiceLogo } from "../middleware/invoiceLogoUpload.js";
import { getInvoiceSettings, updateInvoiceSettings } from "../controlles/InvoiceSettings.js";

const router = express.Router();
router.get("/", auth, getInvoiceSettings);
router.put("/", auth, (req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "forbidden" });
  next();
}, uploadInvoiceLogo, updateInvoiceSettings);
export default router;
