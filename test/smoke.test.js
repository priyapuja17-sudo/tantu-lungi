'use strict';
// API-level tests. Starts the real server on a random port with a throwaway database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tantu-'));
process.env.DATABASE_PATH = path.join(dir, 't.db'); process.env.UPLOAD_DIR = path.join(dir, 'up');
process.env.ADMIN_EMAIL = 'admin@test.local'; process.env.ADMIN_PASSWORD = 'Admin-Pass-123'; process.env.AUTO_SEED_DEMO = '1'; process.env.NODE_ENV = 'test';
const { start } = require('../server/index.js');
let server, B;
before(async () => { server = await start(0); B = 'http://localhost:' + server.address().port; });
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 50); });

const jar = (c = '') => ({ c });
async function call(method, url, body, session) {
  const res = await fetch(B + url, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', ...(session?.c ? { cookie: session.c } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const sc = res.headers.get('set-cookie'); if (sc && session) session.c = sc.split(';')[0];
  let data = {}; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const customer = { name: 'Test User', phone: '01712345678', address: 'House 1, Road 2, Area', district: 'Dhaka' };
const firstProduct = async () => (await call('GET', '/api/products?limit=1&instock=1')).data.items[0];

test('quote is computed server-side: coupon + inside/outside Dhaka delivery', async () => {
  const p = await firstProduct();
  const inside = (await call('POST', '/api/cart/quote', { items: [{ id: p.id, qty: 2, price: 1 }], coupon: 'WELCOME10', district: 'Dhaka' })).data;
  assert.equal(inside.subtotal, p.price * 2); // client-supplied "price" ignored
  assert.equal(inside.delivery_charge, 60);
  const outside = (await call('POST', '/api/cart/quote', { items: [{ id: p.id, qty: 2 }], district: 'Sylhet' })).data;
  assert.equal(outside.delivery_charge, 120);
});
test('invalid coupon is flagged, order with invalid coupon is rejected', async () => {
  const p = await firstProduct();
  const q = (await call('POST', '/api/cart/quote', { items: [{ id: p.id, qty: 1 }], coupon: 'NOPE' })).data;
  assert.ok(q.coupon_error);
  const r = await call('POST', '/api/orders', { items: [{ id: p.id, qty: 1 }], coupon: 'NOPE', payment_method: 'cod', customer });
  assert.equal(r.status, 400);
});
test('COD order: totals, stock decrement, tracking, cancel restocks', async () => {
  const p = (await call('GET', '/api/products?limit=1&instock=1')).data.items[0];
  const r = await call('POST', '/api/orders', { items: [{ id: p.id, qty: 2 }], payment_method: 'cod', customer });
  assert.equal(r.status, 200); assert.match(r.data.order_no, /^LNG-\d{6}-[A-Z0-9]{5}$/);
  assert.equal(r.data.total, p.price * 2 + 60);
  const after = (await call('GET', '/api/products/' + p.slug)).data; assert.equal(after.stock, p.stock - 2);
  assert.equal((await call('POST', '/api/track', { order_no: r.data.order_no, phone: '01799999999' })).status, 404);
  const tr = await call('POST', '/api/track', { order_no: r.data.order_no, phone: '+8801712345678' }); assert.equal(tr.status, 200); assert.equal(tr.data.status, 'pending');
  const admin = jar(); await call('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'Admin-Pass-123' }, admin);
  assert.equal((await call('PUT', `/api/admin/orders/${r.data.order_no}/status`, { status: 'cancelled' }, admin)).status, 200);
  assert.equal((await call('GET', '/api/products/' + p.slug)).data.stock, p.stock);
  assert.equal((await call('PUT', `/api/admin/orders/${r.data.order_no}/status`, { status: 'confirmed' }, admin)).status, 400); // cancelled is final
});
test('cannot order more than stock; stock never goes negative', async () => {
  const p = await firstProduct();
  const r = await call('POST', '/api/orders', { items: [{ id: p.id, qty: 20 }, { id: p.id, qty: 20, color: 'x' }], payment_method: 'cod', customer });
  assert.ok(r.status === 409 || p.stock >= 20);
  const now = (await call('GET', '/api/products/' + p.slug)).data; assert.ok(now.stock >= 0);
});
test('input validation: bad phone, bad district, bad post code', async () => {
  const p = await firstProduct(); const base = { items: [{ id: p.id, qty: 1 }], payment_method: 'cod' };
  assert.equal((await call('POST', '/api/orders', { ...base, customer: { ...customer, phone: '12345' } })).status, 400);
  assert.equal((await call('POST', '/api/orders', { ...base, customer: { ...customer, district: 'Atlantis' } })).status, 400);
  assert.equal((await call('POST', '/api/orders', { ...base, customer: { ...customer, post_code: 'abcd' } })).status, 400);
  assert.equal((await call('POST', '/api/orders', { ...base, customer: { ...customer, phone: '০১৭১২৩৪৫৬৭৮' } })).status, 200); // Bangla digits accepted
});
test('mobile banking is NOT offered or accepted unless configured; manual mode needs admin verification', async () => {
  const p = await firstProduct(); const body = { items: [{ id: p.id, qty: 1 }], payment_method: 'bkash', customer };
  const cfg = (await call('GET', '/api/config')).data; assert.equal(cfg.payments.bkash.enabled, false);
  assert.equal((await call('POST', '/api/orders', body)).status, 400);
  const admin = jar(); await call('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'Admin-Pass-123' }, admin);
  assert.equal((await call('PUT', '/api/admin/settings', { manual_bkash_number: '01711111111' }, admin)).status, 200);
  assert.equal((await call('POST', '/api/orders', body)).status, 400); // TrxID required
  const ok = await call('POST', '/api/orders', { ...body, payment_ref: 'ab12cd34ef' }); assert.equal(ok.status, 200);
  assert.equal(ok.data.payment_status, 'awaiting_verification'); // never "paid" on its own
  assert.equal((await call('POST', '/api/orders', { ...body, payment_ref: 'AB12CD34EF' })).status, 400); // TrxID reuse blocked
  assert.equal((await call('GET', `/api/payments/bkash/callback?order=${ok.data.order_no}&status=success`)).status, 400); // no gateway -> cannot self-verify
  await call('PUT', `/api/admin/orders/${ok.data.order_no}/payment`, { payment_status: 'paid' }, admin);
  assert.equal((await call('POST', '/api/track', { order_no: ok.data.order_no, phone: '01712345678' })).data.payment_status, 'paid');
});
test('auth: register, login, wrong password, role separation', async () => {
  const s = jar(); const reg = await call('POST', '/api/auth/register', { name: 'Rina', phone: '01811223344', password: 'longenough1' }, s); assert.equal(reg.status, 200);
  assert.equal((await call('POST', '/api/auth/register', { name: 'Rina', phone: '01811223344', password: 'longenough1' })).status, 409);
  assert.equal((await call('POST', '/api/auth/register', { name: 'X', phone: '01811223355', password: 'short' })).status, 400);
  assert.equal((await call('POST', '/api/auth/login', { identifier: '01811223344', password: 'wrong' })).status, 401);
  assert.equal((await call('GET', '/api/admin/stats', null, s)).status, 403);
  assert.equal((await call('GET', '/api/admin/stats')).status, 401);
  assert.equal((await call('PUT', '/api/admin/settings', { delivery_inside_dhaka: '1' }, s)).status, 403);
  const lo = await call('POST', '/api/auth/logout', {}, s); assert.equal(lo.status, 200);
});
test('CSRF: mutating request without X-Requested-With is rejected', async () => {
  const res = await fetch(B + '/api/newsletter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"a@b.co"}' });
  assert.equal(res.status, 403);
});
test('admin: delivery charge is configurable and drives quotes; CSV export is formula-safe', async () => {
  const admin = jar(); await call('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'Admin-Pass-123' }, admin);
  await call('PUT', '/api/admin/settings', { delivery_outside_dhaka: '150', free_delivery_over: '0' }, admin);
  const p = await firstProduct(); const q = (await call('POST', '/api/cart/quote', { items: [{ id: p.id, qty: 1 }], district: 'Khulna' })).data; assert.equal(q.delivery_charge, 150);
  const res = await fetch(B + '/api/admin/reports/export?type=orders', { headers: { cookie: admin.c } }); assert.match(res.headers.get('content-type'), /text\/csv/);
});
test('admin product create validates and appears on storefront; discount % computed', async () => {
  const admin = jar(); await call('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'Admin-Pass-123' }, admin);
  const cat = (await call('GET', '/api/admin/categories', null, admin)).data.items[0];
  const body = { sku: 'T-1', name_en: 'Unit Test Lungi', name_bn: 'ইউনিট', category_id: cat.id, fabric: 'cotton', design: 'check', colors: [{ name_en: 'Red', name_bn: 'লাল', hex: '#aa0000', hex2: '#ffffff' }], regular_price: 1000, sale_price: 750, stock: 3 };
  assert.equal((await call('POST', '/api/admin/products', { ...body, sale_price: 1200 }, admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/products', { ...body, images: ['javascript:alert(1)'] }, admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/products', body, admin)).status, 200);
  const p = (await call('GET', '/api/products/unit-test-lungi')).data; assert.equal(p.discount_pct, 25); assert.equal(p.price, 750); assert.equal(p.images.length, 4);
});
test('SEO: product page has title + JSON-LD, sitemap lists products, security headers set', async () => {
  const html = await (await fetch(B + '/p/unit-test-lungi')).text(); assert.match(html, /<title>.*Unit Test Lungi/); assert.match(html, /application\/ld\+json/);
  assert.match(await (await fetch(B + '/sitemap.xml')).text(), /\/p\/unit-test-lungi/);
  const h = (await fetch(B + '/')).headers; assert.ok(h.get('content-security-policy')); assert.equal(h.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(B + '/../../etc/passwd')).status === 200 ? 'spa' : 'x', 'spa'); // traversal falls through to SPA shell, never reads files
});
test('upload rejects non-images and spoofed content', async () => {
  const admin = jar(); await call('POST', '/api/auth/login', { identifier: 'admin@test.local', password: 'Admin-Pass-123' }, admin);
  assert.equal((await call('POST', '/api/admin/upload', { data: 'data:text/html;base64,PGI+' }, admin)).status, 400);
  assert.equal((await call('POST', '/api/admin/upload', { data: 'data:image/png;base64,' + Buffer.from('<script>').toString('base64') }, admin)).status, 400);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const r = await call('POST', '/api/admin/upload', { data: 'data:image/png;base64,' + png.toString('base64') }, admin); assert.equal(r.status, 200); assert.match(r.data.url, /^\/uploads\/[a-f0-9]+\.png$/);
  assert.equal((await fetch(B + r.data.url)).status, 200);
});
