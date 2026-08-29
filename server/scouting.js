/** Scouting players — DPM.lol high-elo player metrics. */

const cloudscraper = require('cloudscraper');

const CACHE_TTL_MS = 45 * 60 * 1000;
const PLATFORMS = new Set([
  'euw1', 'eun1', 'na1', 'br1', 'kr', 'jp1', 'la1', 'la2', 'oc1', 'tr1', 'ru', 'me1',
  'ph2', 'sg2', 'th2', 'tw2', 'vn2',
]);
const LANES = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
const SORT_KEYS = new Set([
  'lp', 'kda', 'games', 'winrate', 'level', 'goldDiffAt15', 'csDiffAt15',
  'killParticipation', 'firstbloodRate', 'visionScorePerMinute', 'csm', 'dmgm',
  'dmggold', 'uniqueChampions',
]);

const rawCache = new Map();
const inflight = new Map();
let nameCache = null;

async function fetchJson(url) {
  const body = await cloudscraper.get({
    uri: url,
    headers: {
      Accept: 'application/json',
      Origin: 'https://dpm.lol',
      Referer: 'https://dpm.lol/scouting/players',
    },
  });
  const text = String(body || '');
  if (text.trimStart().startsWith('<')) {
    const err = new Error('Scouting feed blocked');
    err.status = 403;
    throw err;
  }
  return JSON.parse(text);
}

async function loadChampionNames() {
  if (nameCache) return nameCache;
  try {
    const versions = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then((r) => r.json());
    const ver = versions?.[0];
    if (!ver) return { byId: {}, version: '' };
    const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`)
      .then((r) => r.json());
    const byId = {};
    Object.values(data.data || {}).forEach((ch) => {
      byId[String(ch.key)] = { name: ch.name, id: ch.id };
    });
    nameCache = { byId, version: ver };
    return nameCache;
  } catch {
    return { byId: {}, version: '' };
  }
}

function normalizePlatform(platform) {
  const raw = String(platform || 'euw1').trim().toLowerCase();
  return PLATFORMS.has(raw) ? raw : 'euw1';
}

function normalizeLane(lane) {
  const raw = String(lane || '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return '';
  if (raw === 'MID') return 'MIDDLE';
  if (raw === 'ADC' || raw === 'BOT') return 'BOTTOM';
  if (raw === 'SUPPORT' || raw === 'SUP') return 'UTILITY';
  return LANES.has(raw) ? raw : '';
}

function kdaOf(row) {
  const d = Math.max(0.01, Number(row.deaths) || 0);
  const k = Number(row.kills) || 0;
  const a = Number(row.assists) || 0;
  return Math.round(((k + a) / d) * 100) / 100;
}

function mapPlayer(row, names) {
  const champs = (Array.isArray(row.championIds) ? row.championIds : [])
    .slice(0, 5)
    .map((id) => {
      const meta = names?.byId?.[String(id)] || {};
      return {
        championId: Number(id) || 0,
        champion: meta.name || String(id),
        championKey: meta.id || '',
      };
    })
    .filter((c) => c.championId > 0);

  return {
    puuid: row.puuid || '',
    gameName: row.gameName || '',
    tagLine: row.tagLine || '',
    displayName: row.displayName || row.gameName || '',
    profileIconId: Number(row.profileIcon) || 0,
    platform: String(row.platform || '').toLowerCase(),
    tier: row.tier || '',
    division: row.rank || '',
    lp: Number(row.leaguePoints) || 0,
    lane: row.lane || '',
    level: Number(row.summonerLevel) || 0,
    games: Number(row.games) || 0,
    winrate: Math.round((Number(row.winrate) || 0) * 10) / 10,
    kills: Math.round((Number(row.kills) || 0) * 10) / 10,
    deaths: Math.round((Number(row.deaths) || 0) * 10) / 10,
    assists: Math.round((Number(row.assists) || 0) * 10) / 10,
    kda: kdaOf(row),
    goldDiffAt15: Math.round(Number(row.goldDiffAt15) || 0),
    csDiffAt15: Math.round((Number(row.csDiffAt15) || 0) * 10) / 10,
    killParticipation: Math.round((Number(row.killParticipation) || 0) * 10) / 10,
    firstbloodRate: Math.round((Number(row.firstbloodRate) || 0) * 10) / 10,
    visionScorePerMinute: Math.round((Number(row.visionScorePerMinute) || 0) * 100) / 100,
    csm: Math.round((Number(row.csm) || 0) * 100) / 100,
    dmgm: Math.round(Number(row.dmgm) || 0),
    dmggold: Math.round((Number(row.dmggold) || 0) * 100) / 100,
    uniqueChampions: Number(row.uniqueChampions) || 0,
    champions: champs,
  };
}

function sortValue(row, key) {
  if (key === 'lp') return row.lp;
  if (key === 'level') return row.level;
  return Number(row[key]) || 0;
}

async function loadRaw(platform) {
  const key = platform;
  const hit = rawCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

  if (inflight.has(key)) return inflight.get(key);

  const work = (async () => {
    try {
      const url = `https://dpm.lol/v1/scouting/players?platform=${encodeURIComponent(platform)}`;
      const players = await fetchJson(url);
      const list = Array.isArray(players) ? players : [];
      const payload = { at: Date.now(), list };
      rawCache.set(key, payload);
      return payload;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, work);
  return work;
}

async function getScouting({
  platform = 'euw1',
  lane = 'all',
  minLp = 500,
  sort = 'kda',
  dir = 'desc',
  q = '',
  limit = 200,
} = {}) {
  const plat = normalizePlatform(platform);
  const roleLane = normalizeLane(lane);
  const lpFloor = Math.max(0, Math.min(5000, Number(minLp) || 0));
  const sortKey = SORT_KEYS.has(String(sort || '').trim()) ? String(sort).trim() : 'kda';
  const descending = String(dir || 'desc').toLowerCase() !== 'asc';
  const query = String(q || '').trim().toLowerCase();
  const max = Math.max(20, Math.min(500, Number(limit) || 200));

  try {
    const [raw, names] = await Promise.all([loadRaw(plat), loadChampionNames()]);
    let rows = raw.list;

    if (lpFloor > 0) {
      rows = rows.filter((p) => (Number(p.leaguePoints) || 0) >= lpFloor);
    }
    if (roleLane) {
      rows = rows.filter((p) => String(p.lane || '').toUpperCase() === roleLane);
    }
    if (query) {
      rows = rows.filter((p) => {
        const name = `${p.gameName || ''}#${p.tagLine || ''} ${p.displayName || ''}`.toLowerCase();
        return name.includes(query);
      });
    }

    const mapped = rows.map((row) => mapPlayer(row, names));
    mapped.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (bv === av) return b.lp - a.lp;
      return descending ? (bv - av) : (av - bv);
    });

    const entries = mapped.slice(0, max).map((row, i) => ({ ...row, rank: i + 1 }));

    return {
      ok: true,
      source: 'dpm',
      platform: plat,
      lane: roleLane || 'all',
      minLp: lpFloor,
      sort: sortKey,
      dir: descending ? 'desc' : 'asc',
      total: raw.list.length,
      matched: mapped.length,
      updatedAt: raw.at,
      ddragonVersion: names.version || '',
      entries,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Could not load scouting players',
      entries: [],
      matched: 0,
      total: 0,
    };
  }
}

module.exports = { getScouting };
