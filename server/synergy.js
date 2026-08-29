/** Duo synergy tier list — DPM.lol duo + solo baselines (same source as dpm.lol/synergy). */

const cloudscraper = require('cloudscraper');
const { publicError, blockedError } = require('./safe-error');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const DUO_TYPES = {
  BOTTOM_UTILITY: { role1: 'ADC', role2: 'Support', lane1: 'BOTTOM', lane2: 'UTILITY' },
  JUNGLE_MIDDLE: { role1: 'Jungle', role2: 'Mid', lane1: 'JUNGLE', lane2: 'MIDDLE' },
  TOP_JUNGLE: { role1: 'Top', role2: 'Jungle', lane1: 'TOP', lane2: 'JUNGLE' },
  JUNGLE_UTILITY: { role1: 'Jungle', role2: 'Support', lane1: 'JUNGLE', lane2: 'UTILITY' },
  TOP_MIDDLE: { role1: 'Top', role2: 'Mid', lane1: 'TOP', lane2: 'MIDDLE' },
  TOP_BOTTOM: { role1: 'Top', role2: 'ADC', lane1: 'TOP', lane2: 'BOTTOM' },
  TOP_UTILITY: { role1: 'Top', role2: 'Support', lane1: 'TOP', lane2: 'UTILITY' },
};

const ROLE_TO_DUO = {
  'ADC|Support': 'BOTTOM_UTILITY',
  'Support|ADC': 'BOTTOM_UTILITY',
  'Jungle|Mid': 'JUNGLE_MIDDLE',
  'Mid|Jungle': 'JUNGLE_MIDDLE',
  'Top|Jungle': 'TOP_JUNGLE',
  'Jungle|Top': 'TOP_JUNGLE',
  'Jungle|Support': 'JUNGLE_UTILITY',
  'Support|Jungle': 'JUNGLE_UTILITY',
  'Top|Mid': 'TOP_MIDDLE',
  'Mid|Top': 'TOP_MIDDLE',
  'Top|ADC': 'TOP_BOTTOM',
  'ADC|Top': 'TOP_BOTTOM',
  'Top|Support': 'TOP_UTILITY',
  'Support|Top': 'TOP_UTILITY',
};

/** Keep meta-lane duos — reject offrole noise (e.g. Gwen "ADC"). */
const MIN_LANE_SHARE = 12;
/** Default sample floor; high-elo noise needs more games. */
const MIN_GAMES_BY_TIER = {
  challenger: 40,
  grandmaster: 60,
  master: 150,
  master_plus: 150,
  diamond: 120,
  diamond_plus: 120,
  emerald: 100,
  emerald_plus: 100,
  platinum: 80,
  platinum_plus: 80,
  gold: 60,
  gold_plus: 60,
  silver: 50,
  bronze: 40,
  iron: 40,
};

const cache = new Map();
const inflight = new Map();
let nameCache = null;

function resolveDuoType(role1, role2, duoType) {
  const raw = String(duoType || '').toUpperCase();
  if (DUO_TYPES[raw]) return raw;
  return ROLE_TO_DUO[`${role1}|${role2}`] || 'BOTTOM_UTILITY';
}

function defaultMinGames(tier) {
  return MIN_GAMES_BY_TIER[String(tier || '').toLowerCase()] || 100;
}

async function fetchJson(url) {
  let body;
  try {
    body = await cloudscraper.get({
      uri: url,
      headers: {
        Accept: 'application/json',
        Origin: 'https://dpm.lol',
        Referer: 'https://dpm.lol/tierlist/synergy',
      },
    });
  } catch {
    throw blockedError('Synergy');
  }
  const text = String(body || '');
  if (text.trimStart().startsWith('<')) throw blockedError('Synergy');
  return JSON.parse(text);
}

async function loadChampionNames() {
  if (nameCache) return nameCache;
  try {
    const versions = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then((r) => r.json());
    const ver = versions?.[0];
    if (!ver) return {};
    const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`)
      .then((r) => r.json());
    const byId = {};
    const byKey = {};
    Object.values(data.data || {}).forEach((ch) => {
      byId[String(ch.key)] = ch.name;
      byKey[String(ch.id).toLowerCase()] = ch.name;
    });
    nameCache = { byId, byKey, version: ver };
    return nameCache;
  } catch {
    return { byId: {}, byKey: {}, version: '' };
  }
}

function displayName(raw, names) {
  const id = String(raw || '');
  if (!id) return '';
  if (names?.byId?.[id]) return names.byId[id];
  if (names?.byKey?.[id.toLowerCase()]) return names.byKey[id.toLowerCase()];
  return id.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function laneShare(champ, lane) {
  const share = champ?.lanesPickrate?.[lane];
  if (share == null) return 100;
  return Number(share) || 0;
}

function indexSolo(champions) {
  const byNameLane = new Map();
  for (const row of champions || []) {
    const key = `${String(row.championName || '').toLowerCase()}|${row.lane}`;
    byNameLane.set(key, row);
  }
  return byNameLane;
}

async function getSynergy({
  platform = 'euw1',
  rank = 'master',
  role1 = 'ADC',
  role2 = 'Support',
  duoType = '',
  timeframe = '30days',
  minGames,
} = {}) {
  const type = resolveDuoType(role1, role2, duoType);
  const roles = DUO_TYPES[type];
  const plat = String(platform || 'euw1').toLowerCase();
  const tier = String(rank || 'master').toLowerCase();
  const tf = ['7days', '14days', '30days'].includes(timeframe) ? timeframe : '30days';
  const min = Math.max(20, Number(minGames) || defaultMinGames(tier));

  const key = `v2|${type}|${plat}|${tier}|${tf}|${min}`;
  const hit = cache.get(key);
  if (hit?.at && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.data, cached: true };
  }
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const duoParams = new URLSearchParams({
      duoType: type,
      platform: plat,
      tier,
      timeframe: tf,
    });
    const soloParams = new URLSearchParams({
      platform: plat,
      tier,
      timeframe: tf,
    });

    const [rawDuo, rawSolo, names] = await Promise.all([
      fetchJson(`https://dpm.lol/v1/tierlist/duo?${duoParams.toString()}`),
      fetchJson(`https://dpm.lol/v1/tierlist?${soloParams.toString()}`),
      loadChampionNames(),
    ]);

    const solo = indexSolo(rawSolo?.champions);
    const duos = (Array.isArray(rawDuo?.duos) ? rawDuo.duos : [])
      .map((row) => {
        const id1 = row.champion1Name || String(row.champion1Id || '');
        const id2 = row.champion2Name || String(row.champion2Id || '');
        const champion1 = displayName(id1, names);
        const champion2 = displayName(id2, names);
        const games = Number(row.count) || 0;
        const winrate = Number(row.winrate) || 0;
        const base1 = solo.get(`${String(id1).toLowerCase()}|${roles.lane1}`);
        const base2 = solo.get(`${String(id2).toLowerCase()}|${roles.lane2}`);
        const wr1 = base1 ? Number(base1.winrate) : null;
        const wr2 = base2 ? Number(base2.winrate) : null;
        const share1 = laneShare(base1, roles.lane1);
        const share2 = laneShare(base2, roles.lane2);
        let synergy = null;
        if (wr1 != null && wr2 != null) {
          synergy = winrate - ((wr1 + wr2) / 2);
        }
        return {
          champion1,
          champion2,
          champion1Id: id1,
          champion2Id: id2,
          role1: roles.role1,
          role2: roles.role2,
          games,
          winrate,
          pickrate: Number(row.pickrate) || 0,
          synergy,
          expectedWr: wr1 != null && wr2 != null ? (wr1 + wr2) / 2 : null,
          laneShare1: share1,
          laneShare2: share2,
        };
      })
      .filter((row) => (
        row.games >= min
        && row.champion1
        && row.champion2
        && row.synergy != null
        && row.laneShare1 >= MIN_LANE_SHARE
        && row.laneShare2 >= MIN_LANE_SHARE
      ))
      .sort((a, b) => {
        if (b.synergy !== a.synergy) return b.synergy - a.synergy;
        return (b.winrate - a.winrate) || (b.games - a.games);
      });

    const payload = {
      ok: true,
      source: 'dpm',
      duoType: type,
      role1: roles.role1,
      role2: roles.role2,
      platform: plat,
      rank: tier,
      timeframe: tf,
      minGames: min,
      total: Number(rawDuo?.total) || duos.length,
      analysed: Number(rawDuo?.total) || null,
      patch: names.version ? String(names.version).split('.').slice(0, 2).join('.') : null,
      rows: duos,
      pairings: Object.entries(DUO_TYPES).map(([id, r]) => ({
        id,
        role1: r.role1,
        role2: r.role2,
      })),
    };
    cache.set(key, { at: Date.now(), data: payload });
    return payload;
  })().catch((err) => ({
    ok: false,
    error: publicError(err, 'Could not load synergy list.'),
    rows: [],
    pairings: Object.entries(DUO_TYPES).map(([id, r]) => ({
      id,
      role1: r.role1,
      role2: r.role2,
    })),
  })).finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

module.exports = { getSynergy, DUO_TYPES, ROLE_TO_DUO };
