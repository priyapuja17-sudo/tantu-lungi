# Tantu Lungi (তন্তু লুঙ্গি) — premium lungi store for Bangladesh

Full-stack store: Bangla-first storefront, cart, checkout, customer accounts, order tracking and an admin panel.
**Zero npm dependencies** — Node 22.5+ and its built-in SQLite only.

## Run it

```bash
cd shobuj
npm run dev            # seeds 24 demo products + a dev admin, then starts on http://localhost:3000
```
- Storefront: `http://localhost:3000` · Admin: `http://localhost:3000/admin`
- First start creates an admin. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` first; if you don't (development only), `admin@lungi.test` is created with a **random password printed once in the terminal**.
- Tests: `npm test` (12 API tests, run against a throwaway database).
- Before launch: `npm run clear-demo` removes demo orders and demo reviews. Delete or edit demo products in Admin → Products.
  Also replace the placeholder phone/WhatsApp/email/address in Admin → Settings.

## What is built
| Area | Status |
|---|---|
| Storefront: home, 8 category pages, shop with filters (fabric, design, colour, price, in-stock), sort, pagination, search with suggestions | Working, tested in a browser |
| Product page: gallery, colour/design/fabric/size, discount %, stock state, quantity, Add to cart, Buy now, wishlist, reviews, related | Working |
| Cart (persisted in the browser), coupons, delivery charge, final total — **all priced by the server** | Working |
| Checkout: guest or logged-in, BD phone validation (+880 / Bangla digits), 64 districts, upazila select, COD | Working |
| Order ID (`LNG-YYMMDD-XXXXX`), confirmation page, tracking by Order ID + phone with timeline, customer cancel while pending | Working |
| Accounts: register, login/logout, profile, saved addresses, order history, wishlist, change password, forgot/reset | Working (see email/SMS note) |
| Admin: dashboard stats + 14-day chart + low-stock alerts, products (add/edit/delete/stock/images/prices/discounts/featured), categories, orders (search, status, confirm/cancel, invoice print, CSV), customers, coupons, banners, hero text, reports (daily/monthly, best sellers, CSV), reviews, settings, staff roles | Working |
| Roles: staff < manager < admin, enforced on the server per endpoint | Working, tested |
| Bangla (default) / English switch on the storefront | Working. Admin panel is English only |
| SEO: product URLs `/p/slug`, per-product title/meta/JSON-LD, sitemap.xml, robots.txt | Working |

## Payments — read this
- **Cash on Delivery: working.**
- **bKash / Nagad / Rocket are hidden at checkout until configured.** Nothing is ever marked paid on the customer's say-so.
  - *Manual mode* (works now): enter your merchant number in Admin → Settings. The customer sends money and enters the TrxID; the order is `awaiting_verification` until staff checks the TrxID in the merchant app and clicks **Mark paid**. Reused TrxIDs are rejected.
  - *Gateway mode, bKash*: set the `BKASH_*` variables (see `.env.example`). The code in `server/payments.js` follows bKash tokenized checkout and only marks paid after a server-to-server execute call matching amount and invoice. **It has not been tested against bKash — it was written from public docs. Test in their sandbox before enabling.**
  - *Nagad / Rocket gateway*: **not implemented** (needs a merchant agreement and provider-issued specs). Use manual mode.
- Stock is reserved when an order is placed and restored on cancellation.

## Email / SMS / delivery services — not connected
No email or SMS provider is configured, so **no customer message is sent** (order confirmation, password reset). Instead:
- Admin gets in-app notifications (🔔) for new orders, cancellations and reset requests.
- Forgot-password creates a reset token but cannot deliver it; the admin sees a notification and can set a temporary password from Customers. (In non-production only, the token link is shown on screen for development.)
- To add delivery, implement `sendToCustomer()` in `server/notify.js` (SMTP, or a Bangladeshi SMS gateway).
- No courier integration (Pathao/Steadfast/RedX etc.); status updates are manual.

## Deviations from the requested stack (and why)
Package installs were blocked in the build environment, so Next.js, TypeScript, Tailwind, Express and Postgres/Supabase could not be installed or tested. I did not ship untested code for them. Instead:
- Backend: plain Node `http` + `node:sqlite` (not Express/Postgres). `db/schema.postgres.sql` is a ready PostgreSQL schema; porting the SQL calls in `server/*.js` is the remaining migration work (notes at top of that file).
- Frontend: vanilla ES-module SPA with a hand-written CSS design system (not React/TypeScript/Tailwind). The server renders per-product `<title>`, meta and JSON-LD; page content is client-rendered.
- Images: stored on local disk (`UPLOAD_DIR`), not Cloudinary/Supabase Storage. Swap the single `fs.writeFileSync` in the upload route in `server/admin.js` for a server-side upload call.

## Product images — important
There is no network access to stock photography here, so the demo catalogue uses **procedurally generated SVG fabric illustrations** (check, stripe, traditional border, plain; silk sheen) built from each product's colour and design (`server/art.js`) — not photographs. The hero is also an illustration. Upload real product photos in Admin → Products → Edit → Upload images; they replace the generated art. Real photography will matter a lot for sales.

## Data quality notes
- Demo reviews and demo orders are fictional seed data (marked "seed/demo" in Admin → Reviews). Remove with `npm run clear-demo` before launch.
- District list is all 64 districts. Upazila/thana dropdowns are provided for ~38 major districts; the rest fall back to a free-text field. Extend `server/geo.js` to complete the list. "Inside Dhaka" delivery pricing = the Dhaka district.
- Search is a simple `LIKE` match (fine for hundreds of products).

## Security measures in place
scrypt password hashing; HttpOnly + SameSite=Lax session cookies (Secure in production), sessions stored hashed; CSRF defence (required custom header + Origin check); server-side role checks on every admin route; server-computed prices, stock and coupons (client prices ignored); parameterized SQL everywhere; output escaping in all templates; strict CSP and other security headers; login/order/track/reset rate limits (in-memory — per process); upload magic-byte checks; CSV formula-injection guard; production refuses to start without admin credentials.
Not done: 2FA, CAPTCHA, account lockout beyond rate limits, a security audit. Run behind HTTPS.

## Deploy (single VPS or a PaaS with a persistent disk)
1. Node ≥ 22.5. Copy the project, set env (see `.env.example`; `NODE_ENV=production`, `PUBLIC_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TRUST_PROXY=1` behind a proxy).
2. Put `DATABASE_PATH` and `UPLOAD_DIR` on persistent storage and back them up (`sqlite3 shop.db ".backup b.db"`).
3. Run `npm start` under systemd or pm2; terminate TLS with Nginx/Caddy and proxy to `PORT`.
4. Not suitable for serverless/ephemeral hosts as-is (local SQLite file + local uploads). Single process only (rate limiter is in memory).
5. The storefront loads fonts from Google Fonts; without access it falls back to system fonts (Bangla still renders with the OS font).

## Layout
```
server/  index.js (http, security, SEO) · api.js (public+customer) · admin.js · shop.js (pricing/orders) · payments.js · auth.js · art.js · geo.js · seed.js · db.js
public/  index.html · app.js (storefront) · admin.js (admin SPA) · lib.js · i18n.js · app.css
db/      schema.sql (SQLite, used) · schema.postgres.sql
test/    smoke.test.js
```
