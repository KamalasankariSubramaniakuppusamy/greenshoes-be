CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('ADMIN', 'CUSTOMER');
CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED');


-- ============================================================
-- USERS (REGISTERED USERS)
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name      VARCHAR(100) NOT NULL,
    email          VARCHAR(100) UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    phone          VARCHAR(20),
    role           user_role NOT NULL DEFAULT 'CUSTOMER',
    created_at     TIMESTAMP DEFAULT NOW(),
    updated_at     TIMESTAMP DEFAULT NOW()
);
-- ============================================================
-- GUEST USERS (TEMPORARY CHECKOUT USERS)
-- ============================================================
CREATE TABLE guest_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

--============================================================
-- ADDRESSES
--============================================================
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
    is_default  BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_addresses_user ON addresses(user_id);

CREATE TABLE payment_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    first4_hash TEXT,     -- **** hashed
    second4_hash TEXT,
    third4_hash TEXT,
    last4_hash TEXT,
    expiry_hash TEXT,     -- mm/yyyy hashed
    created_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(150) NOT NULL,
    description   TEXT,
    cost_price    NUMERIC(10,2),
    selling_price NUMERIC(10,2) NOT NULL,
    category      VARCHAR(50),
    tax_percent   NUMERIC(5,2) DEFAULT 6.00,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE sizes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    value VARCHAR(10) NOT NULL UNIQUE
);


CREATE TABLE colors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    value VARCHAR(30) NOT NULL UNIQUE
);



CREATE TABLE product_colors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_id UUID NOT NULL REFERENCES colors(id) ON DELETE CASCADE,

    UNIQUE(product_id, color_id)
);

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color_id UUID REFERENCES colors(id), -- NULL = for all variants

    image_url TEXT NOT NULL,
    alt_text  TEXT,
    priority  INT DEFAULT 1, -- 1 = main image

    created_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size_id UUID NOT NULL REFERENCES sizes(id),
    color_id UUID NOT NULL REFERENCES colors(id),
    quantity INT NOT NULL DEFAULT 0,

    UNIQUE(product_id, size_id, color_id)
);


CREATE TABLE wishlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id)
);

CREATE TABLE wishlist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wishlist_id UUID NOT NULL REFERENCES wishlist(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    UNIQUE(wishlist_id, product_id)
);


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

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    inventory_id UUID REFERENCES inventory(id),
    price NUMERIC(10,2) NOT NULL,
    quantity INT NOT NULL
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    status payment_status NOT NULL DEFAULT 'PENDING',
    provider VARCHAR(50),
    transaction_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

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

