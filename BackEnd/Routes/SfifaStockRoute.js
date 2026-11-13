import express from "express";
import { auth } from "../middleware/auth.js";
import { addSfifaStock, getSfifaStockDetails, deleteSfifaStock, listSfifaRestocks, listSfifaStock, restockSfifaVariant, updateSfifaStock, updateSfifaVariant } from "../controlles/SfifaStock.js";

const router = express.Router();
router.use(auth);
router.get("/", listSfifaStock);
router.get("/:id/variants/:variantId/history", listSfifaRestocks);
router.get("/:id/variants/:variantId/details", getSfifaStockDetails);
router.get("/:id/details", getSfifaStockDetails);
router.get("/:id/history", listSfifaRestocks);
router.post("/", addSfifaStock);
router.put("/:id", updateSfifaStock);
router.put("/:id/variants/:variantId", updateSfifaVariant);
router.post("/:id/variants/:variantId/restock", restockSfifaVariant);
router.delete("/:id/variants/:variantId", deleteSfifaStock);
router.delete("/:id", deleteSfifaStock);
export default router;
