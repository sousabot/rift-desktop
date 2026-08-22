// Riot match-v5 has no LP delta. We only record a number when we can
// actually see it: same-rank LP change after exactly one new ranked game,
// or the League client's last-game notification.

function mapKey(riotId, mode) {
  return `rift-lp-games:${String(riotId || '').toLowerCase()}:${mode}`;
}

function snapKey(riotId, mode) {
  return `rift-lp-snap:${String(riotId || '').toLowerCase()}:${mode}`;
}

// Ranked games move tens of LP, not thousands. U.GG sends a sentinel
// (e.g. -9992) on old matches where they have no delta — same junk on
// wins and losses. Snapshot logic already uses ±50.
const MAX_LP_DELTA = 80;

export function isPlausibleLpDelta(value) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 && Math.abs(n) <= MAX_LP_DELTA;
}

export function readLpMap(riotId, mode) {
  try {
    const raw = JSON.parse(localStorage.getItem(mapKey(riotId, mode)) || '{}');
    if (!raw || typeof raw !== 'object') return {};
    const clean = {};
    for (const [id, value] of Object.entries(raw)) {
      if (isPlausibleLpDelta(value)) clean[id] = Math.round(Number(value));
    }
    return clean;
  } catch {
    return {};
  }
}

export function rememberLpDelta(riotId, mode, matchId, lpDelta) {
  if (!riotId || !mode || !matchId) return;
  if (!isPlausibleLpDelta(lpDelta)) return;
  const map = readLpMap(riotId, mode);
  map[matchId] = Math.round(Number(lpDelta));
  try {
    localStorage.setItem(mapKey(riotId, mode), JSON.stringify(map));
  } catch { /* quota */ }
}

export function formatLpDelta(value, estimated = false) {
  if (!isPlausibleLpDelta(value)) return null;
  const rounded = Math.round(Number(value));
  const signed = rounded > 0 ? `+${rounded}` : String(rounded);
  return `${estimated ? '~' : ''}${signed} LP`;
}

function deltaFitsGame(game, delta) {
  if (!isPlausibleLpDelta(delta)) return false;
  if (game?.win === true && delta < 0) return false;
  if (game?.win === false && delta > 0) return false;
  return true;
}

export function matchNumericId(matchId) {
  const s = String(matchId || '');
  const m = s.match(/_(\d+)$/);
  if (m) return m[1];
  return /^\d+$/.test(s) ? s : '';
}

export function applyTrackedLp(games, lpByNumericId, riotId, mode) {
  const map = lpByNumericId && typeof lpByNumericId === 'object' ? lpByNumericId : {};
  if (!Object.keys(map).length) return games;
  return games.map((g) => {
    const id = matchNumericId(g.matchId);
    const n = Number(id ? map[id] : null);
    if (!deltaFitsGame(g, n)) return g;
    rememberLpDelta(riotId, mode, g.matchId, n);
    return { ...g, lpDelta: Math.round(n), lpDeltaEst: null };
  });
}

export function applyLpNotes(games, notes, riotId, mode, queueId) {
  const list = Array.isArray(games) ? games : [];
  const ranked = queueId == null ? list : list.filter((g) => g.queueId === queueId);
  const used = new Set();
  const next = {};
  for (const note of notes || []) {
    const delta = Math.round(Number(note?.lpDelta));
    if (!isPlausibleLpDelta(delta)) continue;
    const gid = note.gameId != null ? String(note.gameId) : '';
    if (!gid) continue;
    const target = ranked.find((g) => matchNumericId(g.matchId) === gid && !used.has(g.matchId));
    if (!target?.matchId || !deltaFitsGame(target, delta)) continue;
    used.add(target.matchId);
    next[target.matchId] = delta;
    rememberLpDelta(riotId, mode, target.matchId, delta);
  }
  if (!Object.keys(next).length) return list;
  return list.map((g) => (
    next[g.matchId] != null ? { ...g, lpDelta: next[g.matchId], lpDeltaEst: null } : g
  ));
}

export function syncMatchLp({ riotId, mode, lp, tier, division, games, queueId } = {}) {
  const list = Array.isArray(games) ? games : [];
  if (!riotId || !mode) {
    return list.map((g) => ({ ...g, lpDelta: g.lpDelta ?? null }));
  }

  const ranked = list.filter((g) => queueId == null || g.queueId === queueId);
  const newest = ranked[0];
  const lpNow = Number(lp);

  try {
    const prev = JSON.parse(localStorage.getItem(snapKey(riotId, mode)) || 'null');
    if (
      prev
      && newest?.matchId
      && prev.newestMatchId
      && prev.newestMatchId !== newest.matchId
      && Number.isFinite(lpNow)
      && Number.isFinite(Number(prev.lp))
    ) {
      let newCount = 0;
      for (const g of ranked) {
        if (g.matchId === prev.newestMatchId) break;
        newCount += 1;
      }
      const sameLine = String(prev.tier || '') === String(tier || '')
        && String(prev.division || '') === String(division || '');
      const delta = lpNow - Number(prev.lp);
      if (
        newCount === 1
        && sameLine
        && delta !== 0
        && delta >= -50
        && delta <= 50
        && deltaFitsGame(newest, delta)
      ) {
        rememberLpDelta(riotId, mode, newest.matchId, delta);
      }
    }
  } catch { /* ignore */ }

  if (newest?.matchId && Number.isFinite(lpNow)) {
    try {
      localStorage.setItem(snapKey(riotId, mode), JSON.stringify({
        newestMatchId: newest.matchId,
        lp: lpNow,
        tier: tier || null,
        division: division || null,
        at: Date.now(),
      }));
    } catch { /* quota */ }
  }

  const map = readLpMap(riotId, mode);
  return list.map((g) => ({
    ...g,
    lpDelta: map[g.matchId] != null ? map[g.matchId] : (g.lpDelta ?? null),
  }));
}
