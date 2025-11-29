import { query } from "../db/db.js";
import { verifyCardForPayment, processOneTimePayment } from "./paymentCardController.js";

// ---------------------------------------------------
// Helper: Generate order number
// ---------------------------------------------------
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

// ---------------------------------------------------
// Helper: Calculate order totals (WITH SALE PRICES)
// REQUIREMENT: Use sale_price if on_sale, else selling_price
// ---------------------------------------------------
async function calculateOrderTotals(cartItems) {
  let subtotal = 0;

  for (const item of cartItems) {
    const product = await query(
      `SELECT selling_price, on_sale, sale_price FROM products WHERE id=$1`,
      [item.product_id]
    );
    
    // REQUIREMENT: Use sale price if product is on sale
    const price = product.rows[0].on_sale && product.rows[0].sale_price
      ? parseFloat(product.rows[0].sale_price)
      : parseFloat(product.rows[0].selling_price);
    
    subtotal += price * item.quantity;
  }

  const tax = subtotal * 0.06; // 6% tax
  const shipping_fee = 11.95; // ✅ FIXED: $11.95 per requirements
  const total = subtotal + tax + shipping_fee;

  return {
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    shipping_fee: shipping_fee.toFixed(2),
    total: total.toFixed(2)
  };
}

// ---------------------------------------------------
// Helper: Calculate estimated delivery date (7 days from now)
// ---------------------------------------------------
function calculateDeliveryDate() {
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 7);
  
  return {
    date: deliveryDate.toISOString().split('T')[0], // YYYY-MM-DD
    message: "Your order will arrive in 7 days"
  };
}

// ---------------------------------------------------
// Helper: Get order summary for response
// ---------------------------------------------------
async function getOrderSummary(orderId) {
  // Get order details with BOTH shipping and billing addresses
  const order = await query(
    `SELECT o.*, 
            sa.full_name as shipping_full_name, 
            sa.phone as shipping_phone, 
            sa.address1 as shipping_address1, 
            sa.address2 as shipping_address2, 
            sa.city as shipping_city, 
            sa.state as shipping_state, 
            sa.postal_code as shipping_postal_code, 
            sa.country as shipping_country,
            ba.full_name as billing_full_name,
            ba.address1 as billing_address1,
            ba.city as billing_city,
            ba.state as billing_state,
            ba.postal_code as billing_postal_code,
            ba.country as billing_country
     FROM orders o
     LEFT JOIN addresses sa ON sa.id = o.shipping_address_id
     LEFT JOIN addresses ba ON ba.id = o.billing_address_id
     WHERE o.id=$1`,
    [orderId]
  );

  if (order.rows.length === 0) {
    throw new Error("Order not found");
  }

  const orderData = order.rows[0];

  // Get order items
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
    [orderId]
  );

  // Calculate item subtotals
  const itemsWithSubtotals = items.rows.map(item => ({
    ...item,
    subtotal: (parseFloat(item.price) * item.quantity).toFixed(2)
  }));

  // Get payment info
  const payment = await query(
    `SELECT transaction_id FROM payments WHERE order_id=$1`,
    [orderId]
  );

  // Calculate delivery date
  const delivery = calculateDeliveryDate();

  return {
    order_id: orderData.id,
    order_number: orderData.order_number,
    order_date: orderData.created_at,
    estimated_delivery: delivery.date,
    estimated_delivery_message: delivery.message,
    
    items: itemsWithSubtotals,
    
    payment: {
      transaction_id: payment.rows[0]?.transaction_id,
      message: `Payment processed successfully (Demo)`
    },
    
    price_breakdown: {
      subtotal: orderData.subtotal,
      tax: orderData.tax,
      shipping_fee: orderData.shipping_fee,
      total: orderData.total_amount
    },
    
    shipping_address: {
      full_name: orderData.shipping_full_name,
      phone: orderData.shipping_phone,
      address1: orderData.shipping_address1,
      address2: orderData.shipping_address2,
      city: orderData.shipping_city,
      state: orderData.shipping_state,
      postal_code: orderData.shipping_postal_code,
      country: orderData.shipping_country
    },

    // REQUIREMENT: Separate billing address
    billing_address: {
      full_name: orderData.billing_full_name || orderData.shipping_full_name,
      address1: orderData.billing_address1 || orderData.shipping_address1,
      city: orderData.billing_city || orderData.shipping_city,
      state: orderData.billing_state || orderData.shipping_state,
      postal_code: orderData.billing_postal_code || orderData.shipping_postal_code,
      country: orderData.billing_country || orderData.shipping_country
    }
  };
}

// ---------------------------------------------------
// CHECKOUT - REGISTERED USER (with saved card)
// ---------------------------------------------------
export const checkoutRegisteredUserSavedCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      shipping_address_id,
      billing_address_id, // REQUIREMENT: Separate billing address
      cvc // User must always enter CVC
    } = req.body;

    // Validate required fields
    if (!shipping_address_id || !cvc) {
      return res.status(400).json({ 
        error: "Missing required fields: shipping_address_id, cvc" 
      });
    }

    // REQUIREMENT: Use billing_address_id if provided, else use shipping
    const finalBillingAddressId = billing_address_id || shipping_address_id;

    // Get user's cart
    const cart = await query(
      `SELECT id FROM carts WHERE user_id=$1`,
      [userId]
    );

    if (cart.rows.length === 0) {
      return res.status(400).json({ error: "Cart not found" });
    }

    const cartId = cart.rows[0].id;

    // Get cart items WITH sale prices
    const cartItems = await query(
      `SELECT 
        ci.product_id, 
        ci.inventory_id, 
        ci.quantity, 
        p.selling_price,
        p.on_sale,
        p.sale_price,
        CASE 
          WHEN p.on_sale = TRUE AND p.sale_price IS NOT NULL 
          THEN p.sale_price 
          ELSE p.selling_price 
        END as effective_price
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id=$1`,
      [cartId]
    );

    if (cartItems.rows.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Verify saved card and CVC
    const cardVerification = await verifyCardForPayment(userId, cvc);
    
    if (!cardVerification.valid) {
      return res.status(400).json({ error: "Card verification failed" });
    }

    // Calculate totals
    const totals = await calculateOrderTotals(cartItems.rows);

    // Simulate payment success
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create order
    const orderNumber = generateOrderNumber();
    
    const order = await query(
      `INSERT INTO orders 
       (user_id, shipping_address_id, billing_address_id, 
        subtotal, tax, shipping_fee, total_amount, 
        status, order_number, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ORDERED', $8, 'DEBIT_CARD')
       RETURNING *`,
      [
        userId,
        shipping_address_id,
        finalBillingAddressId, // ✅ Separate billing address
        totals.subtotal,
        totals.tax,
        totals.shipping_fee,
        totals.total,
        orderNumber
      ]
    );

    const orderId = order.rows[0].id;

    // Add order items (use effective_price - sale price if on sale)
    for (const item of cartItems.rows) {
      await query(
        `INSERT INTO order_items 
         (order_id, product_id, inventory_id, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.product_id, item.inventory_id, item.effective_price, item.quantity]
      );

      // Reduce inventory
      await query(
        `UPDATE inventory 
         SET quantity = quantity - $1 
         WHERE id=$2`,
        [item.quantity, item.inventory_id]
      );
    }

    // Create payment record
    await query(
      `INSERT INTO payments 
       (order_id, amount, transaction_id)
       VALUES ($1, $2, $3)`,
      [orderId, totals.total, transactionId]
    );

    // Clear cart
    await query(`DELETE FROM cart_items WHERE cart_id=$1`, [cartId]);

    // Get full order summary
    const orderSummary = await getOrderSummary(orderId);
    
    // Add card info to payment
    orderSummary.payment.card_last4 = cardVerification.last4;
    orderSummary.payment.card_type = 'DEBIT';
    orderSummary.payment.message = `Payment made from card ending in ${cardVerification.last4}`;

    return res.status(201).json({
      success: true,
      message: "Order placed successfully! (Demo - No real payment processed)",
      order_summary: orderSummary
    });

  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    return res.status(500).json({ 
      error: err.message || "Internal server error" 
    });
  }
};

// ---------------------------------------------------
// CHECKOUT - REGISTERED USER (with new card)
// ---------------------------------------------------
export const checkoutRegisteredUserNewCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      shipping_address_id,
      billing_address_id, // REQUIREMENT: Separate billing address
      card_number,
      expiry,
      cvc,
      save_card // Option to save card for future
    } = req.body;

    // Validate required fields
    if (!shipping_address_id || !card_number || !expiry || !cvc) {
      return res.status(400).json({ 
        error: "Missing required fields" 
      });
    }

    // REQUIREMENT: Use billing_address_id if provided, else use shipping
    const finalBillingAddressId = billing_address_id || shipping_address_id;

    // Get user's cart
    const cart = await query(
      `SELECT id FROM carts WHERE user_id=$1`,
      [userId]
    );

    if (cart.rows.length === 0) {
      return res.status(400).json({ error: "Cart not found" });
    }

    const cartId = cart.rows[0].id;

    // Get cart items WITH sale prices
    const cartItems = await query(
      `SELECT 
        ci.product_id, 
        ci.inventory_id, 
        ci.quantity, 
        p.selling_price,
        p.on_sale,
        p.sale_price,
        CASE 
          WHEN p.on_sale = TRUE AND p.sale_price IS NOT NULL 
          THEN p.sale_price 
          ELSE p.selling_price 
        END as effective_price
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id=$1`,
      [cartId]
    );

    if (cartItems.rows.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Calculate totals
    const totals = await calculateOrderTotals(cartItems.rows);

    // Process payment
    const paymentResult = await processOneTimePayment({
      card_number,
      expiry,
      cvc,
      card_type: 'DEBIT'
    });

    if (!paymentResult.success) {
      return res.status(400).json({ error: "Payment failed" });
    }

    // Save card if requested (with billing address)
    if (save_card) {
      const { saveCard } = await import('./paymentCardController.js');
      const mockReq = { 
        user: req.user, 
        body: { 
          card_number, 
          expiry, 
          card_type: 'DEBIT',
          billing_address_id: finalBillingAddressId // Link billing to card
        } 
      };
      const mockRes = { json: () => {}, status: () => ({ json: () => {} }) };
      await saveCard(mockReq, mockRes);
    }

    // Create order
    const orderNumber = generateOrderNumber();
    
    const order = await query(
      `INSERT INTO orders 
       (user_id, shipping_address_id, billing_address_id,
        subtotal, tax, shipping_fee, total_amount, 
        status, order_number, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ORDERED', $8, 'DEBIT_CARD')
       RETURNING *`,
      [
        userId,
        shipping_address_id,
        finalBillingAddressId, // ✅ Separate billing address
        totals.subtotal,
        totals.tax,
        totals.shipping_fee,
        totals.total,
        orderNumber
      ]
    );

    const orderId = order.rows[0].id;

    // Add order items (use effective_price)
    for (const item of cartItems.rows) {
      await query(
        `INSERT INTO order_items 
         (order_id, product_id, inventory_id, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.product_id, item.inventory_id, item.effective_price, item.quantity]
      );

      await query(
        `UPDATE inventory 
         SET quantity = quantity - $1 
         WHERE id=$2`,
        [item.quantity, item.inventory_id]
      );
    }

    // Create payment record
    await query(
      `INSERT INTO payments 
       (order_id, amount, transaction_id)
       VALUES ($1, $2, $3)`,
      [orderId, totals.total, paymentResult.transaction_id]
    );

    // Clear cart
    await query(`DELETE FROM cart_items WHERE cart_id=$1`, [cartId]);

    // Get full order summary
    const orderSummary = await getOrderSummary(orderId);
    
    // Add card info to payment
    orderSummary.payment.card_last4 = paymentResult.last4;
    orderSummary.payment.card_type = 'DEBIT';
    orderSummary.payment.message = `Payment made from card ending in ${paymentResult.last4}`;

    return res.status(201).json({
      success: true,
      message: "Order placed successfully! (Demo - No real payment processed)",
      order_summary: orderSummary,
      card_saved: save_card
    });

  } catch (err) {
    console.error("CHECKOUT NEW CARD ERROR:", err);
    return res.status(500).json({ 
      error: err.message || "Internal server error" 
    });
  }
};

// ---------------------------------------------------
// CHECKOUT - GUEST USER
// ---------------------------------------------------
export const checkoutGuest = async (req, res) => {
  try {
    const guestId = req.headers["x-guest-id"];
    
    if (!guestId) {
      return res.status(400).json({ error: "Guest ID required" });
    }

    const { 
      // Shipping address (not saved)
      shipping_full_name,
      shipping_phone,
      shipping_address1,
      shipping_address2,
      shipping_city,
      shipping_state,
      shipping_postal_code,
      shipping_country,
      
      // Card details (not saved)
      card_number,
      expiry,
      cvc
    } = req.body;

    // Validate required fields
    if (!shipping_full_name || !shipping_address1 || !shipping_city || 
        !shipping_state || !shipping_postal_code || !shipping_country ||
        !card_number || !expiry || !cvc) {
      return res.status(400).json({ 
        error: "Missing required fields" 
      });
    }

    // Get guest cart
    const cart = await query(
      `SELECT id FROM carts WHERE guest_id=$1`,
      [guestId]
    );

    if (cart.rows.length === 0) {
      return res.status(400).json({ error: "Cart not found" });
    }

    const cartId = cart.rows[0].id;

    // Get cart items WITH sale prices
    const cartItems = await query(
      `SELECT 
        ci.product_id, 
        ci.inventory_id, 
        ci.quantity, 
        p.selling_price,
        p.on_sale,
        p.sale_price,
        CASE 
          WHEN p.on_sale = TRUE AND p.sale_price IS NOT NULL 
          THEN p.sale_price 
          ELSE p.selling_price 
        END as effective_price
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id=$1`,
      [cartId]
    );

    if (cartItems.rows.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Calculate totals
    const totals = await calculateOrderTotals(cartItems.rows);

    // Process payment
    const paymentResult = await processOneTimePayment({
      card_number,
      expiry,
      cvc,
      card_type: 'DEBIT'
    });

    if (!paymentResult.success) {
      return res.status(400).json({ error: "Payment failed" });
    }

    // Create temporary address
    const tempAddress = await query(
      `INSERT INTO addresses 
       (full_name, phone, address1, address2, city, state, postal_code, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        shipping_full_name,
        shipping_phone,
        shipping_address1,
        shipping_address2,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        shipping_country
      ]
    );

    const addressId = tempAddress.rows[0].id;

    // Create order (billing = shipping for guests)
    const orderNumber = generateOrderNumber();
    
    const order = await query(
      `INSERT INTO orders 
       (guest_id, shipping_address_id, billing_address_id,
        subtotal, tax, shipping_fee, total_amount, 
        status, order_number, payment_method)
       VALUES ($1, $2, $2, $3, $4, $5, $6, 'ORDERED', $7, 'DEBIT_CARD')
       RETURNING *`,
      [
        guestId,
        addressId, // Same for shipping and billing
        totals.subtotal,
        totals.tax,
        totals.shipping_fee,
        totals.total,
        orderNumber
      ]
    );

    const orderId = order.rows[0].id;

    // Add order items (use effective_price)
    for (const item of cartItems.rows) {
      await query(
        `INSERT INTO order_items 
         (order_id, product_id, inventory_id, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.product_id, item.inventory_id, item.effective_price, item.quantity]
      );

      await query(
        `UPDATE inventory 
         SET quantity = quantity - $1 
         WHERE id=$2`,
        [item.quantity, item.inventory_id]
      );
    }

    // Create payment record
    await query(
      `INSERT INTO payments 
       (order_id, amount, transaction_id)
       VALUES ($1, $2, $3)`,
      [orderId, totals.total, paymentResult.transaction_id]
    );

    // Clear cart
    await query(`DELETE FROM cart_items WHERE cart_id=$1`, [cartId]);

    // Get full order summary
    const orderSummary = await getOrderSummary(orderId);
    
    // Add card info to payment
    orderSummary.payment.card_last4 = paymentResult.last4;
    orderSummary.payment.card_type = 'DEBIT';
    orderSummary.payment.message = `Payment made from card ending in ${paymentResult.last4}`;

    return res.status(201).json({
      success: true,
      message: "Order placed successfully! (Demo - No real payment processed)",
      order_summary: orderSummary,
      note: "Guest order - Card and address NOT saved. Save your order number: " + orderNumber
    });

  } catch (err) {
    console.error("GUEST CHECKOUT ERROR:", err);
    return res.status(500).json({ 
      error: err.message || "Internal server error" 
    });
  }
};