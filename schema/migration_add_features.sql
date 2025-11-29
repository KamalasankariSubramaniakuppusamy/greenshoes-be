-- ===============================================
-- MIGRATION: Add Missing Features to Existing DB
-- Does NOT delete existing data
-- ===============================================

-- 1. Add new columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS on_sale BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_category VARCHAR(20) DEFAULT 'normal';

-- 2. Add environmental impact columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS impact_story TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sustainability_rating INT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS carbon_footprint VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ethical_sourcing TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS recycled_materials BOOLEAN DEFAULT FALSE;

-- 3. Add constraints
DO $$ 
BEGIN
    ALTER TABLE products ADD CONSTRAINT check_sale_price 
    CHECK (
        (on_sale = FALSE AND sale_price IS NULL) OR
        (on_sale = TRUE AND sale_price IS NOT NULL AND sale_price < selling_price)
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE products ADD CONSTRAINT check_sustainability_rating
    CHECK (sustainability_rating IS NULL OR (sustainability_rating >= 1 AND sustainability_rating <= 5));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 4. Add indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(selling_price);
CREATE INDEX IF NOT EXISTS idx_products_on_sale ON products(on_sale) WHERE on_sale = TRUE;

-- 5. Fix wishlist for guest support
ALTER TABLE wishlist ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES guest_users(id) ON DELETE CASCADE;
ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS added_at TIMESTAMP DEFAULT NOW();

-- Remove old constraint if exists
DO $$ 
BEGIN
    ALTER TABLE wishlist DROP CONSTRAINT IF EXISTS wishlist_user_id_key;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Add new constraints
DO $$ 
BEGIN
    ALTER TABLE wishlist ADD CONSTRAINT wishlist_user_unique UNIQUE(user_id);
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE wishlist ADD CONSTRAINT wishlist_guest_unique UNIQUE(guest_id);
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;

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

-- 6. Recreate payment_cards with encryption structure
DROP TABLE IF EXISTS payment_cards CASCADE;

CREATE TABLE payment_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    segment1_encrypted TEXT NOT NULL,
    segment2_encrypted TEXT NOT NULL,
    segment3_encrypted TEXT NOT NULL,
    segment4_encrypted TEXT NOT NULL,
    expiry_encrypted TEXT NOT NULL,
    
    card_type VARCHAR(20) DEFAULT 'DEBIT',
    last4_plain VARCHAR(4),
    is_default BOOLEAN DEFAULT FALSE,
    billing_address_id UUID REFERENCES addresses(id),
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- 7. Add order breakdown columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20) UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'DEBIT_CARD';

-- 8. Fix order_status enum (if needed)
DO $$ 
BEGIN
    -- Add ORDERED if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'ORDERED' 
        AND enumtypid = 'order_status'::regtype
    ) THEN
        ALTER TYPE order_status ADD VALUE 'ORDERED';
    END IF;
END $$;

-- Set default status
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'ORDERED';

-- 9. Fix addresses for guest orders
ALTER TABLE addresses ALTER COLUMN user_id DROP NOT NULL;

-- 10. Add inventory constraint
DO $$ 
BEGIN
    ALTER TABLE inventory ADD CONSTRAINT check_quantity_non_negative CHECK (quantity >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 11. Recreate payments table (simplified)
DROP TABLE IF EXISTS payments CASCADE;

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    transaction_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 12. Add useful indexes
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_guest ON orders(guest_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- Done!
SELECT 'Migration completed successfully!' AS status;