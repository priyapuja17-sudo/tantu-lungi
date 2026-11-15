'use strict';
const crypto = require('node:crypto');
const { db } = require('./db');
const { HttpError } = require('./util');

const SESSION_DAYS = 14;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [alg, saltHex, hashHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
    const exp = Buffer.from(hashHex, 'hex');
    return exp.length === h.length && crypto.timingSafeEqual(h, exp);
  } catch { return false; }
}
function checkPasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (pw.length > 200) throw new HttpError(400, 'Password is too long.');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)')
    .run(sha(token), userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
function destroySession(token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token)); }
function userFromToken(token) {
  if (!token) return null;
  const r = db.prepare(`SELECT u.id,u.name,u.phone,u.email,u.role,u.active,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(sha(token));
  if (!r) return null;
  if (r.expires_at < Date.now() || !r.active) { destroySession(token); return null; }
  return { id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role };
}
function parseCookies(h) {
  const o = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) o[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return o;
}
const cookieHeader = (token, maxAgeSec) =>
  `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

// Role hierarchy for the admin panel. Every admin route declares the minimum role; checked on the server.
const RANK = { customer: 0, staff: 1, manager: 2, admin: 3 };
function requireRole(user, min) {
  if (!user) throw new HttpError(401, 'Please log in.');
  if ((RANK[user.role] ?? 0) < RANK[min]) throw new HttpError(403, 'You do not have permission to do this.');
}
module.exports = { hashPassword, verifyPassword, checkPasswordStrength, createSession, destroySession, userFromToken, parseCookies, cookieHeader, requireRole, SESSION_DAYS, sha };
