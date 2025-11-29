import express from "express";
import {
  getAllAddresses,
  getAddress,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress
} from "../controllers/addressController.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// All address routes require authentication
router.use(authMiddleware);

// GET all addresses
router.get("/", getAllAddresses);

// GET single address
router.get("/:addressId", getAddress);

// ADD new address
router.post("/", addAddress);

// UPDATE address
router.put("/:addressId", updateAddress);

// SET default address
router.patch("/:addressId/set-default", setDefaultAddress);

// DELETE address
router.delete("/:addressId", deleteAddress);

export default router;