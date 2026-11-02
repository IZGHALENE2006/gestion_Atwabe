import express from "express";
import { auth } from "../middleware/auth.js";
import { listFabrics, addFabric, updateFabric, deleteFabric, deleteFabricColor, deleteFabricPiece, reduceFabricPiece, listFabricMovements, fabricWriteAccess, getFabricPhoto } from "../controlles/Fabrics.js";

import { uploadFabricPhoto } from "../middleware/fabricUpload.js";

const router = express.Router();
router.use(auth);
router.get("/", listFabrics);
router.get("/movements", listFabricMovements);
router.get("/:id/photo", getFabricPhoto);
router.post("/", fabricWriteAccess("add"), uploadFabricPhoto, addFabric);
router.put("/:id", fabricWriteAccess("update"), uploadFabricPhoto, updateFabric);
router.delete("/:id", deleteFabric);
router.delete("/:id/colors/:colorId", deleteFabricColor);
router.delete("/:id/colors/:colorId/pieces/:pieceId", deleteFabricPiece);
router.post("/:id/colors/:colorId/pieces/:pieceId/reductions", reduceFabricPiece);
export default router;
