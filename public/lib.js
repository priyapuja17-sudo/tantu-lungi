import { D } from './i18n.js';

/* ---------- safe storage ---------- */
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
export const S = { lang: store.get('lang', 'bn'), config: null, user: null, cart: store.get('cart', []), wish: new Set(store.get('wish', [])), coupon: store.get('coupon', '') };
document.documentElement.lang = S.lang;

export const t = (k) => (D[k] ? D[k][S.lang === 'bn' ? 0 : 1] : k);
export const isBn = () => S.lang === 'bn';
export const pick = (o, f) => (isBn() ? o[f + '_bn'] || o[f + '_en'] : o[f + '_en'] || o[f + '_bn']) || '';

/* ---------- tiny safe-by-default templating ---------- */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(r1).join('') : v === null || v === undefined || v === false ? '' : esc(v));
export function html(s, ...v) { let o = s[0]; for (let i = 0; i < v.length; i++) o += r1(v[i]) + s[i + 1]; return new Raw(o); }
export const mount = (el, node) => { el.innerHTML = node.s; };

/* ---------- formatting ---------- */
const nf = () => new Intl.NumberFormat(isBn() ? 'bn-BD' : 'en-IN');
export const num = (n) => nf().format(n);
export const money = (n) => '৳' + num(n);
export function date(s) {
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return d.toLocaleString(isBn() ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export const toAscii = (s) => String(s || '').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
export function phoneOk(v) {
  let s = toAscii(v).replace(/[\s\-()]/g, '');
  if (s.startsWith('+880')) s = '0' + s.slice(4); else if (s.startsWith('880')) s = '0' + s.slice(3);
  return /^01[3-9]\d{8}$/.test(s) ? s : null;
}

/* ---------- API ---------- */
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { const e = new Error(t('err_net')); e.network = true; throw e; }
  let data = {}; try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error(data.error || t('err_net')); e.status = res.status; e.data = data; throw e; }
  return data;
}
export function toast(msg, type = '') {
  const box = document.getElementById('toasts'); const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg; box.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------- icons ---------- */
const ic = (d, extra = '') => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`);
export const I = {
  search: ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
  heart: ic('<path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.3 3.2 5 6.5 5c2 0 3.7 1.1 5.5 3 1.8-1.9 3.5-3 5.5-3 3.3 0 5.3 3.3 4 6.7C19.5 16.4 12 21 12 21Z"/>'),
  bag: ic('<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  check: ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="2.6"'),
  truck: ic('<path d="M2 6h11v10H2zM13 10h4l3 3v3h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>'),
  shield: ic('<path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3Z"/><path d="m8.5 12 2.5 2.5L16 9.5"/>'),
  cash: ic('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9v.01M18 15v.01"/>'),
  thread: ic('<path d="M12 3 21 12 12 21 3 12Z"/><path d="M12 8l4 4-4 4-4-4Z"/>'),
  filter: ic('<path d="M3 5h18M6 12h12M10 19h4"/>'),
  x: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
  phone: ic('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'),
  mail: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  pin: ic('<path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
  whatsapp: raw('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.2 14c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.2 1.4 2.5 1.5.3.2.5.1.7-.1l.8-1c.2-.3.4-.2.7-.1l1.9.9c.3.2.5.2.6.3.1.3.1.8-.1 1.4Z"/></svg>'),
  facebook: raw('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7.5H16l.5-3h-3V8.6c0-.9.3-1.5 1.6-1.5H16.7V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21h3Z"/></svg>'),
  instagram: ic('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>'),
};
export const Logo = (cls = '') => html`<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#24272D"/><path d="M32 7 57 32 32 57 7 32Z" fill="none" stroke="#B98B3E" stroke-width="2.6"/><path d="M32 15 49 32 32 49 15 32Z" fill="none" stroke="#B98B3E" stroke-width="1" opacity=".6"/><path d="M32 22 42 32 32 42 22 32Z" fill="#B98B3E"/><path d="M12 32h40M32 12v40" stroke="#fff" stroke-width=".8" opacity=".35"/></svg>`;
export const stars = (n) => html`<span class="stars" aria-label="${n} / 5">${'★'.repeat(Math.round(n))}<i>${'★'.repeat(5 - Math.round(n))}</i></span>`;
