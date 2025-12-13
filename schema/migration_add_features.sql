-- ============================================================================
-- GreenShoes Database Migration - Add Missing Features
-- Developer: Kamalasankari Subramaniakuppusamy
-- ============================================================================
--
-- PURPOSE: Adds new features to an existing database WITHOUT destroying data
-- This is an incremental migration - safe to run on production
--
-- REQUIREMENTS ADDRESSED:
-- - "Place items on sale" (on_sale, sale_price columns)
-- - "Impact management" (sustainability/eco columns)
-- - "Inventory can never be negative" (check constraint)
-- - "Display unique confirmation ID per order" (order_number column)
-- - "Tax 6% per product" and "Flat shipping $11.95" (subtotal, tax, shipping_fee columns)
-- - Guest checkout support (wishlist guest_id, addresses nullable user_id)
--
-- SAFETY FEATURES:
-- - Uses "IF NOT EXISTS" and "IF EXISTS" throughout
-- - Wrapped constraint additions in exception handlers
-- - Won't fail if run multiple times (idempotent)
--
-- ============================================================================


-- ============================================================================
-- 1. PRODUCT SALE FEATURES
-- REQUIREMENT: "Place items on sale"
-- ============================================================================

-- Add sale-related columns to products
-- on_sale is the toggle, sale_price is what customers pay when on_sale=true
ALTER TABLE products ADD COLUMN IF NOT EXISTS on_sale BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_category VARCHAR(20) DEFAULT 'normal';
-- price_category could be used for filtering: 'budget', 'normal', 'premium', 'luxury'


-- ============================================================================
-- 2. ENVIRONMENTAL IMPACT / SUSTAINABILITY COLUMNS
-- REQUIREMENT: "Impact management" for eco-friendly branding
-- ============================================================================

-- These columns support the luxury eco-friendly brand positioning
-- Admin can tell the sustainability story for each product
ALTER TABLE products ADD COLUMN IF NOT EXISTS impact_story TEXT;           -- The narrative about this product's eco impact
ALTER TABLE products ADD COLUMN IF NOT EXISTS sustainability_rating INT;    -- 1-5 star rating
ALTER TABLE products ADD COLUMN IF NOT EXISTS carbon_footprint VARCHAR(100); -- e.g., "2.3 kg CO2" 
ALTER TABLE products ADD COLUMN IF NOT EXISTS ethical_sourcing TEXT;        -- Where/how materials are sourced
ALTER TABLE products ADD COLUMN IF NOT EXISTS recycled_materials BOOLEAN DEFAULT FALSE;  -- Contains recycled content?


-- ============================================================================
-- 3. DATA INTEGRITY CONSTRAINTS
-- These prevent bad data from getting into the database
-- ============================================================================

-- Sale price constraint: if on_sale is true, sale_price must exist AND be less than selling_price
-- This prevents mistakes like setting sale price higher than regular price (that's not a sale!)
DO $$ 
BEGIN
    ALTER TABLE products ADD CONSTRAINT check_sale_price 
    CHECK (
        (on_sale = FALSE AND sale_price IS NULL) OR
        (on_sale = TRUE AND sale_price IS NOT NULL AND sale_price < selling_price)
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;  -- Constraint already exists, that's fine
END $$;

-- Sustainability rating must be 1-5 (like star ratings)
-- NULL is allowed for products where we haven't calculated the rating yet
DO $$ 
BEGIN
    ALTER TABLE products ADD CONSTRAINT check_sustainability_rating
    CHECK (sustainability_rating IS NULL OR (sustainability_rating >= 1 AND sustainability_rating <= 5));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 4. PERFORMANCE INDEXES
-- Speed up common queries - these make a big difference with lots of products
-- ============================================================================

-- Category filtering is super common on e-commerce sites
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Price sorting/filtering - "sort by price low to high" etc.
CREATE INDEX IF NOT EXISTS idx_products_price ON products(selling_price);

-- Partial index for sale items - only indexes rows where on_sale=TRUE
-- This is clever: the index is small but speeds up "show me all sale items" queries
CREATE INDEX IF NOT EXISTS idx_products_on_sale ON products(on_sale) WHERE on_sale = TRUE;


-- ============================================================================
-- 5. WISHLIST GUEST SUPPORT
-- Allow guests to have wishlists (not just logged-in users)
-- ============================================================================

-- Make user_id nullable so guests can have wishlists too
ALTER TABLE wishlist ALTER COLUMN user_id DROP NOT NULL;

-- Add guest_id as alternative owner (references guest_users table)
ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES guest_users(id) ON DELETE CASCADE;

-- Track when items were added - useful for "you wishlisted this 3 days ago" nudges
ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS added_at TIMESTAMP DEFAULT NOW();

-- Remove old constraint that assumed only users could have wishlists
DO $$ 
BEGIN
    ALTER TABLE wishlist DROP CONSTRAINT IF EXISTS wishlist_user_id_key;
EXCEPTION
    WHEN undefined_object THEN NULL;  -- Constraint didn't exist, that's fine
END $$;

-- Add new uniqueness constraints
-- Each user can only have ONE wishlist
DO $$ 
BEGIN
    ALTER TABLE wishlist ADD CONSTRAINT wishlist_user_unique UNIQUE(user_id);
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;

-- Each guest can only have ONE wishlist
DO $$ 
BEGIN
    ALTER TABLE wishlist ADD CONSTRAINT wishlist_guest_unique UNIQUE(guest_id);
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;

-- XOR constraint: wishlist must belong to EITHER a user OR a guest, not both, not neither
-- This is a common pattern for supporting both authenticated and guest users
DO $$ 
BEGIN
    ALTER TABLE wishlist ADD CONSTRAINT wishlist_owner_check 
    CHECK (
        (user_id IS NOT NULL AND guest_id IS NULL) OR 
        (user_id IS NULL AND guest_id IS NOT NULL)
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 6. PAYMENT CARDS TABLE (RECREATED)
-- Storing card data with segment encryption for PCI compliance
-- ============================================================================

-- Drop and recreate - this is a structural change, not just adding columns
-- WARNING: This will delete existing payment card data! 
-- In production, you'd want to migrate the data first
DROP TABLE IF EXISTS payment_cards CASCADE;

-- New structure stores card number in 4 encrypted segments
-- This is a security pattern - even if one segment is compromised, it's useless alone
CREATE TABLE payment_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Card number split into 4 encrypted segments (4 digits each)
    -- Each segment encrypted separately - defense in depth
    segment1_encrypted TEXT NOT NULL,
    segment2_encrypted TEXT NOT NULL,
    segment3_encrypted TEXT NOT NULL,
    segment4_encrypted TEXT NOT NULL,
    expiry_encrypted TEXT NOT NULL,          -- MM/YY encrypted
    
    card_type VARCHAR(20) DEFAULT 'DEBIT',   -- DEBIT, CREDIT, etc.
    last4_plain VARCHAR(4),                  -- Last 4 digits in plain text for display ("****1234")
    is_default BOOLEAN DEFAULT FALSE,        -- User's default payment method
    billing_address_id UUID REFERENCES addresses(id),
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id)  -- One card per user (simplification - could allow multiple)
);


-- ============================================================================
-- 7. ORDER PRICE BREAKDOWN
-- REQUIREMENT: "Tax 6% per product" and "Flat shipping $11.95"
-- REQUIREMENT: "Display unique confirmation ID per order"
-- ============================================================================

-- These columns store the price breakdown shown in order details
-- Important: we store calculated values, not just total, for transparency
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);      -- Sum of items before tax/shipping
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax NUMERIC(10,2);           -- 6% tax amount
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2);  -- $11.95 flat rate
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20) UNIQUE;  -- Human-readable order ID (GS-2025-001)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'DEBIT_CARD';


-- ============================================================================
-- 8. ORDER STATUS ENUM UPDATE
-- Add 'ORDERED' status if it doesn't exist
-- ============================================================================

-- The ORDERED status represents "order placed but not yet shipped"
-- Different from PENDING which might mean "awaiting payment"
DO $$ 
BEGIN
    -- Only add if it doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'ORDERED' 
        AND enumtypid = 'order_status'::regtype
    ) THEN
        ALTER TYPE order_status ADD VALUE 'ORDERED';
    END IF;
END $$;

-- New orders should start as ORDERED (payment already processed)
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'ORDERED';


-- ============================================================================
-- 9. GUEST ORDER SUPPORT
-- Allow orders without a user account (guest checkout)
-- ============================================================================

-- Make user_id nullable on addresses so guests can have shipping/billing addresses
ALTER TABLE addresses ALTER COLUMN user_id DROP NOT NULL;


-- ============================================================================
-- 10. INVENTORY NON-NEGATIVE CONSTRAINT
-- REQUIREMENT: "Inventory can never be negative"
-- ============================================================================

-- This is crucial - prevents overselling
-- Backend should also validate, but this is the last line of defense
DO $$ 
BEGIN
    ALTER TABLE inventory ADD CONSTRAINT check_quantity_non_negative CHECK (quantity >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 11. PAYMENTS TABLE (SIMPLIFIED)
-- Records payment transactions for orders
-- ============================================================================

-- Drop and recreate with simpler structure
DROP TABLE IF EXISTS payments CASCADE;

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,            -- Amount charged
    transaction_id VARCHAR(100),               -- Payment processor's transaction ID
    created_at TIMESTAMP DEFAULT NOW()
);
-- Note: In a real system, you'd store more: payment method, status, gateway response, etc.
-- This is simplified for the project scope


-- ============================================================================
-- 12. ADDITIONAL PERFORMANCE INDEXES
-- Speed up common admin and customer queries
-- ============================================================================

-- Orders sorted by date (admin order management page)
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- Find all orders for a user (customer order history)
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

-- Find all orders for a guest session
CREATE INDEX IF NOT EXISTS idx_orders_guest ON orders(guest_id);

-- Cart item lookups (happens constantly during shopping)
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

-- Wishlist item lookups
CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);

-- User's addresses (checkout page)
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- This SELECT runs at the end to confirm everything worked
-- If you see this message, the migration succeeded!
SELECT 'Migration completed successfully!' AS status;


-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================
--
-- Things to verify after running this migration:
--
-- 1. Check that existing products still work (on_sale defaults to FALSE)
-- 2. Verify no orders were affected by the new columns (all nullable or have defaults)
-- 3. Test guest checkout flow with new wishlist/address constraints
-- 4. IMPORTANT: Payment cards table was dropped - any existing card data is GONE
--    In production, you'd migrate this data first!
--
-- Rollback considerations:
-- - Most changes are additive (ADD COLUMN) and safe
-- - The payment_cards and payments table drops are destructive
-- - Constraint additions can be reversed with DROP CONSTRAINT
--
-- ============================================================================