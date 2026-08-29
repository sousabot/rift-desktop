/** Arena tier list — Lolalytics SSR (mega API ignores Arena queue). */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TTL_MS = 6 * 60 * 60 * 1000;
const TIER_LABEL = [
  '?', 'S+', 'S', 'S-', 'A+', 'A', 'A-',
  'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-',
];
const PLATFORM_REGION = {
  euw1: 'euw', eun1: 'eune', na1: 'na', br1: 'br', la1: 'lan', la2: 'las',
  kr: 'kr', jp1: 'jp', oc1: 'oce', tr1: 'tr', ru: 'ru', me1: 'me',
  sg2: 'sg', ph2: 'ph', tw2: 'tw', th2: 'th', vn2: 'vn',
};

const inflight = new Map();
let champNameCache = null;
let memory = null;

function cachePath() {
  const dir = process.env.RIFT_CACHE_DIR
    || (process.env.RENDER_DISK_PATH ? path.join(process.env.RENDER_DISK_PATH, 'rift-cache') : path.join(os.tmpdir(), 'rift-lol-cache'));
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return path.join(dir, 'arena-cache.json');
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

function patchOf(version) {
  const parts = String(version || '').split('.');
  if (parts.length < 2) return '';
  return `${parts[0]}.${parts[1]}`;
}

async function httpGetJson(url) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`ddragon ${res.status}`);
  return res.json();
}

async function httpGetText(url) {
  const res = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`lolalytics arena ${res.status}`);
  return res.text();
}

async function currentPatch() {
  try {
    const versions = await httpGetJson('https://ddragon.leagueoflegends.com/api/versions.json');
    return patchOf(Array.isArray(versions) ? versions[0] : '');
  } catch {
    return '';
  }
}

async function loadChampionNames() {
  if (champNameCache) return champNameCache;
  try {
    const versions = await httpGetJson('https://ddragon.leagueoflegends.com/api/versions.json');
    const ver = Array.isArray(versions) ? versions[0] : null;
    if (!ver) return {};
    const data = await httpGetJson(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`);
    const map = {};
    Object.values(data.data || {}).forEach((ch) => { map[String(ch.key)] = ch.name; });
    champNameCache = map;
    return map;
  } catch {
    return {};
  }
}

function deepResolve(objs, ref, depth = 0, seen = new Set()) {
  if (depth > 24) return ref;
  if (typeof ref === 'string' && /^[0-9a-z]+$/i.test(ref) && ref.length <= 5) {
    const i = parseInt(ref, 36);
    if (Number.isFinite(i) && i >= 0 && i < objs.length && !seen.has(i)) {
      seen.add(i);
      return deepResolve(objs, objs[i], depth + 1, seen);
    }
  }
  if (Array.isArray(ref)) {
    return ref.map((x) => deepResolve(objs, x, depth + 1, new Set(seen)));
  }
  if (ref && typeof ref === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(ref)) {
      out[k] = deepResolve(objs, v, depth + 1, new Set(seen));
    }
    return out;
  }
  return ref;
}

function extractArenaPayload(html) {
  const match = html.match(/<script type="qwik\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('arena page missing data');
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    throw new Error('arena page data corrupt');
  }
  const objs = parsed.objs || [];
  let best = null;
  for (const o of objs) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    if (!('cid' in o) || !('queue' in o)) continue;
    const resolved = deepResolve(objs, o);
    const cid = resolved?.cid;
    if (!cid || typeof cid !== 'object') continue;
    const count = Object.keys(cid).length;
    if (count < 50) continue;
    const queue = Number(resolved.queue);
    const cache = String(resolved.cache || '');
    const isArena = queue === 1750 || /arena/i.test(cache);
    if (!isArena) continue;
    if (!best || count > Object.keys(best.cid).length) best = resolved;
  }
  if (!best) throw new Error('arena cid missing');
  return best;
}

function rowsFromPayload(payload, names) {
  const rows = [];
  for (const [id, entry] of Object.entries(payload?.cid || {})) {
    if (!entry || !(Number(entry.games) > 0)) continue;
    const champion = names[id];
    if (!champion) continue;
    const rank = Number(entry.rank) > 0 ? Number(entry.rank) : 9999;
    const tierNum = Number(entry.tier);
    rows.push({
      champion,
      championId: Number(id) || 0,
      games: Number(entry.games) || 0,
      winrate: Number(entry.wr) || 0,
      pickrate: Number(entry.pr) || 0,
      banrate: Number(entry.br) || 0,
      tier: Number.isFinite(tierNum) && tierNum > 0 ? tierLabel(tierNum) : '?',
      tierNum: Number.isFinite(tierNum) && tierNum > 0 ? tierNum : 0,
      delta: Number(entry.avgWrDelta) || 0,
      rank,
      roleRank: rank,
      score: Number(entry.wr) || 0,
    });
  }
  rows.sort((a, b) => {
    const at = a.tierNum > 0 ? a.tierNum : 99;
    const bt = b.tierNum > 0 ? b.tierNum : 99;
    if (at !== bt) return at - bt;
    return a.rank - b.rank || b.winrate - a.winrate;
  });
  return rows;
}

function pageUrl({ rank, region, patch }) {
  const q = new URLSearchParams({ tier: rank, region });
  if (patch) q.set('patch', patch);
  return `https://lolalytics.com/lol/tierlist/arena/?${q.toString()}`;
}

async function fetchArena({ platform = 'euw1', rank = 'emerald_plus', regionOverride = '' } = {}) {
  const region = regionOverride || PLATFORM_REGION[String(platform || '').toLowerCase()] || 'all';
  const names = await loadChampionNames();
  const patch = await currentPatch();
  // Prefer global when region filter is sparse; caller can force via region=all.
  const html = await httpGetText(pageUrl({ rank, region, patch }));
  const payload = extractArenaPayload(html);
  const rows = rowsFromPayload(payload, names);
  if (!rows.length) throw new Error('arena empty');
  return {
    ok: true,
    platform,
    rank,
    region,
    patch: patch || 'live',
    queue: Number(payload.queue) || 1750,
    matches: Number(payload.analysed) || 0,
    analysed: Number(payload.analysed) || 0,
    avgWr: payload.avgWr != null ? Number(payload.avgWr) : null,
    builtAt: Date.now(),
    source: 'lolalytics-arena',
    rows,
  };
}

async function getArena({ platform = 'euw1', rank = 'emerald_plus', region = 'all', force = false } = {}) {
  const plat = String(platform || 'euw1').toLowerCase();
  const rk = String(rank || 'emerald_plus');
  // Arena meta is usually browsed globally; allow platform→region only when explicitly requested.
  const requested = String(region || '').toLowerCase();
  const reg = requested === 'platform'
    ? (PLATFORM_REGION[plat] || 'all')
    : (requested || 'all');
  const key = `${plat}:${rk}:${reg}`;
  const all = readAll();
  const cached = all[key];
  if (!force && cached?.data?.rows?.length && Date.now() - cached.at < TTL_MS) {
    return { ...cached.data, cached: true };
  }
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    try {
      let data;
      try {
        data = await fetchArena({ platform: plat, rank: rk, regionOverride: reg });
      } catch (err) {
        // Fall back to global pool if regional scrape fails / empty.
        if (reg !== 'all') {
          data = await fetchArena({ platform: plat, rank: rk, regionOverride: 'all' });
          data.regionFallback = true;
          data.requestedRegion = reg;
        } else {
          throw err;
        }
      }
      const next = readAll();
      next[key] = { at: Date.now(), data };
      writeAll(next);
      return data;
    } catch (err) {
      if (cached?.data?.rows?.length) {
        return { ...cached.data, stale: true, error: err.message };
      }
      return { ok: false, error: err.message || 'Could not load arena list', rows: [] };
    }
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

module.exports = { getArena, PLATFORM_REGION };
