-- ============================================================
--  EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
--  ENUM TYPES
-- ============================================================
CREATE TYPE user_role AS ENUM ('ADMIN', 'CUSTOMER');
CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- ============================================================
--  USERS (Registered Customers & Admins)
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone         VARCHAR(20),
    role          user_role NOT NULL DEFAULT 'CUSTOMER',
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
--  GUEST USERS
-- ============================================================
CREATE TABLE guest_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
--  ADDRESSES
-- ============================================================
CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    full_name   VARCHAR(100) NOT NULL,
    phone       VARCHAR(20),
    address1    VARCHAR(255) NOT NULL,
    address2    VARCHAR(255),
    city        VARCHAR(100),
    state       VARCHAR(100),
    postal_code VARCHAR(20),
    country     VARCHAR(100),
    is_default  BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_addresses_user ON addresses(user_id);

-- ============================================================
--  PRODUCTS
-- ============================================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    price       NUMERIC(10,2) NOT NULL,
    category    VARCHAR(50),
    image_url   TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
--  INVENTORY
-- ============================================================
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size VARCHAR(10) NOT NULL,
    quantity INT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX idx_inventory_unique 
ON inventory(product_id, size);

-- ============================================================
--  WISHLIST
-- ============================================================
CREATE TABLE wishlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_wishlist_user ON wishlist(user_id);

-- Wishlist Items
CREATE TABLE wishlist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wishlist_id UUID NOT NULL REFERENCES wishlist(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_wishlist_unique
ON wishlist_items(wishlist_id, product_id);

-- ============================================================
--  CART
-- ============================================================
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES guest_users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cart_user ON carts(user_id);
CREATE INDEX idx_cart_guest ON carts(guest_id);

-- ============================================================
--  CART ITEMS
-- ============================================================
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    inventory_id UUID REFERENCES inventory(id),
    quantity INT NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_cart_items_unique
ON cart_items(cart_id, product_id, inventory_id);

-- ============================================================
--  ORDERS
-- ============================================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    guest_id UUID REFERENCES guest_users(id),
    shipping_address_id UUID REFERENCES addresses(id),
    billing_address_id  UUID REFERENCES addresses(id),
    total_amount NUMERIC(10,2) NOT NULL,
    status order_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);

-- ============================================================
--  ORDER ITEMS
-- ============================================================
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    inventory_id UUID REFERENCES inventory(id),
    price NUMERIC(10,2) NOT NULL,
    quantity INT NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================
--  PAYMENTS
-- ============================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    status payment_status NOT NULL DEFAULT 'PENDING',
    provider VARCHAR(50),
    transaction_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
--  REVIEWS
-- ============================================================
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    product_id UUID NOT NULL REFERENCES products(id),
    rating INT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reviews_product ON reviews(product_id);

-- ============================================================
--  TWO-FACTOR AUTH
-- ============================================================
CREATE TABLE user_2fa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret VARCHAR(200) NOT NULL,
    is_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
--  AUDIT LOGS
-- ============================================================
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
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
