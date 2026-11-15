'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { db, getSettings } = require('./db');
const { HttpError } = require('./util');
const A = require('./auth');
const { routes } = require('./api');
require('./admin');
const seed = require('./seed');
const { productSVG, heroSVG } = require('./art');
const shop = require('./shop');

const PUBLIC = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const PORT = parseInt(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SEC = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  ...(PROD ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(j && typeof j === 'object' ? j : {}); } catch { reject(new HttpError(400, 'Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SEC, ...headers });
  res.end(body);
}
const sendJSON = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

let indexHtml = '';
const loadIndex = () => { indexHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'); };
function renderIndex(pathname, origin) {
  if (!indexHtml || !PROD) loadIndex();
  const s = getSettings();
  let title = `${s.store_name_bn} | ${s.store_name_en} — Premium Lungi, Bangladesh`;
  let desc = 'প্রিমিয়াম কোয়ালিটির লুঙ্গি — কটন, হাফ সিল্ক ও পিওর সিল্ক। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি। Premium lungis delivered across Bangladesh.';
  let image = `${origin}/img/hero.svg`, extra = '';
  const m = /^\/p\/([^/]+)$/.exec(pathname);
  if (m) {
    const p = shop.getProductBySlug(decodeURIComponent(m[1]));
    if (p) {
      title = `${p.name_bn} | ${p.name_en} — ${s.store_name_en}`;
      desc = `${p.name_en} — ৳${p.price}. ${p.desc_en || ''}`.slice(0, 180);
      image = origin + (p.images[0] || '');
      const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name_en, sku: p.sku, image: p.images.map((i) => origin + i), description: p.desc_en,
        offers: { '@type': 'Offer', priceCurrency: 'BDT', price: p.price, availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: `${origin}/p/${p.slug}` } };
      if (p.review_count) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.review_count };
      extra = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
    }
  }
  const meta = `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(image)}"><link rel="canonical" href="${esc(origin + pathname)}">${extra}`;
  return indexHtml.replace('<!--SEO-->', meta);
}

function staticFile(res, base, rel, cacheSeconds) {
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return false;
  let st; try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  if (!MIME[ext]) return false;
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[ext], 'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-cache' });
  return true;
}

async function handle(req, res) {
  const origin = process.env.PUBLIC_URL || `http://${req.headers.host}`;
  const url = new URL(req.url, origin);
  const pathname = decodeURIComponent(url.pathname);
  const ip = (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';

  if (pathname.startsWith('/api/')) {
    const cookies = A.parseCookies(req.headers.cookie);
    const token = cookies.sid || '';
    const ctx = { req, res, url, ip, token, user: A.userFromToken(token), query: Object.fromEntries(url.searchParams), params: {}, body: {}, _cookies: [], setCookie(c) { this._cookies.push(c); } };
    try {
      const method = req.method;
      const r = routes.find((x) => x.method === method && x.re.test(pathname));
      if (!r) throw new HttpError(404, 'Not found.');
      if (method !== 'GET') { // CSRF defence: custom header (cannot be sent cross-site without CORS preflight) + same-origin check
        if (req.headers['x-requested-with'] !== 'fetch') throw new HttpError(403, 'Bad request origin.');
        const o = req.headers.origin; if (o && new URL(o).host !== req.headers.host) throw new HttpError(403, 'Bad request origin.');
        ctx.body = await readBody(req, pathname === '/api/admin/upload' ? 5e6 : 2e5);
      }
      const m = r.re.exec(pathname); r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); });
      const out = await r.handler(ctx);
      const extra = ctx._cookies.length ? { 'Set-Cookie': ctx._cookies } : {};
      if (out && out.__redirect) return send(res, 302, '', { Location: out.__redirect, ...extra });
      if (out && out.__raw !== undefined) return send(res, 200, out.__raw, { 'Content-Type': out.type, 'Content-Disposition': `attachment; filename="${out.filename}"`, 'Cache-Control': 'no-store', ...extra });
      return sendJSON(res, 200, out ?? { ok: true }, extra);
    } catch (e) {
      if (e instanceof HttpError) return sendJSON(res, e.status, { error: e.message, ...(e.extra || {}) });
      console.error('[error]', req.method, pathname, e);
      return sendJSON(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');

  let m;
  if (pathname === '/img/hero.svg') return send(res, 200, heroSVG(), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
  if ((m = /^\/img\/p\/(\d+)\/([0-3])\.svg$/.exec(pathname))) {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(Number(m[1]));
    if (!p) return send(res, 404, 'Not found');
    p.colors = JSON.parse(p.colors || '[]');
    const colorIdx = Math.min(parseInt(url.searchParams.get('c')) || 0, Math.max(p.colors.length - 1, 0));
    if (colorIdx) p.colors = [p.colors[colorIdx]];
    return send(res, 200, productSVG(p, Number(m[2])), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
  }
  if (pathname.startsWith('/uploads/')) {
    return staticFile(res, path.resolve(UPLOAD_DIR), pathname.slice(9), 86400) || send(res, 404, 'Not found');
  }
  if (pathname === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, { 'Content-Type': 'text/plain' });
  if (pathname === '/sitemap.xml') {
    const urls = ['/', '/shop', ...db.prepare('SELECT slug FROM categories').all().map((c) => '/c/' + c.slug), ...db.prepare('SELECT slug FROM products WHERE active=1').all().map((p) => '/p/' + p.slug)];
    return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${esc(origin + u)}</loc></url>`).join('')}</urlset>`, { 'Content-Type': 'application/xml' });
  }
  if (pathname !== '/' && staticFile(res, PUBLIC, pathname.slice(1), PROD ? 3600 : 0)) return;
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return send(res, 404, 'Not found');
  return send(res, 200, renderIndex(pathname, origin), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
}

function start(port = PORT) {
  seed.ensureCategories();
  seed.ensureAdmin();
  if (process.env.AUTO_SEED_DEMO === '1') seed.seedDemo();
  const server = http.createServer((req, res) => handle(req, res).catch((e) => { console.error(e); try { send(res, 500, 'Server error'); } catch {} }));
  return new Promise((resolve) => server.listen(port, () => { console.log(`Lungi store running on http://localhost:${server.address().port}`); resolve(server); }));
}
if (require.main === module) start();
module.exports = { start };
