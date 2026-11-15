'use strict';
const crypto = require('node:crypto');
const { db, tx, getSettings } = require('./db');
const { bad, HttpError } = require('./util');
const { isInsideDhaka } = require('./geo');

const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

const RATING_SQL = `(SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.product_id=p.id AND r.approved=1) AS rating,
  (SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id AND r.approved=1) AS review_count`;

function shapeProduct(r) {
  if (!r) return null;
  let colors = [];
  try { colors = JSON.parse(r.colors || '[]'); } catch {}
  const price = r.sale_price != null && r.sale_price < r.regular_price ? r.sale_price : r.regular_price;
  const pct = price < r.regular_price ? Math.round((1 - price / r.regular_price) * 100) : 0;
  const img = db.prepare('SELECT url FROM product_images WHERE product_id=? ORDER BY sort,id').all(r.id).map((i) => i.url);
  return {
    id: r.id, sku: r.sku, slug: r.slug, category_id: r.category_id, category_slug: r.category_slug, fabric: r.fabric, design: r.design,
    name_en: r.name_en, name_bn: r.name_bn, desc_en: r.desc_en, desc_bn: r.desc_bn,
    length_cm: r.length_cm, width_cm: r.width_cm, colors,
    regular_price: r.regular_price, sale_price: pct ? price : null, price, discount_pct: pct,
    stock: r.stock, in_stock: r.stock > 0, low_stock: r.stock > 0 && r.stock <= r.low_stock_threshold,
    featured: !!r.featured, is_new: !!r.is_new, sold: r.sold,
    rating: r.rating || 0, review_count: r.review_count || 0, images: img,
  };
}

const SORTS = {
  newest: 'p.created_at DESC, p.id DESC', popular: 'p.sold DESC, p.id DESC',
  price_asc: 'COALESCE(p.sale_price,p.regular_price) ASC', price_desc: 'COALESCE(p.sale_price,p.regular_price) DESC',
};
function listProducts(q = {}) {
  const where = ['p.active=1'], args = [];
  if (q.cat) {
    where.push('(c.slug=? OR p.id IN (SELECT pc.product_id FROM product_collections pc JOIN categories cc ON cc.id=pc.category_id WHERE cc.slug=?))');
    args.push(q.cat, q.cat);
  }
  if (q.q) { const like = `%${String(q.q).replace(/[%_]/g, '')}%`; where.push('(p.name_en LIKE ? OR p.name_bn LIKE ? OR p.sku LIKE ? OR p.fabric LIKE ?)'); args.push(like, like, like, like); }
  if (q.fabric) { const f = String(q.fabric).split(',').filter(Boolean); where.push(`p.fabric IN (${f.map(() => '?').join(',')})`); args.push(...f); }
  if (q.design) { where.push('p.design=?'); args.push(q.design); }
  if (q.color) { where.push('p.colors LIKE ?'); args.push(`%"name_en":"${String(q.color).replace(/["%_\\]/g, '')}"%`); }
  if (q.min) { where.push('COALESCE(p.sale_price,p.regular_price)>=?'); args.push(Number(q.min) || 0); }
  if (q.max) { where.push('COALESCE(p.sale_price,p.regular_price)<=?'); args.push(Number(q.max) || 1e9); }
  if (q.featured) where.push('p.featured=1');
  if (q.isnew) where.push('p.is_new=1');
  if (q.sale) where.push('p.sale_price IS NOT NULL AND p.sale_price<p.regular_price');
  if (q.instock) where.push('p.stock>0');
  const order = SORTS[q.sort] || SORTS.newest;
  const limit = Math.min(Math.max(parseInt(q.limit) || 12, 1), 48);
  const page = Math.max(parseInt(q.page) || 1, 1);
  const base = `FROM products p JOIN categories c ON c.id=p.category_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) n ${base}`).get(...args).n;
  const rows = db.prepare(`SELECT p.*, c.slug AS category_slug, ${RATING_SQL} ${base} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  return { total, page, pages: Math.ceil(total / limit), items: rows.map(shapeProduct) };
}
function getProductBySlug(slug) {
  const r = db.prepare(`SELECT p.*, c.slug AS category_slug, ${RATING_SQL} FROM products p JOIN categories c ON c.id=p.category_id WHERE p.slug=? AND p.active=1`).get(slug);
  return shapeProduct(r);
}

/* ---------- pricing (the ONLY source of truth for order totals) ---------- */
function findCoupon(code, subtotal) {
  if (!code) return { coupon: null, discount: 0 };
  const c = db.prepare('SELECT * FROM coupons WHERE code=? COLLATE NOCASE AND active=1').get(String(code).trim());
  if (!c) throw bad('This coupon code is not valid.');
  if (c.expires_at && new Date(c.expires_at + 'T23:59:59+06:00') < new Date()) throw bad('This coupon has expired.');
  if (c.usage_limit != null && c.used >= c.usage_limit) throw bad('This coupon has reached its usage limit.');
  if (subtotal < c.min_subtotal) throw bad(`Minimum order of ৳${c.min_subtotal} required for this coupon.`);
  let d = c.type === 'percent' ? Math.floor((subtotal * c.value) / 100) : c.value;
  if (c.max_discount != null) d = Math.min(d, c.max_discount);
  d = Math.max(0, Math.min(d, subtotal));
  return { coupon: c, discount: d };
}
function deliveryCharge(district, subtotalAfterDiscount) {
  const s = getSettings();
  const freeOver = parseInt(s.free_delivery_over) || 0;
  if (freeOver > 0 && subtotalAfterDiscount >= freeOver) return 0;
  const inside = parseInt(s.delivery_inside_dhaka) || 0, outside = parseInt(s.delivery_outside_dhaka) || 0;
  return !district || isInsideDhaka(district) ? inside : outside;
}
function priceCart(rawItems, couponCode, district, { strict = false } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw bad('Your cart is empty.');
  if (rawItems.length > 30) throw bad('Too many items in cart.');
  const merged = new Map();
  for (const it of rawItems) {
    const id = Number(it?.id), qty = Number(it?.qty);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1) continue;
    const color = String(it.color || '').slice(0, 60);
    const key = id + '|' + color;
    merged.set(key, { id, color, qty: Math.min((merged.get(key)?.qty || 0) + qty, 20) });
  }
  const lines = []; const problems = [];
  let subtotal = 0;
  for (const it of merged.values()) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.id);
    if (!p) { problems.push({ id: it.id, color: it.color, reason: 'unavailable' }); continue; }
    const colors = JSON.parse(p.colors || '[]');
    const col = colors.find((c) => c.name_en === it.color) || colors[0];
    const unit = p.sale_price != null && p.sale_price < p.regular_price ? p.sale_price : p.regular_price;
    if (p.stock < it.qty) { problems.push({ id: p.id, color: it.color, reason: p.stock === 0 ? 'out_of_stock' : 'low_stock', available: p.stock }); if (strict) continue; }
    const qty = strict ? it.qty : Math.min(it.qty, Math.max(p.stock, 0)) || it.qty;
    const line = { id: p.id, slug: p.slug, sku: p.sku, name_en: p.name_en, name_bn: p.name_bn, color: col?.name_en || '', color_bn: col?.name_bn || '', hex: col?.hex, hex2: col?.hex2,
      unit_price: unit, regular_price: p.regular_price, qty, line_total: unit * qty, stock: p.stock, image: db.prepare('SELECT url FROM product_images WHERE product_id=? ORDER BY sort,id LIMIT 1').get(p.id)?.url };
    lines.push(line); subtotal += line.line_total;
  }
  if (strict && problems.length) throw new HttpError(409, 'Some items are no longer available in the requested quantity. Please review your cart.', { problems });
  if (!lines.length) throw new HttpError(409, 'None of the items in your cart are available.', { problems });
  let coupon = null, discount = 0, couponError = null;
  try { ({ coupon, discount } = findCoupon(couponCode, subtotal)); } catch (e) { if (strict) throw e; couponError = e.message; }
  const delivery = deliveryCharge(district, subtotal - discount);
  return { lines, problems, subtotal, discount, coupon_code: coupon?.code || null, coupon_error: couponError, delivery_charge: delivery, delivery_estimated: !district,
    total: subtotal - discount + delivery, _coupon: coupon };
}

/* ---------- orders ---------- */
const ORDER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function newOrderNo() {
  const d = new Date(Date.now() + 6 * 36e5);
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, '');
  for (let i = 0; i < 10; i++) {
    let s = ''; const b = crypto.randomBytes(5);
    for (const x of b) s += ORDER_ALPHABET[x % ORDER_ALPHABET.length];
    const no = `LNG-${ymd}-${s}`;
    if (!db.prepare('SELECT 1 FROM orders WHERE order_no=?').get(no)) return no;
  }
  throw new Error('Could not allocate order number');
}
function createOrder({ userId, customer, items, couponCode, paymentMethod, paymentRef, paymentStatus, note }) {
  return tx(() => {
    const priced = priceCart(items, couponCode, customer.district, { strict: true });
    const orderNo = newOrderNo();
    const info = db.prepare(`INSERT INTO orders(order_no,user_id,name,phone,alt_phone,address,district,upazila,post_code,subtotal,delivery_charge,discount,total,coupon_code,payment_method,payment_status,payment_ref,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(orderNo, userId || null, customer.name, customer.phone, customer.alt_phone || null, customer.address, customer.district, customer.upazila || null, customer.post_code || null,
      priced.subtotal, priced.delivery_charge, priced.discount, priced.total, priced.coupon_code, paymentMethod, paymentStatus, paymentRef || null, note || null);
    const oid = Number(info.lastInsertRowid);
    for (const l of priced.lines) {
      const u = db.prepare('UPDATE products SET stock=stock-?, sold=sold+? WHERE id=? AND stock>=?').run(l.qty, l.qty, l.id, l.qty);
      if (u.changes !== 1) throw new HttpError(409, `${l.name_en} just went out of stock.`);
      db.prepare('INSERT INTO order_items(order_id,product_id,sku,name,color,unit_price,qty) VALUES (?,?,?,?,?,?,?)').run(oid, l.id, l.sku, l.name_en, l.color, l.unit_price, l.qty);
    }
    if (priced._coupon) {
      const u = db.prepare('UPDATE coupons SET used=used+1 WHERE id=? AND (usage_limit IS NULL OR used<usage_limit)').run(priced._coupon.id);
      if (u.changes !== 1) throw bad('This coupon has reached its usage limit.');
    }
    db.prepare('INSERT INTO order_events(order_id,status,note) VALUES (?,?,?)').run(oid, 'pending', 'Order placed');
    return { id: oid, order_no: orderNo, total: priced.total };
  });
}
function orderDetail(where, ...args) {
  const o = db.prepare(`SELECT * FROM orders WHERE ${where}`).get(...args);
  if (!o) return null;
  o.items = db.prepare('SELECT sku,name,color,unit_price,qty,product_id FROM order_items WHERE order_id=?').all(o.id);
  o.events = db.prepare('SELECT status,note,created_at FROM order_events WHERE order_id=? ORDER BY id').all(o.id);
  return o;
}
function setOrderStatus(orderId, status, note, byUser) {
  if (!STATUSES.includes(status)) throw bad('Invalid status.');
  return tx(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if (!o) throw new HttpError(404, 'Order not found.');
    if (o.status === status) return o;
    if (o.status === 'cancelled') throw bad('A cancelled order cannot be changed.');
    if (o.status === 'delivered' && status !== 'delivered') throw bad('A delivered order cannot be changed.');
    if (status === 'cancelled') {
      for (const it of db.prepare('SELECT product_id,qty FROM order_items WHERE order_id=?').all(orderId))
        if (it.product_id) db.prepare('UPDATE products SET stock=stock+?, sold=MAX(sold-?,0) WHERE id=?').run(it.qty, it.qty, it.product_id);
      if (o.coupon_code) db.prepare('UPDATE coupons SET used=MAX(used-1,0) WHERE code=?').run(o.coupon_code);
    }
    db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, orderId);
    if (status === 'delivered' && o.payment_method === 'cod') db.prepare("UPDATE orders SET payment_status='paid' WHERE id=?").run(orderId);
    db.prepare('INSERT INTO order_events(order_id,status,note,by_user) VALUES (?,?,?,?)').run(orderId, status, note || null, byUser || null);
    return db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  });
}
module.exports = { STATUSES, listProducts, getProductBySlug, shapeProduct, RATING_SQL, priceCart, createOrder, orderDetail, setOrderStatus, deliveryCharge };
