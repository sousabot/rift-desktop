export function gameMinutes(game) {
  if (Number(game?.gameDuration) > 0) return game.gameDuration / 60;
  return Number(game?.durationMin) || 0;
}

export function gameKda(game) {
  return (Number(game?.kills) + Number(game?.assists)) / Math.max(1, Number(game?.deaths));
}

export function gameCsm(game) {
  return Number(game?.cs) / Math.max(1, gameMinutes(game));
}

export function filterByRole(games, role) {
  if (!role) return games;
  return games.filter((g) => g.role === role);
}

export function sampleSummary(games) {
  const n = games.length;
  const wins = games.filter((g) => g.win).length;
  return {
    games: n,
    wins,
    losses: n - wins,
    wr: n ? (wins / n) * 100 : null,
  };
}

export function champRows(games, valueOf) {
  const map = {};
  for (const game of games) {
    const champion = game.champion;
    if (!champion) continue;
    if (!map[champion]) {
      map[champion] = {
        champion,
        games: 0,
        wins: 0,
        sum: 0,
        n: 0,
        blueSum: 0,
        blueN: 0,
        redSum: 0,
        redN: 0,
      };
    }
    const row = map[champion];
    row.games += 1;
    if (game.win) row.wins += 1;
    const value = valueOf(game);
    if (value == null || !Number.isFinite(value)) continue;
    row.sum += value;
    row.n += 1;
    if (game.teamId === 100) {
      row.blueSum += value;
      row.blueN += 1;
    } else if (game.teamId === 200) {
      row.redSum += value;
      row.redN += 1;
    }
  }
  return Object.values(map)
    .map((row) => ({
      champion: row.champion,
      games: row.games,
      wr: row.games ? (row.wins / row.games) * 100 : null,
      value: row.n ? row.sum / row.n : null,
      blue: row.blueN ? row.blueSum / row.blueN : null,
      red: row.redN ? row.redSum / row.redN : null,
    }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
}

export function durationBuckets(games) {
  const bins = [
    { id: '15', label: '15–20', min: 15, max: 20, games: 0, wins: 0 },
    { id: '20', label: '20–25', min: 20, max: 25, games: 0, wins: 0 },
    { id: '25', label: '25–30', min: 25, max: 30, games: 0, wins: 0 },
    { id: '30', label: '30–35', min: 30, max: 35, games: 0, wins: 0 },
    { id: '35', label: '35–40', min: 35, max: 40, games: 0, wins: 0 },
    { id: '40', label: '40+', min: 40, max: Infinity, games: 0, wins: 0 },
  ];
  for (const game of games) {
    const mins = gameMinutes(game);
    const bin = bins.find((b) => mins >= b.min && mins < b.max);
    if (!bin) continue;
    bin.games += 1;
    if (game.win) bin.wins += 1;
  }
  return bins;
}

export function durationSlice(games, kind) {
  return games.filter((game) => {
    const mins = gameMinutes(game);
    if (kind === 'early') return mins > 0 && mins < 22;
    if (kind === 'late') return mins > 35;
    return false;
  });
}

export function surrenderSlice(games, win) {
  return games.filter((game) => game.surrender && game.win === win);
}

export function hourBuckets(games) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, games: 0, wins: 0 }));
  for (const game of games) {
    if (!game.endedAt) continue;
    const hour = new Date(game.endedAt).getHours();
    hours[hour].games += 1;
    if (game.win) hours[hour].wins += 1;
  }
  return hours;
}

export function banRows(games) {
  const map = {};
  for (const game of games) {
    const bans = [...(game.allyBans || []), ...(game.enemyBans || [])];
    for (const ban of bans) {
      const champion = ban?.champion;
      if (!champion) continue;
      map[champion] = (map[champion] || 0) + 1;
    }
  }
  return Object.entries(map)
    .map(([champion, bans]) => ({ champion, bans }))
    .sort((a, b) => b.bans - a.bans);
}

export function avg(games, valueOf) {
  const vals = games.map(valueOf).filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function sum(games, valueOf) {
  return games.reduce((total, game) => total + (Number(valueOf(game)) || 0), 0);
}

export function fmtSigned(value, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = digits ? value.toFixed(digits) : String(Math.round(value));
  return value > 0 ? `+${n}` : n;
}

export function fmtNum(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  return Number(value).toFixed(digits);
}

export function fmtPct(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(0)}%`;
}
