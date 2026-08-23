const cache = new Map();
const TTL_MS = 20 * 60 * 1000;
const LANE = { Top: 'top', Jungle: 'jungle', Mid: 'middle', ADC: 'bottom', Support: 'support' };
const BOOTS = new Set([3006, 3009, 3010, 3020, 3047, 3111, 3117, 3158, 2422, 3171, 3513]);
const SLUG = {
  MonkeyKing: 'wukong',
  Wukong: 'wukong',
  DrMundo: 'drmundo',
  ChoGath: 'chogath',
  KaiSa: 'kaisa',
  KhaZix: 'khazix',
  VelKoz: 'velkoz',
  LeBlanc: 'leblanc',
  Nunu: 'nunu',
  RekSai: 'reksai',
  BelVeth: 'belveth',
  JarvanIV: 'jarvaniv',
  TwistedFate: 'twistedfate',
  MasterYi: 'masteryi',
  MissFortune: 'missfortune',
  TahmKench: 'tahmkench',
  AurelionSol: 'aurelionsol',
  LeeSin: 'leesin',
  XinZhao: 'xinzhao',
};

const PLATFORM_REGION = {
  euw1: 'euw',
  eun1: 'eune',
  na1: 'na',
  br1: 'br',
  la1: 'lan',
  la2: 'las',
  kr: 'kr',
  jp1: 'jp',
  oc1: 'oce',
  tr1: 'tr',
  ru: 'ru',
  me1: 'me',
  sg2: 'sg',
  ph2: 'ph',
  tw2: 'tw',
  th2: 'th',
  vn2: 'vn',
};

function slugOf(champion) {
  const key = String(champion || '').trim();
  if (SLUG[key]) return SLUG[key];
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const { parseQwikGraph } = require('./lolalytics-graph');

async function lolalyticsFetch(url, accept = 'application/json') {
  const headers = {
    accept,
    origin: 'https://lolalytics.com',
    referer: 'https://lolalytics.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  let res;
  try {
    const { net } = require('electron');
    res = await net.fetch(url, { headers });
  } catch {
    res = await fetch(url, { headers });
  }
  if (!res.ok) throw new Error(`lolalytics ${res.status}`);
  return res;
}

async function httpGet(url) {
  const res = await lolalyticsFetch(url);
  return res.json();
}

async function httpGetText(url) {
  const res = await lolalyticsFetch(url, 'text/html,application/json,*/*');
  return res.text();
}

function buildPageUrl(slug, lane, rank, region) {
  const q = new URLSearchParams({ lane, tier: rank });
  if (region) q.set('region', region);
  return `https://lolalytics.com/lol/${slug}/build/?${q}`;
}

function megaUrl(ep, slug, lane, tier, region, extra = {}) {
  const q = new URLSearchParams({ ep, c: slug, lane, tier });
  if (region) q.set('region', region);
  Object.entries(extra).forEach(([k, v]) => {
    if (v != null && v !== '') q.set(k, v);
  });
  return `https://a1.lolalytics.com/mega/?${q.toString()}`;
}

const MATCHUP_LANES = [
  ['all', null],
  ['top', 'top'],
  ['jungle', 'jungle'],
  ['middle', 'middle'],
  ['bottom', 'bottom'],
  ['support', 'support'],
];

function parsePath(row) {
  if (!Array.isArray(row) || row.length < 2) return null;
  const ids = String(row[0] || '').split('_').map(Number).filter((id) => id > 0);
  const games = Number(row[1]) || 0;
  const wins = Number(row[2]) || 0;
  if (!ids.length || games <= 0) return null;
  return { ids, games, wins, wr: (wins / games) * 100 };
}

function parseEarly(row) {
  if (!Array.isArray(row) || row.length < 2) return null;
  const ids = String(row[0] || '').split('_').map(Number).filter((id) => id > 0);
  const wr = Number(row[1]) || 0;
  const games = Number(row[row.length - 1]) || 0;
  if (!ids.length || games <= 0) return null;
  return { ids, wr, games };
}

let champMaps = null;
async function loadChampMaps() {
  if (champMaps) return champMaps;
  const versions = await httpGet('https://ddragon.leagueoflegends.com/api/versions.json');
  const ver = Array.isArray(versions) ? versions[0] : null;
  const data = await httpGet(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`);
  const byId = {};
  const byKey = {};
  const ddragonId = {};
  Object.values(data.data || {}).forEach((ch) => {
    byId[String(ch.key)] = ch.name;
    byKey[ch.id] = ch.name;
    ddragonId[String(ch.key)] = ch.id;
  });
  champMaps = { byId, byKey, ddragonId, version: ver };
  return champMaps;
}

function nameOf(maps, cid) {
  return maps.byKey[String(cid)] || maps.byId[String(cid)] || null;
}

function rankOptions(rows, totalGames) {
  const ranked = (rows || []).map(parsePath).filter(Boolean);
  ranked.sort((a, b) => b.games - a.games);
  const top = ranked.slice(0, 5);
  const total = top.reduce((s, r) => s + r.games, 0) || totalGames || 1;
  return top.map((row) => ({
    ids: row.ids,
    id: row.ids[row.ids.length - 1],
    games: row.games,
    wr: Number(row.wr.toFixed(1)),
    pickPct: Number(((row.games / total) * 100).toFixed(1)),
  }));
}

function bootOptions(rows) {
  return rankOptions(rows).filter((row) => BOOTS.has(row.id));
}

function starterOptions(rows) {
  const parsed = (rows || []).map(parseEarly).filter(Boolean);
  const bestByFirst = new Map();
  for (const path of parsed) {
    const first = path.ids[0];
    if (!first) continue;
    const prev = bestByFirst.get(first);
    if (!prev || path.games > prev.games) bestByFirst.set(first, path);
  }
  return [...bestByFirst.values()]
    .sort((a, b) => b.games - a.games)
    .slice(0, 4)
    .map((row) => ({
      ids: row.ids.map(normalizeItemId),
      wr: Number(row.wr.toFixed(1)),
      games: row.games,
    }));
}

function normalizeItemId(id) {
  const n = Number(id) || 0;
  // Legacy Recurve Bow id → Scout's Slingshot (DPM "c44").
  if (n === 1044) return 3144;
  return n;
}

function coreOptions(rows) {
  return rankOptions(rows).slice(0, 3).map((row) => ({
    ids: row.ids.slice(-3),
    wr: row.wr,
    games: row.games,
    pickPct: row.pickPct,
  }));
}

function laneLabel(d2) {
  const v = Number(d2) || 0;
  if (v >= 4) return 'good';
  if (v <= -4) return 'bad';
  return 'avg';
}

function matchupRows(list, maps, kind) {
  const sorted = [...(list || [])].sort((a, b) => {
    if (kind === 'good') return Number(b.d1) - Number(a.d1);
    return Number(a.d1) - Number(b.d1) || Number(a.vsWr) - Number(b.vsWr);
  });
  return sorted.slice(0, 24).map((row) => ({
    champion: nameOf(maps, row.cid),
    cid: Number(row.cid) || 0,
    ddragonId: maps.ddragonId?.[String(row.cid)] || '',
    vsWr: Number(row.vsWr) || 0,
    games: Number(row.n) || 0,
    delta: Number(row.d1) || 0,
    laneDelta: Number(row.d2) || 0,
    lane: row.defaultLane || '',
    laneTag: laneLabel(row.d2),
  })).filter((row) => row.champion);
}

function pickGoodMatchups(ranked, maps) {
  const positive = ranked.filter((row) => Number(row.d1) > 0);
  const pool = positive.length ? positive : ranked;
  const sorted = [...pool].sort((a, b) => Number(b.d1) - Number(a.d1));
  return matchupRows(sorted, maps, 'good');
}

function pickBadMatchups(ranked, maps, stats) {
  const weakIds = new Set(stats?.counters?.weak || []);
  const goodTop = new Set(
    [...ranked].sort((a, b) => Number(b.d1) - Number(a.d1)).slice(0, 5).map((row) => row.cid),
  );
  const sorted = [...ranked].sort((a, b) => {
    const aWeak = weakIds.has(a.cid) ? 0 : 1;
    const bWeak = weakIds.has(b.cid) ? 0 : 1;
    if (aWeak !== bWeak) return aWeak - bWeak;
    return Number(a.d1) - Number(b.d1) || Number(a.vsWr) - Number(b.vsWr);
  });
  const negative = sorted.filter((row) => Number(row.d1) < 0 && !goodTop.has(row.cid));
  const pool = negative.length >= 5
    ? negative
    : sorted.filter((row) => !goodTop.has(row.cid));
  return matchupRows(pool, maps, 'bad');
}

async function fetchChampionDetail({
  champion,
  role = 'Mid',
  rank = 'master',
  platform = 'euw1',
} = {}) {
  const slug = slugOf(champion);
  if (!slug) return { ok: false, error: 'Unknown champion.' };

  const lane = LANE[role] || 'middle';
  const region = PLATFORM_REGION[String(platform || '').toLowerCase()] || '';
  const key = `${slug}|${lane}|${rank}|${region}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  try {
    const maps = await loadChampMaps();
    const [counterJsons, itemJson, earlyJson, buildHtml] = await Promise.all([
      Promise.all(
        MATCHUP_LANES.map(([, vslane]) => httpGet(
          megaUrl('counter', slug, lane, rank, region, vslane ? { vslane } : {}),
        )),
      ),
      httpGet(megaUrl('build-itemset', slug, lane, rank, region)),
      httpGet(megaUrl('build-earlyset', slug, lane, rank, region)).catch(() => null),
      httpGetText(buildPageUrl(slug, lane, rank, region)).catch(() => null),
    ]);
    const trends = buildHtml ? parseQwikGraph(buildHtml, rank) : null;

    const counterJson = counterJsons[0] || {};
    const stats = counterJson.stats || {};
    const sets = itemJson?.itemSets || {};

    const matchups = Object.fromEntries(
      MATCHUP_LANES.map(([key], i) => {
        const json = counterJsons[i] || {};
        const ranked = [...(json.counters || [])].map((row) => ({
          ...row,
          champion: nameOf(maps, row.cid),
        })).filter((row) => row.champion);
        return [key, {
          good: pickGoodMatchups(ranked, maps),
          bad: pickBadMatchups(ranked, maps, json.stats || stats),
        }];
      }),
    );

    const payload = {
      ok: true,
      champion,
      role,
      rank,
      platform,
      stats: {
        winrate: Number(stats.wr) || 0,
        pickrate: Number(stats.pr) || 0,
        banrate: Number(stats.br) || 0,
        analysed: Number(stats.analysed) || 0,
        avgWr: Number(stats.avgWr) || 0,
        lanes: stats.lanes || {},
      },
      matchups,
      items: {
        starters: starterOptions(earlyJson?.earlySet),
        boots: bootOptions(sets.itemBootSet2 || sets.itemBootSet1),
        slot1: rankOptions(sets.itemSet1, stats.analysed).slice(0, 4),
        slot2: rankOptions(sets.itemSet2).slice(0, 4),
        slot3: rankOptions(sets.itemSet3).slice(0, 4),
        slot4: rankOptions(sets.itemSet4).slice(0, 4),
        slot5: rankOptions(sets.itemSet5).slice(0, 4),
        cores: coreOptions(sets.itemSet3),
      },
      trends,
    };
    cache.set(key, { at: Date.now(), data: payload });
    return payload;
  } catch (err) {
    return { ok: false, error: err.message || 'Could not load champion detail.' };
  }
}

module.exports = function registerChampionDetail(ipcMain) {
  ipcMain.handle('meta:championDetail', (_e, args) => fetchChampionDetail(args || {}));
};
