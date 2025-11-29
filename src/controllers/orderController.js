import { query } from "../db/db.js";

// ---------------------------------------------------
// Helper: Calculate delivery date
// ---------------------------------------------------
function calculateDeliveryDate(orderDate) {
  const deliveryDate = new Date(orderDate);
  deliveryDate.setDate(deliveryDate.getDate() + 7);
  
  return {
    date: deliveryDate.toISOString().split('T')[0],
    message: "Your order will arrive in 7 days"
  };
}

// ---------------------------------------------------
// GET ORDER HISTORY (registered users only)
// ---------------------------------------------------
export const getOrderHistory = async (req, res) => {
  try {
    const userId = req.user.id;

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

    // Get items for each order
    const ordersWithItems = [];

    for (const order of orders.rows) {
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

      const delivery = calculateDeliveryDate(order.created_at);

      ordersWithItems.push({
        ...order,
        estimated_delivery: delivery.date,
        items: items.rows
      });
    }

    return res.json({
      success: true,
      orders: ordersWithItems
    });

  } catch (err) {
    console.error("GET ORDER HISTORY ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// GET SINGLE ORDER DETAILS (WITH BILLING ADDRESS)
// ---------------------------------------------------
export const getOrderDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    // Get order with BOTH shipping and billing addresses
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

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderData = order.rows[0];

    // Get order items
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

    // Calculate item subtotals
    const itemsWithSubtotals = items.rows.map(item => ({
      ...item,
      subtotal: (parseFloat(item.price) * item.quantity).toFixed(2)
    }));

    // Get payment info
    const payment = await query(
      `SELECT transaction_id, created_at
       FROM payments
       WHERE order_id=$1`,
      [orderId]
    );

    // Calculate delivery date
    const delivery = calculateDeliveryDate(orderData.created_at);

    return res.json({
      success: true,
      order: {
        order_id: orderData.id,
        order_number: orderData.order_number,
        order_date: orderData.created_at,
        status: orderData.status,
        estimated_delivery: delivery.date,
        estimated_delivery_message: delivery.message,
        
        items: itemsWithSubtotals,
        
        payment: {
          transaction_id: payment.rows[0]?.transaction_id,
          payment_date: payment.rows[0]?.created_at,
          payment_method: orderData.payment_method
        },
        
        price_breakdown: {
          subtotal: orderData.subtotal,
          tax: orderData.tax,
          shipping_fee: orderData.shipping_fee,
          total: orderData.total_amount
        },
        
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

        // REQUIREMENT: Show billing address separately
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

// ---------------------------------------------------
// REORDER (add all items from previous order to cart)
// ---------------------------------------------------
export const reorder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    // Verify order belongs to user
    const order = await query(
      `SELECT id FROM orders WHERE id=$1 AND user_id=$2`,
      [orderId, userId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Get order items
    const items = await query(
      `SELECT product_id, inventory_id, quantity
       FROM order_items
       WHERE order_id=$1`,
      [orderId]
    );

    if (items.rows.length === 0) {
      return res.status(400).json({ error: "Order has no items" });
    }

    // Get or create user cart
    let cart = await query(
      `SELECT id FROM carts WHERE user_id=$1`,
      [userId]
    );

    let cartId;
    if (cart.rows.length === 0) {
      const newCart = await query(
        `INSERT INTO carts (user_id) VALUES ($1) RETURNING id`,
        [userId]
      );
      cartId = newCart.rows[0].id;
    } else {
      cartId = cart.rows[0].id;
    }

    // Add items to cart
    let addedCount = 0;
    let outOfStockItems = [];

    for (const item of items.rows) {
      // Check if item still has stock
      const inventory = await query(
        `SELECT quantity FROM inventory WHERE id=$1`,
        [item.inventory_id]
      );

      if (inventory.rows.length === 0 || inventory.rows[0].quantity < item.quantity) {
        const product = await query(
          `SELECT p.name, c.value as color, s.value as size
           FROM products p
           LEFT JOIN inventory inv ON inv.product_id = p.id
           LEFT JOIN colors c ON c.id = inv.color_id
           LEFT JOIN sizes s ON s.id = inv.size_id
           WHERE p.id=$1 AND inv.id=$2`,
          [item.product_id, item.inventory_id]
        );
        
        outOfStockItems.push({
          name: product.rows[0]?.name,
          color: product.rows[0]?.color,
          size: product.rows[0]?.size
        });
        continue;
      }

      // Check if item already in cart
      const existing = await query(
        `SELECT id, quantity FROM cart_items
         WHERE cart_id=$1 AND product_id=$2 AND inventory_id=$3`,
        [cartId, item.product_id, item.inventory_id]
      );

      if (existing.rows.length > 0) {
        await query(
          `UPDATE cart_items 
           SET quantity = quantity + $1
           WHERE id=$2`,
          [item.quantity, existing.rows[0].id]
        );
      } else {
        await query(
          `INSERT INTO cart_items (cart_id, product_id, inventory_id, quantity)
           VALUES ($1, $2, $3, $4)`,
          [cartId, item.product_id, item.inventory_id, item.quantity]
        );
      }

      addedCount++;
    }

    return res.json({
      success: true,
      message: `${addedCount} items added to cart from previous order`,
      added_count: addedCount,
      out_of_stock: outOfStockItems
    });

  } catch (err) {
    console.error("REORDER ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};