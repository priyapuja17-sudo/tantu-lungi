# Migration plan: SQLite → Supabase PostgreSQL (+ Supabase Storage)

Status legend: ✅ done & tested · 🟡 written, not yet tested against real Supabase · ⬜ not started
**Rule: nothing below is called "PostgreSQL compatible" until the full test suite passes against a real Supabase staging project (Stage 6).**

## 0. Safety rules (from the owner)
1. SQLite stays working and stays the default (`DB_DRIVER` unset = SQLite). Existing tests must pass at every stage.
2. Work on branch `feat/postgres-migration`; small commits per stage; `main` is untouched until Stage 7.
3. Staging Supabase project first; never test against production. Tests run in an isolated schema and never touch other data.
4. Online payment gateways stay disabled (hidden) — unchanged by this work.
5. No business details are invented; contact, social, policy and delivery charges stay in Admin Settings.
6. No demo-data deletion without listing the exact rows first. (Current `data/shop.db` is empty; backup exists.)

## 1. Architecture
```
routes (api.js / admin.js / shop.js)  ──►  server/dbx.js  (async API: get / all / run / insert / tx)
                                              ├─ driver: sqlite  (node:sqlite, existing, default)
                                              └─ driver: postgres (`pg`, lazy-required only when DB_DRIVER=postgres)
uploads (admin.js) ──► server/storage.js ── local disk (default) | Supabase Storage (REST, server-side key)
```
* `pg` is added as a normal dependency only in Stage 2 and is **required lazily**, so the SQLite path and the test suite keep running with zero installs.
* One SQL dialect for app code wherever possible (so SQLite tests exercise the same queries); only a handful of dialect helpers differ (dates).

## 2. Stages (each = reviewable commit(s), tests green before the next)
| # | Stage | Exit criteria |
|---|---|---|
| 0 | This plan | Owner reviews |
| 1 | `dbx.js` async API + SQLite driver incl. **transaction serialisation**; convert `auth.js` (sessions) | 12 existing tests + new dbx tests green on SQLite |
| 2 | Convert `shop.js` (pricing, orders, stock) to `dbx`; sort stock updates by product id (deadlock safety) | tests green on SQLite |
| 3 | Convert `api.js` (public/customer) | tests green |
| 4 | Convert `admin.js`, `seed.js`, `backup`; remove sync `db` export | tests green; grep shows no `db.prepare` outside the SQLite driver |
| 5 | Postgres driver + `schema.postgres.sql` rewrite + dialect helpers + `storage.js` (Supabase) | 🟡 unit-level checks only; **untested on Supabase** |
| 6 | Staging run on a real Supabase project: full suite + concurrency + upload tests + manual checklist (§8) | all green on staging → only now may docs say "tested on Supabase" |
| 7 | Render staging deploy → checklist → then production, merge to `main` | owner approval |

## 3. SQL differences and how each is handled (from an audit of the 170 call sites)
| Topic | SQLite (today) | PostgreSQL | Resolution |
|---|---|---|---|
| Placeholders | `?` | `$1,$2…` | driver converts `?`→`$n` |
| Insert id | `lastInsertRowid` (8 uses) | none | use `INSERT … RETURNING id` (works in both) → `dbx.insert()` |
| Insert-or-ignore | `INSERT OR IGNORE` (4) | not valid | `INSERT … ON CONFLICT DO NOTHING` (both) |
| Case-insensitive match | `COLLATE NOCASE` (coupon), `LIKE` is case-insensitive for ASCII (15 uses) | `LIKE` case-sensitive | coupon: `lower(code)=lower(?)`; search: driver maps `LIKE`→`ILIKE` |
| Null-safe compare | `id IS NOT ?` | `IS DISTINCT FROM` | `IS DISTINCT FROM` (SQLite ≥3.39; Node 22 bundles newer — verified in tests) |
| Scalar `MAX(a,b)` | ok | aggregate only | rewrite with `CASE` |
| Typed params in `INSERT…SELECT ?,…` | untyped | "could not determine type" error | `CAST(? AS TEXT/INTEGER)` (both) |
| Dates in reports | `datetime(created_at,'+6 hours')`, `strftime`, `date('now',…)` | different | `dbx.sql.dhakaDate/dhakaMonth/dhakaDaysAgo` helpers per driver; Asia/Dhaka (UTC+6, no DST) |
| Defaults | `datetime('now')` | `now()` | separate schema files |
| Foreign keys | `PRAGMA foreign_keys=ON` | always on | driver-specific init |
| Autoincrement | `AUTOINCREMENT` | `BIGSERIAL`/identity | separate schema files |
| `GROUP BY alias` | ok | ok | no change |

## 4. Data types (the existing `schema.postgres.sql` is **not** compatible and will be rewritten in Stage 5)
Problems found: `BOOLEAN` columns but code compares `active=1`; `JSONB` for `colors` but code does `JSON.parse(text)`; `DATE`/`TIMESTAMPTZ` return JS `Date` objects but the frontend expects `"YYYY-MM-DD HH:MM:SS"` UTC strings; `BIGINT`/`COUNT`/`SUM` come back as strings from `pg`.
Decisions: flags stay `SMALLINT 0/1`; `colors` stays `TEXT` (JSON string); timestamps stored `TIMESTAMPTZ`, **driver normalises to the same UTC string format SQLite returns**; `pg` type parsers convert `int8` and `numeric` to JS numbers (safe: BDT whole-taka amounts and counts are far below 2^53); `coupons.expires_at` stays `TEXT` (YYYY-MM-DD).

## 5. Transactions & concurrency
* **SQLite today:** one connection, synchronous, so a transaction can never interleave. Once the API is `async`, an `await` inside a transaction would let another request's statements run *inside* it (or issue a nested `BEGIN`). `dbx` therefore serialises: a global async lock; statements from other requests wait while a transaction is open; nested `tx()` joins the outer one. Tested with concurrent transactions and rollback.
* **PostgreSQL:** each `tx()` checks out one pooled client and carries it via `AsyncLocalStorage` so every statement in the callback uses the same connection. `READ COMMITTED`.
* **Overselling:** stock is decremented by one atomic `UPDATE products SET stock=stock-? WHERE id=? AND stock>=?` and the affected-row count is checked — correct under both engines. Coupon usage uses the same pattern.
* **Deadlocks (new risk on Postgres):** two orders touching the same products in opposite order can deadlock. Stage 2 sorts line items by product id before updating.
* **Proof required in Stage 6:** N parallel orders (e.g. 20) for a product with stock 5 → exactly 5 succeed, stock ends at 0, never negative; plus cancel-restock under concurrency.

## 6. Sessions & authentication
* Sessions already live in a DB table (token stored as SHA-256) → no change of design; works on both engines; Render restarts do not log users out.
* Add periodic deletion of expired sessions (currently only deleted on use).
* Cookies: `HttpOnly; SameSite=Lax; Secure` in production. Render terminates TLS and proxies → set `TRUST_PROXY=1`, `PUBLIC_URL=https://…` (also fixes Origin checks & canonical URLs).
* `scrypt` hashing is currently synchronous (blocks the event loop ~tens of ms per login). Switch to async `crypto.scrypt` in Stage 1 while `auth.js` is being converted.
* Rate limiter is in-memory: fine for one instance (Render free allows exactly one); resets on restart. Documented limitation.
* Admin authorization is unchanged (server-side role check per route); re-tested on Supabase in Stage 6.

## 7. Image uploads (Supabase Storage)
* Interface `storage.save(buffer, ext, mime) → public URL`. Drivers: `local` (default, dev) and `supabase`.
* Supabase driver: server calls Storage REST with `SUPABASE_SERVICE_ROLE_KEY` (**secret, Render env only, never in git/browser**) to a **public-read bucket** (e.g. `product-images`); URL stored in `product_images.url`. Existing validation (magic bytes, 3 MB, PNG/JPEG/WebP only, random names) is kept.
* CSP already allows `img-src https:`. Local `/uploads` serving remains for dev and for any legacy URLs.
* Required before Stage 6: owner creates the bucket (steps in the setup guide).
* Free-tier limit: 1 GB storage / 5 GB egress (per Supabase docs read on 2026-11-16).

## 8. Test strategy
1. Existing 12 API tests + new dbx tests on SQLite (every stage).
2. The **same** test files run against Postgres via `TEST_DB_DRIVER=postgres TEST_DATABASE_URL=…` in an isolated schema that the test creates and drops; refuses to run if the URL host looks like production (`PROD_GUARD`).
3. Concurrency + rollback tests (SQLite now; Postgres in Stage 6).
4. Manual staging checklist (Stage 6/7): register/login/logout, wrong password, admin vs customer permissions, create/edit product, image upload (appears on storefront, survives redeploy), cart, coupon, COD checkout, order tracking, admin status change, cancel restock, restart & redeploy persistence, mobile layout.
5. Data migration: none required — current DB has no business data. Production starts empty; real catalogue is entered by the owner.

## 9. Rollback
Branch-only until Stage 7; SQLite default means `main` behaviour is unchanged. After deployment, rollback = redeploy previous commit; database is backed up first (`pg_dump` from the owner's machine/CI; Supabase free plan backups are **unconfirmed** — see limitations).

## 10. Known limitations / unverified
* Supabase free: pausing of inactive projects and included backups were **not stated** on the docs page read — verify in the dashboard; plan on own `pg_dump` backups.
* Supabase direct DB host may be IPv6-only; Render likely needs the **pooler** connection string — verify during setup.
* Render free: 15-min idle spin-down (~1 min cold start), ephemeral disk, 750 h/month.
