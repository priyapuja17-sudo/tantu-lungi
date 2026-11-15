'use strict';
/**
 * Async database API (migration Stage 1).  See docs/MIGRATION_PLAN.md.
 *   get(sql, params)    -> first row or undefined
 *   all(sql, params)    -> array of rows
 *   run(sql, params)    -> { changes }
 *   insert(sql, params) -> new row id (the SQL must NOT include RETURNING; it is appended)
 *   tx(fn)              -> runs fn() atomically; statements inside fn (including across awaits) share the transaction
 * SQL uses `?` placeholders.
 *
 * Drivers: sqlite (default, node:sqlite).  postgres: NOT IMPLEMENTED YET (Stage 5) and untested until Stage 6.
 *
 * SQLite concurrency note: node:sqlite is one synchronous connection. With async code, an `await` inside a
 * transaction would let another request's statements run *inside* that transaction (or start a nested BEGIN).
 * So transactions take a global lock and every statement issued outside the transaction waits for it.
 */
const { AsyncLocalStorage } = require('node:async_hooks');

const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
if (driver !== 'sqlite') throw new Error(`DB_DRIVER=${driver} is not implemented yet (see docs/MIGRATION_PLAN.md, Stage 5).`);

const { db } = require('./db');
const als = new AsyncLocalStorage();
let txActive = false;
let waiters = [];

async function gate() {
  if (als.getStore()) return;                    // we are inside the active transaction
  while (txActive) await new Promise((r) => waiters.push(r));
}
const wake = () => { const w = waiters; waiters = []; w.forEach((r) => r()); };

async function get(sql, params = []) { await gate(); return db.prepare(sql).get(...params); }
async function all(sql, params = []) { await gate(); return db.prepare(sql).all(...params); }
async function run(sql, params = []) { await gate(); const r = db.prepare(sql).run(...params); return { changes: Number(r.changes) }; }
async function insert(sql, params = []) { await gate(); return Number(db.prepare(sql + ' RETURNING id').get(...params).id); }

async function tx(fn) {
  if (als.getStore()) return fn();               // nested: join the outer transaction
  while (txActive) await new Promise((r) => waiters.push(r));
  txActive = true;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = await als.run({ tx: true }, fn);
    db.exec('COMMIT');
    return result;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  } finally {
    txActive = false; wake();
  }
}

module.exports = { get, all, run, insert, tx, driver };
