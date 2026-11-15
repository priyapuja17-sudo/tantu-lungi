-- PostgreSQL equivalent of schema.sql (for migrating to Postgres / Supabase).
-- NOTE: the running app uses SQLite (node:sqlite). To switch, port the queries in server/*.js to a pg client:
--   * `?` placeholders -> $1,$2..;  * datetime('now') -> now();  * `COLLATE NOCASE` -> ILIKE / lower();
--   * strftime/date(+6 hours) in reports -> (created_at AT TIME ZONE 'Asia/Dhaka');  * lastInsertRowid -> RETURNING id.
-- Money columns are whole BDT (integer) on purpose: no floating-point rounding.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff','manager','admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  reset_token_hash TEXT,
  reset_expires BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS addresses (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT, name TEXT NOT NULL, phone TEXT NOT NULL,
  address TEXT NOT NULL, district TEXT NOT NULL, upazila TEXT, post_code TEXT
);
CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL, name_bn TEXT NOT NULL,
  desc_en TEXT, desc_bn TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id),
  name_en TEXT NOT NULL, name_bn TEXT NOT NULL,
  desc_en TEXT, desc_bn TEXT,
  fabric TEXT NOT NULL CHECK (fabric IN ('cotton','premium_cotton','half_silk','pure_silk')),
  length_cm INTEGER NOT NULL DEFAULT 220,
  width_cm INTEGER NOT NULL DEFAULT 110,
  design TEXT NOT NULL CHECK (design IN ('check','stripe','traditional','plain')),
  colors JSONB NOT NULL DEFAULT '[]',
  regular_price INTEGER NOT NULL CHECK (regular_price > 0),
  sale_price INTEGER CHECK (sale_price IS NULL OR (sale_price > 0 AND sale_price < regular_price)),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_new BOOLEAN NOT NULL DEFAULT FALSE,
  sold INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS product_collections (
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);
CREATE TABLE IF NOT EXISTS product_images (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  author TEXT NOT NULL, rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT, verified BOOLEAN NOT NULL DEFAULT FALSE, approved BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wishlist (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value INTEGER NOT NULL,
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  usage_limit INTEGER, used INTEGER NOT NULL DEFAULT 0,
  expires_at DATE, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_ci ON coupons (lower(code));
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, alt_phone TEXT,
  address TEXT NOT NULL, district TEXT NOT NULL, upazila TEXT, post_code TEXT,
  subtotal INTEGER NOT NULL, delivery_charge INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod','bkash','nagad','rocket')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','awaiting_verification','paid','failed','refunded')),
  payment_ref TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  sku TEXT NOT NULL, name TEXT NOT NULL, color TEXT,
  unit_price INTEGER NOT NULL, qty INTEGER NOT NULL CHECK (qty > 0)
);
CREATE TABLE IF NOT EXISTS order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL, note TEXT, by_user BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS banners (
  id BIGSERIAL PRIMARY KEY,
  title_en TEXT, title_bn TEXT, sub_en TEXT, sub_bn TEXT,
  link TEXT, color1 TEXT DEFAULT '#24272D', color2 TEXT DEFAULT '#B98B3E',
  active BOOLEAN NOT NULL DEFAULT TRUE, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL, message TEXT NOT NULL, ref TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
