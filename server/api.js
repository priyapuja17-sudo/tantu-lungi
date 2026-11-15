'use strict';
const crypto = require('node:crypto');
const { db, tx, getSettings } = require('./db');
const { HttpError, bad, str, int, normPhone, reqPhone, isEmail, rateLimit } = require('./util');
const A = require('./auth');
const shop = require('./shop');
const { DISTRICTS } = require('./geo');
const { methodStatus, providers } = require('./payments');
const { adminNotify, sendToCustomer } = require('./notify');

const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler, opts });
}
const needUser = (ctx) => { if (!ctx.user) throw new HttpError(401, 'Please log in.'); return ctx.user; };
const PUBLIC_SETTINGS = ['store_name_en', 'store_name_bn', 'hero_title_bn', 'hero_sub_bn', 'hero_title_en', 'hero_sub_en', 'delivery_inside_dhaka', 'delivery_outside_dhaka', 'free_delivery_over',
  'contact_phone', 'contact_email', 'contact_address_en', 'contact_address_bn', 'whatsapp_number', 'facebook_url', 'instagram_url', 'return_policy_bn', 'return_policy_en'];

/* ---------- storefront ---------- */
route('GET', '/api/config', (ctx) => {
  const s = getSettings();
  const pub = {}; for (const k of PUBLIC_SETTINGS) pub[k] = s[k];
  const pm = methodStatus(); const payments = {};
  for (const [k, v] of Object.entries(pm)) payments[k] = { enabled: v.enabled, mode: v.mode, number: v.mode === 'manual' ? v.number : undefined };
  return {
    settings: pub, payments, user: ctx.user,
    categories: db.prepare('SELECT slug,name_en,name_bn,desc_en,desc_bn,(SELECT COUNT(*) FROM products p WHERE p.active=1 AND (p.category_id=categories.id OR p.id IN (SELECT product_id FROM product_collections WHERE category_id=categories.id))) AS count FROM categories ORDER BY sort,id').all(),
    districts: Object.fromEntries(Object.entries(DISTRICTS)),
    colors: [...new Map(db.prepare('SELECT colors FROM products WHERE active=1').all().flatMap((r) => JSON.parse(r.colors)).map((c) => [c.name_en, { name_en: c.name_en, name_bn: c.name_bn, hex: c.hex }])).values()],
    price_range: db.prepare('SELECT MIN(COALESCE(sale_price,regular_price)) min, MAX(COALESCE(sale_price,regular_price)) max FROM products WHERE active=1').get(),
  };
});
route('GET', '/api/home', () => {
  const s = (q) => shop.listProducts(q).items;
  return {
    banners: db.prepare('SELECT * FROM banners WHERE active=1 ORDER BY sort,id').all(),
    featured: s({ featured: 1, limit: 8, sort: 'popular' }),
    best: s({ sort: 'popular', limit: 8 }),
    arrivals: s({ isnew: 1, limit: 8, sort: 'newest' }),
    offers: s({ sale: 1, limit: 8, sort: 'price_asc' }),
    testimonials: db.prepare(`SELECT r.author,r.rating,r.body,r.verified,p.name_en,p.name_bn,p.slug FROM reviews r JOIN products p ON p.id=r.product_id WHERE r.approved=1 AND r.rating>=4 AND length(r.body)>20 ORDER BY r.id DESC LIMIT 6`).all(),
    stats: { products: db.prepare('SELECT COUNT(*) n FROM products WHERE active=1').get().n },
  };
});
route('GET', '/api/products', (ctx) => shop.listProducts(ctx.query));
route('GET', '/api/products/suggest', (ctx) => {
  const q = String(ctx.query.q || '').trim();
  if (q.length < 1) return { items: [] };
  return { items: shop.listProducts({ q, limit: 6, sort: 'popular' }).items.map((p) => ({ slug: p.slug, name_en: p.name_en, name_bn: p.name_bn, price: p.price, image: p.images[0] })) };
});
route('GET', '/api/products/:slug', (ctx) => {
  const p = shop.getProductBySlug(ctx.params.slug);
  if (!p) throw new HttpError(404, 'Product not found.');
  p.reviews = db.prepare('SELECT author,rating,body,verified,created_at FROM reviews WHERE product_id=? AND approved=1 ORDER BY id DESC LIMIT 50').all(p.id);
  p.related = shop.listProducts({ cat: p.category_slug, limit: 5, sort: 'popular' }).items.filter((x) => x.id !== p.id).slice(0, 4);
  p.rating_breakdown = [5, 4, 3, 2, 1].map((n) => db.prepare('SELECT COUNT(*) n FROM reviews WHERE product_id=? AND approved=1 AND rating=?').get(p.id, n).n);
  return p;
});
route('POST', '/api/products/:slug/reviews', (ctx) => {
  const u = needUser(ctx);
  const p = db.prepare('SELECT id FROM products WHERE slug=? AND active=1').get(ctx.params.slug);
  if (!p) throw new HttpError(404, 'Product not found.');
  const rating = int(ctx.body.rating, { min: 1, max: 5, label: 'Rating' });
  const body = str(ctx.body.body, { max: 1000, label: 'Review', required: false });
  const bought = !!db.prepare(`SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.user_id=? AND i.product_id=? AND o.status='delivered'`).get(u.id, p.id);
  const existing = db.prepare('SELECT id FROM reviews WHERE product_id=? AND user_id=?').get(p.id, u.id);
  if (existing) db.prepare('UPDATE reviews SET rating=?,body=?,verified=? WHERE id=?').run(rating, body, bought ? 1 : 0, existing.id);
  else db.prepare('INSERT INTO reviews(product_id,user_id,author,rating,body,verified) VALUES (?,?,?,?,?,?)').run(p.id, u.id, u.name, rating, body, bought ? 1 : 0);
  return { ok: true, verified: bought };
});
route('POST', '/api/newsletter', (ctx) => {
  rateLimit('nl:' + ctx.ip, 10, 600000);
  const e = str(ctx.body.email, { min: 5, max: 200, label: 'Email' }).toLowerCase();
  if (!isEmail(e)) throw bad('Please enter a valid email address.');
  db.prepare('INSERT OR IGNORE INTO subscribers(email) VALUES (?)').run(e);
  return { ok: true };
});

/* ---------- cart / checkout ---------- */
route('POST', '/api/cart/quote', (ctx) => {
  const r = shop.priceCart(ctx.body.items, ctx.body.coupon, ctx.body.district);
  delete r._coupon; return r;
});
route('POST', '/api/orders', async (ctx) => {
  rateLimit('order:' + ctx.ip, 20, 600000);
  const b = ctx.body, c = b.customer || {};
  const customer = {
    name: str(c.name, { min: 2, max: 100, label: 'Full name' }),
    phone: reqPhone(c.phone, 'Mobile number'),
    alt_phone: c.alt_phone ? reqPhone(c.alt_phone, 'Alternative mobile number') : '',
    address: str(c.address, { min: 8, max: 300, label: 'Delivery address' }),
    district: str(c.district, { min: 2, max: 50, label: 'District' }),
    upazila: str(c.upazila, { max: 80, label: 'Thana / Upazila', required: false }),
    post_code: str(c.post_code, { max: 10, label: 'Post code', required: false }),
  };
  if (!Object.prototype.hasOwnProperty.call(DISTRICTS, customer.district)) throw bad('Please choose a valid district.');
  if (customer.post_code && !/^\d{4}$/.test(customer.post_code)) throw bad('Post code must be 4 digits.');
  const method = String(b.payment_method || '');
  const pm = methodStatus();
  if (!pm[method] || !pm[method].enabled) throw bad('This payment method is not available.');
  let paymentStatus = 'unpaid', paymentRef = null;
  if (pm[method].mode === 'manual') {
    paymentRef = str(b.payment_ref, { min: 6, max: 30, label: 'Transaction ID (TrxID)' }).toUpperCase();
    if (!/^[A-Z0-9]{6,30}$/.test(paymentRef)) throw bad('Transaction ID looks invalid.');
    if (db.prepare('SELECT 1 FROM orders WHERE payment_ref=?').get(paymentRef)) throw bad('This Transaction ID has already been used on another order.');
    paymentStatus = 'awaiting_verification';
  }
  const o = shop.createOrder({ userId: ctx.user?.id, customer, items: b.items, couponCode: b.coupon, paymentMethod: method, paymentRef, paymentStatus, note: str(b.note, { max: 300, label: 'Note', required: false }) });
  adminNotify('order', `New order ${o.order_no} — ৳${o.total} (${method.toUpperCase()}) from ${customer.name}, ${customer.district}`, o.order_no);
  let redirect = null;
  if (pm[method].mode === 'gateway') {
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(o.id);
      const base = process.env.PUBLIC_URL || `http://${ctx.req.headers.host}`;
      const init = await providers[method].initiate(order, { callbackUrl: `${base}/api/payments/${method}/callback?order=${order.order_no}` });
      db.prepare('UPDATE orders SET payment_ref=? WHERE id=?').run(init.providerRef || null, o.id);
      redirect = init.redirectUrl;
    } catch (e) {
      console.error('[payment:init]', e.message);
      db.prepare("UPDATE orders SET payment_status='failed' WHERE id=?").run(o.id);
    }
  }
  return { order_no: o.order_no, total: o.total, payment_method: method, payment_status: paymentStatus, redirect_url: redirect };
});
// Gateway return URL. Marks paid ONLY after the provider verifies server-to-server.
route('GET', '/api/payments/:provider/callback', async (ctx) => {
  const prov = providers[ctx.params.provider];
  const order = db.prepare('SELECT * FROM orders WHERE order_no=?').get(String(ctx.query.order || ''));
  if (!prov || !prov.gatewayConfigured() || !order || order.payment_method !== ctx.params.provider) throw new HttpError(400, 'Invalid payment callback.');
  let ok = false;
  if (ctx.query.status === 'success') {
    try { const v = await prov.verify({ paymentID: order.payment_ref }, order); ok = !!v.ok; if (ok) db.prepare("UPDATE orders SET payment_status='paid', payment_ref=? WHERE id=?").run(v.trxId || order.payment_ref, order.id); } catch (e) { console.error('[payment:verify]', e.message); }
  }
  if (!ok) db.prepare("UPDATE orders SET payment_status='failed' WHERE id=? AND payment_status!='paid'").run(order.id);
  return { __redirect: `/order/${order.order_no}?phone=${order.phone}` };
});
function publicOrder(o) {
  return { order_no: o.order_no, status: o.status, payment_method: o.payment_method, payment_status: o.payment_status, name: o.name, phone: o.phone, address: o.address, district: o.district, upazila: o.upazila,
    subtotal: o.subtotal, delivery_charge: o.delivery_charge, discount: o.discount, total: o.total, coupon_code: o.coupon_code, created_at: o.created_at, items: o.items, events: o.events };
}
route('POST', '/api/track', (ctx) => {
  rateLimit('track:' + ctx.ip, 30, 600000);
  const no = str(ctx.body.order_no, { min: 5, max: 40, label: 'Order ID' }).toUpperCase();
  const phone = reqPhone(ctx.body.phone, 'Mobile number');
  const o = shop.orderDetail('order_no=? AND phone=?', no, phone);
  if (!o) throw new HttpError(404, 'No order found with this Order ID and mobile number.');
  return publicOrder(o);
});

/* ---------- auth ---------- */
async function setSession(ctx, userId) { ctx.setCookie(A.cookieHeader(await A.createSession(userId), A.SESSION_DAYS * 86400)); }
route('POST', '/api/auth/register', async (ctx) => {
  rateLimit('reg:' + ctx.ip, 10, 3600000);
  const name = str(ctx.body.name, { min: 2, max: 100, label: 'Name' });
  const phone = reqPhone(ctx.body.phone);
  const email = ctx.body.email ? str(ctx.body.email, { max: 200 }).toLowerCase() : null;
  if (email && !isEmail(email)) throw bad('Please enter a valid email address.');
  A.checkPasswordStrength(ctx.body.password);
  if (db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone) || (email && db.prepare('SELECT 1 FROM users WHERE email=?').get(email))) throw new HttpError(409, 'An account with this mobile number or email already exists.');
  const r = db.prepare('INSERT INTO users(name,phone,email,password_hash) VALUES (?,?,?,?)').run(name, phone, email, await A.hashPassword(ctx.body.password));
  await setSession(ctx, Number(r.lastInsertRowid));
  return { ok: true, user: { id: Number(r.lastInsertRowid), name, phone, email, role: 'customer' } };
});
route('POST', '/api/auth/login', async (ctx) => {
  const id = str(ctx.body.identifier, { min: 3, max: 200, label: 'Mobile or email' }).toLowerCase();
  rateLimit('login:' + ctx.ip, 20, 600000); rateLimit('loginid:' + id, 8, 600000);
  const phone = normPhone(id);
  const u = (phone && db.prepare('SELECT * FROM users WHERE phone=?').get(phone)) || db.prepare('SELECT * FROM users WHERE email=?').get(id);
  const pw = typeof ctx.body.password === 'string' ? ctx.body.password : '';
  // constant-ish time: always run a hash verify
  const ok = await A.verifyPassword(pw, u ? u.password_hash : 'scrypt$00$00');
  if (!u || !ok || !u.active) throw new HttpError(401, 'Incorrect mobile/email or password.');
  await setSession(ctx, u.id);
  return { ok: true, user: { id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role } };
});
route('POST', '/api/auth/logout', async (ctx) => { await A.destroySession(ctx.token); ctx.setCookie(A.cookieHeader('', 0)); return { ok: true }; });
route('POST', '/api/auth/forgot', (ctx) => {
  rateLimit('forgot:' + ctx.ip, 5, 3600000);
  const id = str(ctx.body.identifier, { min: 3, max: 200, label: 'Mobile or email' }).toLowerCase();
  const phone = normPhone(id);
  const u = db.prepare("SELECT * FROM users WHERE (phone=? OR email=?) AND role='customer' AND active=1").get(phone || '-', id);
  const out = { ok: true, message: 'If an account exists, reset instructions have been prepared.' };
  if (u) {
    const token = crypto.randomBytes(24).toString('base64url');
    db.prepare('UPDATE users SET reset_token_hash=?, reset_expires=? WHERE id=?').run(A.sha(token), Date.now() + 30 * 60000, u.id);
    const sent = sendToCustomer(u.phone ? 'sms' : 'email', u.phone || u.email, `Reset your password: /reset?token=${token}`);
    adminNotify('password_reset', `Password reset requested by ${u.name} (${u.phone || u.email}). No SMS/email provider is configured, so the link was not delivered — set a temporary password from Customers.`, String(u.id));
    if (process.env.NODE_ENV !== 'production' && !sent) out.dev_token = token; // dev convenience only; never in production
  }
  return out;
});
route('POST', '/api/auth/reset', async (ctx) => {
  rateLimit('reset:' + ctx.ip, 10, 3600000);
  A.checkPasswordStrength(ctx.body.password);
  const t = String(ctx.body.token || '');
  const u = db.prepare('SELECT id FROM users WHERE reset_token_hash=? AND reset_expires>?').get(A.sha(t), Date.now());
  if (!u) throw bad('This reset link is invalid or has expired.');
  db.prepare('UPDATE users SET password_hash=?, reset_token_hash=NULL, reset_expires=NULL WHERE id=?').run(await A.hashPassword(ctx.body.password), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  return { ok: true };
});

/* ---------- account ---------- */
route('GET', '/api/me', (ctx) => ({ user: ctx.user }));
route('PUT', '/api/me', (ctx) => {
  const u = needUser(ctx);
  const name = str(ctx.body.name, { min: 2, max: 100, label: 'Name' });
  const email = ctx.body.email ? str(ctx.body.email, { max: 200 }).toLowerCase() : null;
  if (email && !isEmail(email)) throw bad('Please enter a valid email address.');
  if (email && db.prepare('SELECT 1 FROM users WHERE email=? AND id!=?').get(email, u.id)) throw new HttpError(409, 'This email is already used by another account.');
  db.prepare('UPDATE users SET name=?, email=? WHERE id=?').run(name, email, u.id);
  return { ok: true, user: { ...u, name, email } };
});
route('POST', '/api/me/password', async (ctx) => {
  const u = needUser(ctx); rateLimit('pw:' + u.id, 8, 600000);
  const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(u.id);
  if (!(await A.verifyPassword(String(ctx.body.current || ''), row.password_hash))) throw new HttpError(400, 'Current password is incorrect.');
  A.checkPasswordStrength(ctx.body.password);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await A.hashPassword(ctx.body.password), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(u.id, A.sha(ctx.token));
  return { ok: true };
});
route('GET', '/api/me/orders', (ctx) => {
  const u = needUser(ctx);
  return db.prepare('SELECT id FROM orders WHERE user_id=? OR phone=? ORDER BY id DESC LIMIT 100').all(u.id, u.phone || '-').map((r) => publicOrder(shop.orderDetail('id=?', r.id)));
});
route('POST', '/api/me/orders/:no/cancel', (ctx) => {
  const u = needUser(ctx);
  const o = db.prepare('SELECT * FROM orders WHERE order_no=? AND (user_id=? OR phone=?)').get(ctx.params.no, u.id, u.phone || '-');
  if (!o) throw new HttpError(404, 'Order not found.');
  if (o.status !== 'pending') throw bad('Only pending orders can be cancelled. Please contact us.');
  shop.setOrderStatus(o.id, 'cancelled', 'Cancelled by customer', u.id);
  adminNotify('order_cancelled', `Order ${o.order_no} was cancelled by the customer.`, o.order_no);
  return { ok: true };
});
const addrFields = (b) => ({
  label: str(b.label, { max: 40, label: 'Label', required: false }), name: str(b.name, { min: 2, max: 100, label: 'Name' }), phone: reqPhone(b.phone),
  address: str(b.address, { min: 8, max: 300, label: 'Address' }), district: (() => { const d = str(b.district, { min: 2, max: 50, label: 'District' }); if (!(d in DISTRICTS)) throw bad('Please choose a valid district.'); return d; })(),
  upazila: str(b.upazila, { max: 80, required: false }), post_code: str(b.post_code, { max: 10, required: false }),
});
route('GET', '/api/me/addresses', (ctx) => db.prepare('SELECT * FROM addresses WHERE user_id=? ORDER BY id DESC').all(needUser(ctx).id));
route('POST', '/api/me/addresses', (ctx) => {
  const u = needUser(ctx); const a = addrFields(ctx.body);
  if (db.prepare('SELECT COUNT(*) n FROM addresses WHERE user_id=?').get(u.id).n >= 10) throw bad('You can save up to 10 addresses.');
  const r = db.prepare('INSERT INTO addresses(user_id,label,name,phone,address,district,upazila,post_code) VALUES (?,?,?,?,?,?,?,?)').run(u.id, a.label, a.name, a.phone, a.address, a.district, a.upazila, a.post_code);
  return { ok: true, id: Number(r.lastInsertRowid) };
});
route('DELETE', '/api/me/addresses/:id', (ctx) => { db.prepare('DELETE FROM addresses WHERE id=? AND user_id=?').run(Number(ctx.params.id), needUser(ctx).id); return { ok: true }; });
route('GET', '/api/me/wishlist', (ctx) => {
  const u = needUser(ctx);
  return db.prepare('SELECT product_id FROM wishlist WHERE user_id=?').all(u.id).map((r) => r.product_id);
});
route('PUT', '/api/me/wishlist/:id', (ctx) => {
  const u = needUser(ctx); const id = Number(ctx.params.id);
  if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(id)) throw new HttpError(404, 'Product not found.');
  db.prepare('INSERT OR IGNORE INTO wishlist(user_id,product_id) VALUES (?,?)').run(u.id, id); return { ok: true };
});
route('DELETE', '/api/me/wishlist/:id', (ctx) => { db.prepare('DELETE FROM wishlist WHERE user_id=? AND product_id=?').run(needUser(ctx).id, Number(ctx.params.id)); return { ok: true }; });
route('POST', '/api/products/by-ids', (ctx) => {
  const ids = (Array.isArray(ctx.body.ids) ? ctx.body.ids : []).map(Number).filter(Number.isInteger).slice(0, 60);
  if (!ids.length) return { items: [] };
  const rows = db.prepare(`SELECT p.*, c.slug AS category_slug, ${shop.RATING_SQL} FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1 AND p.id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  return { items: rows.map(shop.shapeProduct) };
});

module.exports = { routes, route, needUser };
