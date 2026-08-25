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
    "Cho'Gath": 'Chogath',
    "Kai'Sa": 'Kaisa',
    "Kha'Zix": 'Khazix',
    "Kog'Maw": 'KogMaw',
    "Lee Sin": 'LeeSin',
    "Master Yi": 'MasterYi',
    "Miss Fortune": 'MissFortune',
    "Nunu & Willump": 'Nunu',
    "Rek'Sai": 'RekSai',
    "Renata Glasc": 'Renata',
    "Tahm Kench": 'TahmKench',
    "Twisted Fate": 'TwistedFate',
    "Vel'Koz": 'Velkoz',
    "Xin Zhao": 'XinZhao',
    "Aurelion Sol": 'AurelionSol',
    "Jarvan IV": 'JarvanIV',
    Wukong: 'MonkeyKing',
    "Dr. Mundo": 'DrMundo',
  };
  if (SLUG[raw]) return SLUG[raw];
  return raw.replace(/[^a-zA-Z0-9]/g, '');
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
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier}.png`;
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
