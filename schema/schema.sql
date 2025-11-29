--- NOTES TO SELF AND FOR REVIEWERS TO UNDERSTAND WHY THINGS ARE WRITTEN A CERTAIN WAY ---

-- The complete database schema for GreenShoes e-commerce platform
-- Edited time and again by: Kamala
-- This schema was edited regularly to modify migrations according to new features and requirements.
-- NOTE: I'll mostly comment out sections that are no longer needed but were part of previous iterations/sprint endeavors. 
-- I also have the habit of adding comments to almost everything I code here so that I don't get lost later when I'm trying to remember why I did something a certain way.
-- I may also leave certain constraints or indexes commented out if I decide to handle them at the application level instead of the database level.




CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMS

CREATE TYPE user_role AS ENUM ('ADMIN', 'CUSTOMER'); -- Only two roles as per the requirements and this will later be the fondation for RBAC requirement.
CREATE TYPE order_status AS ENUM ('ORDERED');


-- USERS (REGISTERED USERS)

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'CUSTOMER',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- GUEST USERS (TEMPORARY CHECKOUT USERS)

CREATE TABLE guest_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);


-- ADDRESSES (Supports both registered and guest users)

CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- Nullable for guest orders
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address1 VARCHAR(255) NOT NULL,
    address2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_addresses_user ON addresses(user_id);

-- PAYMENT CARDS (Encrypted segments)

CREATE TABLE payment_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Encrypted card segments (NOT hashed - can be decrypted)
    segment1_encrypted TEXT NOT NULL,  -- ABCD
    segment2_encrypted TEXT NOT NULL,  -- EFGH
    segment3_encrypted TEXT NOT NULL,  -- IJKL
    segment4_encrypted TEXT NOT NULL,  -- MNOP
    expiry_encrypted TEXT NOT NULL,    -- MM/YYYY
    
    -- Metadata
    card_type VARCHAR(20) DEFAULT 'DEBIT',
    last4_plain VARCHAR(4),  -- For display: **** **** **** 1234
    is_default BOOLEAN DEFAULT FALSE,
    billing_address_id UUID REFERENCES addresses(id),
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id)  -- One card per user (As per the requirements document: One user can have only one card and greenshoes supports payments only through debit cards)
);

-- PRODUCTS 
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    
    -- PRICING 
    cost_price NUMERIC(10,2),           -- Base cost
    selling_price NUMERIC(10,2) NOT NULL,  -- Regular selling price
    price_category VARCHAR(20) DEFAULT 'normal',  -- 'discount' or 'normal'
    on_sale BOOLEAN DEFAULT FALSE,      -- Temporary sale flag
    sale_price NUMERIC(10,2),           -- Temporary sale price
    
    -- ENVIRONMENTAL IMPACT
    impact_story TEXT,
    sustainability_rating INT CHECK (sustainability_rating IS NULL OR (sustainability_rating >= 1 AND sustainability_rating <= 5)),
    carbon_footprint VARCHAR(100),
    ethical_sourcing TEXT,
    recycled_materials BOOLEAN DEFAULT FALSE,
    
    -- METADATA
    category VARCHAR(50),
    tax_percent NUMERIC(5,2) DEFAULT 6.00,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- CONSTRAINTS
    CONSTRAINT check_sale_price CHECK (
        (on_sale = FALSE AND sale_price IS NULL) OR
        (on_sale = TRUE AND sale_price IS NOT NULL AND sale_price < selling_price)
    )
);

-- Indexes for products
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_price ON products(selling_price);
CREATE INDEX idx_products_on_sale ON products(on_sale) WHERE on_sale = TRUE;


-- SIZES
CREATE TABLE sizes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    value VARCHAR(10) NOT NULL UNIQUE
);

-- COLORS
CREATE TABLE colors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    value VARCHAR(30) NOT NULL UNIQUE
);

-- PRODUCT COLORS (Many-to-many)
CREATE TABLE product_colors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_id UUID NOT NULL REFERENCES colors(id) ON DELETE CASCADE,
    UNIQUE(product_id, color_id)
);

-- PRODUCT IMAGES
CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_id UUID REFERENCES colors(id),  -- NULL = for all variants
    image_url TEXT NOT NULL,
    alt_text TEXT,
    priority INT DEFAULT 1,  -- 1 = main image
    created_at TIMESTAMP DEFAULT NOW()
);

-- INVENTORY (Per size/color variant)
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size_id UUID NOT NULL REFERENCES sizes(id),
    color_id UUID NOT NULL REFERENCES colors(id),
    quantity INT NOT NULL DEFAULT 0,
    UNIQUE(product_id, size_id, color_id),
    CONSTRAINT check_quantity_non_negative CHECK (quantity >= 0)
);

-- WISHLIST (Supports both registered and guest users)
CREATE TABLE wishlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guest_users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints: must have either user_id OR guest_id (not both)
    CONSTRAINT wishlist_user_unique UNIQUE(user_id),
    CONSTRAINT wishlist_guest_unique UNIQUE(guest_id),
    CONSTRAINT wishlist_owner_check CHECK (
        (user_id IS NOT NULL AND guest_id IS NULL) OR 
        (user_id IS NULL AND guest_id IS NOT NULL)
    )
);

CREATE TABLE wishlist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wishlist_id UUID NOT NULL REFERENCES wishlist(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(wishlist_id, product_id)
);

CREATE INDEX idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);


-- CARTS (Supports both registered and guest users)
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guest_users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    inventory_id UUID REFERENCES inventory(id),
    quantity INT NOT NULL DEFAULT 1,
    UNIQUE(cart_id, product_id, inventory_id)
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);

-- ORDERS (Supports both registered and guest users)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    guest_id UUID REFERENCES guest_users(id),
    
    shipping_address_id UUID REFERENCES addresses(id),
    billing_address_id UUID REFERENCES addresses(id),
    
    -- Price breakdown
    subtotal NUMERIC(10,2),
    tax NUMERIC(10,2),
    shipping_fee NUMERIC(10,2),
    total_amount NUMERIC(10,2) NOT NULL,
    
    -- Metadata
    order_number VARCHAR(20) UNIQUE,
    payment_method VARCHAR(50) DEFAULT 'DEBIT_CARD',
    status order_status NOT NULL DEFAULT 'ORDERED',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_guest ON orders(guest_id);

-- ORDER ITEMS
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    inventory_id UUID REFERENCES inventory(id),
    price NUMERIC(10,2) NOT NULL,  -- Price at time of order
    quantity INT NOT NULL
);

-- PAYMENTS 
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    transaction_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- AUDIT LOGS
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    entity_type VARCHAR(50),
    entity_id UUID,
    action VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);