'use strict';
// Notification layer. Currently: in-app notifications (admin panel) + server log.
// Email/SMS are NOT sent: no provider is configured. Add one here (e.g. SMTP via nodemailer, or a BD SMS gateway)
// and it will be used for password resets and order messages.
const { db } = require('./db');
function adminNotify(kind, message, ref) {
  db.prepare('INSERT INTO notifications(kind,message,ref) VALUES (?,?,?)').run(kind, message, ref || null);
}
function sendToCustomer(channel, to, text) {
  // No delivery provider configured.
  if (process.env.NODE_ENV !== 'production') console.log(`[notify:not-sent] ${channel} -> ${to}: ${text}`);
  return false;
}
module.exports = { adminNotify, sendToCustomer };
