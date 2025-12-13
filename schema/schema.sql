-- ============================================================================
-- GreenShoes E-Commerce Platform - Complete Database Schema
-- Developer: Kamalasankari Subramaniakuppusamy
-- ============================================================================
--
-- NOTES TO SELF AND FOR REVIEWERS TO UNDERSTAND WHY THINGS ARE WRITTEN A CERTAIN WAY
--
-- This is the complete database schema for the GreenShoes e-commerce platform.
-- Edited time and again by: Kamala
-- This schema was edited regularly to modify migrations according to new features and requirements.
--
-- NOTE: I'll mostly comment out sections that are no longer needed but were part of 
-- previous iterations/sprint endeavors. 
--
-- I also have the habit of adding comments to almost everything I code here so that 
-- I don't get lost later when I'm trying to remember why I did something a certain way.
--
-- I may also leave certain constraints or indexes commented out if I decide to handle 
-- them at the application level instead of the database level.
--
-- ============================================================================
-- REQUIREMENTS COVERED BY THIS SCHEMA:
-- ============================================================================
-- - "Different Admin login URL and customer login to prevent break-in attacks" (user_role enum)
-- - "The software shall provide user registration and login functionality" (users table)
-- - "Add items with multiple pictures" (product_images table)
-- - "Add/modify quantities per size and color" (inventory table with product/size/color combo)
-- - "Change prices" (selling_price, cost_price columns)
-- - "Place items on sale" (on_sale, sale_price columns with constraint)
-- - "Inventory can never be negative" (check_quantity_non_negative constraint)
-- - "Display unique confirmation ID per order" (order_number column)
-- - "Display order ID, color, size, addresses, total" (orders + order_items + addresses)
-- - "Tax 6% per product" (tax_percent column, defaults to 6.00)
-- - "Flat shipping $11.95" (shipping_fee column in orders)
-- - "No returns or refunds" (no refund status in order_status enum)
-- - "Impact management" (sustainability columns in products)
-- - Guest checkout support (guest_users table, nullable user_id on carts/orders)
-- ============================================================================


-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- uuid-ossp gives us uuid_generate_v4() for creating unique IDs
-- UUIDs are better than auto-increment integers for security (can't guess next ID)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================================
-- ENUMS
-- Using PostgreSQL enums for type safety - better than VARCHAR constraints
-- ============================================================================

-- REQUIREMENT: "Different Admin login URL and customer login to prevent break-in attacks"
-- Only two roles needed - this is the foundation for RBAC (Role-Based Access Control)
-- Admin gets access to /admin routes, Customer gets the storefront
CREATE TYPE user_role AS ENUM ('ADMIN', 'CUSTOMER');

-- Order status enum - keeping it simple for now
-- Note: No 'REFUNDED' or 'RETURNED' status because requirement says "No returns or refunds"
-- Could expand this later: 'PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'
CREATE TYPE order_status AS ENUM ('ORDERED');


-- ============================================================================
-- USERS TABLE (REGISTERED USERS)
-- REQUIREMENT: "The software shall provide user registration and login functionality"
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),  -- UUID instead of serial for security
    full_name VARCHAR(100) NOT NULL,                 -- Display name for orders, emails
    email VARCHAR(100) UNIQUE NOT NULL,              -- Login identifier, must be unique
    password_hash TEXT NOT NULL,                     -- Bcrypt hash, NEVER plain text!
    phone VARCHAR(20),                               -- Optional, for order notifications
    role user_role NOT NULL DEFAULT 'CUSTOMER',      -- ADMIN or CUSTOMER - controls access
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()               -- Track when profile was last modified
);


-- ============================================================================
-- GUEST USERS TABLE (TEMPORARY CHECKOUT USERS)
-- Supports guest checkout without forcing account creation
-- ============================================================================

-- Some customers just want to buy something without creating an account
-- This table tracks them so we can associate their cart/order with something
CREATE TABLE guest_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(100),                              -- Optional - they might provide for order confirmation
    created_at TIMESTAMP DEFAULT NOW()
    -- Note: No password - guests can't "log back in"
    -- Their session is tied to a cookie/localStorage guest_id
);


-- ============================================================================
-- ADDRESSES TABLE
-- REQUIREMENT: "Display order ID, color, size, addresses, total"
-- Supports both registered and guest users
-- ============================================================================

CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- Nullable for guest orders!
    full_name VARCHAR(100) NOT NULL,                 -- Recipient name (might differ from account name)
    phone VARCHAR(20),                               -- Contact number for delivery
    address1 VARCHAR(255) NOT NULL,                  -- Street address
    address2 VARCHAR(255),                           -- Apt/Suite/Building (optional)
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    is_default BOOLEAN DEFAULT FALSE,                -- Quick checkout uses this one
    created_at TIMESTAMP DEFAULT NOW()
);

-- Speed up "get all addresses for this user" queries (checkout page)
CREATE INDEX idx_addresses_user ON addresses(user_id);


-- ============================================================================
-- PAYMENT CARDS TABLE (ENCRYPTED SEGMENTS)
-- Stores card data with segment encryption for security
-- ============================================================================

-- IMPORTANT: Card numbers are stored as encrypted segments, NOT plain text
-- Even if database is compromised, individual segments are useless alone
CREATE TABLE payment_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Card number split into 4 encrypted segments (defense in depth)
    -- Each segment is encrypted separately using AES or similar
    -- NOT hashed - we need to decrypt these for payment processing
    segment1_encrypted TEXT NOT NULL,  -- First 4 digits (ABCD)
    segment2_encrypted TEXT NOT NULL,  -- Second 4 digits (EFGH)
    segment3_encrypted TEXT NOT NULL,  -- Third 4 digits (IJKL)
    segment4_encrypted TEXT NOT NULL,  -- Last 4 digits (MNOP)
    expiry_encrypted TEXT NOT NULL,    -- Expiration date (MM/YYYY)
    
    -- Metadata (safe to store unencrypted)
    card_type VARCHAR(20) DEFAULT 'DEBIT',           -- DEBIT only per requirements
    last4_plain VARCHAR(4),                          -- For display: "**** **** **** 1234"
    is_default BOOLEAN DEFAULT FALSE,                -- User's default payment method
    billing_address_id UUID REFERENCES addresses(id),
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- REQUIREMENT: "One user can have only one card"
    -- GreenShoes supports payments only through debit cards, one per user
    UNIQUE(user_id)
);


-- ============================================================================
-- PRODUCTS TABLE
-- REQUIREMENTS: "Add items", "Change prices", "Place items on sale", "Impact management"
-- ============================================================================

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,                      -- Product name, e.g., "Ocean Wave Sandal"
    description TEXT,                                -- Full product description
    
    -- ========== PRICING ==========
    -- REQUIREMENT: "Change prices"
    cost_price NUMERIC(10,2),                        -- What we pay (admin visibility only)
    selling_price NUMERIC(10,2) NOT NULL,            -- Regular price customers see
    price_category VARCHAR(20) DEFAULT 'normal',     -- 'discount' or 'normal' classification
    
    -- REQUIREMENT: "Place items on sale"
    on_sale BOOLEAN DEFAULT FALSE,                   -- Toggle for temporary sale
    sale_price NUMERIC(10,2),                        -- Discounted price when on_sale=true
    
    -- ========== ENVIRONMENTAL IMPACT ==========
    -- REQUIREMENT: "Impact management" for luxury eco-friendly branding
    -- These support the "SCULPTED BY THE SEA" sustainability narrative
    impact_story TEXT,                               -- The eco story for this product
    sustainability_rating INT CHECK (                -- 1-5 star rating
        sustainability_rating IS NULL OR 
        (sustainability_rating >= 1 AND sustainability_rating <= 5)
    ),
    carbon_footprint VARCHAR(100),                   -- e.g., "2.3 kg CO2 saved"
    ethical_sourcing TEXT,                           -- Where/how materials are sourced
    recycled_materials BOOLEAN DEFAULT FALSE,        -- Contains recycled content?
    
    -- ========== METADATA ==========
    category VARCHAR(50),                            -- e.g., "sandals", "sneakers", "boots"
    tax_percent NUMERIC(5,2) DEFAULT 6.00,           -- REQUIREMENT: "Tax 6% per product"
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- ========== CONSTRAINTS ==========
    -- Sale price validation: if on_sale is true, sale_price must exist AND be less than selling_price
    -- This prevents mistakes like setting sale price higher than regular price (not a sale!)
    CONSTRAINT check_sale_price CHECK (
        (on_sale = FALSE AND sale_price IS NULL) OR
        (on_sale = TRUE AND sale_price IS NOT NULL AND sale_price < selling_price)
    )
);

-- Performance indexes for common product queries
CREATE INDEX idx_products_category ON products(category);              -- Category filtering
CREATE INDEX idx_products_price ON products(selling_price);            -- Price sorting
CREATE INDEX idx_products_on_sale ON products(on_sale) WHERE on_sale = TRUE;  -- Partial index for sale items only


-- ============================================================================
-- SIZES TABLE
-- Lookup table for shoe sizes - keeps data normalized
-- ============================================================================

CREATE TABLE sizes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    value VARCHAR(10) NOT NULL UNIQUE                -- e.g., "6", "7.5", "10", "12"
);


-- ============================================================================
-- COLORS TABLE
-- Lookup table for colors - keeps data normalized
-- ============================================================================

CREATE TABLE colors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    value VARCHAR(30) NOT NULL UNIQUE                -- e.g., "Ocean Blue", "Sand Beige", "Forest Green"
);


-- ============================================================================
-- PRODUCT COLORS (MANY-TO-MANY JUNCTION TABLE)
-- Links products to their available colors
-- ============================================================================

-- A product can come in multiple colors, a color can be used by multiple products
CREATE TABLE product_colors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_id UUID NOT NULL REFERENCES colors(id) ON DELETE CASCADE,
    UNIQUE(product_id, color_id)                     -- Prevent duplicate entries
);


-- ============================================================================
-- PRODUCT IMAGES TABLE
-- REQUIREMENT: "Add items with multiple pictures"
-- ============================================================================

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_id UUID REFERENCES colors(id),             -- NULL = image applies to all variants
    image_url TEXT NOT NULL,                         -- S3, Cloudinary, or local path
    alt_text TEXT,                                   -- Accessibility - describes the image
    priority INT DEFAULT 1,                          -- 1 = main/hero image, higher = gallery
    created_at TIMESTAMP DEFAULT NOW()
);
-- Note: color_id lets us show different images for different color variants
-- e.g., "Ocean Wave Sandal" in blue shows blue images, in beige shows beige images


-- ============================================================================
-- INVENTORY TABLE (PER SIZE/COLOR VARIANT)
-- REQUIREMENTS: "Add/modify quantities per size and color", "Inventory can never be negative"
-- ============================================================================

-- This is the key table for stock management
-- Each row = one specific variant (product + size + color combination)
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size_id UUID NOT NULL REFERENCES sizes(id),
    color_id UUID NOT NULL REFERENCES colors(id),
    quantity INT NOT NULL DEFAULT 0,                 -- Current stock count
    
    -- Each product/size/color combo can only have ONE inventory row
    -- This prevents duplicate stock entries
    UNIQUE(product_id, size_id, color_id),
    
    -- REQUIREMENT: "Inventory can never be negative"
    -- This is the last line of defense - backend should also validate!
    CONSTRAINT check_quantity_non_negative CHECK (quantity >= 0)
);


-- ============================================================================
-- WISHLIST TABLES
-- Supports both registered and guest users saving items for later
-- ============================================================================

-- Main wishlist table - one per user OR one per guest
CREATE TABLE wishlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guest_users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- CONSTRAINTS: Must have EITHER user_id OR guest_id (XOR pattern)
    -- Can't be both (that's weird) and can't be neither (whose wishlist is it?)
    CONSTRAINT wishlist_user_unique UNIQUE(user_id),
    CONSTRAINT wishlist_guest_unique UNIQUE(guest_id),
    CONSTRAINT wishlist_owner_check CHECK (
        (user_id IS NOT NULL AND guest_id IS NULL) OR 
        (user_id IS NULL AND guest_id IS NOT NULL)
    )
);

-- Wishlist items - the actual products in the wishlist
CREATE TABLE wishlist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wishlist_id UUID NOT NULL REFERENCES wishlist(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT NOW(),                -- "You wishlisted this 3 days ago" feature
    UNIQUE(wishlist_id, product_id)                  -- Can't wishlist same product twice
);

CREATE INDEX idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);


-- ============================================================================
-- CART TABLES
-- Shopping cart - supports both registered and guest users
-- ============================================================================

-- Main cart table - one per user OR one per guest
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guest_users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
    -- Note: Could add XOR constraint like wishlist, but handled at app level currently
);

-- Cart items - specific products with size/color selection
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    inventory_id UUID REFERENCES inventory(id),      -- Links to specific size/color variant
    quantity INT NOT NULL DEFAULT 1,                 -- How many they want
    UNIQUE(cart_id, product_id, inventory_id)        -- One row per variant per cart
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);


-- ============================================================================
-- ORDERS TABLE
-- REQUIREMENTS: "Display unique confirmation ID", "Display order ID, color, size, addresses, total"
-- REQUIREMENTS: "Tax 6%", "Flat shipping $11.95", "No returns or refunds"
-- ============================================================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),               -- Nullable for guest orders
    guest_id UUID REFERENCES guest_users(id),        -- For guest checkout
    
    -- Address references (snapshot the address IDs at time of order)
    shipping_address_id UUID REFERENCES addresses(id),
    billing_address_id UUID REFERENCES addresses(id),
    
    -- ========== PRICE BREAKDOWN ==========
    -- Storing breakdown for transparency in order details
    subtotal NUMERIC(10,2),                          -- Sum of items before tax/shipping
    tax NUMERIC(10,2),                               -- REQUIREMENT: "Tax 6% per product"
    shipping_fee NUMERIC(10,2),                      -- REQUIREMENT: "Flat shipping $11.95"
    total_amount NUMERIC(10,2) NOT NULL,             -- Final total (subtotal + tax + shipping)
    
    -- ========== METADATA ==========
    order_number VARCHAR(20) UNIQUE,                 -- REQUIREMENT: "Display unique confirmation ID"
                                                     -- Human-readable like "GS-2025-00042"
    payment_method VARCHAR(50) DEFAULT 'DEBIT_CARD', -- Only debit cards per requirements
    status order_status NOT NULL DEFAULT 'ORDERED',  -- Order lifecycle state
    created_at TIMESTAMP DEFAULT NOW()
    
    -- Note: No refund_at or cancelled_at because "No returns or refunds"
);

-- Performance indexes for order queries
CREATE INDEX idx_orders_created ON orders(created_at DESC);  -- Admin order list (newest first)
CREATE INDEX idx_orders_user ON orders(user_id);              -- Customer order history
CREATE INDEX idx_orders_guest ON orders(guest_id);            -- Guest order lookup


-- ============================================================================
-- ORDER ITEMS TABLE
-- Line items for each order - captures what was purchased
-- ============================================================================

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    inventory_id UUID REFERENCES inventory(id),      -- Which size/color variant was ordered
    price NUMERIC(10,2) NOT NULL,                    -- IMPORTANT: Price at time of purchase!
                                                     -- Product prices can change later
    quantity INT NOT NULL                            -- How many of this variant
);
-- Note: We store price here because if the product price changes after the order,
-- we still need to know what the customer actually paid


-- ============================================================================
-- PAYMENTS TABLE
-- Records payment transactions for orders
-- ============================================================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,                   -- Amount charged
    transaction_id VARCHAR(100),                     -- Payment processor's transaction ID
    created_at TIMESTAMP DEFAULT NOW()
    -- Note: Simplified for project scope
    -- Production would include: status, gateway_response, refund_id, etc.
);


-- ============================================================================
-- AUDIT LOGS TABLE
-- Track admin actions for accountability and debugging
-- ============================================================================

-- Who did what when - important for admin accountability
-- Also helps with debugging "who changed this product price?"
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),               -- Who performed the action (admin)
    entity_type VARCHAR(50),                         -- What table: 'product', 'order', etc.
    entity_id UUID,                                  -- Which record was affected
    action VARCHAR(50),                              -- What happened: 'CREATE', 'UPDATE', 'DELETE'
    description TEXT,                                -- Human-readable details
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);


-- ============================================================================
-- SCHEMA DESIGN NOTES
-- ============================================================================
--
-- Key Design Decisions:
--
-- 1. UUIDs everywhere instead of auto-increment integers
--    - Can't guess next ID (security)
--    - Works with distributed systems
--    - No sequential patterns to exploit
--
-- 2. Separate inventory table for size/color variants
--    - Each combination has its own stock count
--    - Unique constraint prevents duplicate variants
--    - Check constraint ensures non-negative inventory
--
-- 3. Guest user support throughout
--    - guest_users table for anonymous checkout
--    - Nullable user_id on carts, orders, addresses
--    - XOR constraints on wishlist (either user OR guest)
--
-- 4. Price snapshot in order_items
--    - Stores price at time of purchase
--    - Product prices can change without affecting old orders
--
-- 5. Encrypted card segments
--    - Card numbers split into 4 encrypted pieces
--    - Defense in depth - one segment alone is useless
--    - One card per user (per requirements)
--
-- 6. Simple order_status enum
--    - Only 'ORDERED' for now (could expand later)
--    - No refund status because "No returns or refunds"
--
-- ============================================================================
-- POTENTIAL FUTURE ENHANCEMENTS (commented out for now):
-- ============================================================================
-- 
-- -- Product reviews/ratings from customers
-- -- CREATE TABLE product_reviews (...);
--
-- -- Discount codes / coupons
-- -- CREATE TABLE discount_codes (...);
--
-- -- Email notification preferences
-- -- ALTER TABLE users ADD COLUMN email_preferences JSONB;
--
-- -- Expanded order statuses
-- -- ALTER TYPE order_status ADD VALUE 'SHIPPED';
-- -- ALTER TYPE order_status ADD VALUE 'DELIVERED';
--
-- ============================================================================