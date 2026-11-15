'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { db, tx, getSettings, DEFAULT_SETTINGS } = require('./db');
const { HttpError, bad, str, int, reqPhone, isEmail, slugify, toCSV } = require('./util');
const A = require('./auth');
const shop = require('./shop');
const { route } = require('./api');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const role = (min, fn) => (ctx) => { A.requireRole(ctx.user, min); return fn(ctx); };
const FABRICS = ['cotton', 'premium_cotton', 'half_silk', 'pure_silk'];
const DESIGNS = ['check', 'stripe', 'traditional', 'plain'];
const nonCancelled = "status!='cancelled'";
const BDT = "datetime(created_at,'+6 hours')";

/* ---------- dashboard ---------- */
route('GET', '/api/admin/stats', role('staff', () => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  return {
    total_sales: one(`SELECT COALESCE(SUM(total),0) n FROM orders WHERE ${nonCancelled}`).n,
    total_orders: one('SELECT COUNT(*) n FROM orders').n,
    total_customers: one("SELECT COUNT(*) n FROM users WHERE role='customer'").n,
    total_products: one('SELECT COUNT(*) n FROM products').n,
    pending_orders: one("SELECT COUNT(*) n FROM orders WHERE status='pending'").n,
    completed_orders: one("SELECT COUNT(*) n FROM orders WHERE status='delivered'").n,
    low_stock: db.prepare('SELECT id,sku,name_en,name_bn,stock,low_stock_threshold FROM products WHERE active=1 AND stock<=low_stock_threshold ORDER BY stock').all(),
    awaiting_payment_verification: one("SELECT COUNT(*) n FROM orders WHERE payment_status='awaiting_verification'").n,
    last14: db.prepare(`SELECT date(${BDT}) d, COALESCE(SUM(total),0) sales, COUNT(*) orders FROM orders WHERE ${nonCancelled} AND date(${BDT})>=date('now','+6 hours','-13 days') GROUP BY d ORDER BY d`).all(),
    recent: db.prepare('SELECT order_no,name,total,status,payment_status,created_at FROM orders ORDER BY id DESC LIMIT 8').all(),
  };
}));
route('GET', '/api/admin/notifications', role('staff', () => ({
  items: db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 40').all(),
  unread: db.prepare('SELECT COUNT(*) n FROM notifications WHERE read=0').get().n,
})));
route('POST', '/api/admin/notifications/read', role('staff', () => { db.prepare('UPDATE notifications SET read=1').run(); return { ok: true }; }));

/* ---------- products ---------- */
function productInput(b, id) {
  const sku = str(b.sku, { min: 2, max: 30, label: 'SKU' }).toUpperCase();
  if (!/^[A-Z0-9\-]+$/.test(sku)) throw bad('SKU may only contain letters, numbers and dashes.');
  const name_en = str(b.name_en, { min: 2, max: 120, label: 'English name' });
  const name_bn = str(b.name_bn, { min: 2, max: 120, label: 'Bangla name' });
  const cat = db.prepare('SELECT id FROM categories WHERE id=?').get(Number(b.category_id));
  if (!cat) throw bad('Please choose a category.');
  if (!FABRICS.includes(b.fabric)) throw bad('Invalid fabric.');
  if (!DESIGNS.includes(b.design)) throw bad('Invalid design.');
  const colors = (Array.isArray(b.colors) ? b.colors : []).slice(0, 12).map((c) => {
    const hex = String(c.hex || ''), hex2 = String(c.hex2 || c.hex || '');
    if (!/^#[0-9a-fA-F]{6}$/.test(hex) || !/^#[0-9a-fA-F]{6}$/.test(hex2)) throw bad('Colours must be hex values like #1A2B3C.');
    return { name_en: str(c.name_en, { min: 1, max: 40, label: 'Colour name' }), name_bn: str(c.name_bn || c.name_en, { max: 40 }), hex, hex2 };
  });
  if (!colors.length) throw bad('Add at least one colour.');
  const regular_price = int(b.regular_price, { min: 1, max: 1e6, label: 'Regular price' });
  let sale_price = b.sale_price === '' || b.sale_price == null ? null : int(b.sale_price, { min: 1, max: 1e6, label: 'Discounted price' });
  if (sale_price != null && sale_price >= regular_price) throw bad('Discounted price must be lower than the regular price.');
  const stock = int(b.stock, { min: 0, max: 1e6, label: 'Stock' });
  const images = (Array.isArray(b.images) ? b.images : []).slice(0, 10).map((u) => String(u));
  for (const u of images) if (!/^(\/uploads\/[\w.\-]+|\/img\/[\w\/.\-]+|https:\/\/[^\s"'<>]+)$/.test(u)) throw bad('Invalid image URL.');
  const collections = (Array.isArray(b.collections) ? b.collections : []).map(String).filter((s) => ['premium-collection', 'budget-collection'].includes(s));
  return { sku, name_en, name_bn, category_id: cat.id, desc_en: str(b.desc_en, { max: 2000, required: false }), desc_bn: str(b.desc_bn, { max: 2000, required: false }),
    fabric: b.fabric, design: b.design, length_cm: int(b.length_cm ?? 220, { min: 50, max: 500, label: 'Length' }), width_cm: int(b.width_cm ?? 110, { min: 30, max: 300, label: 'Width' }),
    colors: JSON.stringify(colors), regular_price, sale_price, stock, low_stock_threshold: int(b.low_stock_threshold ?? 10, { min: 0, max: 1e5, label: 'Low-stock threshold' }),
    featured: b.featured ? 1 : 0, is_new: b.is_new ? 1 : 0, active: b.active === false || b.active === 0 ? 0 : 1, images, collections };
}
function saveProduct(p, id) {
  return tx(() => {
    if (db.prepare('SELECT 1 FROM products WHERE sku=? AND id IS NOT ?').get(p.sku, id ?? null)) throw new HttpError(409, 'This SKU already exists.');
    let slug;
    if (id) slug = db.prepare('SELECT slug FROM products WHERE id=?').get(id).slug;
    else { slug = slugify(p.name_en); if (db.prepare('SELECT 1 FROM products WHERE slug=?').get(slug)) slug += '-' + p.sku.toLowerCase(); }
    const cols = ['sku', 'category_id', 'name_en', 'name_bn', 'desc_en', 'desc_bn', 'fabric', 'length_cm', 'width_cm', 'design', 'colors', 'regular_price', 'sale_price', 'stock', 'low_stock_threshold', 'featured', 'is_new', 'active'];
    const vals = cols.map((c) => p[c]);
    if (id) { db.prepare(`UPDATE products SET ${cols.map((c) => c + '=?').join(',')} WHERE id=?`).run(...vals, id); }
    else { const r = db.prepare(`INSERT INTO products(slug,${cols.join(',')}) VALUES (?,${cols.map(() => '?').join(',')})`).run(slug, ...vals); id = Number(r.lastInsertRowid); }
    db.prepare('DELETE FROM product_images WHERE product_id=?').run(id);
    (p.images.length ? p.images : [`/img/p/${id}/0.svg`, `/img/p/${id}/1.svg`, `/img/p/${id}/2.svg`, `/img/p/${id}/3.svg`]).forEach((u, i) => db.prepare('INSERT INTO product_images(product_id,url,sort) VALUES (?,?,?)').run(id, u, i));
    db.prepare('DELETE FROM product_collections WHERE product_id=?').run(id);
    for (const s of p.collections) db.prepare('INSERT INTO product_collections(product_id,category_id) SELECT ?,id FROM categories WHERE slug=?').run(id, s);
    return id;
  });
}
route('GET', '/api/admin/products', role('staff', (ctx) => {
  const q = String(ctx.query.q || '').replace(/[%_]/g, '');
  const rows = db.prepare(`SELECT p.*, c.name_en AS category_name, c.slug AS category_slug, 0 AS rating, 0 AS review_count FROM products p JOIN categories c ON c.id=p.category_id WHERE (?='' OR p.name_en LIKE ? OR p.sku LIKE ? OR p.name_bn LIKE ?) ORDER BY p.id DESC`).all(q, `%${q}%`, `%${q}%`, `%${q}%`);
  return { items: rows.map((r) => ({ ...shop.shapeProduct(r), active: !!r.active, category_name: r.category_name, low_stock_threshold: r.low_stock_threshold })) };
}));
route('GET', '/api/admin/products/:id', role('staff', (ctx) => {
  const r = db.prepare('SELECT p.*, c.slug AS category_slug, 0 AS rating, 0 AS review_count FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=?').get(Number(ctx.params.id));
  if (!r) throw new HttpError(404, 'Not found.');
  return { ...shop.shapeProduct(r), active: !!r.active, low_stock_threshold: r.low_stock_threshold, desc_en: r.desc_en, desc_bn: r.desc_bn,
    collections: db.prepare('SELECT c.slug FROM product_collections pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=?').all(r.id).map((x) => x.slug) };
}));
route('POST', '/api/admin/products', role('manager', (ctx) => ({ ok: true, id: saveProduct(productInput(ctx.body)) })));
route('PUT', '/api/admin/products/:id', role('manager', (ctx) => {
  const id = Number(ctx.params.id);
  if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(id)) throw new HttpError(404, 'Not found.');
  saveProduct(productInput(ctx.body, id), id); return { ok: true };
}));
route('PATCH', '/api/admin/products/:id/stock', role('staff', (ctx) => {
  db.prepare('UPDATE products SET stock=? WHERE id=?').run(int(ctx.body.stock, { min: 0, max: 1e6, label: 'Stock' }), Number(ctx.params.id)); return { ok: true };
}));
route('DELETE', '/api/admin/products/:id', role('manager', (ctx) => { db.prepare('DELETE FROM products WHERE id=?').run(Number(ctx.params.id)); return { ok: true }; }));

// Image upload: JSON {filename, data:"data:image/png;base64,..."}. Magic-byte checked; stored on local disk.
// To use Cloudinary or Supabase Storage instead, replace the fs.writeFileSync below with an upload call
// using server-side credentials and return the resulting https URL (see README).
route('POST', '/api/admin/upload', role('manager', (ctx) => {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(ctx.body.data || ''));
  if (!m) throw bad('Only PNG, JPEG or WebP images are allowed.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw bad('Image must be under 3 MB.');
  const sig = { 'image/png': buf.subarray(0, 4).toString('hex') === '89504e47', 'image/jpeg': buf.subarray(0, 3).toString('hex') === 'ffd8ff', 'image/webp': buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP' };
  if (!sig[m[1]]) throw bad('File content does not match its image type.');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[m[1]];
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return { url: '/uploads/' + name };
}));

/* ---------- categories ---------- */
route('GET', '/api/admin/categories', role('staff', () => ({ items: db.prepare('SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id=c.id) AS products FROM categories c ORDER BY sort,id').all() })));
const catInput = (b) => ({ slug: slugify(str(b.slug || b.name_en, { min: 2, max: 60, label: 'Slug' })), name_en: str(b.name_en, { min: 2, max: 80, label: 'English name' }), name_bn: str(b.name_bn, { min: 2, max: 80, label: 'Bangla name' }),
  desc_en: str(b.desc_en, { max: 300, required: false }), desc_bn: str(b.desc_bn, { max: 300, required: false }), sort: int(b.sort ?? 0, { min: 0, max: 999, label: 'Sort' }) });
route('POST', '/api/admin/categories', role('manager', (ctx) => {
  const c = catInput(ctx.body);
  if (db.prepare('SELECT 1 FROM categories WHERE slug=?').get(c.slug)) throw new HttpError(409, 'Slug already exists.');
  db.prepare('INSERT INTO categories(slug,name_en,name_bn,desc_en,desc_bn,sort) VALUES (?,?,?,?,?,?)').run(c.slug, c.name_en, c.name_bn, c.desc_en, c.desc_bn, c.sort); return { ok: true };
}));
route('PUT', '/api/admin/categories/:id', role('manager', (ctx) => {
  const c = catInput(ctx.body); const id = Number(ctx.params.id);
  if (db.prepare('SELECT 1 FROM categories WHERE slug=? AND id!=?').get(c.slug, id)) throw new HttpError(409, 'Slug already exists.');
  db.prepare('UPDATE categories SET slug=?,name_en=?,name_bn=?,desc_en=?,desc_bn=?,sort=? WHERE id=?').run(c.slug, c.name_en, c.name_bn, c.desc_en, c.desc_bn, c.sort, id); return { ok: true };
}));
route('DELETE', '/api/admin/categories/:id', role('manager', (ctx) => {
  const id = Number(ctx.params.id);
  if (db.prepare('SELECT 1 FROM products WHERE category_id=?').get(id)) throw bad('Move or delete this category\'s products first.');
  db.prepare('DELETE FROM categories WHERE id=?').run(id); return { ok: true };
}));

/* ---------- orders ---------- */
route('GET', '/api/admin/orders', role('staff', (ctx) => {
  const q = String(ctx.query.q || '').trim().replace(/[%_]/g, ''), st = String(ctx.query.status || '');
  const where = [], args = [];
  if (q) { where.push('(order_no LIKE ? OR phone LIKE ? OR alt_phone LIKE ? OR name LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (st) { where.push('status=?'); args.push(st); }
  if (ctx.query.payment) { where.push('payment_status=?'); args.push(String(ctx.query.payment)); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const page = Math.max(parseInt(ctx.query.page) || 1, 1), limit = 25;
  const total = db.prepare(`SELECT COUNT(*) n FROM orders ${w}`).get(...args).n;
  const items = db.prepare(`SELECT id,order_no,name,phone,district,total,status,payment_method,payment_status,created_at FROM orders ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  return { total, page, pages: Math.ceil(total / limit), items };
}));
route('GET', '/api/admin/orders/:no', role('staff', (ctx) => {
  const o = shop.orderDetail('order_no=?', ctx.params.no);
  if (!o) throw new HttpError(404, 'Order not found.'); return o;
}));
route('PUT', '/api/admin/orders/:no/status', role('staff', (ctx) => {
  const o = db.prepare('SELECT id FROM orders WHERE order_no=?').get(ctx.params.no);
  if (!o) throw new HttpError(404, 'Order not found.');
  shop.setOrderStatus(o.id, String(ctx.body.status), str(ctx.body.note, { max: 200, required: false }), ctx.user.id); return { ok: true };
}));
route('PUT', '/api/admin/orders/:no/payment', role('staff', (ctx) => {
  const ps = String(ctx.body.payment_status);
  if (!['unpaid', 'awaiting_verification', 'paid', 'failed', 'refunded'].includes(ps)) throw bad('Invalid payment status.');
  const o = db.prepare('SELECT id,payment_status FROM orders WHERE order_no=?').get(ctx.params.no);
  if (!o) throw new HttpError(404, 'Order not found.');
  db.prepare('UPDATE orders SET payment_status=? WHERE id=?').run(ps, o.id);
  db.prepare('INSERT INTO order_events(order_id,status,note,by_user) SELECT id,status,?,? FROM orders WHERE id=?').run(`Payment marked ${ps} by staff`, ctx.user.id, o.id);
  return { ok: true };
}));

/* ---------- customers ---------- */
route('GET', '/api/admin/customers', role('staff', (ctx) => {
  const q = String(ctx.query.q || '').replace(/[%_]/g, '');
  return { items: db.prepare(`SELECT u.id,u.name,u.phone,u.email,u.active,u.created_at,(SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS orders,(SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id=u.id AND o.status!='cancelled') AS spent
    FROM users u WHERE u.role='customer' AND (?='' OR u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?) ORDER BY u.id DESC LIMIT 200`).all(q, `%${q}%`, `%${q}%`, `%${q}%`) };
}));
route('GET', '/api/admin/customers/:id', role('staff', (ctx) => {
  const u = db.prepare("SELECT id,name,phone,email,active,created_at FROM users WHERE id=? AND role='customer'").get(Number(ctx.params.id));
  if (!u) throw new HttpError(404, 'Not found.');
  u.orders = db.prepare('SELECT order_no,total,status,payment_status,created_at FROM orders WHERE user_id=? ORDER BY id DESC').all(u.id);
  u.addresses = db.prepare('SELECT * FROM addresses WHERE user_id=?').all(u.id); return u;
}));
route('PUT', '/api/admin/customers/:id/active', role('admin', (ctx) => {
  const id = Number(ctx.params.id);
  db.prepare("UPDATE users SET active=? WHERE id=? AND role='customer'").run(ctx.body.active ? 1 : 0, id);
  if (!ctx.body.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); return { ok: true };
}));
route('POST', '/api/admin/customers/:id/password', role('admin', (ctx) => {
  A.checkPasswordStrength(ctx.body.password); const id = Number(ctx.params.id);
  db.prepare("UPDATE users SET password_hash=? WHERE id=? AND role='customer'").run(A.hashPassword(ctx.body.password), id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); return { ok: true };
}));

/* ---------- marketing ---------- */
const couponInput = (b) => {
  const type = b.type === 'fixed' ? 'fixed' : 'percent';
  const value = int(b.value, { min: 1, max: type === 'percent' ? 100 : 1e6, label: 'Value' });
  const opt = (v, l) => (v === '' || v == null ? null : int(v, { min: 0, max: 1e7, label: l }));
  const exp = b.expires_at ? str(b.expires_at, { max: 10 }) : null;
  if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) throw bad('Expiry must be YYYY-MM-DD.');
  return { code: str(b.code, { min: 3, max: 30, label: 'Code' }).toUpperCase().replace(/[^A-Z0-9_-]/g, ''), type, value, min_subtotal: opt(b.min_subtotal, 'Minimum') ?? 0, max_discount: opt(b.max_discount, 'Max discount'),
    usage_limit: opt(b.usage_limit, 'Usage limit'), expires_at: exp, active: b.active === false ? 0 : 1 };
};
route('GET', '/api/admin/coupons', role('staff', () => ({ items: db.prepare('SELECT * FROM coupons ORDER BY id DESC').all() })));
route('POST', '/api/admin/coupons', role('manager', (ctx) => {
  const c = couponInput(ctx.body);
  if (db.prepare('SELECT 1 FROM coupons WHERE code=?').get(c.code)) throw new HttpError(409, 'Code already exists.');
  db.prepare('INSERT INTO coupons(code,type,value,min_subtotal,max_discount,usage_limit,expires_at,active) VALUES (?,?,?,?,?,?,?,?)').run(c.code, c.type, c.value, c.min_subtotal, c.max_discount, c.usage_limit, c.expires_at, c.active); return { ok: true };
}));
route('PUT', '/api/admin/coupons/:id', role('manager', (ctx) => {
  const c = couponInput(ctx.body);
  db.prepare('UPDATE coupons SET code=?,type=?,value=?,min_subtotal=?,max_discount=?,usage_limit=?,expires_at=?,active=? WHERE id=?').run(c.code, c.type, c.value, c.min_subtotal, c.max_discount, c.usage_limit, c.expires_at, c.active, Number(ctx.params.id)); return { ok: true };
}));
route('DELETE', '/api/admin/coupons/:id', role('manager', (ctx) => { db.prepare('DELETE FROM coupons WHERE id=?').run(Number(ctx.params.id)); return { ok: true }; }));

const hexc = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : d);
const bannerInput = (b) => ({ title_en: str(b.title_en, { max: 120, required: false }), title_bn: str(b.title_bn, { max: 120, required: false }), sub_en: str(b.sub_en, { max: 200, required: false }), sub_bn: str(b.sub_bn, { max: 200, required: false }),
  link: (() => { const l = str(b.link, { max: 200, required: false }); if (l && !/^\/[^\/\\]/.test(l) && l !== '/') throw bad('Link must be a site path like /c/cotton-lungi.'); return l; })(),
  color1: hexc(b.color1, '#24272D'), color2: hexc(b.color2, '#B98B3E'), active: b.active === false ? 0 : 1, sort: int(b.sort ?? 0, { min: 0, max: 999, label: 'Sort' }) });
route('GET', '/api/admin/banners', role('staff', () => ({ items: db.prepare('SELECT * FROM banners ORDER BY sort,id').all() })));
route('POST', '/api/admin/banners', role('manager', (ctx) => { const b = bannerInput(ctx.body); db.prepare('INSERT INTO banners(title_en,title_bn,sub_en,sub_bn,link,color1,color2,active,sort) VALUES (?,?,?,?,?,?,?,?,?)').run(b.title_en, b.title_bn, b.sub_en, b.sub_bn, b.link, b.color1, b.color2, b.active, b.sort); return { ok: true }; }));
route('PUT', '/api/admin/banners/:id', role('manager', (ctx) => { const b = bannerInput(ctx.body); db.prepare('UPDATE banners SET title_en=?,title_bn=?,sub_en=?,sub_bn=?,link=?,color1=?,color2=?,active=?,sort=? WHERE id=?').run(b.title_en, b.title_bn, b.sub_en, b.sub_bn, b.link, b.color1, b.color2, b.active, b.sort, Number(ctx.params.id)); return { ok: true }; }));
route('DELETE', '/api/admin/banners/:id', role('manager', (ctx) => { db.prepare('DELETE FROM banners WHERE id=?').run(Number(ctx.params.id)); return { ok: true }; }));
route('PATCH', '/api/admin/products/:id/flags', role('manager', (ctx) => {
  db.prepare('UPDATE products SET featured=?, is_new=? WHERE id=?').run(ctx.body.featured ? 1 : 0, ctx.body.is_new ? 1 : 0, Number(ctx.params.id)); return { ok: true };
}));

/* ---------- settings (delivery charges etc.) ---------- */
const MANAGER_KEYS = new Set(['hero_title_bn', 'hero_sub_bn', 'hero_title_en', 'hero_sub_en']);
route('GET', '/api/admin/settings', role('manager', () => getSettings()));
route('PUT', '/api/admin/settings', role('manager', (ctx) => {
  const up = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  tx(() => {
    for (const [k, v] of Object.entries(ctx.body || {})) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      if (!MANAGER_KEYS.has(k)) A.requireRole(ctx.user, 'admin');
      let val = str(v, { max: 300, required: false });
      if (['delivery_inside_dhaka', 'delivery_outside_dhaka', 'free_delivery_over'].includes(k)) val = String(int(val === '' ? 0 : val, { min: 0, max: 100000, label: k }));
      if (k.startsWith('manual_') && val && !/^01[3-9]\d{8}$/.test(val)) throw bad('Merchant number must be a valid mobile number.');
      if (['facebook_url', 'instagram_url'].includes(k) && val && !/^https:\/\//.test(val)) throw bad('Social links must start with https://');
      up.run(k, val);
    }
  });
  return { ok: true };
}));

/* ---------- reviews ---------- */
route('GET', '/api/admin/reviews', role('manager', () => ({ items: db.prepare('SELECT r.*, p.name_en FROM reviews r JOIN products p ON p.id=r.product_id ORDER BY r.id DESC LIMIT 100').all() })));
route('DELETE', '/api/admin/reviews/:id', role('manager', (ctx) => { db.prepare('DELETE FROM reviews WHERE id=?').run(Number(ctx.params.id)); return { ok: true }; }));

/* ---------- staff accounts ---------- */
route('GET', '/api/admin/staff', role('admin', () => ({ items: db.prepare("SELECT id,name,phone,email,role,active,created_at FROM users WHERE role!='customer' ORDER BY id").all() })));
route('POST', '/api/admin/staff', role('admin', (ctx) => {
  const r = ['staff', 'manager', 'admin'].includes(ctx.body.role) ? ctx.body.role : 'staff';
  const email = str(ctx.body.email, { min: 5, max: 200, label: 'Email' }).toLowerCase(); if (!isEmail(email)) throw bad('Invalid email.');
  A.checkPasswordStrength(ctx.body.password);
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new HttpError(409, 'Email already in use.');
  db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)').run(str(ctx.body.name, { min: 2, max: 100, label: 'Name' }), email, A.hashPassword(ctx.body.password), r); return { ok: true };
}));
route('PUT', '/api/admin/staff/:id', role('admin', (ctx) => {
  const id = Number(ctx.params.id);
  if (id === ctx.user.id) throw bad('You cannot change your own role or status.');
  const r = ['staff', 'manager', 'admin'].includes(ctx.body.role) ? ctx.body.role : 'staff';
  db.prepare("UPDATE users SET role=?, active=? WHERE id=? AND role!='customer'").run(r, ctx.body.active === false ? 0 : 1, id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); return { ok: true };
}));

/* ---------- reports ---------- */
function reportRows(type, from, to) {
  const f = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : '2000-01-01', t = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : '2999-12-31';
  if (type === 'monthly') return db.prepare(`SELECT strftime('%Y-%m',${BDT}) AS period, COUNT(*) AS orders, COALESCE(SUM(subtotal),0) AS subtotal, COALESCE(SUM(discount),0) AS discount, COALESCE(SUM(delivery_charge),0) AS delivery, COALESCE(SUM(total),0) AS revenue FROM orders WHERE ${nonCancelled} AND date(${BDT}) BETWEEN ? AND ? GROUP BY period ORDER BY period DESC`).all(f, t);
  return db.prepare(`SELECT date(${BDT}) AS period, COUNT(*) AS orders, COALESCE(SUM(subtotal),0) AS subtotal, COALESCE(SUM(discount),0) AS discount, COALESCE(SUM(delivery_charge),0) AS delivery, COALESCE(SUM(total),0) AS revenue FROM orders WHERE ${nonCancelled} AND date(${BDT}) BETWEEN ? AND ? GROUP BY period ORDER BY period DESC LIMIT 400`).all(f, t);
}
const bestSellers = () => db.prepare(`SELECT i.sku, i.name, SUM(i.qty) AS units, SUM(i.qty*i.unit_price) AS revenue FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status!='cancelled' GROUP BY i.sku, i.name ORDER BY units DESC LIMIT 15`).all();
route('GET', '/api/admin/reports', role('manager', (ctx) => {
  const type = ctx.query.type === 'monthly' ? 'monthly' : 'daily';
  const rows = reportRows(type, ctx.query.from, ctx.query.to);
  return { type, rows, total_revenue: rows.reduce((a, r) => a + r.revenue, 0), total_orders: rows.reduce((a, r) => a + r.orders, 0), best_sellers: bestSellers() };
}));
route('GET', '/api/admin/reports/export', role('manager', (ctx) => {
  const type = String(ctx.query.type || 'daily');
  let rows;
  if (type === 'best') { const b = bestSellers(); rows = [['SKU', 'Product', 'Units sold', 'Revenue (BDT)'], ...b.map((r) => [r.sku, r.name, r.units, r.revenue])]; }
  else if (type === 'orders') { rows = [['Order ID', 'Date', 'Customer', 'Phone', 'District', 'Status', 'Payment method', 'Payment status', 'Subtotal', 'Discount', 'Delivery', 'Total'],
    ...db.prepare(`SELECT order_no,${BDT} d,name,phone,district,status,payment_method,payment_status,subtotal,discount,delivery_charge,total FROM orders ORDER BY id DESC`).all().map((o) => Object.values(o))]; }
  else { const r = reportRows(type === 'monthly' ? 'monthly' : 'daily', ctx.query.from, ctx.query.to); rows = [[type === 'monthly' ? 'Month' : 'Date', 'Orders', 'Subtotal', 'Discount', 'Delivery', 'Revenue (BDT)'], ...r.map((x) => [x.period, x.orders, x.subtotal, x.discount, x.delivery, x.revenue])]; }
  return { __raw: toCSV(rows), type: 'text/csv; charset=utf-8', filename: `${type}-report.csv` };
}));
