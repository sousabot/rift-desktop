/**
 * Next skill to level — meta max order (Q/W/E) + R at 6 / 11 / 16.
 * Skill order follows the same lobby-picked build as item suggest.
 */

import { champDdragonId, champSpellImgUrl, getDdragonVersion, getItemCatalog } from '../services/ddragon';
import {
  analyseEnemyComp,
  pickBuildForComp,
  roleFromPosition,
} from './overlayItems';

const DEFAULT_ORDER = ['Q', 'W', 'E'];
const KIT_CACHE = new Map();
let champMetaPromise = null;

function loadChampMeta() {
  if (!champMetaPromise) {
    champMetaPromise = getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`))
      .then((r) => r.json())
      .catch(() => null);
  }
  return champMetaPromise;
}

export const PREVIEW_SKILL = {
  id: 'skill:preview',
  letter: 'Q',
  champion: 'Ahri',
  champLevel: 5,
  currentRank: 3,
  maxRank: 5,
  spellImage: 'AhriQ.png',
  spellName: 'Orb of Deception',
};

export function skillPointsAvailable(champLevel, abilities = {}) {
  const level = Math.max(1, Number(champLevel) || 1);
  const spent = ['Q', 'W', 'E', 'R']
    .reduce((sum, k) => sum + Math.max(0, Number(abilities[k]) || 0), 0);
  return Math.max(0, level - spent);
}

/** Ult ranks unlocked by champion level. */
export function ultCapForLevel(champLevel) {
  const level = Math.max(1, Number(champLevel) || 1);
  if (level >= 16) return 3;
  if (level >= 11) return 2;
  if (level >= 6) return 1;
  return 0;
}

/**
 * @param {object} opts
 * @param {number} opts.champLevel
 * @param {{ Q?: number, W?: number, E?: number, R?: number }} opts.abilities
 * @param {string[]} [opts.order] max priority e.g. ['Q','W','E']
 * @returns {null | { letter, currentRank, maxRank, champLevel }}
 */
export function nextSkillToLevel({
  champLevel,
  abilities = {},
  order = DEFAULT_ORDER,
} = {}) {
  const level = Math.max(1, Number(champLevel) || 1);
  const q = Math.max(0, Number(abilities.Q) || 0);
  const w = Math.max(0, Number(abilities.W) || 0);
  const e = Math.max(0, Number(abilities.E) || 0);
  const r = Math.max(0, Number(abilities.R) || 0);
  const ranks = { Q: q, W: w, E: e, R: r };

  if (skillPointsAvailable(level, ranks) <= 0) return null;

  const ultCap = ultCapForLevel(level);
  if (r < ultCap) {
    return { letter: 'R', currentRank: r, maxRank: 3, champLevel: level };
  }

  const prio = (order || DEFAULT_ORDER)
    .map((x) => String(x || '').toUpperCase())
    .filter((x) => x === 'Q' || x === 'W' || x === 'E');
  const seq = prio.length === 3 ? prio : DEFAULT_ORDER;

  for (const letter of seq) {
    if (ranks[letter] < 5) {
      return {
        letter,
        currentRank: ranks[letter],
        maxRank: 5,
        champLevel: level,
      };
    }
  }

  return null;
}

export async function loadChampSpellKit(champion) {
  const id = champDdragonId(champion);
  if (KIT_CACHE.has(id)) return KIT_CACHE.get(id);
  const pending = (async () => {
    try {
      const ver = await getDdragonVersion();
      const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion/${id}.json`);
      if (!res.ok) return { version: ver, spells: [] };
      const json = await res.json();
      const data = json?.data?.[id];
      return {
        version: ver,
        spells: data?.spells || [],
      };
    } catch {
      return { version: null, spells: [] };
    }
  })();
  KIT_CACHE.set(id, pending);
  return pending;
}

export function spellMetaForLetter(kit, letter) {
  const idx = { Q: 0, W: 1, E: 2, R: 3 }[letter];
  if (idx == null) return null;
  const spell = kit?.spells?.[idx];
  if (!spell) return null;
  return {
    name: spell.name || letter,
    image: spell.image?.full || '',
    iconUrl: spell.image?.full
      ? champSpellImgUrl(spell.image.full, kit.version)
      : '',
  };
}

/**
 * Resolve Q/W/E max order from the build that fits this lobby (same as items).
 */
export async function resolveSkillOrderForComp({
  champion,
  role,
  position,
  enemies = [],
  ownedIds = [],
  hasSmite = false,
} = {}) {
  if (!champion || !window.metaBuildsAPI?.get) return null;

  const [catalog, champMeta] = await Promise.all([
    getItemCatalog().catch(() => ({})),
    loadChampMeta(),
  ]);

  const lane = roleFromPosition(position || role, champion, champMeta, {
    hasSmite: !!hasSmite,
    ownedIds,
  });

  const meta = await window.metaBuildsAPI.get({ champion, role: lane }).catch(() => null);
  const builds = meta?.builds || [];
  if (!builds.length) return null;

  const owned = new Set((ownedIds || []).map(Number).filter((n) => n > 0));
  const analysis = analyseEnemyComp(enemies, champMeta);
  const build = pickBuildForComp(builds, analysis, owned, catalog) || builds[0];
  const order = build?.skills?.order;
  if (Array.isArray(order) && order.length >= 3) {
    return {
      order: order.map((x) => String(x).toUpperCase()),
      buildId: build.id,
      buildLabel: build.label || '',
      skillsId: build.skills?.id || order.join(''),
    };
  }

  const fallback = meta?.skillOptions?.[0]?.order || builds[0]?.skills?.order;
  if (!fallback?.length) return null;
  return {
    order: fallback.map((x) => String(x).toUpperCase()),
    buildId: builds[0]?.id,
    buildLabel: builds[0]?.label || '',
    skillsId: builds[0]?.skills?.id || fallback.join(''),
  };
}

/**
 * Build toast payload from live snap + meta skill order.
 */
export async function resolveSkillTip({
  champion,
  champLevel,
  abilities,
  skillOrder,
  buildLabel,
} = {}) {
  const next = nextSkillToLevel({
    champLevel,
    abilities,
    order: skillOrder,
  });
  if (!next || !champion) return null;

  const kit = await loadChampSpellKit(champion);
  const spell = spellMetaForLetter(kit, next.letter);

  return {
    id: `skill:L${next.champLevel}:${next.letter}:${next.currentRank}`,
    letter: next.letter,
    champion,
    champLevel: next.champLevel,
    currentRank: next.currentRank,
    maxRank: next.maxRank,
    spellName: spell?.name || next.letter,
    spellImage: spell?.image || '',
    iconUrl: spell?.iconUrl || '',
    buildLabel: buildLabel || '',
    skillOrder: skillOrder || null,
  };
}
