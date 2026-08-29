/** OTP (one-trick) leaderboard — DPM.lol champions ladder. */

const cloudscraper = require('cloudscraper');
const { publicError, blockedError } = require('./safe-error');

const CACHE_TTL_MS = 10 * 60 * 1000;
const LANES = new Set(['top', 'jungle', 'middle', 'bottom', 'utility']);
const PLATFORMS = new Set([
  'euw1', 'eun1', 'na1', 'br1', 'kr', 'jp1', 'la1', 'la2', 'oc1', 'tr1', 'ru', 'me1',
  'ph2', 'sg2', 'th2', 'tw2', 'vn2',
]);

const cache = new Map();
const inflight = new Map();
let nameCache = null;

async function fetchJson(url) {
  let body;
  try {
    body = await cloudscraper.get({
      uri: url,
      headers: {
        Accept: 'application/json',
        Origin: 'https://dpm.lol',
        Referer: 'https://dpm.lol/leaderboards/otps',
      },
    });
  } catch {
    throw blockedError('OTP leaderboard');
  }
  const text = String(body || '');
  if (text.trimStart().startsWith('<')) throw blockedError('OTP leaderboard');
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

function normalizeLane(lane) {
  const raw = String(lane || '').trim().toLowerCase();
  if (!raw || raw === 'all') return '';
  return LANES.has(raw) ? raw : '';
}

function normalizePlatform(platform) {
  const raw = String(platform || '').trim().toLowerCase();
  if (!raw || raw === 'all') return '';
  return PLATFORMS.has(raw) ? raw : '';
}

function kdaOf(row) {
  const d = Math.max(1, Number(row.deaths) || 0);
  const k = Number(row.kills) || 0;
  const a = Number(row.assists) || 0;
  return Math.round(((k + a) / d) * 10) / 10;
}

function mapPlayer(row, index, names) {
  const champMeta = names?.byId?.[String(row.championId)] || {};
  const rank = Array.isArray(row.ranks) && row.ranks[0] ? row.ranks[0] : null;
  const games = Number(row.games) || 0;
  const wins = Number(row.win) || 0;
  return {
    rank: index + 1,
    puuid: row.puuid || '',
    platform: String(row.platform || '').toLowerCase(),
    gameName: row.gameName || row.displayName || '',
    tagLine: row.tagLine || '',
    displayName: row.displayName || row.gameName || '',
    profileIconId: Number(row.profileIcon) || 0,
    championId: Number(row.championId) || 0,
    champion: champMeta.name || String(row.championId || ''),
    championKey: champMeta.id || '',
    games,
    wins,
    winrate: games > 0 ? Math.round((wins / games) * 100) : 0,
    playRate: Math.round((Number(row.playRate) || 0) * 10) / 10,
    kda: kdaOf(row),
    kills: Number(row.kills) || 0,
    deaths: Number(row.deaths) || 0,
    assists: Number(row.assists) || 0,
    primaryRuneId: Number(row.primaryRuneId) || 0,
    secondaryRuneId: Number(row.secondaryRuneId) || 0,
    items: [row.itemId, row.itemId2, row.itemId3].map(Number).filter((id) => id > 0),
    tier: rank?.tier || '',
    division: rank?.rank || '',
    lp: Number(rank?.leaguePoints) || 0,
  };
}

async function fetchPage({ platform, lane, page }) {
  const q = new URLSearchParams({ page: String(page) });
  if (platform) q.set('platform', platform);
  if (lane) q.set('lane', lane);
  const url = `https://dpm.lol/v1/leaderboards/champions?${q.toString()}`;
  return fetchJson(url);
}

async function getOtps({
  platform = 'all',
  lane = 'all',
  page = 1,
  allPages = false,
} = {}) {
  const plat = normalizePlatform(platform);
  const roleLane = normalizeLane(lane);
  const pageNum = Math.max(1, Math.min(20, Number(page) || 1));
  const cacheKey = `${plat || 'all'}|${roleLane || 'all'}|${allPages ? 'all' : pageNum}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.payload;

  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const work = (async () => {
    try {
      const names = await loadChampionNames();
      let players = [];
      let total = 0;

      if (allPages) {
        const first = await fetchPage({ platform: plat, lane: roleLane, page: 1 });
        players = Array.isArray(first.players) ? first.players.slice() : [];
        total = Number(first.total) || players.length;
        const pageSize = Math.max(1, players.length || 50);
        const pages = Math.min(10, Math.ceil(total / pageSize));
        if (pages > 1) {
          const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, i) => (
              fetchPage({ platform: plat, lane: roleLane, page: i + 2 })
            )),
          );
          rest.forEach((payload) => {
            if (Array.isArray(payload?.players)) players.push(...payload.players);
          });
        }
      } else {
        const payload = await fetchPage({ platform: plat, lane: roleLane, page: pageNum });
        players = Array.isArray(payload.players) ? payload.players : [];
        total = Number(payload.total) || players.length;
      }

      const entries = players.map((row, i) => mapPlayer(row, i, names));
      const result = {
        ok: true,
        source: 'dpm',
        platform: plat || 'all',
        lane: roleLane || 'all',
        page: allPages ? 1 : pageNum,
        total,
        ddragonVersion: names.version || '',
        criteria: {
          minPlayRate: 50,
          minGames: 10,
          ranking: 'soloq_lp',
        },
        entries,
      };
      cache.set(cacheKey, { at: Date.now(), payload: result });
      return result;
    } catch (err) {
      return {
        ok: false,
        error: publicError(err, 'Could not load OTP leaderboard.'),
        entries: [],
        total: 0,
      };
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, work);
  return work;
}

module.exports = { getOtps, LANES: [...LANES] };
