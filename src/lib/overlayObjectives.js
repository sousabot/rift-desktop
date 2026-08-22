/**
 * Neutral objective spawn alerts for the overlay HUD.
 * Live Client has no upcoming timers — derive from gameTime + kill events.
 */

/** Seconds before spawn to show the toast. */
export const WARN_BEFORE_SEC = 30;

/** Patch-tunable first spawns / respawns (Summoner's Rift). */
export const OBJECTIVE_TIMING = {
  dragon: { firstSec: 5 * 60, respawnSec: 5 * 60 },
  grubs: { firstSec: 8 * 60, respawnSec: 0 }, // one camp; no respawn (25.09+)
  herald: { firstSec: 15 * 60, respawnSec: 0 },
  baron: { firstSec: 20 * 60, respawnSec: 6 * 60 },
};

export const PREVIEW_OBJECTIVE = {
  id: 'grubs:first',
  key: 'grubs',
  labelKey: 'overlays.obj.voidGrubs',
  line1: 'VOID',
  line2: 'GRUBS',
  secondsLeft: 30,
  progress: 100,
  spawnAt: 8 * 60,
};

/**
 * @param {Array<{ id?: number, EventName?: string, name?: string, EventTime?: number, time?: number, DragonType?: string }>} events
 */
export function summarizeObjectiveKills(events = []) {
  let dragonKills = 0;
  let lastDragonAt = null;
  let baronKills = 0;
  let lastBaronAt = null;
  let grubKills = 0;
  let heraldKilled = false;
  let lastHeraldAt = null;

  for (const ev of events || []) {
    const name = String(ev.EventName || ev.name || '');
    const t = Number(ev.EventTime ?? ev.time) || 0;
    if (name === 'DragonKill' || /dragon/i.test(name)) {
      dragonKills += 1;
      lastDragonAt = t;
    } else if (name === 'BaronKill' || /^baron/i.test(name)) {
      baronKills += 1;
      lastBaronAt = t;
    } else if (name === 'HordeKill' || /void\s*grub|voidgrub/i.test(name)) {
      grubKills += 1;
    } else if (name === 'HeraldKill' || /herald/i.test(name)) {
      heraldKilled = true;
      lastHeraldAt = t;
    }
  }

  return {
    dragonKills,
    lastDragonAt,
    baronKills,
    lastBaronAt,
    grubKills,
    heraldKilled,
    lastHeraldAt,
  };
}

function pushAlert(list, {
  key,
  spawnAt,
  gameTime,
  labelKey,
  line1,
  line2,
  onceId,
}) {
  const left = spawnAt - gameTime;
  // Fire only as we cross ~30s before spawn (small poll slack), not for the whole window.
  if (left <= 0 || left > WARN_BEFORE_SEC) return;
  if (left < WARN_BEFORE_SEC - 3) return;
  list.push({
    id: onceId || `${key}:${Math.floor(spawnAt)}`,
    key,
    labelKey,
    line1,
    line2,
    secondsLeft: WARN_BEFORE_SEC,
    progress: 100,
    spawnAt,
  });
}

/**
 * Next objective toast(s) in the warn window. Prefer the soonest spawn.
 * @returns {null | { id, key, labelKey, line1, line2, secondsLeft, progress, spawnAt }}
 */
export function nextObjectiveAlert(gameTime, events = []) {
  const gt = Math.max(0, Number(gameTime) || 0);
  const kills = summarizeObjectiveKills(events);
  const alerts = [];

  // Dragon — first at 5:00, then +5:00 after each kill.
  {
    const { firstSec, respawnSec } = OBJECTIVE_TIMING.dragon;
    const spawnAt = kills.dragonKills > 0 && kills.lastDragonAt != null
      ? kills.lastDragonAt + respawnSec
      : firstSec;
    pushAlert(alerts, {
      key: 'dragon',
      spawnAt,
      gameTime: gt,
      labelKey: 'overlays.obj.dragon',
      line1: 'DRAGON',
      line2: '',
      onceId: `dragon:${Math.floor(spawnAt)}`,
    });
  }

  // Void Grubs — first only (no respawn).
  {
    const spawnAt = OBJECTIVE_TIMING.grubs.firstSec;
    if (kills.grubKills < 1) {
      pushAlert(alerts, {
        key: 'grubs',
        spawnAt,
        gameTime: gt,
        labelKey: 'overlays.obj.voidGrubs',
        line1: 'VOID',
        line2: 'GRUBS',
        onceId: 'grubs:first',
      });
    }
  }

  // Rift Herald — first only (despawns before Baron).
  {
    const spawnAt = OBJECTIVE_TIMING.herald.firstSec;
    if (!kills.heraldKilled && gt < 19 * 60 + 45) {
      pushAlert(alerts, {
        key: 'herald',
        spawnAt,
        gameTime: gt,
        labelKey: 'overlays.obj.herald',
        line1: 'RIFT',
        line2: 'HERALD',
        onceId: 'herald:first',
      });
    }
  }

  // Baron — first at 20:00, then +6:00 after each kill.
  {
    const { firstSec, respawnSec } = OBJECTIVE_TIMING.baron;
    const spawnAt = kills.baronKills > 0 && kills.lastBaronAt != null
      ? kills.lastBaronAt + respawnSec
      : firstSec;
    pushAlert(alerts, {
      key: 'baron',
      spawnAt,
      gameTime: gt,
      labelKey: 'overlays.obj.baron',
      line1: 'BARON',
      line2: '',
      onceId: `baron:${Math.floor(spawnAt)}`,
    });
  }

  if (!alerts.length) return null;
  alerts.sort((a, b) => a.secondsLeft - b.secondsLeft || a.spawnAt - b.spawnAt);
  return alerts[0];
}
