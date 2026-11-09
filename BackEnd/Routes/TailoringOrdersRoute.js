import express from "express";
import { auth } from "../middleware/auth.js";
import { uploadTailoringImages } from "../middleware/tailoringUpload.js";
import { addTailoringOrder, getTailoringPhoto, listTailoringOrders, tailoringWriteAccess, updateTailoringOrder, addTailoringPayment, deliverTailoringOrder, cancelTailoringOrder } from "../controlles/TailoringOrders.js";

import { getDjellabaCostSettings, saveDjellabaCostSettings } from "../controlles/DjellabaCostSettings.js";
import { listTailoringTracking } from "../controlles/TailoringTracking.js";

const router = express.Router();
router.use(auth);
router.get("/", listTailoringOrders);
router.get("/work-status", listTailoringTracking);
router.get("/cost-settings", getDjellabaCostSettings);
router.put("/cost-settings", saveDjellabaCostSettings);
router.get("/:id/photo", getTailoringPhoto);
router.get("/:id/items/:lineId/photo", getTailoringPhoto);
router.post("/", tailoringWriteAccess("add"), uploadTailoringImages, addTailoringOrder);
router.put("/:id", tailoringWriteAccess("update"), uploadTailoringImages, updateTailoringOrder);
router.post("/:id/payments", tailoringWriteAccess("payment"), addTailoringPayment);
router.post("/:id/deliver", tailoringWriteAccess("deliver"), deliverTailoringOrder);
router.post("/:id/cancel", tailoringWriteAccess("cancel"), cancelTailoringOrder);
export default router;
