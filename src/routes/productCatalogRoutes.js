import express from "express";
import { getCatalog, getSingleProduct } from "../controllers/productCatalogController.js";

const router = express.Router();

// PUBLIC — NO AUTH REQUIRED
router.get("/", getCatalog);              
router.get("/:id", getSingleProduct);     

export default router;
