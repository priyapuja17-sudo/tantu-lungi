'use strict';
// Procedural SVG artwork for lungi products and the hero banner.
// These are illustrations generated from each product's design + colours, NOT photographs.
// Swap in real photos via the admin image upload (Cloudinary/Supabase adapters are described in README).

const clamp = (n) => Math.max(0, Math.min(255, n));
function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#888888';
  const n = parseInt(m[1], 16);
  const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
const hexOk = (h, d) => (/^#[0-9a-f]{6}$/i.test(h || '') ? h : d);

function bodyPattern(id, design, c1, c2) {
  const weave = `<pattern id="${id}w" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="none"/><path d="M0 .5H3M.5 0V3" stroke="#000" stroke-opacity=".07" stroke-width=".6"/></pattern>`;
  let p;
  if (design === 'check') {
    p = `<pattern id="${id}p" width="60" height="60" patternUnits="userSpaceOnUse">
      <rect width="60" height="60" fill="${c1}"/>
      <rect x="0" y="12" width="60" height="14" fill="${c2}" opacity=".55"/>
      <rect x="12" y="0" width="14" height="60" fill="${c2}" opacity=".55"/>
      <rect x="0" y="40" width="60" height="3" fill="#fff" opacity=".8"/>
      <rect x="40" y="0" width="3" height="60" fill="#fff" opacity=".8"/>
      <rect x="0" y="48" width="60" height="1.5" fill="#fff" opacity=".45"/>
      <rect x="48" y="0" width="1.5" height="60" fill="#fff" opacity=".45"/></pattern>`;
  } else if (design === 'stripe') {
    p = `<pattern id="${id}p" width="48" height="10" patternUnits="userSpaceOnUse">
      <rect width="48" height="10" fill="${c1}"/>
      <rect x="6" width="10" height="10" fill="${c2}" opacity=".7"/>
      <rect x="30" width="3" height="10" fill="#fff" opacity=".8"/>
      <rect x="36" width="1.5" height="10" fill="#fff" opacity=".5"/></pattern>`;
  } else if (design === 'traditional') {
    p = `<pattern id="${id}p" width="44" height="44" patternUnits="userSpaceOnUse">
      <rect width="44" height="44" fill="${c1}"/>
      <path d="M22 4 40 22 22 40 4 22Z" fill="none" stroke="${c2}" stroke-width="2" opacity=".85"/>
      <path d="M22 14 30 22 22 30 14 22Z" fill="${c2}" opacity=".7"/>
      <circle cx="0" cy="0" r="3" fill="${c2}" opacity=".6"/><circle cx="44" cy="0" r="3" fill="${c2}" opacity=".6"/>
      <circle cx="0" cy="44" r="3" fill="${c2}" opacity=".6"/><circle cx="44" cy="44" r="3" fill="${c2}" opacity=".6"/></pattern>`;
  } else {
    p = `<pattern id="${id}p" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="${c1}"/>
      <rect y="9" width="20" height="1" fill="#fff" opacity=".12"/></pattern>`;
  }
  return weave + p;
}

function productSVG(prod, view) {
  const colors = prod.colors || [];
  const c = colors[0] || {};
  const c1 = hexOk(c.hex, '#1d3a6b'), c2 = hexOk(c.hex2, '#c9a24b');
  const id = 'a' + (prod.id || 0) + 'v' + view;
  const gold = '#B98B3E';
  const silk = prod.fabric === 'pure_silk' || prod.fabric === 'half_silk';
  const defs = bodyPattern(id, prod.design, c1, c2) + `
    <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6F1E6"/><stop offset="1" stop-color="#E7DFCB"/></linearGradient>
    <linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".25" stop-color="#fff" stop-opacity=".0"/><stop offset=".6" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
    <linearGradient id="${id}silk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".45" stop-color="#fff" stop-opacity=".30"/><stop offset=".55" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <filter id="${id}ds" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-opacity=".28"/></filter>`;
  const W = 800, H = 800;
  let inner = '';
  const border = (x, y, w, h, vertical) => vertical
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${gold}"/><rect x="${x + w * .3}" y="${y}" width="${w * .15}" height="${h}" fill="#fff" opacity=".6"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${gold}"/><rect x="${x}" y="${y + h * .3}" width="${w}" height="${h * .15}" fill="#fff" opacity=".6"/>`;
  if (view === 0) { // full cloth, flat lay
    inner = `<g filter="url(#${id}ds)"><rect x="110" y="90" width="580" height="620" rx="6" fill="url(#${id}p)"/>
      <rect x="110" y="90" width="580" height="620" rx="6" fill="url(#${id}w)"/>
      ${prod.design === 'traditional' ? border(110, 90, 580, 34) + border(110, 676, 580, 34) : ''}
      ${prod.design !== 'plain' ? '' : border(110, 676, 580, 34)}
      <rect x="110" y="90" width="580" height="620" rx="6" fill="url(#${id}sh)"/>
      ${silk ? `<rect x="110" y="90" width="580" height="620" rx="6" fill="url(#${id}silk)"/>` : ''}
      <rect x="110" y="90" width="580" height="620" rx="6" fill="none" stroke="#000" stroke-opacity=".12"/></g>`;
  } else if (view === 1) { // close-up of weave
    inner = `<g transform="translate(-200 -200) scale(1.5)"><rect x="0" y="0" width="1000" height="1000" fill="url(#${id}p)"/>
      <rect width="1000" height="1000" fill="url(#${id}w)"/>${silk ? `<rect width="1000" height="1000" fill="url(#${id}silk)"/>` : ''}</g>
      <rect width="800" height="800" fill="url(#${id}sh)" opacity=".7"/>
      <g transform="translate(0 640)"><rect width="800" height="160" fill="#24272D" opacity=".85"/>
      <text x="40" y="70" font-family="Georgia,serif" font-size="34" fill="${gold}">${(prod.fabric || '').replace(/_/g, ' ').toUpperCase()}</text>
      <text x="40" y="112" font-family="Georgia,serif" font-size="22" fill="#fff" opacity=".8">Close-up of the weave</text></g>`;
  } else if (view === 2) { // folded stack
    const layers = [0, 1, 2].map((i) => {
      const y = 470 - i * 120, k = i === 1 ? shade(c1, 14) : i === 2 ? shade(c1, -10) : c1;
      return `<g filter="url(#${id}ds)"><rect x="${150 + i * 14}" y="${y}" width="500" height="112" rx="14" fill="${k}"/>
        <rect x="${150 + i * 14}" y="${y}" width="500" height="112" rx="14" fill="url(#${id}p)" opacity=".92"/>
        <rect x="${150 + i * 14}" y="${y}" width="500" height="112" rx="14" fill="url(#${id}sh)"/>
        <rect x="${150 + i * 14}" y="${y + 100}" width="500" height="12" fill="${gold}" opacity=".9"/></g>`;
    }).join('');
    inner = layers;
  } else { // view 3: draped / hung
    inner = `<rect x="150" y="70" width="500" height="14" rx="7" fill="#7a5c2e"/>
      <g filter="url(#${id}ds)"><path d="M190 84H610L640 700Q400 740 160 700Z" fill="url(#${id}p)"/>
      <path d="M190 84H610L640 700Q400 740 160 700Z" fill="url(#${id}w)"/>
      <path d="M190 84H610L640 700Q400 740 160 700Z" fill="url(#${id}sh)"/>
      ${[260, 330, 400, 470, 540].map((x) => `<path d="M${x} 84Q${x + 14} 400 ${x - 6} 716" stroke="#000" stroke-opacity=".10" stroke-width="10" fill="none"/>`).join('')}
      <path d="M164 700Q400 742 636 700V672Q400 714 164 672Z" fill="${gold}"/></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${(prod.name_en || 'Lungi').replace(/[<>&"]/g, '')}"><defs>${defs}</defs><rect width="${W}" height="${H}" fill="url(#${id}bg)"/>${inner}</svg>`;
}

function heroSVG() {
  const gold = '#B98B3E';
  const cloth = (x, y, rot, c1, c2, w = 300, h = 360, design = 'check', k = 'a') => `
    <pattern id="h${k}" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot})">
      <rect width="48" height="48" fill="${c1}"/>
      ${design === 'check' ? `<rect y="10" width="48" height="11" fill="${c2}" opacity=".55"/><rect x="10" width="11" height="48" fill="${c2}" opacity=".55"/><rect y="34" width="48" height="2" fill="#fff" opacity=".7"/><rect x="34" width="2" height="48" fill="#fff" opacity=".7"/>`
        : `<path d="M24 4 44 24 24 44 4 24Z" fill="none" stroke="${c2}" stroke-width="2"/><path d="M24 15 33 24 24 33 15 24Z" fill="${c2}" opacity=".8"/>`}
    </pattern>
    <g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#hds)"><rect width="${w}" height="${h}" rx="8" fill="url(#h${k})"/>
    <rect y="${h - 26}" width="${w}" height="26" fill="${gold}"/><rect width="${w}" height="${h}" rx="8" fill="url(#hsh)"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="hbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B1816"/><stop offset=".6" stop-color="#2B241F"/><stop offset="1" stop-color="#3D322A"/></linearGradient>
    <linearGradient id="hsh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
    <radialGradient id="hglow" cx=".75" cy=".4" r=".6"><stop offset="0" stop-color="${gold}" stop-opacity=".35"/><stop offset="1" stop-color="${gold}" stop-opacity="0"/></radialGradient>
    <filter id="hds" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="0" dy="20" stdDeviation="22" flood-opacity=".45"/></filter>
    <pattern id="hdots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="18" cy="18" r="1.4" fill="${gold}" opacity=".25"/></pattern>
  </defs>
  <rect width="1200" height="700" fill="url(#hbg)"/><rect width="1200" height="700" fill="url(#hdots)"/><rect width="1200" height="700" fill="url(#hglow)"/>
  ${cloth(640, 130, -8, '#16345F', '#C9A24B', 260, 380, 'check', 'a')}
  ${cloth(830, 90, 4, '#7A1F2B', '#E8C77A', 280, 420, 'trad', 'b')}
  ${cloth(1020, 160, 12, '#1F5A4A', '#F3E3B3', 240, 360, 'check', 'c')}
</svg>`;
}

module.exports = { productSVG, heroSVG, shade };
