'use strict';
const crypto = require('node:crypto');
const { db, tx } = require('./db');
const A = require('./auth');
const { slugify } = require('./util');

const CATS = [
  ['cotton-lungi', 'Cotton Lungi', 'কটন লুঙ্গি', 'Everyday soft cotton, breathable in every season.', 'প্রতিদিনের আরামের জন্য নরম ও হালকা কটন।'],
  ['premium-cotton-lungi', 'Premium Cotton Lungi', 'প্রিমিয়াম কটন লুঙ্গি', 'Dense, long-staple cotton with a richer hand-feel.', 'ঘন ও মোলায়েম প্রিমিয়াম সুতার লুঙ্গি।'],
  ['half-silk-lungi', 'Half Silk Lungi', 'হাফ সিল্ক লুঙ্গি', 'Cotton-silk blend with a gentle sheen.', 'কটন-সিল্কের মিশ্রণে হালকা ঝিলিক।'],
  ['pure-silk-lungi', 'Pure Silk Lungi', 'পিওর সিল্ক লুঙ্গি', 'Luxurious pure silk for weddings and festivals.', 'বিয়ে ও উৎসবের জন্য রাজকীয় খাঁটি সিল্ক।'],
  ['check-design-lungi', 'Check Design Lungi', 'চেক ডিজাইন লুঙ্গি', 'Classic checks in modern colourways.', 'ক্লাসিক চেক, আধুনিক রঙে।'],
  ['traditional-design-lungi', 'Traditional Design Lungi', 'ঐতিহ্যবাহী ডিজাইন লুঙ্গি', 'Heritage motifs and golden borders.', 'ঐতিহ্যবাহী নকশা ও সোনালি পাড়।'],
  ['premium-collection', 'Premium Collection', 'প্রিমিয়াম কালেকশন', 'Our finest pieces, hand-picked.', 'আমাদের বাছাই করা সেরা সংগ্রহ।'],
  ['budget-collection', 'Budget Collection', 'বাজেট কালেকশন', 'Good quality at a friendly price.', 'সাশ্রয়ী দামে ভালো মান।'],
];
const P = {
  navy: ['Navy', 'নেভি', '#16345F', '#B98B3E'], maroon: ['Maroon', 'মেরুন', '#7A1F2B', '#E8C77A'], green: ['Bottle Green', 'বোতল সবুজ', '#1F5A4A', '#F3E3B3'],
  charcoal: ['Charcoal', 'কালচে ধূসর', '#2E3338', '#B8B8B8'], sky: ['Sky Blue', 'আকাশি', '#3F78B5', '#FFFFFF'], brown: ['Chocolate', 'চকলেট', '#5B3A29', '#D9B26F'],
  purple: ['Royal Purple', 'রাজকীয় বেগুনি', '#4B2A6B', '#E4C77D'], teal: ['Teal', 'টিল', '#14636B', '#F0E2B6'], red: ['Crimson', 'লাল', '#A1242E', '#F4D9A0'],
  olive: ['Olive', 'জলপাই', '#5C6B2E', '#E9DFA8'], black: ['Black', 'কালো', '#16181C', '#B98B3E'], ivory: ['Ivory', 'আইভরি', '#E9E1CF', '#6B7FA3'],
};
const col = (...ks) => ks.map((k) => ({ name_en: P[k][0], name_bn: P[k][1], hex: P[k][2], hex2: P[k][3] }));
const DESC = {
  cotton: ['Woven from 100% soft cotton yarn. Light, breathable and easy to wash — a dependable everyday lungi.', '১০০% নরম সুতি সুতায় বোনা। হালকা, বাতাস চলাচলের উপযোগী এবং ধোয়া সহজ — প্রতিদিনের নির্ভরযোগ্য লুঙ্গি।'],
  premium_cotton: ['Dense premium cotton with a smooth, substantial hand-feel. Holds its colour wash after wash.', 'ঘন প্রিমিয়াম সুতি কাপড়, স্পর্শে মসৃণ। বারবার ধোয়ার পরও রঙ টেকসই।'],
  half_silk: ['A cotton-silk blend: the comfort of cotton with a soft lustre. Ideal for Eid and family occasions.', 'কটন-সিল্ক মিশ্রণ: সুতির আরামের সঙ্গে হালকা ঝিলিক। ঈদ ও পারিবারিক অনুষ্ঠানের জন্য আদর্শ।'],
  pure_silk: ['Pure silk with a rich drape and lustrous finish. Dry-clean or gentle hand wash recommended.', 'খাঁটি সিল্ক, রাজকীয় ঝুল ও উজ্জ্বল ফিনিশ। ড্রাই-ক্লিন বা হালকা হাতে ধোয়া ভালো।'],
};
const PRODUCTS = [
  // name_en, name_bn, cat, fabric, design, regular, sale, stock, colors, flags(f=featured,n=new), collections
  ['Everyday Cotton Check', 'এভরিডে কটন চেক', 'cotton-lungi', 'cotton', 'check', 650, 550, 80, col('navy', 'green', 'maroon'), 'f', ['budget-collection']],
  ['Classic Plain Cotton', 'ক্লাসিক প্লেইন কটন', 'cotton-lungi', 'cotton', 'plain', 520, null, 120, col('charcoal', 'navy', 'brown'), '', ['budget-collection']],
  ['Padma Stripe Cotton', 'পদ্মা স্ট্রাইপ কটন', 'cotton-lungi', 'cotton', 'stripe', 700, 600, 60, col('sky', 'teal', 'olive'), 'n', []],
  ['Village Soft Cotton', 'গ্রামীণ সফট কটন', 'cotton-lungi', 'cotton', 'check', 480, 420, 150, col('red', 'olive'), '', ['budget-collection']],
  ['Meghna Premium Cotton', 'মেঘনা প্রিমিয়াম কটন', 'premium-cotton-lungi', 'premium_cotton', 'check', 1250, 1050, 45, col('navy', 'charcoal', 'maroon'), 'f', ['premium-collection']],
  ['Jamuna Premium Plain', 'যমুনা প্রিমিয়াম প্লেইন', 'premium-cotton-lungi', 'premium_cotton', 'plain', 1100, null, 38, col('ivory', 'navy', 'green'), 'n', []],
  ['Sundarban Premium Stripe', 'সুন্দরবন প্রিমিয়াম স্ট্রাইপ', 'premium-cotton-lungi', 'premium_cotton', 'stripe', 1350, 1150, 30, col('green', 'teal'), '', ['premium-collection']],
  ['Karnaphuli Premium Check', 'কর্ণফুলী প্রিমিয়াম চেক', 'premium-cotton-lungi', 'premium_cotton', 'check', 1450, null, 8, col('brown', 'navy'), 'f', []],
  ['Eid Half Silk Royal', 'ঈদ হাফ সিল্ক রয়্যাল', 'half-silk-lungi', 'half_silk', 'check', 1850, 1590, 28, col('purple', 'navy', 'maroon'), 'f', ['premium-collection']],
  ['Half Silk Golden Border', 'হাফ সিল্ক গোল্ডেন বর্ডার', 'half-silk-lungi', 'half_silk', 'traditional', 2100, 1850, 22, col('maroon', 'green'), 'n', ['premium-collection']],
  ['Half Silk Everyday Sheen', 'হাফ সিল্ক এভরিডে শিন', 'half-silk-lungi', 'half_silk', 'stripe', 1500, null, 40, col('teal', 'charcoal', 'sky'), '', []],
  ['Half Silk Festival Plain', 'হাফ সিল্ক ফেস্টিভ্যাল প্লেইন', 'half-silk-lungi', 'half_silk', 'plain', 1600, 1400, 6, col('navy', 'purple'), '', []],
  ['Rajshahi Pure Silk Classic', 'রাজশাহী পিওর সিল্ক ক্লাসিক', 'pure-silk-lungi', 'pure_silk', 'traditional', 4800, 4200, 14, col('maroon', 'purple', 'green'), 'f', ['premium-collection']],
  ['Pure Silk Wedding Edition', 'পিওর সিল্ক ওয়েডিং এডিশন', 'pure-silk-lungi', 'pure_silk', 'traditional', 5500, null, 10, col('ivory', 'red'), 'f,n', ['premium-collection']],
  ['Pure Silk Midnight', 'পিওর সিল্ক মিডনাইট', 'pure-silk-lungi', 'pure_silk', 'plain', 3600, 3200, 18, col('black', 'navy'), '', ['premium-collection']],
  ['Pure Silk Check Heritage', 'পিওর সিল্ক চেক হেরিটেজ', 'pure-silk-lungi', 'pure_silk', 'check', 3900, null, 16, col('purple', 'teal'), 'n', []],
  ['Bengal Big Check', 'বেঙ্গল বিগ চেক', 'check-design-lungi', 'cotton', 'check', 780, 680, 70, col('red', 'navy', 'green'), 'f', []],
  ['Tiny Check Classic', 'টাইনি চেক ক্লাসিক', 'check-design-lungi', 'cotton', 'check', 720, null, 90, col('charcoal', 'brown'), '', ['budget-collection']],
  ['Window-Pane Premium', 'উইন্ডো-পেইন প্রিমিয়াম', 'check-design-lungi', 'premium_cotton', 'check', 1300, 1100, 35, col('sky', 'olive', 'maroon'), 'n', []],
  ['Gamcha Check', 'গামছা চেক', 'check-design-lungi', 'cotton', 'check', 590, 500, 100, col('red', 'teal'), '', ['budget-collection']],
  ['Nakshi Heritage', 'নকশি হেরিটেজ', 'traditional-design-lungi', 'premium_cotton', 'traditional', 1650, 1450, 26, col('maroon', 'navy', 'green'), 'f', ['premium-collection']],
  ['Jamdani Inspired', 'জামদানি ইন্সপায়ার্ড', 'traditional-design-lungi', 'half_silk', 'traditional', 2300, null, 20, col('ivory', 'purple'), 'n', ['premium-collection']],
  ['Golden Diamond Border', 'গোল্ডেন ডায়মন্ড বর্ডার', 'traditional-design-lungi', 'cotton', 'traditional', 950, 820, 55, col('navy', 'brown', 'red'), '', []],
  ['Shonar Bangla', 'সোনার বাংলা', 'traditional-design-lungi', 'premium_cotton', 'traditional', 1500, 1300, 32, col('green', 'maroon'), '', []],
];
const REVIEWS = [
  ['Rafiqul Islam', 5, 'কাপড়টা খুবই নরম, দুই মাস ব্যবহারের পরও রঙ ঠিক আছে। দামের তুলনায় অসাধারণ।'],
  ['Mizanur Rahman', 5, 'Excellent quality. Fabric feels premium and the border is neatly finished.'],
  ['Abdul Karim', 4, 'ডেলিভারি দ্রুত পেয়েছি, লুঙ্গির মান ভালো। সাইজ একদম ঠিক আছে।'],
  ['Sohel Rana', 5, 'বাবার জন্য নিয়েছিলাম, উনার খুব পছন্দ হয়েছে। ঈদের উপহার হিসেবে দারুণ।'],
  ['Tanvir Ahmed', 4, 'Good colour and nice weave. Slightly lighter than I expected but very comfortable.'],
  ['Shahidul Alam', 5, 'সিল্কের ঝুল অসাধারণ। বিয়ের অনুষ্ঠানে সবাই প্রশংসা করেছে।'],
  ['Jahangir Hossain', 3, 'ভালো, তবে রঙটা ছবির চেয়ে একটু গাঢ়। কাপড় ঠিকঠাক।'],
  ['Nasir Uddin', 5, 'Washed three times, no fading and no shrinking. Will order again.'],
];

function ensureCategories() {
  const ins = db.prepare('INSERT OR IGNORE INTO categories(slug,name_en,name_bn,desc_en,desc_bn,sort) VALUES (?,?,?,?,?,?)');
  CATS.forEach((c, i) => ins.run(c[0], c[1], c[2], c[3], c[4], i));
}
function ensureAdmin() {
  if (db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) return null;
  const prod = process.env.NODE_ENV === 'production';
  let email = process.env.ADMIN_EMAIL, pw = process.env.ADMIN_PASSWORD, generated = false;
  if (!email || !pw) {
    if (prod) throw new Error('No admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 chars) before starting in production.');
    email = 'admin@lungi.test'; pw = crypto.randomBytes(9).toString('base64url'); generated = true;
  }
  A.checkPasswordStrength(pw);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES ('Store Admin',?,?,'admin')").run(email.toLowerCase(), A.hashPassword(pw));
  if (generated) console.warn(`\n⚠  Created DEVELOPMENT admin  ${email} / ${pw}   (random, shown once)\n   Set ADMIN_EMAIL and ADMIN_PASSWORD (and NODE_ENV=production) for a real deployment.\n`);
  return email;
}
function seedDemo() {
  ensureCategories();
  if (db.prepare('SELECT COUNT(*) n FROM products').get().n > 0) return false;
  tx(() => {
    const cat = Object.fromEntries(db.prepare('SELECT id,slug FROM categories').all().map((c) => [c.slug, c.id]));
    PRODUCTS.forEach((p, i) => {
      const [en, bn, cslug, fabric, design, reg, sale, stock, colors, flags, colls] = p;
      const sku = `LNG-${String(i + 1).padStart(4, '0')}`;
      const r = db.prepare(`INSERT INTO products(sku,slug,category_id,name_en,name_bn,desc_en,desc_bn,fabric,design,colors,regular_price,sale_price,stock,featured,is_new,sold,length_cm,width_cm)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(sku, slugify(en), cat[cslug], en, bn, DESC[fabric][0], DESC[fabric][1], fabric, design, JSON.stringify(colors), reg, sale, stock,
        flags.includes('f') ? 1 : 0, flags.includes('n') ? 1 : 0, (i * 37) % 90 + 5, 220, fabric === 'pure_silk' ? 115 : 110);
      const id = Number(r.lastInsertRowid);
      for (let n = 0; n < 4; n++) db.prepare('INSERT INTO product_images(product_id,url,sort) VALUES (?,?,?)').run(id, `/img/p/${id}/${n}.svg`, n);
      for (const c of colls) db.prepare('INSERT INTO product_collections(product_id,category_id) VALUES (?,?)').run(id, cat[c]);
      // demo reviews (author names are fictional; clear with `npm run clear-demo`)
      const nrev = 2 + (i % 3);
      for (let k = 0; k < nrev; k++) { const rv = REVIEWS[(i + k * 3) % REVIEWS.length]; db.prepare('INSERT INTO reviews(product_id,author,rating,body) VALUES (?,?,?,?)').run(id, rv[0], rv[1], rv[2]); }
    });
    const cp = db.prepare('INSERT INTO coupons(code,type,value,min_subtotal,max_discount,usage_limit,expires_at) VALUES (?,?,?,?,?,?,?)');
    cp.run('WELCOME10', 'percent', 10, 1000, 300, null, null);
    cp.run('EID200', 'fixed', 200, 2000, null, 500, null);
    const bn = db.prepare('INSERT INTO banners(title_en,title_bn,sub_en,sub_bn,link,color1,color2,sort) VALUES (?,?,?,?,?,?,?,?)');
    bn.run('Eid Collection — up to 20% off', 'ঈদ কালেকশন — ২০% পর্যন্ত ছাড়', 'Half silk & pure silk, hand-picked for the festival.', 'হাফ সিল্ক ও পিওর সিল্ক, উৎসবের জন্য বাছাই করা।', '/c/half-silk-lungi', '#24272D', '#B98B3E', 0);
    bn.run('Free delivery over ৳3,000', '৩,০০০ টাকার বেশি কেনাকাটায় ফ্রি ডেলিভারি', 'Anywhere in Bangladesh.', 'সারা বাংলাদেশে।', '/shop', '#5B2A1E', '#E8C77A', 1);
    // demo orders so the dashboard and reports are not empty. Marked note='DEMO-SEED'.
    const prods = db.prepare('SELECT * FROM products').all();
    const names = ['Rahim Uddin', 'Karim Mia', 'Sabbir Hasan', 'Nurul Amin', 'Imran Hossain', 'Faruk Ahmed', 'Shamim Reza', 'Mahbub Alam'];
    const dist = ['Dhaka', 'Dhaka', 'Chattogram', 'Sylhet', 'Rajshahi', 'Khulna', 'Cumilla', 'Dhaka'];
    const stat = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'confirmed', 'pending', 'cancelled', 'out_for_delivery', 'delivered'];
    for (let n = 0; n < 36; n++) {
      const daysAgo = Math.floor(n * 0.8); const d = new Date(Date.now() - daysAgo * 864e5 - (n % 7) * 36e5).toISOString().slice(0, 19).replace('T', ' ');
      const items = [prods[(n * 5) % prods.length], prods[(n * 7 + 3) % prods.length]].slice(0, 1 + (n % 2));
      const sub = items.reduce((a, p) => a + (p.sale_price ?? p.regular_price) * (1 + (n % 3 === 0 ? 1 : 0)), 0);
      const dc = n % 8 === 0 || n % 8 === 1 || n % 8 === 7 ? 60 : 120; const status = stat[n % stat.length];
      const method = ['cod', 'cod', 'cod', 'cod'][n % 4];
      const no = `LNG-DEMO-${String(n + 1).padStart(4, '0')}`;
      const o = db.prepare(`INSERT INTO orders(order_no,name,phone,address,district,subtotal,delivery_charge,discount,total,status,payment_method,payment_status,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(no, names[n % names.length], `0171000${String(1000 + n)}`, 'House 12, Road 3, Sample Area', dist[n % dist.length], sub, dc, 0, sub + dc, status, method, status === 'delivered' ? 'paid' : 'unpaid', 'DEMO-SEED', d);
      for (const p of items) db.prepare('INSERT INTO order_items(order_id,product_id,sku,name,color,unit_price,qty) VALUES (?,?,?,?,?,?,?)').run(Number(o.lastInsertRowid), p.id, p.sku, p.name_en, JSON.parse(p.colors)[0].name_en, p.sale_price ?? p.regular_price, 1 + (n % 3 === 0 ? 1 : 0));
      db.prepare('INSERT INTO order_events(order_id,status,note,created_at) VALUES (?,?,?,?)').run(Number(o.lastInsertRowid), 'pending', 'Order placed', d);
    }
  });
  return true;
}
function clearDemo() {
  tx(() => {
    db.prepare("DELETE FROM orders WHERE note='DEMO-SEED'").run();
    db.prepare('DELETE FROM reviews WHERE user_id IS NULL').run();
  });
}
module.exports = { ensureCategories, ensureAdmin, seedDemo, clearDemo };

if (require.main === module) {
  if (process.argv.includes('--clear-demo')) { clearDemo(); console.log('Demo orders and demo reviews removed.'); }
  else { ensureAdmin(); console.log(seedDemo() ? 'Demo catalogue seeded (24 products, 8 categories, coupons WELCOME10 & EID200).' : 'Products already exist; nothing seeded.'); }
}
