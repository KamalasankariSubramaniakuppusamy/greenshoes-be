import { query } from "../db/db.js";

// ---------------------------------------------------
// Helper: Get or create guest wishlist
// ---------------------------------------------------
async function getOrCreateGuestWishlist(req) {
  console.log("HELPER: getOrCreateGuestWishlist called");
  
  let guestId = req.headers["x-guest-id"];
  console.log("Guest ID from header:", guestId);

  if (!guestId) {
    console.log("No guest ID found, creating new guest user...");
    // Create new guest user
    const newGuest = await query(
      `INSERT INTO guest_users (email) VALUES (NULL) RETURNING id`
    );
    guestId = newGuest.rows[0].id;
    console.log("New guest user created with ID:", guestId);
  }

  // Ensure guest wishlist exists
  console.log("Looking for existing wishlist for guest:", guestId);
  let wishlist = await query(
    `SELECT id FROM wishlist WHERE guest_id=$1`,
    [guestId]
  );

  console.log("Wishlist query result:", wishlist.rows);

  if (wishlist.rows.length === 0) {
    console.log("No wishlist found, creating new wishlist...");
    wishlist = await query(
      `INSERT INTO wishlist (guest_id) VALUES ($1) RETURNING id`,
      [guestId]
    );
    console.log("New wishlist created with ID:", wishlist.rows[0].id);
  } else {
    console.log("Existing wishlist found with ID:", wishlist.rows[0].id);
  }

  const result = { wishlistId: wishlist.rows[0].id, guestId };
  console.log("Returning:", result);
  return result;
}

// ---------------------------------------------------
// Helper: Get or create user wishlist
// ---------------------------------------------------
async function getOrCreateUserWishlist(userId) {
  let wishlist = await query(
    `SELECT id FROM wishlist WHERE user_id=$1`,
    [userId]
  );

  if (wishlist.rows.length === 0) {
    wishlist = await query(
      `INSERT INTO wishlist (user_id) VALUES ($1) RETURNING id`,
      [userId]
    );
  }

  return { wishlistId: wishlist.rows[0].id };
}

// ---------------------------------------------------
// GET WISHLIST (supports both guest and logged-in users)
// ---------------------------------------------------
export const getWishlist = async (req, res) => {
  try {
    const user = req.user; // null if guest
    let wishlistId, guestId;

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

    // Get wishlist items with enhanced details
    const items = await query(`
      SELECT 
        wi.product_id,
        p.name,
        p.selling_price,
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

    // Get available colors for each product
    const enhancedItems = [];
    
    for (const item of items.rows) {
      const colors = await query(`
        SELECT c.id, c.value
        FROM product_colors pc
        JOIN colors c ON c.id = pc.color_id
        WHERE pc.product_id=$1
      `, [item.product_id]);

      enhancedItems.push({
        ...item,
        available_colors: colors.rows,
        in_stock: item.variants_in_stock > 0
      });
    }

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

// ---------------------------------------------------
// ADD TO WISHLIST (supports both guest and logged-in users)
// ---------------------------------------------------
export const addToWishlist = async (req, res) => {
  try {
    // DEBUG LOGS START
    console.log("========================================");
    console.log("ADD TO WISHLIST - DEBUG INFO");
    console.log("========================================");
    console.log("Request Headers:", {
      authorization: req.headers.authorization ? "Present" : "Missing",
      "x-guest-id": req.headers["x-guest-id"] || "Missing",
      "content-type": req.headers["content-type"]
    });
    console.log("Request Body:", JSON.stringify(req.body, null, 2));
    console.log("req.user:", req.user ? JSON.stringify(req.user, null, 2) : "null (guest mode)");
    console.log("========================================\n");
    // DEBUG LOGS END

    const user = req.user;
    const { product_id } = req.body;

    console.log("Extracted product_id:", product_id);

    if (!product_id) {
      console.log("ERROR: product_id is missing or undefined");
      return res.status(400).json({ error: "Missing product_id" });
    }

    console.log("product_id validation passed");

    // Verify product exists
    console.log("Checking if product exists in database...");
    const productExists = await query(
      `SELECT id FROM products WHERE id=$1`,
      [product_id]
    );

    console.log("Product query result:", productExists.rows);

    if (productExists.rows.length === 0) {
      console.log("ERROR: Product not found in database");
      return res.status(404).json({ error: "Product not found" });
    }

    console.log("Product exists in database");

    let wishlistId, guestId;

    if (user) {
      // Logged-in user
      console.log("Processing as LOGGED-IN USER, user.id:", user.id);
      const result = await getOrCreateUserWishlist(user.id);
      wishlistId = result.wishlistId;
      console.log("User wishlist ID:", wishlistId);
    } else {
      // Guest user
      console.log("Processing as GUEST USER");
      const result = await getOrCreateGuestWishlist(req);
      wishlistId = result.wishlistId;
      guestId = result.guestId;
      console.log("Guest wishlist ID:", wishlistId);
      console.log("Guest ID:", guestId);
    }

    // Add to wishlist
    console.log("Adding item to wishlist...");
    await query(`
      INSERT INTO wishlist_items (wishlist_id, product_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [wishlistId, product_id]);

    console.log("Successfully added to wishlist");
    console.log("========================================\n");

    return res.json({
      success: true,
      message: "Added to wishlist",
      owner: user ? { userId: user.id } : { guestId }
    });

  } catch (err) {
    console.error("========================================");
    console.error("ADD WISHLIST ERROR - FULL DETAILS:");
    console.error("========================================");
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error("========================================\n");
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// REMOVE FROM WISHLIST (supports both guest and logged-in users)
// ---------------------------------------------------
export const removeFromWishlist = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;

    let wishlistId;

    if (user) {
      const w = await query(
        `SELECT id FROM wishlist WHERE user_id=$1`,
        [user.id]
      );
      if (w.rows.length === 0) {
        return res.status(404).json({ error: "Wishlist not found" });
      }
      wishlistId = w.rows[0].id;
    } else {
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

    await query(`
      DELETE FROM wishlist_items
      WHERE wishlist_id=$1 AND product_id=$2
    `, [wishlistId, productId]);

    return res.json({
      success: true,
      message: "Removed from wishlist"
    });

  } catch (err) {
    console.error("REMOVE WISHLIST ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// MOVE WISHLIST ITEM TO CART (requires color/size selection)
// ---------------------------------------------------
export const moveWishlistToCart = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;
    const { color, size, quantity } = req.body;

    if (!color || !size) {
      return res.status(400).json({ 
        error: "Color and size are required to add to cart" 
      });
    }

    const qty = quantity || 1;

    // Get inventory for this variant
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

    if (qty > availableStock) {
      return res.status(400).json({
        error: `Only ${availableStock} items available in stock`
      });
    }

    // Get cart
    let cartId;
    if (user) {
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

    // Add to cart
    const existing = await query(
      `SELECT id, quantity FROM cart_items
       WHERE cart_id=$1 AND product_id=$2 AND inventory_id=$3`,
      [cartId, productId, inventoryId]
    );

    if (existing.rows.length > 0) {
      const newQty = existing.rows[0].quantity + qty;
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
      await query(
        `INSERT INTO cart_items (cart_id, product_id, inventory_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [cartId, productId, inventoryId, qty]
      );
    }

    // Remove from wishlist
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

// ---------------------------------------------------
// MERGE GUEST WISHLIST WITH USER WISHLIST (on login)
// ---------------------------------------------------
export const mergeGuestWishlist = async (userId, guestId) => {
  try {
    // Get guest wishlist
    const guestWishlist = await query(
      `SELECT id FROM wishlist WHERE guest_id=$1`,
      [guestId]
    );

    if (guestWishlist.rows.length === 0) {
      return; // No guest wishlist to merge
    }

    const guestWishlistId = guestWishlist.rows[0].id;

    // Get or create user wishlist
    const { wishlistId: userWishlistId } = await getOrCreateUserWishlist(userId);

    // Move all guest wishlist items to user wishlist
    await query(`
      INSERT INTO wishlist_items (wishlist_id, product_id)
      SELECT $1, product_id 
      FROM wishlist_items 
      WHERE wishlist_id=$2
      ON CONFLICT DO NOTHING
    `, [userWishlistId, guestWishlistId]);

    // Delete guest wishlist items
    await query(
      `DELETE FROM wishlist_items WHERE wishlist_id=$1`,
      [guestWishlistId]
    );

    // Delete guest wishlist
    await query(
      `DELETE FROM wishlist WHERE id=$1`,
      [guestWishlistId]
    );

    console.log(`Merged guest wishlist (${guestId}) into user wishlist (${userId})`);

  } catch (err) {
    console.error("MERGE GUEST WISHLIST ERROR:", err);
  }
};