/**
 * Trinket swap reminder — Support / Jungle: Stealth Ward → Oracle Lens.
 */

export const TRINKET_WARD = 3340; // Warding Totem / Stealth Ward
export const TRINKET_ORACLE = 3364; // Oracle Lens
export const TRINKET_FARSIGHT = 3363; // Farsight Alteration

/** Starter support quest items. */
const SUPPORT_STARTERS = new Set([
  3865, // World Atlas
  3850, 3854, 3858,
]);

/** Finished / upgraded support items. */
const SUPPORT_UPGRADED = new Set([
  3866, 3867,
  3869, 3870, 3871, 3876, 3877,
  3851, 3853, 3855, 3857, 3859, 3860, 3862, 3863, 3864,
]);

const JUNGLE_PETS = new Set([1101, 1102, 1103]);

export const PREVIEW_TRINKET = {
  id: 'trinket-swap',
  fromId: TRINKET_WARD,
  toId: TRINKET_ORACLE,
  role: 'Support',
};

/**
 * @returns {null | { id, fromId, toId, role }}
 */
export function shouldRemindTrinketSwap({
  role,
  ownedIds = [],
  gameTime = 0,
  hasSmite = false,
} = {}) {
  const laneRaw = String(role || '');
  const lane = laneRaw.toUpperCase().replace(/\s+/g, '');
  const owned = new Set((ownedIds || []).map(Number).filter((n) => n > 0));
  const hasSupportItem = [...owned].some((id) => SUPPORT_STARTERS.has(id) || SUPPORT_UPGRADED.has(id));
  const hasPet = [...owned].some((id) => JUNGLE_PETS.has(id));
  const isJungle = laneRaw === 'Jungle' || lane === 'JUNGLE' || !!hasSmite || hasPet;
  const isSupport = laneRaw === 'Support' || lane === 'UTILITY' || lane === 'SUPPORT'
    || (hasSupportItem && !isJungle);
  if (!isJungle && !isSupport) return null;

  // Already on sweeper / blue — nothing to remind.
  if (owned.has(TRINKET_ORACLE) || owned.has(TRINKET_FARSIGHT)) return null;

  const minutes = Math.max(0, (Number(gameTime) || 0) / 60);
  let ready = false;

  if (isJungle) {
    // First recall after full clear + scuttle (~3–4 min).
    ready = minutes >= 3;
  } else {
    const questDone = [...owned].some((id) => SUPPORT_UPGRADED.has(id));
    ready = questDone || minutes >= 6.5;
  }

  if (!ready) return null;

  return {
    id: `trinket:${isJungle ? 'jungle' : 'support'}`,
    fromId: TRINKET_WARD,
    toId: TRINKET_ORACLE,
    role: isJungle ? 'Jungle' : 'Support',
  };
}
