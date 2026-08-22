/** Lane ordering helpers shared by Live Status and in-game scout. */

export const SCOUT_LANES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

function hasSpell(player, id) {
  return player.spell1Id === id || player.spell2Id === id;
}

function hasSupportItem(player) {
  return (player.items || []).some((id) => id >= 3850 && id <= 3877);
}

export function scoutPlayerKey(player, index = 0) {
  return player.puuid || `${player.champion || 'na'}-${player.riotId || index}`;
}

export function orderScoutByLane(players = [], typicalLane) {
  const pool = [...players];
  const taken = new Set();
  const byLane = {};

  const claim = (lane, pred) => {
    if (byLane[lane]) return;
    const i = pool.findIndex((p, idx) => !taken.has(scoutPlayerKey(p, idx)) && pred(p));
    if (i < 0) return;
    byLane[lane] = pool[i];
    taken.add(scoutPlayerKey(pool[i], i));
  };

  claim('Jungle', (p) => p.role === 'Jungle' || hasSpell(p, 11));
  claim('Support', (p) => p.role === 'Support' || hasSupportItem(p));
  for (const lane of SCOUT_LANES) claim(lane, (p) => p.role === lane);
  claim('Support', (p) => hasSpell(p, 3));
  claim('ADC', (p) => hasSpell(p, 7) || hasSpell(p, 21));
  const withCs = pool.filter((p, idx) => !taken.has(scoutPlayerKey(p, idx)) && Number.isFinite(p.cs));
  const maxCs = withCs.reduce((n, p) => Math.max(n, p.cs), 0);
  if (!byLane.Support && maxCs >= 80) {
    const lowest = [...withCs].sort((a, b) => a.cs - b.cs)[0];
    if (lowest && lowest.cs <= maxCs * 0.45) claim('Support', (p) => p === lowest);
  }
  claim('Top', (p) => hasSpell(p, 12) && typicalLane?.(p.champion) !== 'Mid');
  claim('Mid', (p) => hasSpell(p, 12));
  claim('Top', (p) => hasSpell(p, 12));
  for (const lane of SCOUT_LANES) {
    claim(lane, (p) => typicalLane?.(p.champion) === lane);
  }
  for (const lane of SCOUT_LANES) claim(lane, () => true);

  return SCOUT_LANES.map((lane) => (
    byLane[lane] ? { ...byLane[lane], lane, role: lane } : null
  ));
}

export function overallWinLine(player) {
  if (player.wins == null && player.losses == null) return '';
  const w = player.wins || 0;
  const l = player.losses || 0;
  const games = w + l;
  if (!games) return '';
  return `${((w / games) * 100).toFixed(0)}% · ${w}W ${l}L`;
}

export function champSplashUrl(champion) {
  const id = String(champion || 'Aatrox').replace(/[^a-zA-Z0-9]/g, '').replace(/^./, (c) => c.toUpperCase());
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;
}
