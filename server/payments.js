'use strict';
/**
 * Payment architecture
 * --------------------
 * Each provider (bkash | nagad | rocket) can run in one of two modes:
 *
 *  1. GATEWAY mode  – merchant API credentials are present in the environment. The customer is sent to the
 *     provider, and an order is marked PAID only after provider.verify() confirms the transaction
 *     server-to-server. Nothing is ever marked paid because the browser said so.
 *
 *  2. MANUAL mode   – no API credentials, but the admin configured a merchant "send money" number in Settings.
 *     The customer pays by sending money and enters the TrxID. The order becomes "awaiting_verification"
 *     and stays that way until an admin checks the TrxID in their bKash/Nagad/Rocket merchant app and
 *     clicks "Mark paid". No automatic verification is claimed.
 *
 * If neither is configured, the method is hidden from checkout. Cash on Delivery is always available.
 *
 * STATUS OF THE ADAPTERS (honest):
 *  - bKash: request flow follows bKash "Tokenized Checkout" (grant token -> create -> execute). Written from the
 *    public docs and NOT tested against bKash sandbox/production. Test with sandbox credentials before enabling.
 *  - Nagad / Rocket (DBBL): merchant API access requires a signed merchant agreement and provider-issued keys
 *    and specs. Adapters are stubs that refuse to run. Use MANUAL mode until implemented.
 */
const { getSettings } = require('./db');

const env = process.env;
const providers = {
  bkash: {
    label: 'bKash',
    gatewayConfigured: () => !!(env.BKASH_BASE_URL && env.BKASH_APP_KEY && env.BKASH_APP_SECRET && env.BKASH_USERNAME && env.BKASH_PASSWORD),
    async initiate(order, { callbackUrl }) {
      const base = env.BKASH_BASE_URL.replace(/\/$/, '');
      const grant = await jpost(`${base}/tokenized/checkout/token/grant`, { app_key: env.BKASH_APP_KEY, app_secret: env.BKASH_APP_SECRET },
        { username: env.BKASH_USERNAME, password: env.BKASH_PASSWORD });
      const token = grant.id_token;
      if (!token) throw new Error('bKash token grant failed');
      const created = await jpost(`${base}/tokenized/checkout/create`, {
        mode: '0011', payerReference: order.phone, callbackURL: callbackUrl, amount: String(order.total),
        currency: 'BDT', intent: 'sale', merchantInvoiceNumber: order.order_no,
      }, { authorization: token, 'x-app-key': env.BKASH_APP_KEY });
      if (!created.bkashURL) throw new Error('bKash create payment failed');
      return { redirectUrl: created.bkashURL, providerRef: created.paymentID, token };
    },
    async verify({ paymentID }, order) {
      const base = env.BKASH_BASE_URL.replace(/\/$/, '');
      const grant = await jpost(`${base}/tokenized/checkout/token/grant`, { app_key: env.BKASH_APP_KEY, app_secret: env.BKASH_APP_SECRET },
        { username: env.BKASH_USERNAME, password: env.BKASH_PASSWORD });
      const r = await jpost(`${base}/tokenized/checkout/execute`, { paymentID }, { authorization: grant.id_token, 'x-app-key': env.BKASH_APP_KEY });
      const ok = r.statusCode === '0000' && r.transactionStatus === 'Completed' && Number(r.amount) === order.total && r.merchantInvoiceNumber === order.order_no;
      return { ok, trxId: r.trxID };
    },
  },
  nagad: { label: 'Nagad', gatewayConfigured: () => false, async initiate() { throw new Error('Nagad gateway adapter is not implemented.'); }, async verify() { return { ok: false }; } },
  rocket: { label: 'Rocket', gatewayConfigured: () => false, async initiate() { throw new Error('Rocket gateway adapter is not implemented.'); }, async verify() { return { ok: false }; } },
};

async function jpost(url, body, headers) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...headers }, body: JSON.stringify(body) });
  return res.json();
}

function methodStatus() {
  const s = getSettings();
  const out = { cod: { enabled: true, mode: 'cod' } };
  for (const [k, p] of Object.entries(providers)) {
    const manualNumber = (s[`manual_${k}_number`] || '').trim();
    if (p.gatewayConfigured()) out[k] = { enabled: true, mode: 'gateway', label: p.label };
    else if (manualNumber) out[k] = { enabled: true, mode: 'manual', label: p.label, number: manualNumber };
    else out[k] = { enabled: false, mode: 'none', label: p.label };
  }
  return out;
}
module.exports = { providers, methodStatus };
