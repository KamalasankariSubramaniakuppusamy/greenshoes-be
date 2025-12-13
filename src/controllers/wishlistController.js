// ============================================================================
// wishlistController.js
// Developer: GreenShoes Team
// ============================================================================
//
// Wishlist controller - "Save for later" functionality
// Supports BOTH registered users AND guests
//
// REQUIREMENTS COVERED:
// - Wishlist/favorites functionality
// - Guest support (wishlist persists without login)
// - "Inventory can never be negative" (stock validation on move to cart)
//
// GUEST WISHLIST ARCHITECTURE:
// - Guest users identified by x-guest-id header
// - If no header, we create a new guest_users record
// - Wishlist linked to either user_id OR guest_id (XOR constraint in DB)
// - On login, guest wishlist can be merged with user wishlist
//
// NOTE: Wishlist stores PRODUCTS, not specific variants
// User selects color/size when moving from wishlist to cart
// This is different from cart, which stores specific variants
//
// ROUTES THAT USE THIS:
// - GET    /api/wishlist                    -> getWishlist
// - POST   /api/wishlist                    -> addToWishlist
// - DELETE /api/wishlist/:productId         -> removeFromWishlist
// - POST   /api/wishlist/:productId/cart    -> moveWishlistToCart
//
// INTERNAL FUNCTION:
// - mergeGuestWishlist(userId, guestId)     -> Called on login to merge wishlists
//
// ============================================================================

import { query } from "../db/db.js";


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ----------------------------------------------------------------------------
// Get or Create Guest Wishlist
// ----------------------------------------------------------------------------
// Called when no authenticated user - supports guest wishlists
// Guest ID comes from x-guest-id header (frontend stores in localStorage)
// If no header provided, creates a new guest user
//
async function getOrCreateGuestWishlist(req) {
  let guestId = req.headers["x-guest-id"];

  // No guest ID? Create a new guest user
  if (!guestId) {
    const newGuest = await query(
      `INSERT INTO guest_users (email) VALUES (NULL) RETURNING id`
    );
    guestId = newGuest.rows[0].id;
  }

  // Check if wishlist exists for this guest
  let wishlist = await query(
    `SELECT id FROM wishlist WHERE guest_id=$1`,
    [guestId]
  );

  // Create wishlist if it doesn't exist
  if (wishlist.rows.length === 0) {
    wishlist = await query(
      `INSERT INTO wishlist (guest_id) VALUES ($1) RETURNING id`,
      [guestId]
    );
  }

  return { wishlistId: wishlist.rows[0].id, guestId };
}


// ----------------------------------------------------------------------------
// Get or Create User Wishlist
// ----------------------------------------------------------------------------
// Simpler than guest - just need user ID from auth middleware
// Each user has exactly one wishlist
//
async function getOrCreateUserWishlist(userId) {
  let wishlist = await query(
    `SELECT id FROM wishlist WHERE user_id=$1`,
    [userId]
  );

  // Create wishlist if it doesn't exist
  if (wishlist.rows.length === 0) {
    wishlist = await query(
      `INSERT INTO wishlist (user_id) VALUES ($1) RETURNING id`,
      [userId]
    );
  }

  return { wishlistId: wishlist.rows[0].id };
}


// ============================================================================
// GET WISHLIST
// Returns all wishlisted products with their details
// ============================================================================
//
// Supports both guests and logged-in users
// Returns product info, images, available colors/sizes, stock status
//
// Note: Wishlist stores products, not variants
// So we return ALL available colors and sizes for each product
// User will pick specific variant when moving to cart
//
export const getWishlist = async (req, res) => {
  try {
    const user = req.user;  // null if guest
    let wishlistId, guestId;

    // ---------- GET OR CREATE WISHLIST ----------
    if (user) {
      // Logged-in user
      const result = await getOrCreateUserWishlist(user.id);
      wishlistId = result.wishlistId;
    } else {
      // Guest user
      const result = await getOrCreateGuestWishlist(req);
      wishlistId = result.wishlistId;
      guestId = result.guestId;
    }

    // ---------- FETCH WISHLIST ITEMS WITH PRODUCT DETAILS ----------
    // Get basic product info plus stock availability
    const items = await query(`
      SELECT 
        wi.product_id,
        p.name,
        p.selling_price,
        p.sale_price,
        p.on_sale,
        p.description,
        p.category,
        (SELECT image_url FROM product_images 
         WHERE product_id = p.id 
         ORDER BY priority LIMIT 1) as main_image,
        (SELECT COUNT(*) FROM inventory 
         WHERE product_id = p.id AND quantity > 0) as variants_in_stock
      FROM wishlist_items wi
      JOIN products p ON p.id = wi.product_id
      WHERE wi.wishlist_id=$1
      ORDER BY wi.added_at DESC
    `, [wishlistId]);
    // ORDER BY added_at DESC = most recently added items first
    // variants_in_stock counts how many size/color combos have stock

    // ---------- ENHANCE EACH ITEM WITH VARIANT OPTIONS ----------
    // For each wishlisted product, get available colors and sizes
    // Frontend needs this to show variant selector when moving to cart
    const enhancedItems = [];
    
    for (const item of items.rows) {
      // Get all colors this product comes in
      const colors = await query(`
        SELECT c.id, c.value
        FROM product_colors pc
        JOIN colors c ON c.id = pc.color_id
        WHERE pc.product_id=$1
      `, [item.product_id]);

      // Get sizes that are currently in stock
      // Only show sizes with quantity > 0 (can't buy out-of-stock)
      const sizes = await query(`
        SELECT DISTINCT s.id, s.value
        FROM inventory i
        JOIN sizes s ON s.id = i.size_id
        WHERE i.product_id=$1 AND i.quantity > 0
        ORDER BY s.value
      `, [item.product_id]);

      enhancedItems.push({
        ...item,
        available_colors: colors.rows,
        available_sizes: sizes.rows.map(s => s.value),  // Return as simple array
        in_stock: item.variants_in_stock > 0            // Boolean for quick check
      });
    }
    // Note: N+1 query pattern - could optimize for large wishlists
    // But wishlists are typically small (5-20 items), so this is fine

    return res.json({
      success: true,
      wishlistId,
      owner: user ? { userId: user.id } : { guestId },
      items: enhancedItems
    });

  } catch (err) {
    console.error("GET WISHLIST ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// ADD TO WISHLIST
// Adds a product to the user's wishlist
// ============================================================================
//
// Request body: { product_id }
//
// Note: We add the PRODUCT, not a specific variant
// User will select color/size when they decide to buy
//
// Uses ON CONFLICT DO NOTHING to handle duplicate adds gracefully
// (idempotent - adding same product twice is a no-op)
//
export const addToWishlist = async (req, res) => {
  try {
    const user = req.user;
    const { product_id } = req.body;

    // ---------- VALIDATE INPUT ----------
    if (!product_id) {
      return res.status(400).json({ error: "Missing product_id" });
    }

    // Verify product exists (can't wishlist a non-existent product)
    const productExists = await query(
      `SELECT id FROM products WHERE id=$1`,
      [product_id]
    );

    if (productExists.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // ---------- GET OR CREATE WISHLIST ----------
    let wishlistId, guestId;

    if (user) {
      const result = await getOrCreateUserWishlist(user.id);
      wishlistId = result.wishlistId;
    } else {
      const result = await getOrCreateGuestWishlist(req);
      wishlistId = result.wishlistId;
      guestId = result.guestId;
    }

    // ---------- ADD TO WISHLIST ----------
    // ON CONFLICT DO NOTHING handles the case where product is already wishlisted
    // This makes the operation idempotent - safe to call multiple times
    await query(`
      INSERT INTO wishlist_items (wishlist_id, product_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [wishlistId, product_id]);

    return res.json({
      success: true,
      message: "Added to wishlist",
      owner: user ? { userId: user.id } : { guestId }
    });

  } catch (err) {
    console.error("ADD WISHLIST ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// REMOVE FROM WISHLIST
// Removes a product from the user's wishlist
// ============================================================================
//
// URL param: productId
//
// Supports both guests and logged-in users
// Verifies ownership before deleting (users can only modify their own wishlist)
//
export const removeFromWishlist = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;

    let wishlistId;

    // ---------- GET WISHLIST WITH OWNERSHIP CHECK ----------
    if (user) {
      // Logged-in user - find their wishlist
      const w = await query(
        `SELECT id FROM wishlist WHERE user_id=$1`,
        [user.id]
      );
      if (w.rows.length === 0) {
        return res.status(404).json({ error: "Wishlist not found" });
      }
      wishlistId = w.rows[0].id;
    } else {
      // Guest user - need guest ID from header
      const guestId = req.headers["x-guest-id"];
      if (!guestId) {
        return res.status(400).json({ error: "Guest ID required" });
      }
      const w = await query(
        `SELECT id FROM wishlist WHERE guest_id=$1`,
        [guestId]
      );
      if (w.rows.length === 0) {
        return res.status(404).json({ error: "Wishlist not found" });
      }
      wishlistId = w.rows[0].id;
    }

    // ---------- DELETE FROM WISHLIST ----------
    // Only deletes if the product is in THIS user's wishlist
    await query(`
      DELETE FROM wishlist_items
      WHERE wishlist_id=$1 AND product_id=$2
    `, [wishlistId, productId]);
    // Note: Doesn't error if product wasn't in wishlist (idempotent)

    return res.json({
      success: true,
      message: "Removed from wishlist"
    });

  } catch (err) {
    console.error("REMOVE WISHLIST ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// MOVE WISHLIST ITEM TO CART
// Moves a wishlisted product to cart with selected variant
// ============================================================================
//
// URL param: productId
// Request body: { color, size, quantity? }
//
// Key difference from cart's addToCart:
// This also REMOVES the item from wishlist after adding to cart
// It's a "move" operation, not a "copy"
//
// Requires color and size because:
// - Wishlist stores products (no variant info)
// - Cart needs specific variants (size + color)
// - User must choose when moving to cart
//
export const moveWishlistToCart = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;
    const { color, size, quantity } = req.body;

    // ---------- VALIDATE INPUT ----------
    // Color and size are required - can't add to cart without them
    if (!color || !size) {
      return res.status(400).json({ 
        error: "Color and size are required to add to cart" 
      });
    }

    const qty = quantity || 1;  // Default to 1 if not specified

    // ---------- FIND INVENTORY FOR THIS VARIANT ----------
    // Get the specific size/color combination's inventory
    const inv = await query(
      `SELECT inventory.id, inventory.quantity as available_stock
       FROM inventory
       JOIN colors ON colors.id = inventory.color_id
       JOIN sizes ON sizes.id = inventory.size_id
       WHERE inventory.product_id=$1
         AND colors.value=$2
         AND sizes.value=$3
       LIMIT 1`,
      [productId, color, size]
    );

    if (inv.rows.length === 0) {
      return res.status(404).json({
        error: `No inventory found for ${color}, size ${size}`
      });
    }

    const inventoryId = inv.rows[0].id;
    const availableStock = inv.rows[0].available_stock;

    // REQUIREMENT: "Inventory can never be negative"
    // Validate requested quantity doesn't exceed stock
    if (qty > availableStock) {
      return res.status(400).json({
        error: `Only ${availableStock} items available in stock`
      });
    }

    // ---------- GET OR CREATE CART ----------
    let cartId;
    if (user) {
      // Logged-in user
      const cart = await query(
        `SELECT id FROM carts WHERE user_id=$1`,
        [user.id]
      );
      if (cart.rows.length === 0) {
        const newCart = await query(
          `INSERT INTO carts (user_id) VALUES ($1) RETURNING id`,
          [user.id]
        );
        cartId = newCart.rows[0].id;
      } else {
        cartId = cart.rows[0].id;
      }
    } else {
      // Guest user
      const guestId = req.headers["x-guest-id"];
      if (!guestId) {
        return res.status(400).json({ error: "Guest ID required" });
      }
      const cart = await query(
        `SELECT id FROM carts WHERE guest_id=$1`,
        [guestId]
      );
      if (cart.rows.length === 0) {
        const newCart = await query(
          `INSERT INTO carts (guest_id) VALUES ($1) RETURNING id`,
          [guestId]
        );
        cartId = newCart.rows[0].id;
      } else {
        cartId = cart.rows[0].id;
      }
    }

    // ---------- ADD TO CART ----------
    // Same logic as cartController.addToCart
    // Check if this variant already in cart
    const existing = await query(
      `SELECT id, quantity FROM cart_items
       WHERE cart_id=$1 AND product_id=$2 AND inventory_id=$3`,
      [cartId, productId, inventoryId]
    );

    if (existing.rows.length > 0) {
      // Item already in cart - increase quantity
      const newQty = existing.rows[0].quantity + qty;
      
      // But first check stock
      if (newQty > availableStock) {
        return res.status(400).json({
          error: `Cannot add ${qty} more. Maximum ${availableStock} available`
        });
      }
      
      await query(
        `UPDATE cart_items SET quantity=$1 WHERE id=$2`,
        [newQty, existing.rows[0].id]
      );
    } else {
      // New item in cart
      await query(
        `INSERT INTO cart_items (cart_id, product_id, inventory_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [cartId, productId, inventoryId, qty]
      );
    }

    // ---------- REMOVE FROM WISHLIST ----------
    // This is the "move" part - item leaves wishlist when it goes to cart
    let wishlistId;
    if (user) {
      const w = await query(
        `SELECT id FROM wishlist WHERE user_id=$1`,
        [user.id]
      );
      if (w.rows.length > 0) {
        wishlistId = w.rows[0].id;
      }
    } else {
      const guestId = req.headers["x-guest-id"];
      const w = await query(
        `SELECT id FROM wishlist WHERE guest_id=$1`,
        [guestId]
      );
      if (w.rows.length > 0) {
        wishlistId = w.rows[0].id;
      }
    }

    if (wishlistId) {
      await query(
        `DELETE FROM wishlist_items 
         WHERE wishlist_id=$1 AND product_id=$2`,
        [wishlistId, productId]
      );
    }

    return res.json({
      success: true,
      message: "Moved to cart"
    });

  } catch (err) {
    console.error("MOVE TO CART ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// MERGE GUEST WISHLIST WITH USER WISHLIST
// Called when a guest user logs in or creates an account
// ============================================================================
//
// Parameters:
// - userId: The logged-in user's ID
// - guestId: The guest ID from x-guest-id header
//
// This is an INTERNAL function (not an HTTP endpoint)
// Called from auth controller after successful login
//
// Flow:
// 1. Find guest's wishlist
// 2. Find (or create) user's wishlist
// 3. Copy all items from guest wishlist to user wishlist
// 4. Delete guest wishlist and items
//
// Uses ON CONFLICT DO NOTHING to handle duplicates
// (if guest and user both wishlisted same product, keep one copy)
//
export const mergeGuestWishlist = async (userId, guestId) => {
  try {
    // ---------- FIND GUEST WISHLIST ----------
    const guestWishlist = await query(
      `SELECT id FROM wishlist WHERE guest_id=$1`,
      [guestId]
    );

    if (guestWishlist.rows.length === 0) {
      return;  // No guest wishlist to merge - nothing to do
    }

    const guestWishlistId = guestWishlist.rows[0].id;

    // ---------- GET OR CREATE USER WISHLIST ----------
    const { wishlistId: userWishlistId } = await getOrCreateUserWishlist(userId);

    // ---------- COPY ITEMS FROM GUEST TO USER ----------
    // INSERT ... SELECT pattern copies rows between tables
    // ON CONFLICT DO NOTHING handles products that are in both wishlists
    await query(`
      INSERT INTO wishlist_items (wishlist_id, product_id)
      SELECT $1, product_id 
      FROM wishlist_items 
      WHERE wishlist_id=$2
      ON CONFLICT DO NOTHING
    `, [userWishlistId, guestWishlistId]);

    // ---------- CLEAN UP GUEST WISHLIST ----------
    // Delete items first (foreign key constraint)
    await query(
      `DELETE FROM wishlist_items WHERE wishlist_id=$1`,
      [guestWishlistId]
    );

    // Then delete the wishlist itself
    await query(
      `DELETE FROM wishlist WHERE id=$1`,
      [guestWishlistId]
    );

    console.log(`Merged guest wishlist (${guestId}) into user wishlist (${userId})`);

  } catch (err) {
    // Don't throw - wishlist merge failure shouldn't block login
    console.error("MERGE GUEST WISHLIST ERROR:", err);
  }
};


// ============================================================================
// NOTES & POTENTIAL IMPROVEMENTS FOR FUTURE
// ============================================================================
//
// 1. Wishlist item limit
//    Currently: Unlimited items
//    Consider: Limit to 50-100 items per wishlist
//    Prevents abuse and keeps queries fast
//
// 2. Wishlist sharing
//    Could add: Public wishlist URLs for gift registries
//    Would need: is_public flag, shareable link generation
//
// 3. Price drop notifications
//    Track prices when items are wishlisted
//    Notify user when price drops or item goes on sale
//    Would need: wishlisted_price column, notification system
//
// 4. "Back in stock" notifications
//    If user wishlists something that's out of stock
//    Notify them when it becomes available
//    Would need: notification preferences, background job
//
// 5. Cart merging
//    Currently only wishlist merge is implemented
//    Could also merge guest cart on login (see cartController notes)
//
// 6. Wishlist expiration for guests
//    Guest wishlists stick around forever
//    Should clean up old guest wishlists (30+ days)
//    Same cleanup job as guest carts
//
// 7. Analytics
//    Track most wishlisted products
//    Useful for merchandising decisions
//    "X people have this in their wishlist" social proof
//
// ============================================================================