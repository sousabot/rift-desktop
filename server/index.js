// Rift.lol API proxy — holds the Riot key on the server.
// Desktop builds call this instead of talking to Riot with a key in the .exe.
//
// Local:  npm run server
// Host:   Render / Railway / Fly — set RIOT_API_KEY, RIFT_APP_TOKEN, and optional DISCORD_WEBHOOK_URL

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { normalizeEnv, appToken } = require('../electron/rift-env');
normalizeEnv();

const PORT = Number(process.env.PORT) || 8787;
const TOKEN = appToken();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 200;
const hits = new Map();

function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const row = hits.get(ip) || { count: 0, start: now };
  if (now - row.start > WINDOW_MS) {
    row.count = 0;
    row.start = now;
  }
  row.count += 1;
  hits.set(ip, row);
  return row.count > MAX_PER_WINDOW;
}

function isRiotUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /^[\w.-]+\.api\.riotgames\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 50_000) {
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(json);
}

function isLocalClient(req) {
  const ip = clientIp(req);
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

function authorized(req) {
  if (!TOKEN) return isLocalClient(req);
  const header = String(req.headers.authorization || '');
  const want = `Bearer ${TOKEN}`;
  const a = Buffer.from(header);
  const b = Buffer.from(want);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function proxyRiot(url) {
  const key = String(process.env.RIOT_API_KEY || '').trim();
  if (!key) {
    const err = new Error('RIOT_API_KEY is not set on the server');
    err.status = 500;
    throw err;
  }
  const res = await fetch(url, { headers: { 'X-Riot-Token': key } });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, ok: res.ok, statusText: res.statusText, data };
}

async function serverRiotFetch(url) {
  const result = await proxyRiot(url);
  if (!result.ok) {
    const err = new Error(`Riot API ${result.status} ${result.statusText}`);
    err.status = result.status;
    throw err;
  }
  return result.data;
}

const spectateFeed = require('../electron/spectate-feed').createScanner({ riotFetch: serverRiotFetch });
const premium = require('./premium');

async function postDiscord(payload) {
  const webhook = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!webhook) {
    const err = new Error('DISCORD_WEBHOOK_URL is not set on the server');
    err.status = 500;
    throw err;
  }
  const kind = payload.kind === 'feedback' ? 'Feedback' : 'Bug';
  const title = clip(payload.title, 120);
  const message = clip(payload.message, 1800);
  if (!title || !message) {
    const err = new Error('Title and details are required.');
    err.status = 400;
    throw err;
  }
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Rift.lol',
      embeds: [{
        title: `${kind}: ${title}`,
        description: message,
        color: kind === 'Bug' ? 0xff5c68 : 0x7c5cff,
        fields: [
          { name: 'Type', value: kind, inline: true },
          { name: 'Riot ID', value: clip(payload.riotId, 80) || 'Not linked', inline: true },
          { name: 'Page', value: clip(payload.page, 80) || '/', inline: true },
          { name: 'Contact', value: clip(payload.contact, 80) || '—', inline: true },
          { name: 'App', value: clip(payload.appVersion, 40) || '0.1.0', inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Discord webhook failed (${res.status}). ${body.slice(0, 180)}`);
    err.status = 502;
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    send(res, 200, { ok: true, service: 'rift-lol-api' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/riot.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ee7b2f2b-2c10-4c44-8dd0-50a5206233c1');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/premium/success') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(premium.successHtml(url.searchParams.get('session_id')));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/premium/cancel') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(premium.cancelHtml());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/premium/status') {
    send(res, 200, premium.statusPayload());
    return;
  }

  if (rateLimited(clientIp(req))) {
    send(res, 429, { error: 'Rate limit — wait 2 minutes and try again.' });
    return;
  }

  if (!authorized(req)) {
    console.log(`[rift-api] ${req.method} ${url.pathname} -> 401 unauthorized`);
    send(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/v1/status') {
      const result = await proxyRiot('https://euw1.api.riotgames.com/lol/status/v4/platform-data');
      console.log(`[rift-api] GET /v1/status -> ${result.status}`);
      send(res, 200, { ok: result.ok, riotStatus: result.status, riotStatusText: result.statusText });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/spectate') {
      const platforms = spectateFeed.pickPlatforms(
        url.searchParams.get('platforms') || url.searchParams.get('platform') || '',
      );
      const force = url.searchParams.get('force') === '1';
      const snap = spectateFeed.snapshot(platforms, { keys: true });
      const stale = force || !snap.updatedAt || Date.now() - snap.updatedAt > 150000;
      if (stale) spectateFeed.refresh(platforms).catch((err) => {
        console.log(`[rift-api] spectate refresh failed: ${err.message || err}`);
      });
      const next = spectateFeed.snapshot(platforms, { keys: true });
      send(res, 200, { ...next, scanning: stale || next.scanning });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/riot') {
      const body = await readJson(req);
      if (!isRiotUrl(body.url)) {
        send(res, 400, { error: 'Only Riot API URLs are allowed.' });
        return;
      }
      const result = await proxyRiot(body.url);
      console.log(`[rift-api] POST /v1/riot -> ${result.status} ${result.statusText}`);
      send(res, result.ok ? 200 : result.status, result.ok
        ? { data: result.data }
        : { error: `Riot API ${result.status} ${result.statusText}`, data: result.data });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/feedback') {
      await postDiscord(await readJson(req));
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/premium/checkout') {
      const body = await readJson(req);
      const session = await premium.createCheckoutSession({
        plan: body.plan,
        deviceId: body.deviceId,
        riotId: body.riotId,
      }, req);
      send(res, 200, session);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/premium/redeem') {
      const body = await readJson(req);
      const result = await premium.redeemCheckoutSession({
        sessionId: body.sessionId,
        deviceId: body.deviceId,
      });
      send(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/premium/gift') {
      const body = await readJson(req);
      const result = premium.redeemGiftCode(body.code, {
        deviceId: body.deviceId,
        riotId: body.riotId,
      });
      send(res, 200, result);
      return;
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.log(`[rift-api] ${req.method} ${url.pathname} -> ${err.status || 500}`);
    send(res, err.status || 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`[rift-api] listening on :${PORT}`);
  if (!process.env.RIOT_API_KEY) console.warn('[rift-api] RIOT_API_KEY is not set');
  if (!TOKEN) {
    console.warn('[rift-api] RIFT_APP_TOKEN is empty — only localhost may call /v1/*');
  } else {
    console.log('[rift-api] RIFT_APP_TOKEN required for /v1/*');
  }
  spectateFeed.start().catch(() => {});
});
