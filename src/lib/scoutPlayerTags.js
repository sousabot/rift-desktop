/**
 * Porofessor-style player tags from ranked history + live game data.
 * @returns {{ id: string, tone: 'good'|'bad'|'neutral', count?: number, champ?: string }[]}
 */
export function buildScoutPlayerTags(player) {
  if (!player) return [];

  const tags = [];
  const streak = Number(player.streak) || 0;
  const last3 = player.last3 || [];
  const champGames = Number(player.champGames) || 0;
  const champWr = player.champWr;
  const recentGames = Number(player.recentGames) || last3.length || 0;
  const wins = Number(player.wins) || 0;
  const losses = Number(player.losses) || 0;
  const totalRanked = wins + losses;
  const overallWr = totalRanked ? (wins / totalRanked) * 100 : null;
  const champ = player.championName || player.champion || 'Champion';
  const gameRole = player.role;
  const mainRole = player.recentMainRole;

  if (player.dodge) tags.push({ id: 'dodger', tone: 'bad' });
  else if (streak >= 3) tags.push({ id: 'winStreak', tone: 'good', count: streak });
  else if (streak <= -3) tags.push({ id: 'lossStreak', tone: 'bad', count: Math.abs(streak) });

  if (last3.length >= 3 && last3.every(Boolean)) tags.push({ id: 'hotForm', tone: 'good' });
  else if (last3.length >= 3 && last3.every((w) => !w)) tags.push({ id: 'coldForm', tone: 'bad' });

  if (recentGames >= 5 && champGames >= 7) {
    tags.push({ id: 'otp', tone: 'good', champ });
  } else if (recentGames >= 4 && champGames >= 5) {
    tags.push({ id: 'mainChamp', tone: 'good', champ });
  } else if (recentGames >= 3 && champGames <= 1) {
    tags.push({ id: 'champNewbie', tone: 'bad', champ });
  }

  if (champGames >= 4 && champWr != null) {
    if (champWr >= 58) tags.push({ id: 'strongChamp', tone: 'good' });
    else if (champWr <= 42) tags.push({ id: 'weakChamp', tone: 'bad' });
  }

  if (totalRanked >= 40 && overallWr != null) {
    if (overallWr >= 54) tags.push({ id: 'highWr', tone: 'good' });
    else if (overallWr <= 46) tags.push({ id: 'lowWr', tone: 'bad' });
  }

  if (
    gameRole
    && mainRole
    && gameRole !== mainRole
    && recentGames >= 5
  ) {
    tags.push({ id: 'autofill', tone: 'neutral', role: mainRole });
  }

  if (player.rankUnknown || !player.rank || player.rank === 'Unranked') {
    tags.push({ id: 'unranked', tone: 'neutral' });
  }

  const seen = new Set();
  const out = [];
  for (const tag of tags) {
    if (seen.has(tag.id)) continue;
    seen.add(tag.id);
    out.push(tag);
    if (out.length >= 4) break;
  }
  return out;
}

export function scoutTagLabel(tag, t) {
  const key = `overlays.scoutTags.${tag.id}`;
  const translated = t(key, {
    count: tag.count,
    champ: tag.champ,
    role: tag.role,
  });
  return translated === key ? tag.id : translated;
}
