import express from "express";
import {
  getAllProducts,
  getProductDetails,
  getProductImagesByColor
} from "../controllers/productCatalogController.js";

const router = express.Router();

router.get("/", getAllProducts);
router.get("/:id", getProductDetails);
router.get("/:id/gallery/:colorId", getProductImagesByColor);

export default router;
