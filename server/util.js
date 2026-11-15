'use strict';
class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (m, e) => new HttpError(400, m, e);

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function asciiDigits(s) { return String(s ?? '').replace(/[০-৯]/g, (d) => BN_DIGITS.indexOf(d)); }

// Bangladeshi mobile: 01[3-9]XXXXXXXX, also accepts +880 / 880 prefix, spaces, dashes and Bangla digits.
function normPhone(v) {
  let s = asciiDigits(v).replace(/[\s\-()]/g, '');
  if (s.startsWith('+880')) s = '0' + s.slice(4);
  else if (s.startsWith('880')) s = '0' + s.slice(3);
  return /^01[3-9]\d{8}$/.test(s) ? s : null;
}
const reqPhone = (v, label = 'Mobile number') => normPhone(v) || (() => { throw bad(`${label} is invalid. Use a Bangladeshi number like 01712345678.`, { field: label }); })();

function str(v, { min = 0, max = 500, label = 'Field', required = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required && min > 0) throw bad(`${label} is required.`);
    return '';
  }
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (s.length < min) throw bad(`${label} is required.`);
  if (s.length > max) throw bad(`${label} is too long (max ${max}).`);
  return s;
}
function int(v, { min = -Infinity, max = Infinity, label = 'Number' } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} must be a whole number between ${min} and ${max}.`);
  return n;
}
const isEmail = (s) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(s);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula-injection guard
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const toCSV = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

// tiny in-memory rate limiter
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return; }
  if (++b.n > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}
setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (b.reset < n) buckets.delete(k); }, 60000).unref();

module.exports = { HttpError, bad, normPhone, reqPhone, str, int, isEmail, slugify, toCSV, rateLimit, asciiDigits };
