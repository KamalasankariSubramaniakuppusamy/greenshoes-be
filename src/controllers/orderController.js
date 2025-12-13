// ============================================================================
// customerOrderController.js
// Developer: GreenShoes Team
// ============================================================================
//
// Customer-facing order controller - handles order history and reordering
// For REGISTERED USERS ONLY (requires authentication)
//
// REQUIREMENTS COVERED:
// - "Display unique confirmation ID per order" (order_number in responses)
// - "Display order ID, color, size, addresses, total" (getOrderDetails)
// - "Tax 6% per product" (shown in price_breakdown)
// - "Flat shipping $11.95" (shown in price_breakdown)
// - Separate billing and shipping addresses
//
// DIFFERENCE FROM orderController.js:
// - orderController.js = ADMIN view (sees ALL orders)
// - customerOrderController.js = CUSTOMER view (sees only THEIR orders)
//
// ROUTES THAT USE THIS:
// - GET  /api/orders           → getOrderHistory (list all user's orders)
// - GET  /api/orders/:orderId  → getOrderDetails (single order details)
// - POST /api/orders/:orderId/reorder → reorder (add previous order items to cart)
//
// ============================================================================

import { query } from "../db/db.js";


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ----------------------------------------------------------------------------
// Calculate Delivery Date
// Adds 7 days to order date for estimated delivery
// ----------------------------------------------------------------------------
function calculateDeliveryDate(orderDate) {
  const deliveryDate = new Date(orderDate);
  deliveryDate.setDate(deliveryDate.getDate() + 7);
  
  return {
    date: deliveryDate.toISOString().split('T')[0],  // Format: YYYY-MM-DD
    message: "Your order will arrive in 7 days"
  };
}
// Note: Same function exists in checkoutController.js - could be shared
// But keeping it here for controller independence


// ============================================================================
// GET ORDER HISTORY
// Returns list of all orders for the logged-in user
// ============================================================================
//
// For the "My Orders" page in customer account
// Shows order summary with item count, not full item details
// User clicks an order to see full details via getOrderDetails
//
export const getOrderHistory = async (req, res) => {
  try {
    const userId = req.user.id;  // From auth middleware

    // ---------- FETCH ALL ORDERS FOR THIS USER ----------
    // Include shipping address summary and item count
    // Ordered by newest first (most recent orders at top)
    const orders = await query(
      `SELECT 
        o.id,
        o.order_number,
        o.subtotal,
        o.tax,
        o.shipping_fee,
        o.total_amount,
        o.status,
        o.created_at,
        sa.address1 as shipping_address1,
        sa.city as shipping_city,
        sa.state as shipping_state,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
       FROM orders o
       LEFT JOIN addresses sa ON sa.id = o.shipping_address_id
       WHERE o.user_id=$1
       ORDER BY o.created_at DESC`,
      [userId]
    );
    // Subquery for items_count is convenient but could be optimized
    // with a JOIN + GROUP BY for large order volumes

    // ---------- ENHANCE EACH ORDER WITH ITEMS ----------
    // For each order, fetch the actual items (name, color, size, image)
    // This powers the order card preview in the UI
    const ordersWithItems = [];

    for (const order of orders.rows) {
      // Get items for this order
      // REQUIREMENT: "Display order ID, color, size, addresses, total"
      const items = await query(
        `SELECT 
          oi.quantity,
          oi.price,
          p.name,
          c.value as color,
          s.value as size,
          (SELECT image_url FROM product_images 
           WHERE product_id = p.id 
           ORDER BY priority LIMIT 1) as image_url
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         LEFT JOIN inventory inv ON inv.id = oi.inventory_id
         LEFT JOIN colors c ON c.id = inv.color_id
         LEFT JOIN sizes s ON s.id = inv.size_id
         WHERE oi.order_id=$1`,
        [order.id]
      );

      // Calculate delivery estimate based on order date
      const delivery = calculateDeliveryDate(order.created_at);

      ordersWithItems.push({
        ...order,
        estimated_delivery: delivery.date,
        items: items.rows
      });
    }
    // Note: This is an N+1 query pattern - one query per order
    // For users with many orders, could optimize with single query using array_agg()
    // But for typical user (5-20 orders), this is fine

    return res.json({
      success: true,
      orders: ordersWithItems
    });

  } catch (err) {
    console.error("GET ORDER HISTORY ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// GET SINGLE ORDER DETAILS
// Returns complete details for one order
// REQUIREMENT: "Display order ID, color, size, addresses, total"
// ============================================================================
//
// For the order detail page when customer clicks on an order
// Includes everything: items, payment info, both addresses, price breakdown
//
export const getOrderDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    // ---------- FETCH ORDER WITH BOTH ADDRESSES ----------
    // Security: WHERE clause includes user_id to prevent accessing other users' orders
    // Even if someone guesses an order ID, they can only see their own orders
    const order = await query(
      `SELECT 
        o.*,
        sa.full_name as shipping_name,
        sa.phone as shipping_phone,
        sa.address1 as shipping_address1,
        sa.address2 as shipping_address2,
        sa.city as shipping_city,
        sa.state as shipping_state,
        sa.postal_code as shipping_postal_code,
        sa.country as shipping_country,
        ba.full_name as billing_name,
        ba.address1 as billing_address1,
        ba.city as billing_city,
        ba.state as billing_state,
        ba.postal_code as billing_postal_code,
        ba.country as billing_country
       FROM orders o
       LEFT JOIN addresses sa ON sa.id = o.shipping_address_id
       LEFT JOIN addresses ba ON ba.id = o.billing_address_id
       WHERE o.id=$1 AND o.user_id=$2`,
      [orderId, userId]
    );
    // Using aliases: sa = shipping address, ba = billing address

    // Order not found OR doesn't belong to this user
    // Return same error for both (don't leak info about other orders)
    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderData = order.rows[0];

    // ---------- FETCH ORDER ITEMS ----------
    // Get all line items with product details, color, size, image
    const items = await query(
      `SELECT 
        oi.quantity,
        oi.price,
        p.id as product_id,
        p.name,
        c.value as color,
        s.value as size,
        inv.id as inventory_id,
        (SELECT image_url FROM product_images 
         WHERE product_id = p.id 
         ORDER BY priority LIMIT 1) as image_url
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN inventory inv ON inv.id = oi.inventory_id
       LEFT JOIN colors c ON c.id = inv.color_id
       LEFT JOIN sizes s ON s.id = inv.size_id
       WHERE oi.order_id=$1`,
      [orderId]
    );
    // product_id and inventory_id are included for reorder functionality

    // Calculate subtotal for each line item (price × quantity)
    const itemsWithSubtotals = items.rows.map(item => ({
      ...item,
      subtotal: (parseFloat(item.price) * item.quantity).toFixed(2)
    }));

    // ---------- FETCH PAYMENT INFO ----------
    const payment = await query(
      `SELECT transaction_id, created_at
       FROM payments
       WHERE order_id=$1`,
      [orderId]
    );

    // Calculate delivery estimate
    const delivery = calculateDeliveryDate(orderData.created_at);

    // ---------- BUILD RESPONSE ----------
    // Structured response with all the info customer wants to see
    return res.json({
      success: true,
      order: {
        // Order identification
        // REQUIREMENT: "Display unique confirmation ID per order"
        order_id: orderData.id,
        order_number: orderData.order_number,
        order_date: orderData.created_at,
        status: orderData.status,
        estimated_delivery: delivery.date,
        estimated_delivery_message: delivery.message,
        
        // Line items with color, size, price
        // REQUIREMENT: "Display order ID, color, size, addresses, total"
        items: itemsWithSubtotals,
        
        // Payment info
        payment: {
          transaction_id: payment.rows[0]?.transaction_id,
          payment_date: payment.rows[0]?.created_at,
          payment_method: orderData.payment_method
        },
        
        // Price breakdown
        // REQUIREMENT: "Tax 6% per product", "Flat shipping $11.95"
        price_breakdown: {
          subtotal: orderData.subtotal,
          tax: orderData.tax,
          shipping_fee: orderData.shipping_fee,
          total: orderData.total_amount
        },
        
        // Shipping address
        shipping_address: {
          full_name: orderData.shipping_name,
          phone: orderData.shipping_phone,
          address1: orderData.shipping_address1,
          address2: orderData.shipping_address2,
          city: orderData.shipping_city,
          state: orderData.shipping_state,
          postal_code: orderData.shipping_postal_code,
          country: orderData.shipping_country
        },

        // Billing address (falls back to shipping if same)
        // REQUIREMENT: Separate billing address display
        billing_address: {
          full_name: orderData.billing_name || orderData.shipping_name,
          address1: orderData.billing_address1 || orderData.shipping_address1,
          city: orderData.billing_city || orderData.shipping_city,
          state: orderData.billing_state || orderData.shipping_state,
          postal_code: orderData.billing_postal_code || orderData.shipping_postal_code,
          country: orderData.billing_country || orderData.shipping_country
        }
      }
    });

  } catch (err) {
    console.error("GET ORDER DETAILS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// REORDER
// Adds all items from a previous order to the customer's cart
// ============================================================================
//
// Nice UX feature - "Buy it again" functionality
// Customer clicks "Reorder" on a past order, items get added to cart
//
// Handles edge cases:
// - Items that are now out of stock (skip them, report back)
// - Items already in cart (increase quantity instead of duplicate)
// - Product no longer exists (skip it)
//
export const reorder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    // ---------- VERIFY ORDER BELONGS TO USER ----------
    // Security: Can't reorder someone else's order
    const order = await query(
      `SELECT id FROM orders WHERE id=$1 AND user_id=$2`,
      [orderId, userId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // ---------- GET ITEMS FROM ORIGINAL ORDER ----------
    const items = await query(
      `SELECT product_id, inventory_id, quantity
       FROM order_items
       WHERE order_id=$1`,
      [orderId]
    );

    if (items.rows.length === 0) {
      return res.status(400).json({ error: "Order has no items" });
    }

    // ---------- GET OR CREATE USER'S CART ----------
    // Same pattern as cartController - ensure cart exists
    let cart = await query(
      `SELECT id FROM carts WHERE user_id=$1`,
      [userId]
    );

    let cartId;
    if (cart.rows.length === 0) {
      // No cart exists, create one
      const newCart = await query(
        `INSERT INTO carts (user_id) VALUES ($1) RETURNING id`,
        [userId]
      );
      cartId = newCart.rows[0].id;
    } else {
      cartId = cart.rows[0].id;
    }

    // ---------- ADD ITEMS TO CART ----------
    let addedCount = 0;
    let outOfStockItems = [];

    for (const item of items.rows) {
      // Check if item still has sufficient stock
      // REQUIREMENT: "Inventory can never be negative"
      // We need to verify stock before adding to cart
      const inventory = await query(
        `SELECT quantity FROM inventory WHERE id=$1`,
        [item.inventory_id]
      );

      // Skip if inventory doesn't exist or insufficient stock
      if (inventory.rows.length === 0 || inventory.rows[0].quantity < item.quantity) {
        // Get product info for the "out of stock" report
        const product = await query(
          `SELECT p.name, c.value as color, s.value as size
           FROM products p
           LEFT JOIN inventory inv ON inv.product_id = p.id
           LEFT JOIN colors c ON c.id = inv.color_id
           LEFT JOIN sizes s ON s.id = inv.size_id
           WHERE p.id=$1 AND inv.id=$2`,
          [item.product_id, item.inventory_id]
        );
        
        // Add to out-of-stock list to report back to customer
        outOfStockItems.push({
          name: product.rows[0]?.name,
          color: product.rows[0]?.color,
          size: product.rows[0]?.size
        });
        continue;  // Skip this item, move to next
      }

      // Check if this exact variant is already in cart
      const existing = await query(
        `SELECT id, quantity FROM cart_items
         WHERE cart_id=$1 AND product_id=$2 AND inventory_id=$3`,
        [cartId, item.product_id, item.inventory_id]
      );

      if (existing.rows.length > 0) {
        // Item already in cart - increase quantity
        // TODO: Should check if combined quantity exceeds available stock
        await query(
          `UPDATE cart_items 
           SET quantity = quantity + $1
           WHERE id=$2`,
          [item.quantity, existing.rows[0].id]
        );
      } else {
        // New item - insert into cart
        await query(
          `INSERT INTO cart_items (cart_id, product_id, inventory_id, quantity)
           VALUES ($1, $2, $3, $4)`,
          [cartId, item.product_id, item.inventory_id, item.quantity]
        );
      }

      addedCount++;
    }

    // Return success with details about what was added (and what wasn't)
    return res.json({
      success: true,
      message: `${addedCount} items added to cart from previous order`,
      added_count: addedCount,
      out_of_stock: outOfStockItems  // Customer can see what wasn't available
    });

  } catch (err) {
    console.error("REORDER ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// NOTES & POTENTIAL IMPROVEMENTS
// ============================================================================
//
// 1. Order tracking
//    Currently: Just shows "ORDERED" status and 7-day estimate
//    Better: Real tracking with carrier integration (UPS, FedEx, USPS)
//    Would need: tracking_number field, carrier API integration
//
// 2. Order status updates
//    Customers should be notified when status changes
//    Would need: email/SMS notifications on status update
//
// 3. Order cancellation
//    Currently: "No returns or refunds" per requirements
//    But could allow cancellation within X hours of order (before shipping)
//    Would need: cancellation window logic, inventory restoration
//
// 4. Guest order lookup
//    Guests can't use this controller (requires auth)
//    Could add: /api/orders/lookup?order_number=XXX&email=xxx
//    For guests to check their order status
//
// 5. Pagination for order history
//    Currently: Returns ALL orders
//    Better: Paginated: GET /api/orders?page=1&limit=10
//    For users with many orders over time
//
// 6. Order search/filter
//    Could add: ?status=ORDERED&from=2025-01-01&to=2025-12-31
//    Filter by date range, status, etc.
//
// 7. Reorder improvements
//    - Check combined quantity against available stock
//    - Option to reorder with updated quantities
//    - Handle discontinued products gracefully
//
// 8. Invoice/receipt download
//    Generate PDF invoice for each order
//    Would need: PDF generation library (puppeteer, pdfkit)
//
// ============================================================================