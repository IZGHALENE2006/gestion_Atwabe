import express from "express";
import { auth } from "../middleware/auth.js";
import { listSalesDocuments, addSalesDocument } from "../controlles/SalesDocuments.js";

const router = express.Router();
router.use(auth);
router.get("/", listSalesDocuments);
router.post("/", addSalesDocument);
export default router;
