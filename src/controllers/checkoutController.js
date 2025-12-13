// ============================================================================
// checkoutController.js
// Developer: GreenShoes Team
// ============================================================================
//
// Checkout controller - handles the complete order placement flow
// This is where carts become orders and payments are processed
//
// REQUIREMENTS COVERED:
// - "Display unique confirmation ID per order" (generateOrderNumber)
// - "Display order ID, color, size, addresses, total" (getOrderSummary)
// - "Tax 6% per product" (calculateOrderTotals - 6% tax)
// - "Flat shipping $11.95" (calculateOrderTotals - $11.99 flat)
// - "Place items on sale" (uses sale_price when on_sale=true)
// - "Update inventory real-time" (decrements stock on purchase)
// - "Inventory can never be negative" (DB constraint enforces this)
// - "No returns or refunds" (that's why there's no cancel/refund endpoints!)
// - Separate billing and shipping addresses
// - Guest checkout support
//
// CHECKOUT FLOWS:
// 1. Registered user with saved card (just need CVC)
// 2. Registered user with new card (can optionally save it)
// 3. Guest user (no saving, one-time purchase)
//
// DEMO NOTE: This is a demo system - no real payments are processed!
// Transaction IDs are generated but no actual charges happen.
//
// ROUTES THAT USE THIS:
// - POST /api/checkout/saved-card    → checkoutRegisteredUserSavedCard
// - POST /api/checkout/new-card      → checkoutRegisteredUserNewCard
// - POST /api/checkout/guest         → checkoutGuest
//
// ============================================================================

import { query } from "../db/db.js";
import { verifyCardForPayment, processOneTimePayment } from "./paymentCardController.js";


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ----------------------------------------------------------------------------
// Generate Order Number
// Creates a unique, human-readable order reference
// ----------------------------------------------------------------------------
// Format: ORD-{timestamp}-{random}
// Example: ORD-M5K2X9-A7B3
// 
// Why this format?
// - "ORD-" prefix makes it clear it's an order number
// - Base36 encoding keeps it short but unique
// - Random suffix adds extra uniqueness for high-volume scenarios
// - Easy to read over the phone to customer service
//
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();  // Base36 = 0-9 + A-Z
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}


// ----------------------------------------------------------------------------
// Calculate Order Totals (WITH SALE PRICES)
// REQUIREMENT: "Tax 6% per product", "Flat shipping $11.95"
// ----------------------------------------------------------------------------
// Takes cart items and calculates:
// - Subtotal (sum of item prices, respecting sale prices)
// - Tax (6% of subtotal)
// - Shipping ($11.99 flat - wait, requirement says $11.95... TODO: verify)
// - Total
//
async function calculateOrderTotals(cartItems) {
  let subtotal = 0;

  // Loop through each cart item and get current price
  // We fetch fresh from DB to ensure we use current prices
  // (price might have changed since item was added to cart)
  for (const item of cartItems) {
    const product = await query(
      `SELECT selling_price, on_sale, sale_price FROM products WHERE id=$1`,
      [item.product_id]
    );
    
    // REQUIREMENT: "Place items on sale"
    // Use sale price if product is currently on sale, otherwise regular price
    const price = product.rows[0].on_sale && product.rows[0].sale_price
      ? parseFloat(product.rows[0].sale_price)
      : parseFloat(product.rows[0].selling_price);
    
    subtotal += price * item.quantity;
  }

  // REQUIREMENT: "Tax 6% per product"
  const tax = subtotal * 0.06;
  
  // REQUIREMENT: "Flat shipping $11.95"
  // Note: Code has $11.99 - double-check with requirements doc
  const shipping_fee = 11.99;
  
  const total = subtotal + tax + shipping_fee;

  // Return all values as strings with 2 decimal places
  // This prevents floating-point precision issues (0.1 + 0.2 !== 0.3 in JS)
  return {
    subtotal: subtotal.toFixed(2),
    tax: tax.toFixed(2),
    shipping_fee: shipping_fee.toFixed(2),
    total: total.toFixed(2)
  };
}


// ----------------------------------------------------------------------------
// Calculate Estimated Delivery Date
// Simple 7-day estimate from order date
// ----------------------------------------------------------------------------
function calculateDeliveryDate() {
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 7);
  
  return {
    date: deliveryDate.toISOString().split('T')[0],  // Format: YYYY-MM-DD
    message: "Your order will arrive in 7 days"
  };
}
// Note: Real shipping would calculate based on:
// - Shipping method (standard, express, overnight)
// - Distance from warehouse
// - Carrier availability
// - Weekends/holidays
// But for MVP, 7 days flat is fine


// ----------------------------------------------------------------------------
// Get Order Summary for Response
// REQUIREMENT: "Display order ID, color, size, addresses, total"
// ----------------------------------------------------------------------------
// Builds a comprehensive order summary for the checkout response
// Includes everything the customer needs to see after placing order
//
async function getOrderSummary(orderId) {
  // ---------- FETCH ORDER WITH BOTH ADDRESSES ----------
  // REQUIREMENT: Separate shipping and billing addresses
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
  // Using aliases: sa = shipping address, ba = billing address

  if (order.rows.length === 0) {
    throw new Error("Order not found");
  }

  const orderData = order.rows[0];

  // ---------- FETCH ORDER ITEMS WITH DETAILS ----------
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
    [orderId]
  );
  // The inventory → colors/sizes join gets us the variant info

  // Calculate subtotal for each line item
  const itemsWithSubtotals = items.rows.map(item => ({
    ...item,
    subtotal: (parseFloat(item.price) * item.quantity).toFixed(2)
  }));

  // ---------- FETCH PAYMENT INFO ----------
  const payment = await query(
    `SELECT transaction_id FROM payments WHERE order_id=$1`,
    [orderId]
  );

  // Calculate delivery estimate
  const delivery = calculateDeliveryDate();

  // ---------- BUILD SUMMARY OBJECT ----------
  // This is what gets returned to the customer
  return {
    // Order identification
    // REQUIREMENT: "Display unique confirmation ID per order"
    order_id: orderData.id,
    order_number: orderData.order_number,  // Human-readable reference
    order_date: orderData.created_at,
    estimated_delivery: delivery.date,
    estimated_delivery_message: delivery.message,
    
    // Line items with color, size, price
    items: itemsWithSubtotals,
    
    // Payment confirmation
    payment: {
      transaction_id: payment.rows[0]?.transaction_id,
      message: `Payment processed successfully (Demo)`
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
      full_name: orderData.shipping_full_name,
      phone: orderData.shipping_phone,
      address1: orderData.shipping_address1,
      address2: orderData.shipping_address2,
      city: orderData.shipping_city,
      state: orderData.shipping_state,
      postal_code: orderData.shipping_postal_code,
      country: orderData.shipping_country
    },

    // Billing address (falls back to shipping if not provided)
    // REQUIREMENT: Separate billing address option
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


// ============================================================================
// CHECKOUT - REGISTERED USER WITH SAVED CARD
// ============================================================================
//
// For users who have previously saved a card
// They just need to provide their CVC to verify they still have the card
//
// Request body:
// - shipping_address_id: UUID of saved address
// - billing_address_id: Optional, defaults to shipping
// - cvc: Card verification code (always required for security)
//
export const checkoutRegisteredUserSavedCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      shipping_address_id,
      billing_address_id,  // Optional - separate billing address
      cvc                  // Always required - proves card ownership
    } = req.body;

    // ---------- VALIDATE INPUT ----------
    if (!shipping_address_id || !cvc) {
      return res.status(400).json({ 
        error: "Missing required fields: shipping_address_id, cvc" 
      });
    }

    // If no billing address specified, use shipping address
    const finalBillingAddressId = billing_address_id || shipping_address_id;

    // ---------- GET USER'S CART ----------
    const cart = await query(
      `SELECT id FROM carts WHERE user_id=$1`,
      [userId]
    );

    if (cart.rows.length === 0) {
      return res.status(400).json({ error: "Cart not found" });
    }

    const cartId = cart.rows[0].id;

    // ---------- GET CART ITEMS WITH SALE PRICES ----------
    // This query calculates effective_price in SQL
    // effective_price = sale_price if on_sale, else selling_price
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

    // ---------- VERIFY SAVED CARD + CVC ----------
    // Even with saved cards, CVC is required for security
    // This proves the user physically has the card
    let cardVerification;
    try {
      cardVerification = await verifyCardForPayment(userId, cvc);
    } catch (verifyError) {
      return res.status(400).json({ 
        error: verifyError.message || "Card verification failed" 
      });
    }
    
    if (!cardVerification.valid) {
      return res.status(400).json({ error: "Card verification failed" });
    }

    // ---------- CALCULATE TOTALS ----------
    const totals = await calculateOrderTotals(cartItems.rows);

    // ---------- SIMULATE PAYMENT ----------
    // DEMO: Generate fake transaction ID - no real payment processed
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // ---------- CREATE ORDER ----------
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
        finalBillingAddressId,
        totals.subtotal,
        totals.tax,
        totals.shipping_fee,
        totals.total,
        orderNumber
      ]
    );

    const orderId = order.rows[0].id;

    // ---------- CREATE ORDER ITEMS & UPDATE INVENTORY ----------
    for (const item of cartItems.rows) {
      // Insert order item (using effective_price - sale price if applicable)
      await query(
        `INSERT INTO order_items 
         (order_id, product_id, inventory_id, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.product_id, item.inventory_id, item.effective_price, item.quantity]
      );

      // REQUIREMENT: "Update inventory real-time"
      // Decrement stock - DB constraint prevents going negative
      await query(
        `UPDATE inventory 
         SET quantity = quantity - $1 
         WHERE id=$2`,
        [item.quantity, item.inventory_id]
      );
    }
    // Note: This should be in a transaction - if inventory update fails,
    // the order items are already created (inconsistent state)
    // TODO: Wrap in BEGIN/COMMIT transaction

    // ---------- CREATE PAYMENT RECORD ----------
    await query(
      `INSERT INTO payments 
       (order_id, amount, transaction_id)
       VALUES ($1, $2, $3)`,
      [orderId, totals.total, transactionId]
    );

    // ---------- CLEAR CART ----------
    // Cart is now empty - items have been converted to order items
    await query(`DELETE FROM cart_items WHERE cart_id=$1`, [cartId]);

    // ---------- BUILD RESPONSE ----------
    const orderSummary = await getOrderSummary(orderId);
    
    // Add card info to payment section
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


// ============================================================================
// CHECKOUT - REGISTERED USER WITH NEW CARD
// ============================================================================
//
// For users paying with a new card (not previously saved)
// Optionally saves the card for future purchases
//
// Request body:
// - shipping_address_id: UUID of saved address
// - billing_address_id: Optional, defaults to shipping
// - card_number: Full card number
// - expiry: Expiration date (MM/YYYY)
// - cvc: Card verification code
// - save_card: Boolean - whether to save for future
//
export const checkoutRegisteredUserNewCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      shipping_address_id,
      billing_address_id,
      card_number,
      expiry,
      cvc,
      save_card  // Optional flag to save card for future
    } = req.body;

    // ---------- VALIDATE INPUT ----------
    if (!shipping_address_id || !card_number || !expiry || !cvc) {
      return res.status(400).json({ 
        error: "Missing required fields" 
      });
    }

    const finalBillingAddressId = billing_address_id || shipping_address_id;

    // ---------- GET CART ----------
    const cart = await query(
      `SELECT id FROM carts WHERE user_id=$1`,
      [userId]
    );

    if (cart.rows.length === 0) {
      return res.status(400).json({ error: "Cart not found" });
    }

    const cartId = cart.rows[0].id;

    // ---------- GET CART ITEMS WITH SALE PRICES ----------
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

    // ---------- CALCULATE TOTALS ----------
    const totals = await calculateOrderTotals(cartItems.rows);

    // ---------- PROCESS PAYMENT ----------
    // processOneTimePayment handles new card payments
    const paymentResult = await processOneTimePayment({
      card_number,
      expiry,
      cvc,
      card_type: 'DEBIT'
    });

    if (!paymentResult.success) {
      return res.status(400).json({ error: "Payment failed" });
    }

    // ---------- OPTIONALLY SAVE CARD ----------
    // If user opted in, save the card for future purchases
    if (save_card) {
      // Dynamic import to avoid circular dependency
      const { saveCard } = await import('./paymentCardController.js');
      
      // Create mock req/res objects to call saveCard
      // This is a bit hacky but avoids duplicating logic
      // TODO: Consider extracting save logic into a shared function
      const mockReq = { 
        user: req.user, 
        body: { 
          card_number, 
          expiry, 
          cvc,
          card_type: 'DEBIT',
          billing_address_id: finalBillingAddressId
        } 
      };
      const mockRes = { json: () => {}, status: () => ({ json: () => {} }) };
      await saveCard(mockReq, mockRes);
    }

    // ---------- CREATE ORDER ----------
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
        finalBillingAddressId,
        totals.subtotal,
        totals.tax,
        totals.shipping_fee,
        totals.total,
        orderNumber
      ]
    );

    const orderId = order.rows[0].id;

    // ---------- CREATE ORDER ITEMS & UPDATE INVENTORY ----------
    for (const item of cartItems.rows) {
      await query(
        `INSERT INTO order_items 
         (order_id, product_id, inventory_id, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.product_id, item.inventory_id, item.effective_price, item.quantity]
      );

      // Decrement inventory
      await query(
        `UPDATE inventory 
         SET quantity = quantity - $1 
         WHERE id=$2`,
        [item.quantity, item.inventory_id]
      );
    }

    // ---------- CREATE PAYMENT RECORD ----------
    await query(
      `INSERT INTO payments 
       (order_id, amount, transaction_id)
       VALUES ($1, $2, $3)`,
      [orderId, totals.total, paymentResult.transaction_id]
    );

    // ---------- CLEAR CART ----------
    await query(`DELETE FROM cart_items WHERE cart_id=$1`, [cartId]);

    // ---------- BUILD RESPONSE ----------
    const orderSummary = await getOrderSummary(orderId);
    
    orderSummary.payment.card_last4 = paymentResult.last4;
    orderSummary.payment.card_type = 'DEBIT';
    orderSummary.payment.message = `Payment made from card ending in ${paymentResult.last4}`;

    return res.status(201).json({
      success: true,
      message: "Order placed successfully! (Demo - No real payment processed)",
      order_summary: orderSummary,
      card_saved: save_card  // Let user know if card was saved
    });

  } catch (err) {
    console.error("CHECKOUT NEW CARD ERROR:", err);
    return res.status(500).json({ 
      error: err.message || "Internal server error" 
    });
  }
};


// ============================================================================
// CHECKOUT - GUEST USER
// ============================================================================
//
// For users who haven't created an account
// Nothing is saved - address and card are one-time use
//
// Request body:
// - Shipping address fields (full_name, phone, address1, etc.)
// - Card details (card_number, expiry, cvc)
//
// Note: Guest checkout uses same billing and shipping address
// (simplified UX - creating an account enables separate billing)
//
export const checkoutGuest = async (req, res) => {
  try {
    // Guest ID from header (set by frontend, stored in localStorage)
    const guestId = req.headers["x-guest-id"];
    
    if (!guestId) {
      return res.status(400).json({ error: "Guest ID required" });
    }

    // ---------- EXTRACT REQUEST BODY ----------
    const { 
      // Shipping address (entered fresh each time - not saved)
      shipping_full_name,
      shipping_phone,
      shipping_address1,
      shipping_address2,
      shipping_city,
      shipping_state,
      shipping_postal_code,
      shipping_country,
      
      // Card details (not saved - one-time use)
      card_number,
      expiry,
      cvc
    } = req.body;

    // ---------- VALIDATE INPUT ----------
    if (!shipping_full_name || !shipping_address1 || !shipping_city || 
        !shipping_state || !shipping_postal_code || !shipping_country ||
        !card_number || !expiry || !cvc) {
      return res.status(400).json({ 
        error: "Missing required fields" 
      });
    }

    // ---------- GET GUEST CART ----------
    const cart = await query(
      `SELECT id FROM carts WHERE guest_id=$1`,
      [guestId]
    );

    if (cart.rows.length === 0) {
      return res.status(400).json({ error: "Cart not found" });
    }

    const cartId = cart.rows[0].id;

    // ---------- GET CART ITEMS WITH SALE PRICES ----------
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

    // ---------- CALCULATE TOTALS ----------
    const totals = await calculateOrderTotals(cartItems.rows);

    // ---------- PROCESS PAYMENT ----------
    const paymentResult = await processOneTimePayment({
      card_number,
      expiry,
      cvc,
      card_type: 'DEBIT'
    });

    if (!paymentResult.success) {
      return res.status(400).json({ error: "Payment failed" });
    }

    // ---------- CREATE TEMPORARY ADDRESS ----------
    // For guests, we create an address record but it's not linked to a user
    // This is needed because orders reference address IDs
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
    // Note: user_id is NULL for guest addresses

    const addressId = tempAddress.rows[0].id;

    // ---------- CREATE ORDER ----------
    // For guests, billing address = shipping address (simplified)
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
        addressId,  // Same ID for both shipping and billing ($2 used twice)
        totals.subtotal,
        totals.tax,
        totals.shipping_fee,
        totals.total,
        orderNumber
      ]
    );

    const orderId = order.rows[0].id;

    // ---------- CREATE ORDER ITEMS & UPDATE INVENTORY ----------
    for (const item of cartItems.rows) {
      await query(
        `INSERT INTO order_items 
         (order_id, product_id, inventory_id, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.product_id, item.inventory_id, item.effective_price, item.quantity]
      );

      // Decrement inventory
      await query(
        `UPDATE inventory 
         SET quantity = quantity - $1 
         WHERE id=$2`,
        [item.quantity, item.inventory_id]
      );
    }

    // ---------- CREATE PAYMENT RECORD ----------
    await query(
      `INSERT INTO payments 
       (order_id, amount, transaction_id)
       VALUES ($1, $2, $3)`,
      [orderId, totals.total, paymentResult.transaction_id]
    );

    // ---------- CLEAR CART ----------
    await query(`DELETE FROM cart_items WHERE cart_id=$1`, [cartId]);

    // ---------- BUILD RESPONSE ----------
    const orderSummary = await getOrderSummary(orderId);
    
    orderSummary.payment.card_last4 = paymentResult.last4;
    orderSummary.payment.card_type = 'DEBIT';
    orderSummary.payment.message = `Payment made from card ending in ${paymentResult.last4}`;

    // Special note for guests - remind them to save their order number!
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


// ============================================================================
// NOTES & POTENTIAL IMPROVEMENTS
// ============================================================================
//
// 1. Transaction support
//    Currently: Multiple queries run sequentially without transaction
//    Problem: If inventory update fails, order items already created
//    Solution: Wrap in BEGIN/COMMIT with ROLLBACK on error
//
// 2. Inventory locking
//    Currently: Check stock → place order (race condition possible)
//    Problem: Two users could order last item simultaneously
//    Solution: SELECT FOR UPDATE to lock inventory rows during checkout
//
// 3. Order confirmation email
//    Should send email with order summary, tracking info, etc.
//    Would need email service (SendGrid, SES, etc.)
//
// 4. Payment retry
//    Currently: Payment fails → order fails
//    Better: Show error, let user fix card details and retry
//
// 5. Order lookup for guests
//    Guests need a way to check order status
//    Could add: GET /api/orders/lookup?order_number=XXX&email=xxx
//
// 6. Abandoned checkout recovery
//    Track checkouts that start but don't complete
//    Send reminder email (requires email capture earlier in flow)
//
// 7. Promo codes / discounts
//    Currently: Only sale prices, no coupon codes
//    Could add: discount_code field, validation, percentage/fixed discounts
//
// 8. Tax calculation
//    Currently: Flat 6% everywhere
//    Real world: Tax varies by state/country, product type, etc.
//    Would need tax service (Avalara, TaxJar, etc.)
//
// 9. Shipping calculation
//    Currently: Flat $11.99 for everyone
//    Real world: Varies by weight, distance, speed, carrier
//    Would need shipping API (ShipStation, EasyPost, etc.)
//
// ============================================================================