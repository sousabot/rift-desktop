const { createScanner } = require('./spectate-feed');
const { DEFAULT_PROXY, apiUrl, appToken, useLocalKey } = require('./rift-env');
const { handle } = require('./ipc-handle');
const lcu = require('./lcu');
const SPECTATE_DELAY_SEC = 180;
const SPECTATE_HOST = {
  NA1: 'spectator.na.lol.pvp.net:80',
  BR1: 'spectator.br.lol.pvp.net:80',
  LA1: 'spectator.la1.lol.pvp.net:80',
  LA2: 'spectator.la2.lol.pvp.net:80',
  OC1: 'spectator.oc1.lol.pvp.net:80',
  KR: 'spectator.kr.lol.pvp.net:80',
  EUN1: 'spectator.eu.lol.pvp.net:8080',
  EUW1: 'spectator.euw1.lol.pvp.net:8080',
  TR1: 'spectator.tr.lol.pvp.net:80',
  RU: 'spectator.ru.lol.pvp.net:80',
  JP1: 'spectator.jp1.lol.pvp.net:8080',
  PH2: 'spectator.ph2.lol.pvp.net:80',
  SG2: 'spectator.sg2.lol.pvp.net:80',
  TH2: 'spectator.th2.lol.pvp.net:80',
  TW2: 'spectator.tw2.lol.pvp.net:80',
  VN2: 'spectator.vn2.lol.pvp.net:80',
  ME1: 'spectator.me1.lol.pvp.net:80',
};

function observerHosts(platformId) {
  const id = String(platformId || '').toUpperCase();
  const slug = String(platformId || '').toLowerCase();
  return [...new Set([
    `spectator-consumer.${slug}.lol.pvp.net:80`,
    SPECTATE_HOST[id],
    `spectator.${slug}.lol.pvp.net:8080`,
    `spectator.${slug}.lol.pvp.net:80`,
  ].filter(Boolean))];
}

async function probeObserver(host, platformId, gameId) {
  const url = `http://${host}/observer-mode/rest/consumer/getGameMetaData/${platformId}/${gameId}/1/token`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && (json.gameKey || json.delayTime != null || json.endStartupChunkId != null)) return json;
  } catch { /* host not serving this game */ }
  return null;
}

async function pickObserver(platformId, gameId) {
  const hosts = observerHosts(platformId);
  const classic = SPECTATE_HOST[String(platformId || '').toUpperCase()] || hosts[0];
  const found = await Promise.all(hosts.map(async (host) => {
    const meta = await probeObserver(host, platformId, gameId);
    return meta ? { host, meta } : null;
  }));
  const hits = found.filter(Boolean);
  return hits.find((row) => row.host === classic) || hits[0] || { host: classic, meta: null };
}

function proxyBase() {
  if (useLocalKey()) return '';
  return apiUrl() || DEFAULT_PROXY;
}

function proxyHeaders() {
  return {
    'User-Agent': 'Rift.lol-Desktop/0.1',
    ...(appToken() ? { Authorization: `Bearer ${appToken()}` } : {}),
  };
}

async function fetchProxyList(platforms, force = false) {
  const base = proxyBase();
  if (!base) return null;
  const qs = new URLSearchParams({ platforms: platforms.join(',') });
  if (force) qs.set('force', '1');
  const res = await fetch(`${base}/v1/spectate?${qs.toString()}`, {
    headers: proxyHeaders(),
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Proxy ${res.status}: ${body.error || res.statusText}`);
  }
  return res.json();
}

function register(ipcMain, { riotFetch }) {
  const scanner = createScanner({ riotFetch });
  const inflight = new Map();

  async function list(args = {}) {
    const platforms = scanner.pickPlatforms(args.platforms || args.platform || '');
    const key = platforms.slice().sort().join(',');
    const force = !!args.force;

    try {
      const remote = await fetchProxyList(platforms, force);
      if (remote && Array.isArray(remote.games)) {
        const decorated = await scanner.decorate(remote);
        scanner.ingest(decorated);
        return {
          ...decorated,
          games: scanner.snapshot(platforms).games,
          source: remote.source || 'proxy',
          scanning: !!remote.scanning,
          limited: !!remote.limited,
        };
      }
    } catch {
      /* old proxy or offline — scan from this app */
    }

    const snap = scanner.snapshot(platforms);
    const stale = force || !snap.updatedAt || Date.now() - snap.updatedAt > 75000;
    if (stale) {
      if (!inflight.has(key)) {
        inflight.set(key, scanner.refresh(platforms).finally(() => inflight.delete(key)));
      }
      if (!snap.games?.length) {
        try {
          return await inflight.get(key);
        } catch (err) {
          return { ok: false, games: [], error: err.message || 'Could not load live games.', scanning: false };
        }
      }
      return { ...snap, scanning: true };
    }
    return snap;
  }

  async function launch(args = {}) {
    const gameId = String(args.gameId || '');
    const platformId = String(args.platformId || '').toUpperCase();
    let packed = scanner.getLaunch(platformId, gameId);
    if (!packed?.encryptionKey && args.encryptionKey && gameId) {
      packed = {
        encryptionKey: String(args.encryptionKey),
        platformId,
        gameId,
        queueId: args.queueId,
        rawPlatform: args.rawPlatform || String(args.platform || platformId).toLowerCase(),
        gameStartTime: args.gameStartTime || 0,
        puuid: args.puuid || '',
      };
      scanner.storeLaunch({ ...packed, platform: packed.rawPlatform });
    }
    if (!packed?.encryptionKey) {
      return { ok: false, error: 'Could not start spectator for this game. Refresh Live Status, then try again.' };
    }
    packed.puuid = packed.puuid || args.puuid || '';
    packed.gameStartTime = packed.gameStartTime || args.gameStartTime || 0;

    const started = Number(packed.gameStartTime);
    if (started) {
      const waitSec = Math.max(0, SPECTATE_DELAY_SEC - Math.floor((Date.now() - started) / 1000));
      if (waitSec > 0) {
        return {
          ok: false,
          reason: 'delay',
          waitSec,
          error: `Spectator delay — available in ${Math.floor(waitSec / 60)}:${String(waitSec % 60).padStart(2, '0')}.`,
        };
      }
    }

    const picked = await pickObserver(platformId, packed.gameId);
    packed.observerHost = picked.host
      || SPECTATE_HOST[platformId]
      || observerHosts(platformId)[0];

    const viaLcu = await lcu.launchSpectate(packed);
    if (viaLcu.ok) return viaLcu;
    if (viaLcu.reason === 'busy' || viaLcu.reason === 'no-client' || viaLcu.reason === 'region') {
      return viaLcu;
    }
    return {
      ok: false,
      error: viaLcu.error || 'Could not start spectator.',
    };
  }

  handle(ipcMain, 'spectate:list', (_e, args) => list(args || {}));
  handle(ipcMain, 'spectate:launch', (_e, args) => launch(args || {}));
}

module.exports = { register };
