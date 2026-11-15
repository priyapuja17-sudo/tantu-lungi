import { S, t, isBn, pick, html, raw, esc, mount, num, money, date, api, toast, I, Logo, stars, store, phoneOk, toAscii } from './lib.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const FABRICS = ['cotton', 'premium_cotton', 'half_silk', 'pure_silk'];
const DESIGNS = ['check', 'stripe', 'traditional', 'plain'];
const STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
let main, hdrEl, ftrEl;
const PCACHE = new Map();

/* ===================== cart / wishlist state ===================== */
const saveCart = () => { store.set('cart', S.cart); updateBadges(); };
const cartCount = () => S.cart.reduce((a, i) => a + i.qty, 0);
function addToCart(p, ci, qty) {
  const color = p.colors[ci]?.name_en || '';
  const ex = S.cart.find((i) => i.id === p.id && i.color === color);
  if (ex) ex.qty = Math.min(ex.qty + qty, 20);
  else S.cart.push({ id: p.id, color, ci, qty: Math.min(qty, 20), slug: p.slug, name_en: p.name_en, name_bn: p.name_bn, price: p.price, image: p.images[0] });
  saveCart();
}
const pimg = (url, ci = 0) => (url && url.startsWith('/img/p/') && ci ? `${url}?c=${ci}` : url);
async function loadWish() {
  if (S.user) { try { S.wish = new Set(await api('/api/me/wishlist')); } catch {} } else S.wish = new Set(store.get('wish', []));
  updateBadges();
}
async function toggleWish(id) {
  const on = S.wish.has(id);
  if (on) S.wish.delete(id); else S.wish.add(id);
  if (S.user) { try { await api(`/api/me/wishlist/${id}`, { method: on ? 'DELETE' : 'PUT' }); } catch (e) { toast(e.message, 'err'); } } else store.set('wish', [...S.wish]);
  toast(on ? t('wish_removed') : t('wish_added'));
  updateBadges();
  $$(`.wish[data-id="${id}"]`).forEach((b) => b.classList.toggle('on', !on));
  const pb = $('#pd-wish'); if (pb && +pb.dataset.id === id) pb.textContent = !on ? t('in_wish') : t('add_wish');
  if (location.pathname === '/wishlist' || location.pathname === '/account/wishlist') render();
}

/* ===================== layout ===================== */
function renderHeader() {
  const c = S.config, cats = c.categories;
  const path = location.pathname;
  mount(hdrEl, html`
  <div class="announce">${t('announce')} · <b>${t('free_over')} ${money(+c.settings.free_delivery_over || 0)}</b></div>
  <header class="hdr"><div class="wrap">
    <div class="hdr-row">
      <a class="logo" href="/" aria-label="${pick(c.settings, 'store_name')}">${Logo()}<span><b>${isBn() ? c.settings.store_name_bn : c.settings.store_name_en}</b><small>${isBn() ? 'Tantu Lungi' : 'Heritage Weaves'}</small></span></a>
      <form class="search" role="search" data-form="search" autocomplete="off">
        <input id="q" type="search" name="q" placeholder="${t('search_ph')}" aria-label="${t('search_ph')}" value="${path === '/shop' ? new URLSearchParams(location.search).get('q') || '' : ''}">
        <button aria-label="Search">${I.search}</button><div class="suggest hide" id="sug"></div>
      </form>
      <div class="hdr-actions">
        <div class="lang" role="group" aria-label="${t('language')}"><button data-act="lang" data-v="bn" class="${S.lang === 'bn' ? 'on' : ''}">বাং</button><button data-act="lang" data-v="en" class="${S.lang === 'en' ? 'on' : ''}">EN</button></div>
        <a class="ibtn" href="/wishlist" aria-label="${t('wishlist')}">${I.heart}<span class="badge hide" id="b-wish">0</span></a>
        ${S.user ? html`<a class="ibtn" href="/account" aria-label="${t('account')}">${I.user}</a>` : html`<a class="btn sm ghost hide-sm" href="/login" style="margin-left:6px">${t('login')} / ${t('register')}</a><a class="ibtn only-sm" href="/login" aria-label="${t('login')}">${I.user}</a>`}
        <a class="ibtn" href="/cart" aria-label="${t('cart')}">${I.bag}<span class="badge hide" id="b-cart">0</span></a>
      </div>
    </div>
    <div class="mobile-search"><form class="search" role="search" data-form="search"><input type="search" name="q" placeholder="${t('search_ph')}" aria-label="${t('search_ph')}"><button aria-label="Search">${I.search}</button></form></div>
  </div>
  <nav class="nav" aria-label="Categories"><div class="wrap nav-row">
    <a href="/" class="${path === '/' ? 'on' : ''}">${t('home')}</a><a href="/shop" class="${path === '/shop' ? 'on' : ''}">${t('shop_all')}</a>
    ${cats.map((x) => html`<a href="/c/${x.slug}" class="${path === '/c/' + x.slug ? 'on' : ''}">${pick(x, 'name')}</a>`)}
    <a href="/track" class="${path === '/track' ? 'on' : ''}">${t('track')}</a>
  </div></nav></header>`);
  updateBadges();
}
function updateBadges() {
  const set = (id, n) => { const el = document.getElementById(id); if (el) { el.textContent = num(n); el.classList.toggle('hide', !n); } };
  set('b-cart', cartCount()); set('b-wish', S.wish.size);
}
function renderFooter() {
  const s = S.config.settings, cats = S.config.categories;
  mount(ftrEl, html`
  <footer class="ftr"><div class="wrap">
    <div class="ftr-grid">
      <div><a class="logo" href="/">${Logo()}<span><b>${isBn() ? s.store_name_bn : s.store_name_en}</b></span></a>
        <p style="margin-top:14px;max-width:30em">${isBn() ? 'ঐতিহ্য ও আরামের সেরা সমন্বয়ে প্রিমিয়াম লুঙ্গি — সারা বাংলাদেশে।' : 'Premium lungis blending heritage and comfort — across Bangladesh.'}</p>
        <div class="social"><a href="${s.facebook_url}" target="_blank" rel="noopener noreferrer" aria-label="Facebook">${I.facebook}</a><a href="${s.instagram_url}" target="_blank" rel="noopener noreferrer" aria-label="Instagram">${I.instagram}</a><a href="https://wa.me/${esc(s.whatsapp_number)}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">${I.whatsapp}</a></div></div>
      <div><h4>${t('categories')}</h4>${cats.slice(0, 6).map((c) => html`<a href="/c/${c.slug}">${pick(c, 'name')}</a>`)}</div>
      <div><h4>${t('quick_links')}</h4><a href="/shop">${t('shop_all')}</a><a href="/track">${t('track')}</a><a href="/account">${t('account')}</a><a href="/wishlist">${t('wishlist')}</a></div>
      <div><h4>${t('contact')}</h4><a href="tel:${s.contact_phone}">${s.contact_phone}</a><a href="mailto:${s.contact_email}">${s.contact_email}</a><span>${isBn() ? s.contact_address_bn : s.contact_address_en}</span>
        <h4 style="margin-top:16px">${t('we_accept')}</h4><div class="paychips"><span class="paychip">${t('cod')}</span><span class="paychip">bKash</span><span class="paychip">Nagad</span><span class="paychip">Rocket</span></div></div>
    </div>
    <div class="ftr-bot"><span>© ${new Date().getFullYear()} ${isBn() ? s.store_name_bn : s.store_name_en}. ${t('rights')}</span><span>৳ BDT · Bangladesh</span></div>
  </div></footer>
  <a class="wa" href="https://wa.me/${esc(s.whatsapp_number)}" target="_blank" rel="noopener noreferrer" aria-label="${t('whatsapp')}">${I.whatsapp}</a>`);
}

/* ===================== components ===================== */
const dots = (cols) => html`<div class="dots">${cols.slice(0, 5).map((c) => html`<span class="dot" title="${isBn() ? c.name_bn : c.name_en}" style="--c1:${c.hex};--c2:${c.hex2}"></span>`)}</div>`;
function priceBlock(p) {
  return html`<div class="price"><b>${money(p.price)}</b>${p.discount_pct ? html`<s>${money(p.regular_price)}</s><span class="pct">-${num(p.discount_pct)}%</span>` : ''}</div>`;
}
function card(p) {
  PCACHE.set(p.id, p);
  const catName = S.config.categories.find((c) => c.slug === p.category_slug);
  return html`<article class="card fade">
    <div class="im"><a href="/p/${p.slug}" aria-label="${pick(p, 'name')}"><img src="${p.images[0]}" alt="${pick(p, 'name')}" loading="lazy" width="400" height="400"><img class="alt" src="${p.images[2] || p.images[1] || p.images[0]}" alt="" loading="lazy" aria-hidden="true"></a>
      <div class="tags">${p.discount_pct ? html`<span class="tag red">-${num(p.discount_pct)}%</span>` : ''}${p.is_new ? html`<span class="tag gold">${isBn() ? 'নতুন' : 'NEW'}</span>` : ''}${!p.in_stock ? html`<span class="tag grey">${t('sold_out')}</span>` : p.low_stock ? html`<span class="tag grey">${t('low_stock')}</span>` : ''}</div>
      <button class="wish ${S.wish.has(p.id) ? 'on' : ''}" data-act="wish" data-id="${p.id}" aria-label="${t('add_wish')}">${I.heart}</button></div>
    <div class="bd"><span class="cat">${catName ? pick(catName, 'name') : ''}</span>
      <h3><a href="/p/${p.slug}">${pick(p, 'name')}</a></h3>
      <div class="rate">${p.review_count ? html`${stars(p.rating)} <span>(${num(p.review_count)})</span>` : ''}</div>
      ${dots(p.colors)}${priceBlock(p)}
      <button class="btn sm ${p.in_stock ? '' : 'ghost'} quick" data-act="quick-add" data-id="${p.id}" ${p.in_stock ? '' : 'disabled'}>${p.in_stock ? t('add_cart') : t('out_stock')}</button></div></article>`;
}
const skeleton = (n = 4) => html`<div class="grid">${Array.from({ length: n }, () => html`<div class="skel"></div>`)}</div>`;
const section = (title, link, body, cls = '') => html`<section class="sec ${cls}"><div class="wrap"><div class="sec-head"><h2>${title}</h2>${link ? html`<a href="${link}">${t('view_all')} →</a>` : ''}</div>${body}</div></section>`;
const PATS = ['#16345F', '#7A1F2B', '#1F5A4A', '#4B2A6B', '#2E3338', '#5B3A29', '#14636B', '#A1242E'];
const pat = (i) => `linear-gradient(90deg,rgba(201,162,75,.38) 6px,transparent 6px) 0 0/26px 26px,linear-gradient(rgba(255,255,255,.18) 3px,transparent 3px) 0 8px/26px 26px,${PATS[i % PATS.length]}`;
const stockLabel = (p) => (!p.in_stock ? html`<span class="stock out">${t('out_stock')}</span>` : p.low_stock ? html`<span class="stock low">${t('low_stock')} — ${num(p.stock)} ${t('left')}</span>` : html`<span class="stock">${t('in_stock')}</span>`);

/* ===================== pages ===================== */
const V = (node) => { mount(main, html`<div class="fade">${node}</div>`); window.scrollTo({ top: 0 }); };
async function pageHome() {
  mount(main, skeleton(4));
  const [h] = await Promise.all([api('/api/home')]);
  const s = S.config.settings, cats = S.config.categories;
  mount(main, html`<div class="fade">
  <section class="hero"><img src="/img/hero.svg" alt="" width="1200" height="700" fetchpriority="high"><div class="wrap"><div class="hero-in">
    <span class="eyebrow">${isBn() ? 'তন্তু লুঙ্গি' : 'Tantu Lungi'}</span>
    <h1>${isBn() ? s.hero_title_bn : s.hero_title_en}</h1><p>${isBn() ? s.hero_sub_bn : s.hero_sub_en}</p>
    <div class="hero-cta"><a class="btn gold" href="/shop">${t('shop_now')} →</a><a class="btn ghost light" href="/c/premium-collection" style="color:#fff;border-color:rgba(255,255,255,.5);background:transparent">${pick(cats.find((c) => c.slug === 'premium-collection') || { name_en: 'Premium', name_bn: 'প্রিমিয়াম' }, 'name')}</a></div>
    <div class="hero-points"><span>${t('pt1')}</span><span>${t('pt2')}</span><span>${t('pt3')}</span></div></div></div></section>
  ${section(t('categories'), '/shop', html`<div class="cats">${cats.map((c, i) => html`<a class="cat-tile" href="/c/${c.slug}" style="--pat:${pat(i)}"><h3>${pick(c, 'name')}</h3><span>${num(c.count)} ${t('results')}</span></a>`)}</div>`)}
  ${h.featured.length ? section(t('featured'), '/shop?featured=1', html`<div class="grid">${h.featured.slice(0, 8).map(card)}</div>`, 'alt') : ''}
  ${section(t('best'), '/shop?sort=popular', html`<div class="grid">${h.best.slice(0, 8).map(card)}</div>`)}
  ${h.arrivals.length ? section(t('arrivals'), '/shop?isnew=1', html`<div class="grid">${h.arrivals.slice(0, 8).map(card)}</div>`, 'alt') : ''}
  ${section(t('offers'), '/shop?sale=1', html`${h.banners.length ? html`<div class="offers">${h.banners.map((b) => html`<a class="offer" href="${b.link || '/shop'}" style="--c1:${b.color1};--c2:${b.color2}"><h3>${isBn() ? b.title_bn || b.title_en : b.title_en || b.title_bn}</h3><p>${isBn() ? b.sub_bn || b.sub_en : b.sub_en || b.sub_bn}</p><span class="btn sm gold">${t('shop_now')}</span></a>`)}</div>` : ''}<div class="grid">${h.offers.slice(0, 8).map(card)}</div>`)}
  ${h.testimonials.length ? section(t('reviews_h'), '', html`<div class="quotes">${h.testimonials.slice(0, 3).map((q) => html`<div class="quote">${stars(q.rating)}<p>${q.body}</p><div class="who">${q.author}</div><a class="small muted" href="/p/${q.slug}">${isBn() ? q.name_bn : q.name_en}</a></div>`)}</div>`, 'alt') : ''}
  <section class="sec dark"><div class="wrap"><div class="sec-head"><h2>${t('why')}</h2></div><div class="why">
    <div>${I.thread}<h3>${t('why1t')}</h3><p>${t('why1')}</p></div><div>${I.cash}<h3>${t('why2t')}</h3><p>${t('why2')}</p></div>
    <div>${I.truck}<h3>${t('why3t')}</h3><p>${t('why3')}</p></div><div>${I.shield}<h3>${t('why4t')}</h3><p>${t('why4')}</p></div></div></div></section>
  <section class="sec"><div class="wrap"><div class="news"><div><h2>${t('news_t')}</h2><p>${isBn() ? 'স্প্যাম নয় — শুধু গুরুত্বপূর্ণ খবর।' : 'No spam — only what matters.'}</p></div>
    <form data-form="newsletter"><input type="email" name="email" required placeholder="${t('news_s')}" aria-label="${t('email')}"><button class="btn gold">${t('subscribe')}</button></form></div></div></section></div>`);
  window.scrollTo({ top: 0 });
}

let shopReq = 0;
async function pageShop(m, q) {
  const slug = m && m[1] ? decodeURIComponent(m[1]) : '';
  const cat = slug ? S.config.categories.find((c) => c.slug === slug) : null;
  if (slug && !cat) return notFound();
  const params = new URLSearchParams(q);
  const f = { fabric: (params.get('fabric') || '').split(',').filter(Boolean), color: params.get('color') || '', min: params.get('min') || '', max: params.get('max') || '', sort: params.get('sort') || 'newest', instock: params.get('instock') || '', page: +params.get('page') || 1, q: params.get('q') || '', design: params.get('design') || '' };
  const api_q = new URLSearchParams({ limit: 12, page: f.page, sort: f.sort });
  if (slug) api_q.set('cat', slug); if (f.fabric.length) api_q.set('fabric', f.fabric.join(',')); if (f.color) api_q.set('color', f.color); if (f.min) api_q.set('min', f.min); if (f.max) api_q.set('max', f.max);
  if (f.instock) api_q.set('instock', 1); if (f.q) api_q.set('q', f.q); if (f.design) api_q.set('design', f.design);
  for (const k of ['featured', 'isnew', 'sale']) if (params.get(k)) api_q.set(k, 1);
  const my = ++shopReq;
  const title = cat ? pick(cat, 'name') : f.q ? `“${f.q}”` : params.get('featured') ? t('featured') : params.get('isnew') ? t('arrivals') : params.get('sale') ? t('offers') : t('shop_all');
  mount(main, html`<div class="wrap"><div class="crumbs"><a href="/">${t('home')}</a> / ${title}</div><div class="page-title"><h1>${title}</h1>${cat ? html`<p class="muted">${isBn() ? cat.desc_bn : cat.desc_en}</p>` : ''}</div>${skeleton(6)}</div>`);
  const r = await api('/api/products?' + api_q);
  if (my !== shopReq) return;
  const set = (k, v) => { const p = new URLSearchParams(location.search); if (v === '' || v == null) p.delete(k); else p.set(k, v); if (k !== 'page') p.delete('page'); return location.pathname + (p.toString() ? '?' + p : ''); };
  const pr = S.config.price_range;
  const pager = r.pages > 1 ? html`<div class="pager">${Array.from({ length: r.pages }, (_, i) => html`<button class="${i + 1 === r.page ? 'on' : ''}" data-act="nav" data-href="${set('page', i + 1)}">${num(i + 1)}</button>`)}</div>` : '';
  V(html`<div class="wrap"><div class="crumbs"><a href="/">${t('home')}</a> / ${title}</div><div class="page-title"><h1>${title}</h1>${cat ? html`<p class="muted">${isBn() ? cat.desc_bn : cat.desc_en}</p>` : ''}</div>
  <div class="shop">
    <aside class="filters" id="filters" aria-label="${t('filters')}">
      <button class="btn sm ghost fclose" data-act="filters" aria-label="Close">${I.x}</button>
      <h4>${t('category')}</h4>${S.config.categories.map((c) => html`<a class="chk" href="/c/${c.slug}" style="${c.slug === slug ? 'font-weight:700;color:var(--gold-d)' : ''}">${pick(c, 'name')}</a>`)}
      <h4>${t('fabric')}</h4>${FABRICS.map((x) => html`<label class="chk"><input type="checkbox" data-filter="fabric" value="${x}" ${f.fabric.includes(x) ? 'checked' : ''}>${t('fb_' + x)}</label>`)}
      <h4>${t('design')}</h4>${DESIGNS.map((x) => html`<label class="chk"><input type="radio" name="design" data-filter="design" value="${x}" ${f.design === x ? 'checked' : ''}>${t('d_' + x)}</label>`)}
      <h4>${t('color')}</h4><div class="swatches">${S.config.colors.map((c) => html`<button class="sw ${f.color === c.name_en ? 'on' : ''}" title="${isBn() ? c.name_bn : c.name_en}" data-act="nav" data-href="${set('color', f.color === c.name_en ? '' : c.name_en)}" style="background:${c.hex}" aria-label="${c.name_en}"></button>`)}</div>
      <h4>${t('price')} (৳)</h4><div class="price-in"><input class="in" style="margin:0" type="number" inputmode="numeric" min="0" placeholder="${t('min')} ${pr.min || ''}" data-filter="min" value="${f.min}" aria-label="${t('min')}"><span>–</span><input class="in" style="margin:0" type="number" inputmode="numeric" min="0" placeholder="${t('max')} ${pr.max || ''}" data-filter="max" value="${f.max}" aria-label="${t('max')}"></div>
      <label class="chk" style="margin-top:12px"><input type="checkbox" data-filter="instock" ${f.instock ? 'checked' : ''}>${t('in_stock_only')}</label>
      <button class="btn sm ghost block" style="margin-top:14px" data-act="nav" data-href="${location.pathname}">${t('clear')}</button>
    </aside>
    <div><div class="toolbar"><div><button class="btn sm ghost filter-toggle" data-act="filters">${I.filter} ${t('filters')}</button> <span class="muted">${num(r.total)} ${t('results')}</span></div>
      <label class="small" style="display:flex;gap:8px;align-items:center">${t('sort')}<select class="in" style="width:auto;height:40px;margin:0" data-filter="sort">${[['newest', 's_newest'], ['popular', 's_popular'], ['price_asc', 's_pa'], ['price_desc', 's_pd']].map(([v, k]) => html`<option value="${v}" ${f.sort === v ? 'selected' : ''}>${t(k)}</option>`)}</select></label></div>
      ${r.items.length ? html`<div class="grid">${r.items.map(card)}</div>${pager}` : html`<div class="empty"><h3>${t('no_results')}</h3><p>${t('no_results_s')}</p></div>`}</div>
  </div></div>`);
  window.__shopSet = set;
}

let PD = null;
async function pagePDP(m) {
  mount(main, html`<div class="wrap">${skeleton(1)}</div>`);
  let p;
  try { p = await api('/api/products/' + encodeURIComponent(m[1])); } catch (e) { if (e.status === 404) return notFound(); throw e; }
  PD = { p, ci: 0, im: 0, qty: 1, tab: 'desc', rating: 5 };
  document.title = `${pick(p, 'name')} — ${pick(S.config.settings, 'store_name')}`;
  renderPDP();
}
function renderPDP() {
  const { p, ci, im, qty, tab } = PD;
  const cat = S.config.categories.find((c) => c.slug === p.category_slug);
  const imgs = p.images;
  const col = p.colors[ci];
  const rb = p.rating_breakdown || [];
  const body = {
    desc: html`<p style="max-width:70ch">${isBn() ? p.desc_bn || p.desc_en : p.desc_en || p.desc_bn}</p>`,
    details: html`<table class="specs"><tr><th>${t('fabric')}</th><td>${t('fb_' + p.fabric)}</td></tr><tr><th>${t('design')}</th><td>${t('d_' + p.design)}</td></tr><tr><th>${t('length')}</th><td>${num(p.length_cm)} ${t('cm')}</td></tr><tr><th>${t('width')}</th><td>${num(p.width_cm)} ${t('cm')}</td></tr><tr><th>${t('available_colors')}</th><td>${p.colors.map((c) => (isBn() ? c.name_bn : c.name_en)).join(', ')}</td></tr><tr><th>${t('sku')}</th><td>${p.sku}</td></tr></table>`,
    reviews: html`<div style="display:grid;grid-template-columns:minmax(0,260px) 1fr;gap:28px" class="rvgrid"><div><div style="font-size:2.6rem;font-weight:700;color:var(--navy)">${p.review_count ? num(p.rating) : '–'}</div>${stars(p.rating)}<div class="small muted">${num(p.review_count)} ${t('reviews')}</div>
      <div class="bars" style="margin-top:10px">${rb.map((n, i) => html`<div><span>${num(5 - i)}★</span><i><b style="width:${p.review_count ? (n / p.review_count) * 100 : 0}%"></b></i><span>${num(n)}</span></div>`)}</div></div>
      <div>${S.user ? html`<form data-form="review" class="formbox" style="margin-bottom:18px"><b>${t('write_review')}</b><div class="starpick" role="radiogroup" aria-label="${t('your_rating')}">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" data-act="rate" data-v="${n}" class="${n <= PD.rating ? 'on' : ''}" aria-label="${n}">★</button>`)}</div><textarea class="in" name="body" maxlength="1000" placeholder="${t('write_review')}…"></textarea><button class="btn sm" style="margin-top:10px">${t('submit')}</button></form>` : html`<p class="alert info"><a class="link" href="/login?next=${encodeURIComponent(location.pathname)}">${t('login_to_review')}</a></p>`}
      ${p.reviews.length ? p.reviews.map((r) => html`<div class="rv">${stars(r.rating)} <b>${r.author}</b>${r.verified ? html`<span class="vbadge">✓ ${t('verified')}</span>` : ''} <span class="small muted">· ${date(r.created_at)}</span><p style="margin:6px 0 0">${r.body}</p></div>`) : html`<p class="muted">${t('no_reviews')}</p>`}</div></div>`,
  };
  mount(main, html`<div class="wrap fade"><div class="crumbs"><a href="/">${t('home')}</a> / ${cat ? html`<a href="/c/${cat.slug}">${pick(cat, 'name')}</a> /` : ''} ${pick(p, 'name')}</div>
  <div class="pd">
    <div><div class="gal-main" id="galmain" data-act="zoom"><img src="${pimg(imgs[im], ci)}" alt="${pick(p, 'name')}" width="800" height="800"></div>
      <div class="thumbs">${imgs.slice(0, 5).map((u, i) => html`<button class="${i === im ? 'on' : ''}" data-act="thumb" data-v="${i}" aria-label="${i + 1}"><img src="${pimg(u, ci)}" alt="" loading="lazy"></button>`)}</div></div>
    <div><span class="cat" style="color:var(--gold-d);font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;font-weight:600">${cat ? pick(cat, 'name') : ''}</span>
      <h1>${pick(p, 'name')}</h1><div class="rate">${p.review_count ? html`${stars(p.rating)} <span>${num(p.rating)} (${num(p.review_count)} ${t('reviews')})</span>` : ''}</div>
      <div class="sku">${t('sku')}: ${p.sku}</div>
      <div class="price"><b>${money(p.price)}</b>${p.discount_pct ? html`<s>${money(p.regular_price)}</s><span class="tag red">-${num(p.discount_pct)}% ${t('off')}</span>` : ''}</div>
      <div>${stockLabel(p)}</div>
      <div class="opt-t">${t('available_colors')}: <span>${isBn() ? col.name_bn : col.name_en}</span></div>
      <div class="cpick">${p.colors.map((c, i) => html`<button data-act="color" data-v="${i}" class="${i === ci ? 'on' : ''}"><span class="dot" style="--c1:${c.hex};--c2:${c.hex2}"></span>${isBn() ? c.name_bn : c.name_en}</button>`)}</div>
      <div class="opt-t">${t('design')}: <span>${t('d_' + p.design)}</span> · ${t('fabric')}: <span>${t('fb_' + p.fabric)}</span> · ${t('size')}: <span>${num(p.length_cm)}×${num(p.width_cm)} ${t('cm')}</span></div>
      <div class="opt-t">${t('quantity')}</div>
      <div class="qty"><button data-act="pqty" data-v="-1" aria-label="-">−</button><input id="pqty" value="${qty}" inputmode="numeric" aria-label="${t('quantity')}"><button data-act="pqty" data-v="1" aria-label="+">+</button></div>
      <div class="buy"><button class="btn" data-act="pd-add" ${p.in_stock ? '' : 'disabled'}>${t('add_cart')}</button><button class="btn gold" data-act="pd-buy" ${p.in_stock ? '' : 'disabled'}>${t('buy_now')}</button></div>
      <button class="btn ghost sm" id="pd-wish" data-act="wish" data-id="${p.id}">${S.wish.has(p.id) ? t('in_wish') : t('add_wish')}</button>
      <div class="assure"><div>${t('a1')}</div><div>${t('a2')}</div><div>${t('a3')}</div></div></div>
  </div>
  <div class="tabs" role="tablist">${['desc', 'details', 'reviews'].map((k) => html`<button role="tab" class="${tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${k === 'reviews' ? `${t('reviews')} (${num(p.review_count)})` : t(k === 'desc' ? 'description' : 'details')}</button>`)}</div>
  <div>${body[tab]}</div>
  ${p.related.length ? html`<div style="margin-top:50px"><div class="sec-head"><h2>${t('related')}</h2></div><div class="grid">${p.related.map(card)}</div></div>` : ''}<div style="height:50px"></div></div>`);
}

/* ---------- cart ---------- */
async function quote(district) {
  if (!S.cart.length) return null;
  const r = await api('/api/cart/quote', { method: 'POST', body: { items: S.cart.map((i) => ({ id: i.id, qty: i.qty, color: i.color })), coupon: S.coupon || '', district: district || '' } });
  // reconcile with server truth: drop unavailable lines, clamp quantities
  const keep = new Set(r.lines.map((l) => l.id + '|' + l.color));
  const before = S.cart.length;
  S.cart = S.cart.filter((i) => keep.has(i.id + '|' + i.color));
  if (S.cart.length !== before) toast(t('stock_issue'), 'err');
  if (r.coupon_error) { S.coupon = ''; store.set('coupon', ''); toast(r.coupon_error, 'err'); }
  saveCart();
  return r;
}
async function pageCart() {
  if (!S.cart.length) return V(html`<div class="wrap"><div class="empty"><h3>${t('cart_empty')}</h3><a class="btn" href="/shop">${t('continue')}</a></div></div>`);
  mount(main, html`<div class="wrap">${skeleton(1)}</div>`);
  const r = await quote();
  if (!r) return pageCart();
  const lineUI = (l) => {
    const ci = S.cart.find((i) => i.id === l.id && i.color === l.color)?.ci || 0;
    return html`<div class="line"><a href="/p/${l.slug}"><img src="${pimg(l.image, ci)}" alt="${isBn() ? l.name_bn : l.name_en}"></a>
      <div><h3><a href="/p/${l.slug}">${isBn() ? l.name_bn : l.name_en}</a></h3><div class="small muted"><span class="dot" style="--c1:${l.hex};--c2:${l.hex2};display:inline-block;vertical-align:middle"></span> ${isBn() ? l.color_bn : l.color} · ${l.sku}</div><div class="small">${money(l.unit_price)}${l.unit_price < l.regular_price ? html` <s class="muted">${money(l.regular_price)}</s>` : ''}</div>
        ${l.qty > l.stock && l.stock >= 0 ? html`<div class="ferr">${t('stock_issue')}</div>` : ''}</div>
      <div><div class="qty"><button data-act="cqty" data-id="${l.id}" data-color="${l.color}" data-v="-1" aria-label="-">−</button><input value="${l.qty}" readonly aria-label="${t('quantity')}"><button data-act="cqty" data-id="${l.id}" data-color="${l.color}" data-v="1" aria-label="+">+</button></div>
        <div><b>${money(l.line_total)}</b></div><button class="link small" data-act="cremove" data-id="${l.id}" data-color="${l.color}">${t('remove')}</button></div></div>`;
  };
  V(html`<div class="wrap"><div class="page-title"><h1>${t('cart_title')}</h1></div><div class="two"><div class="formbox">${r.lines.map(lineUI)}<p style="margin-top:16px"><a class="link" href="/shop">← ${t('continue')}</a></p></div>${summary(r, true)}</div></div>`);
}
function summary(r, withCoupon, extra = '') {
  return html`<aside class="sumbox"><h3>${t('order_sum')}</h3>
    ${extra}
    <div class="srow"><span>${t('subtotal')}</span><span>${money(r.subtotal)}</span></div>
    ${r.discount ? html`<div class="srow disc"><span>${t('discount')} (${r.coupon_code})</span><span>−${money(r.discount)}</span></div>` : ''}
    <div class="srow"><span>${t('delivery')} ${r.delivery_estimated ? html`<span class="small muted">${t('est')}</span>` : ''}</span><span>${r.delivery_charge ? money(r.delivery_charge) : t('free')}</span></div>
    <div class="srow total"><span>${t('total')}</span><span>${money(r.total)}</span></div>
    ${withCoupon ? html`<form class="coupon" data-form="coupon"><input name="code" value="${S.coupon || ''}" placeholder="${t('coupon_ph')}" aria-label="${t('coupon_ph')}" maxlength="30"><button class="btn sm">${t('apply')}</button></form>` : ''}
    ${withCoupon ? html`<a class="btn gold block" href="/checkout">${t('checkout')} →</a><p class="small muted center" style="margin:10px 0 0">${t('inside_dhaka')}: ${money(+S.config.settings.delivery_inside_dhaka)} · ${t('outside_dhaka')}: ${money(+S.config.settings.delivery_outside_dhaka)}</p>` : ''}</aside>`;
}

/* ---------- checkout ---------- */
let CK = { district: '', pay: 'cod' };
async function pageCheckout() {
  if (!S.cart.length) return nav('/cart', true);
  mount(main, html`<div class="wrap">${skeleton(1)}</div>`);
  const u = S.user; const addrs = u ? await api('/api/me/addresses').catch(() => []) : [];
  const a0 = addrs[0] || {};
  CK.district = a0.district || CK.district || '';
  const r = await quote(CK.district);
  if (!r) return nav('/cart', true);
  const pm = S.config.payments;
  const payOpt = (k) => {
    const o = pm[k]; const off = !o.enabled;
    return html`<label class="${off ? 'off' : ''}"><input type="radio" name="payment_method" value="${k}" ${k === CK.pay && !off ? 'checked' : ''} ${off ? 'disabled' : ''}><div><div class="pn">${t(k)}</div><div class="ps">${k === 'cod' ? t('cod_s') : off ? t('unavailable') : o.mode === 'manual' ? t('manual_pay') : 'Online'}</div></div>${off ? html`<span class="pbadge">${t('unavailable')}</span>` : ''}</label>`;
  };
  V(html`<div class="wrap"><div class="page-title"><h1>${t('checkout')}</h1><p class="muted">${u ? '' : t('guest_hint') + ' '}${u ? '' : html`<a class="link" href="/login?next=/checkout">${t('login')}</a>`}</p></div>
  <form data-form="checkout" novalidate><div class="two"><div>
    <div class="formbox"><h3>${t('c_info')}</h3>
      ${addrs.length ? html`<label class="f">${t('saved_addr')}<select class="in" id="saved-addr"><option value="">${t('select')}</option>${addrs.map((a) => html`<option value="${a.id}">${a.label || a.name} — ${a.district}</option>`)}</select></label>` : ''}
      <div class="row2"><label class="f">${t('full_name')}<input class="in" name="name" autocomplete="name" value="${u?.name || a0.name || ''}" required></label>
      <label class="f">${t('mobile')}<input class="in" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" value="${u?.phone || a0.phone || ''}" required></label></div>
      <label class="f">${t('alt_mobile')} <span class="opt">${t('optional')}</span><input class="in" name="alt_phone" type="tel" inputmode="tel" placeholder="01XXXXXXXXX"></label>
      <label class="f">${t('address')}<textarea class="in" name="address" rows="2" placeholder="${t('address_ph')}" required>${a0.address || ''}</textarea></label>
      <div class="row2"><label class="f">${t('district')}<select class="in" name="district" id="f-district" required><option value="">${t('select')}</option>${Object.keys(S.config.districts).map((d) => html`<option ${d === CK.district ? 'selected' : ''}>${d}</option>`)}</select></label>
      <label class="f" id="upz">${upazilaField(CK.district, a0.upazila)}</label></div>
      <label class="f" style="max-width:220px">${t('post_code')} <span class="opt">${t('optional')}</span><input class="in" name="post_code" inputmode="numeric" maxlength="4" value="${a0.post_code || ''}"></label>
      <label class="f">${t('note')} <span class="opt">${t('optional')}</span><input class="in" name="note" maxlength="300"></label></div>
    <div class="formbox" style="margin-top:18px"><h3>${t('pay_method')}</h3><div class="pay" id="paybox">${['cod', 'bkash', 'nagad', 'rocket'].map(payOpt)}</div><div id="manual"></div></div>
  </div><div id="sum">${summary(r, false, '')}<div class="sumbox" style="margin-top:14px;position:static"><div id="ckerr"></div><button class="btn gold block" id="place">${t('place_order')}</button></div></div></div></form></div>`);
  $('#sum .sumbox').insertAdjacentHTML('afterbegin', `<div style="margin-bottom:12px">${S.cart.map((i) => `<div class="srow small"><span>${esc(isBn() ? i.name_bn : i.name_en)} × ${num(i.qty)}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}</div>`);
  onPayChange();
}
const upazilaField = (d, v = '') => {
  const list = S.config.districts[d] || [];
  return html`${t('upazila')} <span class="opt">${list.length ? '' : t('optional')}</span>${list.length ? html`<select class="in" name="upazila"><option value="">${t('select')}</option>${list.map((x) => html`<option ${x === v ? 'selected' : ''}>${x}</option>`)}</select>` : html`<input class="in" name="upazila" value="${v || ''}" maxlength="80">`}`;
};
function onPayChange() {
  const v = $('input[name=payment_method]:checked')?.value || 'cod'; CK.pay = v;
  const pm = S.config.payments[v]; const box = $('#manual'); if (!box) return;
  if (pm && pm.mode === 'manual') {
    box.innerHTML = html`<div class="alert info" style="margin-top:14px"><p style="margin:0 0 8px">${t('manual_how')}</p><div class="srow"><span>${t('send_to')}</span><b>${pm.number}</b></div><div class="srow"><span>${t('amount')}</span><b id="payamt"></b></div>
      <label class="f" style="margin:10px 0 0">${t('trx')}<input class="in" name="payment_ref" maxlength="30" autocomplete="off" style="text-transform:uppercase"></label></div>`.s;
    const tot = $('#sum .srow.total span:last-child'); $('#payamt').textContent = tot ? tot.textContent : '';
  } else box.innerHTML = '';
}
async function refreshCheckoutQuote() {
  const r = await quote(CK.district);
  if (!r) return nav('/cart', true);
  const box = $('#sum .sumbox'); const keep = box.querySelector('div[style]')?.outerHTML || '';
  const fresh = summary(r, false).s; const tmp = document.createElement('div'); tmp.innerHTML = fresh;
  box.innerHTML = keep + tmp.firstElementChild.innerHTML; onPayChange();
}
async function pageConfirm(m) {
  const no = decodeURIComponent(m[1]);
  const last = store.get('lastOrder', {});
  const phone = new URLSearchParams(location.search).get('phone') || (last.no === no ? last.phone : '');
  if (!phone) return nav('/track?order=' + encodeURIComponent(no), true);
  try {
    const o = await api('/api/track', { method: 'POST', body: { order_no: no, phone } });
    V(html`<div class="wrap" style="max-width:820px;padding:30px 0 60px"><div class="center"><div class="ok-mark">${I.check}</div><h1>${t('ord_done')}</h1><p>${t('ord_thanks')}</p><p style="font-size:1.6rem;font-weight:700;letter-spacing:.06em;color:var(--navy)">${o.order_no}</p><p class="muted">${t('keep_id')}</p></div>${orderCard(o, true)}<div class="center" style="margin-top:20px"><a class="btn" href="/shop">${t('continue')}</a></div></div>`);
  } catch (e) { nav('/track?order=' + encodeURIComponent(no), true); }
}
function timeline(o) {
  if (o.status === 'cancelled') return html`<div class="alert err">${t('cancelled_note')}</div>`;
  const idx = STEPS.indexOf(o.status);
  return html`<div class="tl" role="list">${STEPS.map((s, i) => html`<div class="s ${i <= idx ? 'done' : ''} ${i === idx ? 'now' : ''}" role="listitem"><div class="c">${i < idx ? I.check : num(i + 1)}</div>${t('st_' + s)}</div>`)}</div>`;
}
function orderCard(o, expanded = true, cancellable = false) {
  return html`<div class="obox"><header><div><b>${o.order_no}</b> <span class="small muted">· ${date(o.created_at)}</span></div><div><span class="pill ${o.status}">${t('st_' + o.status)}</span> <span class="pill ${o.payment_status}">${t(o.payment_method)} · ${t('ps_' + o.payment_status)}</span></div></header>
    ${timeline(o)}
    ${o.items.map((i) => html`<div class="srow small"><span>${i.name} (${i.color}) × ${num(i.qty)}</span><span>${money(i.unit_price * i.qty)}</span></div>`)}
    <div class="srow small"><span>${t('subtotal')}</span><span>${money(o.subtotal)}</span></div>${o.discount ? html`<div class="srow small disc"><span>${t('discount')}</span><span>−${money(o.discount)}</span></div>` : ''}
    <div class="srow small"><span>${t('delivery')}</span><span>${o.delivery_charge ? money(o.delivery_charge) : t('free')}</span></div><div class="srow total"><span>${t('total')}</span><span>${money(o.total)}</span></div>
    ${expanded ? html`<p class="small" style="margin:12px 0 4px"><b>${t('ship_to')}:</b> ${o.name}, ${o.phone}<br>${o.address}, ${o.upazila ? o.upazila + ', ' : ''}${o.district}</p><ul class="events">${[...o.events].reverse().map((e) => html`<li><b>${t('st_' + e.status)}</b> <span class="muted small">${date(e.created_at)}</span>${e.note ? html`<div class="small muted">${e.note}</div>` : ''}</li>`)}</ul>` : ''}
    ${cancellable && o.status === 'pending' ? html`<button class="btn sm danger" data-act="cancel-order" data-no="${o.order_no}">${t('cancel_order')}</button>` : ''}</div>`;
}
async function pageTrack(m, q) {
  const p = new URLSearchParams(q);
  V(html`<div class="wrap" style="max-width:820px;padding:20px 0 60px"><div class="page-title"><h1>${t('track_title')}</h1></div>
    <form class="formbox" data-form="track"><div class="row2"><label class="f">${t('order_id')}<input class="in" name="order_no" value="${p.get('order') || ''}" placeholder="LNG-250101-XXXXX" required style="text-transform:uppercase"></label>
    <label class="f">${t('mobile')}<input class="in" name="phone" type="tel" inputmode="tel" placeholder="01XXXXXXXXX" value="${S.user?.phone || ''}" required></label></div><button class="btn">${t('track_btn')}</button></form><div id="trk" style="margin-top:20px"></div></div>`);
}

/* ---------- auth + account ---------- */
function pageLogin(m, q) {
  const next = new URLSearchParams(q).get('next') || '';
  if (S.user) return nav(next || '/account', true);
  V(html`<div class="auth"><div class="formbox"><h1 style="font-size:1.8rem">${t('login')}</h1><div id="aerr"></div>
    <form data-form="login" data-next="${next}"><label class="f">${t('mobile_or_email')}<input class="in" name="identifier" autocomplete="username" required></label>
    <label class="f">${t('password')}<input class="in" type="password" name="password" autocomplete="current-password" required></label><button class="btn block">${t('login')}</button></form>
    <p class="small" style="margin-top:14px"><a class="link" href="/forgot">${t('forgot')}</a></p><p class="small">${t('no_acct')} <a class="link" href="/register${next ? '?next=' + encodeURIComponent(next) : ''}">${t('create_acct')}</a></p></div></div>`);
}
function pageRegister(m, q) {
  const next = new URLSearchParams(q).get('next') || '';
  if (S.user) return nav('/account', true);
  V(html`<div class="auth"><div class="formbox"><h1 style="font-size:1.8rem">${t('create_acct')}</h1><div id="aerr"></div>
    <form data-form="register" data-next="${next}"><label class="f">${t('full_name')}<input class="in" name="name" autocomplete="name" required></label>
    <label class="f">${t('mobile')}<input class="in" name="phone" type="tel" inputmode="tel" placeholder="01XXXXXXXXX" required></label>
    <label class="f">${t('email')} <span class="opt">${t('optional')}</span><input class="in" type="email" name="email" autocomplete="email"></label>
    <label class="f">${t('password')} <span class="opt">(${t('pw_hint')})</span><input class="in" type="password" name="password" minlength="8" autocomplete="new-password" required></label><button class="btn block">${t('create_acct')}</button></form>
    <p class="small" style="margin-top:14px">${t('have_acct')} <a class="link" href="/login">${t('login')}</a></p></div></div>`);
}
function pageForgot() {
  V(html`<div class="auth"><div class="formbox"><h1 style="font-size:1.8rem">${t('forgot')}</h1><div id="aerr"></div><form data-form="forgot"><label class="f">${t('mobile_or_email')}<input class="in" name="identifier" required></label><button class="btn block">${t('send_reset')}</button></form><div id="fres"></div></div></div>`);
}
function pageReset(m, q) {
  const token = new URLSearchParams(q).get('token') || '';
  V(html`<div class="auth"><div class="formbox"><h1 style="font-size:1.8rem">${t('new_pw')}</h1><div id="aerr"></div><form data-form="reset" data-token="${token}"><label class="f">${t('new_pw')} <span class="opt">(${t('pw_hint')})</span><input class="in" type="password" name="password" minlength="8" autocomplete="new-password" required></label><button class="btn block">${t('save')}</button></form></div></div>`);
}
const ACC = ['orders', 'profile', 'addresses', 'wishlist', 'password'];
async function pageAccount(m) {
  if (!S.user) return nav('/login?next=' + encodeURIComponent(location.pathname), true);
  if (S.user.role !== 'customer') { /* staff may still browse the account area */ }
  const tab = m[1] || 'orders';
  if (!ACC.includes(tab)) return notFound();
  const side = html`<nav class="side" aria-label="${t('account')}">${ACC.map((k) => html`<a href="/account/${k}" class="${tab === k ? 'on' : ''}">${t(k === 'orders' ? 'my_orders' : k === 'profile' ? 'profile' : k === 'addresses' ? 'addresses' : k === 'wishlist' ? 'wishlist' : 'change_pw')}</a>`)}<a href="/track">${t('track')}</a><button data-act="logout">${t('logout')}</button></nav>`;
  let content = '';
  if (tab === 'orders') {
    mount(main, html`<div class="wrap">${skeleton(1)}</div>`);
    const os = await api('/api/me/orders');
    content = html`<h2>${t('my_orders')}</h2>${os.length ? os.map((o) => orderCard(o, true, true)) : html`<p class="muted">${t('no_orders')}</p>`}`;
  } else if (tab === 'profile') {
    content = html`<h2>${t('profile')}</h2><form class="formbox" data-form="profile"><p>${t('welcome')}, <b>${S.user.name}</b> · ${S.user.phone || ''}</p><label class="f">${t('full_name')}<input class="in" name="name" value="${S.user.name}" required></label><label class="f">${t('email')}<input class="in" type="email" name="email" value="${S.user.email || ''}"></label><button class="btn">${t('save')}</button></form>`;
  } else if (tab === 'addresses') {
    const a = await api('/api/me/addresses');
    content = html`<h2>${t('addresses')}</h2>${a.map((x) => html`<div class="obox"><header><b>${x.label || x.name}</b><button class="link small" data-act="del-addr" data-id="${x.id}">${t('delete')}</button></header><div class="small">${x.name}, ${x.phone}<br>${x.address}, ${x.upazila ? x.upazila + ', ' : ''}${x.district}</div></div>`)}
      <form class="formbox" data-form="addr"><h3>${t('add_addr')}</h3><div class="row2"><label class="f">${t('label')}<input class="in" name="label" maxlength="40"></label><label class="f">${t('full_name')}<input class="in" name="name" value="${S.user.name}" required></label></div>
      <div class="row2"><label class="f">${t('mobile')}<input class="in" name="phone" value="${S.user.phone || ''}" required></label><label class="f">${t('district')}<select class="in" name="district" id="f-district" required><option value="">${t('select')}</option>${Object.keys(S.config.districts).map((d) => html`<option>${d}</option>`)}</select></label></div>
      <label class="f">${t('address')}<textarea class="in" name="address" required></textarea></label><div class="row2"><label class="f" id="upz">${upazilaField('')}</label><label class="f">${t('post_code')}<input class="in" name="post_code" maxlength="4"></label></div><button class="btn">${t('save')}</button></form>`;
  } else if (tab === 'wishlist') {
    return wishlistInto(side);
  } else {
    content = html`<h2>${t('change_pw')}</h2><form class="formbox" data-form="password" style="max-width:460px"><label class="f">${t('current_pw')}<input class="in" type="password" name="current" autocomplete="current-password" required></label><label class="f">${t('new_pw')}<input class="in" type="password" name="password" minlength="8" autocomplete="new-password" required></label><button class="btn">${t('save')}</button></form>`;
  }
  V(html`<div class="wrap"><div class="acct">${side}<div>${content}</div></div></div>`);
}
async function wishlistInto(side) {
  const ids = [...S.wish];
  const r = ids.length ? await api('/api/products/by-ids', { method: 'POST', body: { ids } }) : { items: [] };
  const body = r.items.length ? html`<div class="grid">${r.items.map(card)}</div>` : html`<div class="empty"><h3>${t('wish_empty')}</h3><a class="btn" href="/shop">${t('shop_now')}</a></div>`;
  if (side) V(html`<div class="wrap"><div class="acct">${side}<div><h2>${t('wishlist')}</h2>${body}</div></div></div>`);
  else V(html`<div class="wrap"><div class="page-title"><h1>${t('wishlist')}</h1></div>${body}<div style="height:50px"></div></div>`);
}
const notFound = () => V(html`<div class="wrap"><div class="empty"><h2>404</h2><h3>${t('not_found')}</h3><a class="btn" href="/">${t('home')}</a></div></div>`);

/* ===================== router ===================== */
const ROUTES = [
  [/^\/$/, pageHome], [/^\/shop$/, pageShop], [/^\/c\/([^/]+)$/, pageShop], [/^\/p\/([^/]+)$/, pagePDP],
  [/^\/cart$/, pageCart], [/^\/checkout$/, pageCheckout], [/^\/order\/([^/]+)$/, pageConfirm], [/^\/track$/, pageTrack],
  [/^\/login$/, pageLogin], [/^\/register$/, pageRegister], [/^\/forgot$/, pageForgot], [/^\/reset$/, pageReset],
  [/^\/account(?:\/([a-z]+))?$/, pageAccount], [/^\/wishlist$/, () => wishlistInto(null)],
];
function nav(href, replace) { history[replace ? 'replaceState' : 'pushState']({}, '', href); return render(); }
async function render() {
  const path = location.pathname;
  const adm = $('#adm');
  if (path.startsWith('/admin')) {
    hdrEl.classList.add('hide'); main.classList.add('hide'); ftrEl.classList.add('hide'); adm.classList.remove('hide');
    const mod = await import('/admin.js');
    return mod.renderAdmin(adm, { nav });
  }
  adm.classList.add('hide'); hdrEl.classList.remove('hide'); main.classList.remove('hide'); ftrEl.classList.remove('hide');
  if (!hdrEl.firstChild) { renderHeader(); renderFooter(); } else { renderHeader(); }
  document.title = `${isBn() ? S.config.settings.store_name_bn : S.config.settings.store_name_en} — ${isBn() ? 'প্রিমিয়াম লুঙ্গি' : 'Premium Lungi'}`;
  const sg = $('#sug'); if (sg) sg.classList.add('hide');
  for (const [re, fn] of ROUTES) {
    const m = re.exec(path);
    if (m) { try { await fn(m, location.search); } catch (e) { console.error(e); mount(main, html`<div class="wrap"><div class="empty"><h3>${esc(e.message)}</h3><button class="btn" data-act="reload">↻</button></div></div>`); } return; }
  }
  notFound();
}

/* ===================== events ===================== */
const field = (form, n) => form.elements[n];
function fieldErr(form, name, msg) {
  const el = field(form, name); if (!el) return;
  el.classList.add('err'); const e = document.createElement('span'); e.className = 'ferr'; e.textContent = msg; el.insertAdjacentElement('afterend', e);
}
const clearErrs = (form) => { $$('.ferr', form).forEach((e) => e.remove()); $$('.err', form).forEach((e) => e.classList.remove('err')); };
const errBox = (sel, msg) => { const el = $(sel); if (el) el.innerHTML = msg ? html`<div class="alert err" role="alert">${msg}</div>`.s : ''; };
const busy = (btn, on) => { if (!btn) return; btn.disabled = on; };

document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[href]');
  if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !a.target && !a.hasAttribute('data-a') && !a.hasAttribute('download') && !(a.getAttribute('href') || '').startsWith('#') && a.origin === location.origin && !/^\/(api|img|uploads)\//.test(a.pathname)) {
    e.preventDefault(); return nav(a.pathname + a.search);
  }
  const el = e.target.closest('[data-act]'); if (!el) { if (!e.target.closest('.search')) $$('.suggest').forEach((s) => s.classList.add('hide')); return; }
  const act = el.dataset.act, id = +el.dataset.id, v = el.dataset.v;
  try {
    switch (act) {
      case 'nav': return nav(el.dataset.href);
      case 'reload': return render();
      case 'lang': S.lang = v; store.set('lang', v); document.documentElement.lang = v; renderHeader(); renderFooter(); return render();
      case 'wish': e.preventDefault(); return toggleWish(id);
      case 'quick-add': { const p = PCACHE.get(id); if (p) { addToCart(p, 0, 1); toast(t('added')); } return; }
      case 'filters': return $('#filters').classList.toggle('open');
      case 'thumb': PD.im = +v; return renderPDP();
      case 'color': PD.ci = +v; return renderPDP();
      case 'tab': PD.tab = v; return renderPDP();
      case 'rate': PD.rating = +v; return renderPDP();
      case 'zoom': return $('#galmain').classList.toggle('zoom');
      case 'pqty': { const max = Math.min(PD.p.stock, 20); PD.qty = Math.max(1, Math.min(max || 1, PD.qty + +v)); $('#pqty').value = PD.qty; return; }
      case 'pd-add': addToCart(PD.p, PD.ci, PD.qty); return toast(t('added'));
      case 'pd-buy': addToCart(PD.p, PD.ci, PD.qty); return nav('/checkout');
      case 'cqty': { const it = S.cart.find((i) => i.id === id && i.color === el.dataset.color); if (it) { it.qty = Math.max(1, Math.min(20, it.qty + +v)); saveCart(); } return pageCart(); }
      case 'cremove': S.cart = S.cart.filter((i) => !(i.id === id && i.color === el.dataset.color)); saveCart(); return pageCart();
      case 'logout': await api('/api/auth/logout', { method: 'POST' }); S.user = null; await loadWish(); renderHeader(); return nav('/');
      case 'cancel-order': if (confirm(t('cancel_confirm'))) { await api(`/api/me/orders/${encodeURIComponent(el.dataset.no)}/cancel`, { method: 'POST' }); return render(); } return;
      case 'del-addr': await api('/api/me/addresses/' + id, { method: 'DELETE' }); return render();
    }
  } catch (err) { toast(err.message, 'err'); }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('[data-filter]')) {
    const k = el.dataset.filter;
    if (k === 'fabric') return nav(window.__shopSet('fabric', $$('[data-filter=fabric]:checked').map((x) => x.value).join(',')));
    if (k === 'instock') return nav(window.__shopSet('instock', el.checked ? '1' : ''));
    return nav(window.__shopSet(k, el.value));
  }
  if (el.id === 'f-district') {
    CK.district = el.value; const u = $('#upz'); if (u) u.innerHTML = upazilaField(el.value).s;
    if (location.pathname === '/checkout') refreshCheckoutQuote().catch((x) => toast(x.message, 'err'));
  }
  if (el.name === 'payment_method') onPayChange();
  if (el.id === 'saved-addr' && el.value) {
    api('/api/me/addresses').then((list) => {
      const a = list.find((x) => x.id === +el.value); if (!a) return; const f = el.form;
      f.elements.name.value = a.name; f.elements.phone.value = a.phone; f.elements.address.value = a.address; f.elements.post_code.value = a.post_code || '';
      f.elements.district.value = a.district; CK.district = a.district; $('#upz').innerHTML = upazilaField(a.district, a.upazila).s; refreshCheckoutQuote();
    });
  }
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'pqty') { const n = parseInt(toAscii(el.value)); if (n > 0) PD.qty = Math.min(n, Math.min(PD.p.stock, 20) || 1); }
  if (el.name === 'q' && el.closest('.search')) suggest(el);
});
let sugT;
function suggest(input) {
  clearTimeout(sugT);
  const box = input.closest('.search').querySelector('.suggest'); if (!box) return;
  const q = input.value.trim(); if (!q) return box.classList.add('hide');
  sugT = setTimeout(async () => {
    try {
      const r = await api('/api/products/suggest?q=' + encodeURIComponent(q));
      if (input.value.trim() !== q) return;
      box.innerHTML = r.items.length ? r.items.map((p) => `<a href="/p/${esc(p.slug)}"><img src="${esc(p.image)}" alt=""><span>${esc(isBn() ? p.name_bn : p.name_en)}<br><b>${money(p.price)}</b></span></a>`).join('') : `<div style="padding:12px" class="muted">${t('no_results')}</div>`;
      box.classList.remove('hide');
    } catch {}
  }, 180);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.suggest').forEach((s) => s.classList.add('hide')); });

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]'); if (!form) return;
  e.preventDefault(); const kind = form.dataset.form, btn = form.querySelector('button:not([type=button])'), fd = Object.fromEntries(new FormData(form));
  clearErrs(form);
  try {
    if (kind === 'search') { const q = (fd.q || '').trim(); return nav(q ? '/shop?q=' + encodeURIComponent(q) : '/shop'); }
    if (kind === 'newsletter') { busy(btn, true); await api('/api/newsletter', { method: 'POST', body: { email: fd.email } }); form.reset(); toast(t('subscribed')); busy(btn, false); return; }
    if (kind === 'coupon') { S.coupon = (fd.code || '').trim().toUpperCase(); store.set('coupon', S.coupon); return pageCart(); }
    if (kind === 'track') {
      busy(btn, true); const out = $('#trk');
      try { const o = await api('/api/track', { method: 'POST', body: { order_no: fd.order_no, phone: fd.phone } }); out.innerHTML = orderCard(o, true).s; }
      catch (er) { out.innerHTML = html`<div class="alert err">${er.message}</div>`.s; }
      return busy(btn, false);
    }
    if (kind === 'review') { await api(`/api/products/${PD.p.slug}/reviews`, { method: 'POST', body: { rating: PD.rating, body: fd.body } }); toast(t('thanks_review')); PD.p = await api('/api/products/' + PD.p.slug); return renderPDP(); }
    if (kind === 'checkout') return placeOrder(form, fd, btn);
    if (kind === 'login' || kind === 'register') {
      busy(btn, true);
      if (kind === 'register' && !phoneOk(fd.phone)) { busy(btn, false); return fieldErr(form, 'phone', t('err_phone')); }
      try {
        const r = await api('/api/auth/' + kind, { method: 'POST', body: fd });
        S.user = r.user; const local = store.get('wish', []);
        for (const id of local) await api(`/api/me/wishlist/${id}`, { method: 'PUT' }).catch(() => {}); store.del('wish');
        await loadWish(); renderHeader(); const next = form.dataset.next;
        return nav(next && next.startsWith('/') && !next.startsWith('//') ? next : '/account', true);
      } catch (er) { errBox('#aerr', er.message); return busy(btn, false); }
    }
    if (kind === 'forgot') {
      const r = await api('/api/auth/forgot', { method: 'POST', body: fd });
      $('#fres').innerHTML = html`<div class="alert info" style="margin-top:14px">${t('reset_note')}</div>${r.dev_token ? html`<div class="alert ok">DEV ONLY: <a class="link" href="/reset?token=${r.dev_token}">reset link</a></div>` : ''}`.s; return;
    }
    if (kind === 'reset') { try { await api('/api/auth/reset', { method: 'POST', body: { token: form.dataset.token, password: fd.password } }); toast(t('pw_changed')); return nav('/login'); } catch (er) { return errBox('#aerr', er.message); } }
    if (kind === 'profile') { const r = await api('/api/me', { method: 'PUT', body: fd }); S.user = r.user; toast(t('saved')); return renderHeader(); }
    if (kind === 'password') { await api('/api/me/password', { method: 'POST', body: fd }); form.reset(); return toast(t('saved')); }
    if (kind === 'addr') { if (!phoneOk(fd.phone)) return fieldErr(form, 'phone', t('err_phone')); await api('/api/me/addresses', { method: 'POST', body: fd }); toast(t('saved')); return render(); }
  } catch (err) { busy(btn, false); toast(err.message, 'err'); }
});

async function placeOrder(form, fd, btn) {
  let bad = null; const need = (n, ok, msg) => { if (!ok) { fieldErr(form, n, msg); bad = bad || n; } };
  need('name', (fd.name || '').trim().length >= 2, t('err_req'));
  const ph = phoneOk(fd.phone); need('phone', !!ph, t('err_phone'));
  if (fd.alt_phone) need('alt_phone', !!phoneOk(fd.alt_phone), t('err_phone'));
  need('address', (fd.address || '').trim().length >= 8, t('err_req'));
  need('district', !!fd.district, t('err_req'));
  const pm = S.config.payments[fd.payment_method];
  if (pm?.mode === 'manual') need('payment_ref', /^[A-Za-z0-9]{6,30}$/.test((fd.payment_ref || '').trim()), t('err_req'));
  if (bad) { field(form, bad).focus(); return; }
  busy(btn, true); btn.textContent = t('placing'); errBox('#ckerr', '');
  try {
    const r = await api('/api/orders', { method: 'POST', body: { items: S.cart.map((i) => ({ id: i.id, qty: i.qty, color: i.color })), coupon: S.coupon || '', payment_method: fd.payment_method, payment_ref: fd.payment_ref, note: fd.note,
      customer: { name: fd.name, phone: fd.phone, alt_phone: fd.alt_phone, address: fd.address, district: fd.district, upazila: fd.upazila, post_code: fd.post_code } } });
    store.set('lastOrder', { no: r.order_no, phone: ph });
    S.cart = []; S.coupon = ''; store.set('coupon', ''); saveCart();
    if (r.redirect_url) { location.href = r.redirect_url; return; }
    return nav('/order/' + r.order_no, true);
  } catch (er) {
    errBox('#ckerr', er.message); btn.textContent = t('place_order'); busy(btn, false);
    if (er.status === 409) setTimeout(() => nav('/cart'), 2500);
  }
}

/* ===================== boot ===================== */
async function boot() {
  const app = $('#app');
  app.innerHTML = '<div id="hdr"></div><main id="main" tabindex="-1"></main><div id="ftr"></div><div id="adm" class="hide"></div>';
  hdrEl = $('#hdr'); main = $('#main'); ftrEl = $('#ftr');
  try { S.config = await api('/api/config'); } catch (e) { main.innerHTML = `<div class="wrap"><div class="empty"><h3>${esc(e.message)}</h3></div></div>`; return; }
  S.user = S.config.user; await loadWish();
  window.addEventListener('popstate', render);
  render();
}
boot();
