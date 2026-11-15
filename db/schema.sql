-- SQLite schema (used by the app). A PostgreSQL equivalent is in schema.postgres.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff','manager','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  reset_token_hash TEXT,
  reset_expires INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT, name TEXT NOT NULL, phone TEXT NOT NULL,
  address TEXT NOT NULL, district TEXT NOT NULL, upazila TEXT, post_code TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL, name_bn TEXT NOT NULL,
  desc_en TEXT, desc_bn TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name_en TEXT NOT NULL, name_bn TEXT NOT NULL,
  desc_en TEXT, desc_bn TEXT,
  fabric TEXT NOT NULL,              -- cotton | premium_cotton | half_silk | pure_silk
  length_cm INTEGER NOT NULL DEFAULT 220,
  width_cm INTEGER NOT NULL DEFAULT 110,
  design TEXT NOT NULL,              -- check | stripe | traditional | plain
  colors TEXT NOT NULL DEFAULT '[]', -- JSON: [{name_en,name_bn,hex,hex2}]
  regular_price INTEGER NOT NULL,    -- BDT, whole taka
  sale_price INTEGER,                -- null = no discount
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  featured INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_collections (   -- e.g. "premium", "budget"
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT, verified INTEGER NOT NULL DEFAULT 0, approved INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wishlist (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value INTEGER NOT NULL,
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  usage_limit INTEGER, used INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
  payment_ref TEXT,                 -- gateway transaction id / manual TrxID
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  sku TEXT NOT NULL, name TEXT NOT NULL, color TEXT,
  unit_price INTEGER NOT NULL, qty INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL, note TEXT, by_user INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_en TEXT, title_bn TEXT, sub_en TEXT, sub_bn TEXT,
  link TEXT, color1 TEXT DEFAULT '#24272D', color2 TEXT DEFAULT '#B98B3E',
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- In-app order notifications (shown in admin). No email/SMS is sent by this table.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL, message TEXT NOT NULL, ref TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
