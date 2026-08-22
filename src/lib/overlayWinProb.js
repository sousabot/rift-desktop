/**
 * Live win probability from team gold, kills, and objectives.
 * ORDER = blue side, CHAOS = red side (Summoner's Rift).
 */

export const PREVIEW_WIN_PROB = { blue: 80, red: 20 };

const EMPTY_TEAM = () => ({
  gold: 0,
  kills: 0,
  deaths: 0,
  dragons: 0,
  barons: 0,
  heralds: 0,
  towers: 0,
});

/** @param {{ ORDER?: object, CHAOS?: object }} teams */
export function computeWinProbability(teams, gameTimeSec = 0) {
  const order = { ...EMPTY_TEAM(), ...(teams?.ORDER || teams?.order || {}) };
  const chaos = { ...EMPTY_TEAM(), ...(teams?.CHAOS || teams?.chaos || {}) };

  const power = (t) => (
    Math.max(0, Number(t.gold) || 0) * 1
    + Math.max(0, Number(t.kills) || 0) * 420
    + Math.max(0, Number(t.dragons) || 0) * 850
    + Math.max(0, Number(t.barons) || 0) * 2600
    + Math.max(0, Number(t.heralds) || 0) * 650
    + Math.max(0, Number(t.towers) || 0) * 480
    - Math.max(0, Number(t.deaths) || 0) * 90
  );

  const o = Math.max(1, power(order));
  const c = Math.max(1, power(chaos));
  let blue = Math.round((o / (o + c)) * 100);

  // Early game: stay closer to 50/50 until the map has developed.
  const minutes = Math.max(0, Number(gameTimeSec) || 0) / 60;
  const certainty = Math.min(1, Math.max(0, (minutes - 2.5) / 14));
  blue = Math.round(50 + (blue - 50) * (0.3 + 0.7 * certainty));
  blue = Math.max(6, Math.min(94, blue));

  return { blue, red: 100 - blue };
}
