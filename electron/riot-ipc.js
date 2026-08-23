// Runs in the Electron MAIN process (plain Node — no CORS restriction).
// Requires RIOT_API_KEY in .env (copy .env.example -> .env and fill it in).
// Dev keys from https://developer.riotgames.com expire every 24h.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULT_PROXY, normalizeEnv, apiUrl, appToken, useLocalKey } = require('./rift-env');
const idCache = require('./id-cache');
const matchCache = require('./match-cache');

function envCandidates() {
  const names = ['rift.env', 'gd.env', 'client.env', '.env'];
  const dirs = [];
  const addDir = (dir) => { if (dir) dirs.push(dir); };

  addDir(process.resourcesPath);
  addDir(process.execPath && path.dirname(process.execPath));
  addDir(process.env.PORTABLE_EXECUTABLE_DIR);
  addDir(path.join(__dirname, '..'));
  addDir(path.join(__dirname, '..', '..'));
  addDir(process.cwd());
  try { addDir(app.getPath('userData')); } catch { /* before ready */ }

  const files = [];
  dirs.forEach((dir) => names.forEach((name) => files.push(path.join(dir, name))));
  return files;
}

function applyEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value && (key === 'RIFT_APP_TOKEN' || key === 'GD_APP_TOKEN' || key === 'RIOT_API_KEY')) return;
    if (
      key === 'RIOT_API_KEY'
      || key === 'DISCORD_WEBHOOK_URL'
      || key === 'RIFT_API_URL'
      || key === 'RIFT_APP_TOKEN'
      || key === 'GD_API_URL'
      || key === 'GD_APP_TOKEN'
      || key === 'STRIPE_SECRET_KEY'
      || key === 'STRIPE_PRICE_MONTH'
      || key === 'STRIPE_PRICE_SIX'
      || key === 'STRIPE_PRICE_YEAR'
      || key === 'STRIPE_PRODUCT_MONTH'
      || key === 'STRIPE_PRODUCT_SIX'
      || key === 'STRIPE_PRODUCT_YEAR'
      || key === 'PREMIUM_LICENSE_SECRET'
      || key === 'PREMIUM_GIFT_CODES'
      || key === 'STRIPE_PUBLIC_URL'
      || !process.env[key]
    ) {
      process.env[key] = value;
    }
  });
}

function loadEnv() {
  const files = envCandidates().filter((p) => fs.existsSync(p));
  if (files.length) {
    files.forEach((file) => applyEnvFile(file));
    console.log(`[riot-ipc] Loaded env from ${files.join(', ')}`);
  } else {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    console.warn('[riot-ipc] No rift.env/.env found next to the app.');
  }
  if (process.env.RIOT_API_KEY) {
    process.env.RIOT_API_KEY = process.env.RIOT_API_KEY.trim();
  }
  normalizeEnv();
  // Packaged testers must hit the proxy even if rift.env failed to unpack.
  if (app.isPackaged) {
    process.env.RIFT_API_URL = apiUrl() || DEFAULT_PROXY;
    console.log(`[riot-ipc] Packaged build: using API proxy ${process.env.RIFT_API_URL}`);
    if (!appToken()) {
      console.warn('[riot-ipc] Packaged build is missing RIFT_APP_TOKEN in rift.env. The proxy will reject requests.');
    }
  }
}

loadEnv();

function isRiotUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /^[\w.-]+\.api\.riotgames\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function activeProxy() {
  if (useLocalKey()) return '';
  return apiUrl() || DEFAULT_PROXY;
}

let proxyReady = false;
let wakingProxy = null;

async function wakeProxy() {
  const proxy = activeProxy();
  if (!proxy) return { ok: true, skipped: true };
  if (proxyReady) return { ok: true };
  if (wakingProxy) return wakingProxy;
  wakingProxy = (async () => {
    try {
      const res = await fetch(`${proxy}/health`, {
        headers: { 'User-Agent': 'Rift.lol-Desktop/0.1' },
        signal: AbortSignal.timeout(45000),
      });
      if (res.ok) proxyReady = true;
      return { ok: res.ok };
    } catch (err) {
      wakingProxy = null;
      return { ok: false, error: err.message || 'Rift.lol API wake failed' };
    }
  })();
  return wakingProxy;
}

async function riotFetch(url, attempt = 0) {
  if (!process.env.RIOT_API_KEY && !apiUrl()) loadEnv();
  if (!isRiotUrl(url)) throw new Error('Riot API 400 Bad Request — blocked URL');

  const proxy = activeProxy();
  if (proxy) {
    if (app.isPackaged && !appToken()) {
      throw new Error('Proxy 401: RIFT_APP_TOKEN is missing from rift.env');
    }
    await wakeProxy();
    const res = await fetch(`${proxy}/v1/riot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Rift.lol-Desktop/0.1',
        ...(appToken() ? { Authorization: `Bearer ${appToken()}` } : {}),
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    // Do not retry our proxy's 429 — each retry burns the same 60s window.
    if (!res.ok) {
      throw new Error(`Proxy ${res.status}: ${body.error || res.statusText || 'request failed'}`);
    }
    return body.data;
  }

  const key = String(process.env.RIOT_API_KEY || '').trim();
  if (!key) throw new Error('RIOT_API_KEY is not set in .env');

  const res = await fetch(url, {
    headers: { 'X-Riot-Token': key },
    signal: AbortSignal.timeout(12000),
  });

  if (res.status === 429 && attempt < 2) {
    const retryAfterSec = Number(res.headers.get('retry-after')) || 1;
    // A short Retry-After means we tripped the ~20/sec burst limit — worth
    // waiting out. A long one means the ~100-per-2-minutes budget is blown;
    // don't freeze the UI for up to 2 minutes, fail fast instead so the
    // existing per-feature fallbacks (honest errors, masked names, etc.) kick in.
    if (retryAfterSec <= 5) {
      await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
      return riotFetch(url, attempt + 1);
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Riot API ${res.status} ${res.statusText} — ${url}\n${body}`);
  }
  return res.json();
}

// Fetches items in parallel, capped at `limit` in flight at once — fast, but
// stays comfortably under Riot's per-second rate limit instead of firing all
// 10+ requests at the exact same instant.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const BULK_CONCURRENCY = 5;

// account-v1 is global and only accepts europe / americas / asia (not sea).
function accountHost(region) {
  const value = String(region || 'europe').toLowerCase();
  if (value === 'americas' || value === 'na' || value === 'na1' || value === 'br1' || value === 'la1' || value === 'la2') {
    return 'americas';
  }
  if (value === 'asia' || value === 'sea' || value === 'kr' || value === 'jp1' || value === 'oc1') {
    return 'asia';
  }
  return 'europe';
}

const PLATFORM_TO_MATCH_REGION = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', sg2: 'sea', ph2: 'sea', tw2: 'sea', th2: 'sea', vn2: 'sea',
};

const ALL_PLATFORMS = Object.keys(PLATFORM_TO_MATCH_REGION);

function apiStatus(err) {
  const match = String(err?.message || '').match(/(?:Riot API|Proxy) (\d+)/);
  return match ? Number(match[1]) : 0;
}

// Reads a cache module once, fetches only ids that are missing or stale, then
// writes the merged result back once. `ttlMs: Infinity` (the default) means
// entries never go stale — correct for match/timeline data, which can't
// change once a game is over. The puuid cache passes its own shorter TTL.
async function cachedBulkFetch(cacheModule, prefix, ids, fetchOne, ttlMs = Infinity) {
  const cache = cacheModule.readCache();
  const now = Date.now();
  const results = new Array(ids.length).fill(null);
  const missing = [];

  ids.forEach((id, i) => {
    const entry = cache[`${prefix}:${id}`];
    const fresh = entry && (ttlMs === Infinity || now - entry.timestamp < ttlMs);
    // Empty arrays are usually a 429/error fallback — do not treat them as a real result.
    if (fresh && entry.data != null && !(Array.isArray(entry.data) && entry.data.length === 0)) {
      results[i] = entry.data;
    } else {
      missing.push(i);
    }
  });

  if (missing.length) {
    const fetched = await mapWithConcurrency(missing, BULK_CONCURRENCY, (i) => fetchOne(ids[i]));
    missing.forEach((origIdx, j) => {
      results[origIdx] = fetched[j];
      if (fetched[j] != null && !(Array.isArray(fetched[j]) && fetched[j].length === 0)) {
        cache[`${prefix}:${ids[origIdx]}`] = { timestamp: now, data: fetched[j] };
      }
    });
    cacheModule.writeCache(cache);
  }

  return results;
}

module.exports = function registerRiotHandlers(ipcMain) {
  const useLocal = useLocalKey();
  const proxy = useLocal
    ? ''
    : (apiUrl() || DEFAULT_PROXY);
  if (proxy) {
    console.log(`[riot-ipc] Using API proxy ${proxy}`);
  } else if (process.env.RIOT_API_KEY) {
    console.log(`[riot-ipc] API key loaded (${process.env.RIOT_API_KEY.slice(0, 8)}…)`);
  } else {
    console.warn('[riot-ipc] No RIFT_API_URL or RIOT_API_KEY — live Riot data will fail.');
  }

  // Riot ID rarely changes — cache the single-lookup version too, since
  // re-searching the same player repeatedly (e.g. during dev testing) was
  // re-fetching this every time for no reason.
  async function fetchAccountByRiotId(gameName, tagLine, region) {
    const name = String(gameName || '').trim();
    const tag = String(tagLine || '').trim().replace(/^#/, '');
    if (!name || !tag) throw new Error('Riot API 400 Bad Request — missing Riot ID');

    const preferred = accountHost(region);
    const hosts = [preferred, 'europe', 'americas', 'asia'].filter((h, i, all) => all.indexOf(h) === i);
    let lastErr = null;
    for (const host of hosts) {
      const cacheKey = `riotid:${host}:${name.toLowerCase()}#${tag.toLowerCase()}`;
      const cache = idCache.readCache();
      const entry = cache[cacheKey];
      if (entry && Date.now() - entry.timestamp < idCache.TTL_MS) return entry.data;

      try {
        const data = await riotFetch(
          `https://${host}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
        );
        cache[cacheKey] = { timestamp: Date.now(), data };
        idCache.writeCache(cache);
        return data;
      } catch (err) {
        lastErr = err;
        if (apiStatus(err) !== 404) throw err;
      }
    }
    throw lastErr || new Error('Riot API 404 Not Found — account');
  }

  ipcMain.handle('riot:getAccountByRiotId', (_e, { gameName, tagLine, region }) =>
    fetchAccountByRiotId(gameName, tagLine, region)
  );

  ipcMain.handle('riot:wakeProxy', () => wakeProxy());
  wakeProxy().catch(() => {});

  async function findLeagueShard(puuid, preferredPlatform) {
    const cacheKey = `shard:${puuid}`;
    const cache = idCache.readCache();
    const cached = cache[cacheKey];
    if (cached && Date.now() - cached.timestamp < idCache.TTL_MS) return cached.data;

    const preferred = String(preferredPlatform || 'euw1').toLowerCase();
    const preferredOk = PLATFORM_TO_MATCH_REGION[preferred] ? preferred : 'euw1';
    const continent = PLATFORM_TO_MATCH_REGION[preferredOk];
    const sameRegion = ALL_PLATFORMS.filter((p) => PLATFORM_TO_MATCH_REGION[p] === continent && p !== preferredOk);
    const others = ALL_PLATFORMS.filter((p) => p !== preferredOk && PLATFORM_TO_MATCH_REGION[p] !== continent);
    const order = [preferredOk, ...sameRegion, ...others];

    const probe = async (plat) => {
      try {
        await riotFetch(`https://${plat}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`);
        return { plat };
      } catch (err) {
        const status = apiStatus(err);
        if (status === 404 || status === 400) return { miss: true };
        return { err };
      }
    };

    const save = (plat) => {
      cache[cacheKey] = { timestamp: Date.now(), data: plat };
      idCache.writeCache(cache);
      return plat;
    };

    for (let i = 0; i < order.length; i += (i === 0 ? 1 : 4)) {
      const batch = i === 0 ? [order[0]] : order.slice(i, i + 4);
      const results = await Promise.all(batch.map(probe));
      const hit = results.find((r) => r.plat);
      if (hit) return save(hit.plat);
      const fatal = results.find((r) => r.err);
      if (fatal) {
        const status = apiStatus(fatal.err);
        if (status === 429 || status === 401 || status === 403) break;
        throw fatal.err;
      }
    }

    return save(preferredOk);
  }

  function shardInfo(shard, fallbackRegion) {
    return {
      platform: shard,
      region: PLATFORM_TO_MATCH_REGION[shard] || accountHost(fallbackRegion),
    };
  }

  ipcMain.handle('riot:getLeagueShard', async (_e, { puuid, region, platform }) => {
    const shard = await findLeagueShard(puuid, platform, accountHost(region));
    return shardInfo(shard, region);
  });

  ipcMain.handle('riot:linkAccount', async (_e, { gameName, tagLine, region, platform }) => {
    // Ownership: must be logged into this Riot ID in the local League client.
    await require('./lcu').assertLoggedInAs(gameName, tagLine);
    const account = await fetchAccountByRiotId(gameName, tagLine, region);
    const accountRegion = accountHost(region);
    const shard = await findLeagueShard(account.puuid, platform, accountRegion);
    return {
      gameName: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      ...shardInfo(shard, region),
    };
  });

  // Not cached: profileIconId here can lag a day behind if changed, which is an
  // acceptable trade-off — same reasoning as the bulk summoner lookup.
  ipcMain.handle('riot:getSummonerByPuuid', async (_e, { puuid, platform }) => {
    const key = `summonerSingle:${puuid}`;
    const cache = idCache.readCache();
    const entry = cache[key];
    if (entry && Date.now() - entry.timestamp < idCache.TTL_MS) return entry.data;

    const data = await riotFetch(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`);
    cache[key] = { timestamp: Date.now(), data };
    idCache.writeCache(cache);
    return data;
  });

  ipcMain.handle('riot:getRankedEntries', (_e, { summonerId, platform }) =>
    riotFetch(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`)
  );

  // Dev-key friendly: ranked by PUUID directly
  ipcMain.handle('riot:getRankedByPuuid', (_e, { puuid, platform }) =>
    riotFetch(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`)
  );

  ipcMain.handle('riot:getRankedByPuuidsBulk', (_e, { puuids, platform }) =>
    cachedBulkFetch(idCache, `ranked-v2:${platform || 'euw1'}`, puuids, async (puuid) => {
      try {
        return await riotFetch(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
      } catch {
        return null;
      }
    }, 15 * 60 * 1000)
  );

  ipcMain.handle('riot:getMatchIds', (_e, { puuid, region, count = 10, queue }) => {
    const queueParam = queue ? `&queue=${queue}` : '';
    return riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}${queueParam}`);
  });

  ipcMain.handle('riot:getMatchesBulk', (_e, { matchIds, region }) =>
    cachedBulkFetch(matchCache, 'match', matchIds, (id) =>
      riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`).catch(() => null)
    )
  );

  // Needed for Gold Diff @15 / K+A Diff @15 — match-v5 alone has no @15min snapshot.
  ipcMain.handle('riot:getTimelinesBulk', (_e, { matchIds, region }) =>
    cachedBulkFetch(matchCache, 'timeline', matchIds, (id) =>
      riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}/timeline`).catch(() => null)
    )
  );

  ipcMain.handle('riot:getActiveGame', (_e, { puuid, platform }) =>
    riotFetch(`https://${platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`)
  );

  // Master league-v4 dumps up to 10k players through IPC — that's why the
  // Master tab felt stuck on Challenger names. Limited fetches (leaderboard)
  // use league-exp page 1 (~205 highest-LP entries) and cache for 5 minutes.
  const LEAGUE_TTL_MS = 5 * 60 * 1000;
  const LEADERBOARD_LIMIT = 50;
  const leagueCache = new Map();

  function slimLeagueEntries(entries, limit) {
    const sorted = [...(entries || [])].sort((a, b) => (b.leaguePoints || 0) - (a.leaguePoints || 0));
    const cut = Number.isFinite(limit) && limit > 0 ? sorted.slice(0, limit) : sorted;
    return cut.map((e) => ({
      puuid: e.puuid,
      summonerId: e.summonerId,
      leaguePoints: e.leaguePoints,
      wins: e.wins,
      losses: e.losses,
    }));
  }

  async function loadLeagueEntries(tier, queue, platform, limited) {
    const t = String(tier || 'challenger').toLowerCase();
    const q = queue || 'RANKED_SOLO_5x5';
    if (limited) {
      try {
        const page = await riotFetch(
          `https://${platform}.api.riotgames.com/lol/league-exp/v4/entries/${q}/${t.toUpperCase()}/I?page=1`
        );
        if (Array.isArray(page) && page.length) return page;
      } catch (err) {
        console.warn(`[riot-ipc] league-exp ${t} failed, falling back to league-v4:`, err?.message || err);
      }
    }
    const data = await riotFetch(
      `https://${platform}.api.riotgames.com/lol/league/v4/${t}leagues/by-queue/${q}`
    );
    return Array.isArray(data?.entries) ? data.entries : [];
  }

  async function fetchTopLeague({ tier, queue = 'RANKED_SOLO_5x5', platform, limit, prefetch = true }) {
    const t = String(tier || 'challenger').toLowerCase();
    const q = queue || 'RANKED_SOLO_5x5';
    const limited = Number.isFinite(limit) && limit > 0;
    const key = `${platform}:${t}:${q}:${limited ? `top${limit}` : 'full'}`;
    const hit = leagueCache.get(key);
    if (hit?.data && Date.now() - hit.at < LEAGUE_TTL_MS) {
      if (prefetch && limited) prefetchOtherLeagues(t, q, platform);
      return hit.data;
    }
    if (hit?.inflight) return hit.inflight;

    const inflight = loadLeagueEntries(t, q, platform, limited)
      .then((entries) => {
        const payload = { entries: slimLeagueEntries(entries, limited ? limit : undefined) };
        leagueCache.set(key, { at: Date.now(), data: payload });
        return payload;
      })
      .finally(() => {
        const cur = leagueCache.get(key);
        if (cur) delete cur.inflight;
      });

    leagueCache.set(key, { ...(hit || {}), inflight });
    if (prefetch && limited) prefetchOtherLeagues(t, q, platform);
    return inflight;
  }

  function prefetchOtherLeagues(exceptTier, queue, platform) {
    const stamp = `${platform}:${queue}`;
    if (leagueCache.get(`prefetch:${stamp}`)) return;
    leagueCache.set(`prefetch:${stamp}`, { at: Date.now(), data: true });
    setTimeout(() => {
      ['challenger', 'grandmaster', 'master'].forEach((t) => {
        if (t === exceptTier) return;
        fetchTopLeague({
          tier: t,
          queue,
          platform,
          limit: LEADERBOARD_LIMIT,
          prefetch: false,
        }).catch(() => {});
      });
    }, 45000);
  }

  ipcMain.handle('riot:getTopLeague', (_e, args) => fetchTopLeague(args || {}));

  // league-v4 entries no longer carry a usable summonerName — resolve real
  // Riot IDs (gameName#tagLine) from puuid via account-v1 instead. Cached on
  // disk since these rarely change and resolving 20-50 of them per load adds
  // up fast against Riot's rate limit.
  ipcMain.handle('riot:getAccountsByPuuidsBulk', (_e, { puuids, region }) =>
    cachedBulkFetch(idCache, 'account', puuids, (puuid) =>
      riotFetch(`https://${region}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`).catch(() => null),
      idCache.TTL_MS
    )
  );

  // Profile icons live on summoner-v4, not account-v1 — a separate cached bulk lookup.
  ipcMain.handle('riot:getSummonersByPuuidsBulk', (_e, { puuids, platform }) =>
    cachedBulkFetch(idCache, 'summoner', puuids, (puuid) =>
      riotFetch(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`).catch(() => null),
      idCache.TTL_MS
    )
  );

  // Top-4 champions by mastery points, used as each leaderboard player's
  // "champion pool". Mastery points barely move day to day, so this is safe
  // to cache alongside the other puuid-keyed lookups.
  ipcMain.handle('riot:getChampionMasteryBulk', (_e, { puuids, platform }) =>
    cachedBulkFetch(idCache, 'mastery', puuids, (puuid) =>
      riotFetch(`https://${platform}.api.riotgames.com/lol/champion-mastery/v4/by-puuid/${puuid}/top?count=4`).catch(() => []),
      idCache.TTL_MS
    )
  );

  // Full mastery list for the linked summoner — used for "champions played"
  // vs the live champion roster count from Data Dragon.
  ipcMain.handle('riot:getChampionMasteries', (_e, { puuid, platform }) =>
    cachedBulkFetch(idCache, 'masteryAll', [puuid], (id) =>
      riotFetch(`https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${id}`).catch(() => []),
      idCache.TTL_MS
    ).then((rows) => rows[0] || [])
  );

  // One most-recent ranked-solo match id per player — used purely to read
  // `teamPosition` off it for a "what lane do they play" signal on the
  // leaderboard. Short TTL (not the 24h puuid TTL): a "last match" changes as
  // soon as someone finishes a new game, but caching it for a few minutes
  // means repeat leaderboard visits don't re-spend rate-limit budget re-
  // fetching this on top of accounts/summoners/mastery every single time.
  const LAST_MATCH_TTL_MS = 10 * 60 * 1000;
  ipcMain.handle('riot:getLastMatchIdsBulk', (_e, { puuids, region, queue = 420, count = 20 }) =>
    cachedBulkFetch(idCache, `matchids:${queue}:${count}`, puuids, async (puuid) => {
      try {
        return await riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}&queue=${queue}`);
      } catch {
        return [];
      }
    }, LAST_MATCH_TTL_MS)
  );

  require('./tierlist')(ipcMain);
  require('./lens-benchmarks')(ipcMain, {
    riotFetch,
    mapWithConcurrency,
    matchRegionOf: (platform) => PLATFORM_TO_MATCH_REGION[platform] || 'europe',
    matchCache,
    fetchMatch: async (region, id, bag) => {
      const cache = bag || matchCache.readCache();
      const key = `match:${id}`;
      if (cache[key]?.data) return cache[key].data;
      const data = await riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`, 2);
      cache[key] = { timestamp: Date.now(), data };
      if (!bag) matchCache.writeCache(cache);
      return data;
    },
  });
  require('./studio-meta')(ipcMain);
  require('./feedback-ipc')(ipcMain);
};

module.exports.riotFetch = riotFetch;
module.exports.mapWithConcurrency = mapWithConcurrency;