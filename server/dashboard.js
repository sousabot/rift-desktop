/** Public summoner dashboard — match stats without desktop Bearer / LCU. */

const DASHBOARD_TTL_MS = 2 * 60 * 1000;
const LIVE_TTL_MS = 20 * 1000;
const CAREER_TTL_MS = 6 * 60 * 60 * 1000;
const CAREER_MAX_GAMES = 300;
const CAREER_PAGE = 100;
const MATCH_CONCURRENCY = 4;
const CAREER_CONCURRENCY = 2;
const TIMELINE_CONCURRENCY = 2;

const MODE_QUEUE = { All: null, Solo: 420, Flex: 440, Aram: 450, Normal: 400 };

const QUEUE_NAMES = {
  400: 'Normal',
  420: 'Solo/Duo',
  440: 'Flex',
  450: 'ARAM',
  700: 'Clash',
  900: 'URF',
  1020: 'One for All',
  1300: 'Nexus Blitz',
  1400: 'Ultimate Spellbook',
  1700: 'Arena',
  1900: 'Pick URF',
};

const PLATFORM_LABEL = {
  euw1: 'EUW', eun1: 'EUNE', na1: 'NA', br1: 'BR', la1: 'LAN', la2: 'LAS',
  kr: 'KR', jp1: 'JP', oc1: 'OCE', tr1: 'TR', ru: 'RU', me1: 'ME',
  ph2: 'PH', sg2: 'SG', th2: 'TH', tw2: 'TW', vn2: 'VN',
};

const TIER_BASE = {
  IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
  EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 2800, CHALLENGER: 2800,
};
const DIV_LP = { IV: 0, III: 100, II: 200, I: 300 };

const ROLE_KEYS = {
  TOP: 'TOP', JUNGLE: 'JUNGLE', JNG: 'JUNGLE', MIDDLE: 'MIDDLE', MID: 'MIDDLE',
  BOTTOM: 'BOTTOM', BOT: 'BOTTOM', ADC: 'BOTTOM', UTILITY: 'UTILITY', SUPPORT: 'UTILITY', SUP: 'UTILITY',
};
const WEIGHTS = {
  TOP: { kda: 0.26, kp: 0.16, dmg: 0.22, csm: 0.20, vis: 0.08, win: 0.08 },
  JUNGLE: { kda: 0.24, kp: 0.22, dmg: 0.16, csm: 0.14, vis: 0.16, win: 0.08 },
  MIDDLE: { kda: 0.26, kp: 0.18, dmg: 0.24, csm: 0.16, vis: 0.08, win: 0.08 },
  BOTTOM: { kda: 0.26, kp: 0.18, dmg: 0.26, csm: 0.16, vis: 0.06, win: 0.08 },
  UTILITY: { kda: 0.22, kp: 0.28, dmg: 0.08, csm: 0.04, vis: 0.30, win: 0.08 },
  ARAM: { kda: 0.32, kp: 0.28, dmg: 0.32, csm: 0.00, vis: 0.00, win: 0.08 },
  DEFAULT: { kda: 0.26, kp: 0.20, dmg: 0.20, csm: 0.14, vis: 0.12, win: 0.08 },
};
const BENCH = {
  TOP: { kda: [2.4, 5.0], kp: [0.42, 0.70], dmg: [0.20, 0.32], csm: [7.0, 9.5], vis: [0.7, 1.4] },
  JUNGLE: { kda: [2.8, 5.5], kp: [0.52, 0.78], dmg: [0.18, 0.30], csm: [5.2, 8.0], vis: [1.1, 2.0] },
  MIDDLE: { kda: [2.8, 5.5], kp: [0.48, 0.75], dmg: [0.24, 0.36], csm: [7.4, 10.0], vis: [0.7, 1.4] },
  BOTTOM: { kda: [3.0, 6.0], kp: [0.52, 0.78], dmg: [0.26, 0.38], csm: [8.0, 10.5], vis: [0.6, 1.2] },
  UTILITY: { kda: [2.8, 6.0], kp: [0.62, 0.88], dmg: [0.10, 0.20], csm: [1.2, 2.5], vis: [1.8, 3.2] },
  ARAM: { kda: [3.0, 6.5], kp: [0.55, 0.82], dmg: [0.20, 0.32], csm: [1, 1], vis: [1, 1] },
  DEFAULT: { kda: [2.6, 5.2], kp: [0.50, 0.75], dmg: [0.20, 0.32], csm: [6.0, 9.0], vis: [0.9, 1.8] },
};

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const PHASE_BOUNDARIES = { early: 15 * 60 * 1000, mid: 25 * 60 * 1000 };
const PHASE_NEUTRAL = 50;

const cache = new Map();
const inflight = new Map();
const liveCache = new Map();
const careerCache = new Map();
const careerInflight = new Map();
let champMeta = { at: 0, map: {}, total: 0 };

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () => worker()));
  return results;
}

function formatTier(tier) {
  const t = String(tier || '');
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function estimateRankMmr(tier, division, lp) {
  const t = String(tier || '').toUpperCase();
  const base = TIER_BASE[t];
  if (base == null) return null;
  const apex = t === 'MASTER' || t === 'GRANDMASTER' || t === 'CHALLENGER';
  const div = apex ? 0 : (DIV_LP[String(division || '').toUpperCase()] ?? 0);
  const points = Number(lp);
  return base + div + (Number.isFinite(points) ? points : 0);
}

function estimateMmrFromRecord(visibleMmr, wins, losses) {
  if (visibleMmr == null || !Number.isFinite(visibleMmr)) return null;
  const w = Number(wins);
  const l = Number(losses);
  if (!Number.isFinite(w) || !Number.isFinite(l) || w + l < 8) return null;
  const prior = 10;
  const wr = (w + prior * 0.5) / (w + l + prior);
  if (wr <= 0.02 || wr >= 0.98) return Math.round(visibleMmr + (wr > 0.5 ? 400 : -400));
  return Math.round(visibleMmr + 400 * Math.log10(wr / (1 - wr)));
}

function soloRank(entries, queue) {
  const list = Array.isArray(entries) ? entries : [];
  const solo = list.find((r) => r.queueType === 'RANKED_SOLO_5x5');
  const flex = list.find((r) => r.queueType === 'RANKED_FLEX_SR');
  const pick = queue === 440 ? (flex || solo) : (solo || flex);
  if (!pick?.tier) {
    return {
      rank: 'Unranked', lp: null, wins: null, losses: null,
      estMmr: null, rankTier: null, rankDivision: null,
    };
  }
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(String(pick.tier).toUpperCase());
  const division = !apex && pick.rank ? ` ${pick.rank}` : '';
  const flexLabel = queue !== 440 && pick === flex && pick !== solo ? ' Flex' : '';
  return {
    rank: `${formatTier(pick.tier)}${division}${flexLabel}`,
    rankTier: pick.tier,
    rankDivision: apex ? null : pick.rank || null,
    lp: pick.leaguePoints ?? null,
    wins: pick.wins ?? null,
    losses: pick.losses ?? null,
    estMmr: estimateRankMmr(pick.tier, pick.rank, pick.leaguePoints),
  };
}

function formatRankEntry(pick) {
  if (!pick?.tier) {
    return {
      rank: 'Unranked',
      rankTier: null,
      rankDivision: null,
      lp: null,
      wins: null,
      losses: null,
      winrate: null,
      estMmr: null,
      lpDelta30d: null,
    };
  }
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(String(pick.tier).toUpperCase());
  const division = !apex && pick.rank ? ` ${pick.rank}` : '';
  const wins = pick.wins ?? null;
  const losses = pick.losses ?? null;
  const played = (Number(wins) || 0) + (Number(losses) || 0);
  return {
    rank: `${formatTier(pick.tier)}${division}`,
    rankTier: pick.tier,
    rankDivision: apex ? null : pick.rank || null,
    lp: pick.leaguePoints ?? null,
    wins,
    losses,
    winrate: played ? Math.round((Number(wins) / played) * 100) : null,
    estMmr: estimateRankMmr(pick.tier, pick.rank, pick.leaguePoints),
    lpDelta30d: null,
  };
}

const PLATFORM_TO_OPGG = {
  euw1: 'euw', na1: 'na', kr: 'kr', eun1: 'eune', br1: 'br', jp1: 'jp',
  la1: 'lan', la2: 'las', oc1: 'oce', tr1: 'tr', ru: 'ru', me1: 'me',
  ph2: 'ph', sg2: 'sg', th2: 'th', tw2: 'tw', vn2: 'vn',
};

async function fetchJsonUrl(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 Rift.lol',
    },
  });
  if (!res.ok) {
    const err = new Error(`opgg ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Ranked cards + LP delta from OP.GG when Riot league entries are empty/stale. */
async function fetchOpggProfileExtras(platform, riotId) {
  const region = PLATFORM_TO_OPGG[String(platform || '').toLowerCase()] || 'euw';
  const id = String(riotId || '').trim();
  if (!id.includes('#')) return null;
  try {
    const search = await fetchJsonUrl(
      `https://lol-api-summoner.op.gg/api/v3/${region}/summoners?riot_id=${encodeURIComponent(id)}&hl=en_US`
    );
    const hit = Array.isArray(search?.data) ? search.data[0] : search?.data;
    const opggPuuid = hit?.puuid;
    if (!opggPuuid) return null;
    const full = await fetchJsonUrl(
      `https://lol-api-summoner.op.gg/api/v3/${region}/summoners/${encodeURIComponent(opggPuuid)}?hl=en_US`
    );
    const body = full?.data && !Array.isArray(full.data) ? full.data : full;
    const leagueStats = Array.isArray(body?.league_stats) ? body.league_stats : [];
    const soloStat = leagueStats.find((s) => s.game_type === 'SOLORANKED') || null;
    const flexStat = leagueStats.find((s) => s.game_type === 'FLEXRANKED') || null;
    const fromStat = (stat) => {
      const info = stat?.tier_info || {};
      if (!info.tier) return null;
      const divMap = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
      return formatRankEntry({
        tier: info.tier,
        rank: divMap[Number(info.division)] || info.division || null,
        leaguePoints: info.lp,
        wins: stat.win ?? stat.match_record?.win ?? null,
        losses: stat.lose ?? stat.match_record?.lose ?? null,
      });
    };

    const rows = (body?.lp_histories || [])
      .map((row) => {
        const at = Date.parse(row?.created_at || '') || 0;
        const elo = Number(row?.elo_point);
        const info = row?.tier_info || {};
        const mmr = Number.isFinite(elo)
          ? elo
          : estimateRankMmr(
            info.tier,
            ({ 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }[Number(info.division)] || info.division),
            info.lp
          );
        return { at, elo: mmr };
      })
      .filter((row) => row.at && Number.isFinite(row.elo))
      .sort((a, b) => a.at - b.at);

    let lpDelta30d = null;
    if (rows.length >= 2) {
      const now = Date.now();
      const cutoff = now - (30 * 24 * 60 * 60 * 1000);
      let baseline = null;
      for (const row of rows) {
        if (row.at <= cutoff) baseline = row;
        else break;
      }
      if (!baseline) baseline = rows[0];
      const current = rows[rows.length - 1];
      lpDelta30d = Math.round(current.elo - baseline.elo);
    }

    // Prefer search payload solo_tier when league_stats missing.
    const soloFromSearch = hit?.solo_tier_info?.tier
      ? formatRankEntry({
        tier: hit.solo_tier_info.tier,
        rank: ({ 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }[Number(hit.solo_tier_info.division)] || null),
        leaguePoints: hit.solo_tier_info.lp,
        wins: null,
        losses: null,
      })
      : null;

    return {
      solo: fromStat(soloStat) || soloFromSearch,
      flex: fromStat(flexStat),
      lpDelta30d,
      // Newest 80 points of the elo/LP curve for the profile progression chart.
      lpHistory: rows.slice(-80),
    };
  } catch {
    return null;
  }
}

function roleLabel(position) {
  const map = {
    TOP: 'Top',
    JUNGLE: 'Jungle',
    MIDDLE: 'Mid',
    BOTTOM: 'Bot',
    UTILITY: 'Support',
  };
  const key = String(position || '').toUpperCase();
  return map[key] || null;
}

function extractPings(pp) {
  return {
    assist: Number(pp.assistMePings) || 0,
    onMyWay: Number(pp.onMyWayPings) || 0,
    missing: Number(pp.enemyMissingPings) || 0,
    needVision: Number(pp.needVisionPings) || 0,
    enemyVision: Number(pp.enemyVisionPings) || 0,
    allIn: Number(pp.allInPings) || 0,
    // Kept for older clients / match detail labels.
    danger: Number(pp.getBackPings) || 0,
    push: Number(pp.pushPings) || 0,
  };
}

function aggregateRolePerformance(games) {
  const order = ['BOTTOM', 'JUNGLE', 'MIDDLE', 'TOP', 'UTILITY'];
  const labels = {
    BOTTOM: 'ADC',
    JUNGLE: 'JUNGLE',
    MIDDLE: 'MID',
    TOP: 'TOP',
    UTILITY: 'SUPPORT',
  };
  const map = {};
  order.forEach((key) => { map[key] = { wins: 0, losses: 0 }; });
  games.forEach((g) => {
    const key = String(g.roleKey || '').toUpperCase();
    if (!map[key]) return;
    map[key][g.win ? 'wins' : 'losses'] += 1;
  });
  return order
    .map((key) => {
      const d = map[key];
      const gamesCount = d.wins + d.losses;
      return {
        roleKey: key,
        role: labels[key],
        games: gamesCount,
        wins: d.wins,
        losses: d.losses,
        wr: gamesCount ? Math.round((d.wins / gamesCount) * 100) : 0,
      };
    })
    .sort((a, b) => b.games - a.games || a.role.localeCompare(b.role));
}

function aggregatePlayedWith(games, selfPuuid) {
  const map = {};
  games.forEach((g) => {
    const players = g.scoreboard?.players || [];
    const self = players.find((p) => p.isSelf) || players.find((p) => p.puuid === selfPuuid);
    if (!self) return;
    players
      .filter((p) => p.teamId === self.teamId && p.puuid && p.puuid !== self.puuid)
      .forEach((p) => {
        if (!map[p.puuid]) {
          map[p.puuid] = {
            puuid: p.puuid,
            gameName: p.gameName || p.champion || 'Unknown',
            tagLine: p.tagLine || '',
            riotId: p.riotId || '',
            champion: p.champion,
            wins: 0,
            losses: 0,
          };
        }
        const row = map[p.puuid];
        row.champion = p.champion || row.champion;
        if (p.gameName) row.gameName = p.gameName;
        if (p.tagLine) row.tagLine = p.tagLine;
        if (p.riotId) row.riotId = p.riotId;
        row[g.win ? 'wins' : 'losses'] += 1;
      });
  });
  return Object.values(map)
    .map((d) => {
      const gamesCount = d.wins + d.losses;
      return {
        ...d,
        games: gamesCount,
        wr: gamesCount ? Math.round((d.wins / gamesCount) * 100) : 0,
      };
    })
    .sort((a, b) => b.games - a.games || b.wr - a.wr)
    .slice(0, 4);
}

function aggregateTotalPings(games) {
  const keys = ['assist', 'onMyWay', 'missing', 'needVision', 'enemyVision', 'allIn'];
  const totals = Object.fromEntries(keys.map((k) => [k, 0]));
  let counted = 0;
  games.forEach((g) => {
    const p = g.pings;
    if (!p) return;
    counted += 1;
    keys.forEach((k) => { totals[k] += Number(p[k]) || 0; });
  });
  const n = Math.max(1, counted);
  return {
    games: counted,
    totals,
    averages: Object.fromEntries(
      keys.map((k) => [k, Number((totals[k] / n).toFixed(1))])
    ),
  };
}

/** Lightweight per-match rows for career Role / Played With / Pings (all queues). */
function careerGameFromMatch(match, selfPuuid) {
  if (!match?.info?.participants) return null;
  const self = match.info.participants.find((pp) => pp.puuid === selfPuuid);
  if (!self) return null;
  const players = match.info.participants.map((pp) => {
    const gameName = pp.riotIdGameName || pp.gameName || '';
    const tagLine = pp.riotIdTagline || pp.tagLine || '';
    return {
      puuid: pp.puuid,
      isSelf: pp.puuid === selfPuuid,
      teamId: pp.teamId,
      champion: pp.championName,
      gameName,
      tagLine,
      riotId: gameName && tagLine ? `${gameName}#${tagLine}` : '',
    };
  });
  const lanePos = self.teamPosition || self.individualPosition || '';
  return {
    win: !!self.win,
    roleKey: String(lanePos || '').toUpperCase() || null,
    pings: extractPings(self),
    scoreboard: { players },
  };
}

async function fetchCareerMatchIds(riotFetch, matchRegion, puuid) {
  const ids = [];
  for (let start = 0; start < CAREER_MAX_GAMES; start += CAREER_PAGE) {
    const take = Math.min(CAREER_PAGE, CAREER_MAX_GAMES - start);
    let page = [];
    try {
      page = await riotFetchRetry(
        riotFetch,
        `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${take}`,
        { retries: 4 }
      );
    } catch {
      break;
    }
    if (!Array.isArray(page) || !page.length) break;
    ids.push(...page);
    if (page.length < take) break;
    await sleep(400);
  }
  return ids;
}

async function mapCareerMatches(riotFetch, matchRegion, ids) {
  const results = new Array(ids.length);
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const i = cursor++;
      const id = ids[i];
      try {
        results[i] = await riotFetchRetry(
          riotFetch,
          `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${id}`,
          { retries: 4 }
        );
      } catch {
        results[i] = null;
      }
      await sleep(75);
    }
  }
  const n = Math.min(CAREER_CONCURRENCY, Math.max(1, ids.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function loadCareerSidebar(riotFetch, puuid, matchRegion) {
  const key = `${matchRegion}|${puuid}`;
  const hit = careerCache.get(key);
  if (hit && Date.now() - hit.at < CAREER_TTL_MS) return hit.data;
  if (careerInflight.has(key)) return careerInflight.get(key);

  const pending = (async () => {
    const ids = await fetchCareerMatchIds(riotFetch, matchRegion, puuid);
    const matches = await mapCareerMatches(riotFetch, matchRegion, ids);
    const games = matches.map((m) => careerGameFromMatch(m, puuid)).filter(Boolean);
    const data = {
      games: games.length,
      rolePerformance: aggregateRolePerformance(games),
      playedWith: aggregatePlayedWith(games, puuid),
      totalPings: aggregateTotalPings(games),
    };
    // Cache even partial results so UI can show career scope.
    if (games.length) careerCache.set(key, { at: Date.now(), data });
    return data;
  })().finally(() => {
    if (careerInflight.get(key) === pending) careerInflight.delete(key);
  });

  careerInflight.set(key, pending);
  return pending;
}

function scale(value, par, excellent) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (excellent <= par) return v >= par ? 55 : (v / par) * 55;
  if (v <= par) return (v / par) * 55;
  return Math.min(100, 55 + ((v - par) / (excellent - par)) * 45);
}

function normalizeRole(position) {
  return ROLE_KEYS[String(position || '').toUpperCase()] || 'DEFAULT';
}

function computeGdScore({ kda, kp, damageShare, csm, visionPerMin, win, role, queueId }) {
  const lane = normalizeRole(role);
  const key = Number(queueId) === 450 ? 'ARAM' : (WEIGHTS[lane] ? lane : 'DEFAULT');
  const w = WEIGHTS[key];
  const b = BENCH[key];
  const parts = {
    kda: scale(kda, b.kda[0], b.kda[1]),
    kp: scale(kp, b.kp[0], b.kp[1]),
    dmg: scale(damageShare, b.dmg[0], b.dmg[1]),
    csm: w.csm ? scale(csm, b.csm[0], b.csm[1]) : 50,
    vis: w.vis ? scale(visionPerMin, b.vis[0], b.vis[1]) : 50,
    win: win ? 100 : 38,
  };
  const raw = parts.kda * w.kda + parts.kp * w.kp + parts.dmg * w.dmg
    + parts.csm * w.csm + parts.vis * w.vis + parts.win * w.win;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

function gdScoreFromParticipant(p, match) {
  if (!p || !match?.info) return 50;
  const mins = Math.max(1, (match.info.gameDuration || 1) / 60);
  const team = match.info.participants.filter((pp) => pp.teamId === p.teamId);
  const teamKills = team.reduce((sum, pp) => sum + (pp.kills || 0), 0);
  const teamDamage = team.reduce((sum, pp) => sum + (pp.totalDamageDealtToChampions || 0), 0);
  const damage = p.totalDamageDealtToChampions || 0;
  return computeGdScore({
    kda: (p.kills + p.assists) / Math.max(1, p.deaths),
    kp: teamKills > 0 ? (p.kills + p.assists) / teamKills : 0,
    damageShare: teamDamage ? damage / teamDamage : 0,
    csm: ((p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0)) / mins,
    visionPerMin: (p.visionScore || 0) / mins,
    win: !!p.win,
    role: p.teamPosition || p.individualPosition || '',
    queueId: match.info.queueId,
  });
}

function timeAgo(ts) {
  if (!ts) return '—';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function goldDiffAtTimestamp(timeline, selfId, oppId, ts) {
  if (!timeline?.info?.frames?.length) return null;
  const frame = timeline.info.frames.filter((f) => f.timestamp <= ts).pop();
  if (!frame) return null;
  const selfFrame = frame.participantFrames[String(selfId)];
  const oppFrame = frame.participantFrames[String(oppId)];
  return selfFrame && oppFrame ? selfFrame.totalGold - oppFrame.totalGold : null;
}

function computeAt15(timeline, match, self) {
  const empty = {
    goldDiff15: null, kaDiff15: null, csDiff15: null, xpDiff15: null, cs15: null,
  };
  if (!timeline?.info?.frames?.length) return empty;
  const lanePos = (participant) => {
    const pos = participant?.teamPosition || participant?.individualPosition || '';
    return pos && pos !== 'INVALID' ? pos : '';
  };
  const selfPos = lanePos(self);
  const selfId = self.participantId;
  const opp = selfPos
    ? match.info.participants.find((pp) => pp.teamId !== self.teamId && lanePos(pp) === selfPos)
    : null;
  const oppId = opp?.participantId;
  const frames = timeline.info.frames;
  const frameAt15 = frames.filter((f) => f.timestamp <= FIFTEEN_MIN_MS).pop();
  if (!frameAt15) return empty;
  const selfFrame = frameAt15.participantFrames[String(selfId)];
  const oppFrame = oppId != null ? frameAt15.participantFrames[String(oppId)] : null;
  const goldDiff15 = selfFrame && oppFrame ? selfFrame.totalGold - oppFrame.totalGold : null;
  const xpDiff15 = selfFrame && oppFrame
    ? (selfFrame.xp || 0) - (oppFrame.xp || 0)
    : null;
  const cs15 = selfFrame
    ? (selfFrame.minionsKilled || 0) + (selfFrame.jungleMinionsKilled || 0)
    : null;
  const csDiff15 = selfFrame && oppFrame
    ? ((selfFrame.minionsKilled || 0) + (selfFrame.jungleMinionsKilled || 0))
      - ((oppFrame.minionsKilled || 0) + (oppFrame.jungleMinionsKilled || 0))
    : null;

  let selfKA = 0;
  let oppKA = 0;
  for (const f of frames) {
    if (f.timestamp > FIFTEEN_MIN_MS) break;
    for (const ev of f.events || []) {
      if (ev.timestamp > FIFTEEN_MIN_MS || ev.type !== 'CHAMPION_KILL') continue;
      if (ev.killerId === selfId || (ev.assistingParticipantIds || []).includes(selfId)) selfKA += 1;
      if (oppId != null && (ev.killerId === oppId || (ev.assistingParticipantIds || []).includes(oppId))) oppKA += 1;
    }
  }
  return {
    goldDiff15,
    kaDiff15: oppId != null ? selfKA - oppKA : null,
    csDiff15,
    xpDiff15,
    cs15,
  };
}

const SKIP_ITEMS = new Set([
  0, 2003, 2010, 2031, 2033, 2052, 2055, 2138, 2139, 2140,
  3340, 3363, 3364, 3513,
]);

function itemPurchases(timeline, participantId) {
  if (!timeline?.info?.frames?.length) return [];
  const events = [];
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events || []) {
      if (ev.participantId !== participantId) continue;
      if (ev.type === 'ITEM_PURCHASED' || ev.type === 'ITEM_SOLD' || ev.type === 'ITEM_UNDO') {
        events.push(ev);
      }
    }
  }
  events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const buys = [];
  for (const ev of events) {
    if (ev.type === 'ITEM_PURCHASED') {
      const id = Number(ev.itemId) || 0;
      if (!id || SKIP_ITEMS.has(id)) continue;
      buys.push({ id, atMs: Number(ev.timestamp) || 0, sold: false });
    } else if (ev.type === 'ITEM_SOLD') {
      const id = Number(ev.itemId) || 0;
      for (let i = buys.length - 1; i >= 0; i -= 1) {
        if (buys[i].id === id && !buys[i].sold) {
          buys[i].sold = true;
          break;
        }
      }
    } else if (ev.type === 'ITEM_UNDO') {
      const before = Number(ev.beforeId) || 0;
      if (!before) continue;
      for (let i = buys.length - 1; i >= 0; i -= 1) {
        if (buys[i].id === before) { buys.splice(i, 1); break; }
      }
    }
  }
  return buys;
}

function skillOrder(timeline, participantId) {
  if (!timeline?.info?.frames?.length) return [];
  const order = [];
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events || []) {
      if (ev.type !== 'SKILL_LEVEL_UP' || ev.participantId !== participantId) continue;
      const slot = Number(ev.skillSlot);
      if (slot >= 1 && slot <= 4) order.push(slot);
    }
  }
  return order;
}

function teamObjectives(match, teamId) {
  const obj = (match?.info?.teams || []).find((team) => team.teamId === teamId)?.objectives || null;
  if (!obj) return { tower: 0, dragon: 0, baron: 0, herald: 0, grub: 0 };
  return {
    tower: Number(obj.tower?.kills) || 0,
    dragon: Number(obj.dragon?.kills) || 0,
    baron: Number(obj.baron?.kills) || 0,
    herald: Number(obj.riftHerald?.kills) || 0,
    grub: Number(obj.horde?.kills || obj.voidGrub?.kills) || 0,
  };
}

function participantRunes(p) {
  const primary = p.perks?.styles?.find((s) => s.description === 'primaryStyle') || p.perks?.styles?.[0];
  const sub = p.perks?.styles?.find((s) => s.description === 'subStyle') || p.perks?.styles?.[1];
  const primaryPerks = (primary?.selections || []).map((s) => s.perk);
  const subPerks = (sub?.selections || []).map((s) => s.perk);
  const shards = (p.perks?.statPerks && [
    p.perks.statPerks.offense,
    p.perks.statPerks.flex,
    p.perks.statPerks.defense,
  ]) || [];
  return {
    keystone: primaryPerks[0] || null,
    primary: primary?.style || null,
    primaryPerks: primaryPerks.slice(0, 4),
    sub: sub?.style || null,
    subPerks: subPerks.slice(0, 2),
    shards: shards.filter(Boolean),
  };
}

function timelineExtras(match, timeline, puuid) {
  if (!match?.info || !timeline?.info?.frames?.length || !puuid) {
    return {
      hasTimeline: false,
      goldDiff15: null,
      kaDiff15: null,
      csDiff15: null,
      xpDiff15: null,
      cs15: null,
      buildPurchases: [],
      skillOrder: [],
    };
  }
  const p = match.info.participants.find((pp) => pp.puuid === puuid);
  if (!p) {
    return {
      hasTimeline: false,
      goldDiff15: null,
      kaDiff15: null,
      csDiff15: null,
      xpDiff15: null,
      cs15: null,
      buildPurchases: [],
      skillOrder: [],
    };
  }
  const at15 = computeAt15(timeline, match, p);
  return {
    hasTimeline: true,
    ...at15,
    buildPurchases: itemPurchases(timeline, p.participantId),
    skillOrder: skillOrder(timeline, p.participantId),
  };
}

async function fetchTimeline(riotFetch, region, matchId) {
  try {
    return await riotFetch(
      `https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`
    );
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 350));
      return await riotFetch(
        `https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`
      );
    } catch {
      return null;
    }
  }
}

async function getMatchTimelineDetails(riotFetch, { matchId, region, puuid }) {
  const id = String(matchId || '').trim();
  const matchRegion = String(region || 'europe').toLowerCase();
  if (!id || !puuid) {
    const err = new Error('matchId and puuid are required.');
    err.status = 400;
    throw err;
  }
  const match = await riotFetch(
    `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(id)}`
  );
  const timeline = await fetchTimeline(riotFetch, matchRegion, id);
  const extras = timelineExtras(match, timeline, puuid);
  if (!extras.hasTimeline) {
    const err = new Error('Match timeline unavailable from Riot.');
    err.status = 404;
    throw err;
  }
  const scoreboard = buildScoreboard(match, timeline, puuid);
  return {
    matchId: id,
    ...extras,
    scoreboard,
  };
}

function buildScoreboard(match, timeline, selfPuuid) {
  const mins = Math.max(1, (match.info.gameDuration || 1) / 60);
  const rows = (match.info.participants || []).map((pp) => {
    const teamKills = match.info.participants
      .filter((x) => x.teamId === pp.teamId)
      .reduce((sum, x) => sum + (x.kills || 0), 0);
    const teamDamage = match.info.participants
      .filter((x) => x.teamId === pp.teamId)
      .reduce((sum, x) => sum + (x.totalDamageDealtToChampions || 0), 0);
    const damage = pp.totalDamageDealtToChampions || 0;
    const kp = teamKills > 0 ? (pp.kills + pp.assists) / teamKills : 0;
    const gdScore = gdScoreFromParticipant(pp, match);
    const gameName = pp.riotIdGameName || pp.gameName || '';
    const tagLine = pp.riotIdTagline || pp.tagLine || '';
    const runes = participantRunes(pp);
    const roleKey = String(pp.teamPosition || pp.individualPosition || '').toUpperCase();
    return {
      puuid: pp.puuid,
      isSelf: pp.puuid === selfPuuid,
      win: !!pp.win,
      teamId: pp.teamId,
      champion: pp.championName,
      champLevel: Number(pp.champLevel) || null,
      gameName,
      tagLine,
      riotId: gameName && tagLine ? `${gameName}#${tagLine}` : '',
      role: roleLabel(roleKey),
      roleKey: roleKey || null,
      kills: pp.kills,
      deaths: pp.deaths,
      assists: pp.assists,
      kda: ((pp.kills + pp.assists) / Math.max(1, pp.deaths)).toFixed(1),
      kpPct: Math.round(kp * 100),
      cs: (pp.totalMinionsKilled || 0) + (pp.neutralMinionsKilled || 0),
      csPerMin: Number((((pp.totalMinionsKilled || 0) + (pp.neutralMinionsKilled || 0)) / mins).toFixed(1)),
      visionScore: Number(pp.visionScore) || 0,
      visionPerMin: Number(((pp.visionScore || 0) / mins).toFixed(1)),
      damage,
      damageShare: teamDamage ? damage / teamDamage : 0,
      dpm: Math.round(damage / mins),
      gpm: Math.round((pp.goldEarned || 0) / mins),
      gdScore,
      items: [pp.item0, pp.item1, pp.item2, pp.item3, pp.item4, pp.item5, pp.item6],
      spells: [pp.summoner1Id, pp.summoner2Id],
      runes,
      wardsPlaced: Number(pp.wardsPlaced) || 0,
      wardsKilled: Number(pp.wardsKilled) || 0,
      controlWards: Number(pp.visionWardsBoughtInGame) || 0,
      spell1Casts: Number(pp.spell1Casts) || 0,
      spell2Casts: Number(pp.spell2Casts) || 0,
      spell3Casts: Number(pp.spell3Casts) || 0,
      spell4Casts: Number(pp.spell4Casts) || 0,
      summoner1Casts: Number(pp.summoner1Casts) || 0,
      summoner2Casts: Number(pp.summoner2Casts) || 0,
      pings: extractPings(pp),
    };
  });

  const sorted = [...rows].sort((a, b) => b.gdScore - a.gdScore);
  sorted.forEach((row, i) => { row.place = i + 1; });
  const bestWin = sorted.find((r) => r.win);
  const bestLose = sorted.find((r) => !r.win);
  rows.forEach((row) => {
    if (bestWin && row.puuid === bestWin.puuid) row.badge = 'MVP';
    else if (bestLose && row.puuid === bestLose.puuid) row.badge = 'ACE';
    else {
      const n = row.place;
      const suf = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
      row.badge = `${n}${suf}`;
    }
  });

  const self = rows.find((r) => r.isSelf);
  if (self && timeline) {
    self.buildPurchases = itemPurchases(timeline, match.info.participants.find((pp) => pp.puuid === selfPuuid)?.participantId);
    self.skillOrder = skillOrder(timeline, match.info.participants.find((pp) => pp.puuid === selfPuuid)?.participantId);
  }

  return {
    players: rows,
    blue: rows.filter((r) => r.teamId === 100),
    red: rows.filter((r) => r.teamId === 200),
    blueObj: teamObjectives(match, 100),
    redObj: teamObjectives(match, 200),
  };
}

function computePhaseScores(timeline, match, self) {
  const neutral = { early: PHASE_NEUTRAL, mid: PHASE_NEUTRAL, late: PHASE_NEUTRAL };
  if (!timeline?.info?.frames?.length || !self.teamPosition) return neutral;
  const opp = match.info.participants.find(
    (pp) => pp.teamId !== self.teamId && pp.teamPosition === self.teamPosition
  );
  if (!opp) return neutral;
  const selfId = self.participantId;
  const oppId = opp.participantId;
  const lastFrame = timeline.info.frames[timeline.info.frames.length - 1];
  const endTs = Math.max(lastFrame?.timestamp ?? PHASE_BOUNDARIES.mid, PHASE_BOUNDARIES.mid);
  const toScore = (diff) => (
    diff === null ? PHASE_NEUTRAL : Math.round(Math.min(100, Math.max(0, PHASE_NEUTRAL + diff / 30)))
  );
  return {
    early: toScore(goldDiffAtTimestamp(timeline, selfId, oppId, PHASE_BOUNDARIES.early)),
    mid: toScore(goldDiffAtTimestamp(timeline, selfId, oppId, PHASE_BOUNDARIES.mid)),
    late: toScore(goldDiffAtTimestamp(timeline, selfId, oppId, endTs)),
  };
}

async function getChampionMeta() {
  if (champMeta.at && Date.now() - champMeta.at < 12 * 60 * 60 * 1000 && champMeta.total) {
    return champMeta;
  }
  try {
    const verRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await verRes.json();
    const ver = versions[0];
    const dataRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`);
    const data = await dataRes.json();
    const map = {};
    Object.values(data.data || {}).forEach((c) => {
      map[String(c.key)] = c.id;
    });
    champMeta = { at: Date.now(), map, total: Object.keys(map).length, version: ver };
  } catch {
    /* keep last */
  }
  return champMeta;
}

function flatDeltas() {
  const keys = ['kda', 'gdScore', 'kp', 'csm', 'visionScore', 'gpm', 'goldDiff15', 'kaDiff15'];
  const out = {};
  keys.forEach((k) => { out[k] = { delta: '+0.0', dir: 'flat' }; });
  return out;
}

function resolveModeQueue(mode, queueParam) {
  if (queueParam != null && queueParam !== '') {
    const n = Number(queueParam);
    return Number.isFinite(n) ? n : null;
  }
  const key = String(mode || 'Solo');
  return Object.prototype.hasOwnProperty.call(MODE_QUEUE, key) ? MODE_QUEUE[key] : 420;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function riotFetchRetry(riotFetch, url, { retries = 3 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await riotFetch(url);
    } catch (err) {
      lastErr = err;
      const status = Number(err?.status) || 0;
      if (status !== 429 && status !== 503) throw err;
      await sleep(1200 * (attempt + 1));
    }
  }
  throw lastErr || new Error('Riot fetch failed');
}

/** Match IDs for history — retry on rate limit; widen window if queue filter is empty. */
async function fetchRecentMatchIds(riotFetch, matchRegion, puuid, count, queue) {
  const listUrl = (n, q) => {
    let url = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${n}`;
    if (q != null) url += `&queue=${q}`;
    return url;
  };
  if (queue != null) {
    try {
      const filtered = await riotFetchRetry(riotFetch, listUrl(count, queue));
      if (Array.isArray(filtered) && filtered.length) return filtered;
    } catch { /* fall through to unfiltered window */ }
  }
  try {
    const take = queue != null ? Math.min(100, Math.max(count * 5, count)) : count;
    const all = await riotFetchRetry(riotFetch, listUrl(take, null));
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

async function loadDashboard(riotFetch, { gameName, tagLine, platform, region, mode, queue, count }) {
  const { lookupAccount, matchRegionOf } = require('./web-api');
  const account = await lookupAccount(riotFetch, { gameName, tagLine, platform, region });
  const shard = account.platform;
  const matchRegion = account.region || matchRegionOf(shard);
  const matchCount = Math.min(Math.max(Number(count) || 20, 1), 20);
  const q = resolveModeQueue(mode, queue);

  // Do NOT load career here — it burns the Riot rate limit and starves match history.
  // Warm cache only; client uses /v1/web/career-sidebar for Role / Played With / Pings.
  const careerKey = `${matchRegion}|${account.puuid}`;
  const careerHit = careerCache.get(careerKey);
  const career = (careerHit && Date.now() - careerHit.at < CAREER_TTL_MS)
    ? careerHit.data
    : null;

  let matchIds = [];
  try {
    matchIds = await fetchRecentMatchIds(riotFetch, matchRegion, account.puuid, matchCount, q);
  } catch {
    matchIds = [];
  }
  if (!Array.isArray(matchIds)) matchIds = [];

  const matches = await mapWithConcurrency(matchIds, MATCH_CONCURRENCY, async (id) => {
    try {
      return await riotFetch(`https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${id}`);
    } catch {
      return null;
    }
  });

  // Timelines after matches, lower concurrency + retry — needed for build/skill/@15.
  const timelines = await mapWithConcurrency(matchIds, TIMELINE_CONCURRENCY, (id) => (
    fetchTimeline(riotFetch, matchRegion, id)
  ));

  const [masteries, meta] = await Promise.all([
    riotFetch(`https://${shard}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${account.puuid}`)
      .catch(() => []),
    getChampionMeta(),
  ]);

  let ranked = [];
  try {
    ranked = await riotFetch(`https://${shard}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`);
  } catch { /* optional */ }

  let ladderRank = null;
  const rankedInfo = soloRank(ranked, q == null ? 420 : q);
  if (rankedInfo.rankTier && ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(String(rankedInfo.rankTier).toUpperCase())) {
    try {
      const tier = String(rankedInfo.rankTier).toLowerCase();
      const league = await riotFetch(
        `https://${shard}.api.riotgames.com/lol/league/v4/${tier}leagues/by-queue/RANKED_SOLO_5x5`
      );
      const sorted = [...(league.entries || [])].sort((a, b) => b.leaguePoints - a.leaguePoints);
      const idx = sorted.findIndex((e) => e.puuid === account.puuid);
      if (idx !== -1) ladderRank = idx + 1;
    } catch { /* optional */ }
  }

  const champFromId = (id) => (Number(id) > 0 ? (meta.map[String(id)] || null) : null);
  const teamBans = (match, teamId) => (
    ((match?.info?.teams || []).find((team) => team.teamId === teamId)?.bans || [])
      .slice()
      .sort((a, b) => (Number(a.pickTurn) || 0) - (Number(b.pickTurn) || 0))
      .map((b) => ({
        teamId,
        pickTurn: b.pickTurn,
        championId: b.championId,
        champion: champFromId(b.championId),
      }))
  );

  const puuid = account.puuid;
  const recentGames = (matches || []).map((m, idx) => {
    if (!m?.info) return null;
    if (q != null && Number(m.info.queueId) !== Number(q)) return null;
    const p = m.info.participants?.find((pp) => pp.puuid === puuid);
    if (!p) return null;
    const mins = Math.max(1, m.info.gameDuration / 60);
    const kda = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(1);
    const teamKills = m.info.participants
      .filter((pp) => pp.teamId === p.teamId)
      .reduce((sum, pp) => sum + pp.kills, 0);
    const phases = computePhaseScores(timelines[idx], m, p);
    const allyTeam = [
      p.championName,
      ...m.info.participants
        .filter((pp) => pp.teamId === p.teamId && pp.puuid !== puuid)
        .map((pp) => pp.championName),
    ];
    const enemyTeam = m.info.participants
      .filter((pp) => pp.teamId !== p.teamId)
      .map((pp) => pp.championName);
    const lanePos = p.teamPosition || p.individualPosition || '';
    const opponent = lanePos
      ? m.info.participants.find(
        (pp) => pp.teamId !== p.teamId
          && (pp.teamPosition === lanePos || pp.individualPosition === lanePos)
      )
      : null;
    const runes = participantRunes(p);
    const gdScore = gdScoreFromParticipant(p, m);
    const kp = teamKills > 0 ? (p.kills + p.assists) / teamKills : 0;
    const damage = p.totalDamageDealtToChampions || 0;
    const extras = timelineExtras(m, timelines[idx], puuid);
    const scoreboard = buildScoreboard(m, timelines[idx], puuid);
    const selfBoard = scoreboard.players.find((row) => row.isSelf);
    return {
      matchId: m.metadata.matchId,
      win: p.win,
      champion: p.championName,
      champLevel: Number(p.champLevel) || null,
      role: roleLabel(lanePos),
      roleKey: String(lanePos || '').toUpperCase() || null,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      durationMin: Math.floor(mins),
      durationSec: Math.round(m.info.gameDuration % 60),
      kda,
      ago: timeAgo(m.info.gameEndTimestamp),
      endedAt: m.info.gameEndTimestamp || null,
      gdScore,
      place: selfBoard?.place || null,
      badge: selfBoard?.badge || null,
      queueId: m.info.queueId,
      queueLabel: QUEUE_NAMES[m.info.queueId] || 'Other',
      queueType: QUEUE_NAMES[m.info.queueId] || 'Other',
      region: PLATFORM_LABEL[shard] || String(shard).toUpperCase(),
      matchRegion,
      gpm: Math.round(p.goldEarned / mins),
      visionPerMin: Number((p.visionScore / mins).toFixed(1)),
      visionScore: Number(p.visionScore) || 0,
      kp,
      kpPct: Math.round(kp * 100),
      damage,
      dpm: Math.round(damage / mins),
      goldDiff15: extras.goldDiff15,
      kaDiff15: extras.kaDiff15,
      csDiff15: extras.csDiff15,
      xpDiff15: extras.xpDiff15,
      cs15: extras.cs15,
      earlyScore: phases.early,
      midScore: phases.mid,
      lateScore: phases.late,
      deaths4: p.deaths,
      killsAssists: p.kills + p.assists,
      csm: p.totalMinionsKilled + p.neutralMinionsKilled,
      csPerMin: Number(((p.totalMinionsKilled + p.neutralMinionsKilled) / mins).toFixed(1)),
      opponent: opponent?.championName || enemyTeam[0] || null,
      allyTeam,
      enemyTeam,
      allyBans: teamBans(m, p.teamId),
      enemyBans: teamBans(m, p.teamId === 200 ? 100 : 200),
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
      spells: [p.summoner1Id, p.summoner2Id],
      runes,
      wardsPlaced: Number(p.wardsPlaced) || 0,
      wardsKilled: Number(p.wardsKilled) || 0,
      controlWards: Number(p.visionWardsBoughtInGame) || 0,
      spellCasts: {
        q: Number(p.spell1Casts) || 0,
        w: Number(p.spell2Casts) || 0,
        e: Number(p.spell3Casts) || 0,
        r: Number(p.spell4Casts) || 0,
        d: Number(p.summoner1Casts) || 0,
        f: Number(p.summoner2Casts) || 0,
      },
      pings: extractPings(p),
      buildPurchases: extras.buildPurchases,
      skillOrder: extras.skillOrder,
      hasTimeline: extras.hasTimeline,
      scoreboard,
    };
  }).filter(Boolean).slice(0, matchCount);

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const kdaVal = avg(recentGames.map((g) => (g.kills + g.assists) / Math.max(1, g.deaths)));
  const csPerMin = avg(recentGames.map((g) => g.cs / Math.max(1, g.durationMin)));
  const gdScoreVal = avg(recentGames.map((g) => g.gdScore));
  const gpmVal = avg(recentGames.map((g) => g.gpm));
  const visionVal = avg(recentGames.map((g) => g.visionPerMin));
  const kpVal = avg(recentGames.map((g) => g.kp));
  const gd15Vals = recentGames.map((g) => g.goldDiff15).filter((v) => v !== null);
  const ka15Vals = recentGames.map((g) => g.kaDiff15).filter((v) => v !== null);
  const gd15Val = gd15Vals.length ? avg(gd15Vals) : null;
  const ka15Val = ka15Vals.length ? avg(ka15Vals) : null;
  const fmtSigned = (v) => (v >= 0 ? '+' : '') + Math.round(v);
  const deltas = flatDeltas();
  const last = recentGames[0] || null;
  const avgDeaths = avg(recentGames.map((g) => g.deaths));
  const lensScore = Math.max(0, Math.min(100, Math.round(100 - avgDeaths * 8)));
  const lensSeries = recentGames.map((g) => Math.max(0, Math.min(100, 100 - g.deaths * 8))).reverse();
  const estMmr = estimateMmrFromRecord(rankedInfo.estMmr, rankedInfo.wins, rankedInfo.losses)
    ?? rankedInfo.estMmr;

  const rankedList = Array.isArray(ranked) ? ranked : [];
  const soloEntry = rankedList.find((r) => r.queueType === 'RANKED_SOLO_5x5') || null;
  const flexEntry = rankedList.find((r) => r.queueType === 'RANKED_FLEX_SR') || null;
  let soloRanked = formatRankEntry(soloEntry);
  let flexRanked = formatRankEntry(flexEntry);
  const riotId = `${account.gameName}#${account.tagLine}`;

  const opgg = await fetchOpggProfileExtras(shard, riotId);
  if ((!soloRanked.rankTier || soloRanked.rank === 'Unranked') && opgg?.solo?.rankTier) {
    soloRanked = opgg.solo;
  }
  if ((!flexRanked.rankTier || flexRanked.rank === 'Unranked') && opgg?.flex?.rankTier) {
    flexRanked = opgg.flex;
  }
  if (opgg?.lpDelta30d != null) soloRanked.lpDelta30d = opgg.lpDelta30d;

  // Prefer Solo card rank for header when Riot league entries were empty.
  const headerRank = soloRanked.rankTier
    ? {
      rank: soloRanked.rank,
      lp: soloRanked.lp,
      wins: soloRanked.wins,
      losses: soloRanked.losses,
      rankTier: soloRanked.rankTier,
      rankDivision: soloRanked.rankDivision,
      estMmr: soloRanked.estMmr ?? estMmr,
    }
    : {
      rank: rankedInfo.rank,
      lp: rankedInfo.lp,
      wins: rankedInfo.wins,
      losses: rankedInfo.losses,
      rankTier: rankedInfo.rankTier,
      rankDivision: rankedInfo.rankDivision,
      estMmr,
    };

  const champMap = {};
  recentGames.forEach((g) => {
    if (!champMap[g.champion]) {
      champMap[g.champion] = { wins: 0, losses: 0, kdas: [], css: [], kills: 0, deaths: 0, assists: 0 };
    }
    const row = champMap[g.champion];
    row[g.win ? 'wins' : 'losses'] += 1;
    row.kdas.push((g.kills + g.assists) / Math.max(1, g.deaths));
    row.css.push(g.cs / Math.max(1, g.durationMin));
    row.kills += g.kills;
    row.deaths += g.deaths;
    row.assists += g.assists;
  });
  const championPool = Object.entries(champMap)
    .sort((a, b) => (b[1].wins + b[1].losses) - (a[1].wins + a[1].losses))
    .map(([champion, d]) => {
      const games = d.wins + d.losses;
      return {
        champion,
        games,
        wins: d.wins,
        losses: d.losses,
        wr: games ? Math.round((d.wins / games) * 100) : 0,
        kda: avg(d.kdas).toFixed(1),
        cs: avg(d.css).toFixed(1),
        kills: Number((d.kills / games).toFixed(1)),
        deaths: Number((d.deaths / games).toFixed(1)),
        assists: Number((d.assists / games).toFixed(1)),
      };
    });

  const recentWins = recentGames.filter((g) => g.win).length;
  const recentLosses = recentGames.length - recentWins;
  const overview = {
    games: recentGames.length,
    wins: recentWins,
    losses: recentLosses,
    winrate: recentGames.length ? Math.round((recentWins / recentGames.length) * 100) : 0,
    avgKills: Number(avg(recentGames.map((g) => g.kills)).toFixed(1)),
    avgDeaths: Number(avg(recentGames.map((g) => g.deaths)).toFixed(1)),
    avgAssists: Number(avg(recentGames.map((g) => g.assists)).toFixed(1)),
    avgKda: kdaVal.toFixed(1),
    avgGdScore: gdScoreVal.toFixed(1),
    avgKp: Math.round(kpVal * 100),
  };

  const rolePerformance = career?.rolePerformance || aggregateRolePerformance(recentGames);
  const playedWith = career?.playedWith || aggregatePlayedWith(recentGames, puuid);
  const totalPings = career?.totalPings || aggregateTotalPings(recentGames);

  return {
    riotId,
    gameName: account.gameName,
    tagLine: account.tagLine,
    puuid,
    platform: shard,
    region: PLATFORM_LABEL[shard] || String(shard).toUpperCase(),
    matchRegion,
    profileIconId: account.profileIconId || 29,
    summonerLevel: account.summonerLevel ?? null,
    rank: headerRank.rank,
    ladderRank,
    lp: headerRank.lp,
    estMmr: headerRank.estMmr,
    rankTier: headerRank.rankTier,
    rankDivision: headerRank.rankDivision,
    wins: headerRank.wins,
    losses: headerRank.losses,
    solo: soloRanked,
    flex: flexRanked,
    lpHistory: opgg?.lpHistory || [],
    seasonPeak: null,
    overview,
    championPool,
    rolePerformance,
    playedWith,
    totalPings,
    careerSidebar: Boolean(career?.games),
    careerGames: career?.games || 0,
    stats: {
      kda: kdaVal.toFixed(1),
      kdaDelta: deltas.kda.delta, kdaDeltaDir: deltas.kda.dir,
      gdScore: gdScoreVal.toFixed(1), gdDelta: deltas.gdScore.delta, gdDeltaDir: deltas.gdScore.dir,
      kp: kpVal.toFixed(2), kpDelta: deltas.kp.delta, kpDeltaDir: deltas.kp.dir,
      csm: csPerMin.toFixed(1), csmDelta: deltas.csm.delta, csmDeltaDir: deltas.csm.dir,
      visionScore: visionVal.toFixed(1), visionDelta: deltas.visionScore.delta, visionDeltaDir: deltas.visionScore.dir,
      gpm: gpmVal.toFixed(0), gpmDelta: deltas.gpm.delta, gpmDeltaDir: deltas.gpm.dir,
      goldDiff15: gd15Val !== null ? fmtSigned(gd15Val) : '—',
      goldDiff15Delta: deltas.goldDiff15.delta, goldDiff15DeltaDir: deltas.goldDiff15.dir,
      kaDiff15: ka15Val !== null ? fmtSigned(ka15Val) : '—',
      kaDiff15Delta: deltas.kaDiff15.delta, kaDiff15DeltaDir: deltas.kaDiff15.dir,
    },
    sparklines: {
      kda: recentGames.map((g) => (g.kills + g.assists) / Math.max(1, g.deaths)),
      gdScore: recentGames.map((g) => g.gdScore),
      kp: recentGames.map((g) => g.kp),
      csm: recentGames.map((g) => g.cs / Math.max(1, g.durationMin)),
      vision: recentGames.map((g) => g.visionPerMin),
      gpm: recentGames.map((g) => g.gpm),
      goldDiff15: recentGames.map((g) => g.goldDiff15 ?? 0),
      kaDiff15: recentGames.map((g) => g.kaDiff15 ?? 0),
    },
    lastGame: last,
    recentGames,
    collections: {
      played: Array.isArray(masteries) ? masteries.length : 0,
      total: meta.total || 0,
    },
    lens: {
      score: lensScore,
      series: lensSeries.length ? lensSeries : [50],
      avgDeaths: Number(avgDeaths.toFixed(1)),
    },
    ddragonVersion: meta.version || null,
  };
}

async function getDashboard(riotFetch, opts) {
  const key = [
    String(opts.gameName || '').toLowerCase(),
    String(opts.tagLine || '').toLowerCase(),
    String(opts.platform || ''),
    String(opts.mode || 'Solo'),
    String(opts.queue ?? ''),
    String(opts.count || 20),
  ].join('|');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.ttl || DASHBOARD_TTL_MS)) return hit.data;
  if (inflight.has(key)) return inflight.get(key);

  const pending = loadDashboard(riotFetch, opts)
    .then((data) => {
      const empty = !(data?.recentGames || []).length;
      cache.set(key, { at: Date.now(), data, ttl: empty ? 20 * 1000 : DASHBOARD_TTL_MS });
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === pending) inflight.delete(key);
    });
  inflight.set(key, pending);
  return pending;
}

async function getLiveGame(riotFetch, { gameName, tagLine, platform, region }) {
  const { lookupAccount } = require('./web-api');
  const account = await lookupAccount(riotFetch, { gameName, tagLine, platform, region });
  const key = `live:${account.puuid}:${account.platform}`;
  const hit = liveCache.get(key);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.data;

  let raw = null;
  try {
    raw = await riotFetch(
      `https://${account.platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${account.puuid}`
    );
  } catch (err) {
    if (err.status === 404) {
      const empty = null;
      liveCache.set(key, { at: Date.now(), data: empty });
      return empty;
    }
    throw err;
  }

  const meta = await getChampionMeta();
  const champFromId = (id) => (Number(id) > 0 ? (meta.map[String(id)] || null) : null);
  const mapPlayer = (p) => {
    const game = p.riotId || '';
    const [gn, tl] = String(game).includes('#')
      ? game.split('#')
      : [p.riotIdGameName || p.summonerName || '', p.riotIdTagline || ''];
    const riotId = gn && tl ? `${gn}#${tl}` : (gn || '');
    return {
      champion: champFromId(p.championId) || String(p.championId),
      championId: p.championId,
      riotId,
      teamId: p.teamId,
      isSelf: p.puuid === account.puuid,
      puuid: p.puuid,
    };
  };
  const participants = Array.isArray(raw?.participants) ? raw.participants : [];
  const data = {
    gameId: raw.gameId,
    queueId: raw.gameQueueConfigId,
    queueName: QUEUE_NAMES[raw.gameQueueConfigId] || 'Custom',
    gameLength: Number(raw.gameLength) || 0,
    source: 'spectator',
    bans: (raw.bannedChampions || []).map((b) => ({
      teamId: b.teamId,
      championId: b.championId,
      champion: champFromId(b.championId),
      pickTurn: b.pickTurn,
    })),
    blue: participants.filter((p) => p.teamId === 100).map(mapPlayer),
    red: participants.filter((p) => p.teamId === 200).map(mapPlayer),
  };
  liveCache.set(key, { at: Date.now(), data });
  return data;
}

async function getCareerSidebar(riotFetch, { gameName, tagLine, platform, region }) {
  const { lookupAccount, matchRegionOf } = require('./web-api');
  const account = await lookupAccount(riotFetch, { gameName, tagLine, platform, region });
  const matchRegion = account.region || matchRegionOf(account.platform);
  const data = await loadCareerSidebar(riotFetch, account.puuid, matchRegion);
  return {
    rolePerformance: data.rolePerformance,
    playedWith: data.playedWith,
    totalPings: data.totalPings,
    careerSidebar: true,
    careerGames: data.games,
    puuid: account.puuid,
  };
}

module.exports = {
  getDashboard,
  getLiveGame,
  getMatchTimelineDetails,
  getCareerSidebar,
  MODE_QUEUE,
};
