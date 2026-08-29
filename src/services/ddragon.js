import { useEffect, useState } from 'react';

const FALLBACK_VERSION = '16.16.1';
let cached = FALLBACK_VERSION;
let pending = null;

export function getDdragonVersion() {
  if (!pending) {
    pending = fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      .then((r) => r.json())
      .then((versions) => {
        cached = versions[0] || FALLBACK_VERSION;
        return cached;
      })
      .catch(() => cached);
  }
  return pending;
}

export function useDdragonVersion() {
  const [version, setVersion] = useState(cached);
  useEffect(() => {
    getDdragonVersion().then(setVersion);
  }, []);
  return version;
}

export function champDdragonId(name) {
  const raw = String(name || 'Aatrox').trim();
  // Display name / alias → Data Dragon champion id (cdn/.../img/champion/{id}.png).
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
    KogMaw: 'KogMaw',
    'Lee Sin': 'LeeSin',
    'Master Yi': 'MasterYi',
    'Miss Fortune': 'MissFortune',
    'Nunu & Willump': 'Nunu',
    Nunu: 'Nunu',
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
    MonkeyKing: 'MonkeyKing',
    'Dr. Mundo': 'DrMundo',
    DrMundo: 'DrMundo',
    "LeBlanc": 'Leblanc',
    LeBlanc: 'Leblanc',
    'Monkey King': 'MonkeyKing',
  };
  if (SLUG[raw]) return SLUG[raw];
  const compact = raw.replace(/[^a-zA-Z0-9]/g, '');
  if (SLUG[compact]) return SLUG[compact];
  // Prefer known title-case ids from a small set of awkward compact forms.
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
  return compact.replace(/^./, (c) => c.toUpperCase()) || 'Aatrox';
}

function normChampName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

let champIndexPromise = null;

export function getChampionIndex() {
  if (!champIndexPromise) {
    champIndexPromise = getDdragonVersion()
      .then((version) => fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)
        .then((r) => r.json())
        .then((json) => {
          const byName = {};
          const byKey = {};
          Object.values(json.data || {}).forEach((ch) => {
            byKey[Number(ch.key)] = ch.id;
            [ch.name, ch.id].forEach((label) => {
              byName[normChampName(label)] = ch.id;
            });
          });
          return { version, byName, byKey };
        }))
      .catch(() => ({ version: cached, byName: {}, byKey: {} }));
  }
  return champIndexPromise;
}

export function useChampionIndex() {
  const [index, setIndex] = useState({ byName: {}, byKey: {} });
  useEffect(() => { getChampionIndex().then(setIndex); }, []);
  return index;
}

export function resolveChampDdragonId(name, index, cid) {
  const num = Number(cid);
  if (num > 0 && index?.byKey?.[num]) return index.byKey[num];
  const norm = normChampName(name);
  if (index?.byName?.[norm]) return index.byName[norm];
  return champDdragonId(name);
}

export function champPortraitUrls({ name, ddragonId, cid, index } = {}) {
  const id = ddragonId || resolveChampDdragonId(name, index, cid);
  const urls = [];
  if (id) {
    urls.push(`https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${id}_0.jpg`);
    urls.push(`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`);
  }
  const num = Number(cid);
  if (num > 0) {
    urls.push(`https://cdn.communitydragon.org/latest/champion/${num}/splash-art/centered/skin/0`);
    urls.push(`https://cdn.communitydragon.org/latest/champion/${num}/square`);
  }
  return [...new Set(urls.filter(Boolean))];
}

export function champIconUrl(name, version = cached) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champDdragonId(name)}.png`;
}

export function champLoadingUrl(name) {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champDdragonId(name)}_0.jpg`;
}

export function champSpellImgUrl(file, version = cached) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${file}`;
}

export function champPassiveImgUrl(file, version = cached) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive/${file}`;
}

export function profileIconUrl(id, version = cached) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${id}.png`;
}

export function itemIconUrl(id, version = cached) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png`;
}

let itemJsonPromise = null;
function getItemJson() {
  if (!itemJsonPromise) {
    itemJsonPromise = getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/item.json`))
      .then((r) => r.json())
      .catch(() => ({ data: {} }));
  }
  return itemJsonPromise;
}

function itemNameRank(id, item) {
  const n = Number(id);
  const onSr = item?.maps?.['11'] === true && n < 10000;
  const live = item?.inStore !== false;
  if (onSr && live) return 4;
  if (onSr) return 3;
  if (item?.maps?.['11'] === true) return 2;
  if (n < 10000) return 1;
  return 0;
}

export function getItemNameIndex() {
  return getItemJson().then((data) => {
    const byName = {};
    const rankByKey = {};
    Object.entries(data.data || {}).forEach(([id, item]) => {
      if (item?.inStore === false) return;
      const name = String(item.name || '').trim().toLowerCase();
      if (!name) return;
      const num = Number(id);
      const rank = itemNameRank(id, item);
      const keys = [name, name.replace(/['’]/g, '')];
      keys.forEach((key) => {
        if (!byName[key] || rank > (rankByKey[key] || -1)) {
          byName[key] = num;
          rankByKey[key] = rank;
        }
      });
    });
    return byName;
  });
}

export function getItemCatalog() {
  return getItemJson().then((data) => {
    const map = {};
    Object.entries(data.data || {}).forEach(([id, item]) => {
      map[Number(id)] = {
        name: item.name || '',
        from: (item.from || []).map(Number).filter((n) => n > 0),
        tags: item.tags || [],
        gold: Number(item.gold?.total) || 0,
        purchasable: item.inStore !== false && item.maps?.['11'] !== false,
      };
    });
    return map;
  });
}

export function useItemNameIndex() {
  const [index, setIndex] = useState({});
  useEffect(() => { getItemNameIndex().then(setIndex); }, []);
  return index;
}

export function useItemCatalog() {
  const [catalog, setCatalog] = useState({});
  useEffect(() => { getItemCatalog().then(setCatalog); }, []);
  return catalog;
}

export const PLATFORM_LABELS = {
  euw1: 'EUW', eun1: 'EUNE', na1: 'NA', br1: 'BR', la1: 'LAN', la2: 'LAS',
  kr: 'KR', jp1: 'JP', oc1: 'OCE', tr1: 'TR', ru: 'RU', me1: 'ME',
  sg2: 'SG', ph2: 'PH', tw2: 'TW', th2: 'TH', vn2: 'VN',
};
export function platformLabel(platform) {
  return PLATFORM_LABELS[platform] || String(platform || '').toUpperCase() || '—';
}

const SPELL_FALLBACK = {
  1: 'SummonerBoost',
  3: 'SummonerExhaust',
  4: 'SummonerFlash',
  6: 'SummonerHaste',
  7: 'SummonerHeal',
  11: 'SummonerSmite',
  12: 'SummonerTeleport',
  13: 'SummonerMana',
  14: 'SummonerDot',
  21: 'SummonerBarrier',
  32: 'SummonerSnowball',
  39: 'SummonerSnowURFSnowball_Mark',
};

let spellMapPromise = null;
export function getSpellMap() {
  if (!spellMapPromise) {
    spellMapPromise = getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/summoner.json`))
      .then((r) => r.json())
      .then((data) => {
        const byId = { ...SPELL_FALLBACK };
        Object.values(data.data || {}).forEach((s) => { byId[Number(s.key)] = s.id; });
        return byId;
      })
      .catch(() => ({ ...SPELL_FALLBACK }));
  }
  return spellMapPromise;
}

export function useSpellMap() {
  const [map, setMap] = useState(SPELL_FALLBACK);
  useEffect(() => { getSpellMap().then(setMap); }, []);
  return map;
}

export function spellIconUrl(spellId, version = cached, spellMap = SPELL_FALLBACK) {
  const id = spellMap[Number(spellId)] || SPELL_FALLBACK[Number(spellId)] || 'SummonerFlash';
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${id}.png`;
}

const SHARD_CDN = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/';
const SHARD_ICONS = {
  5001: { name: 'Health Scaling', file: 'statmodshealthplusicon.png' },
  5002: { name: 'Armor', file: 'statmodsarmoricon.png' },
  5003: { name: 'Magic Resist', file: 'statmodsmagicresicon.png' },
  5005: { name: 'Attack Speed', file: 'statmodsattackspeedicon.png' },
  5007: { name: 'Ability Haste', file: 'statmodscdrscalingicon.png' },
  5008: { name: 'Adaptive Force', file: 'statmodsadaptiveforceicon.png' },
  5010: { name: 'Move Speed', file: 'statmodsmovementspeedicon.png' },
  5011: { name: 'Health', file: 'statmodshealthscalingicon.png' },
  5012: { name: 'Resist Scaling', file: 'statmodsadaptiveforcescalingicon.png' },
  5013: { name: 'Tenacity', file: 'statmodstenacityicon.png' },
};

function withShards(byId = {}) {
  const next = { ...byId };
  Object.entries(SHARD_ICONS).forEach(([id, shard]) => {
    next[Number(id)] = { name: shard.name, shardFile: shard.file };
  });
  return next;
}

let runeTreesCache = [];
let runeIndexPromise = null;
export function getRuneIndex() {
  if (!runeIndexPromise) {
    runeIndexPromise = getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/runesReforged.json`))
      .then((r) => r.json())
      .then((trees) => {
        runeTreesCache = Array.isArray(trees) ? trees : [];
        const byId = {};
        runeTreesCache.forEach((tree) => {
          byId[tree.id] = { name: tree.name, icon: tree.icon };
          (tree.slots || []).forEach((slot) => {
            (slot.runes || []).forEach((rune) => {
              byId[rune.id] = { name: rune.name, icon: rune.icon };
            });
          });
        });
        return fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json')
          .then((r) => r.json())
          .then((perks) => {
            (perks || []).forEach((p) => {
              const path = String(p.iconPath || '')
                .toLowerCase()
                .replace(/^\/lol-game-data\/assets\/v1\//, '');
              if (!byId[p.id]) byId[p.id] = { name: p.name, cdragon: path };
              else if (!byId[p.id].icon && path) byId[p.id].cdragon = path;
            });
            return withShards(byId);
          })
          .catch(() => withShards(byId));
      })
      .catch(() => withShards());
  }
  return runeIndexPromise;
}

export function useRuneIndex() {
  const [index, setIndex] = useState(() => withShards());
  useEffect(() => { getRuneIndex().then(setIndex); }, []);
  return index;
}

export function useRuneTrees() {
  const [trees, setTrees] = useState(runeTreesCache);
  useEffect(() => {
    getRuneIndex().then(() => setTrees(runeTreesCache));
  }, []);
  return trees;
}

export function runeIconUrl(id, index = {}) {
  const n = Number(id);
  const icon = index[n]?.icon || index[id]?.icon;
  if (icon) return `https://ddragon.leagueoflegends.com/cdn/img/${icon}`;
  const shard = SHARD_ICONS[n];
  if (shard) return `${SHARD_CDN}${shard.file}`;
  const cdragon = index[n]?.cdragon || index[id]?.cdragon;
  if (cdragon) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cdragon}`;
  }
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/statmodsadaptiveforceicon.png`;
}
