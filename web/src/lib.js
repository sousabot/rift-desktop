export const REGIONS = [
  { label: 'Europe West (EUW)', region: 'europe', platform: 'euw1', short: 'EUW' },
  { label: 'Europe Nordic & East (EUNE)', region: 'europe', platform: 'eun1', short: 'EUNE' },
  { label: 'North America (NA)', region: 'americas', platform: 'na1', short: 'NA' },
  { label: 'Brazil (BR)', region: 'americas', platform: 'br1', short: 'BR' },
  { label: 'Korea (KR)', region: 'asia', platform: 'kr', short: 'KR' },
  { label: 'Japan (JP)', region: 'asia', platform: 'jp1', short: 'JP' },
  { label: 'Latin America North (LAN)', region: 'americas', platform: 'la1', short: 'LAN' },
  { label: 'Latin America South (LAS)', region: 'americas', platform: 'la2', short: 'LAS' },
  { label: 'Oceania (OCE)', region: 'sea', platform: 'oc1', short: 'OCE' },
  { label: 'Turkey (TR)', region: 'europe', platform: 'tr1', short: 'TR' },
  { label: 'Russia (RU)', region: 'europe', platform: 'ru', short: 'RU' },
  { label: 'Middle East (ME)', region: 'europe', platform: 'me1', short: 'ME' },
];

export function parseRiotIdInput(nameInput = '', tagInput = '') {
  let gameName = String(nameInput || '').trim();
  let tagLine = String(tagInput || '').trim().replace(/^#/, '');
  if (gameName.includes('#')) {
    const [name, tag] = gameName.split('#');
    gameName = (name || '').trim();
    tagLine = (tag || tagLine).trim();
  }
  return { gameName, tagLine: tagLine.toUpperCase() };
}

export function platformShort(platform) {
  const hit = REGIONS.find((r) => r.platform === platform);
  return hit?.short || String(platform || '').toUpperCase().replace(/1$/, '');
}

export function champDdragonId(name) {
  const raw = String(name || 'Aatrox').trim();
  const SLUG = {
    "Bel'Veth": 'Belveth',
    BelVeth: 'Belveth',
    "Cho'Gath": 'Chogath',
    ChoGath: 'Chogath',
    "Kai'Sa": 'Kaisa',
    KaiSa: 'Kaisa',
    "Kha'Zix": 'Khazix',
    KhaZix: 'Khazix',
    "Kog'Maw": 'KogMaw',
    'Lee Sin': 'LeeSin',
    'Master Yi': 'MasterYi',
    'Miss Fortune': 'MissFortune',
    'Nunu & Willump': 'Nunu',
    "Rek'Sai": 'RekSai',
    RekSai: 'RekSai',
    'Renata Glasc': 'Renata',
    RenataGlasc: 'Renata',
    'Tahm Kench': 'TahmKench',
    'Twisted Fate': 'TwistedFate',
    "Vel'Koz": 'Velkoz',
    VelKoz: 'Velkoz',
    'Xin Zhao': 'XinZhao',
    'Aurelion Sol': 'AurelionSol',
    'Jarvan IV': 'JarvanIV',
    Wukong: 'MonkeyKing',
    'Monkey King': 'MonkeyKing',
    MonkeyKing: 'MonkeyKing',
    'Dr. Mundo': 'DrMundo',
    DrMundo: 'DrMundo',
    LeBlanc: 'Leblanc',
  };
  if (SLUG[raw]) return SLUG[raw];
  const compact = raw.replace(/[^a-zA-Z0-9]/g, '');
  if (SLUG[compact]) return SLUG[compact];
  const COMPACT = {
    belveth: 'Belveth',
    chogath: 'Chogath',
    kaisa: 'Kaisa',
    khazix: 'Khazix',
    kogmaw: 'KogMaw',
    leesin: 'LeeSin',
    masteryi: 'MasterYi',
    missfortune: 'MissFortune',
    reksai: 'RekSai',
    renataglasc: 'Renata',
    tahmkench: 'TahmKench',
    twistedfate: 'TwistedFate',
    velkoz: 'Velkoz',
    xinzhao: 'XinZhao',
    aurelionsol: 'AurelionSol',
    jarvaniv: 'JarvanIV',
    wukong: 'MonkeyKing',
    monkeyking: 'MonkeyKing',
    drmundo: 'DrMundo',
    leblanc: 'Leblanc',
  };
  const lower = compact.toLowerCase();
  if (COMPACT[lower]) return COMPACT[lower];
  return compact || 'Aatrox';
}

export function champIconUrl(name, version = '16.16.1') {
  const id = champDdragonId(name);
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${id}.png`;
}

export function champSplashUrl(name) {
  const id = champDdragonId(name);
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;
}

export function champCenteredUrl(name, ddragonId = '') {
  const id = ddragonId || champDdragonId(name);
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${id}_0.jpg`;
}

export function itemIconUrl(id, version = '16.16.1') {
  const n = Number(id);
  if (!n) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${n}.png`;
}

export function spellIconUrl(file, version = '16.16.1') {
  if (!file) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${file}`;
}

export function passiveIconUrl(file, version = '16.16.1') {
  if (!file) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive/${file}`;
}

export function summonerIconUrl(id, version = '16.16.1') {
  const map = {
    4: 'SummonerFlash',
    6: 'SummonerHaste',
    7: 'SummonerHeal',
    11: 'SummonerSmite',
    12: 'SummonerTeleport',
    14: 'SummonerDot',
    21: 'SummonerBarrier',
    3: 'SummonerExhaust',
    1: 'SummonerBoost',
    13: 'SummonerMana',
    32: 'SummonerSnowball',
  };
  const key = map[Number(id)] || 'SummonerFlash';
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${key}.png`;
}

const PING_CDN = 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/pings/';
const PING_FILES = {
  assist: 'assist.png',
  onMyWay: 'on_my_way_new.png',
  missing: 'mia_new.png',
  needVision: 'need_ward.png',
  enemyVision: 'area_is_warded_small_red_new.png',
  allIn: 'bait.png',
  danger: 'caution.png',
  push: 'push.png',
};

export function pingIconUrl(key) {
  const file = PING_FILES[key];
  return file ? `${PING_CDN}${file}` : '';
}

const ROLE_ICON_CDN = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/';
const ROLE_ICON_FILES = {
  TOP: 'icon-position-top.png',
  JUNGLE: 'icon-position-jungle.png',
  MIDDLE: 'icon-position-middle.png',
  BOTTOM: 'icon-position-bottom.png',
  UTILITY: 'icon-position-utility.png',
};

export function roleIconUrl(roleKey) {
  const file = ROLE_ICON_FILES[String(roleKey || '').toUpperCase()];
  return file ? `${ROLE_ICON_CDN}${file}` : '';
}

const ROLE_PERF_ORDER = ['BOTTOM', 'JUNGLE', 'MIDDLE', 'TOP', 'UTILITY'];
const ROLE_PERF_LABELS = {
  BOTTOM: 'ADC',
  JUNGLE: 'JUNGLE',
  MIDDLE: 'MID',
  TOP: 'TOP',
  UTILITY: 'SUPPORT',
};
const TOTAL_PING_AGG_KEYS = ['assist', 'onMyWay', 'missing', 'needVision', 'enemyVision', 'allIn'];

const EMPTY_PING_TOTALS = {
  games: 0,
  totals: {
    assist: 0, onMyWay: 0, missing: 0, needVision: 0, enemyVision: 0, allIn: 0,
  },
  averages: {
    assist: 0, onMyWay: 0, missing: 0, needVision: 0, enemyVision: 0, allIn: 0,
  },
};

/**
 * Sidebar aggregates. Renders whatever the dashboard already returned (last-N
 * games) so the cards are never blank, then swaps to the wider career scan once
 * `/career-sidebar` lands and sets `careerSidebar`.
 */
export function deriveDashboardExtras(profile) {
  const career = Boolean(profile?.careerSidebar);
  const apiRoles = Array.isArray(profile?.rolePerformance) ? profile.rolePerformance : [];
  const apiPlayed = Array.isArray(profile?.playedWith) ? profile.playedWith : [];

  const rolePerformance = apiRoles.length ? apiRoles : deriveRolePerformance([]);
  const playedWith = apiPlayed.slice(0, 4);
  const totalPings = profile?.totalPings?.totals ? profile.totalPings : EMPTY_PING_TOTALS;
  return { rolePerformance, playedWith, totalPings, career };
}

function deriveRolePerformance(games) {
  const map = {};
  ROLE_PERF_ORDER.forEach((key) => {
    map[key] = { wins: 0, losses: 0 };
  });
  games.forEach((g) => {
    const key = String(g.roleKey || '').toUpperCase();
    if (!map[key]) return;
    map[key][g.win ? 'wins' : 'losses'] += 1;
  });
  return ROLE_PERF_ORDER
    .map((key) => {
      const d = map[key];
      const count = d.wins + d.losses;
      return {
        roleKey: key,
        role: ROLE_PERF_LABELS[key],
        games: count,
        wins: d.wins,
        losses: d.losses,
        wr: count ? Math.round((d.wins / count) * 100) : 0,
      };
    })
    .sort((a, b) => b.games - a.games || a.role.localeCompare(b.role));
}

function derivePlayedWith(games, selfPuuid) {
  const map = {};
  games.forEach((g) => {
    const players = g.scoreboard?.players || [];
    const self = players.find((p) => p.isSelf)
      || players.find((p) => selfPuuid && p.puuid === selfPuuid);
    if (!self) return;
    players
      .filter((p) => p.teamId === self.teamId && p.puuid && p.puuid !== self.puuid)
      .forEach((p) => {
        if (!map[p.puuid]) {
          map[p.puuid] = {
            puuid: p.puuid,
            gameName: p.gameName || p.champion || 'Unknown',
            tagLine: p.tagLine || '',
            riotId: p.riotId || '',
            champion: p.champion,
            wins: 0,
            losses: 0,
          };
        }
        const row = map[p.puuid];
        row.champion = p.champion || row.champion;
        if (p.gameName) row.gameName = p.gameName;
        if (p.tagLine) row.tagLine = p.tagLine;
        if (p.riotId) row.riotId = p.riotId;
        row[g.win ? 'wins' : 'losses'] += 1;
      });
  });
  return Object.values(map)
    .map((d) => {
      const count = d.wins + d.losses;
      return { ...d, games: count, wr: count ? Math.round((d.wins / count) * 100) : 0 };
    })
    .sort((a, b) => b.games - a.games || b.wr - a.wr)
    .slice(0, 4);
}

function pingValue(p, key) {
  if (!p) return 0;
  if (Number(p[key])) return Number(p[key]) || 0;
  // Older API payloads used danger/push instead of needVision/allIn.
  if (key === 'needVision') return Number(p.needVision) || 0;
  if (key === 'allIn') return Number(p.allIn) || Number(p.push) || 0;
  return 0;
}

function deriveTotalPings(games) {
  const totals = Object.fromEntries(TOTAL_PING_AGG_KEYS.map((k) => [k, 0]));
  let counted = 0;
  games.forEach((g) => {
    if (!g.pings) return;
    counted += 1;
    TOTAL_PING_AGG_KEYS.forEach((k) => { totals[k] += pingValue(g.pings, k); });
  });
  const n = Math.max(1, counted);
  return {
    games: counted,
    totals,
    averages: Object.fromEntries(
      TOTAL_PING_AGG_KEYS.map((k) => [k, Number((totals[k] / n).toFixed(1))])
    ),
  };
}

const champKitCache = new Map();

/** Fetch champion kit (passive + QWER spells) from Data Dragon; cached per version+id. */
export async function getChampionKit(name, version = '16.16.1') {
  const id = champDdragonId(name);
  const cacheKey = `${version}:${id}`;
  if (champKitCache.has(cacheKey)) return champKitCache.get(cacheKey);
  const promise = fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${id}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`champion ${id}`);
      return r.json();
    })
    .then((data) => data?.data?.[id] || null)
    .catch(() => null);
  champKitCache.set(cacheKey, promise);
  return promise;
}

const SHARD_CDN = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/';
const SHARD_ICONS = {
  5001: 'statmodshealthplusicon.png',
  5002: 'statmodsarmoricon.png',
  5003: 'statmodsmagicresicon.png',
  5005: 'statmodsattackspeedicon.png',
  5007: 'statmodscdrscalingicon.png',
  5008: 'statmodsadaptiveforceicon.png',
  5010: 'statmodsmovementspeedicon.png',
  5011: 'statmodshealthscalingicon.png',
  5012: 'statmodsadaptiveforcescalingicon.png',
  5013: 'statmodstenacityicon.png',
};

let runeIndexPromise = null;

export function getRuneIndex() {
  if (!runeIndexPromise) {
    runeIndexPromise = ddragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/runesReforged.json`))
      .then((r) => r.json())
      .then((trees) => {
        const byId = {};
        (Array.isArray(trees) ? trees : []).forEach((tree) => {
          byId[tree.id] = { name: tree.name, icon: tree.icon };
          (tree.slots || []).forEach((slot) => {
            (slot.runes || []).forEach((rune) => {
              byId[rune.id] = { name: rune.name, icon: rune.icon };
            });
          });
        });
        Object.entries(SHARD_ICONS).forEach(([id, file]) => {
          byId[Number(id)] = { name: id, shardFile: file };
        });
        return byId;
      })
      .catch(() => {
        const byId = {};
        Object.entries(SHARD_ICONS).forEach(([id, file]) => {
          byId[Number(id)] = { name: id, shardFile: file };
        });
        return byId;
      });
  }
  return runeIndexPromise;
}

export function runeIconUrl(id, index = {}) {
  const n = Number(id);
  if (!n) return '';
  const hit = index[n] || {};
  if (hit.icon) return `https://ddragon.leagueoflegends.com/cdn/img/${hit.icon}`;
  if (hit.shardFile) return `${SHARD_CDN}${hit.shardFile}`;
  if (SHARD_ICONS[n]) return `${SHARD_CDN}${SHARD_ICONS[n]}`;
  return '';
}

export function profileIconUrl(id, version = '16.16.1') {
  if (!id) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${id}.png`;
}

/** Short "how stale is this" label for cache timestamps. Returns '' when unknown. */
export function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - Number(ts)) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export async function ddragonVersion() {
  try {
    const versions = await fetch('https://ddragon.leagueoflegends.com/api/versions.json').then((r) => r.json());
    return versions[0] || '16.16.1';
  } catch {
    return '16.16.1';
  }
}

export const RANK_COLORS = {
  IRON: '#8a8a8a',
  BRONZE: '#cd7f32',
  SILVER: '#9fb3c8',
  GOLD: '#e0b256',
  PLATINUM: '#4fd7c5',
  EMERALD: '#3ecf8e',
  DIAMOND: '#5ba2ff',
  MASTER: '#a06bff',
  GRANDMASTER: '#ff5c68',
  CHALLENGER: '#ffd76b',
};

export function rankTierKey(label) {
  return String(label || '').trim().split(/[\s/]+/)[0].toUpperCase();
}

export function rankColor(label) {
  return RANK_COLORS[rankTierKey(label)] || '#7c5cff';
}

export function rankImg(label) {
  const tier = rankTierKey(label).toLowerCase();
  if (!tier || tier === 'unranked' || tier === 'none' || tier === 'unavailable') return null;
  // OP.GG CDN (Community Dragon mini-crests are unreliable from browsers).
  return `https://opgg-static.akamaized.net/images/medals_new/${tier}.png`;
}

export function rankEmblemClass(label, base) {
  const full = new Set(['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM']);
  return full.has(rankTierKey(label)) ? `${base} is-fullframe` : base;
}

const TIER_BASE_MMR = {
  IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
  EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 2800, CHALLENGER: 2800,
};
const DIV_ORDER = ['IV', 'III', 'II', 'I'];
const TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];

export function mmrToRank(mmr) {
  if (mmr == null || !Number.isFinite(mmr)) return null;
  if (mmr >= 2800) {
    return { tier: 'MASTER', short: 'Master+', division: null };
  }
  for (let i = TIER_ORDER.length - 1; i >= 0; i -= 1) {
    const tier = TIER_ORDER[i];
    const base = TIER_BASE_MMR[tier];
    if (mmr < base) continue;
    const within = mmr - base;
    const divIdx = Math.min(3, Math.floor(within / 100));
    const division = DIV_ORDER[divIdx];
    return {
      tier,
      division,
      short: `${tier.charAt(0)}${tier.slice(1).toLowerCase()} ${division}`,
    };
  }
  return { tier: 'IRON', division: 'IV', short: 'Iron IV' };
}

export function formatMmr(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value).toLocaleString('en-US');
}

export function champLoadingUrl(name) {
  const id = champDdragonId(name);
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${id}_0.jpg`;
}
