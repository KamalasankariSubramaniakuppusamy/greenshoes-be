// ============================================================================
// orderController.js
// Developer: GreenShoes Team
// ============================================================================
//
// Controller for order management - primarily admin-facing
// Handles viewing orders and order details (read-only per requirements)
//
// REQUIREMENTS COVERED:
// - "Display unique confirmation ID per order" (order_number field)
// - "Display order ID, color, size, addresses, total"
// - "Tax 6% per product" (shown in price_breakdown)
// - "Flat shipping $11.95" (shown in price_breakdown)
// - "No returns or refunds" (that's why there's no cancel/refund endpoints here!)
//
// IMPORTANT: This is READ-ONLY order management
// Admin can VIEW orders but cannot modify them (no status updates, no cancellations)
// Per requirements: "No returns or refunds"
//
// ROUTES THAT USE THIS:
// - GET /api/admin/orders          → adminGetAllOrders
// - GET /api/admin/orders/:orderId → adminGetOrderDetails
//
// ============================================================================

import { query } from "../db/db.js";


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ----------------------------------------------------------------------------
// Calculate Delivery Date
// Simple helper that adds 7 days to order date for estimated delivery
// ----------------------------------------------------------------------------
function calculateDeliveryDate(orderDate) {
  const deliveryDate = new Date(orderDate);
  deliveryDate.setDate(deliveryDate.getDate() + 7);
  
  return {
    date: deliveryDate.toISOString().split('T')[0],  // Format: YYYY-MM-DD
    message: "Delivery in 7 days"
  };
}
// Note: This is a simplified calculation
// Real-world would consider: weekends, holidays, shipping zones, carrier estimates
// But for GreenShoes MVP, 7 days flat works fine


// ============================================================================
// ADMIN: GET ALL ORDERS
// Returns a list of all orders (both registered users and guests)
// ============================================================================

export const adminGetAllOrders = async (req, res) => {
  try {
    // Big query that joins orders with users and addresses
    // LEFT JOINs because guest orders won't have a user record
    const orders = await query(
      `SELECT 
        o.id,
        o.order_number,
        o.total_amount,
        o.status,
        o.created_at,
        o.user_id,
        o.guest_id,
        u.full_name as user_name,
        u.email as user_email,
        sa.address1,
        sa.city,
        sa.state,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN addresses sa ON sa.id = o.shipping_address_id
       ORDER BY o.created_at DESC`
    );
    // ORDER BY created_at DESC = newest orders first (most useful for admin)
    // The subquery for items_count is a bit expensive but convenient
    // Could optimize with a JOIN and GROUP BY if performance becomes an issue

    // Transform the raw DB rows into a cleaner format for the frontend
    // This keeps the API response consistent and hides DB column names
    const ordersWithInfo = orders.rows.map(order => ({
      order_id: order.id,
      order_number: order.order_number,                              // REQUIREMENT: unique confirmation ID
      customer_name: order.user_name || "Guest Customer",            // Fallback for guest orders
      customer_email: order.user_email || "N/A",
      customer_type: order.user_id ? "REGISTERED" : "GUEST",         // Helps admin know who they're dealing with
      total_amount: order.total_amount,
      status: order.status,
      created_at: order.created_at,
      shipping_location: `${order.city}, ${order.state}`,            // Quick glance at where it's going
      items_count: order.items_count                                 // "3 items" badge in the UI
    }));

    return res.json({
      success: true,
      orders: ordersWithInfo,
      total_orders: ordersWithInfo.length                            // Handy for "Showing X orders" in UI
    });

  } catch (err) {
    console.error("ADMIN GET ALL ORDERS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// ADMIN: GET SINGLE ORDER DETAILS
// Returns complete details for one order
// REQUIREMENT: "Display order ID, color, size, addresses, total"
// ============================================================================

export const adminGetOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    // ---------- FETCH ORDER WITH CUSTOMER & ADDRESS INFO ----------
    // This is the main order query - gets order + user + shipping address
    const order = await query(
      `SELECT 
        o.*,
        u.full_name as user_name,
        u.email as user_email,
        sa.full_name as shipping_name,
        sa.phone as shipping_phone,
        sa.address1 as shipping_address1,
        sa.address2 as shipping_address2,
        sa.city as shipping_city,
        sa.state as shipping_state,
        sa.postal_code as shipping_postal_code,
        sa.country as shipping_country
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN addresses sa ON sa.id = o.shipping_address_id
       WHERE o.id=$1`,
      [orderId]
    );
    // Using o.* to get all order columns (subtotal, tax, shipping_fee, etc.)
    // LEFT JOINs handle guest orders where user_id is NULL

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderData = order.rows[0];

    // ---------- FETCH ORDER ITEMS WITH PRODUCT DETAILS ----------
    // REQUIREMENT: "Display order ID, color, size, addresses, total"
    // This gets each line item with its color, size, and product image
    const items = await query(
      `SELECT 
        oi.quantity,
        oi.price,
        p.id as product_id,
        p.name,
        p.category,
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
      [orderId]
    );
    // The inventory join chain: order_items → inventory → colors/sizes
    // This gets us the actual color name and size value for display
    // Subquery grabs the main product image (priority 1)

    // Calculate subtotal for each item (price × quantity)
    // Stored price is unit price at time of purchase
    const itemsWithSubtotals = items.rows.map(item => ({
      ...item,
      subtotal: (parseFloat(item.price) * item.quantity).toFixed(2)
    }));

    // ---------- FETCH PAYMENT INFO ----------
    // Get the payment record for this order (if it exists)
    const payment = await query(
      `SELECT transaction_id, amount, created_at
       FROM payments
       WHERE order_id=$1`,
      [orderId]
    );
    // Note: payment.rows[0] might be undefined if payment failed/pending
    // We handle this with optional chaining below (?.)

    // ---------- BUILD RESPONSE ----------
    // Structured response with all the info admin needs to see
    return res.json({
      success: true,
      order: {
        // Basic order info
        order_id: orderData.id,
        order_number: orderData.order_number,                        // REQUIREMENT: unique confirmation ID
        order_date: orderData.created_at,
        status: orderData.status,
        
        // Customer info
        customer_type: orderData.user_id ? "REGISTERED" : "GUEST",
        customer_info: {
          name: orderData.user_name || orderData.shipping_name || "Guest Customer",
          email: orderData.user_email || "N/A",
          phone: orderData.shipping_phone || "N/A"
        },
        
        // Line items with color, size, quantity, price
        // REQUIREMENT: "Display order ID, color, size, addresses, total"
        items: itemsWithSubtotals,
        
        // Payment details
        payment: {
          transaction_id: payment.rows[0]?.transaction_id,
          amount: payment.rows[0]?.amount,
          payment_date: payment.rows[0]?.created_at,
          payment_method: orderData.payment_method
        },
        
        // Price breakdown
        // REQUIREMENT: "Tax 6% per product" and "Flat shipping $11.95"
        price_breakdown: {
          subtotal: orderData.subtotal,
          tax: orderData.tax,                                        // 6% tax
          shipping_fee: orderData.shipping_fee,                      // $11.95 flat
          total: orderData.total_amount
        },
        
        // Shipping address
        // REQUIREMENT: "Display order ID, color, size, addresses, total"
        shipping_address: {
          full_name: orderData.shipping_name,
          phone: orderData.shipping_phone,
          address1: orderData.shipping_address1,
          address2: orderData.shipping_address2,
          city: orderData.shipping_city,
          state: orderData.shipping_state,
          postal_code: orderData.shipping_postal_code,
          country: orderData.shipping_country
        }
      }
    });

  } catch (err) {
    console.error("ADMIN GET ORDER DETAILS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// NOTES ON WHAT'S NOT HERE
// ============================================================================
//
// Why no updateOrderStatus endpoint?
// - Current requirements only have one status: 'ORDERED'
// - "No returns or refunds" means no cancelled/refunded status changes
// - If we add SHIPPED/DELIVERED later, we'd add an update endpoint
//
// Why no cancelOrder endpoint?
// - REQUIREMENT: "No returns or refunds"
// - Orders are final once placed
//
// Why no customer-facing order endpoints here?
// - Customer order history would be in a separate controller
// - Or we could add getUserOrders(req, res) here with user_id filter
// - For now, admin-only is sufficient per requirements
//
// Potential future additions:
// - Export orders to CSV
// - Filter orders by date range, status, customer type
// - Search orders by order_number or customer email
// - Order analytics (total revenue, orders per day, etc.)
//
// ============================================================================