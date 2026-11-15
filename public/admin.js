import { S, html, raw, esc, mount, api, toast, store, I, Logo } from './lib.js';

/* Admin panel (English UI). All data and permissions are enforced by /api/admin/* on the server;
   hiding a menu item here is only a convenience. */
const n0 = (x) => Number(x || 0).toLocaleString('en-IN');
const tk = (x) => '৳' + n0(x);
const dt = (s) => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RANK = { staff: 1, manager: 2, admin: 3 };
const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
const PAYST = ['unpaid', 'awaiting_verification', 'paid', 'failed', 'refunded'];
const label = (s) => String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const pill = (s) => html`<span class="pill ${s}">${label(s)}</span>`;
const NAV = [
  ['', 'Dashboard', 'staff', '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'],
  ['orders', 'Orders', 'staff', '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6"/>'],
  ['products', 'Products', 'staff', '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'],
  ['categories', 'Categories', 'manager', '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>'],
  ['customers', 'Customers', 'staff', '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5"/>'],
  ['marketing', 'Marketing', 'manager', '<path d="M3 11v3a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2zM16 8a5 5 0 0 1 0 8"/>'],
  ['coupons', 'Coupons', 'staff', '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M13 6v12" stroke-dasharray="2 2"/>'],
  ['reports', 'Reports', 'manager', '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'],
  ['reviews', 'Reviews', 'manager', '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'],
  ['settings', 'Settings', 'manager', '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.5a7 7 0 0 0-2 1.2l-2.3-.9-2 3.5 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.5 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.5a7 7 0 0 0 2-1.2l2.3.9 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"/>'],
  ['staff', 'Staff & roles', 'admin', '<path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z"/>'],
];
const svg = (d) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);

let root, navFn, bound = false;

/* ---------- modal + generic form ---------- */
function modal(node, wide) {
  closeModal();
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'amodal';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="modal-x" data-a="close" aria-label="Close">×</button>${node.s}</div>`;
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg); return bg;
}
const closeModal = () => $('#amodal')?.remove();
function fieldHTML(f, v) {
  const val = v?.[f.n] ?? f.def ?? '';
  const common = `name="${esc(f.n)}" ${f.req ? 'required' : ''}`;
  let inp;
  if (f.t === 'select') inp = html`<select class="in" ${raw(common)}>${f.opts.map(([k, l]) => html`<option value="${k}" ${String(k) === String(val) ? 'selected' : ''}>${l}</option>`)}</select>`;
  else if (f.t === 'textarea') inp = html`<textarea class="in" ${raw(common)} rows="${f.rows || 3}">${val}</textarea>`;
  else if (f.t === 'checkbox') return html`<label class="chk ${f.full ? 'full' : ''}" style="margin:6px 0 14px"><input type="checkbox" name="${f.n}" ${val ? 'checked' : ''}> ${f.l}</label>`;
  else inp = html`<input class="in" type="${f.t || 'text'}" ${raw(common)} value="${f.t === 'password' ? '' : val}" ${f.min != null ? raw(`min="${f.min}"`) : ''} ${f.max != null ? raw(`max="${f.max}"`) : ''} ${f.ph ? raw(`placeholder="${esc(f.ph)}"`) : ''} ${f.t === 'password' ? 'autocomplete="new-password"' : ''}>`;
  return html`<label class="f ${f.full ? 'full' : ''}">${f.l}${f.help ? html` <span class="opt">${f.help}</span>` : ''}${inp}</label>`;
}
const readForm = (form, fields) => {
  const o = {};
  for (const f of fields) { const el = form.elements[f.n]; if (!el) continue; o[f.n] = f.t === 'checkbox' ? el.checked : f.t === 'number' && el.value !== '' ? Number(el.value) : el.value; }
  return o;
};
function formModal({ title, fields, values, submit, cta = 'Save', note }) {
  const bg = modal(html`<h2>${title}</h2>${note ? html`<p class="muted small">${note}</p>` : ''}<div id="merr"></div><form id="mform"><div class="fgrid">${fields.map((f) => fieldHTML(f, values))}</div><button class="btn" style="margin-top:8px">${cta}</button></form>`);
  $('#mform', bg).addEventListener('submit', async (e) => {
    e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
    try { await submit(readForm(e.target, fields)); closeModal(); } catch (er) { $('#merr', bg).innerHTML = `<div class="alert err">${esc(er.message)}</div>`; b.disabled = false; }
  });
}
const confirmDo = (msg, fn) => { if (confirm(msg)) fn().catch((e) => toast(e.message, 'err')); };
const table = (heads, rows, empty = 'Nothing here yet.') => html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${heads.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${rows.length ? rows : html`<tr><td colspan="${heads.length}" class="muted" style="text-align:center;padding:30px">${empty}</td></tr>`}</tbody></table></div>`;
const head = (title, right = '') => html`<div class="adm-top"><div style="display:flex;gap:10px;align-items:center"><button class="btn sm ghost adm-burger" data-a="burger" aria-label="Menu">☰</button><h1>${title}</h1></div><div style="display:flex;gap:8px;align-items:center">${right}</div></div>`;

/* ---------- shell ---------- */
export async function renderAdmin(el, { nav }) {
  root = el; navFn = nav;
  if (!bound) { bind(); bound = true; }
  if (!document.getElementById('print-root')) { const d = document.createElement('div'); d.id = 'print-root'; document.body.appendChild(d); }
  document.title = 'Admin — Tantu Lungi';
  const u = S.user;
  if (!u || !RANK[u.role]) return loginView(u);
  const parts = location.pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
  const sec = parts[0] || '';
  const item = NAV.find((x) => x[0] === sec);
  if (!item) return navFn('/admin', true);
  if (RANK[u.role] < RANK[item[2]]) { mount(root, shell(u, sec, html`${head('Not allowed')}<div class="alert err">Your role (${u.role}) cannot access this section.</div>`)); return; }
  mount(root, shell(u, sec, html`<div id="acontent">${head(item[1])}<p class="muted">Loading…</p></div>`));
  try { await VIEWS[sec || 'dashboard'](); } catch (e) { $('#acontent').innerHTML = `<div class="alert err">${esc(e.message)}</div>`; if (e.status === 401) { S.user = null; navFn('/admin', true); } }
  refreshBell();
}
function shell(u, sec, body) {
  return html`<div class="adm"><aside class="adm-side" id="aside"><div class="logo" style="padding:6px 8px 18px">${Logo()}<span><b>Tantu Lungi</b><small>Admin</small></span></div>
    ${NAV.filter((x) => RANK[u.role] >= RANK[x[2]]).map(([k, l, , ic]) => html`<a href="/admin${k ? '/' + k : ''}" class="${k === sec ? 'on' : ''}">${svg(ic)}${l}</a>`)}
    <div style="margin-top:24px;padding:12px;border-top:1px solid rgba(255,255,255,.12);font-size:.8rem"><div>${u.name}</div><span class="perm">${u.role}</span><br><a href="/" style="padding:8px 0">← View store</a><a href="#" data-a="logout" style="padding:0">Log out</a></div></aside>
    <main class="adm-main">${body}</main></div>`;
}
function loginView(u) {
  mount(root, html`<div class="adm-login"><div class="formbox"><div style="text-align:center;margin-bottom:14px">${Logo('')}<h1 style="font-size:1.4rem;margin-top:10px">Admin sign in</h1></div>
    ${u ? html`<div class="alert err">This account does not have admin access.</div>` : ''}<div id="aerr"></div>
    <form id="alogin"><label class="f">Email<input class="in" name="identifier" autocomplete="username" required></label><label class="f">Password<input class="in" type="password" name="password" autocomplete="current-password" required></label><button class="btn block">Sign in</button></form></div></div>`);
  $('#alogin').addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
    try { const r = await api('/api/auth/login', { method: 'POST', body: fd }); S.user = r.user; if (!RANK[r.user.role]) { await api('/api/auth/logout', { method: 'POST' }); S.user = null; $('#aerr').innerHTML = '<div class="alert err">This account does not have admin access.</div>'; return; } renderAdmin(root, { nav: navFn }); }
    catch (er) { $('#aerr').innerHTML = `<div class="alert err">${esc(er.message)}</div>`; }
  });
}
async function refreshBell() {
  try {
    const r = await api('/api/admin/notifications'); const top = $('.adm-top > div:last-child'); if (!top) return;
    const b = document.createElement('button'); b.className = 'btn sm ghost'; b.dataset.a = 'bell'; b.textContent = `🔔 ${r.unread}`; b.title = 'Notifications'; top.prepend(b);
    window.__notifs = r.items;
  } catch {}
}

/* ---------- events (delegated; data-a attribute) ---------- */
function bind() {
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-a]'); if (!el || !root || root.classList.contains('hide')) return;
    if (!el.matches('input,select')) e.preventDefault(); const a = el.dataset.a, d = el.dataset;
    try {
      if (a === 'close') return closeModal();
      if (a === 'burger') return $('#aside').classList.toggle('open');
      if (a === 'logout') { await api('/api/auth/logout', { method: 'POST' }); S.user = null; return navFn('/admin', true); }
      if (a === 'bell') return showNotifs();
      if (a === 'order') return orderModal(d.no);
      if (a === 'ostatus') { await api(`/api/admin/orders/${d.no}/status`, { method: 'PUT', body: { status: d.status } }); toast('Order updated'); await orderModal(d.no); return reloadList(); }
      if (a === 'ostatus-form') { const f = $('#ostatus'); await api(`/api/admin/orders/${d.no}/status`, { method: 'PUT', body: { status: f.status.value, note: f.note.value } }); toast('Status updated'); await orderModal(d.no); return reloadList(); }
      if (a === 'opay') { await api(`/api/admin/orders/${d.no}/payment`, { method: 'PUT', body: { payment_status: d.v } }); toast('Payment status updated'); await orderModal(d.no); return reloadList(); }
      if (a === 'invoice') return printInvoice(d.no);
      if (a === 'page') { LIST.page = +d.v; return reloadList(); }
      if (a === 'pedit') return productModal(d.id ? +d.id : null);
      if (a === 'pdel') return confirmDo('Delete this product permanently? Past orders keep their line items.', async () => { await api('/api/admin/products/' + d.id, { method: 'DELETE' }); toast('Deleted'); reloadList(); });
      if (a === 'pstock') { const v = $(`input[data-stock="${d.id}"]`).value; await api(`/api/admin/products/${d.id}/stock`, { method: 'PATCH', body: { stock: Number(v) } }); return toast('Stock updated'); }
      if (a === 'pflag') { const tr = el.closest('tr'); await api(`/api/admin/products/${d.id}/flags`, { method: 'PATCH', body: { featured: $('[data-f=featured]', tr)?.checked, is_new: $('[data-f=new]', tr)?.checked } }); return toast('Saved'); }
      if (a === 'addcolor') return addColorRow();
      if (a === 'rmcolor') return el.closest('.crow').remove();
      if (a === 'rmimg') { PF.images.splice(+d.i, 1); return drawImgs(); }
      if (a === 'cat') return catModal(d.id ? CATS.find((c) => c.id === +d.id) : null);
      if (a === 'catdel') return confirmDo('Delete this category?', async () => { await api('/api/admin/categories/' + d.id, { method: 'DELETE' }); toast('Deleted'); VIEWS.categories(); });
      if (a === 'cust') return custModal(+d.id);
      if (a === 'custactive') { await api(`/api/admin/customers/${d.id}/active`, { method: 'PUT', body: { active: d.v === '1' } }); toast('Updated'); return custModal(+d.id); }
      if (a === 'custpw') return formModal({ title: 'Set temporary password', fields: [{ n: 'password', l: 'New password', t: 'password', req: true, help: '(min 8 characters)' }], note: 'The customer is logged out everywhere. Tell them the password through a channel you trust, and ask them to change it.', submit: async (v) => { await api(`/api/admin/customers/${d.id}/password`, { method: 'POST', body: v }); toast('Password set'); } });
      if (a === 'coupon') return couponModal(d.id ? COUPONS.find((c) => c.id === +d.id) : null);
      if (a === 'coupondel') return confirmDo('Delete this coupon?', async () => { await api('/api/admin/coupons/' + d.id, { method: 'DELETE' }); toast('Deleted'); VIEWS.coupons(); });
      if (a === 'banner') return bannerModal(d.id ? BANNERS.find((c) => c.id === +d.id) : null);
      if (a === 'bannerdel') return confirmDo('Delete this banner?', async () => { await api('/api/admin/banners/' + d.id, { method: 'DELETE' }); toast('Deleted'); VIEWS.marketing(); });
      if (a === 'rvdel') return confirmDo('Delete this review?', async () => { await api('/api/admin/reviews/' + d.id, { method: 'DELETE' }); VIEWS.reviews(); });
      if (a === 'rtype') { REP.type = d.v; return VIEWS.reports(); }
      if (a === 'staffnew') return formModal({ title: 'Add staff account', fields: [{ n: 'name', l: 'Name', req: true }, { n: 'email', l: 'Email', t: 'email', req: true }, { n: 'password', l: 'Password', t: 'password', req: true, help: '(min 8)' }, { n: 'role', l: 'Role', t: 'select', opts: [['staff', 'Staff — orders & customers'], ['manager', 'Manager — + products, marketing, reports'], ['admin', 'Admin — everything']] }], submit: async (v) => { await api('/api/admin/staff', { method: 'POST', body: v }); toast('Added'); VIEWS.staff(); } });
      if (a === 'staffsave') { const tr = el.closest('tr'); await api('/api/admin/staff/' + d.id, { method: 'PUT', body: { role: $('select', tr).value, active: $('input', tr).checked } }); return toast('Saved'); }
      if (a === 'notif-read') { await api('/api/admin/notifications/read', { method: 'POST' }); closeModal(); return refreshBellReset(); }
    } catch (er) { toast(er.message, 'err'); }
  });
}
const refreshBellReset = () => { $('[data-a=bell]')?.remove(); refreshBell(); };
function showNotifs() {
  const items = window.__notifs || [];
  modal(html`<h2>Notifications</h2><p class="muted small">In-app only. No email or SMS is sent by the system.</p>${items.length ? items.map((n) => html`<div class="obox" style="${n.read ? 'opacity:.6' : ''}"><div class="small muted">${dt(n.created_at)} · ${n.kind}</div>${n.ref && n.kind.startsWith('order') ? html`<a class="link" href="#" data-a="order" data-no="${n.ref}">${n.message}</a>` : n.message}</div>`) : html`<p class="muted">No notifications.</p>`}<button class="btn sm" data-a="notif-read">Mark all read</button>`);
}

/* ---------- list helper (orders / products) ---------- */
let LIST = { page: 1, fn: null };
const reloadList = () => (LIST.fn ? LIST.fn() : null);

/* ---------- views ---------- */
const VIEWS = {};
const set = (node) => { $('#acontent').innerHTML = node.s; };
VIEWS.dashboard = async () => {
  const s = await api('/api/admin/stats');
  const max = Math.max(1, ...s.last14.map((d) => d.sales));
  set(html`${head('Dashboard')}
  ${s.setup_missing.length ? html`<div class="alert info"><b>Finish setting up your store.</b> These are not filled in yet, so they are hidden from customers: ${s.setup_missing.join(', ')}. <a class="link" href="/admin/settings">Open Settings</a></div>` : ''}
  <div class="stats">
    <div class="stat"><small>Total sales</small><b>${tk(s.total_sales)}</b></div><div class="stat"><small>Total orders</small><b>${n0(s.total_orders)}</b></div>
    <div class="stat"><small>Customers</small><b>${n0(s.total_customers)}</b></div><div class="stat"><small>Products</small><b>${n0(s.total_products)}</b></div>
    <div class="stat warn"><small>Pending orders</small><b>${n0(s.pending_orders)}</b></div><div class="stat"><small>Delivered</small><b>${n0(s.completed_orders)}</b></div>
    <div class="stat ${s.low_stock.length ? 'bad' : ''}"><small>Low-stock products</small><b>${n0(s.low_stock.length)}</b></div>
    ${s.awaiting_payment_verification ? html`<div class="stat warn"><small>Payments to verify</small><b>${n0(s.awaiting_payment_verification)}</b></div>` : ''}</div>
  <div class="panel"><h3>Sales — last 14 days</h3><div class="bar">${s.last14.map((d) => html`<div title="${d.d}: ${tk(d.sales)} (${d.orders} orders)"><i style="height:${(d.sales / max) * 100}%"></i><span>${d.d.slice(5)}</span></div>`)}</div>${s.last14.length ? '' : html`<p class="muted">No sales in this period.</p>`}</div>
  <div class="fgrid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px">
  <div class="panel"><h3>Low-stock alerts</h3>${table(['Product', 'SKU', 'Stock'], s.low_stock.map((p) => html`<tr><td>${p.name_en}</td><td>${p.sku}</td><td><b style="color:${p.stock === 0 ? 'var(--bad)' : 'var(--warn)'}">${p.stock}</b> / ${p.low_stock_threshold}</td></tr>`), 'All products are well stocked.')}</div>
  <div class="panel"><h3>Recent orders</h3>${table(['Order', 'Customer', 'Total', 'Status'], s.recent.map((o) => html`<tr><td><a class="link" href="#" data-a="order" data-no="${o.order_no}">${o.order_no}</a></td><td>${o.name}</td><td>${tk(o.total)}</td><td>${pill(o.status)}</td></tr>`))}</div></div>`);
};

VIEWS.orders = async () => {
  LIST.fn = VIEWS.orders;
  const q = $('#oq')?.value || '', st = $('#ost')?.value || '', pay = $('#opay')?.value || '';
  const r = await api(`/api/admin/orders?page=${LIST.page}&q=${encodeURIComponent(q)}&status=${st}&payment=${pay}`);
  const first = !$('#oq');
  const tableHTML = html`${table(['Order ID', 'Date', 'Customer', 'District', 'Total', 'Payment', 'Status', ''], r.items.map((o) => html`<tr><td><b>${o.order_no}</b></td><td>${dt(o.created_at)}</td><td>${o.name}<br><span class="muted small">${o.phone}</span></td><td>${o.district}</td><td>${tk(o.total)}</td><td>${o.payment_method.toUpperCase()} ${pill(o.payment_status)}</td><td>${pill(o.status)}</td><td><button class="btn sm ghost" data-a="order" data-no="${o.order_no}">View</button></td></tr>`), 'No orders match.')}
    ${r.pages > 1 ? html`<div class="pager">${Array.from({ length: r.pages }, (_, i) => html`<button class="${i + 1 === r.page ? 'on' : ''}" data-a="page" data-v="${i + 1}">${i + 1}</button>`)}</div>` : ''}`;
  if (first) {
    set(html`${head('Orders', html`<a class="btn sm ghost" href="/api/admin/reports/export?type=orders">Export CSV</a>`)}<div class="fl"><input class="in" id="oq" placeholder="Search Order ID, phone or name" value="${q}"><select class="in" id="ost"><option value="">All statuses</option>${STATUSES.map((s) => html`<option value="${s}">${label(s)}</option>`)}</select><select class="in" id="opay"><option value="">All payments</option>${PAYST.map((s) => html`<option value="${s}">${label(s)}</option>`)}</select></div><div class="panel" id="otable">${tableHTML}</div>`);
    let tm; const go = () => { clearTimeout(tm); tm = setTimeout(() => { LIST.page = 1; VIEWS.orders(); }, 250); };
    $('#oq').addEventListener('input', go); $('#ost').addEventListener('change', go); $('#opay').addEventListener('change', go);
  } else $('#otable').innerHTML = tableHTML.s;
};
async function orderModal(no) {
  const o = await api('/api/admin/orders/' + encodeURIComponent(no));
  const closed = o.status === 'cancelled' || o.status === 'delivered';
  modal(html`<h2>${o.order_no} ${pill(o.status)}</h2><div class="small muted">${dt(o.created_at)}</div>
  <div class="fgrid" style="margin:14px 0"><div><b>Customer</b><br>${o.name}<br>${o.phone}${o.alt_phone ? html` / ${o.alt_phone}` : ''}<br>${o.address}<br>${o.upazila ? o.upazila + ', ' : ''}${o.district}${o.post_code ? ' ' + o.post_code : ''}${o.note ? html`<br><i class="muted">Note: ${o.note}</i>` : ''}</div>
  <div><b>Payment</b><br>${o.payment_method.toUpperCase()} · ${pill(o.payment_status)}${o.payment_ref ? html`<br>TrxID: <b>${o.payment_ref}</b>` : ''}
    ${o.payment_status === 'awaiting_verification' ? html`<p class="small" style="margin:8px 0">Check this TrxID and amount (${tk(o.total)}) in your ${o.payment_method} merchant account before marking paid.</p><button class="btn sm" data-a="opay" data-no="${o.order_no}" data-v="paid">Mark paid</button> <button class="btn sm danger" data-a="opay" data-no="${o.order_no}" data-v="failed">Mark failed</button>` : html`<div class="fl" style="margin-top:8px">${PAYST.filter((x) => x !== o.payment_status && x !== 'awaiting_verification').map((x) => html`<button class="btn sm ghost" data-a="opay" data-no="${o.order_no}" data-v="${x}">Mark ${label(x).toLowerCase()}</button>`)}</div>`}</div></div>
  ${table(['SKU', 'Item', 'Colour', 'Price', 'Qty', 'Total'], o.items.map((i) => html`<tr><td>${i.sku}</td><td>${i.name}</td><td>${i.color}</td><td>${tk(i.unit_price)}</td><td>${i.qty}</td><td>${tk(i.unit_price * i.qty)}</td></tr>`))}
  <div style="text-align:right;margin:10px 0">Subtotal ${tk(o.subtotal)} · Discount −${tk(o.discount)}${o.coupon_code ? ` (${esc(o.coupon_code)})` : ''} · Delivery ${tk(o.delivery_charge)}<br><b style="font-size:1.2rem">Total ${tk(o.total)}</b></div>
  ${closed ? '' : html`<form id="ostatus" class="fl"><select class="in" name="status">${STATUSES.map((s) => html`<option value="${s}" ${s === o.status ? 'selected' : ''}>${label(s)}</option>`)}</select><input class="in" name="note" placeholder="Note (optional)" style="flex:1"><button class="btn sm" data-a="ostatus-form" data-no="${o.order_no}">Update status</button></form>
    <div class="fl">${o.status === 'pending' ? html`<button class="btn sm gold" data-a="ostatus" data-no="${o.order_no}" data-status="confirmed">Confirm order</button>` : ''}<button class="btn sm danger" data-a="ostatus" data-no="${o.order_no}" data-status="cancelled">Cancel order (restocks items)</button></div>`}
  <button class="btn sm ghost" data-a="invoice" data-no="${o.order_no}">Print invoice</button>
  <h3 style="margin-top:18px">History</h3><ul class="events">${[...o.events].reverse().map((e) => html`<li><b>${label(e.status)}</b> <span class="muted small">${dt(e.created_at)}</span>${e.note ? html`<div class="small muted">${e.note}</div>` : ''}</li>`)}</ul>`, true);
}
async function printInvoice(no) {
  const o = await api('/api/admin/orders/' + encodeURIComponent(no)); const st = await api('/api/admin/settings').catch(() => ({}));
  $('#print-root').innerHTML = html`<div class="invoice" style="padding:24px;max-width:780px;margin:auto"><div style="display:flex;justify-content:space-between"><div><h1>${st.store_name_en || 'Tantu Lungi'}</h1><div>${st.contact_address_en || ''}<br>${st.contact_phone || ''} ${st.contact_email || ''}</div></div><div style="text-align:right"><h1>INVOICE</h1><b>${o.order_no}</b><br>${dt(o.created_at)}</div></div><hr>
    <p><b>Bill to</b><br>${o.name}<br>${o.phone}<br>${o.address}, ${o.upazila ? o.upazila + ', ' : ''}${o.district}</p>
    <table><thead><tr><th>SKU</th><th>Item</th><th>Colour</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${o.items.map((i) => html`<tr><td>${i.sku}</td><td>${i.name}</td><td>${i.color}</td><td>${i.qty}</td><td>${tk(i.unit_price)}</td><td>${tk(i.unit_price * i.qty)}</td></tr>`)}</tbody></table>
    <div style="text-align:right">Subtotal: ${tk(o.subtotal)}<br>Discount: −${tk(o.discount)}<br>Delivery: ${tk(o.delivery_charge)}<br><b style="font-size:1.2rem">Total: ${tk(o.total)}</b><br>Payment: ${o.payment_method.toUpperCase()} (${label(o.payment_status)})</div><p style="margin-top:30px;font-size:.85rem">Thank you for shopping with us.</p></div>`.s;
  setTimeout(() => window.print(), 100);
}

/* products */
let PF = { images: [] };
VIEWS.products = async () => {
  LIST.fn = VIEWS.products;
  const q = $('#pq')?.value || '';
  const r = await api('/api/admin/products?q=' + encodeURIComponent(q));
  const first = !$('#pq');
  const rows = table(['', 'Product', 'Category', 'Price', 'Stock', 'Featured / New', 'Status', ''], r.items.map((p) => html`<tr><td><img src="${p.images[0]}" alt=""></td><td><b>${p.name_en}</b><br><span class="muted small">${p.sku} · ${p.name_bn}</span></td><td>${p.category_name}</td>
    <td>${p.discount_pct ? html`<b>${tk(p.price)}</b> <s class="muted">${tk(p.regular_price)}</s>` : tk(p.regular_price)}</td>
    <td style="white-space:nowrap"><input class="in" type="number" min="0" style="width:80px;height:34px;margin:0;${p.stock <= p.low_stock_threshold ? 'border-color:var(--warn)' : ''}" value="${p.stock}" data-stock="${p.id}"> <button class="btn sm ghost" data-a="pstock" data-id="${p.id}">Save</button></td>
    <td style="white-space:nowrap"><label class="chk" style="display:inline-flex"><input type="checkbox" data-f="featured" ${p.featured ? 'checked' : ''} data-a="pflag" data-id="${p.id}"> Feat.</label> <label class="chk" style="display:inline-flex"><input type="checkbox" data-f="new" ${p.is_new ? 'checked' : ''} data-a="pflag" data-id="${p.id}"> New</label></td>
    <td>${p.active ? pill('paid').s.replace('Paid', 'Active') && raw('<span class="pill paid">Active</span>') : raw('<span class="pill cancelled">Hidden</span>')}</td>
    <td style="white-space:nowrap"><button class="btn sm ghost" data-a="pedit" data-id="${p.id}">Edit</button> <button class="btn sm danger" data-a="pdel" data-id="${p.id}">Delete</button></td></tr>`));
  if (first) {
    set(html`${head('Products', html`<button class="btn sm" data-a="pedit">+ Add product</button>`)}<div class="fl"><input class="in" id="pq" placeholder="Search name or SKU" value="${q}"></div><div class="panel" id="ptable">${rows}</div>`);
    let tm; $('#pq').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(VIEWS.products, 250); });
  } else $('#ptable').innerHTML = rows.s;
};
const FAB = [['cotton', 'Cotton'], ['premium_cotton', 'Premium Cotton'], ['half_silk', 'Half Silk'], ['pure_silk', 'Pure Silk']];
const DES = [['check', 'Check'], ['stripe', 'Stripe'], ['traditional', 'Traditional'], ['plain', 'Plain']];
function colorRow(c = {}) {
  return html`<div class="crow"><input class="in" style="margin:0" placeholder="Name (English)" data-c="name_en" value="${c.name_en || ''}"><input class="in" style="margin:0" placeholder="নাম (বাংলা)" data-c="name_bn" value="${c.name_bn || ''}"><input type="color" data-c="hex" value="${c.hex || '#24272D'}" title="Main colour"><input type="color" data-c="hex2" value="${c.hex2 || '#B98B3E'}" title="Accent colour"><button type="button" class="btn sm ghost" data-a="rmcolor" aria-label="Remove">×</button></div>`;
}
const addColorRow = () => $('#colors').insertAdjacentHTML('beforeend', colorRow().s);
function drawImgs() {
  $('#imgs').innerHTML = PF.images.map((u, i) => `<figure><img src="${esc(u)}" alt=""><button type="button" data-a="rmimg" data-i="${i}" aria-label="Remove image">×</button></figure>`).join('') || '<span class="muted small">No images — a woven-pattern illustration is generated from the colour & design until you upload photos.</span>';
}
async function productModal(id) {
  const [cats, p] = await Promise.all([api('/api/admin/categories'), id ? api('/api/admin/products/' + id) : null]);
  const v = p || { colors: [{ name_en: 'Navy', name_bn: 'নেভি', hex: '#16345F', hex2: '#B98B3E' }], fabric: 'cotton', design: 'check', stock: 20, low_stock_threshold: 10, length_cm: 220, width_cm: 110, active: true, collections: [] };
  PF = { images: (p?.images || []).filter((u) => !/^\/img\/p\//.test(u)) };
  const F = (n, l, t = 'text', extra = {}) => fieldHTML({ n, l, t, ...extra }, v);
  const bg = modal(html`<h2>${id ? 'Edit product' : 'Add product'}</h2><div id="merr"></div><form id="pform">
    <div class="fgrid">${F('sku', 'SKU / Product ID', 'text', { req: true })}${F('category_id', 'Category', 'select', { opts: cats.items.map((c) => [c.id, c.name_en]), req: true })}
    ${F('name_en', 'Name (English)', 'text', { req: true })}${F('name_bn', 'Name (বাংলা)', 'text', { req: true })}
    ${F('fabric', 'Fabric', 'select', { opts: FAB })}${F('design', 'Design', 'select', { opts: DES })}
    ${F('regular_price', 'Regular price (৳)', 'number', { req: true, min: 1 })}${F('sale_price', 'Discounted price (৳)', 'number', { help: '(leave empty for none)', min: 1 })}
    ${F('stock', 'Stock', 'number', { req: true, min: 0 })}${F('low_stock_threshold', 'Low-stock alert at', 'number', { min: 0 })}
    ${F('length_cm', 'Length (cm)', 'number')}${F('width_cm', 'Width (cm)', 'number')}
    ${F('desc_en', 'Description (English)', 'textarea', { full: true })}${F('desc_bn', 'Description (বাংলা)', 'textarea', { full: true })}</div>
    <h3>Colours</h3><div id="colors">${v.colors.map(colorRow)}</div><button type="button" class="btn sm ghost" data-a="addcolor">+ Add colour</button>
    <h3 style="margin-top:18px">Images</h3><div class="imgs" id="imgs"></div><label class="btn sm ghost" style="margin-top:10px;cursor:pointer">Upload images<input type="file" id="upl" accept="image/png,image/jpeg,image/webp" multiple hidden></label> <span class="small muted">PNG/JPEG/WebP, max 3 MB each</span>
    <h3 style="margin-top:18px">Visibility</h3><div style="display:flex;gap:18px;flex-wrap:wrap">
    <label class="chk"><input type="checkbox" name="featured" ${v.featured ? 'checked' : ''}> Featured</label><label class="chk"><input type="checkbox" name="is_new" ${v.is_new ? 'checked' : ''}> New arrival</label><label class="chk"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}> Visible in store</label>
    <label class="chk"><input type="checkbox" name="c_premium" ${v.collections?.includes('premium-collection') ? 'checked' : ''}> In Premium Collection</label><label class="chk"><input type="checkbox" name="c_budget" ${v.collections?.includes('budget-collection') ? 'checked' : ''}> In Budget Collection</label></div>
    <button class="btn" style="margin-top:18px">Save product</button></form>`, true);
  const f = $('#pform', bg); f.elements.category_id.value = v.category_id || cats.items[0]?.id; drawImgs();
  $('#upl', bg).addEventListener('change', async (e) => {
    for (const file of e.target.files) {
      try {
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        const r = await api('/api/admin/upload', { method: 'POST', body: { filename: file.name, data } }); PF.images.push(r.url);
      } catch (er) { toast(`${file.name}: ${er.message}`, 'err'); }
    }
    e.target.value = ''; drawImgs();
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const b = f.querySelector('button:not([type=button])'); b.disabled = true;
    const g = (n) => f.elements[n]; const body = { images: PF.images, colors: $$('.crow', f).map((r) => Object.fromEntries($$('[data-c]', r).map((i) => [i.dataset.c, i.value]))),
      collections: [g('c_premium').checked && 'premium-collection', g('c_budget').checked && 'budget-collection'].filter(Boolean) };
    for (const n of ['sku', 'category_id', 'name_en', 'name_bn', 'fabric', 'design', 'regular_price', 'sale_price', 'stock', 'low_stock_threshold', 'length_cm', 'width_cm', 'desc_en', 'desc_bn']) body[n] = g(n).value;
    for (const n of ['featured', 'is_new', 'active']) body[n] = g(n).checked;
    try { await api(id ? '/api/admin/products/' + id : '/api/admin/products', { method: id ? 'PUT' : 'POST', body }); toast('Product saved'); closeModal(); reloadList(); }
    catch (er) { $('#merr', bg).innerHTML = `<div class="alert err">${esc(er.message)}</div>`; b.disabled = false; bg.scrollTop = 0; $('.modal', bg).scrollTop = 0; }
  });
}

/* categories */
let CATS = [];
VIEWS.categories = async () => {
  CATS = (await api('/api/admin/categories')).items;
  set(html`${head('Categories', html`<button class="btn sm" data-a="cat">+ Add category</button>`)}<div class="panel">${table(['Name', 'বাংলা', 'Slug', 'Products', 'Order', ''], CATS.map((c) => html`<tr><td><b>${c.name_en}</b></td><td>${c.name_bn}</td><td>${c.slug}</td><td>${c.products}</td><td>${c.sort}</td><td><button class="btn sm ghost" data-a="cat" data-id="${c.id}">Edit</button> <button class="btn sm danger" data-a="catdel" data-id="${c.id}">Delete</button></td></tr>`))}</div>
  <p class="muted small">Premium Collection and Budget Collection are filled by ticking the collection boxes on each product.</p>`);
};
const catModal = (c) => formModal({ title: c ? 'Edit category' : 'Add category', values: c || { sort: 0 }, fields: [{ n: 'name_en', l: 'Name (English)', req: true }, { n: 'name_bn', l: 'Name (বাংলা)', req: true }, { n: 'slug', l: 'URL slug', help: '(letters, numbers, dashes)' }, { n: 'sort', l: 'Sort order', t: 'number' }, { n: 'desc_en', l: 'Description (English)', t: 'textarea', full: true }, { n: 'desc_bn', l: 'Description (বাংলা)', t: 'textarea', full: true }],
  submit: async (v) => { await api(c ? '/api/admin/categories/' + c.id : '/api/admin/categories', { method: c ? 'PUT' : 'POST', body: v }); toast('Saved'); VIEWS.categories(); } });

/* customers */
VIEWS.customers = async () => {
  const q = $('#cq')?.value || ''; const r = await api('/api/admin/customers?q=' + encodeURIComponent(q)); const first = !$('#cq');
  const tb = table(['Name', 'Mobile', 'Email', 'Orders', 'Spent', 'Joined', 'Status', ''], r.items.map((c) => html`<tr><td><b>${c.name}</b></td><td>${c.phone || ''}</td><td>${c.email || ''}</td><td>${c.orders}</td><td>${tk(c.spent)}</td><td>${dt(c.created_at)}</td><td>${c.active ? raw('<span class="pill paid">Active</span>') : raw('<span class="pill cancelled">Disabled</span>')}</td><td><button class="btn sm ghost" data-a="cust" data-id="${c.id}">View</button></td></tr>`), 'No customers yet.');
  if (first) { set(html`${head('Customers')}<div class="fl"><input class="in" id="cq" placeholder="Search name, mobile or email" value="${q}"></div><div class="panel" id="ctable">${tb}</div>`); let tm; $('#cq').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(VIEWS.customers, 250); }); } else $('#ctable').innerHTML = tb.s;
};
async function custModal(id) {
  const c = await api('/api/admin/customers/' + id); const isAdmin = S.user.role === 'admin';
  modal(html`<h2>${c.name}</h2><p>${c.phone || ''} ${c.email ? '· ' + c.email : ''}<br><span class="muted small">Joined ${dt(c.created_at)}</span></p>
  ${isAdmin ? html`<div class="fl"><button class="btn sm ${c.active ? 'danger' : ''}" data-a="custactive" data-id="${c.id}" data-v="${c.active ? 0 : 1}">${c.active ? 'Disable account' : 'Enable account'}</button><button class="btn sm ghost" data-a="custpw" data-id="${c.id}">Set temporary password</button></div>` : ''}
  <h3>Order history</h3>${table(['Order', 'Date', 'Total', 'Payment', 'Status'], c.orders.map((o) => html`<tr><td><a class="link" href="#" data-a="order" data-no="${o.order_no}">${o.order_no}</a></td><td>${dt(o.created_at)}</td><td>${tk(o.total)}</td><td>${pill(o.payment_status)}</td><td>${pill(o.status)}</td></tr>`), 'No orders linked to this account.')}
  <h3 style="margin-top:14px">Saved addresses</h3>${c.addresses.length ? c.addresses.map((a) => html`<div class="obox small">${a.label ? html`<b>${a.label}</b><br>` : ''}${a.name}, ${a.phone}<br>${a.address}, ${a.district}</div>`) : html`<p class="muted small">None.</p>`}`, true);
}

/* coupons */
let COUPONS = [];
VIEWS.coupons = async () => {
  COUPONS = (await api('/api/admin/coupons')).items; const can = RANK[S.user.role] >= 2;
  set(html`${head('Discount coupons', can ? html`<button class="btn sm" data-a="coupon">+ New coupon</button>` : '')}<div class="panel">${table(['Code', 'Discount', 'Min. order', 'Used', 'Expires', 'Active', ''], COUPONS.map((c) => html`<tr><td><b>${c.code}</b></td><td>${c.type === 'percent' ? c.value + '%' + (c.max_discount ? ` (max ${tk(c.max_discount)})` : '') : tk(c.value)}</td><td>${tk(c.min_subtotal)}</td><td>${c.used}${c.usage_limit ? ' / ' + c.usage_limit : ''}</td><td>${c.expires_at || '—'}</td><td>${c.active ? 'Yes' : 'No'}</td><td>${can ? html`<button class="btn sm ghost" data-a="coupon" data-id="${c.id}">Edit</button> <button class="btn sm danger" data-a="coupondel" data-id="${c.id}">Delete</button>` : ''}</td></tr>`))}</div>`);
};
const couponModal = (c) => formModal({ title: c ? 'Edit coupon' : 'New coupon', values: c ? { ...c, active: !!c.active } : { type: 'percent', active: true, min_subtotal: 0 }, fields: [{ n: 'code', l: 'Code', req: true }, { n: 'type', l: 'Type', t: 'select', opts: [['percent', 'Percent off'], ['fixed', 'Fixed amount (৳)']] }, { n: 'value', l: 'Value', t: 'number', req: true, min: 1 }, { n: 'min_subtotal', l: 'Minimum order (৳)', t: 'number', min: 0 }, { n: 'max_discount', l: 'Max discount (৳)', t: 'number', help: '(percent only, optional)' }, { n: 'usage_limit', l: 'Usage limit', t: 'number', help: '(optional)' }, { n: 'expires_at', l: 'Expires on', t: 'date' }, { n: 'active', l: 'Active', t: 'checkbox' }],
  submit: async (v) => { await api(c ? '/api/admin/coupons/' + c.id : '/api/admin/coupons', { method: c ? 'PUT' : 'POST', body: v }); toast('Saved'); VIEWS.coupons(); } });

/* marketing: banners, featured, homepage text */
let BANNERS = [];
VIEWS.marketing = async () => {
  const [b, s, p] = await Promise.all([api('/api/admin/banners'), api('/api/admin/settings'), api('/api/admin/products')]); BANNERS = b.items;
  set(html`${head('Marketing & homepage')}
  <div class="panel"><div class="adm-top" style="margin:0 0 10px"><h3 style="margin:0">Promotional banners</h3><button class="btn sm" data-a="banner">+ Add banner</button></div>${table(['Title', 'Link', 'Order', 'Active', ''], BANNERS.map((x) => html`<tr><td><b>${x.title_en}</b><br><span class="muted small">${x.title_bn}</span></td><td>${x.link}</td><td>${x.sort}</td><td>${x.active ? 'Yes' : 'No'}</td><td><button class="btn sm ghost" data-a="banner" data-id="${x.id}">Edit</button> <button class="btn sm danger" data-a="bannerdel" data-id="${x.id}">Delete</button></td></tr>`), 'No banners.')}</div>
  <div class="panel"><h3>Homepage hero text</h3><form id="hero"><div class="fgrid">${['hero_title_bn:Headline (বাংলা)', 'hero_sub_bn:Subtitle (বাংলা)', 'hero_title_en:Headline (English)', 'hero_sub_en:Subtitle (English)'].map((x) => { const [n, l] = x.split(':'); return fieldHTML({ n, l, full: true }, s); })}</div><button class="btn sm">Save hero text</button></form></div>
  <div class="panel"><h3>Featured & new-arrival products</h3><p class="muted small">Tick products to show in the Featured and New Arrivals sections of the homepage. Changes save instantly.</p>${table(['Product', 'Price', 'Featured', 'New'], p.items.map((x) => html`<tr><td>${x.name_en}</td><td>${tk(x.price)}</td><td><input type="checkbox" data-f="featured" ${x.featured ? 'checked' : ''} data-a="pflag" data-id="${x.id}"></td><td><input type="checkbox" data-f="new" ${x.is_new ? 'checked' : ''} data-a="pflag" data-id="${x.id}"></td></tr>`))}</div>`);
  $('#hero').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Saved'); } catch (er) { toast(er.message, 'err'); } });
};
const bannerModal = (b) => formModal({ title: b ? 'Edit banner' : 'New banner', values: b ? { ...b, active: !!b.active } : { link: '/shop', color1: '#24272D', color2: '#B98B3E', active: true, sort: 0 }, fields: [{ n: 'title_en', l: 'Title (English)' }, { n: 'title_bn', l: 'Title (বাংলা)' }, { n: 'sub_en', l: 'Subtitle (English)' }, { n: 'sub_bn', l: 'Subtitle (বাংলা)' }, { n: 'link', l: 'Link', help: '(site path, e.g. /c/half-silk-lungi)' }, { n: 'sort', l: 'Order', t: 'number' }, { n: 'color1', l: 'Background colour', t: 'color' }, { n: 'color2', l: 'Accent colour', t: 'color' }, { n: 'active', l: 'Active', t: 'checkbox' }],
  submit: async (v) => { await api(b ? '/api/admin/banners/' + b.id : '/api/admin/banners', { method: b ? 'PUT' : 'POST', body: v }); toast('Saved'); VIEWS.marketing(); } });

/* reports */
let REP = { type: 'daily' };
VIEWS.reports = async () => {
  const from = $('#rfrom')?.value || '', to = $('#rto')?.value || '';
  const r = await api(`/api/admin/reports?type=${REP.type}&from=${from}&to=${to}`);
  set(html`${head('Reports', html`<a class="btn sm ghost" href="/api/admin/reports/export?type=${REP.type}&from=${from}&to=${to}">Export ${REP.type} CSV</a> <a class="btn sm ghost" href="/api/admin/reports/export?type=best">Export best sellers</a>`)}
  <div class="fl"><button class="btn sm ${REP.type === 'daily' ? '' : 'ghost'}" data-a="rtype" data-v="daily">Daily</button><button class="btn sm ${REP.type === 'monthly' ? '' : 'ghost'}" data-a="rtype" data-v="monthly">Monthly</button><label class="small">From <input class="in" type="date" id="rfrom" value="${from}"></label><label class="small">To <input class="in" type="date" id="rto" value="${to}"></label><button class="btn sm" data-a="rtype" data-v="${REP.type}">Apply</button></div>
  <div class="stats"><div class="stat"><small>Total revenue (excl. cancelled)</small><b>${tk(r.total_revenue)}</b></div><div class="stat"><small>Orders</small><b>${n0(r.total_orders)}</b></div></div>
  <div class="panel"><h3>${REP.type === 'daily' ? 'Daily' : 'Monthly'} sales</h3>${table([REP.type === 'daily' ? 'Date' : 'Month', 'Orders', 'Subtotal', 'Discount', 'Delivery', 'Revenue'], r.rows.map((x) => html`<tr><td>${x.period}</td><td>${x.orders}</td><td>${tk(x.subtotal)}</td><td>${tk(x.discount)}</td><td>${tk(x.delivery)}</td><td><b>${tk(x.revenue)}</b></td></tr>`), 'No sales in this range.')}</div>
  <div class="panel"><h3>Best-selling products</h3>${table(['SKU', 'Product', 'Units', 'Revenue'], r.best_sellers.map((x) => html`<tr><td>${x.sku}</td><td>${x.name}</td><td>${x.units}</td><td>${tk(x.revenue)}</td></tr>`), 'No sales yet.')}</div>`);
};

/* reviews */
VIEWS.reviews = async () => {
  const r = await api('/api/admin/reviews');
  set(html`${head('Reviews')}<div class="panel">${table(['Product', 'Author', 'Rating', 'Review', 'Date', ''], r.items.map((x) => html`<tr><td>${x.name_en}</td><td>${x.author}${x.user_id ? '' : html` <span class="perm">seed/demo</span>`}</td><td>${'★'.repeat(x.rating)}</td><td style="max-width:360px">${x.body}</td><td>${dt(x.created_at)}</td><td><button class="btn sm danger" data-a="rvdel" data-id="${x.id}">Delete</button></td></tr>`))}</div>`);
};

/* settings */
VIEWS.settings = async () => {
  const s = await api('/api/admin/settings'); const cfg = await api('/api/config'); const isAdmin = S.user.role === 'admin';
  const G = (rows) => html`<div class="fgrid">${rows.map(([n, l, t, help]) => fieldHTML({ n, l, t: t || 'text', help, full: false }, s))}</div>`;
  set(html`${head('Store settings')}${isAdmin ? '' : html`<div class="alert info">Managers can edit homepage text only. Other settings require an admin.</div>`}
  <form id="sform"><div class="panel"><h3>Delivery charges</h3>${G([['delivery_inside_dhaka', 'Inside Dhaka (৳)', 'number'], ['delivery_outside_dhaka', 'Outside Dhaka (৳)', 'number'], ['free_delivery_over', 'Free delivery over (৳)', 'number', '(0 = never free)']])}<p class="muted small">Used by the cart and checkout. Orders already placed keep the charge they were created with.</p></div>
  <div class="panel"><h3>Brand & contact</h3>${G([['store_name_bn', 'Store name (বাংলা)'], ['store_name_en', 'Store name (English)'], ['contact_phone', 'Phone'], ['contact_email', 'Email', 'email'], ['whatsapp_number', 'WhatsApp number', 'text', '(digits with 880)'], ['contact_address_bn', 'Address (বাংলা)'], ['contact_address_en', 'Address (English)'], ['facebook_url', 'Facebook page URL', 'url'], ['instagram_url', 'Instagram URL', 'url']])}</div>
  <div class="panel"><h3>Mobile banking payments</h3><p class="small">Status now: ${['bkash', 'nagad', 'rocket'].map((k) => html`<span class="pill ${cfg.payments[k].enabled ? 'paid' : 'unpaid'}">${k}: ${cfg.payments[k].mode === 'gateway' ? 'gateway API' : cfg.payments[k].mode === 'manual' ? 'manual TrxID' : 'off'}</span> `)}</p>
  <p class="muted small">Gateway mode is switched on by server environment variables (see README) — it is not configurable here, so API secrets never touch the browser. <b>Manual mode:</b> enter your merchant "send money" number; customers pay and enter the TrxID, and you verify each payment from the order screen. Leave empty to hide the method.</p>
  ${G([['manual_bkash_number', 'bKash merchant number'], ['manual_nagad_number', 'Nagad merchant number'], ['manual_rocket_number', 'Rocket merchant number']])}</div>
  <div class="panel"><h3>Return & refund policy</h3><p class="muted small">Shown on the /policy page and linked from the footer once filled in. Write what you will actually honour.</p>${['return_policy_bn:Policy (বাংলা)', 'return_policy_en:Policy (English)'].map((x) => { const [n, l] = x.split(':'); return fieldHTML({ n, l, t: 'textarea', rows: 6, full: true }, s); })}</div>
  ${isAdmin ? html`<button class="btn">Save settings</button>` : ''}</form>
  <div class="panel" style="margin-top:18px"><h3>Language</h3><p class="small">The storefront defaults to Bangla with an English switcher in the header (the visitor's choice is remembered). This admin panel is English-only.</p></div>`);
  $('#sform').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Settings saved'); } catch (er) { toast(er.message, 'err'); } });
  if (!isAdmin) $$('#sform input,#sform textarea').forEach((i) => { i.disabled = true; });
};

/* staff */
VIEWS.staff = async () => {
  const r = await api('/api/admin/staff');
  set(html`${head('Staff & roles', html`<button class="btn sm" data-a="staffnew">+ Add staff</button>`)}<div class="panel">${table(['Name', 'Email', 'Role', 'Active', ''], r.items.map((u) => html`<tr><td>${u.name}</td><td>${u.email}</td><td>${u.id === S.user.id ? html`<span class="perm">${u.role} (you)</span>` : html`<select class="in" style="height:36px;margin:0;width:auto">${['staff', 'manager', 'admin'].map((x) => html`<option ${x === u.role ? 'selected' : ''}>${x}</option>`)}</select>`}</td><td>${u.id === S.user.id ? 'Yes' : html`<input type="checkbox" ${u.active ? 'checked' : ''}>`}</td><td>${u.id === S.user.id ? '' : html`<button class="btn sm" data-a="staffsave" data-id="${u.id}">Save</button>`}</td></tr>`))}</div>
  <div class="panel"><h3>What each role can do</h3><p class="small"><b>Staff</b> — view/update orders and payments, view customers, adjust stock. <b>Manager</b> — plus products, categories, coupons, banners, homepage text, reports, reviews. <b>Admin</b> — everything, including delivery & payment settings, customer accounts and staff. Permissions are enforced on the server.</p></div>`);
};
