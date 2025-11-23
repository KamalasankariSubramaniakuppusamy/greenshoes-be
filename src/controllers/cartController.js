import { query } from "../db/db.js";

// ---------------------------------------------------
// Helper: Create cart for a guest
// ---------------------------------------------------
async function getOrCreateGuestCart(req) {
  let guestId = req.headers["x-guest-id"];

  if (!guestId) {
    const newGuest = await query(
      `INSERT INTO guest_users (email) VALUES (NULL) RETURNING id`
    );
    guestId = newGuest.rows[0].id;
  }

  let cart = await query(`SELECT id FROM carts WHERE guest_id=$1`, [guestId]);

  if (cart.rows.length === 0) {
    cart = await query(
      `INSERT INTO carts (guest_id) VALUES ($1) RETURNING id`,
      [guestId]
    );
  }

  return { cartId: cart.rows[0].id, guestId };
}

// ---------------------------------------------------
// Helper: Create cart for registered user
// ---------------------------------------------------
async function getOrCreateUserCart(userId) {
  let cart = await query(`SELECT id FROM carts WHERE user_id=$1`, [userId]);

  if (cart.rows.length === 0) {
    cart = await query(
      `INSERT INTO carts (user_id) VALUES ($1) RETURNING id`,
      [userId]
    );
  }

  return { cartId: cart.rows[0].id };
}

// ---------------------------------------------------
// ADD ITEM TO CART
// ---------------------------------------------------
export const addToCart = async (req, res) => {
  try {
    const user = req.user;
    const { productId, color, size, quantity } = req.body;

    if (!productId || !color || !size)
      return res.status(400).json({
        error: "productId, color, size are required"
      });

    const qty = quantity ?? 1;

    // Get inventoryId and check stock
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

    if (inv.rows.length === 0)
      return res.status(404).json({
        error: `No inventory found for ${color}, size ${size}`
      });

    const inventoryId = inv.rows[0].id;
    const availableStock = inv.rows[0].available_stock;

    // Check if requested quantity is available
    if (qty > availableStock) {
      return res.status(400).json({
        error: `Only ${availableStock} items available in stock`
      });
    }

    // Determine cart owner
    let cartId, guestId;

    if (user) {
      const result = await getOrCreateUserCart(user.id);
      cartId = result.cartId;
    } else {
      const result = await getOrCreateGuestCart(req);
      cartId = result.cartId;
      guestId = result.guestId;
    }

    // Check if this variant already in cart
    const existing = await query(
      `SELECT id, quantity 
       FROM cart_items
       WHERE cart_id=$1 AND product_id=$2 AND inventory_id=$3`,
      [cartId, productId, inventoryId]
    );

    if (existing.rows.length > 0) {
      // Update quantity but check stock
      const newQty = existing.rows[0].quantity + qty;
      
      if (newQty > availableStock) {
        return res.status(400).json({
          error: `Cannot add ${qty} more. Only ${availableStock} items available (you have ${existing.rows[0].quantity} in cart)`
        });
      }

      await query(
        `UPDATE cart_items SET quantity=$1 WHERE id=$2`,
        [newQty, existing.rows[0].id]
      );
    } else {
      // Insert new row
      await query(
        `INSERT INTO cart_items (cart_id, product_id, inventory_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [cartId, productId, inventoryId, qty]
      );
    }

    return res.json({
      success: true,
      message: "Item added to cart",
      cart_owner: user ? { userId: user.id } : { guestId }
    });

  } catch (err) {
    console.error("ADD TO CART ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// GET CART (Enhanced with available colors/sizes)
// ---------------------------------------------------
export const getCart = async (req, res) => {
  try {
    const user = req.user;
    let cartId, guestId;

    if (user) {
      const result = await getOrCreateUserCart(user.id);
      cartId = result.cartId;
    } else {
      const result = await getOrCreateGuestCart(req);
      cartId = result.cartId;
      guestId = result.guestId;
    }

    // Get cart items with product details
    const items = await query(
      `SELECT 
        ci.id as cart_item_id,
        ci.quantity,
        ci.product_id,
        p.name,
        p.selling_price,
        p.description,
        c.value AS color,
        c.id AS color_id,
        s.value AS size,
        s.id AS size_id,
        i.quantity AS available_stock,
        (SELECT image_url FROM product_images 
         WHERE product_id = p.id AND color_id = c.id 
         ORDER BY priority LIMIT 1) as image_url
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      JOIN inventory i ON i.id = ci.inventory_id
      JOIN colors c ON c.id = i.color_id
      JOIN sizes s ON s.id = i.size_id
      WHERE ci.cart_id=$1`,
      [cartId]
    );

    // For each item, get available colors and sizes for that product
    const enhancedItems = [];
    
    for (const item of items.rows) {
      // Get all available colors for this product
      const availableColors = await query(
        `SELECT DISTINCT c.id, c.value
         FROM product_colors pc
         JOIN colors c ON c.id = pc.color_id
         WHERE pc.product_id=$1`,
        [item.product_id]
      );

      // Get all available sizes for this product in the current color
      const availableSizes = await query(
        `SELECT s.id, s.value, i.quantity as stock
         FROM inventory i
         JOIN sizes s ON s.id = i.size_id
         WHERE i.product_id=$1 AND i.color_id=$2
         ORDER BY s.value::float`,
        [item.product_id, item.color_id]
      );

      enhancedItems.push({
        ...item,
        available_colors: availableColors.rows,
        available_sizes: availableSizes.rows
      });
    }

    // Calculate totals
    const subtotal = enhancedItems.reduce((sum, item) => {
      return sum + (parseFloat(item.selling_price) * item.quantity);
    }, 0);

    const tax = subtotal * 0.06; // 6% tax
    const shipping = 11.99;
    const total = subtotal + tax + shipping;

    return res.json({
      success: true,
      cartId,
      owner: user ? { userId: user.id } : { guestId },
      items: enhancedItems,
      summary: {
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        shipping: shipping.toFixed(2),
        total: total.toFixed(2)
      }
    });

  } catch (err) {
    console.error("GET CART ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// UPDATE CART ITEM QUANTITY
// ---------------------------------------------------
export const updateCartItemQuantity = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity < 1) {
      return res.status(400).json({ 
        error: "Quantity must be at least 1. Use DELETE to remove item." 
      });
    }

    // Check if item exists and get stock
    const existing = await query(
      `SELECT ci.id, ci.quantity, i.quantity as available_stock
       FROM cart_items ci
       JOIN inventory i ON i.id = ci.inventory_id
       WHERE ci.id=$1`,
      [itemId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    // Check stock availability
    if (quantity > existing.rows[0].available_stock) {
      return res.status(400).json({ 
        error: `Only ${existing.rows[0].available_stock} items available in stock` 
      });
    }

    // Update quantity
    await query(
      `UPDATE cart_items SET quantity=$1 WHERE id=$2`,
      [quantity, itemId]
    );

    return res.json({
      success: true,
      message: "Cart updated"
    });

  } catch (err) {
    console.error("UPDATE CART QUANTITY ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// INCREASE QUANTITY (+1)
// ---------------------------------------------------
export const increaseQuantity = async (req, res) => {
  try {
    const { itemId } = req.params;

    // Get current quantity and stock
    const existing = await query(
      `SELECT ci.id, ci.quantity, i.quantity as available_stock
       FROM cart_items ci
       JOIN inventory i ON i.id = ci.inventory_id
       WHERE ci.id=$1`,
      [itemId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    const currentQty = existing.rows[0].quantity;
    const availableStock = existing.rows[0].available_stock;
    const newQty = currentQty + 1;

    if (newQty > availableStock) {
      return res.status(400).json({ 
        error: `Cannot add more. Maximum ${availableStock} items available` 
      });
    }

    await query(
      `UPDATE cart_items SET quantity=$1 WHERE id=$2`,
      [newQty, itemId]
    );

    return res.json({
      success: true,
      message: "Quantity increased",
      new_quantity: newQty
    });

  } catch (err) {
    console.error("INCREASE QUANTITY ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// DECREASE QUANTITY (-1)
// ---------------------------------------------------
export const decreaseQuantity = async (req, res) => {
  try {
    const { itemId } = req.params;

    // Get current quantity
    const existing = await query(
      `SELECT quantity FROM cart_items WHERE id=$1`,
      [itemId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    const currentQty = existing.rows[0].quantity;
    const newQty = currentQty - 1;

    if (newQty < 1) {
      return res.status(400).json({ 
        error: "Quantity cannot be less than 1. Use DELETE to remove item." 
      });
    }

    await query(
      `UPDATE cart_items SET quantity=$1 WHERE id=$2`,
      [newQty, itemId]
    );

    return res.json({
      success: true,
      message: "Quantity decreased",
      new_quantity: newQty
    });

  } catch (err) {
    console.error("DECREASE QUANTITY ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// CHANGE COLOR/SIZE (Keep quantity, change variant)
// ---------------------------------------------------
export const changeCartItemVariant = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { color, size } = req.body;

    if (!color || !size) {
      return res.status(400).json({ error: "Color and size are required" });
    }

    // Get current cart item
    const cartItem = await query(
      `SELECT ci.product_id, ci.quantity, ci.cart_id
       FROM cart_items ci
       WHERE ci.id=$1`,
      [itemId]
    );

    if (cartItem.rows.length === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    const { product_id, quantity, cart_id } = cartItem.rows[0];

    // Get new inventory ID for the new color/size
    const newInv = await query(
      `SELECT inventory.id, inventory.quantity as available_stock
       FROM inventory
       JOIN colors ON colors.id = inventory.color_id
       JOIN sizes ON sizes.id = inventory.size_id
       WHERE inventory.product_id=$1
         AND colors.value=$2
         AND sizes.value=$3
       LIMIT 1`,
      [product_id, color, size]
    );

    if (newInv.rows.length === 0) {
      return res.status(404).json({
        error: `No inventory found for ${color}, size ${size}`
      });
    }

    const newInventoryId = newInv.rows[0].id;
    const availableStock = newInv.rows[0].available_stock;

    // Check if enough stock for the quantity
    if (quantity > availableStock) {
      return res.status(400).json({
        error: `Only ${availableStock} items available in ${color}, size ${size}`
      });
    }

    // Check if this variant already exists in cart
    const existingVariant = await query(
      `SELECT id, quantity FROM cart_items
       WHERE cart_id=$1 AND product_id=$2 AND inventory_id=$3 AND id != $4`,
      [cart_id, product_id, newInventoryId, itemId]
    );

    if (existingVariant.rows.length > 0) {
      // Merge with existing variant
      const combinedQty = existingVariant.rows[0].quantity + quantity;
      
      if (combinedQty > availableStock) {
        return res.status(400).json({
          error: `You already have ${existingVariant.rows[0].quantity} of this variant. Cannot add ${quantity} more (max ${availableStock})`
        });
      }

      // Update existing variant quantity
      await query(
        `UPDATE cart_items SET quantity=$1 WHERE id=$2`,
        [combinedQty, existingVariant.rows[0].id]
      );

      // Delete old variant
      await query(`DELETE FROM cart_items WHERE id=$1`, [itemId]);

      return res.json({
        success: true,
        message: "Variant changed and merged with existing item"
      });
    }

    // Update the cart item with new inventory_id
    await query(
      `UPDATE cart_items SET inventory_id=$1 WHERE id=$2`,
      [newInventoryId, itemId]
    );

    return res.json({
      success: true,
      message: "Variant changed successfully"
    });

  } catch (err) {
    console.error("CHANGE VARIANT ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// DELETE CART ITEM
// ---------------------------------------------------
export const removeCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    await query(`DELETE FROM cart_items WHERE id=$1`, [itemId]);

    res.json({
      success: true,
      message: "Item removed"
    });

  } catch (err) {
    console.error("REMOVE CART ITEM ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// MOVE TO WISHLIST (registered only)
// ---------------------------------------------------
export const moveToWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    const result = await query(
      `SELECT product_id FROM cart_items WHERE id=$1 LIMIT 1`,
      [itemId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Item not found" });

    const productId = result.rows[0].product_id;

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

    const wishlistId = wishlist.rows[0].id;

    await query(
      `INSERT INTO wishlist_items (wishlist_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [wishlistId, productId]
    );

    await query(`DELETE FROM cart_items WHERE id=$1`, [itemId]);

    res.json({
      success: true,
      message: "Moved to wishlist"
    });

  } catch (err) {
    console.error("MOVE TO WISHLIST ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};