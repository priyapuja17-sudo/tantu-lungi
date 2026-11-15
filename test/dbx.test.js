'use strict';
// Tests for the async DB layer (SQLite driver). The same file is meant to be re-run against Postgres in Stage 6.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbx-'));
process.env.DATABASE_PATH = path.join(dir, 'd.db');
const dbx = require('../server/dbx');
const { db } = require('../server/db');
const tick = () => new Promise((r) => setImmediate(r));

before(() => { db.exec('CREATE TABLE IF NOT EXISTS acct (id INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER NOT NULL)'); db.exec('INSERT INTO acct(n) VALUES (0)'); });
after(() => { fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 20); });

test('get/all/run/insert basics; insert returns the new id', async () => {
  const id = await dbx.insert('INSERT INTO acct(n) VALUES (?)', [5]);
  assert.ok(id > 1);
  assert.equal((await dbx.get('SELECT n FROM acct WHERE id=?', [id])).n, 5);
  assert.equal(await dbx.get('SELECT n FROM acct WHERE id=?', [999999]), undefined);
  assert.equal((await dbx.run('UPDATE acct SET n=n+1 WHERE id=?', [id])).changes, 1);
  assert.ok((await dbx.all('SELECT * FROM acct')).length >= 2);
});

test('rollback leaves no trace', async () => {
  await assert.rejects(dbx.tx(async () => { await dbx.run('UPDATE acct SET n=100 WHERE id=1'); await tick(); throw new Error('boom'); }), /boom/);
  assert.equal((await dbx.get('SELECT n FROM acct WHERE id=1')).n, 0);
});

test('50 concurrent read-modify-write transactions are serialised (no lost updates)', async () => {
  await dbx.run('UPDATE acct SET n=0 WHERE id=1');
  await Promise.all(Array.from({ length: 50 }, () => dbx.tx(async () => {
    const { n } = await dbx.get('SELECT n FROM acct WHERE id=1');
    await tick(); await tick();                      // yield: other requests try to run meanwhile
    await dbx.run('UPDATE acct SET n=? WHERE id=1', [n + 1]);
  })));
  assert.equal((await dbx.get('SELECT n FROM acct WHERE id=1')).n, 50);
});

test('a statement from another request cannot land inside a transaction that rolls back', async () => {
  await dbx.run('UPDATE acct SET n=0 WHERE id=1');
  const slow = dbx.tx(async () => { await dbx.run('UPDATE acct SET n=n+10 WHERE id=1'); await tick(); await tick(); throw new Error('rollback me'); }).catch(() => 'rolled');
  await tick();
  const outsider = dbx.run('UPDATE acct SET n=n+1 WHERE id=1');   // issued while the tx is open: must wait, then apply after rollback
  assert.equal(await slow, 'rolled'); await outsider;
  assert.equal((await dbx.get('SELECT n FROM acct WHERE id=1')).n, 1);   // 0 + outsider's 1; the +10 was rolled back
});

test('nested tx joins the outer transaction; an inner failure rolls back both', async () => {
  await dbx.run('UPDATE acct SET n=0 WHERE id=1');
  await assert.rejects(dbx.tx(async () => { await dbx.run('UPDATE acct SET n=n+1 WHERE id=1'); await dbx.tx(async () => { await dbx.run('UPDATE acct SET n=n+1 WHERE id=1'); throw new Error('inner'); }); }), /inner/);
  assert.equal((await dbx.get('SELECT n FROM acct WHERE id=1')).n, 0);
});

test('stock-style atomic decrement: 20 parallel buyers, stock 5 -> exactly 5 succeed, never negative', async () => {
  await dbx.run('CREATE TABLE IF NOT EXISTS stk (id INTEGER PRIMARY KEY, stock INTEGER NOT NULL CHECK (stock >= 0))');
  await dbx.run('DELETE FROM stk'); await dbx.run('INSERT INTO stk(id,stock) VALUES (1,5)');
  const results = await Promise.all(Array.from({ length: 20 }, () => dbx.tx(async () => {
    await tick();
    const r = await dbx.run('UPDATE stk SET stock=stock-1 WHERE id=1 AND stock>=1');
    return r.changes === 1;
  })));
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal((await dbx.get('SELECT stock FROM stk WHERE id=1')).stock, 0);
});
