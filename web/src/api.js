/** Public product API client for the website. */

const DEFAULT_API = 'https://gd-desktop.onrender.com';
const LOCAL_API = 'http://127.0.0.1:8787';

/** Local-only routes that are not on Render yet (or change often during web:dev). */
const LOCAL_PREFERRED = [
  '/v1/web/studio',
  '/v1/web/pros',
  '/v1/web/synergy',
  '/v1/web/arena',
  '/v1/web/aram',
  '/v1/web/otps',
  '/v1/web/scouting',
  '/v1/web/premium',
  '/v1/web/match-lp',
];

/** Riot-backed web routes — fall back to Render if the local key is expired. */
const RIOT_BACKED = [
  '/v1/web/leaderboard',
  '/v1/web/account',
  '/v1/web/dashboard',
  '/v1/web/career-sidebar',
  '/v1/web/live',
  '/v1/web/match-timeline',
];

function apiBase() {
  const fromEnv = String(import.meta.env.VITE_RIFT_API_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  try {
    const fromWindow = String(window.RIFT_WEB_API || '').trim().replace(/\/$/, '');
    if (fromWindow) return fromWindow;
  } catch { /* ignore */ }
  // Local Vite uses the local API so new /v1/web routes work before Render deploy.
  if (import.meta.env.DEV) return LOCAL_API;
  return DEFAULT_API;
}

function pathOf(urlPath) {
  const q = String(urlPath || '').indexOf('?');
  return q >= 0 ? urlPath.slice(0, q) : urlPath;
}

function prefersLocal(path) {
  const p = pathOf(path);
  return LOCAL_PREFERRED.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function isRiotBacked(path) {
  const p = pathOf(path);
  return RIOT_BACKED.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export function publicError(raw, fallback = 'Request failed. Try again in a moment.') {
  const text = String(raw || '').trim();
  if (!text) return fallback;
  if (/<!doctype|<html|just a moment|cloudflare|cf-chl|cf_chl|403\s*-/i.test(text)) return fallback;
  if (text.length > 180) return fallback;
  return text;
}

function sanitizePayload(body) {
  if (!body || typeof body !== 'object' || body.error == null) return body;
  return { ...body, error: publicError(body.error, 'Could not load this right now.') };
}

async function fetchApi(base, path, { timeoutMs = 45000 } = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = sanitizePayload(await res.json().catch(() => ({})));
  if (!res.ok) {
    const err = new Error(publicError(body.error, `Could not load this right now (${res.status}).`));
    err.status = res.status;
    throw err;
  }
  return body;
}

function isExpiredKey(err) {
  if (!err) return false;
  if (err.status === 401) return true;
  return /invalid or expired|unknown apikey|unauthorized/i.test(String(err.message || ''));
}

function isRateLimited(err) {
  if (!err) return false;
  if (err.status === 429) return true;
  return /rate limit/i.test(String(err.message || ''));
}

function isLocalUnreachable(err) {
  return /failed to fetch|networkerror|load failed|econnrefused/i.test(String(err?.message || err || ''));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Once the local Riot key is dead, keep using Render for this page session. */
let localRiotDead = false;

async function fetchApiRetry(base, path, { timeoutMs = 45000, retries = 3 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fetchApi(base, path, { timeoutMs });
    } catch (err) {
      lastErr = err;
      if (!isRateLimited(err) || attempt === retries - 1) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw lastErr;
}

function flexNotReadyError() {
  const err = new Error('Flex isn’t on the hosted ladder yet. SoloQ still loads.');
  err.status = 501;
  return err;
}

function leaderboardLooksLikeFlex(body) {
  const mode = String(body?.mode || '').toLowerCase();
  const queue = String(body?.queue || '');
  return mode === 'flex' || queue === 'RANKED_FLEX_SR';
}

function assertFlexPayload(path, body) {
  if (pathOf(path) === '/v1/web/leaderboard' && /[?&]mode=flex\b/.test(path) && !leaderboardLooksLikeFlex(body)) {
    throw flexNotReadyError();
  }
  return body;
}

async function getJson(path, { timeoutMs = 45000 } = {}) {
  const primary = apiBase();
  const canUseRender = import.meta.env.DEV
    && primary === LOCAL_API
    && isRiotBacked(path)
    && !prefersLocal(path);

  if (canUseRender && localRiotDead) {
    return fetchApiRetry(DEFAULT_API, path, { timeoutMs });
  }

  try {
    return await fetchApi(primary, path, { timeoutMs });
  } catch (err) {
    // Dev: expired / rate-limited local key → hosted Riot proxy.
    if (!canUseRender || !(isExpiredKey(err) || isRateLimited(err) || isLocalUnreachable(err))) throw err;
    if (isExpiredKey(err) || isLocalUnreachable(err)) localRiotDead = true;
    return fetchApiRetry(DEFAULT_API, path, { timeoutMs });
  }
}

export function linkAccount({ gameName, tagLine, platform, region }) {
  const q = new URLSearchParams({
    gameName,
    tagLine,
    platform: platform || 'euw1',
  });
  if (region) q.set('region', region);
  return getJson(`/v1/web/account?${q.toString()}`);
}

const TIER_MEM = new Map();
const TIER_INFLIGHT = new Map();
const TIER_SNAPSHOT_KEY = 'euw1|master';
let tierSnapshotJob = null;

function tierCacheKey(platform, rank) {
  return `${String(platform || 'euw1').toLowerCase()}|${String(rank || 'master').toLowerCase()}`;
}

function rememberTierList(platform, rank, data) {
  if (!Array.isArray(data?.rows) || data.rows.length < 20) return data;
  const stored = { ...data, _cachedAt: Date.now() };
  const k = tierCacheKey(platform, rank);
  TIER_MEM.set(k, stored);
  try {
    localStorage.setItem(`rift.tierlist.v1:${k}`, JSON.stringify(stored));
  } catch { /* quota / private mode */ }
  return stored;
}

function fetchLiveTierList({ platform = 'euw1', rank = 'master', force = false } = {}) {
  const q = new URLSearchParams({ platform, rank });
  if (force) q.set('force', '1');
  const k = tierCacheKey(platform, rank);
  if (!force && TIER_INFLIGHT.has(k)) return TIER_INFLIGHT.get(k);
  const job = getJson(`/v1/web/tierlist?${q.toString()}`, { timeoutMs: 90000 })
    .then((data) => rememberTierList(platform, rank, data))
    .finally(() => TIER_INFLIGHT.delete(k));
  TIER_INFLIGHT.set(k, job);
  return job;
}

/** Same-origin snapshot shipped with GitHub Pages — paints before Render wakes up. */
export function hydrateTierListFromSnapshot({ platform = 'euw1', rank = 'master' } = {}) {
  const k = tierCacheKey(platform, rank);
  const hit = peekTierList({ platform, rank });
  if (hit) return Promise.resolve(hit);
  if (k !== TIER_SNAPSHOT_KEY) return Promise.resolve(null);
  if (tierSnapshotJob) return tierSnapshotJob;
  const base = String(import.meta.env.BASE_URL || './').replace(/\/?$/, '/');
  tierSnapshotJob = fetch(`${base}meta/tierlist-euw1-master.json`, { cache: 'force-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`snapshot ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (!Array.isArray(data?.rows) || data.rows.length < 20) return null;
      return rememberTierList('euw1', 'master', {
        ...data,
        source: data.source || 'snapshot',
        cached: true,
        stale: true,
      });
    })
    .catch(() => null);
  return tierSnapshotJob;
}

export function getTierList({ platform = 'euw1', rank = 'master', force = false } = {}) {
  if (force) return fetchLiveTierList({ platform, rank, force: true });
  const cached = peekTierList({ platform, rank });
  const live = fetchLiveTierList({ platform, rank, force: false });
  if (cached) return Promise.resolve(cached);
  const k = tierCacheKey(platform, rank);
  if (k === TIER_SNAPSHOT_KEY) {
    return Promise.any([
      live,
      hydrateTierListFromSnapshot({ platform, rank }).then((snap) => {
        if (!snap) throw new Error('no snapshot');
        return snap;
      }),
    ]).catch(() => live);
  }
  return live;
}

/** Always hits the API and writes through cache — use after showing peek/snapshot. */
export function refreshTierList({ platform = 'euw1', rank = 'master' } = {}) {
  return fetchLiveTierList({ platform, rank, force: false });
}

export function peekTierList({ platform = 'euw1', rank = 'master' } = {}) {
  const k = tierCacheKey(platform, rank);
  if (TIER_MEM.has(k)) return TIER_MEM.get(k);
  try {
    const raw = localStorage.getItem(`rift.tierlist.v1:${k}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.rows) || parsed.rows.length < 20) return null;
    if (Date.now() - (Number(parsed._cachedAt) || 0) > 7 * 24 * 60 * 60 * 1000) return null;
    TIER_MEM.set(k, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function prefetchTierList({ platform = 'euw1', rank = 'master' } = {}) {
  const hit = peekTierList({ platform, rank });
  const age = Date.now() - (Number(hit?._cachedAt) || 0);
  if (hit && age < 10 * 60 * 1000) {
    refreshTierList({ platform, rank }).catch(() => {});
    return Promise.resolve(hit);
  }
  return hydrateTierListFromSnapshot({ platform, rank }).then((snap) => {
    refreshTierList({ platform, rank }).catch(() => {});
    return snap || refreshTierList({ platform, rank }).catch(() => hit || null);
  });
}

export function getLeaderboard({ tier = 'challenger', platform = 'euw1', mode = 'soloq' } = {}) {
  const q = new URLSearchParams({ tier, platform, mode });
  const path = `/v1/web/leaderboard?${q.toString()}`;
  return getJson(path, { timeoutMs: 60000 }).then((body) => assertFlexPayload(path, body));
}

const CHAMP_MEM = new Map();
const CHAMP_INFLIGHT = new Map();
const CHAMP_LS_KEYS = 'rift.champ.v1.keys';
const CHAMP_LS_MAX = 10;

function champCacheKey(platform, rank, role, champion) {
  return [
    String(platform || 'euw1').toLowerCase(),
    String(rank || 'master').toLowerCase(),
    String(role || 'Mid'),
    String(champion || '').trim().toLowerCase(),
  ].join('|');
}

function rememberChampionDetail(platform, rank, role, champion, data) {
  if (!data || (!data.stats && !Array.isArray(data.builds))) return data;
  const stored = { ...data, _cachedAt: Date.now() };
  const k = champCacheKey(platform, rank, role, champion);
  CHAMP_MEM.set(k, stored);
  try {
    localStorage.setItem(`rift.champ.v1:${k}`, JSON.stringify(stored));
    const keys = JSON.parse(localStorage.getItem(CHAMP_LS_KEYS) || '[]')
      .filter((x) => x !== k);
    keys.unshift(k);
    while (keys.length > CHAMP_LS_MAX) {
      const drop = keys.pop();
      try { localStorage.removeItem(`rift.champ.v1:${drop}`); } catch { /* ignore */ }
    }
    localStorage.setItem(CHAMP_LS_KEYS, JSON.stringify(keys));
  } catch { /* quota / private mode */ }
  return stored;
}

export function peekChampionDetail({
  champion,
  role = 'Mid',
  rank = 'master',
  platform = 'euw1',
} = {}) {
  const k = champCacheKey(platform, rank, role, champion);
  if (CHAMP_MEM.has(k)) return CHAMP_MEM.get(k);
  try {
    const raw = localStorage.getItem(`rift.champ.v1:${k}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.stats && !Array.isArray(parsed?.builds)) return null;
    if (Date.now() - (Number(parsed._cachedAt) || 0) > 24 * 60 * 60 * 1000) return null;
    CHAMP_MEM.set(k, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function getChampionDetail({
  champion,
  role = 'Mid',
  rank = 'master',
  platform = 'euw1',
  force = false,
} = {}) {
  const k = champCacheKey(platform, rank, role, champion);
  const cached = !force ? peekChampionDetail({ champion, role, rank, platform }) : null;
  if (!force && CHAMP_INFLIGHT.has(k)) {
    return cached ? Promise.resolve(cached) : CHAMP_INFLIGHT.get(k);
  }
  const q = new URLSearchParams({ champion, role, rank, platform });
  const job = getJson(`/v1/web/champion?${q.toString()}`, { timeoutMs: 90000 })
    .then((data) => rememberChampionDetail(platform, rank, role, champion, data))
    .finally(() => CHAMP_INFLIGHT.delete(k));
  CHAMP_INFLIGHT.set(k, job);
  if (cached) return Promise.resolve(cached);
  return job;
}

export function refreshChampionDetail(args = {}) {
  return getChampionDetail({ ...args, force: true });
}

export function prefetchChampionDetail(args = {}) {
  const hit = peekChampionDetail(args);
  const age = Date.now() - (Number(hit?._cachedAt) || 0);
  if (hit && age < 10 * 60 * 1000) return Promise.resolve(hit);
  if (hit) {
    refreshChampionDetail(args).catch(() => {});
    return Promise.resolve(hit);
  }
  return refreshChampionDetail(args).catch(() => null);
}

const DASH_MEM = new Map();
const DASH_INFLIGHT = new Map();
const DASH_LS_KEYS = 'rift.dash.v1.keys';
const DASH_LS_MAX = 6;

function dashCacheKey(gameName, tagLine, platform, mode, light = false) {
  return [
    String(gameName || '').trim().toLowerCase(),
    String(tagLine || '').trim().toLowerCase(),
    String(platform || 'euw1').toLowerCase(),
    String(mode || 'Solo'),
    light ? 'L' : 'F',
  ].join('|');
}

function rememberDashboard(gameName, tagLine, platform, mode, data, light = false) {
  if (!data || !Array.isArray(data.recentGames)) return data;
  const stored = { ...data, _cachedAt: Date.now(), light: Boolean(light || data.light) };
  const k = dashCacheKey(gameName, tagLine, platform, mode, light);
  const prev = DASH_MEM.get(k);
  // Keep a richer match list when a shorter home fetch returns first.
  if (prev && (prev.recentGames?.length || 0) > (stored.recentGames?.length || 0)
    && Date.now() - (Number(prev._cachedAt) || 0) < 10 * 60 * 1000
    && !light) {
    stored.recentGames = prev.recentGames;
  }
  DASH_MEM.set(k, stored);
  // Light home cache also helps when a full dashboard was loaded earlier.
  if (!light) {
    const lightKey = dashCacheKey(gameName, tagLine, platform, mode, true);
    DASH_MEM.set(lightKey, stored);
    try {
      localStorage.setItem(`rift.dash.v1:${lightKey}`, JSON.stringify(stored));
    } catch { /* ignore */ }
  }
  try {
    localStorage.setItem(`rift.dash.v1:${k}`, JSON.stringify(stored));
    const keys = JSON.parse(localStorage.getItem(DASH_LS_KEYS) || '[]')
      .filter((x) => x !== k);
    keys.unshift(k);
    while (keys.length > DASH_LS_MAX) {
      const drop = keys.pop();
      try { localStorage.removeItem(`rift.dash.v1:${drop}`); } catch { /* ignore */ }
    }
    localStorage.setItem(DASH_LS_KEYS, JSON.stringify(keys));
  } catch { /* quota / private mode */ }
  return stored;
}

export function peekDashboard({
  gameName,
  tagLine,
  platform = 'euw1',
  mode = 'Solo',
  light = false,
} = {}) {
  if (!gameName || !tagLine) return null;
  const k = dashCacheKey(gameName, tagLine, platform, mode, light);
  if (DASH_MEM.has(k)) return DASH_MEM.get(k);
  try {
    const raw = localStorage.getItem(`rift.dash.v1:${k}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.recentGames)
        && Date.now() - (Number(parsed._cachedAt) || 0) <= 24 * 60 * 60 * 1000) {
        DASH_MEM.set(k, parsed);
        return parsed;
      }
    }
  } catch { /* ignore */ }
  // Home can reuse a full dashboard cache.
  if (light) {
    return peekDashboard({ gameName, tagLine, platform, mode, light: false });
  }
  return null;
}

export function getDashboard({
  gameName,
  tagLine,
  platform = 'euw1',
  region,
  mode = 'Solo',
  count = 20,
  light = false,
  force = false,
} = {}) {
  const k = dashCacheKey(gameName, tagLine, platform, mode, light);
  const cached = !force ? peekDashboard({ gameName, tagLine, platform, mode, light }) : null;
  if (!force && DASH_INFLIGHT.has(k)) {
    return cached ? Promise.resolve(cached) : DASH_INFLIGHT.get(k);
  }
  const q = new URLSearchParams({
    gameName,
    tagLine,
    platform,
    mode,
    count: String(count),
  });
  if (region) q.set('region', region);
  if (light) q.set('light', '1');
  const job = getJson(`/v1/web/dashboard?${q.toString()}`, { timeoutMs: 120000 })
    .then((data) => rememberDashboard(gameName, tagLine, platform, mode, data, light))
    .finally(() => DASH_INFLIGHT.delete(k));
  DASH_INFLIGHT.set(k, job);
  if (cached) return Promise.resolve(cached);
  return job;
}

export function refreshDashboard(args = {}) {
  return getDashboard({ ...args, force: true });
}

export function prefetchDashboard(args = {}) {
  const light = args.light !== false;
  const hit = peekDashboard({ ...args, light });
  const age = Date.now() - (Number(hit?._cachedAt) || 0);
  if (hit && age < 2 * 60 * 1000) return Promise.resolve(hit);
  if (hit) {
    refreshDashboard({ ...args, count: args.count || 5, light }).catch(() => {});
    return Promise.resolve(hit);
  }
  return refreshDashboard({ ...args, count: args.count || 5, light }).catch(() => null);
}

export function getCareerSidebar({ gameName, tagLine, platform = 'euw1', region } = {}) {
  const q = new URLSearchParams({
    gameName,
    tagLine,
    platform,
  });
  if (region) q.set('region', region);
  return getJson(`/v1/web/career-sidebar?${q.toString()}`, { timeoutMs: 180000 });
}

export function getLiveGame({ gameName, tagLine, platform = 'euw1', region } = {}) {
  const q = new URLSearchParams({ gameName, tagLine, platform });
  if (region) q.set('region', region);
  return getJson(`/v1/web/live?${q.toString()}`, { timeoutMs: 30000 });
}

export function getMatchLp({ gameName, tagLine, platform = 'euw1', queue = 420 } = {}) {
  const q = new URLSearchParams({
    gameName,
    tagLine,
    platform,
    queue: String(queue === 440 ? 440 : 420),
  });
  return getJson(`/v1/web/match-lp?${q.toString()}`, { timeoutMs: 45000 });
}

export function getMatchTimeline({ matchId, region = 'europe', puuid } = {}) {
  const q = new URLSearchParams({
    matchId,
    region,
    puuid,
  });
  return getJson(`/v1/web/match-timeline?${q.toString()}`, { timeoutMs: 60000 });
}

export function getStudioMeta({
  view = 'home',
  platform = 'euw1',
  queue = 420,
  role = '',
  tier = 'emerald_plus',
  timeframe = '30days',
  dimension = 'champion',
} = {}) {
  const q = new URLSearchParams({
    view,
    platform,
    queue: String(queue),
    tier,
    timeframe,
    dimension,
  });
  if (role) q.set('role', role);
  return getJson(`/v1/web/studio?${q.toString()}`, { timeoutMs: 90000 });
}

export function listPros({ country = '', lane = '', league = '', query = '' } = {}) {
  const q = new URLSearchParams();
  if (country) q.set('country', country);
  if (lane) q.set('lane', lane);
  if (league) q.set('league', league);
  if (query) q.set('query', query);
  const qs = q.toString();
  return getJson(`/v1/web/pros${qs ? `?${qs}` : ''}`, { timeoutMs: 90000 });
}

export function getProPlayer(slug) {
  const q = new URLSearchParams({ slug: String(slug || '') });
  return getJson(`/v1/web/pros/player?${q.toString()}`, { timeoutMs: 60000 });
}

export function lookupPro(riotId) {
  const q = new URLSearchParams({ riotId: String(riotId || '') });
  return getJson(`/v1/web/pros/lookup?${q.toString()}`, { timeoutMs: 45000 });
}

export function getSynergy({
  platform = 'euw1',
  rank = 'master',
  role1 = 'ADC',
  role2 = 'Support',
  duoType = '',
  timeframe = '30days',
  minGames,
} = {}) {
  const q = new URLSearchParams({
    platform,
    rank,
    role1,
    role2,
    timeframe,
  });
  if (duoType) q.set('duoType', duoType);
  if (minGames != null) q.set('minGames', String(minGames));
  return getJson(`/v1/web/synergy?${q.toString()}`, { timeoutMs: 120000 });
}

export function getArena({
  platform = 'euw1',
  rank = 'emerald_plus',
  region = 'all',
} = {}) {
  const q = new URLSearchParams({ platform, rank, region });
  return getJson(`/v1/web/arena?${q.toString()}`, { timeoutMs: 90000 });
}

export function getAram({
  platform = 'euw1',
  rank = 'emerald_plus',
  region = 'all',
} = {}) {
  const q = new URLSearchParams({ platform, rank, region });
  return getJson(`/v1/web/aram?${q.toString()}`, { timeoutMs: 90000 });
}

export function getOtps({
  platform = 'all',
  lane = 'all',
  page = 1,
  all = true,
} = {}) {
  const q = new URLSearchParams({
    platform,
    lane,
    page: String(page),
  });
  if (all) q.set('all', '1');
  return getJson(`/v1/web/otps?${q.toString()}`, { timeoutMs: 90000 });
}

export function getScouting({
  platform = 'euw1',
  lane = 'all',
  minLp = 500,
  maxLp = null,
  sort = 'kda',
  dir = 'desc',
  q = '',
  limit = 250,
} = {}) {
  const params = new URLSearchParams({
    platform,
    lane,
    minLp: String(minLp),
    sort,
    dir,
    limit: String(limit),
  });
  if (maxLp != null && maxLp !== '') params.set('maxLp', String(maxLp));
  if (q) params.set('q', q);
  return getJson(`/v1/web/scouting?${params.toString()}`, { timeoutMs: 120000 });
}

export function startPremiumCheckout({ plan = 'six', deviceId = '', riotId = '' } = {}) {
  const params = new URLSearchParams({ plan });
  if (deviceId) params.set('deviceId', deviceId);
  if (riotId) params.set('riotId', riotId);
  return getJson(`/v1/web/premium/checkout?${params.toString()}`, { timeoutMs: 45000 });
}

export { apiBase };
