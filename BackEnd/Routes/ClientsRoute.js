import express from "express";
import { auth } from "../middleware/auth.js";
import { listClients, addClient, updateClient } from "../controlles/Clients.js";

const router = express.Router();
router.use(auth);
router.get("/", listClients);
router.post("/", addClient);
router.put("/:id", updateClient);
export default router;
