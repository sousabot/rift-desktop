import { champDdragonId, getDdragonVersion, getItemCatalog } from '../services/ddragon';

const ROLE_FROM_POS = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  MID: 'Mid',
  BOTTOM: 'ADC',
  ADC: 'ADC',
  UTILITY: 'Support',
  SUPPORT: 'Support',
};

/** Always-melee exceptions to Marksman/Mage tag heuristics. */
const FORCE_MELEE = new Set([
  'Yasuo', 'Yone', 'Tryndamere', 'Garen', 'Darius', 'Sett', 'Aatrox', 'Riven',
  'Fiora', 'Camille', 'Irelia', 'Jax', 'Renekton', 'KSante', 'Ambessa',
  'LeeSin', 'Vi', 'JarvanIV', 'XinZhao', 'Wukong', 'MonkeyKing', 'Hecarim',
  'Zac', 'Amumu', 'Sejuani', 'Rammus', 'Maokai', 'Ornn', 'Sion', 'ChoGath',
  'Malphite', 'DrMundo', 'Poppy', 'Nunu', 'Volibear', 'Udyr', 'Trundle',
  'Warwick', 'Briar', 'BelVeth', 'RekSai', 'KhaZix', 'Rengar', 'Talon',
  'Zed', 'Qiyana', 'Pyke', 'Ekko', 'Diana', 'Sylas', 'Pantheon', 'Viego',
  'Naafiri', 'Nocturne', 'Evelynn', 'Shaco', 'MasterYi', 'Yi', 'Olaf',
  'Gwen', 'Lillia', 'Mordekaiser', 'Illaoi', 'Urgot', 'Singed', 'TahmKench',
  'Blitzcrank', 'Leona', 'Nautilus', 'Alistar', 'Rell', 'Braum', 'Taric',
  'Galio', 'Rakan', 'Nilah',
]);

const FORCE_RANGED = new Set([
  'Kayle', 'Jayce', 'Nidalee', 'Elise', 'Gnar', 'Corki', 'Azir', 'Teemo',
  'Quinn', 'Kennen', 'Lulu', 'Karma', 'Zyra', 'Brand', 'Lux', 'Xerath',
  'Velkoz', 'VelKoz', 'Ziggs', 'Heimerdinger', 'Annie', 'Ahri', 'Orianna',
  'Syndra', 'Viktor', 'Anivia', 'Cassiopeia', 'Swain', 'Malzahar', 'Veigar',
]);

const HEAL_CHAMPS = new Set([
  'Soraka', 'Sona', 'Yuumi', 'Nami', 'Milio', 'Seraphine', 'Vladimir',
  'Aatrox', 'Warwick', 'Sylas', 'DrMundo', 'Mundo', 'Swain', 'Sett',
  'Briar', 'BelVeth', 'Nilah', 'Senna',
]);

const HARD_CC_CHAMPS = new Set([
  'Leona', 'Nautilus', 'Thresh', 'Blitzcrank', 'Amumu', 'Sejuani', 'Maokai',
  'Ornn', 'Sion', 'Malphite', 'Rell', 'Alistar', 'Poppy', 'Skarner',
  'Ashe', 'Varus', 'Morgana', 'Lulu', 'Janna', 'Braum', 'Rakan', 'Bard',
  'Neeko', 'Lissandra', 'Veigar', 'Anivia', 'Ivern', 'Nunu',
]);

const ASSASSIN_CHAMPS = new Set([
  'Zed', 'Talon', 'Qiyana', 'KhaZix', 'Rengar', 'Eve', 'Evelynn', 'Shaco',
  'Akali', 'Fizz', 'Katarina', 'LeBlanc', 'Pyke', 'Nocturne', 'Diana',
  'Ekko', 'Kayn', 'Naafiri', 'Pantheon', 'Sylas', 'Yone', 'Yasuo',
]);

/**
 * Situational counter items. Scored purely from enemy team shape + your class.
 * roles = your champion tags that can buy this (empty = any).
 */
const COUNTER_ITEMS = [
  // ADC / on-hit
  { id: 3036, tag: 'vsTanks', roles: ['Marksman', 'Fighter'], w: { vsTanks: 5, vsAd: 0.5 } }, // LDR
  { id: 3033, tag: 'vsHeal', roles: ['Marksman', 'Fighter', 'Assassin'], w: { vsHeal: 5, vsTanks: 1 } }, // Mortal
  { id: 3085, tag: 'vsMelee', roles: ['Marksman'], w: { vsMelee: 4.5, vsDive: 1.5 } }, // Hurricane
  { id: 3094, tag: 'vsRange', roles: ['Marksman'], w: { vsRange: 4.5, vsPoke: 1.5 } }, // RFC
  { id: 6672, tag: 'vsTanks', roles: ['Marksman', 'Fighter'], w: { vsTanks: 4, vsMelee: 1 } }, // Kraken
  { id: 3153, tag: 'vsTanks', roles: ['Marksman', 'Fighter'], w: { vsTanks: 3.5, vsHeal: 1 } }, // Botrk
  { id: 3072, tag: 'vsMelee', roles: ['Marksman', 'Fighter'], w: { vsDive: 2, vsAd: 1 } }, // BT
  { id: 3026, tag: 'vsAssassin', roles: ['Marksman', 'Mage', 'Assassin'], w: { vsAssassin: 5, vsDive: 2 } }, // GA
  { id: 3139, tag: 'vsCc', roles: ['Marksman', 'Fighter', 'Assassin'], w: { vsCc: 5, vsAssassin: 1 } }, // Mercurial
  { id: 3140, tag: 'vsCc', roles: ['Marksman', 'Fighter', 'Assassin', 'Mage'], w: { vsCc: 4 } }, // QSS
  { id: 6035, tag: 'vsCc', roles: ['Fighter', 'Assassin', 'Marksman'], w: { vsCc: 4.5, vsDive: 1 } }, // Silvermere

  // AP
  { id: 3165, tag: 'vsHeal', roles: ['Mage', 'Support', 'Assassin'], w: { vsHeal: 5 } }, // Morello
  { id: 4629, tag: 'vsHeal', roles: ['Mage', 'Support'], w: { vsHeal: 4.5 } },
  { id: 3135, tag: 'vsTanks', roles: ['Mage', 'Assassin'], w: { vsTanks: 4.5, vsAp: 0.5 } }, // Void Staff
  { id: 3102, tag: 'vsAp', roles: ['Mage', 'Support', 'Assassin'], w: { vsAp: 4, vsCc: 1.5 } }, // Banshee — not ADC
  { id: 3157, tag: 'vsAssassin', roles: ['Mage', 'Support'], w: { vsAssassin: 5, vsDive: 2, vsAd: 1 } }, // Zhonya
  { id: 3116, tag: 'vsMelee', roles: ['Mage'], w: { vsMelee: 3, vsDive: 2 } }, // Rylai

  // Fighters / tanks
  { id: 3071, tag: 'vsTanks', roles: ['Fighter', 'Assassin', 'Tank'], w: { vsTanks: 4, vsAd: 1 } }, // Cleaver
  { id: 3156, tag: 'vsAp', roles: ['Fighter', 'Assassin'], w: { vsAp: 5, vsMage: 1 } }, // Maw
  { id: 3155, tag: 'vsAp', roles: ['Fighter', 'Assassin'], w: { vsAp: 3.5 } }, // Hexdrinker
  { id: 3742, tag: 'vsMelee', roles: ['Tank', 'Fighter', 'Support'], w: { vsMelee: 3, vsDive: 1 } }, // Dead Man's
  { id: 3143, tag: 'vsAd', roles: ['Tank', 'Support', 'Fighter'], w: { vsAd: 4.5, vsMarksman: 2, vsCrit: 2 } }, // Randuin
  { id: 3110, tag: 'vsAd', roles: ['Tank', 'Support'], w: { vsAd: 4, vsMarksman: 2, vsAs: 2 } }, // FH
  { id: 3075, tag: 'vsAd', roles: ['Tank', 'Fighter', 'Support'], w: { vsAd: 3.5, vsHeal: 2, vsAs: 1.5 } }, // Thornmail
  { id: 3068, tag: 'vsMelee', roles: ['Tank', 'Fighter'], w: { vsMelee: 3, vsDive: 1.5 } }, // Sunfire
  { id: 4401, tag: 'vsAp', roles: ['Tank', 'Fighter', 'Support'], w: { vsAp: 5, vsMage: 2 } }, // FoN
  { id: 6665, tag: 'vsMixed', roles: ['Tank', 'Fighter'], w: { vsAp: 2, vsAd: 2, vsTanks: 1 } }, // Jak'Sho
];

let champMetaPromise = null;

function loadChampMeta() {
  if (!champMetaPromise) {
    champMetaPromise = getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`))
      .then((r) => r.json())
      .then((data) => {
        const map = {};
        Object.values(data.data || {}).forEach((ch) => {
          const tags = ch.tags || [];
          map[ch.id] = { tags, name: ch.name, key: ch.id };
          map[String(ch.name || '').replace(/[^a-zA-Z0-9]/g, '')] = map[ch.id];
        });
        return map;
      })
      .catch(() => ({}));
  }
  return champMetaPromise;
}

function metaOf(champion, champMeta) {
  const id = champDdragonId(champion);
  return champMeta[id] || champMeta[champion] || { tags: [], name: champion || '' };
}

function isRangedChamp(champion, meta) {
  const id = champDdragonId(champion);
  if (FORCE_MELEE.has(id) || FORCE_MELEE.has(champion)) return false;
  if (FORCE_RANGED.has(id) || FORCE_RANGED.has(champion)) return true;
  const tags = meta?.tags || [];
  if (tags.includes('Marksman')) return true;
  if (tags.includes('Mage') && !tags.includes('Fighter') && !tags.includes('Assassin')) return true;
  if (tags.includes('Support') && !tags.includes('Tank') && !tags.includes('Fighter')) return true;
  return false;
}

const ROLE_STARTERS = {
  Top: [1054],
  Jungle: [1101],
  Mid: [1056],
  ADC: [1055],
  Support: [3865],
};

const JUNGLE_PETS = new Set([1101, 1102, 1103]);

export function roleFromPosition(position, champion, champMeta, opts = {}) {
  // Smite / jungle pet beats missing Practice Tool lane (otherwise Marksman → Doran's Blade).
  if (opts.hasSmite || opts.isJungle) return 'Jungle';
  if ((opts.ownedIds || []).some((id) => JUNGLE_PETS.has(Number(id)))) return 'Jungle';

  const key = String(position || '').toUpperCase().replace(/\s+/g, '');
  if (ROLE_FROM_POS[key]) return ROLE_FROM_POS[key];
  // Customs / missing lane — infer from champion class (never treat Fighter as Mid).
  if (champion && champMeta) {
    const tags = metaOf(champion, champMeta).tags || [];
    if (tags.includes('Marksman')) return 'ADC';
    if (tags.includes('Support') && !tags.includes('Fighter') && !tags.includes('Tank')) return 'Support';
    if (tags.includes('Fighter') || tags.includes('Tank')) return 'Top';
    if (tags.includes('Mage')) return 'Mid';
    if (tags.includes('Assassin')) return 'Mid';
  }
  return 'Top';
}

function ownsJunglePet(owned) {
  for (const id of owned) {
    if (JUNGLE_PETS.has(id)) return true;
  }
  return false;
}

function starterFallback(role, tags) {
  const t = tags || [];
  if (role === 'Jungle') return [1101];
  if (role === 'ADC' || t.includes('Marksman')) return [1055];
  if (role === 'Support' || (t.includes('Support') && !t.includes('Fighter'))) return [3865];
  if (t.includes('Mage') && !t.includes('Fighter')) return [1056];
  if (role === 'Mid' && t.includes('Mage')) return [1056];
  if (t.includes('Fighter') || t.includes('Tank') || role === 'Top') return [1054];
  if (t.includes('Assassin')) return [1055];
  if (role === 'Mid') return [1056];
  return [...(ROLE_STARTERS[role] || [1054])];
}

/** Item ids that define DPM-style build tabs. */
const ARCH_ONHIT = new Set([3153, 3124, 3085, 3091]); // BotRK, Guinsoo, Hurricane, Wit's End
const ARCH_LETHALITY = new Set([
  6691, 6692, 6693, 6694, 6695, 6696, 6676, 3179, 3814, 3142,
]); // Hubris / Opportunity / Collector / Youmuu…
const ARCH_CRIT_HASTE = new Set([3508, 3095, 3031, 3094, 6671, 3033]); // ER, Stormrazor, IE…
const ARCH_AS = new Set([6672, 3046]); // Kraken, PD
const ARCH_BRUISER = new Set([3078, 6631, 3071, 6610, 6630, 3748]);
const ARCH_AP = new Set([6655, 6653, 6657, 3118, 4645, 3152, 4633, 4636]);

export function buildArchetype(coreIds = []) {
  const ids = (coreIds || []).map(Number);
  if (ids.some((id) => ARCH_ONHIT.has(id))) return 'onhit';
  if (ids.some((id) => ARCH_LETHALITY.has(id))) return 'lethality';
  if (ids.some((id) => ARCH_CRIT_HASTE.has(id))) return 'crit';
  if (ids.some((id) => ARCH_AP.has(id))) return 'ap';
  if (ids.some((id) => ARCH_BRUISER.has(id))) return 'bruiser';
  if (ids.some((id) => ARCH_AS.has(id))) return 'as';
  return 'standard';
}

/**
 * Score a build tab vs the enemy lobby (DPM-style: on-hit shred / lethality / …).
 */
function scoreBuildVsComp(build, analysis) {
  const n = analysis?.needs || {};
  const arch = buildArchetype(build?.core);
  const games = Math.max(0, Number(build?.games) || 0);
  const wr = Math.max(0, Number(build?.wr) || 0);
  let score = Math.log10(games + 10) * 0.35 + (wr - 50) * 0.04;

  if (arch === 'onhit') {
    score += (n.vsTanks || 0) * 2.4 + (n.vsHeal || 0) * 0.6 + (n.vsMelee || 0) * 0.35;
  } else if (arch === 'lethality') {
    score += 1.1 - (n.vsTanks || 0) * 2.0 + (n.vsMarksman || 0) * 0.45 + (n.vsMage || 0) * 0.35;
    score -= (n.vsDive || 0) * 0.15;
  } else if (arch === 'crit') {
    score += 0.55 + (n.vsMarksman || 0) * 0.2 - (n.vsTanks || 0) * 0.35;
  } else if (arch === 'as') {
    score += 0.45 + (n.vsTanks || 0) * 0.7 + (n.vsMelee || 0) * 0.25;
  } else if (arch === 'bruiser') {
    score += (n.vsDive || 0) * 0.5 + (n.vsAd || 0) * 0.35 + (n.vsTanks || 0) * 0.4;
  } else if (arch === 'ap') {
    score += (n.vsTanks || 0) * 0.3 + (n.vsMelee || 0) * 0.2;
  } else {
    score += 0.4;
  }

  return { score, arch };
}

/**
 * Pick which of the ~3 meta builds fits this lobby. Prefer a path you already invested in.
 */
export function pickBuildForComp(builds, analysis, owned = new Set(), catalog = {}) {
  const list = (builds || []).filter((b) => (b?.core || []).length);
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  // Already own a recipe piece of a core → stick with that tab.
  let bestOwned = null;
  let bestOwnedFrac = 0;
  for (const b of list) {
    for (const coreId of b.core || []) {
      const p = progressToward(Number(coreId), owned, catalog);
      if (p?.invested && p.frac >= bestOwnedFrac) {
        bestOwnedFrac = p.frac;
        bestOwned = b;
      }
    }
  }
  if (bestOwned) return bestOwned;

  let best = list[0];
  let bestScore = -Infinity;
  list.forEach((b, i) => {
    const { score } = scoreBuildVsComp(b, analysis);
    // Slight bias to most-played when scores are close.
    const adj = score - i * 0.08;
    if (adj > bestScore) {
      bestScore = adj;
      best = b;
    }
  });
  return best;
}

/**
 * Fountain starter from available options + enemy shape + chosen build archetype.
 * Examples: Long Sword into ER / lethality; Doran's Shield vs poke; Blade default.
 */
export function pickStarterForComp({
  starterOptions = [],
  starters = [],
  analysis,
  role,
  tags,
  archetype = 'standard',
} = {}) {
  const n = analysis?.needs || {};
  const enemiesKnown = (analysis?.total || 0) > 0;
  const poke = (n.vsPoke || 0) + (n.vsRange || 0) * 0.45 + (n.vsMage || 0) * 0.35;
  const dive = (n.vsDive || 0) + (n.vsAssassin || 0) * 0.9 + (n.vsMelee || 0) * 0.4;
  const tanks = n.vsTanks || 0;

  const fromOpts = (starterOptions || []).map((o) => Number(o.id || o)).filter((id) => id > 0);
  const fromBuild = (starters || []).map(Number).filter((id) => id > 0);
  const fallback = starterFallback(role, tags);
  const ids = [...new Set([...fromOpts, ...fromBuild, ...fallback])];

  if (role === 'Jungle') return ids.find((id) => JUNGLE_PETS.has(id)) || 1101;
  if (role === 'Support') return ids.find((id) => id >= 3850 && id <= 3870) || ids[0] || 3865;

  // Need a real lobby — Practice Tool / missing roster keeps the safe Doran's default.
  if (enemiesKnown) {
    // Heavy poke / ranged lane → Doran's Shield when available.
    if (ids.includes(1054) && poke >= 1.05 && poke >= dive + 0.15) return 1054;

    // AD haste / lethality snowball → Long Sword + pots (DPM-style) when lane isn't scary.
    if (
      ids.includes(1036)
      && (archetype === 'crit' || archetype === 'lethality')
      && poke < 1.05
      && dive < 1.35
    ) {
      return 1036;
    }

    // Free farm / passive lane → Cull.
    if (ids.includes(1083) && poke < 0.75 && dive < 0.85 && tanks < 0.9) return 1083;

    // Kill / melee pressure → Doran's Blade.
    if (ids.includes(1055) && (dive >= 0.9 || archetype === 'onhit' || archetype === 'as')) {
      return 1055;
    }
  }

  // AP openers.
  if (ids.includes(1056) && (archetype === 'ap' || (tags || []).includes('Mage'))) return 1056;

  if (ids.includes(1055)) return 1055;
  if (ids.includes(1054)) return 1054;
  if (ids.includes(1056)) return 1056;
  return ids[0] || fallback[0] || 1055;
}

/**
 * Analyse enemy team only — returns need weights the shopper should cover.
 */
export function analyseEnemyComp(enemies, champMeta) {
  const needs = {
    vsTanks: 0,
    vsHeal: 0,
    vsAp: 0,
    vsAd: 0,
    vsAssassin: 0,
    vsCc: 0,
    vsRange: 0,
    vsMelee: 0,
    vsDive: 0,
    vsPoke: 0,
    vsMarksman: 0,
    vsMage: 0,
    vsCrit: 0,
    vsAs: 0,
    vsMixed: 0,
  };

  const details = [];
  for (const e of enemies || []) {
    if (!e?.champion) continue;
    const meta = metaOf(e.champion, champMeta);
    const tags = meta.tags || [];
    const id = champDdragonId(e.champion);
    const ranged = isRangedChamp(e.champion, meta);
    const tank = tags.includes('Tank') || /Sion|Ornn|Maokai|ChoGath|DrMundo|KSante|Sett|Tahm/i.test(id);
    const mage = tags.includes('Mage');
    const marksman = tags.includes('Marksman');
    const fighter = tags.includes('Fighter');
    const assassin = tags.includes('Assassin') || ASSASSIN_CHAMPS.has(id);
    const support = tags.includes('Support');
    const heal = HEAL_CHAMPS.has(id) || /Soraka|Yuumi|Vladimir|Aatrox|Warwick|Sylas|Mundo|Briar/i.test(id);
    const cc = HARD_CC_CHAMPS.has(id) || tags.includes('Tank') && support;

    if (tank) needs.vsTanks += 1.35;
    if (heal) needs.vsHeal += 1.4;
    // Only real AP threats — don't mark Braum/Thresh/Pyke as "vs AP".
    if (mage) needs.vsAp += 1.25;
    else if (support && !marksman && !fighter && !assassin && !tank) needs.vsAp += 0.45;
    if (marksman || fighter || (assassin && !mage) || (tank && !mage)) {
      needs.vsAd += marksman ? 1.3 : (fighter || assassin ? 0.9 : 0.7);
    }
    if (assassin) {
      needs.vsAssassin += 1.4;
      needs.vsDive += 1.1;
    }
    if (cc) needs.vsCc += 1.15;
    if (ranged) {
      needs.vsRange += 1;
      if (marksman || mage) needs.vsPoke += 0.7;
    } else {
      needs.vsMelee += 1;
      if (fighter || assassin || tank) needs.vsDive += 0.8;
    }
    if (marksman) {
      needs.vsMarksman += 1.2;
      needs.vsCrit += 0.9;
      needs.vsAs += 0.7;
    }
    if (mage) needs.vsMage += 1.1;

    details.push({
      champion: e.champion,
      tags,
      ranged,
      tank,
      heal,
      assassin,
      cc,
    });
  }

  const n = Math.max(1, details.length);
  // Soft-normalize so 5-man comps don't explode scores.
  Object.keys(needs).forEach((k) => {
    needs[k] = Math.round((needs[k] / n) * 100) / 100;
  });
  if (needs.vsAp > 0.4 && needs.vsAd > 0.4) needs.vsMixed = Math.min(needs.vsAp, needs.vsAd) + 0.3;

  return { needs, details, total: details.length };
}

function youFitsItem(youTags, item) {
  const roles = item.roles || [];
  if (!roles.length) return true;
  if (!(youTags || []).length) return true;
  return roles.some((r) => youTags.includes(r));
}

function scoreItem(item, analysis, metaBoost = 0) {
  let score = metaBoost;
  const w = item.w || {};
  for (const [need, weight] of Object.entries(w)) {
    score += (analysis.needs[need] || 0) * weight;
  }
  return score;
}

function bestTag(item, analysis) {
  const w = item.w || {};
  let best = item.tag || 'situational';
  let bestV = -1;
  for (const [need, weight] of Object.entries(w)) {
    const v = (analysis.needs[need] || 0) * weight;
    if (v > bestV) {
      bestV = v;
      best = need;
    }
  }
  return best;
}

function buildPath(build) {
  const ids = [];
  if (build?.boots) ids.push(Number(build.boots));
  for (const id of build?.core || []) {
    const n = Number(id);
    if (n > 0 && !ids.includes(n)) ids.push(n);
    if (ids.length >= 4) break;
  }
  return ids.slice(0, 4);
}

const BOOT_IDS = new Set([
  1001, 3006, 3009, 3010, 3020, 3047, 3111, 3117, 3158, 2422, 3171, 3513,
]);
const BOOT_BASIC = 1001;

/** Plated Steelcaps / Mercury's Treads — pick from enemy damage + CC, not blind meta. */
const BOOT_STEELCAPS = 3047;
const BOOT_MERCS = 3111;
const BOOT_BERSERKERS = 3006;
const BOOT_SORCS = 3020;
const BOOT_LUCIDITY = 3158;
const BOOT_MOBI = 3117;
/** Inspiration — Magical Footwear (free boots ~12:00; cannot buy boots until then). */
const MAGICAL_FOOTWEAR = 8304;
const SLIGHTLY_MAGICAL_BOOTS = 2422;

/**
 * Override Lolalytics' most-picked boot when the enemy comp clearly calls for the other defensive boot.
 * Example: Ambessa vs Kennen / Lissandra / Nami → Mercs, not Steelcaps.
 * Katarina Mid vs full AD → Sorcs (or meta), never Mercs tagged "vs AP".
 */
function pickSituationalBoots(analysis, metaBoot, role, youTags) {
  const n = analysis?.needs || {};
  const ap = (n.vsAp || 0) + (n.vsMage || 0) * 0.45;
  const ad = (n.vsAd || 0) + (n.vsMarksman || 0) * 0.55 + (n.vsAs || 0) * 0.35 + (n.vsCrit || 0) * 0.25;
  const cc = n.vsCc || 0;
  const meta = Number(metaBoot) || 0;
  const tags = youTags || [];
  const enemiesKnown = (analysis?.total || 0) > 0;

  // Need a clear lobby read — empty Practice Tool / missing roster must not invent Mercs.
  const wantMercs = enemiesKnown && (ap >= 0.75 || (cc >= 0.85 && ap >= 0.35) || (ap + cc >= ad + 0.45 && ap >= 0.5));
  const wantTabi = enemiesKnown && ad >= 0.75 && ad > ap + 0.2;

  // ADC / marksmen: Berserker's are the spike. Mercs are almost never worth
  // losing AS — cleanse/MR comes from QSS → Mercurial instead. Tabi only when
  // the lobby is overwhelmingly physical (multiple AD threats).
  if (role === 'ADC' || tags.includes('Marksman')) {
    if (wantTabi && ad >= 1.35 && ad >= ap + 0.6) return BOOT_STEELCAPS;
    return BOOT_BERSERKERS;
  }

  if (role === 'Support' || (tags.includes('Support') && !tags.includes('Fighter'))) {
    if (wantMercs) return BOOT_MERCS;
    if (wantTabi) return BOOT_STEELCAPS;
    return meta && BOOT_IDS.has(meta) && meta !== BOOT_BASIC ? meta : BOOT_MOBI;
  }

  // Mid mage / AP assassin (Katarina, Ahri, Syndra…): damage boots first.
  // Full AD lobby ≠ Mercs; only leave Sorcs/Lucidity when AP/CC is the real threat.
  if ((role === 'Mid' || tags.includes('Mage')) && !tags.includes('Tank')) {
    if (wantMercs && ap + cc > ad + 0.25) return BOOT_MERCS;
    if (meta === BOOT_LUCIDITY || meta === BOOT_SORCS || meta === BOOT_MERCS || meta === BOOT_STEELCAPS) {
      return meta;
    }
    return BOOT_SORCS;
  }

  // Fighters / tanks — defensive boots from the lobby.
  if (wantMercs && !wantTabi) return BOOT_MERCS;
  if (wantTabi && !wantMercs) return BOOT_STEELCAPS;
  if (wantMercs && wantTabi) {
    return (ap + cc >= ad) ? BOOT_MERCS : BOOT_STEELCAPS;
  }

  if (meta && BOOT_IDS.has(meta) && meta !== BOOT_BASIC) return meta;
  if (tags.includes('Marksman')) return BOOT_BERSERKERS;
  if (tags.includes('Mage')) return BOOT_SORCS;
  return BOOT_STEELCAPS;
}

function bootsTag(bootId, suggestedId = bootId) {
  // Tier-1 Boots are just MS — don't label them "vs AP" / "vs AD" yet.
  if (Number(suggestedId) === BOOT_BASIC || Number(bootId) === BOOT_BASIC) return 'boots';
  if (bootId === BOOT_MERCS) return 'vsAp';
  if (bootId === BOOT_STEELCAPS) return 'vsAd';
  return 'boots';
}

/** True while Magical Footwear is locking shop boots (before free pair arrives). */
function magicalFootwearLocksShop(perkIds, owned, gameTimeSec, you = {}) {
  const perks = perkIds || [];
  if (!perks.includes(MAGICAL_FOOTWEAR)) return false;
  // Already have free / finished boots — shop lock is over.
  if (ownsBoots(owned) || owned.has(SLIGHTLY_MAGICAL_BOOTS)) return false;
  const takedowns = (Number(you.kills) || 0) + (Number(you.assists) || 0);
  const readyAt = Math.max(0, 12 * 60 - takedowns * 45);
  return (Number(gameTimeSec) || 0) < readyAt;
}

/** Consumables / trinkets — ignore when deciding if a starter is “done”. */
const IGNORE_OWNED = new Set([
  2003, 2004, 2010, 2031, 2055, 3340, 3363, 3364, 2140, 2138, 2139, 2420, 2421, 2423, 2424,
]);

function ownsBoots(owned) {
  for (const id of owned) {
    if (BOOT_IDS.has(id)) return true;
  }
  return false;
}

function meaningfulOwned(ownedIds) {
  return new Set(
    (ownedIds || [])
      .map(Number)
      .filter((n) => n > 0 && !IGNORE_OWNED.has(n)),
  );
}

/** Six real inventory slots filled (trinket/pots ignored) — stop suggesting. */
function isFullBuild(ownedIds) {
  return meaningfulOwned(ownedIds).size >= 6;
}

function itemGold(catalog, id) {
  return Number(catalog[id]?.gold) || 0;
}

function makeRow(id, tag, path, catalog, extra = {}) {
  return {
    id,
    name: catalog[id]?.name || `#${id}`,
    tag,
    path,
    score: extra.score ?? 1,
    reason: tag,
    ...extra,
  };
}

/**
 * Next purchasable piece toward a target item (component or full), given gold.
 * Returns null if the player already owns the target.
 */
function resolveToward(targetId, owned, catalog, gold, tag) {
  if (!targetId || owned.has(targetId)) return null;
  const info = catalog[targetId];
  if (!info) return null;
  const cost = itemGold(catalog, targetId);
  const from = (info.from || []).filter((id) => id > 0 && !BOOT_IDS.has(id));

  // Prefer unfinished components first (build in order).
  for (const cid of from) {
    if (owned.has(cid)) continue;
    const piece = resolveToward(cid, owned, catalog, gold, tag === 'core' ? 'next' : tag);
    if (piece) return piece;
  }

  // Components done (or basic item) — this is the next complete buy.
  return { id: targetId, tag, cost };
}

/** Gold gate: show only when buyable now or close enough to plan the purchase. */
function withinGoldReach(cost, gold, tag, minutes) {
  const g = Math.max(0, Number(gold) || 0);
  const c = Math.max(0, Number(cost) || 0);
  if (c <= 0) return true;
  if (g >= c) return true;
  // Starters at game open — always show until bought.
  if (tag === 'start' && minutes < 5) return true;
  // Close enough to back for it soon.
  if (g >= c - 350) return true;
  if (c > 0 && g / c >= 0.55) return true;
  // Cheap early components.
  if (c <= 450 && minutes < 8) return true;
  return false;
}

/**
 * Whether boots should come before the next core component.
 * Calm / ahead laning → spike with components first; threatened / behind / late → boots.
 */
function shouldPrioritizeBoots({ analysis, minutes, role, you, gold, bootsCost, coreCost }) {
  const n = analysis?.needs || {};
  const threat = (n.vsCc || 0)
    + (n.vsAssassin || 0)
    + (n.vsDive || 0)
    + Math.max(n.vsAp || 0, n.vsAd || 0) * 0.45;

  const deaths = Number(you?.deaths) || 0;
  const kills = Number(you?.kills) || 0;
  const cs = Number(you?.cs) || 0;
  const expectedCs = Math.max(1, minutes) * 7.2;
  const behind = deaths >= kills + 2 || (minutes >= 5 && cs < expectedCs * 0.72);
  const ahead = (kills >= deaths + 2 && deaths <= 1) || (minutes >= 5 && cs > expectedCs * 1.12);

  const g = Math.max(0, Number(gold) || 0);
  const bCost = Math.max(0, Number(bootsCost) || 0);
  const cCost = Math.max(0, Number(coreCost) || 0);
  const canFinishBoots = bCost > 0 && g >= bCost;
  const closerToCore = cCost > 0 && (g >= cCost || (g / cCost >= 0.7 && (!bCost || g < bCost)));

  // Eventually everyone needs boots.
  if (minutes >= 14) return true;
  if (minutes >= 11 && !ahead) return true;

  // Survival when the lobby or scoreline says so.
  if (behind) return true;
  if (threat >= 1.35) return true;
  if ((n.vsCc || 0) >= 0.9) return true;
  if ((n.vsAssassin || 0) >= 0.95 && minutes >= 6) return true;

  // Roles that lean on MS earlier.
  if ((role === 'Support' || role === 'Jungle') && minutes >= 6) return true;

  // Gold sitting on a boots upgrade while core piece is far — take boots.
  if (canFinishBoots && (!cCost || g < cCost * 0.55) && minutes >= 7) return true;

  // Ahead / quiet lane: invest in the item spike instead of rushing boots.
  if (ahead && minutes < 12) return false;
  if (closerToCore && minutes < 12 && threat < 1.15) return false;
  if (minutes < 8 && threat < 1.1) return false;
  if (minutes < 10 && threat < 0.95 && !behind) return false;

  return minutes >= 10;
}

/**
 * Gold still needed to complete target given current inventory (recipe-aware).
 */
function remainingCostToward(targetId, owned, catalog) {
  if (!targetId) return Infinity;
  if (owned.has(targetId)) return 0;
  const info = catalog[targetId];
  if (!info) return Infinity;
  const from = (info.from || []).filter((id) => id > 0);
  if (!from.length) return itemGold(catalog, targetId);
  let need = 0;
  for (const cid of from) need += remainingCostToward(cid, owned, catalog);
  const partsGold = from.reduce((sum, id) => sum + itemGold(catalog, id), 0);
  const combine = Math.max(0, itemGold(catalog, targetId) - partsGold);
  return need + combine;
}

/** Every component id in the recipe tree (not including the target). */
function recipePartIds(targetId, catalog) {
  const parts = new Set();
  const walk = (id) => {
    for (const cid of (catalog[id]?.from || [])) {
      const n = Number(cid);
      if (!n || parts.has(n)) continue;
      parts.add(n);
      walk(n);
    }
  };
  walk(targetId);
  return parts;
}

/**
 * Progress toward a finished item. `invested` = already bought a recipe piece
 * (DPM-style: finish that item before starting something else).
 */
function progressToward(targetId, owned, catalog) {
  if (!targetId || owned.has(targetId)) return null;
  const parts = recipePartIds(targetId, catalog);
  let ownedCount = 0;
  for (const id of parts) {
    if (owned.has(id)) ownedCount += 1;
  }
  // Free Magical Footwear pair upgrades into real boots.
  const magicalUpgrade = owned.has(SLIGHTLY_MAGICAL_BOOTS)
    && BOOT_IDS.has(targetId)
    && targetId !== BOOT_BASIC
    && targetId !== SLIGHTLY_MAGICAL_BOOTS;
  const invested = ownedCount > 0 || magicalUpgrade;
  if (!invested) {
    return {
      targetId,
      ownedCount: 0,
      partCount: parts.size,
      remaining: remainingCostToward(targetId, owned, catalog),
      frac: 0,
      invested: false,
    };
  }
  const partCount = Math.max(1, parts.size);
  return {
    targetId,
    ownedCount: magicalUpgrade ? Math.max(ownedCount, 1) : ownedCount,
    partCount,
    remaining: remainingCostToward(targetId, owned, catalog),
    frac: (magicalUpgrade ? Math.max(ownedCount, 1) : ownedCount) / partCount,
    invested: true,
  };
}

/** Among build targets, the one we've already started — finish it first. */
function pickInProgressTarget(targetIds, owned, catalog) {
  const rows = [];
  for (const raw of targetIds || []) {
    const id = Number(raw);
    if (!id || owned.has(id)) continue;
    const p = progressToward(id, owned, catalog);
    if (p?.invested) rows.push(p);
  }
  rows.sort((a, b) => (
    b.frac - a.frac
    || a.remaining - b.remaining
    || a.targetId - b.targetId
  ));
  return rows[0] || null;
}

function firstCoreTarget(build, owned) {
  for (const id of build?.core || []) {
    const n = Number(id);
    if (n > 0 && !owned.has(n)) return n;
  }
  return null;
}

function nextBuildBuy(build, owned, catalog, gold, minutes, role, tags, analysis, you = {}) {
  const bootsId = pickSituationalBoots(analysis, build?.boots, role, tags);
  const adjusted = { ...build, boots: bootsId };
  const path = buildPath(adjusted);
  const noItemsYet = owned.size === 0;
  const hasBoots = ownsBoots(owned);
  const gameTimeSec = Math.max(0, minutes * 60);
  const bootsLocked = magicalFootwearLocksShop(you.perkIds, owned, gameTimeSec, you);

  // 1) Fountain starter — jungle always starts with a pet companion.
  if (role === 'Jungle' && !ownsJunglePet(owned)) {
    const petId = Number(adjusted.pet)
      || Number((adjusted.starters || []).find((id) => JUNGLE_PETS.has(Number(id))))
      || 1101;
    return makeRow(petId, 'start', path, catalog, { score: 50, cost: itemGold(catalog, petId) });
  }

  const starters = (adjusted.starters || []).length
    ? adjusted.starters
    : starterFallback(role, tags);
  if (noItemsYet) {
    for (const id of starters) {
      const n = Number(id);
      if (!n || owned.has(n) || JUNGLE_PETS.has(n)) continue;
      return makeRow(n, 'start', path, catalog, { score: 50, cost: itemGold(catalog, n) });
    }
  }

  const coreIds = (adjusted.core || [])
    .map(Number)
    .filter((id) => id > 0 && !owned.has(id));

  // 2) Already building something (own a component) → finish it before boots / next core.
  //    Same idea as DPM: don't abandon a half-built item for a different buy.
  const finishCandidates = [...coreIds];
  if (!bootsLocked && bootsId && !owned.has(bootsId)) {
    if (!hasBoots || owned.has(SLIGHTLY_MAGICAL_BOOTS) || owned.has(BOOT_BASIC)) {
      finishCandidates.push(bootsId);
    }
  }
  const inProgress = pickInProgressTarget(finishCandidates, owned, catalog);
  if (inProgress) {
    const isBoot = BOOT_IDS.has(inProgress.targetId);
    const tag = isBoot ? bootsTag(inProgress.targetId) : 'finish';
    const toward = resolveToward(
      inProgress.targetId,
      owned,
      catalog,
      gold,
      isBoot ? tag : 'finish',
    );
    if (toward) {
      return makeRow(toward.id, toward.tag, path, catalog, {
        score: 48,
        cost: toward.cost,
        targetId: inProgress.targetId,
        targetName: catalog[inProgress.targetId]?.name || '',
      });
    }
  }

  const coreId = firstCoreTarget(adjusted, owned);
  // Magical Footwear: do not suggest buying boots while the rune locks them.
  let bootsToward = null;
  if (!bootsLocked && bootsId) {
    if (owned.has(SLIGHTLY_MAGICAL_BOOTS) && !owned.has(bootsId)) {
      // Free boots arrived — suggest upgrading to the finished boot.
      bootsToward = { id: bootsId, tag: bootsTag(bootsId, bootsId), cost: itemGold(catalog, bootsId) };
    } else if (!hasBoots) {
      bootsToward = resolveToward(bootsId, owned, catalog, gold, bootsTag(bootsId));
    }
  }
  const coreToward = coreId
    ? resolveToward(coreId, owned, catalog, gold, 'core')
    : null;

  // 3) Boots vs first core — depends on how laning / the game is going.
  if (bootsToward && coreToward) {
    const rushBoots = shouldPrioritizeBoots({
      analysis,
      minutes,
      role,
      you,
      gold,
      bootsCost: bootsToward.cost,
      coreCost: coreToward.cost,
    });
    if (rushBoots) {
      return makeRow(bootsToward.id, bootsTag(bootsId, bootsToward.id), path, catalog, {
        score: 40,
        cost: bootsToward.cost,
      });
    }
    return makeRow(coreToward.id, coreToward.tag, path, catalog, {
      score: 35,
      cost: coreToward.cost,
    });
  }

  if (bootsToward) {
    return makeRow(bootsToward.id, bootsTag(bootsId, bootsToward.id), path, catalog, {
      score: 40,
      cost: bootsToward.cost,
    });
  }

  if (coreToward) {
    return makeRow(coreToward.id, coreToward.tag, path, catalog, {
      score: 30,
      cost: coreToward.cost,
    });
  }

  // 4) Remaining core items in order
  for (const id of adjusted.core || []) {
    const n = Number(id);
    if (!n || owned.has(n)) continue;
    const toward = resolveToward(n, owned, catalog, gold, 'core');
    if (!toward) continue;
    return makeRow(toward.id, toward.tag, path, catalog, { score: 30, cost: toward.cost });
  }

  return null;
}

function pickSituational({
  build,
  owned,
  catalog,
  youTags,
  analysis,
  gold,
  minutes,
  path,
}) {
  // Don't interrupt a half-built core with a counter buy (finish first).
  const cores = (build?.core || []).map(Number).filter((id) => id > 0);
  const unfinished = cores.filter((id) => !owned.has(id));
  const midBuild = unfinished.some((id) => progressToward(id, owned, catalog)?.invested);
  if (midBuild) return null;

  const coresOwned = cores.filter((id) => owned.has(id)).length;
  if (coresOwned < 1 && minutes < 18) return null;
  if (!analysis?.total) return null;

  const metaExtra = new Map(
    (build?.extra || []).map((row) => [Number(row.id), { wr: Number(row.wr) || 0, games: Number(row.games) || 0 }]),
  );

  const ranked = [];
  for (const item of COUNTER_ITEMS) {
    if (owned.has(item.id) || path.includes(item.id)) continue;
    if (!youFitsItem(youTags, item)) continue;
    if (!catalog[item.id]) continue;
    const cost = itemGold(catalog, item.id);
    if (!withinGoldReach(cost, gold, 'situational', minutes)) continue;
    const boost = metaExtra.has(item.id)
      ? 0.85 + Math.min(1.2, (metaExtra.get(item.id).wr || 50) / 100)
      : 0;
    const score = scoreItem(item, analysis, boost);
    if (score < 1.15) continue;
    ranked.push({
      id: item.id,
      name: catalog[item.id]?.name || `#${item.id}`,
      tag: bestTag(item, analysis),
      path,
      score,
      reason: bestTag(item, analysis),
      cost,
      wr: metaExtra.get(item.id)?.wr || 0,
    });
  }
  ranked.sort((a, b) => b.score - a.score || b.wr - a.wr);
  return ranked[0] || null;
}

/**
 * Next item(s) to buy for this game state — starters first, finish any
 * in-progress recipe, then boots/core in order. Situational counters only
 * after the build is underway and gold is in range.
 * @returns {Promise<Array<{ id, name, tag, path, score, reason }>>}
 */
export async function buildItemSuggestions({
  champion,
  role,
  position,
  ownedIds = [],
  enemies = [],
  gold = 0,
  gameTime = 0,
  you = {},
} = {}) {
  if (isFullBuild(ownedIds)) return [];

  const [catalog, champMeta] = await Promise.all([
    getItemCatalog(),
    loadChampMeta(),
  ]);

  // Prefer live lane; Smite / jungle pet wins in Practice Tool (no position).
  const lane = roleFromPosition(position || role, champion, champMeta, {
    hasSmite: !!(you.hasSmite),
    ownedIds,
  });

  const meta = champion && window.metaBuildsAPI?.get
    ? await window.metaBuildsAPI.get({ champion, role: lane }).catch(() => null)
    : null;

  const catalogOwned = meaningfulOwned(ownedIds);
  const youTags = metaOf(champion, champMeta).tags || [];
  const analysis = analyseEnemyComp(enemies, champMeta);

  let build = pickBuildForComp(meta?.builds || [], analysis, catalogOwned, catalog)
    || (meta?.builds || [])[0];
  if (!build) {
    // Still suggest a fountain starter if meta fails.
    const starterId = pickStarterForComp({
      analysis,
      role: lane,
      tags: youTags,
    });
    if (!starterId || catalogOwned.has(starterId)) return [];
    return [makeRow(starterId, 'start', [starterId], catalog, { score: 50 })];
  }

  const arch = buildArchetype(build.core);
  const starterId = lane === 'Jungle'
    ? (Number(build.pet) || Number((build.starters || [])[0]) || 1101)
    : pickStarterForComp({
      starterOptions: build.starterOptions || meta?.starterOptions || [],
      starters: build.starters || [],
      analysis,
      role: lane,
      tags: youTags,
      archetype: arch,
    });

  // Apply lobby-picked starter onto the build for this game.
  build = {
    ...build,
    starters: starterId ? [starterId] : (build.starters || []),
  };

  // Ensure jungle builds always carry a pet starter even if meta omitted it.
  if (lane === 'Jungle') {
    const petId = Number(build.pet) || starterId || 1101;
    build.pet = petId;
    build.starters = [petId];
  }

  const owned = catalogOwned;
  const minutes = Math.max(0, (Number(gameTime) || 0) / 60);
  const path = buildPath(build);
  const youStats = {
    kills: you.kills ?? 0,
    deaths: you.deaths ?? 0,
    assists: you.assists ?? 0,
    cs: you.cs ?? 0,
    perkIds: you.perkIds || [],
  };

  const next = nextBuildBuy(build, owned, catalog, gold, minutes, lane, youTags, analysis, youStats);
  const out = [];
  if (next) out.push(next);

  const situ = pickSituational({
    build,
    owned,
    catalog,
    youTags,
    analysis,
    gold,
    minutes,
    path,
  });
  if (situ && situ.id !== next?.id) out.push(situ);

  return out;
}

export const PREVIEW_SUGGESTIONS = [
  {
    id: 1055,
    name: "Doran's Blade",
    tag: 'start',
    path: [1055, 3006, 6672],
    score: 50,
  },
  {
    id: 6672,
    name: 'Kraken Slayer',
    tag: 'core',
    path: [1055, 3006, 6672],
    score: 30,
  },
];