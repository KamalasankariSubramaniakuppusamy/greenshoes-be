import { query } from "../db/db.js";

// ---------------------------------------------------
// Helper: Get or create guest wishlist
// ---------------------------------------------------
async function getOrCreateGuestWishlist(req) {
  let guestId = req.headers["x-guest-id"];

  if (!guestId) {
    // Create new guest user
    const newGuest = await query(
      `INSERT INTO guest_users (email) VALUES (NULL) RETURNING id`
    );
    guestId = newGuest.rows[0].id;
  }

  // Ensure guest wishlist exists
  let wishlist = await query(
    `SELECT id FROM wishlist WHERE guest_id=$1`,
    [guestId]
  );

  if (wishlist.rows.length === 0) {
    wishlist = await query(
      `INSERT INTO wishlist (guest_id) VALUES ($1) RETURNING id`,
      [guestId]
    );
  }

  return { wishlistId: wishlist.rows[0].id, guestId };
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

    // Get available colors AND sizes for each product
    const enhancedItems = [];
    
    for (const item of items.rows) {
      // Get colors
      const colors = await query(`
        SELECT c.id, c.value
        FROM product_colors pc
        JOIN colors c ON c.id = pc.color_id
        WHERE pc.product_id=$1
      `, [item.product_id]);

      // Get sizes (from inventory where quantity > 0)
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
        available_sizes: sizes.rows.map(s => s.value), // Return as array of values
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
    const user = req.user;
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "Missing product_id" });
    }

    // Verify product exists
    const productExists = await query(
      `SELECT id FROM products WHERE id=$1`,
      [product_id]
    );

    if (productExists.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

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

    // Add to wishlist
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