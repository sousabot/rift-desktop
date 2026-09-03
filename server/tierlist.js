/** Server-side tier list — DPM.lol (same overall WR as dpm.lol/tierlist). */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cloudscraper = require('cloudscraper');

const TTL_MS = 6 * 60 * 60 * 1000;
/** Rolling window — 30 days matches DPM’s larger ranked sample. */
const DEFAULT_TIMEFRAME = '30days';

const LANE_TO_ROLE = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support',
};

const TIER_LABEL = [
  '?', 'S+', 'S', 'S-', 'A+', 'A', 'A-',
  'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-',
];

/** Within-lane percentile → Lolalytics-style letter (top ~22% ≈ S+ so rank ~8/36 stays S+). */
const TIER_CUTS = [
  [0.22, 1], // S+
  [0.32, 2], // S
  [0.40, 3], // S-
  [0.50, 4], // A+
  [0.58, 5], // A
  [0.66, 6], // A-
  [0.74, 7], // B+
  [0.82, 8], // B
  [0.88, 9], // B-
  [0.93, 10], // C+
  [0.96, 11], // C
  [0.98, 12], // C-
  [1.00, 13], // D+
];

const inflight = new Map();
let champNameCache = null;
let memory = null;

function cachePath() {
  const dir = process.env.RIFT_CACHE_DIR
    || (process.env.RENDER_DISK_PATH ? path.join(process.env.RENDER_DISK_PATH, 'rift-cache') : path.join(os.tmpdir(), 'rift-lol-cache'));
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return path.join(dir, 'tierlist-cache.json');
}

function readAll() {
  if (memory) return memory;
  try {
    memory = JSON.parse(fs.readFileSync(cachePath(), 'utf8'));
  } catch {
    memory = {};
  }
  return memory;
}

function writeAll(data) {
  memory = data;
  try { fs.writeFileSync(cachePath(), JSON.stringify(data)); } catch { /* ignore */ }
}

function tierLabel(n) {
  return TIER_LABEL[Number(n) || 0] || '?';
}

function metaScoreOf(row) {
  const tier = Number(row.tierNum) || 0;
  const rank = Number(row.roleRank) || 999;
  if (!tier) {
    return (row.winrate || 0) * 10 + Math.min(row.games || 0, 200) * 0.01;
  }
  return (16 - tier) * 1000 - rank + (row.winrate || 0) * 0.01;
}

function blockedError(cause) {
  const err = new Error('Could not load the tier list. Try again in a moment.');
  err.status = 403;
  err.cause = cause;
  return err;
}

async function fetchJson(url) {
  let body;
  try {
    body = await cloudscraper.get({
      uri: url,
      timeout: 8000,
      headers: {
        Accept: 'application/json',
        Origin: 'https://dpm.lol',
        Referer: 'https://dpm.lol/tierlist',
      },
    });
  } catch (err) {
    throw blockedError(err);
  }
  const text = String(body || '');
  if (text.trimStart().startsWith('<')) throw blockedError();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw blockedError(err);
  }
}

const LOL_LANES = [
  ['top', 'Top'],
  ['jungle', 'Jungle'],
  ['middle', 'Mid'],
  ['bottom', 'ADC'],
  ['support', 'Support'],
];

const LOL_HEADERS = {
  accept: 'application/json',
  origin: 'https://lolalytics.com',
  referer: 'https://lolalytics.com/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

async function fetchLolalyticsLane(lane, tier) {
  const q = new URLSearchParams({ ep: 'list', queue: '420', lane, tier });
  const res = await fetch(`https://a1.lolalytics.com/mega/?${q}`, {
    headers: LOL_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`lolalytics ${res.status}`);
  return res.json();
}

async function fetchTierListLolalytics({ platform, rank, names }) {
  const plat = String(platform || 'euw1').toLowerCase();
  const tier = String(rank || 'master').toLowerCase();
  const payloads = await Promise.all(LOL_LANES.map(([lane]) => fetchLolalyticsLane(lane, tier)));
  const rows = [];
  LOL_LANES.forEach(([, role], i) => {
    const cid = payloads[i]?.cid || {};
    for (const [id, entry] of Object.entries(cid)) {
      const champion = names.byId?.[String(id)];
      if (!champion) continue;
      const games = Number(entry.games) || 0;
      if (games <= 0) continue;
      rows.push({
        champion,
        role,
        games,
        winrate: Number(entry.wr) || 0,
        pickrate: Number(entry.pr) || 0,
        banrate: Number(entry.br) || 0,
        lanePct: 100,
        isPrimary: true,
        tier: '?',
        tierNum: 0,
        delta: 0,
        pbi: 0,
        roleRank: Number(entry.rank) || 9999,
        score: Number(entry.wr) || 0,
        tierScore: 0,
        lowSample: games < 30,
      });
    }
  });
  assignRoleTiers(rows);
  assignGlobalRank(rows);
  const wrSum = rows.reduce((s, r) => s + (r.winrate || 0) * (r.games || 0), 0);
  const gameSum = rows.reduce((s, r) => s + (r.games || 0), 0);
  const patch = names.version
    ? String(names.version).split('.').slice(0, 2).join('.')
    : 'live';
  return {
    platform: plat,
    rank: tier,
    region: plat,
    patch,
    timeframe: DEFAULT_TIMEFRAME,
    matches: gameSum,
    analysed: gameSum,
    avgWr: gameSum > 0 ? wrSum / gameSum : null,
    reliable: rows.length,
    builtAt: Date.now(),
    source: 'lolalytics',
    rows,
  };
}

async function loadChampionNames() {
  if (champNameCache) return champNameCache;
  try {
    const versions = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then((r) => r.json());
    const ver = versions?.[0];
    if (!ver) return { byId: {}, byKey: {}, version: '' };
    const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`)
      .then((r) => r.json());
    const byId = {};
    const byKey = {};
    Object.values(data.data || {}).forEach((ch) => {
      byId[String(ch.key)] = ch.name;
      byKey[String(ch.id).toLowerCase()] = ch.name;
    });
    champNameCache = { byId, byKey, version: ver };
    return champNameCache;
  } catch {
    return { byId: {}, byKey: {}, version: '' };
  }
}

function displayName(row, names) {
  const id = String(row.championId || '');
  const key = String(row.championName || '');
  if (names?.byId?.[id]) return names.byId[id];
  if (names?.byKey?.[key.toLowerCase()]) return names.byKey[key.toLowerCase()];
  if (key) return key.replace(/([a-z])([A-Z])/g, '$1 $2');
  return '';
}

function lanePctOf(row) {
  const lane = String(row.lane || '').toUpperCase();
  const share = row.lanesPickrate?.[lane];
  if (share == null) return 100;
  return Number(share) || 0;
}

/** True when this lane is the champ's main role, or within 5pp of it (dual roles). */
function isPrimaryLane(entry) {
  const lane = String(entry.lane || '').toUpperCase();
  const shares = entry.lanesPickrate || {};
  const mine = Number(shares[lane]);
  if (!Number.isFinite(mine)) return lanePctOf(entry) >= 40;
  const values = Object.values(shares)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (!values.length) return mine >= 40;
  const top = Math.max(...values);
  // DPM shares are 0–100. Allow near-ties so Sylas Jungle (~40%) counts with Mid (~43%).
  const slack = top > 1.5 ? 5 : 0.05;
  return mine + slack >= top;
}

function assignRoleTiers(rows) {
  const byRole = new Map();
  for (const row of rows) {
    if (!byRole.has(row.role)) byRole.set(row.role, []);
    byRole.get(row.role).push(row);
  }
  for (const list of byRole.values()) {
    list.sort((a, b) => (b.tierScore - a.tierScore) || (b.games - a.games));
    const n = list.length || 1;
    list.forEach((row, i) => {
      row.roleRank = i + 1;
      const pct = (i + 1) / n;
      let tierNum = 13;
      for (const [cut, num] of TIER_CUTS) {
        if (pct <= cut) {
          tierNum = num;
          break;
        }
      }
      row.tierNum = tierNum;
      row.tier = tierLabel(tierNum);
      row.metaScore = Number(metaScoreOf(row).toFixed(2));
    });
  }
}

function assignGlobalRank(rows) {
  const ranked = [...rows].sort((a, b) => {
    const at = a.tierNum > 0 ? a.tierNum : 99;
    const bt = b.tierNum > 0 ? b.tierNum : 99;
    if (at !== bt) return at - bt;
    if (a.roleRank !== b.roleRank) return a.roleRank - b.roleRank;
    return (b.metaScore ?? 0) - (a.metaScore ?? 0);
  });
  ranked.forEach((row, i) => { row.rank = i + 1; });
}

function rowsFromDpm(champions, names) {
  const rows = [];
  for (const entry of champions || []) {
    const games = Number(entry.count) || 0;
    if (games <= 0) continue;
    const role = LANE_TO_ROLE[String(entry.lane || '').toUpperCase()];
    if (!role) continue;
    const champion = displayName(entry, names);
    if (!champion) continue;
    const winrate = Number(entry.winrate) || 0;
    const delta = Number(entry.winrateVariance);
    const primary = isPrimaryLane(entry);
    rows.push({
      champion,
      role,
      games,
      winrate,
      pickrate: Number(entry.pickrate) || 0,
      banrate: Number(entry.banrate) || 0,
      lanePct: lanePctOf(entry),
      isPrimary: primary,
      tier: '?',
      tierNum: 0,
      delta: Number.isFinite(delta) ? delta : 0,
      pbi: 0,
      roleRank: 9999,
      score: winrate,
      tierScore: Number(entry.tierScore) || 0,
      lowSample: games < 30,
    });
  }
  // Grade primary-role rows as the real meta; off-meta gets its own ladder.
  assignRoleTiers(rows.filter((r) => r.isPrimary));
  assignRoleTiers(rows.filter((r) => !r.isPrimary));
  return rows;
}

async function fetchTierListDpm({ plat, tier, tf, names }) {
  const q = new URLSearchParams({ platform: plat, tier, timeframe: tf });
  const raw = await fetchJson(`https://dpm.lol/v1/tierlist?${q.toString()}`);
  const rows = rowsFromDpm(raw?.champions, names);
  assignGlobalRank(rows);
  const wrSum = rows.reduce((s, r) => s + (r.winrate || 0) * (r.games || 0), 0);
  const gameSum = rows.reduce((s, r) => s + (r.games || 0), 0);
  const avgWr = gameSum > 0 ? wrSum / gameSum : null;
  const patch = names.version
    ? String(names.version).split('.').slice(0, 2).join('.')
    : 'live';
  return {
    platform: plat,
    rank: tier,
    region: plat,
    patch,
    timeframe: tf,
    matches: Number(raw?.total) || rows.length,
    analysed: Number(raw?.total) || rows.length,
    avgWr,
    reliable: rows.length,
    builtAt: Date.now(),
    source: 'dpm',
    rows,
  };
}

async function fetchTierList({
  platform = 'euw1',
  rank = 'master',
  timeframe = DEFAULT_TIMEFRAME,
} = {}) {
  const plat = String(platform || 'euw1').toLowerCase();
  const tier = String(rank || 'master').toLowerCase();
  const tf = String(timeframe || DEFAULT_TIMEFRAME).toLowerCase();
  const names = await loadChampionNames();
  const dpm = fetchTierListDpm({ plat, tier, tf, names }).then((data) => {
    if (!data?.rows?.length) throw new Error('empty dpm');
    return data;
  });
  const lol = fetchTierListLolalytics({ platform: plat, rank: tier, names }).then((data) => {
    if (!data?.rows?.length) throw new Error('empty lolalytics');
    return data;
  });
  try {
    return await Promise.any([dpm, lol]);
  } catch (err) {
    throw blockedError(err);
  }
}

function startRefresh(key, args) {
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    try {
      const data = await fetchTierList(args);
      const next = readAll();
      next[key] = { at: Date.now(), data };
      writeAll(next);
      return data;
    } catch (err) {
      const cached = readAll()[key];
      if (cached?.data?.rows?.length) {
        return { ...cached.data, stale: true, error: 'Could not refresh the tier list.' };
      }
      throw err;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function getTierList({
  platform = 'euw1',
  rank = 'master',
  timeframe = DEFAULT_TIMEFRAME,
  force = false,
} = {}) {
  // v5: 30-day DPM window (larger analysed sample).
  const key = `v5:${String(platform || 'euw1').toLowerCase()}:${String(rank || 'master')}:${String(timeframe || DEFAULT_TIMEFRAME).toLowerCase()}`;
  const cached = readAll()[key];
  const hasRows = cached?.data?.rows?.length >= 40;
  const fresh = hasRows && Date.now() - cached.at < TTL_MS;

  if (!force && hasRows) {
    if (!fresh) startRefresh(key, { platform, rank, timeframe });
    return { ...cached.data, cached: true, stale: !fresh };
  }
  if (inflight.has(key)) return inflight.get(key);
  return startRefresh(key, { platform, rank, timeframe });
}

module.exports = { getTierList, DEFAULT_TIMEFRAME };
