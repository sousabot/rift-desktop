const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_SCHEMA = 4;
const PLAYERS_PER_TIER = 6;
const MATCHES_PER_PLAYER = 3;
const QUEUE = 420;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

const ROLE_MAP = {
  Top: 'TOP',
  Jungle: 'JUNGLE',
  Mid: 'MIDDLE',
  ADC: 'BOTTOM',
  Support: 'UTILITY',
};

const TIER_SPECS = [
  { key: 'IRON', kind: 'exp', tier: 'IRON', division: 'IV' },
  { key: 'BRONZE', kind: 'exp', tier: 'BRONZE', division: 'IV' },
  { key: 'SILVER', kind: 'exp', tier: 'SILVER', division: 'IV' },
  { key: 'GOLD', kind: 'exp', tier: 'GOLD', division: 'IV' },
  { key: 'PLATINUM', kind: 'exp', tier: 'PLATINUM', division: 'IV' },
  { key: 'EMERALD', kind: 'exp', tier: 'EMERALD', division: 'IV' },
  { key: 'DIAMOND', kind: 'exp', tier: 'DIAMOND', division: 'IV' },
  { key: 'MASTER', kind: 'league', tier: 'master' },
  { key: 'GRANDMASTER', kind: 'league', tier: 'grandmaster' },
  { key: 'CHALLENGER', kind: 'league', tier: 'challenger' },
];

function cachePath() {
  return path.join(app.getPath('userData'), 'lens-benchmarks.json');
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), 'utf-8'));
  } catch {
    return {};
  }
}

function writeCache(data) {
  // Pretty JSON on a large cache can stall the main process; write compact + deferred.
  const payload = JSON.stringify(data);
  setImmediate(() => {
    try {
      fs.writeFileSync(cachePath(), payload);
    } catch (err) {
      console.warn('[lens] cache write failed:', err?.message || err);
    }
  });
}

function cacheKey({ platform, role, queue }) {
  return `${platform || 'euw1'}:${queue || QUEUE}:${role || 'all'}`;
}

function lanePosition(participant) {
  const pos = participant?.teamPosition || participant?.individualPosition || '';
  return pos && pos !== 'INVALID' ? pos : '';
}

function computeAt15(timeline, match, self) {
  const empty = { gold15: null, ka15: null, csDiff15: null, roamKills15: null };
  if (!timeline?.info?.frames?.length) return empty;
  const selfPos = lanePosition(self);
  if (!selfPos) return empty;
  const selfId = self.participantId;
  const byId = Object.fromEntries(
    (match?.info?.participants || []).map((pp) => [pp.participantId, pp]),
  );
  const opp = (match?.info?.participants || []).find(
    (pp) => pp.teamId !== self.teamId && lanePosition(pp) === selfPos,
  );
  if (!opp) return empty;
  const oppId = opp.participantId;
  const frames = timeline.info.frames;
  const frameAt15 = frames.filter((f) => f.timestamp <= FIFTEEN_MIN_MS).pop();
  if (!frameAt15) return empty;
  const selfFrame = frameAt15.participantFrames[String(selfId)];
  const oppFrame = frameAt15.participantFrames[String(oppId)];
  const gold15 = selfFrame && oppFrame ? selfFrame.totalGold - oppFrame.totalGold : null;
  const csDiff15 = selfFrame && oppFrame
    ? ((selfFrame.minionsKilled || 0) + (selfFrame.jungleMinionsKilled || 0))
      - ((oppFrame.minionsKilled || 0) + (oppFrame.jungleMinionsKilled || 0))
    : null;
  let selfKA = 0;
  let oppKA = 0;
  let roamKills15 = 0;
  for (const f of frames) {
    if (f.timestamp > FIFTEEN_MIN_MS) break;
    for (const ev of f.events || []) {
      if (ev.type !== 'CHAMPION_KILL' || ev.timestamp > FIFTEEN_MIN_MS) continue;
      if (ev.killerId === selfId) {
        selfKA += 1;
        const victim = byId[ev.victimId];
        if (victim && lanePosition(victim) && lanePosition(victim) !== selfPos) roamKills15 += 1;
      }
      if ((ev.assistingParticipantIds || []).includes(selfId)) selfKA += 1;
      if (ev.killerId === oppId) oppKA += 1;
      if ((ev.assistingParticipantIds || []).includes(oppId)) oppKA += 1;
    }
  }
  return { gold15, ka15: selfKA - oppKA, csDiff15, roamKills15 };
}

function computeSoloKills(timeline, match, self) {
  const fromChallenge = Number(self?.challenges?.soloKills);
  if (!timeline?.info?.frames?.length) {
    return Number.isFinite(fromChallenge) ? fromChallenge : null;
  }
  const selfId = self.participantId;
  let soloKills = 0;
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events || []) {
      if (ev.type !== 'CHAMPION_KILL') continue;
      if ((ev.assistingParticipantIds || []).length) continue;
      if (ev.killerId === selfId) soloKills += 1;
    }
  }
  return soloKills;
}

function computeFightBuckets(timeline, self) {
  const empty = { skirmishKills: null, teamfightKills: null };
  if (!timeline?.info?.frames?.length) return empty;
  const selfId = self.participantId;
  let skirmishKills = 0;
  let teamfightKills = 0;
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events || []) {
      if (ev.type !== 'CHAMPION_KILL' || ev.killerId !== selfId) continue;
      if (!ev.victimId) continue;
      const size = new Set([ev.killerId, ev.victimId, ...(ev.assistingParticipantIds || [])].filter(Boolean)).size;
      if (size >= 6) teamfightKills += 1;
      else if (size >= 3) skirmishKills += 1;
    }
  }
  return { skirmishKills, teamfightKills };
}

function participantStats(match, puuid, roleFilter, timeline) {
  const p = (match?.info?.participants || []).find((row) => row.puuid === puuid);
  if (!p) return null;
  if (roleFilter) {
    const pos = p.teamPosition || p.individualPosition || '';
    if (pos && pos !== roleFilter) return null;
  }
  const mins = Math.max(1, Number(match.info.gameDuration) / 60);
  const allies = (match.info.participants || []).filter((row) => row.teamId === p.teamId);
  const teamKills = allies.reduce((sum, row) => sum + (row.kills || 0), 0);
  const teamDamage = allies.reduce((sum, row) => sum + (row.totalDamageDealtToChampions || 0), 0);
  const lane = timeline ? computeAt15(timeline, match, p) : { gold15: null, ka15: null, csDiff15: null, roamKills15: null };
  const fights = computeFightBuckets(timeline, p);
  const multi = Number(p.largestMultiKill);
  return {
    kp: teamKills > 0 ? ((p.kills || 0) + (p.assists || 0)) / teamKills : null,
    dpm: (p.totalDamageDealtToChampions || 0) / mins,
    taken: (p.totalDamageTaken || 0) / mins,
    gold15: lane.gold15,
    ka15: lane.ka15,
    csDiff15: lane.csDiff15,
    roamKills15: lane.roamKills15,
    objDpm: (p.damageDealtToObjectives || 0) / mins,
    turretTakedowns: Number(p.turretTakedowns ?? p.turretKills) || 0,
    visionPerMin: (p.visionScore || 0) / mins,
    wardsPlaced: Number(p.wardsPlaced) || 0,
    deaths: Number(p.deaths) || 0,
    damageShare: teamDamage ? (p.totalDamageDealtToChampions || 0) / teamDamage : null,
    soloKills: computeSoloKills(timeline, match, p),
    skirmishKills: fights.skirmishKills,
    teamfightKills: fights.teamfightKills,
    largestMultiKill: Number.isFinite(multi) ? multi : null,
    puuid,
    champion: p.championName || '',
    role: p.teamPosition || p.individualPosition || '',
    keystone: p.perks?.styles?.[0]?.selections?.[0]?.perk || null,
  };
}

function avgRows(rows, key) {
  const vals = rows.map((row) => row[key]).filter((v) => v != null && Number.isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function groupRows(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = row?.[key];
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return [...map.values()];
}

function avgOf(vals) {
  const list = vals.filter((v) => v != null && Number.isFinite(v));
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

function avgChampVariety(groups) {
  return avgOf(groups.map((g) => {
    if (!g.length) return null;
    const unique = new Set(g.map((row) => row.champion).filter(Boolean)).size;
    return (unique / g.length) * 10;
  }));
}

function avgOffRole(groups) {
  return avgOf(groups.map((g) => {
    if (!g.length) return null;
    const counts = {};
    g.forEach((row) => {
      const role = row.role && row.role !== 'INVALID' ? row.role : '';
      if (!role) return;
      counts[role] = (counts[role] || 0) + 1;
    });
    const top = Math.max(0, ...Object.values(counts));
    return (1 - top / g.length) * 100;
  }));
}

function summarizeTier(rows) {
  const groups = groupRows(rows, 'puuid');
  return {
    kp: avgRows(rows, 'kp'),
    dpm: avgRows(rows, 'dpm'),
    taken: avgRows(rows, 'taken'),
    gold15: avgRows(rows, 'gold15'),
    ka15: avgRows(rows, 'ka15'),
    csDiff15: avgRows(rows, 'csDiff15'),
    roamKills15: avgRows(rows, 'roamKills15'),
    objDpm: avgRows(rows, 'objDpm'),
    turretTakedowns: avgRows(rows, 'turretTakedowns'),
    visionPerMin: avgRows(rows, 'visionPerMin'),
    wardsPlaced: avgRows(rows, 'wardsPlaced'),
    deaths: avgRows(rows, 'deaths'),
    champVariety: avgChampVariety(groups.length ? groups : [rows]),
    offRole: avgOffRole(groups.length ? groups : [rows]),
    damageShare: avgRows(rows, 'damageShare'),
    soloKills: avgRows(rows, 'soloKills'),
    skirmishKills: avgRows(rows, 'skirmishKills'),
    teamfightKills: avgRows(rows, 'teamfightKills'),
    largestMultiKill: avgRows(rows, 'largestMultiKill'),
    n: rows.length,
  };
}

function pickPlayers(entries, n) {
  const pool = [...(entries || [])].sort(() => Math.random() - 0.5);
  const out = [];
  const seen = new Set();
  for (const entry of pool) {
    if (!entry?.puuid || seen.has(entry.puuid)) continue;
    seen.add(entry.puuid);
    out.push(entry.puuid);
    if (out.length >= n) break;
  }
  return out;
}

function needsLaneStats(stats, hit) {
  if (hit?.laneSplitBuiltAt) return false;
  return TIER_SPECS.some((spec) => {
    const row = stats?.[spec.key];
    return !row?.n || row.gold15 == null || row.csDiff15 == null;
  });
}

function shouldRebuildTier(stats, spec, mode) {
  const row = stats?.[spec.key];
  if (mode === 'duels') return !row?.n || row.soloKills == null || row.skirmishKills == null;
  if (mode === 'impact') return !row?.n || row.damageShare == null;
  if (mode === 'adapt') return !row?.n || row.champVariety == null;
  if (mode === 'survive') return !row?.n || row.deaths == null;
  if (mode === 'vision') return !row?.n || row.visionPerMin == null;
  if (mode === 'objectives') return !row?.n || row.objDpm == null;
  if (mode === 'lane') return !row?.n || row.gold15 == null || row.csDiff15 == null;
  if (mode === 'missing') return !row?.n;
  return true;
}

function needsObjectiveStats(stats, hit) {
  if (hit?.objectiveBuiltAt) return false;
  return TIER_SPECS.some((spec) => {
    const row = stats?.[spec.key];
    return !row?.n || row.objDpm == null;
  });
}

function needsVisionStats(stats, hit) {
  if (hit?.visionBuiltAt) return false;
  return TIER_SPECS.some((spec) => {
    const row = stats?.[spec.key];
    return !row?.n || row.visionPerMin == null;
  });
}

function needsSurviveStats(stats, hit) {
  if (hit?.surviveBuiltAt) return false;
  return TIER_SPECS.some((spec) => {
    const row = stats?.[spec.key];
    return !row?.n || row.deaths == null;
  });
}

function needsAdaptStats(stats, hit) {
  if (hit?.adaptBuiltAt) return false;
  return TIER_SPECS.some((spec) => {
    const row = stats?.[spec.key];
    return !row?.n || row.champVariety == null;
  });
}

function needsImpactStats(stats, hit) {
  if (hit?.impactBuiltAt) return false;
  return TIER_SPECS.some((spec) => {
    const row = stats?.[spec.key];
    return !row?.n || row.damageShare == null;
  });
}

function needsDuelStats(stats, hit) {
  if (hit?.fightBuiltAt) return false;
  return TIER_SPECS.some((spec) => {
    const row = stats?.[spec.key];
    return !row?.n || row.soloKills == null || row.skirmishKills == null || row.teamfightKills == null;
  });
}

module.exports = function registerLensBenchmarks(ipcMain, { riotFetch, mapWithConcurrency, matchRegionOf, fetchMatch, matchCache }) {
  const builds = new Map();

  async function leagueEntries(platform, spec) {
    try {
      if (spec.kind === 'league') {
        const data = await riotFetch(
          `https://${platform}.api.riotgames.com/lol/league/v4/${spec.tier}leagues/by-queue/RANKED_SOLO_5x5`,
          2,
        );
        return Array.isArray(data?.entries) ? data.entries : [];
      }
      const data = await riotFetch(
        `https://${platform}.api.riotgames.com/lol/league-exp/v4/entries/RANKED_SOLO_5x5/${spec.tier}/${spec.division}?page=1`,
        2,
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async function buildTier({ platform, region, roleFilter, spec }) {
    const entries = await leagueEntries(platform, spec);
    const puuids = pickPlayers(entries, PLAYERS_PER_TIER);
    if (!puuids.length) return summarizeTier([]);

    async function collectRows(filter) {
      const idLists = await mapWithConcurrency(puuids, 2, async (puuid) => {
        try {
          return await riotFetch(
            `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${MATCHES_PER_PLAYER}&queue=${QUEUE}`,
            2,
          );
        } catch {
          return [];
        }
      });

      const bag = matchCache?.readCache?.() || {};
      const rows = [];
      for (let i = 0; i < puuids.length; i += 1) {
        const puuid = puuids[i];
        const ids = (idLists[i] || []).slice(0, MATCHES_PER_PLAYER);
        for (const id of ids) {
          try {
            const match = fetchMatch
              ? await fetchMatch(region, id, bag)
              : await riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`, 2);
            let timeline = null;
            try {
              const tKey = `timeline:${id}`;
              if (bag[tKey]?.data) timeline = bag[tKey].data;
              else {
                timeline = await riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}/timeline`, 2);
                bag[tKey] = { timestamp: Date.now(), data: timeline };
              }
            } catch { /* lane stats optional */ }
            const stats = participantStats(match, puuid, filter, timeline);
            if (stats) rows.push(stats);
          } catch { /* skip */ }
        }
      }
      try { matchCache?.writeCache?.(bag); } catch { /* ignore */ }
      return rows;
    }

    let rows = await collectRows(roleFilter);
    if (!rows.length && roleFilter) rows = await collectRows(null);
    return summarizeTier(rows);
  }

  async function buildAll(args, sendReady, mode = 'full') {
    const key = cacheKey(args);
    if (builds.get(key)) return builds.get(key);
    const job = (async () => {
      const platform = args.platform || 'euw1';
      const region = matchRegionOf(platform);
      const roleFilter = ROLE_MAP[args.role] || null;
      const store = readCache();
      const prev = store[key]?.stats || {};
      const prevHit = store[key] || {};
      const stats = mode === 'full' ? {} : { ...prev };
      let matches = mode === 'full' ? 0 : (store[key]?.matches || 0);

      for (const spec of TIER_SPECS) {
        if (!shouldRebuildTier(stats, spec, mode)) continue;
        let row;
        try {
          row = await buildTier({ platform, region, roleFilter, spec });
        } catch {
          row = summarizeTier([]);
        }
        if (row.n) {
          stats[spec.key] = row;
          if (mode === 'full') matches += row.n;
          else matches = Object.values(stats).reduce((sum, tier) => sum + (tier?.n || 0), 0);
        }
        const partial = {
          key,
          schemaVersion: CACHE_SCHEMA,
          platform,
          role: args.role || '',
          queue: args.queue || QUEUE,
          builtAt: Date.now(),
          laneBuiltAt: mode === 'lane' ? Date.now() : prevHit.laneBuiltAt || null,
          laneSplitBuiltAt: mode === 'lane' ? Date.now() : prevHit.laneSplitBuiltAt || null,
          objectiveBuiltAt: mode === 'objectives' ? Date.now() : prevHit.objectiveBuiltAt || null,
          visionBuiltAt: mode === 'vision' ? Date.now() : prevHit.visionBuiltAt || null,
          surviveBuiltAt: mode === 'survive' ? Date.now() : prevHit.surviveBuiltAt || null,
          adaptBuiltAt: mode === 'adapt' ? Date.now() : prevHit.adaptBuiltAt || null,
          impactBuiltAt: mode === 'impact' ? Date.now() : prevHit.impactBuiltAt || null,
          duelBuiltAt: mode === 'duels' ? Date.now() : prevHit.duelBuiltAt || null,
          fightBuiltAt: mode === 'duels' ? Date.now() : prevHit.fightBuiltAt || null,
          matches,
          stats,
          refreshing: true,
        };
        store[key] = partial;
        writeCache(store);
        sendReady?.(partial);
      }

      const payload = {
        key,
        schemaVersion: CACHE_SCHEMA,
        platform,
        role: args.role || '',
        queue: args.queue || QUEUE,
        builtAt: Date.now(),
        laneBuiltAt: mode === 'lane' ? Date.now() : prevHit.laneBuiltAt || null,
        laneSplitBuiltAt: mode === 'lane' ? Date.now() : prevHit.laneSplitBuiltAt || null,
        objectiveBuiltAt: mode === 'objectives' ? Date.now() : prevHit.objectiveBuiltAt || null,
        visionBuiltAt: mode === 'vision' ? Date.now() : prevHit.visionBuiltAt || null,
        surviveBuiltAt: mode === 'survive' ? Date.now() : prevHit.surviveBuiltAt || null,
        adaptBuiltAt: mode === 'adapt' ? Date.now() : prevHit.adaptBuiltAt || null,
        impactBuiltAt: mode === 'impact' ? Date.now() : prevHit.impactBuiltAt || null,
        duelBuiltAt: mode === 'duels' ? Date.now() : prevHit.duelBuiltAt || null,
        fightBuiltAt: mode === 'duels' ? Date.now() : prevHit.fightBuiltAt || null,
        matches,
        stats,
        refreshing: false,
      };
      store[key] = payload;
      writeCache(store);
      sendReady?.(payload);
      return payload;
    })().finally(() => builds.delete(key));
    builds.set(key, job);
    return job;
  }

  ipcMain.handle('lens:getBenchmarks', async (_e, args = {}) => {
    const key = cacheKey(args);
    const store = readCache();
    const hit = store[key];
    const stale = !hit?.builtAt || Date.now() - hit.builtAt > CACHE_TTL_MS;
    const sendReady = (payload) => {
      try { _e.sender.send('lens:benchmarksReady', payload); } catch { /* ignore */ }
    };
    if (!hit?.stats || stale) {
      buildAll(args, sendReady, 'full').catch(() => {});
      return hit || { key, stats: {}, matches: 0, refreshing: true };
    }
    const have = Object.keys(hit.stats || {}).filter((tier) => hit.stats[tier]?.n > 0).length;
    if (have < TIER_SPECS.length) {
      buildAll(args, sendReady, 'missing').catch(() => {});
      return { ...hit, refreshing: true };
    }
    if (needsLaneStats(hit.stats, hit)) {
      buildAll(args, sendReady, 'lane').catch(() => {});
      return { ...hit, refreshing: true };
    }
    if (needsObjectiveStats(hit.stats, hit)) {
      buildAll(args, sendReady, 'objectives').catch(() => {});
      return { ...hit, refreshing: true };
    }
    if (needsVisionStats(hit.stats, hit)) {
      buildAll(args, sendReady, 'vision').catch(() => {});
      return { ...hit, refreshing: true };
    }
    if (needsSurviveStats(hit.stats, hit)) {
      buildAll(args, sendReady, 'survive').catch(() => {});
      return { ...hit, refreshing: true };
    }
    if (needsAdaptStats(hit.stats, hit)) {
      buildAll(args, sendReady, 'adapt').catch(() => {});
      return { ...hit, refreshing: true };
    }
    if (needsImpactStats(hit.stats, hit)) {
      buildAll(args, sendReady, 'impact').catch(() => {});
      return { ...hit, refreshing: true };
    }
    if (needsDuelStats(hit.stats, hit)) {
      buildAll(args, sendReady, 'duels').catch(() => {});
      return { ...hit, refreshing: true };
    }
    if ((hit.schemaVersion || 1) < CACHE_SCHEMA) {
      return { ...hit, schemaVersion: CACHE_SCHEMA };
    }
    return hit;
  });
};
