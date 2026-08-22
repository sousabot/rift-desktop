const { shell } = require('electron');
const { apiUrl, appToken } = require('./rift-env');
const premium = require('../server/premium');

function proxyHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(appToken() ? { Authorization: `Bearer ${appToken()}` } : {}),
  };
}

function localStripeReady() {
  return premium.isStripeReady();
}

function fakeReq() {
  const base = apiUrl() || 'https://gd-desktop.onrender.com';
  let host = 'gd-desktop.onrender.com';
  let proto = 'https';
  try {
    const u = new URL(base);
    host = u.host;
    proto = u.protocol.replace(':', '') || 'https';
  } catch { /* keep defaults */ }
  return { headers: { host, 'x-forwarded-proto': proto } };
}

async function proxyJson(path, { method = 'GET', body } = {}) {
  const base = apiUrl();
  if (!base) {
    const err = new Error('RIFT_API_URL is not set — Stripe checkout needs the API proxy.');
    err.code = 'NO_PROXY';
    throw err;
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers: proxyHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Premium API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

module.exports = function registerPremiumHandlers(ipcMain) {
  try { ipcMain.removeHandler('premium:status'); } catch { /* first */ }
  try { ipcMain.removeHandler('premium:checkout'); } catch { /* first */ }
  try { ipcMain.removeHandler('premium:redeem'); } catch { /* first */ }
  try { ipcMain.removeHandler('premium:redeemGift'); } catch { /* first */ }
  try { ipcMain.removeHandler('premium:open'); } catch { /* first */ }

  ipcMain.handle('premium:status', async () => {
    // Local .env Stripe keys win for desktop testing (proxy may not have them yet).
    if (localStripeReady()) {
      return { ...premium.statusPayload(), local: true };
    }
    try {
      return await proxyJson('/v1/premium/status');
    } catch (err) {
      if (err.code === 'NO_PROXY') {
        return { stripe: false, demo: true, plans: {}, offline: true };
      }
      return { stripe: false, demo: true, plans: {}, error: err.message };
    }
  });

  ipcMain.handle('premium:checkout', async (_e, args = {}) => {
    let session;
    if (localStripeReady()) {
      if (!process.env.STRIPE_PUBLIC_URL && apiUrl()) {
        process.env.STRIPE_PUBLIC_URL = apiUrl();
      }
      session = await premium.createCheckoutSession({
        plan: args.plan,
        deviceId: args.deviceId,
        riotId: args.riotId,
      }, fakeReq());
    } else {
      session = await proxyJson('/v1/premium/checkout', {
        method: 'POST',
        body: {
          plan: args.plan,
          deviceId: args.deviceId,
          riotId: args.riotId,
        },
      });
    }
    if (session.url) {
      await shell.openExternal(session.url);
    }
    return session;
  });

  ipcMain.handle('premium:redeem', async (_e, args = {}) => {
    if (localStripeReady()) {
      return premium.redeemCheckoutSession({
        sessionId: args.sessionId,
        deviceId: args.deviceId,
      });
    }
    return proxyJson('/v1/premium/redeem', {
      method: 'POST',
      body: {
        sessionId: args.sessionId,
        deviceId: args.deviceId,
      },
    });
  });

  ipcMain.handle('premium:redeemGift', async (_e, args = {}) => {
    const payload = {
      code: args.code,
      deviceId: args.deviceId,
      riotId: args.riotId,
    };
    // Prefer the shared API ledger so one code cannot be used on many accounts.
    try {
      return await proxyJson('/v1/premium/gift', {
        method: 'POST',
        body: payload,
      });
    } catch (err) {
      if (err.code === 'NO_PROXY' || err.status === 404) {
        return premium.redeemGiftCode(payload.code, payload);
      }
      throw err;
    }
  });

  ipcMain.handle('premium:open', async (_e, url) => {
    if (!url) return { ok: false };
    await shell.openExternal(String(url));
    return { ok: true };
  });
};
