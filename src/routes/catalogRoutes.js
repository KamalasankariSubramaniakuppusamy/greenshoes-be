import express from "express";
import { getFullCatalog } from "../controllers/catalogController.js";

const router = express.Router();

// GET full product catalog (with images, colors, sizes)
router.get("/", getFullCatalog);

export default router;
