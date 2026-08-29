/**
 * Stripe Checkout helpers for Rift.lol Premium.
 * Uses Stripe REST (no stripe SDK) so the proxy stays dependency-light.
 */

const crypto = require('crypto');

const PLAN_IDS = new Set(['month', 'six', 'year']);

function stripeKey() {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function licenseSecret() {
  return String(process.env.PREMIUM_LICENSE_SECRET || process.env.STRIPE_SECRET_KEY || '').trim();
}

function catalogMap() {
  return {
    month: String(process.env.STRIPE_PRICE_MONTH || process.env.STRIPE_PRODUCT_MONTH || '').trim(),
    six: String(process.env.STRIPE_PRICE_SIX || process.env.STRIPE_PRODUCT_SIX || '').trim(),
    year: String(process.env.STRIPE_PRICE_YEAR || process.env.STRIPE_PRODUCT_YEAR || '').trim(),
  };
}

/** @deprecated use catalogMap — kept for status checks */
function priceMap() {
  return catalogMap();
}

function isStripeReady() {
  const key = stripeKey();
  const catalog = catalogMap();
  return Boolean(key && catalog.month && catalog.six && catalog.year);
}

function statusPayload() {
  const catalog = catalogMap();
  return {
    stripe: isStripeReady(),
    plans: {
      month: Boolean(catalog.month),
      six: Boolean(catalog.six),
      year: Boolean(catalog.year),
    },
    demo: !isStripeReady(),
  };
}

function formBody(obj) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') continue;
    params.append(k, String(v));
  }
  return params.toString();
}

async function stripeRequest(method, path, body) {
  const key = stripeKey();
  if (!key) {
    const err = new Error('STRIPE_SECRET_KEY is not set');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? formBody(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe ${res.status}`);
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.data = data;
    throw err;
  }
  return data;
}

function baseUrl(req) {
  const env = String(process.env.STRIPE_PUBLIC_URL || process.env.RIFT_API_URL || '').trim().replace(/\/$/, '');
  if (env) return env;
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:8787';
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

async function resolvePriceId(idOrProduct) {
  const id = String(idOrProduct || '').trim();
  if (!id) {
    const err = new Error('Missing Stripe price/product id');
    err.status = 500;
    throw err;
  }
  if (id.startsWith('price_')) return id;
  if (id.startsWith('prod_')) {
    const product = await stripeRequest('GET', `/products/${encodeURIComponent(id)}`);
    const defaultPrice = typeof product.default_price === 'string'
      ? product.default_price
      : product.default_price?.id;
    if (!defaultPrice) {
      const err = new Error(`Stripe product ${id} has no default price — open the product and set a default Price, or put a price_… id in .env`);
      err.status = 500;
      throw err;
    }
    return defaultPrice;
  }
  const err = new Error(`Invalid Stripe id "${id}" — use price_… or prod_…`);
  err.status = 400;
  throw err;
}

async function priceMode(priceId) {
  const price = await stripeRequest('GET', `/prices/${encodeURIComponent(priceId)}`);
  // Recurring catalog (month / 6mo / year) must use Checkout subscription mode.
  if (price?.type === 'recurring' || price?.recurring) return 'subscription';
  return 'payment';
}

async function createCheckoutSession({ plan, deviceId, riotId }, req) {
  if (!PLAN_IDS.has(plan)) {
    const err = new Error('Unknown plan');
    err.status = 400;
    throw err;
  }
  if (!isStripeReady()) {
    const err = new Error('Stripe is not configured on the server');
    err.status = 503;
    throw err;
  }
  const price = await resolvePriceId(catalogMap()[plan]);
  // All Rift.lol Premium Stripe prices are recurring (month / 6mo / year).
  const mode = 'subscription';
  const origin = baseUrl(req);
  const success = String(process.env.STRIPE_SUCCESS_URL || '').trim()
    || `${origin}/v1/premium/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancel = String(process.env.STRIPE_CANCEL_URL || '').trim()
    || `${origin}/v1/premium/cancel`;

  const body = {
    mode,
    success_url: success,
    cancel_url: cancel,
    client_reference_id: String(deviceId || '').slice(0, 200),
    'line_items[0][price]': price,
    'line_items[0][quantity]': 1,
    'metadata[plan]': plan,
    'metadata[deviceId]': String(deviceId || '').slice(0, 200),
    'metadata[riotId]': String(riotId || '').slice(0, 80),
  };
  if (mode === 'subscription') {
    body['subscription_data[metadata][plan]'] = plan;
    body['subscription_data[metadata][deviceId]'] = String(deviceId || '').slice(0, 200);
  } else {
    body['payment_intent_data[metadata][plan]'] = plan;
    body['payment_intent_data[metadata][deviceId]'] = String(deviceId || '').slice(0, 200);
  }

  const session = await stripeRequest('POST', '/checkout/sessions', body);

  return {
    id: session.id,
    url: session.url,
    plan,
    priceId: price,
    mode,
  };
}

function signLicense(payload) {
  const secret = licenseSecret();
  if (!secret) {
    const err = new Error('PREMIUM_LICENSE_SECRET (or STRIPE_SECRET_KEY) is required to issue licenses');
    err.status = 500;
    throw err;
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyLicense(token, deviceId) {
  const secret = licenseSecret();
  if (!secret || !token) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.deviceId && deviceId && payload.deviceId !== deviceId) return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function redeemCheckoutSession({ sessionId, deviceId }) {
  if (!sessionId) {
    const err = new Error('session_id is required');
    err.status = 400;
    throw err;
  }

  let session;
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    session = await stripeRequest('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (session.payment_status === 'paid' || session.status === 'complete') break;
    lastErr = new Error('Checkout is not paid yet — finish payment in the browser, then verify again.');
    lastErr.status = 402;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    throw lastErr || Object.assign(new Error('Checkout is not paid yet'), { status: 402 });
  }
  const plan = session.metadata?.plan || 'six';
  const boundDevice = session.metadata?.deviceId || session.client_reference_id || '';
  // Website checkout uses a temporary web-* id — allow the desktop app to claim it.
  const webCheckout = /^web-/i.test(String(boundDevice));
  if (boundDevice && deviceId && boundDevice !== deviceId && !webCheckout) {
    const err = new Error('This payment is bound to another install. Open Rift.lol on the PC that started checkout.');
    err.status = 403;
    throw err;
  }
  const license = signLicense({
    v: 1,
    plan,
    deviceId: deviceId || boundDevice || null,
    sessionId: session.id,
    iat: Date.now(),
    // Lifetime license for one-time payment plans (month/six/year are prepaid windows — client can track later)
    exp: null,
  });
  return {
    ok: true,
    plan,
    license,
    sessionId: session.id,
  };
}

function successHtml(sessionId) {
  const safe = String(sessionId || '').replace(/[<>&"']/g, '');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Rift.lol Premium — activate in the app</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Segoe UI,system-ui,sans-serif;
  background:#0b0e16;color:#eceefb}
  .card{max-width:480px;padding:28px;border-radius:16px;background:#12121b;border:1px solid rgba(255,180,84,.35)}
  h1{margin:0 0 8px;font-size:22px} p{color:#8890b5;line-height:1.5;margin:0 0 12px}
  ol{margin:0 0 16px;padding-left:1.2rem;color:#c8cde6;line-height:1.55}
  li{margin:0 0 6px}
  code{display:block;margin:12px 0 16px;padding:12px;border-radius:10px;background:#0b0e16;word-break:break-all;font-size:12px;color:#ffb454;user-select:all}
  .btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 18px;border-radius:999px;
    background:linear-gradient(180deg,#ffc56e,#ffb454);color:#1a1206;font-weight:700;text-decoration:none}
  .hint{font-size:13px;color:#6b7394}
</style></head><body><div class="card">
  <h1>Payment received</h1>
  <p>Premium is paid — unlock it inside the Windows app:</p>
  <ol>
    <li>Install / open <strong>Rift.lol</strong> on this PC</li>
    <li>Go to <strong>Premium</strong> in the sidebar</li>
    <li>Paste the session id below → tap <strong>Verify payment</strong></li>
  </ol>
  <code id="sid">${safe || '(missing session id)'}</code>
  <p class="hint">Keep this tab until Premium shows as active in the app.</p>
  <a class="btn" href="https://sousabot.github.io/rift-desktop/#/get-app?section=download">Download the app</a>
</div>
<script>
  try {
    const el = document.getElementById('sid');
    if (el && el.textContent && !el.textContent.startsWith('(')) {
      navigator.clipboard.writeText(el.textContent.trim()).catch(() => {});
    }
  } catch (_) {}
</script>
</body></html>`;
}

function cancelHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Checkout cancelled</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Segoe UI,system-ui,sans-serif;background:#0b0e16;color:#eceefb}
.card{padding:28px;border-radius:16px;background:#12121b;border:1px solid rgba(255,255,255,.08);max-width:400px}
p{color:#8890b5}</style></head>
<body><div class="card"><h1>Checkout cancelled</h1><p>No charge was made. You can close this tab and try again in Rift.lol.</p></div></body></html>`;
}

function giftAliases() {
  // PREMIUM_GIFT_CODES=FRIEND1:year,BETA2026:six:1,LAUNCH:month:25
  // format: CODE:plan[:maxUses]  (maxUses defaults to 1)
  const raw = String(process.env.PREMIUM_GIFT_CODES || '').trim();
  const map = {};
  if (!raw) return map;
  raw.split(/[,;\s]+/).forEach((part) => {
    const bit = part.trim();
    if (!bit) return;
    const [code, plan, uses] = bit.split(':');
    const key = String(code || '').trim().toUpperCase();
    const planId = String(plan || 'six').trim().toLowerCase();
    const maxUses = Math.max(1, Number(uses) || 1);
    if (key && PLAN_IDS.has(planId)) map[key] = { plan: planId, maxUses };
  });
  return map;
}

/** Create a shareable gift code. days = 0 means no expiry. */
function createGiftCode({ plan = 'six', days = 365, note = '', maxUses = 1 } = {}) {
  if (!PLAN_IDS.has(plan)) {
    const err = new Error('Unknown plan');
    err.status = 400;
    throw err;
  }
  const secret = licenseSecret();
  if (!secret) {
    const err = new Error('Set PREMIUM_LICENSE_SECRET or STRIPE_SECRET_KEY to mint gift codes');
    err.status = 500;
    throw err;
  }
  const exp = days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : null;
  const payload = {
    kind: 'gift',
    plan,
    exp,
    jti: crypto.randomBytes(10).toString('hex'),
    maxUses: Math.max(1, Number(maxUses) || 1),
    note: String(note || '').slice(0, 40) || null,
    iat: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`gift:${body}`).digest('base64url');
  return {
    code: `RIFT-${body}.${sig}`,
    plan,
    exp,
    jti: payload.jti,
    maxUses: payload.maxUses,
  };
}

function redeemGiftCode(rawCode, { deviceId = '', riotId = '' } = {}) {
  const giftStore = require('./gift-store');
  const code = String(rawCode || '').trim();
  if (!code) {
    const err = new Error('Gift code is required');
    err.status = 400;
    throw err;
  }
  if (!String(riotId || '').trim()) {
    const err = new Error('Link a Riot ID before redeeming a gift code.');
    err.status = 400;
    throw err;
  }

  const alias = giftAliases()[code.toUpperCase()];
  if (alias) {
    giftStore.claimGift({
      giftKey: code.toUpperCase(),
      plan: alias.plan,
      maxUses: alias.maxUses,
      deviceId,
      riotId,
    });
    const license = signLicense({
      v: 1,
      plan: alias.plan,
      source: 'gift',
      gift: code.toUpperCase(),
      riotId: String(riotId).trim(),
      iat: Date.now(),
      exp: null,
    });
    return { ok: true, plan: alias.plan, license, source: 'gift' };
  }

  const trimmed = code.replace(/^RIFT-/i, '');
  const [body, sig] = trimmed.split('.');
  if (!body || !sig) {
    const err = new Error('Invalid gift code');
    err.status = 400;
    throw err;
  }
  const secret = licenseSecret();
  if (!secret) {
    const err = new Error('Gift codes are not configured on this install');
    err.status = 503;
    throw err;
  }
  const expect = crypto.createHmac('sha256', secret).update(`gift:${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const err = new Error('Invalid gift code');
    err.status = 400;
    throw err;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    const err = new Error('Invalid gift code');
    err.status = 400;
    throw err;
  }
  if (payload.kind !== 'gift' || !PLAN_IDS.has(payload.plan)) {
    const err = new Error('Invalid gift code');
    err.status = 400;
    throw err;
  }
  if (payload.exp && Date.now() > payload.exp) {
    const err = new Error('This gift code has expired');
    err.status = 410;
    throw err;
  }

  const giftKey = String(payload.jti || body).toUpperCase();
  giftStore.claimGift({
    giftKey,
    plan: payload.plan,
    maxUses: payload.maxUses || 1,
    deviceId,
    riotId,
  });

  const license = signLicense({
    v: 1,
    plan: payload.plan,
    source: 'gift',
    giftNote: payload.note || null,
    riotId: String(riotId).trim(),
    iat: Date.now(),
    exp: payload.exp || null,
  });
  return { ok: true, plan: payload.plan, license, source: 'gift' };
}

module.exports = {
  PLAN_IDS,
  statusPayload,
  isStripeReady,
  createCheckoutSession,
  redeemCheckoutSession,
  verifyLicense,
  createGiftCode,
  redeemGiftCode,
  successHtml,
  cancelHtml,
};
