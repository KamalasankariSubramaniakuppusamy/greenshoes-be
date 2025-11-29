import { query } from "../db/db.js";

// ---------------------------------------------------
// Helper: Calculate delivery date
// ---------------------------------------------------
function calculateDeliveryDate(orderDate) {
  const deliveryDate = new Date(orderDate);
  deliveryDate.setDate(deliveryDate.getDate() + 7);
  
  return {
    date: deliveryDate.toISOString().split('T')[0],
    message: "Delivery in 7 days"
  };
}

// ---------------------------------------------------
// GET ALL ORDERS (Admin - both guest and registered)
// ---------------------------------------------------
export const adminGetAllOrders = async (req, res) => {
  try {
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

    const ordersWithInfo = orders.rows.map(order => ({
      order_id: order.id,
      order_number: order.order_number,
      customer_name: order.user_name || "Guest Customer",
      customer_email: order.user_email || "N/A",
      customer_type: order.user_id ? "REGISTERED" : "GUEST",
      total_amount: order.total_amount,
      status: order.status,
      created_at: order.created_at,
      shipping_location: `${order.city}, ${order.state}`,
      items_count: order.items_count
    }));

    return res.json({
      success: true,
      orders: ordersWithInfo,
      total_orders: ordersWithInfo.length
    });

  } catch (err) {
    console.error("ADMIN GET ALL ORDERS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// GET SINGLE ORDER DETAILS (Admin)
// ---------------------------------------------------
export const adminGetOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Get order with all details
    const order = await query(
      `SELECT 
        o.*,
        u.full_name as user_name,
        u.email as user_email,
        u.phone as user_phone,
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

    // Calculate item subtotals
    const itemsWithSubtotals = items.rows.map(item => ({
      ...item,
      subtotal: (parseFloat(item.price) * item.quantity).toFixed(2)
    }));

    // Get payment info
    const payment = await query(
      `SELECT transaction_id, amount, created_at
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
        
        customer_type: orderData.user_id ? "REGISTERED" : "GUEST",
        customer_info: {
          name: orderData.user_name || orderData.shipping_name || "Guest Customer",
          email: orderData.user_email || "N/A",
          phone: orderData.user_phone || orderData.shipping_phone
        },
        
        items: itemsWithSubtotals,
        
        payment: {
          transaction_id: payment.rows[0]?.transaction_id,
          amount: payment.rows[0]?.amount,
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
        }
      }
    });

  } catch (err) {
    console.error("ADMIN GET ORDER DETAILS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};