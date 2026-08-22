const fs = require('fs');
const path = require('path');

function storePath() {
  const custom = String(process.env.PREMIUM_GIFT_STORE || '').trim();
  if (custom) return custom;
  return path.join(__dirname, '..', 'data', 'gift-redemptions.json');
}

function readStore() {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && Array.isArray(data.redemptions)) return data;
  } catch { /* missing / corrupt */ }
  return { redemptions: [] };
}

function writeStore(data) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function normRiot(id) {
  return String(id || '').trim().toLowerCase();
}

function normDevice(id) {
  return String(id || '').trim();
}

/**
 * Enforce single-claim gifts.
 * Same Riot ID (or same device if no Riot ID) may reclaim after reinstall.
 * A different account / device cannot reuse the code once maxUses is hit.
 */
function claimGift({ giftKey, plan, maxUses = 1, deviceId, riotId }) {
  const key = String(giftKey || '').trim().toUpperCase();
  if (!key) {
    const err = new Error('Invalid gift code');
    err.status = 400;
    throw err;
  }
  const riot = normRiot(riotId);
  const device = normDevice(deviceId);
  if (!riot && !device) {
    const err = new Error('Link a Riot ID before redeeming a gift code.');
    err.status = 400;
    throw err;
  }

  const store = readStore();
  const rows = store.redemptions.filter((r) => String(r.giftKey).toUpperCase() === key);
  const mine = rows.find((r) => (
    (riot && normRiot(r.riotId) === riot)
    || (!riot && device && normDevice(r.deviceId) === device)
  ));

  if (mine) {
    return {
      ok: true,
      reused: true,
      plan: mine.plan || plan,
      giftKey: key,
    };
  }

  const limit = Math.max(1, Number(maxUses) || 1);
  if (rows.length >= limit) {
    const err = new Error('This gift code was already claimed.');
    err.status = 409;
    throw err;
  }

  store.redemptions.push({
    giftKey: key,
    plan,
    deviceId: device || null,
    riotId: riot || null,
    at: Date.now(),
  });
  writeStore(store);

  return {
    ok: true,
    reused: false,
    plan,
    giftKey: key,
  };
}

module.exports = {
  claimGift,
  storePath,
  readStore,
};
