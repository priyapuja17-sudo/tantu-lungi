# Setup guide (you do the account steps; no secrets ever go in chat or in git)

> Screens and button names on Supabase/Render change from time to time. If a label differs slightly, pick the closest one, or tell me what you see.

## Rule for secrets
Database passwords, connection strings, and the Supabase **service role / secret key** are **secrets**.
Put them only (a) in your password manager, (b) in the Render **Environment** tab, (c) in GitHub **Settings → Secrets**. Never paste them in chat, never commit them. I will never ask for them.

## Part A — Supabase STAGING project (do this now; takes ~10 minutes)
Use a separate project for staging. Later, create a second one for production.
1. Create an account at supabase.com (sign up with GitHub or email).
2. **New project**: name `tantu-lungi-staging`; choose a strong **database password** and save it in your password manager; pick the region closest to Bangladesh (Singapore is usually the nearest available). Plan: Free.
3. Wait until the project finishes provisioning.
4. **Storage → New bucket**: name `product-images`, turn **Public bucket ON** (so customers can see product photos), create it.
5. Find (but do not share) these values; you will paste them into Render/GitHub secrets later:
   * Database connection string — project **Connect** / Settings → Database → *Connection string*. There are "direct" and "pooler" variants; Render will most likely need the **pooler** one (I will confirm in Stage 5 — tell me which variants you see, by name only).
   * Project URL (looks like `https://xxxx.supabase.co`) — this one is *not* secret; you may share it.
   * Secret/service-role API key — **secret**.
6. Check and tell me (this is not secret): on the Supabase **billing / plan** page, does the Free plan mention project **pausing** after inactivity, and **backups**? (The docs page I read did not say.)

## Part B — Render (later, after Stage 6 passes)
Steps will be added when the code is ready. You will: create a Render account, connect GitHub, choose repo `tantu-lungi`, set environment variables in Render's dashboard.
