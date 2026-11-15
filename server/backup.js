'use strict';
// Consistent online backup of the SQLite database:  npm run backup   (writes BACKUP_DIR/shop-YYYYMMDD-HHMMSS.db)
const path = require('node:path'); const fs = require('node:fs');
const { db } = require('./db');
const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/^(\d{8})(\d{6}).*/, '$1-$2');
const out = path.join(dir, `shop-${ts}.db`);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
console.log('Backup written:', out, '(contains customer data — store it privately, never commit it)');
