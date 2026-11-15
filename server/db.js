'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'shop.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

const DEFAULT_SETTINGS = {
  store_name_en: 'Tantu Lungi', store_name_bn: 'তন্তু লুঙ্গি',
  hero_title_bn: 'আরাম ও ঐতিহ্যের সেরা সমন্বয়',
  hero_sub_bn: 'প্রিমিয়াম কোয়ালিটির লুঙ্গি, এখন আপনার হাতেই।',
  hero_title_en: 'The finest blend of comfort and heritage',
  hero_sub_en: 'Premium quality lungis, now at your doorstep.',
  delivery_inside_dhaka: '60', delivery_outside_dhaka: '120',
  free_delivery_over: '3000',
  // Business details are intentionally EMPTY until the owner enters them (Admin > Settings). Empty = hidden on the storefront.
  contact_phone: '', contact_email: '', contact_address_en: '', contact_address_bn: '',
  whatsapp_number: '', facebook_url: '', instagram_url: '',
  return_policy_bn: '', return_policy_en: '',
  manual_bkash_number: '', manual_nagad_number: '', manual_rocket_number: '',
};
const ins = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);

function getSettings() {
  const o = {};
  for (const r of db.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value;
  return o;
}
module.exports = { db, tx, getSettings, DEFAULT_SETTINGS, DB_PATH };
