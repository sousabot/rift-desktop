import { getDdragonVersion, platformLabel } from './ddragon';
import { noticeFromError, isNotFound } from '../lib/apiNotice';
import { gdScoreFromParticipant } from '../lib/gdScore';
import { roleFromChampions } from '../lib/champLane';
import { estimateRankMmr, resolveEstimatedMmr } from '../lib/rankMmr';
import { loadOpggRankContext } from '../lib/seasonPeak';
import { applyTrackedLp, syncMatchLp } from '../lib/lpHistory';

const hasBridge = typeof window !== 'undefined' && !!window.riotAPI;

export function isLive() { return hasBridge; }

function requireBridge() {
  if (hasBridge) return;
  const err = new Error('Rift.lol must run as the desktop app to load live Riot data.');
  noticeFromError(err);
  throw err;
}

// Champion Mastery gives numeric championIds, but champion-splash/icon URLs
// (and ChampThumb) key off the ddragon name string — resolve that mapping
// once and reuse it everywhere.
let championMetaPromise = null;
function getChampionMeta() {
  if (!championMetaPromise) {
    championMetaPromise = getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`))
      .then((r) => r.json())
      .then((data) => {
        const map = {};
        const names = {};
        Object.values(data.data).forEach((c) => {
          map[c.key] = c.id;
          names[c.id] = c.name;
        });
        return { map, names, total: Object.keys(data.data).length };
      })
      .catch(() => ({ map: {}, names: {}, total: 0 }));
  }
  return championMetaPromise;
}

const ROLE_LABELS = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'ADC', UTILITY: 'Support' };

const dashboardInflight = new Map();
const dashboardCache = new Map();
const DASHBOARD_CACHE_MS = 2 * 60 * 1000;

function dashboardKey({ gameName, tagLine, region, platform, queue, count }) {
  const matchCount = Math.min(Math.max(Number(count) || 20, 1), 100);
  return [gameName, tagLine, region, platform, queue || '', matchCount].join('|').toLowerCase();
}

export function peekSummonerDashboard(args = {}) {
  const key = dashboardKey({
    gameName: args.gameName,
    tagLine: args.tagLine,
    region: args.region || 'europe',
    platform: args.platform || 'euw1',
    queue: args.queue,
    count: args.count,
  });
  return dashboardCache.get(key)?.data || null;
}

export async function getSummonerDashboard({ gameName, tagLine, region = 'europe', platform = 'euw1', queue = 420, count = 20 }) {
  requireBridge();

  const matchCount = Math.min(Math.max(Number(count) || 20, 1), 100);
  const key = dashboardKey({ gameName, tagLine, region, platform, queue, count: matchCount });
  const cached = dashboardCache.get(key);
  if (cached && Date.now() - cached.at < DASHBOARD_CACHE_MS) return cached.data;

  const existing = dashboardInflight.get(key);
  if (existing) return existing;

  const pending = loadSummonerDashboard({ gameName, tagLine, region, platform, queue, matchCount });
  dashboardInflight.set(key, pending);
  pending.then((data) => {
    dashboardCache.set(key, { at: Date.now(), data });
  }).catch(() => { /* keep last good cache */ });
  pending.finally(() => {
    if (dashboardInflight.get(key) === pending) dashboardInflight.delete(key);
  });
  return pending;
}

async function loadSummonerDashboard({ gameName, tagLine, region, platform, queue, matchCount }) {
  try {
    // Step 1: account (puuid)
    const account = await window.riotAPI.getAccountByRiotId({ gameName, tagLine, region });

    let resolvedRegion = region;
    let resolvedPlatform = platform;
    if (window.riotAPI.getLeagueShard) {
      try {
        const shard = await window.riotAPI.getLeagueShard({
          puuid: account.puuid,
          region,
          platform,
        });
        if (shard?.platform) resolvedPlatform = shard.platform;
        if (shard?.region) resolvedRegion = shard.region;
      } catch (e) {
        console.warn('[riotApi] Shard lookup failed, using selected server:', e.message);
      }
    }

    const matchIds = await window.riotAPI.getMatchIds({
      puuid: account.puuid,
      region: resolvedRegion,
      count: matchCount,
      queue: queue || undefined,
    });
    const timelineIds = (matchIds || []).slice(0, 10);
    const rankContextPromise = loadOpggRankContext({
      puuid: account.puuid,
      platform: resolvedPlatform,
      flex: queue === 440,
      riotId: `${account.gameName}#${account.tagLine}`,
    }).catch(() => null);
    const uggLpPromise = (queue === 420 || queue === 440) && window.riotAPI?.getUggMatchLp
      ? window.riotAPI.getUggMatchLp({
          riotId: `${account.gameName}#${account.tagLine}`,
          platform: resolvedPlatform,
          queue,
        }).catch(() => null)
      : Promise.resolve(null);

    const [matches, timelines] = await Promise.all([
      window.riotAPI.getMatchesBulk({ matchIds, region: resolvedRegion }),
      window.riotAPI.getTimelinesBulk({ matchIds: timelineIds, region: resolvedRegion }).catch((e) => {
        console.warn('[riotApi] Timeline fetch failed, @15 stats will show as unavailable:', e.message);
        return [];
      }),
    ]);

    // Step 3 & 4: summoner + ranked-by-puuid don't depend on each other either.
    const [summonerResult, rankedResult, masteryResult, champMeta] = await Promise.all([
      window.riotAPI.getSummonerByPuuid({ puuid: account.puuid, platform: resolvedPlatform }).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      ),
      window.riotAPI.getRankedByPuuid({ puuid: account.puuid, platform: resolvedPlatform }).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      ),
      window.riotAPI.getChampionMasteries
        ? window.riotAPI.getChampionMasteries({ puuid: account.puuid, platform: resolvedPlatform }).catch(() => [])
        : Promise.resolve([]),
      getChampionMeta(),
    ]);

    const summoner = summonerResult.status === 'fulfilled' ? summonerResult.value : null;
    if (summonerResult.status === 'rejected') {
      console.warn('[riotApi] Summoner fetch failed:', summonerResult.reason?.message);
    }

    let ranked = [];
    let rankedUnknown = false;
    if (rankedResult.status === 'fulfilled') {
      ranked = rankedResult.value;
    } else {
      console.warn('[riotApi] getRankedByPuuid failed, trying summonerId:', rankedResult.reason?.message);
      if (summoner?.id) {
        try {
          ranked = await window.riotAPI.getRankedEntries({ summonerId: summoner.id, platform: resolvedPlatform });
        } catch (e2) {
          console.warn('[riotApi] getRankedEntries also failed:', e2.message);
          rankedUnknown = true;
        }
      } else {
        rankedUnknown = true;
      }
    }

    // Step 5: ladder position (#N) — only exists for Master+ tiers; Riot has no
    // global ladder rank for Diamond and below.
    let ladderRank = null;
    const soloEntry = ranked.find((r) => r.queueType === 'RANKED_SOLO_5x5');
    if (soloEntry && ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(soloEntry.tier)) {
      try {
        const league = await window.riotAPI.getTopLeague({ tier: soloEntry.tier.toLowerCase(), platform: resolvedPlatform });
        const sorted = [...league.entries].sort((a, b) => b.leaguePoints - a.leaguePoints);
        const idx = sorted.findIndex((e) => e.puuid === account.puuid || e.summonerId === summoner?.id);
        if (idx !== -1) ladderRank = idx + 1;
      } catch (e) {
        console.warn('[riotApi] Ladder rank lookup failed:', e.message);
      }
    }

    const [rankContext, trackedLp] = await Promise.all([rankContextPromise, uggLpPromise]);
    return await normalizeDashboard({
      account, summoner, ranked, matches, timelines, ladderRank,
      rankedUnknown,
      puuid: account.puuid,
      platform: resolvedPlatform,
      queue,
      seasonPeak: rankContext?.peak || null,
      lobbyMmrs: rankContext?.lobbyMmrs || [],
      trackedLp,
      collections: {
        played: Array.isArray(masteryResult) ? masteryResult.length : 0,
        total: champMeta.total || 0,
      },
    });
  } catch (err) {
    console.error('[riotApi] Live fetch failed:', err);
    noticeFromError(err);
    throw err;
  }
}

let draftPoolCache = { key: '', at: 0, data: null };

export async function getDraftPool({ gameName, tagLine, region = 'europe', platform = 'euw1' }) {
  if (!gameName || !tagLine) return { mastery: {}, recent: {} };
  const cacheKey = `${gameName}#${tagLine}:${platform}:${region}`;
  if (draftPoolCache.data && draftPoolCache.key === cacheKey && Date.now() - draftPoolCache.at < 30 * 60 * 1000) {
    return draftPoolCache.data;
  }
  if (!hasBridge) {
    const data = { mastery: {}, recent: {} };
    draftPoolCache = { key: cacheKey, at: Date.now(), data };
    return data;
  }

  const account = await window.riotAPI.getAccountByRiotId({ gameName, tagLine, region });
  let resolvedRegion = region;
  let resolvedPlatform = platform;
  if (window.riotAPI.getLeagueShard) {
    try {
      const shard = await window.riotAPI.getLeagueShard({ puuid: account.puuid, region, platform });
      if (shard?.platform) resolvedPlatform = shard.platform;
      if (shard?.region) resolvedRegion = shard.region;
    } catch { /* keep selected server */ }
  }

  const [masteries, matchIds] = await Promise.all([
    window.riotAPI.getChampionMasteries
      ? window.riotAPI.getChampionMasteries({ puuid: account.puuid, platform: resolvedPlatform }).catch(() => [])
      : Promise.resolve([]),
    window.riotAPI.getMatchIds({
      puuid: account.puuid,
      region: resolvedRegion,
      count: 20,
      queue: 420,
    }).catch(() => []),
  ]);

  const matches = matchIds?.length
    ? await window.riotAPI.getMatchesBulk({ matchIds, region: resolvedRegion }).catch(() => [])
    : [];

  const mastery = {};
  (Array.isArray(masteries) ? masteries : []).forEach((m) => {
    const id = Number(m.championId);
    if (!id) return;
    mastery[id] = {
      points: Number(m.championPoints) || 0,
      level: Number(m.championLevel) || 0,
    };
  });

  const recent = {};
  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const p = match?.info?.participants?.find((pp) => pp.puuid === account.puuid);
    if (!p) return;
    const id = Number(p.championId);
    if (!id) return;
    const lane = ROLE_LABELS[p.teamPosition] || ROLE_LABELS[p.lane] || null;
    if (!recent[id]) recent[id] = { games: 0, roles: {} };
    recent[id].games += 1;
    if (lane) recent[id].roles[lane] = (recent[id].roles[lane] || 0) + 1;
  });

  const data = { mastery, recent };
  draftPoolCache = { key: cacheKey, at: Date.now(), data };
  return data;
}

export async function getLatestMatchReview({ gameName, tagLine, region = 'europe', platform = 'euw1' }) {
  if (!hasBridge) return null;
  try {
    const account = await window.riotAPI.getAccountByRiotId({ gameName, tagLine, region });
    let resolvedRegion = region;
    let resolvedPlatform = platform;
    if (window.riotAPI.getLeagueShard) {
      try {
        const shard = await window.riotAPI.getLeagueShard({ puuid: account.puuid, region, platform });
        if (shard?.platform) resolvedPlatform = shard.platform;
        if (shard?.region) resolvedRegion = shard.region;
      } catch { /* keep selected server */ }
    }
    const matchIds = await window.riotAPI.getMatchIds({
      puuid: account.puuid,
      region: resolvedRegion,
      count: 1,
    });
    if (!matchIds?.length) return null;
    const [matches, timelines] = await Promise.all([
      window.riotAPI.getMatchesBulk({ matchIds, region: resolvedRegion }),
      window.riotAPI.getTimelinesBulk({ matchIds, region: resolvedRegion }).catch(() => []),
    ]);
    const dash = await normalizeDashboard({
      account, summoner: null, ranked: [], matches, timelines,
      puuid: account.puuid, platform: resolvedPlatform, skipDeltas: true,
    });
    return dash.recentGames?.[0] || null;
  } catch (err) {
    console.warn('[riotApi] Latest match review failed:', err.message);
    noticeFromError(err);
    return null;
  }
}

export async function comparePlayers(leftLookup, rightLookup) {
  const [left, right] = await Promise.all([
    getSummonerDashboard({ ...leftLookup, queue: 420, count: 20 }),
    getSummonerDashboard({ ...rightLookup, queue: 420, count: 20 }),
  ]);
  const rightByChamp = Object.fromEntries((right.championPool || []).map((c) => [c.champion, c]));
  const overlap = (left.championPool || [])
    .filter((c) => rightByChamp[c.champion])
    .map((c) => ({
      champion: c.champion,
      left: c,
      right: rightByChamp[c.champion],
    }));
  return { left, right, overlap };
}

export async function getActiveGame({ gameName, tagLine, region = 'europe', platform = 'euw1' }) {
  if (!hasBridge) return null;
  try {
    const account = await window.riotAPI.getAccountByRiotId({ gameName, tagLine, region });
    return await window.riotAPI.getActiveGame({ puuid: account.puuid, platform });
  } catch {
    return null;
  }
}

function soloRank(entries, queue) {
  if (entries == null) {
    return { rank: null, rankUnknown: true, lp: null, wins: null, losses: null, estMmr: null, rankTier: null, rankDivision: null };
  }
  const list = Array.isArray(entries) ? entries : [];
  const solo = list.find((r) => r.queueType === 'RANKED_SOLO_5x5');
  const flex = list.find((r) => r.queueType === 'RANKED_FLEX_SR');
  const pick = queue === 440 ? (flex || solo) : (solo || flex);
  if (!pick?.tier) return { rank: 'Unranked', rankUnknown: false, lp: null, wins: null, losses: null, estMmr: null, rankTier: null, rankDivision: null };
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(String(pick.tier).toUpperCase());
  const division = !apex && pick.rank ? ` ${pick.rank}` : '';
  const flexLabel = queue !== 440 && pick === flex && pick !== solo ? ' Flex' : '';
  return {
    rank: `${formatTier(pick.tier)}${division}${flexLabel}`,
    rankUnknown: false,
    rankTier: pick.tier,
    rankDivision: apex ? null : pick.rank || null,
    lp: pick.leaguePoints ?? null,
    wins: pick.wins ?? null,
    losses: pick.losses ?? null,
    estMmr: estimateRankMmr(pick.tier, pick.rank, pick.leaguePoints),
  };
}

function formatTier(tier) {
  const t = String(tier || '');
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function streakFromResults(results) {
  if (!results.length) return 0;
  const first = results[0];
  let n = 0;
  for (const win of results) {
    if (win !== first) break;
    n += 1;
  }
  return first ? n : -n;
}

async function liveMatchExtras(puuids, championIdByPuuid, region, queue = 420, count = 5) {
  if (!window.riotAPI.getLastMatchIdsBulk) return {};
  const lists = await window.riotAPI.getLastMatchIdsBulk({
    puuids, region, queue, count,
  }).catch(() => []);
  const unique = [...new Set((lists || []).flat().filter(Boolean))];
  const matches = unique.length
    ? await window.riotAPI.getMatchesBulk({ matchIds: unique, region }).catch(() => [])
    : [];
  const byMatchId = {};
  unique.forEach((id, i) => { byMatchId[id] = matches[i]; });

  const extras = {};
  puuids.forEach((puuid, i) => {
    const champId = championIdByPuuid[puuid];
    let champGames = 0;
    let champWins = 0;
    const roles = {};
    const results = [];
    (lists[i] || []).forEach((matchId) => {
      const self = byMatchId[matchId]?.info?.participants?.find((p) => p.puuid === puuid);
      if (!self) return;
      results.push(!!self.win);
      if (self.championId === champId) {
        champGames += 1;
        if (self.win) champWins += 1;
      }
      const pos = self.teamPosition || self.individualPosition;
      if (pos && ROLE_LABELS[pos]) roles[pos] = (roles[pos] || 0) + 1;
    });
    const topRole = Object.entries(roles).sort((a, b) => b[1] - a[1])[0];
    extras[puuid] = {
      champGames,
      champWins,
      champWr: champGames ? (champWins / champGames) * 100 : null,
      role: topRole ? ROLE_LABELS[topRole[0]] : null,
      recentMainRole: topRole ? ROLE_LABELS[topRole[0]] : null,
      recentGames: results.length,
      streak: streakFromResults(results),
      last3: results.slice(0, 3),
      dodge: streakFromResults(results) <= -3,
    };
  });
  return extras;
}

function indexByPuuid(ids, rows) {
  const map = {};
  (ids || []).forEach((id, i) => {
    if (id) map[id] = rows?.[i];
  });
  return map;
}

function parseSpectatorRiotId(p = {}) {
  const raw = String(p.riotId || '').trim();
  const hash = raw.lastIndexOf('#');
  const parsedName = hash > 0 ? raw.slice(0, hash) : '';
  const parsedTag = hash > 0 ? raw.slice(hash + 1) : '';
  return {
    gameName: p.riotIdGameName || parsedName || '',
    tagLine: p.riotIdTagline || p.riotIdTagLine || parsedTag || '',
  };
}

function mapLivePlayers(raw, account, champMeta, accountByPuuid = {}, rankedByPuuid = {}, extras = {}) {
  return raw.participants.map((p) => {
    const acc = p.puuid && accountByPuuid[p.puuid];
    const accOk = acc && (!acc.puuid || acc.puuid === p.puuid);
    const parsed = parseSpectatorRiotId(p);
    let name = parsed.gameName || (accOk && acc.gameName) || p.summonerName || 'Unknown';
    let tag = parsed.tagLine || (accOk && acc.tagLine) || '';
    const ranked = soloRank(p.puuid ? rankedByPuuid[p.puuid] : null);
    const extra = extras[p.puuid] || {};
    const hasSmite = p.spell1Id === 11 || p.spell2Id === 11;
    const champId = champMeta.map[String(p.championId)] || 'Aatrox';
    const posRaw = p.teamPosition || p.selectedPosition || p.position;
    const isSelf = !!(p.puuid && account.puuid && p.puuid === account.puuid);
    const selfName = String(account.gameName || '').toLowerCase();
    const selfTag = String(account.tagLine || '').toLowerCase();
    if (!isSelf && selfName && name.toLowerCase() === selfName && String(tag).toLowerCase() === selfTag) {
      name = 'Unknown';
      tag = '';
    }
    return {
      puuid: p.puuid,
      teamId: p.teamId,
      champion: champId,
      championName: champMeta.names?.[champId] || champId,
      profileIconId: p.profileIconId,
      spell1Id: p.spell1Id,
      spell2Id: p.spell2Id,
      keystone: p.perks?.perkIds?.[0] || null,
      primaryStyle: p.perks?.perkStyle || null,
      subStyle: p.perks?.perkSubStyle || null,
      gameName: name,
      tagLine: tag,
      riotId: tag ? `${name}#${tag}` : name,
      isSelf,
      role: hasSmite ? 'Jungle' : (ROLE_LABELS[posRaw] || extra.role || null),
      champGames: extra.champGames || 0,
      champWins: extra.champWins || 0,
      champWr: extra.champWr,
      streak: extra.streak || 0,
      last3: extra.last3 || [],
      dodge: !!extra.dodge,
      recentMainRole: extra.recentMainRole || null,
      recentGames: extra.recentGames || 0,
      ...ranked,
    };
  });
}

const SUPPORT_ITEM_IDS = new Set([
  3850, 3851, 3853, 3854, 3855, 3857, 3858, 3859, 3860, 3862, 3863, 3864,
  3865, 3866, 3867, 3868, 3869, 3870, 3871, 3876, 3877,
]);

function normChamp(name = '') {
  return String(name).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function sameRiotId(a, b) {
  const left = String(a || '').trim().toLowerCase();
  const right = String(b || '').trim().toLowerCase();
  return !!left && !!right && left === right;
}

function mergeLiveRoster(players, roster) {
  if (!roster?.players?.length) return players;
  const used = new Set();
  return players.map((p) => {
    const team = p.teamId === 100 ? 'ORDER' : 'CHAOS';
    const want = normChamp(p.championName || p.champion);
    const selfId = String(p.riotId || (p.tagLine ? `${p.gameName}#${p.tagLine}` : '')).toLowerCase();
    let idx = roster.players.findIndex((row, i) => {
      if (used.has(i)) return false;
      if (row.team && row.team !== team) return false;
      const rowId = String(row.riotId || (row.tagLine ? `${row.gameName}#${row.tagLine}` : '')).toLowerCase();
      return !!(selfId && rowId && sameRiotId(selfId, rowId));
    });
    if (idx < 0) {
      idx = roster.players.findIndex((row, i) => {
        if (used.has(i)) return false;
        if (row.team && row.team !== team) return false;
        return normChamp(row.champion) === want;
      });
    }
    if (idx < 0) return p;
    used.add(idx);
    const row = roster.players[idx];
    const supportItem = (row.items || []).some((id) => SUPPORT_ITEM_IDS.has(id) || (id >= 3850 && id <= 3877));
    const fromId = parseSpectatorRiotId({ riotId: row.riotId, riotIdGameName: row.gameName, riotIdTagLine: row.tagLine });
    const gameName = fromId.gameName || p.gameName;
    const tagLine = fromId.tagLine || p.tagLine;
    const riotId = (gameName && tagLine) ? `${gameName}#${tagLine}` : (row.riotId || p.riotId);
    const pos = String(row.position || '').toUpperCase();
    return {
      ...p,
      gameName,
      tagLine,
      riotId,
      cs: row.cs,
      items: row.items || [],
      role: p.role === 'Jungle' ? 'Jungle' : (supportItem ? 'Support' : (ROLE_LABELS[pos] || p.role)),
    };
  });
}

async function getLiveRosterSafe() {
  try {
    if (typeof window !== 'undefined' && window.liveClient?.getRoster) {
      return await window.liveClient.getRoster();
    }
  } catch {
    /* live client is only up while League is running */
  }
  return null;
}

function rosterIncludes(roster, account) {
  if (!roster?.players?.length || !account) return false;
  const want = `${account.gameName || ''}#${account.tagLine || ''}`.toLowerCase();
  const wantName = String(account.gameName || '').toLowerCase();
  return roster.players.some((p) => {
    const id = String(p.riotId || `${p.gameName || ''}#${p.tagLine || ''}`).toLowerCase();
    if (want.includes('#') && id === want) return true;
    if (p.isYou && wantName && String(p.gameName || '').toLowerCase() === wantName) return true;
    return false;
  });
}

function liveGameFromRoster(roster, account, champMeta) {
  const nameToKey = {};
  Object.entries(champMeta?.names || {}).forEach(([key, name]) => {
    nameToKey[normChamp(name)] = key;
    nameToKey[normChamp(key)] = key;
  });
  const players = (roster.players || []).map((p) => {
    const key = nameToKey[normChamp(p.champion)] || p.champion || 'Unknown';
    const teamId = String(p.team || '').toUpperCase() === 'CHAOS' ? 200 : 100;
    const pos = String(p.position || '').toUpperCase();
    return {
      puuid: '',
      teamId,
      champion: key,
      championName: p.champion || key,
      spell1Id: null,
      spell2Id: null,
      keystone: null,
      gameName: p.gameName || '',
      tagLine: p.tagLine || '',
      riotId: p.riotId || (p.tagLine ? `${p.gameName}#${p.tagLine}` : (p.gameName || '')),
      isSelf: !!p.isYou,
      role: ROLE_LABELS[pos] || null,
      items: p.items || [],
      cs: p.cs,
    };
  });
  return {
    gameId: 'live-client',
    queueId: 0,
    queueName: 'Live game',
    gameLength: Math.floor(Number(roster.gameTime) || 0),
    bans: [],
    blue: players.filter((p) => p.teamId === 100),
    red: players.filter((p) => p.teamId === 200),
    source: 'live-client',
  };
}
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

let liveGameCache = null;
let liveGameCacheKey = '';
let liveGameCacheAt = 0;
const LIVE_GAME_CACHE_MS = 15000;

function liveGameParamsKey(params) {
  return `${params.gameName || ''}#${params.tagLine || ''}:${params.platform || ''}:${params.region || ''}`;
}

function packSpectatorLiveGame(raw, players, account, champMeta, resolvedPlatform) {
  return {
    gameId: raw.gameId,
    platformId: String(raw.platformId || resolvedPlatform || '').toUpperCase(),
    platform: resolvedPlatform,
    puuid: account.puuid,
    encryptionKey: raw.observers?.encryptionKey || '',
    queueId: raw.gameQueueConfigId,
    queueName: QUEUE_NAMES[raw.gameQueueConfigId] || 'Custom',
    gameLength: raw.gameLength || 0,
    gameStartTime: raw.gameStartTime || 0,
    source: 'spectator',
    bans: (raw.bannedChampions || []).map((b) => ({
      teamId: b.teamId,
      pickTurn: b.pickTurn,
      championId: b.championId,
      champion: Number(b.championId) > 0
        ? (champMeta.map[String(b.championId)] || null)
        : null,
    })),
    blue: players.filter((p) => p.teamId === 100),
    red: players.filter((p) => p.teamId === 200),
  };
}

export async function getLiveGame(
  { gameName, tagLine, region = 'europe', platform = 'euw1' },
  hooks = {},
) {
  if (!hasBridge) return null;
  const { onPartial, skipCache = false } = hooks;
  const cacheKey = liveGameParamsKey({ gameName, tagLine, region, platform });
  const cacheFresh = liveGameCache
    && liveGameCacheKey === cacheKey
    && Date.now() - liveGameCacheAt < LIVE_GAME_CACHE_MS;
  if (cacheFresh && !skipCache) {
    onPartial?.(liveGameCache);
    return liveGameCache;
  }

  try {
    const account = await window.riotAPI.getAccountByRiotId({ gameName, tagLine, region });
    let resolvedPlatform = platform;
    let resolvedRegion = region;
    const shardPromise = window.riotAPI.getLeagueShard
      ? window.riotAPI.getLeagueShard({ puuid: account.puuid, region, platform }).catch(() => null)
      : Promise.resolve(null);
    const champMetaPromise = getChampionMeta();
    const rosterPromise = getLiveRosterSafe();

    const shard = await shardPromise;
    if (shard?.platform) resolvedPlatform = shard.platform;
    if (shard?.region) resolvedRegion = shard.region;

    let raw;
    try {
      raw = await window.riotAPI.getActiveGame({ puuid: account.puuid, platform: resolvedPlatform });
    } catch (err) {
      if (!isNotFound(err)) {
        noticeFromError(err);
        return null;
      }
      const [champMeta, roster] = await Promise.all([champMetaPromise, rosterPromise]);
      if (rosterIncludes(roster, account)) {
        const fromRoster = liveGameFromRoster(roster, account, champMeta);
        if (fromRoster) {
          liveGameCache = fromRoster;
          liveGameCacheKey = cacheKey;
          liveGameCacheAt = Date.now();
          onPartial?.(fromRoster);
        }
        return fromRoster;
      }
      return null;
    }
    if (!raw?.participants?.length) return null;

    const [champMeta, roster] = await Promise.all([champMetaPromise, rosterPromise]);
    const puuids = raw.participants.map((p) => p.puuid).filter(Boolean);

    const partialPlayers = mergeLiveRoster(
      mapLivePlayers(raw, account, champMeta, {}, {}, {}),
      roster,
    );
    const shell = packSpectatorLiveGame(raw, partialPlayers, account, champMeta, resolvedPlatform);
    onPartial?.(shell);

    const [rankedLists, accounts] = await Promise.all([
      window.riotAPI.getRankedByPuuidsBulk
        ? window.riotAPI.getRankedByPuuidsBulk({ puuids, platform: resolvedPlatform }).catch(() => puuids.map(() => null))
        : Promise.all(puuids.map((puuid) =>
          window.riotAPI.getRankedByPuuid({ puuid, platform: resolvedPlatform }).catch(() => null)
        )),
      window.riotAPI.getAccountsByPuuidsBulk
        ? window.riotAPI.getAccountsByPuuidsBulk({ puuids, region: resolvedRegion }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const rankedPlayers = mergeLiveRoster(
      mapLivePlayers(
        raw,
        account,
        champMeta,
        indexByPuuid(puuids, accounts),
        indexByPuuid(puuids, rankedLists),
        {},
      ),
      roster,
    );
    const withRank = packSpectatorLiveGame(raw, rankedPlayers, account, champMeta, resolvedPlatform);
    onPartial?.(withRank);

    const champIdByPuuid = {};
    raw.participants.forEach((p) => {
      if (p.puuid) champIdByPuuid[p.puuid] = p.championId;
    });
    const extras = await liveMatchExtras(
      puuids,
      champIdByPuuid,
      resolvedRegion,
      raw.gameQueueConfigId || 420,
      5,
    ).catch(() => ({}));

    const players = mergeLiveRoster(
      mapLivePlayers(
        raw,
        account,
        champMeta,
        indexByPuuid(puuids, accounts),
        indexByPuuid(puuids, rankedLists),
        extras,
      ),
      roster,
    );

    const full = packSpectatorLiveGame(raw, players, account, champMeta, resolvedPlatform);
    liveGameCache = full;
    liveGameCacheKey = cacheKey;
    liveGameCacheAt = Date.now();
    return full;
  } catch (err) {
    console.warn('[riotApi] Live game failed:', err.message);
    if (isNotFound(err)) throw err;
    noticeFromError(err);
    return null;
  }
}

const NAME_ICON_LIMIT = 50; // names + profile icons for the full table
const GAMES_PER_PLAYER = 1;
const ROLE_WAVE = 10; // last ranked game for a wave of players, then paint
const TOP_LEAGUE_TTL_MS = 5 * 60 * 1000;
const topLeagueJobs = new Map();

function leagueJobKey(platform, tier, queue) {
  return `roles-v1:${platform}:${String(tier || 'challenger').toLowerCase()}:${queue}`;
}

function matchIdList(raw) {
  const ids = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return ids.filter(Boolean).slice(0, GAMES_PER_PLAYER);
}

function emitLeagueRows(job, rows, info) {
  job.rows = rows;
  job.listeners.forEach((fn) => {
    try { fn(rows, info); } catch { /* ignore subscriber errors */ }
  });
}

function yieldToUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function getTopLeague({
  tier = 'challenger',
  queue = 'RANKED_SOLO_5x5',
  platform = 'euw1',
  region = 'europe',
  onPartial,
  signal,
  silent = false,
} = {}) {
  requireBridge();
  const key = leagueJobKey(platform, tier, queue);
  let job = topLeagueJobs.get(key);
  if (!job) {
    job = { rows: null, inflight: null, at: 0, complete: false, listeners: new Set() };
    topLeagueJobs.set(key, job);
  }
  if (onPartial) job.listeners.add(onPartial);

  const dropListener = () => {
    if (onPartial) job.listeners.delete(onPartial);
  };
  if (signal) {
    if (signal.aborted) {
      dropListener();
      return job.rows || [];
    }
    signal.addEventListener('abort', dropListener, { once: true });
  }

  try {
    if (job.rows) onPartial?.(job.rows);
    const fresh = job.complete && Date.now() - job.at < TOP_LEAGUE_TTL_MS;
    if (fresh && !job.inflight) return job.rows;

    if (!job.inflight) {
      job.inflight = loadTopLeague({
        tier,
        queue,
        platform,
        region,
        isActive: () => job.listeners.size > 0,
        onPartial: (rows, info) => emitLeagueRows(job, rows, info),
      }).then((rows) => {
        emitLeagueRows(job, rows, { phase: 'done' });
        job.complete = true;
        job.at = Date.now();
        return rows;
      }).finally(() => {
        job.inflight = null;
      });
    }
    return await job.inflight;
  } catch (err) {
    if (!silent) {
      console.error('[riotApi] Leaderboard failed:', err);
      noticeFromError(err);
    }
    throw err;
  } finally {
    dropListener();
    if (signal) signal.removeEventListener('abort', dropListener);
  }
}

async function loadTopLeague({
  tier,
  queue,
  platform,
  region,
  onPartial,
  isActive = () => true,
}) {
    const data = await window.riotAPI.getTopLeague({ tier, queue, platform, limit: NAME_ICON_LIMIT });
    if (!isActive()) return [];
    const top = (data?.entries || [])
      .sort((a, b) => b.leaguePoints - a.leaguePoints)
      .slice(0, NAME_ICON_LIMIT);

    let rows = top.map((e, i) => ({
      rank: i + 1,
      puuid: e.puuid,
      summonerName: e.puuid?.slice(0, 8) ?? 'Unknown',
      profileIconId: null,
      profileIconUrl: null,
      role: null,
      kda: null,
      topChampions: [],
      lp: e.leaguePoints,
      wins: e.wins,
      losses: e.losses,
    }));
    onPartial?.(rows, { phase: 'ladder' });

    const iconPuuids = top.map((e) => e.puuid);
    const firstWave = iconPuuids.slice(0, ROLE_WAVE);

    // Names + the first 10 last-games in parallel so roles start landing
    // with the names instead of waiting on 50 mastery lookups first.
    const [accounts, ddVersion, firstLists] = await Promise.all([
      window.riotAPI.getAccountsByPuuidsBulk({ puuids: iconPuuids, region }).catch((e) => {
        console.warn('[riotApi] Leaderboard name resolution failed, falling back to masked IDs:', e.message);
        return [];
      }),
      getDdragonVersion(),
      window.riotAPI.getLastMatchIdsBulk({
        puuids: firstWave,
        region,
        queue: 420,
        count: GAMES_PER_PLAYER,
      }).catch((e) => {
        console.warn('[riotApi] Leaderboard match history failed:', e.message);
        return [];
      }),
    ]);
    if (!isActive()) return rows;

    rows = top.map((e, i) => {
      const acc = accounts[i];
      const prev = rows[i];
      return {
        ...prev,
        summonerName: acc ? `${acc.gameName}#${acc.tagLine}` : (e.puuid?.slice(0, 8) ?? 'Unknown'),
      };
    });
    onPartial?.(rows, { phase: 'names' });
    await yieldToUi();

    const matchPuuids = [];
    const idsByPlayer = [];
    const matchById = {};

    const ingestWave = async (puuids, lists) => {
      if (!isActive()) return;
      puuids.forEach((puuid, j) => {
        matchPuuids.push(puuid);
        idsByPlayer.push(matchIdList(lists[j]));
      });
      const needed = [];
      const seen = new Set(Object.keys(matchById));
      idsByPlayer.forEach((ids) => {
        ids.forEach((id) => {
          if (id && !seen.has(id)) {
            seen.add(id);
            needed.push(id);
          }
        });
      });
      const CHUNK = 5;
      if (!needed.length) {
        rows = mergeMatchStats(rows, top, idsByPlayer, matchById, matchPuuids);
        onPartial?.(rows, { phase: 'roles' });
        return;
      }
      for (let i = 0; i < needed.length; i += CHUNK) {
        if (!isActive()) return;
        const chunk = needed.slice(i, i + CHUNK);
        const batch = await window.riotAPI.getMatchesBulk({ matchIds: chunk, region }).catch(() => []);
        (batch || []).forEach((m) => { if (m?.metadata?.matchId) matchById[m.metadata.matchId] = m; });
        rows = mergeMatchStats(rows, top, idsByPlayer, matchById, matchPuuids);
        onPartial?.(rows, { phase: 'roles' });
        await yieldToUi();
      }
    };

    await ingestWave(firstWave, firstLists);
    if (!isActive()) return rows;

    const summonersPromise = window.riotAPI.getSummonersByPuuidsBulk({
      puuids: iconPuuids,
      platform,
    }).catch((e) => {
      console.warn('[riotApi] Leaderboard icon resolution failed:', e.message);
      return [];
    });

    for (let i = ROLE_WAVE; i < iconPuuids.length; i += ROLE_WAVE) {
      if (!isActive()) return rows;
      const slice = iconPuuids.slice(i, i + ROLE_WAVE);
      const lists = await window.riotAPI.getLastMatchIdsBulk({
        puuids: slice,
        region,
        queue: 420,
        count: GAMES_PER_PLAYER,
      }).catch(() => []);
      await ingestWave(slice, lists);
      await yieldToUi();
    }

    if (!isActive()) return rows;
    const summoners = await summonersPromise;
    rows = rows.map((row, i) => {
      const summ = summoners[i];
      return {
        ...row,
        profileIconId: summ?.profileIconId ?? null,
        profileIconUrl: summ?.profileIconId != null
          ? `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/profileicon/${summ.profileIconId}.png`
          : null,
      };
    });
    onPartial?.(rows, { phase: 'done' });
    return rows;
}

function mergeMatchStats(rows, _top, idsByPlayer, matchById, matchPuuids) {
  const indexByPuuid = {};
  matchPuuids.forEach((id, i) => { indexByPuuid[id] = i; });

  return rows.map((row) => {
    const slot = indexByPuuid[row.puuid];
    if (slot == null) return row;
    const ids = idsByPlayer[slot] || [];
    const champCounts = {};
    const roleCounts = {};
    let kills = 0, deaths = 0, assists = 0, games = 0;

    ids.forEach((id) => {
      const match = matchById[id];
      const self = match?.info?.participants?.find((pp) => pp.puuid === row.puuid);
      if (!self) return;
      games += 1;
      kills += Number(self.kills) || 0;
      deaths += Number(self.deaths) || 0;
      assists += Number(self.assists) || 0;
      champCounts[self.championName] = (champCounts[self.championName] || 0) + 1;
      const pos = self.teamPosition || self.individualPosition;
      if (pos && ROLE_LABELS[pos]) roleCounts[pos] = (roleCounts[pos] || 0) + 1;
    });

    const recentChamps = Object.entries(champCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 4);
    const topRoleKey = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const matchRole = topRoleKey ? ROLE_LABELS[topRoleKey] : null;
    const champRole = roleFromChampions(recentChamps.length ? recentChamps : row.topChampions);

    return {
      ...row,
      role: matchRole || champRole || row.role,
      kda: games ? ((kills + assists) / Math.max(1, deaths)).toFixed(1) : row.kda,
      topChampions: recentChamps.length ? recentChamps : row.topChampions,
    };
  });
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

const QUEUE_NAMES = {
  420: 'Solo/Duo',
  440: 'Flex',
  400: 'Normal',
  430: 'Normal',
  450: 'ARAM',
  480: 'Swiftplay',
  700: 'Clash',
};

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
      buys.push({ id, atMs: Number(ev.timestamp) || 0 });
    } else if (ev.type === 'ITEM_SOLD') {
      const id = Number(ev.itemId) || 0;
      for (let i = buys.length - 1; i >= 0; i -= 1) {
        if (buys[i].id === id) { buys.splice(i, 1); break; }
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

// Gold Diff @15 and K+A Diff @15 are computed against the opposing player in the
// same role (teamPosition), using the match timeline (match-v5 has no @15 snapshot).
function computeAt15(timeline, match, self) {
  const empty = {
    goldDiff15: null,
    kaDiff15: null,
    cs15: null,
    csDiff15: null,
    xpDiff15: null,
    dmg15: null,
    taken15: null,
    kills15: null,
    deaths15: null,
    plates15: null,
    roamKills15: null,
    roamAssists15: null,
  };
  if (!timeline?.info?.frames?.length) return empty;

  const lanePos = (participant) => {
    const pos = participant?.teamPosition || participant?.individualPosition || '';
    return pos && pos !== 'INVALID' ? pos : '';
  };
  const selfPos = lanePos(self);
  const selfId = self.participantId;
  const byId = Object.fromEntries(
    (match?.info?.participants || []).map((pp) => [pp.participantId, pp]),
  );
  const opp = selfPos
    ? match.info.participants.find(
      (pp) => pp.teamId !== self.teamId && lanePos(pp) === selfPos,
    )
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
  const dmg15 = selfFrame?.damageStats?.totalDamageDoneToChampions;
  const taken15 = selfFrame?.damageStats?.totalDamageTaken;

  let selfKA = 0;
  let oppKA = 0;
  let kills15 = 0;
  let deaths15 = 0;
  let plates15 = 0;
  let roamKills15 = 0;
  let roamAssists15 = 0;
  for (const f of frames) {
    if (f.timestamp > FIFTEEN_MIN_MS) break;
    for (const ev of f.events || []) {
      if (ev.timestamp > FIFTEEN_MIN_MS) continue;
      if (ev.type === 'TURRET_PLATE_DESTROYED' && ev.killerId === selfId) {
        plates15 += 1;
      }
      if (ev.type !== 'CHAMPION_KILL') continue;
      if (ev.killerId === selfId) {
        kills15 += 1;
        selfKA += 1;
        const victim = byId[ev.victimId];
        if (selfPos && victim && lanePos(victim) && lanePos(victim) !== selfPos) {
          roamKills15 += 1;
        }
      }
      if ((ev.assistingParticipantIds || []).includes(selfId)) {
        selfKA += 1;
        const victim = byId[ev.victimId];
        if (selfPos && victim && lanePos(victim) && lanePos(victim) !== selfPos) {
          roamAssists15 += 1;
        }
      }
      if (ev.victimId === selfId) deaths15 += 1;
      if (oppId != null) {
        if (ev.killerId === oppId) oppKA += 1;
        if ((ev.assistingParticipantIds || []).includes(oppId)) oppKA += 1;
      }
    }
  }

  return {
    goldDiff15,
    kaDiff15: oppId != null ? selfKA - oppKA : null,
    cs15,
    csDiff15,
    xpDiff15,
    dmg15: dmg15 != null && Number.isFinite(Number(dmg15)) ? Number(dmg15) : null,
    taken15: taken15 != null && Number.isFinite(Number(taken15)) ? Number(taken15) : null,
    kills15,
    deaths15,
    plates15,
    roamKills15,
    roamAssists15,
  };
}

// Riot doesn't expose an early/mid/late "phase score" — this is a heuristic we
// build from the same gold-diff-vs-lane-opponent data used for Gold Diff @15,
// snapshotted at three points in the game and mapped onto a 0-100 scale.
// It's an approximation for the score rings, not an official Riot metric.
const PHASE_BOUNDARIES = { early: 15 * 60 * 1000, mid: 25 * 60 * 1000 };
const PHASE_NEUTRAL = 50;

function goldDiffAtTimestamp(timeline, selfId, oppId, ts) {
  if (!timeline?.info?.frames?.length) return null;
  const frame = timeline.info.frames.filter((f) => f.timestamp <= ts).pop();
  if (!frame) return null;
  const selfFrame = frame.participantFrames[String(selfId)];
  const oppFrame  = frame.participantFrames[String(oppId)];
  return selfFrame && oppFrame ? selfFrame.totalGold - oppFrame.totalGold : null;
}

function champDamageAtTimestamp(timeline, participantId, ts) {
  if (!timeline?.info?.frames?.length) return null;
  const frame = timeline.info.frames.filter((f) => f.timestamp <= ts).pop();
  if (!frame) return null;
  const pf = frame.participantFrames[String(participantId)];
  const dmg = pf?.damageStats?.totalDamageDoneToChampions;
  return dmg != null && Number.isFinite(Number(dmg)) ? Number(dmg) : null;
}

function computePhaseDpm(timeline, match, self) {
  const empty = { dpmEarly: null, dpmMid: null, dpmLate: null };
  if (!timeline?.info?.frames?.length) return empty;

  const selfId = self.participantId;
  const frames = timeline.info.frames;
  const lastTs = frames[frames.length - 1]?.timestamp || 0;
  const durationMs = Math.max(
    Number(match.info.gameDuration) * 1000 || 0,
    lastTs,
  );
  if (durationMs <= 0) return empty;

  const dmgEnd = champDamageAtTimestamp(timeline, selfId, durationMs)
    ?? (Number(self.totalDamageDealtToChampions) || null);
  const dmg15 = champDamageAtTimestamp(timeline, selfId, PHASE_BOUNDARIES.early);
  const dmg25 = champDamageAtTimestamp(timeline, selfId, PHASE_BOUNDARIES.mid);

  const earlyMin = Math.min(PHASE_BOUNDARIES.early / 60000, durationMs / 60000);
  const dpmEarly = dmg15 != null && earlyMin > 0 ? dmg15 / earlyMin : null;

  let dpmMid = null;
  if (dmg15 != null && dmg25 != null && durationMs > PHASE_BOUNDARIES.early) {
    const midEnd = Math.min(durationMs, PHASE_BOUNDARIES.mid);
    const midMin = (midEnd - PHASE_BOUNDARIES.early) / 60000;
    if (midMin > 0) dpmMid = (dmg25 - dmg15) / midMin;
  }

  let dpmLate = null;
  if (dmg25 != null && dmgEnd != null && durationMs > PHASE_BOUNDARIES.mid) {
    const lateMin = (durationMs - PHASE_BOUNDARIES.mid) / 60000;
    if (lateMin > 0) dpmLate = (dmgEnd - dmg25) / lateMin;
  }

  return { dpmEarly, dpmMid, dpmLate };
}

function teamObjectives(match, teamId) {
  return (match?.info?.teams || []).find((team) => team.teamId === teamId)?.objectives || null;
}

function computeDeathTiming(timeline, participantId) {
  const empty = {
    deathsBefore15: null,
    deathsBefore25: null,
    firstDeathSec: null,
    avgDeathSec: null,
  };
  if (!timeline?.info?.frames?.length) return empty;
  const T15 = 15 * 60 * 1000;
  const T25 = 25 * 60 * 1000;
  const times = [];
  let deathsBefore15 = 0;
  let deathsBefore25 = 0;
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events || []) {
      if (ev.type !== 'CHAMPION_KILL' || ev.victimId !== participantId) continue;
      const ts = Number(ev.timestamp) || 0;
      times.push(ts / 1000);
      if (ts <= T15) deathsBefore15 += 1;
      if (ts <= T25) deathsBefore25 += 1;
    }
  }
  return {
    deathsBefore15,
    deathsBefore25,
    firstDeathSec: times.length ? times[0] : null,
    avgDeathSec: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
  };
}

function computeVisionTiming(timeline, participantId) {
  const empty = {
    wardsPlaced15: null,
    wardsKilled15: null,
    controlPlaced15: null,
    wardsPlaced20: null,
    wardsKilled20: null,
    controlPlaced20: null,
  };
  if (!timeline?.info?.frames?.length) return empty;
  const T15 = 15 * 60 * 1000;
  const T20 = 20 * 60 * 1000;
  let wardsPlaced15 = 0;
  let wardsKilled15 = 0;
  let controlPlaced15 = 0;
  let wardsPlaced20 = 0;
  let wardsKilled20 = 0;
  let controlPlaced20 = 0;
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events || []) {
      const ts = Number(ev.timestamp) || 0;
      if (ev.type === 'WARD_PLACED' && ev.creatorId === participantId) {
        const isControl = String(ev.wardType || '').toUpperCase().includes('CONTROL');
        if (ts <= T15) {
          wardsPlaced15 += 1;
          if (isControl) controlPlaced15 += 1;
        }
        if (ts <= T20) {
          wardsPlaced20 += 1;
          if (isControl) controlPlaced20 += 1;
        }
      }
      if (ev.type === 'WARD_KILL' && ev.killerId === participantId) {
        if (ts <= T15) wardsKilled15 += 1;
        if (ts <= T20) wardsKilled20 += 1;
      }
    }
  }
  return {
    wardsPlaced15,
    wardsKilled15,
    controlPlaced15,
    wardsPlaced20,
    wardsKilled20,
    controlPlaced20,
  };
}

function computeObjectiveTakes(timeline, participantId) {
  const empty = {
    dragonTakes: null,
    baronTakes: null,
    heraldTakes: null,
    grubTakes: null,
    atakhanTakes: null,
    epicTakes: null,
  };
  if (!timeline?.info?.frames?.length) return empty;
  let dragon = 0;
  let baron = 0;
  let herald = 0;
  let grub = 0;
  let atakhan = 0;
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events || []) {
      if (ev.type !== 'ELITE_MONSTER_KILL') continue;
      const involved = ev.killerId === participantId
        || (ev.assistingParticipantIds || []).includes(participantId);
      if (!involved) continue;
      const mt = String(ev.monsterType || '').toUpperCase();
      const sub = String(ev.monsterSubType || '').toUpperCase();
      const label = `${mt} ${sub}`;
      if (label.includes('BARON')) baron += 1;
      else if (label.includes('ATAKHAN')) atakhan += 1;
      else if (label.includes('HERALD') || label.includes('RIFT')) herald += 1;
      else if (label.includes('HORDE') || label.includes('GRUB')) grub += 1;
      else if (label.includes('DRAGON')) dragon += 1;
    }
  }
  return {
    dragonTakes: dragon,
    baronTakes: baron,
    heraldTakes: herald,
    grubTakes: grub,
    atakhanTakes: atakhan,
    epicTakes: dragon + baron + herald + grub + atakhan,
  };
}

function lanePosition(participant) {
  const pos = participant?.teamPosition || participant?.individualPosition || '';
  return pos && pos !== 'INVALID' ? pos : '';
}

function computeSoloDuels(timeline, match, self) {
  const empty = {
    soloKills: null,
    soloDeaths: null,
    laneSoloKills: null,
    laneSoloDeaths: null,
  };
  if (!timeline?.info?.frames?.length) return empty;
  const selfId = self.participantId;
  const selfPos = lanePosition(self);
  const byId = Object.fromEntries(
    (match?.info?.participants || []).map((pp) => [pp.participantId, pp]),
  );
  let soloKills = 0;
  let soloDeaths = 0;
  let laneSoloKills = 0;
  let laneSoloDeaths = 0;
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events || []) {
      if (ev.type !== 'CHAMPION_KILL') continue;
      const assists = ev.assistingParticipantIds || [];
      if (assists.length) continue;
      if (!ev.killerId || !ev.victimId) continue;
      const killer = byId[ev.killerId];
      const victim = byId[ev.victimId];
      if (!killer || !victim || killer.teamId === victim.teamId) continue;
      const sameLane = selfPos
        && lanePosition(killer) === selfPos
        && lanePosition(victim) === selfPos;
      if (ev.killerId === selfId) {
        soloKills += 1;
        if (sameLane) laneSoloKills += 1;
      }
      if (ev.victimId === selfId) {
        soloDeaths += 1;
        if (sameLane) laneSoloDeaths += 1;
      }
    }
  }
  return { soloKills, soloDeaths, laneSoloKills, laneSoloDeaths };
}

/** Classify kills by unique participants on the event: skirmish 3–5, teamfight 6+. */
function computeFightBuckets(timeline, self) {
  const empty = {
    skirmishKills: null,
    skirmishDeaths: null,
    skirmishAssists: null,
    teamfightKills: null,
    teamfightDeaths: null,
    teamfightAssists: null,
  };
  if (!timeline?.info?.frames?.length) return empty;
  const selfId = self.participantId;
  let skirmishKills = 0;
  let skirmishDeaths = 0;
  let skirmishAssists = 0;
  let teamfightKills = 0;
  let teamfightDeaths = 0;
  let teamfightAssists = 0;
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events || []) {
      if (ev.type !== 'CHAMPION_KILL') continue;
      if (!ev.killerId || !ev.victimId) continue;
      const assists = ev.assistingParticipantIds || [];
      const ids = new Set([ev.killerId, ev.victimId, ...assists].filter(Boolean));
      const size = ids.size;
      if (size < 3) continue;
      const bucket = size >= 6 ? 'tf' : 'sk';
      if (ev.killerId === selfId) {
        if (bucket === 'tf') teamfightKills += 1;
        else skirmishKills += 1;
      }
      if (ev.victimId === selfId) {
        if (bucket === 'tf') teamfightDeaths += 1;
        else skirmishDeaths += 1;
      }
      if (assists.includes(selfId)) {
        if (bucket === 'tf') teamfightAssists += 1;
        else skirmishAssists += 1;
      }
    }
  }
  return {
    skirmishKills,
    skirmishDeaths,
    skirmishAssists,
    teamfightKills,
    teamfightDeaths,
    teamfightAssists,
  };
}

function challengeNum(challenges, key) {
  const v = Number(challenges?.[key]);
  return Number.isFinite(v) ? v : null;
}

function computePhaseScores(timeline, match, self) {
  const neutral = { early: PHASE_NEUTRAL, mid: PHASE_NEUTRAL, late: PHASE_NEUTRAL };
  if (!timeline?.info?.frames?.length || !self.teamPosition) return neutral;

  const opp = match.info.participants.find(
    (pp) => pp.teamId !== self.teamId && pp.teamPosition === self.teamPosition
  );
  if (!opp) return neutral;

  const selfId = self.participantId;
  const oppId  = opp.participantId;
  const lastFrame = timeline.info.frames[timeline.info.frames.length - 1];
  const endTs = Math.max(lastFrame?.timestamp ?? PHASE_BOUNDARIES.mid, PHASE_BOUNDARIES.mid);

  const toScore = (diff) =>
    diff === null ? PHASE_NEUTRAL : Math.round(Math.min(100, Math.max(0, PHASE_NEUTRAL + diff / 30)));

  return {
    early: toScore(goldDiffAtTimestamp(timeline, selfId, oppId, PHASE_BOUNDARIES.early)),
    mid:   toScore(goldDiffAtTimestamp(timeline, selfId, oppId, PHASE_BOUNDARIES.mid)),
    late:  toScore(goldDiffAtTimestamp(timeline, selfId, oppId, endTs)),
  };
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DELTA_STAT_KEYS = ['kda', 'gdScore', 'kp', 'csm', 'visionScore', 'gpm', 'goldDiff15', 'kaDiff15'];
const DELTA_DECIMALS  = { kda: 1, gdScore: 1, kp: 2, csm: 1, visionScore: 1, gpm: 0, goldDiff15: 0, kaDiff15: 0 };

function flatDeltas() {
  const out = {};
  DELTA_STAT_KEYS.forEach((k) => { out[k] = { delta: '+0.0', dir: 'flat' }; });
  return out;
}

// Compares this batch's averages against the last saved snapshot to produce
// real "vs il y a 1w" deltas. Only overwrites the saved snapshot once a full
// week has actually passed — otherwise every reload would reset the
// comparison point to "a few seconds ago" instead of a week ago.
async function computeWeeklyDeltas(riotId, currentStats) {
  const result = flatDeltas();
  if (!hasBridge || !window.riotAPI.getStatSnapshot) return result;

  try {
    const snapshot = await window.riotAPI.getStatSnapshot({ riotId });

    if (snapshot?.stats) {
      DELTA_STAT_KEYS.forEach((k) => {
        const prev = snapshot.stats[k];
        const curr = currentStats[k];
        if (prev === null || prev === undefined || curr === null || curr === undefined) return;
        const diff = curr - prev;
        const decimals = DELTA_DECIMALS[k];
        const rounded = Number(diff.toFixed(decimals));
        result[k] = {
          delta: (rounded >= 0 ? '+' : '') + rounded.toFixed(decimals),
          dir: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
        };
      });
    }

    const isStale = !snapshot || (Date.now() - snapshot.timestamp) >= ONE_WEEK_MS;
    if (isStale) {
      await window.riotAPI.saveStatSnapshot({ riotId, stats: currentStats });
    }
  } catch (e) {
    console.warn('[riotApi] Weekly delta snapshot failed:', e.message);
  }

  return result;
}

async function normalizeDashboard({
  account, summoner, ranked, matches, timelines = [], ladderRank = null, puuid,
  rankedUnknown = false,
  platform = 'euw1', queue = 420, collections = { played: 0, total: 0 }, skipDeltas = false,
  seasonPeak = null,
  lobbyMmrs = [],
  trackedLp = null,
}) {
  const rankedList = Array.isArray(ranked) ? ranked : [];
  const rankedInfo = rankedUnknown
    ? { rank: 'Unavailable', lp: null, wins: null, losses: null, estMmr: null, rankTier: null, rankDivision: null }
    : soloRank(rankedList, queue);
  const region = platformLabel(platform);
  const champMeta = await getChampionMeta();
  const champFromId = (id) => (Number(id) > 0 ? (champMeta.map[String(id)] || null) : null);
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

  const recentGames = (Array.isArray(matches) ? matches : []).map((m, idx) => {
    const p = m?.info?.participants?.find((pp) => pp.puuid === puuid);
    if (!p) return null;
    const mins = Math.max(1, m.info.gameDuration / 60);
    const kda = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(1);
    const teamKills = m.info.participants
      .filter((pp) => pp.teamId === p.teamId)
      .reduce((sum, pp) => sum + pp.kills, 0);
    const { goldDiff15, kaDiff15, cs15, csDiff15, xpDiff15, dmg15, taken15, kills15, deaths15, plates15, roamKills15, roamAssists15 } = computeAt15(timelines[idx], m, p);
    const phases = computePhaseScores(timelines[idx], m, p);
    const phaseDpm = computePhaseDpm(timelines[idx], m, p);
    const objTakes = computeObjectiveTakes(timelines[idx], p.participantId);
    const visionTiming = computeVisionTiming(timelines[idx], p.participantId);
    const deathTiming = computeDeathTiming(timelines[idx], p.participantId);
    const duels = computeSoloDuels(timelines[idx], m, p);
    const fights = computeFightBuckets(timelines[idx], p);
    const teamObj = teamObjectives(m, p.teamId);
    const challengeSolo = Number(p.challenges?.soloKills);
    const soloKills = duels.soloKills != null
      ? duels.soloKills
      : (Number.isFinite(challengeSolo) ? challengeSolo : null);
    const quickSoloKills = Number(p.challenges?.quickSoloKills);
    const soloDeaths = duels.soloDeaths;
    const ch = p.challenges || {};
    const largestMultiKill = Number(p.largestMultiKill);
    const largestKillingSpree = Number(p.largestKillingSpree);
    const allyTeam = [
      p.championName,
      ...m.info.participants
        .filter((pp) => pp.teamId === p.teamId && pp.puuid !== puuid)
        .map((pp) => pp.championName),
    ];
    const enemyTeam = m.info.participants
      .filter((pp) => pp.teamId !== p.teamId)
      .map((pp) => pp.championName);
    const primary = p.perks?.styles?.find((s) => s.description === 'primaryStyle') || p.perks?.styles?.[0];
    const sub = p.perks?.styles?.find((s) => s.description === 'subStyle') || p.perks?.styles?.[1];
    const primaryPerks = (primary?.selections || []).map((s) => s.perk);
    const subPerks = (sub?.selections || []).map((s) => s.perk);

    const allies = m.info.participants.filter((pp) => pp.teamId === p.teamId);
    const teamDamage = allies.reduce((sum, pp) => sum + (pp.totalDamageDealtToChampions || 0), 0);
    const teamGold = allies.reduce((sum, pp) => sum + (pp.goldEarned || 0), 0);
    const teamVision = allies.reduce((sum, pp) => sum + (pp.visionScore || 0), 0);
    const teamObjDmg = allies.reduce((sum, pp) => sum + (pp.damageDealtToObjectives || 0), 0);
    const damage = p.totalDamageDealtToChampions || 0;
    const damageShare = teamDamage ? damage / teamDamage : null;
    const goldShare = teamGold ? (p.goldEarned || 0) / teamGold : null;
    const visionShare = teamVision ? (p.visionScore || 0) / teamVision : null;
    const objDamageShare = teamObjDmg ? (p.damageDealtToObjectives || 0) / teamObjDmg : null;
    const purchases = itemPurchases(timelines[idx], p.participantId);
    const gdScore = gdScoreFromParticipant(p, m);
    const players = (m.info.participants || []).map((pp) => {
      const gameName = pp.riotIdGameName || pp.gameName || '';
      const tagLine = pp.riotIdTagline || pp.tagLine || '';
      return {
        puuid: pp.puuid,
        gameName,
        tagLine,
        riotId: gameName && tagLine ? `${gameName}#${tagLine}` : '',
        champion: pp.championName,
        teamId: pp.teamId,
        win: !!pp.win,
        isSelf: pp.puuid === puuid,
        kills: pp.kills,
        deaths: pp.deaths,
        assists: pp.assists,
      };
    });

    return {
      matchId:      m.metadata.matchId,
      win:          p.win,
      teamId:       p.teamId,
      gameDuration: Number(m.info.gameDuration) || 0,
      surrender:    !!(p.gameEndedInSurrender || p.gameEndedInEarlySurrender),
      tripleKills:  p.tripleKills || 0,
      quadraKills:  p.quadraKills || 0,
      pentaKills:   p.pentaKills || 0,
      firstBlood:   !!p.firstBloodKill,
      damageTaken:  p.totalDamageTaken || 0,
      takenPerMin:  (p.totalDamageTaken || 0) / mins,
      mitigatedTotal: Number(p.damageSelfMitigated) || 0,
      mitigatedPerMin: (p.damageSelfMitigated || 0) / mins,
      healTotal: Number(p.totalHeal) || 0,
      healPerMin:   (p.totalHeal || 0) / mins,
      allyHealPerMin: (p.totalHealsOnTeammates || 0) / mins,
      longestLife:  Number(p.longestTimeSpentLiving) || 0,
      timeCCing:    Number(p.timeCCingOthers) || 0,
      timeCcDealt:  Number(p.totalTimeCCDealt) || 0,
      timeDead:     Number(p.totalTimeSpentDead) || 0,
      deathsPerMin: (Number(p.deaths) || 0) / mins,
      deathsBefore15: deathTiming.deathsBefore15,
      deathsBefore25: deathTiming.deathsBefore25,
      firstDeathSec: deathTiming.firstDeathSec,
      avgDeathSec: deathTiming.avgDeathSec,
      damageTakenShare: challengeNum(ch, 'damageTakenOnTeamPercentage'),
      deathsByEnemyChamps: challengeNum(ch, 'deathsByEnemyChamps'),
      survivedSingleDigitHp: challengeNum(ch, 'survivedSingleDigitHpCount'),
      tookLargeDamageSurvived: challengeNum(ch, 'tookLargeDamageSurvived'),
      effectiveHealShield: challengeNum(ch, 'effectiveHealAndShielding'),
      saveAllyFromDeath: challengeNum(ch, 'saveAllyFromDeath'),
      enemyImmobilizations: challengeNum(ch, 'enemyChampionImmobilizations'),
      immobilizeAndKill: challengeNum(ch, 'immobilizeAndKillWithAlly'),
      survivedThreeImmobilizes: challengeNum(ch, 'survivedThreeImmobilizesInFight'),
      unseenRecalls: challengeNum(ch, 'unseenRecalls'),
      champion:     p.championName,
      champLevel:   Number(p.champLevel) || null,
      kills:        p.kills,
      deaths:       p.deaths,
      assists:      p.assists,
      cs:           p.totalMinionsKilled + p.neutralMinionsKilled,
      durationMin:  Math.floor(mins),
      durationSec:  Math.round(m.info.gameDuration % 60),
      kda,
      ago:          timeAgo(m.info.gameEndTimestamp),
      endedAt:      m.info.gameEndTimestamp || null,
      gdScore,
      lp:           gdScore,
      role:         ROLE_LABELS[p.teamPosition] || ROLE_LABELS[p.individualPosition] || null,
      queueId:      m.info.queueId,
      queueLabel:   QUEUE_NAMES[m.info.queueId] || 'Other',
      queueType:    QUEUE_NAMES[m.info.queueId] || 'Other',
      region,
      dpm:          p.totalDamageDealtToChampions / mins,
      dpmEarly:     phaseDpm.dpmEarly,
      dpmMid:       phaseDpm.dpmMid,
      dpmLate:      phaseDpm.dpmLate,
      gpm:          p.goldEarned / mins,
      visionPerMin: p.visionScore / mins,
      visionScore: Number(p.visionScore) || 0,
      wardsPlaced: Number(p.wardsPlaced) || 0,
      wardsKilled: Number(p.wardsKilled) || 0,
      controlWardsBought: Number(p.visionWardsBoughtInGame) || 0,
      controlWardsPlaced: Number(p.detectorWardsPlaced) || 0,
      wardsPlacedPerMin: (Number(p.wardsPlaced) || 0) / mins,
      wardsKilledPerMin: (Number(p.wardsKilled) || 0) / mins,
      controlWardsPerMin: (Number(p.visionWardsBoughtInGame) || 0) / mins,
      stealthWardsPlaced: challengeNum(ch, 'stealthWardsPlaced')
        ?? Math.max(0, (Number(p.wardsPlaced) || 0) - (Number(p.detectorWardsPlaced) || 0)),
      wardTakedowns: challengeNum(ch, 'wardTakedowns') ?? (Number(p.wardsKilled) || 0),
      wardsGuarded: challengeNum(ch, 'wardsGuarded'),
      controlWardRiverCoverage: challengeNum(ch, 'controlWardTimeCoverageInRiverOrEnemyHalf'),
      challengeControlWardsPlaced: challengeNum(ch, 'controlWardsPlaced'),
      challengeVisionPerMin: challengeNum(ch, 'visionScorePerMinute'),
      mostWardsOneSweeper: (() => {
        const explicit = challengeNum(ch, 'mostWardsDestroyedOneSweeper');
        if (explicit != null) return explicit;
        const two = challengeNum(ch, 'twoWardsOneSweeperCount');
        const three = challengeNum(ch, 'threeWardsOneSweeperCount');
        // Riot often omits max/3-count keys when 0, but still sends twoWardsOneSweeperCount.
        if (two == null && three == null) return null;
        if ((three || 0) > 0) return 3;
        if ((two || 0) > 0) return 2;
        return (Number(p.wardsKilled) || 0) > 0 ? 1 : 0;
      })(),
      twoWardsOneSweeper: challengeNum(ch, 'twoWardsOneSweeperCount'),
      threeWardsOneSweeper: (() => {
        const three = challengeNum(ch, 'threeWardsOneSweeperCount');
        if (three != null) return three;
        // Same omit-when-zero behavior as above — show 0 once the sweeper challenge family exists.
        return challengeNum(ch, 'twoWardsOneSweeperCount') != null ? 0 : null;
      })(),
      wardsPlaced15: visionTiming.wardsPlaced15,
      wardsKilled15: visionTiming.wardsKilled15,
      controlPlaced15: visionTiming.controlPlaced15,
      wardsPlaced20: visionTiming.wardsPlaced20,
      wardsKilled20: visionTiming.wardsKilled20,
      controlPlaced20: visionTiming.controlPlaced20,
      kp:           teamKills > 0 ? (p.kills + p.assists) / teamKills : 0,
      goldDiff15,
      kaDiff15,
      cs15,
      csDiff15,
      xpDiff15,
      dmg15,
      taken15,
      tradeDiff15: (dmg15 != null && taken15 != null) ? dmg15 - taken15 : null,
      kills15,
      deaths15,
      plates15,
      roamKills15,
      roamAssists15,
      maxCsAdvantage: challengeNum(p.challenges, 'maxCsAdvantageOnLaneOpponent'),
      maxLevelLead: challengeNum(p.challenges, 'maxLevelLeadLaneOpponent'),
      laneVisionAdv: challengeNum(p.challenges, 'visionScoreAdvantageLaneOpponent'),
      laneGoldExpAdv: challengeNum(p.challenges, 'laningPhaseGoldExpAdvantage'),
      earlyLaneGoldExpAdv: challengeNum(p.challenges, 'earlyLaningPhaseGoldExpAdvantage'),
      laneMinions10: challengeNum(p.challenges, 'laneMinionsFirst10Minutes'),
      turretPlates: challengeNum(p.challenges, 'turretPlatesTaken') ?? plates15,
      otherLaneKillsEarly: challengeNum(p.challenges, 'killsOnOtherLanesEarlyGameAsLaner')
        ?? (roamKills15 != null ? roamKills15 : null),
      teleportTakedowns: challengeNum(p.challenges, 'teleportTakedowns'),
      takedownsFirst25: challengeNum(p.challenges, 'takedownsFirst25Minutes'),
      damage,
      damageShare,
      goldShare,
      visionShare,
      objDamageShare,
      assistsAvg: Number(p.assists) || 0,
      shieldPerMin: (Number(p.totalDamageShieldedOnTeammates) || 0) / mins,
      buildPurchases: purchases,
      buildPath:    purchases.map((row) => row.id),
      earlyScore:   phases.early,
      midScore:     phases.mid,
      lateScore:    phases.late,
      deaths4:      p.deaths,
      killsAssists: p.kills + p.assists,
      csm:          p.totalMinionsKilled + p.neutralMinionsKilled,
      objDpm:       (p.damageDealtToObjectives || 0) / mins,
      towerDpm:     (p.damageDealtToTurrets || 0) / mins,
      turretTakedowns: Number(p.turretTakedowns ?? p.turretKills) || 0,
      inhibTakedowns: Number(p.inhibitorTakedowns ?? p.inhibitorKills) || 0,
      nexusTakedowns: Number(p.nexusTakedowns ?? p.nexusKills) || 0,
      objStolen:    Number(p.objectivesStolen) || 0,
      objStolenAssists: Number(p.objectivesStolenAssists) || 0,
      firstTower:   !!teamObj?.tower?.first,
      firstTowerKill: !!p.firstTowerKill,
      firstTowerAssist: !!p.firstTowerAssist,
      firstDragon: !!teamObj?.dragon?.first,
      firstBaron: !!teamObj?.baron?.first,
      firstHerald: !!teamObj?.riftHerald?.first,
      teamDragonKills: Number(teamObj?.dragon?.kills) || 0,
      teamBaronKills: Number(teamObj?.baron?.kills) || 0,
      teamHeraldKills: Number(teamObj?.riftHerald?.kills) || 0,
      dragonTakes: objTakes.dragonTakes != null
        ? objTakes.dragonTakes
        : challengeNum(ch, 'dragonTakedowns'),
      baronTakes: objTakes.baronTakes != null
        ? objTakes.baronTakes
        : challengeNum(ch, 'baronTakedowns'),
      heraldTakes: objTakes.heraldTakes != null
        ? objTakes.heraldTakes
        : challengeNum(ch, 'riftHeraldTakedowns'),
      grubTakes: objTakes.grubTakes,
      atakhanTakes: objTakes.atakhanTakes,
      epicTakes: objTakes.epicTakes != null
        ? objTakes.epicTakes
        : (() => {
          const parts = [
            challengeNum(ch, 'dragonTakedowns'),
            challengeNum(ch, 'baronTakedowns'),
            challengeNum(ch, 'riftHeraldTakedowns'),
          ].filter((v) => v != null);
          return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
        })(),
      dragonTakedowns: challengeNum(ch, 'dragonTakedowns'),
      baronTakedowns: challengeNum(ch, 'baronTakedowns'),
      riftHeraldTakedowns: challengeNum(ch, 'riftHeraldTakedowns'),
      epicMonsterSteals: challengeNum(ch, 'epicMonsterSteals'),
      epicMonsterStolenWithoutSmite: challengeNum(ch, 'epicMonsterStolenWithoutSmite'),
      epicMonsterKillsNearEnemyJungler: challengeNum(ch, 'epicMonsterKillsNearEnemyJungler'),
      outerTurretExecutesBefore10: challengeNum(ch, 'outerTurretExecutesBefore10Minutes'),
      turretsTakenWithHerald: challengeNum(ch, 'turretsTakenWithRiftHerald'),
      wardTakedownsBefore20: challengeNum(ch, 'wardTakedownsBefore20M'),
      soloKills,
      soloDeaths,
      laneSoloKills: duels.laneSoloKills,
      laneSoloDeaths: duels.laneSoloDeaths,
      quickSoloKills: Number.isFinite(quickSoloKills) ? quickSoloKills : null,
      soloKillShare: (p.kills > 0 && soloKills != null) ? soloKills / p.kills : null,
      skirmishKills: fights.skirmishKills,
      skirmishDeaths: fights.skirmishDeaths,
      skirmishAssists: fights.skirmishAssists,
      teamfightKills: fights.teamfightKills,
      teamfightDeaths: fights.teamfightDeaths,
      teamfightAssists: fights.teamfightAssists,
      largestMultiKill: Number.isFinite(largestMultiKill) ? largestMultiKill : null,
      largestKillingSpree: Number.isFinite(largestKillingSpree) ? largestKillingSpree : null,
      multikills: challengeNum(ch, 'multikills'),
      outnumberedKills: challengeNum(ch, 'outnumberedKills'),
      skillshotsHit: challengeNum(ch, 'skillshotsHit'),
      skillshotsDodged: challengeNum(ch, 'skillshotsDodged'),
      abilityUses: challengeNum(ch, 'abilityUses'),
      allyTeam,
      enemyTeam,
      players,
      allyBans: teamBans(m, p.teamId),
      enemyBans: teamBans(m, p.teamId === 200 ? 100 : 200),
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
      spells: [p.summoner1Id, p.summoner2Id],
      runes: {
        keystone: primaryPerks[0] || null,
        primary: primary?.style || null,
        sub: sub?.style || null,
        perks: [...primaryPerks, ...subPerks],
      },
    };
  }).filter(Boolean);

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const kdaVal   = avg(recentGames.map((g) => (g.kills + g.assists) / Math.max(1, g.deaths)));
  const csPerMin = avg(recentGames.map((g) => g.cs / Math.max(1, g.durationMin)));
  const gdScoreVal = avg(recentGames.map((g) => g.gdScore));
  const gpmVal    = avg(recentGames.map((g) => g.gpm));
  const visionVal = avg(recentGames.map((g) => g.visionPerMin));
  const kpVal     = avg(recentGames.map((g) => g.kp));

  const gd15Vals = recentGames.map((g) => g.goldDiff15).filter((v) => v !== null);
  const ka15Vals = recentGames.map((g) => g.kaDiff15).filter((v) => v !== null);
  const gd15Val  = gd15Vals.length ? avg(gd15Vals) : null;
  const ka15Val  = ka15Vals.length ? avg(ka15Vals) : null;
  const fmtSigned = (v) => (v >= 0 ? '+' : '') + Math.round(v);

  const champMap = {};
  recentGames.forEach((g) => {
    if (!champMap[g.champion]) champMap[g.champion] = { wins: 0, losses: 0, kdas: [], css: [] };
    champMap[g.champion][g.win ? 'wins' : 'losses']++;
    champMap[g.champion].kdas.push((g.kills + g.assists) / Math.max(1, g.deaths));
    champMap[g.champion].css.push(g.cs / Math.max(1, g.durationMin));
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
        wr: games ? (d.wins / games) * 100 : 0,
        kda: avg(d.kdas).toFixed(1),
        cs: avg(d.css).toFixed(1),
      };
    });
  const championPerformance = championPool.slice(0, 3).map((d) => ({
    champion: d.champion,
    record: `${d.wins}W-${d.losses}L`,
    wins: d.wins,
    losses: d.losses,
    kda: `${d.kda} KDA`,
    cs: `${d.games}/20`,
  }));

  const last = recentGames[0] || null;
  const avgDeaths = avg(recentGames.map((g) => g.deaths));
  const lensScore = Math.max(0, Math.min(100, Math.round(100 - avgDeaths * 8)));
  const lensSeries = recentGames.map((g) => Math.max(0, Math.min(100, 100 - g.deaths * 8))).reverse();

  const riotId = `${account.gameName}#${account.tagLine}`;
  const lpMode = queue === 440 ? 'Flex' : queue === 420 ? 'Solo' : null;
  const hiddenMmr = resolveEstimatedMmr({
    visibleMmr: rankedInfo.estMmr,
    wins: rankedInfo.wins,
    losses: rankedInfo.losses,
    lobbyMmrs,
  });
  const synced = lpMode
    ? syncMatchLp({
        riotId,
        mode: lpMode,
        lp: rankedInfo.lp,
        tier: rankedInfo.rankTier,
        division: rankedInfo.rankDivision,
        games: recentGames,
        queueId: queue,
      })
    : recentGames;
  const gamesOut = lpMode
    ? applyTrackedLp(synced, trackedLp, riotId, lpMode)
    : synced;
  const deltas = skipDeltas ? flatDeltas() : await computeWeeklyDeltas(riotId, {
    kda: kdaVal, gdScore: gdScoreVal, kp: kpVal, csm: csPerMin,
    visionScore: visionVal, gpm: gpmVal, goldDiff15: gd15Val, kaDiff15: ka15Val,
  });

  return {
    riotId,
    puuid: puuid || account?.puuid || null,
    platform,
    region,
    seasonPeak: seasonPeak || null,
    profileIconId: summoner?.profileIconId ?? 29,
    summonerLevel: summoner?.summonerLevel ?? null,
    rank:          rankedInfo.rank,
    ladderRank,
    lp:            rankedInfo.lp,
    estMmr:        hiddenMmr,
    rankTier:      rankedInfo.rankTier,
    rankDivision:  rankedInfo.rankDivision,
    wins:          rankedInfo.wins,
    losses:        rankedInfo.losses,
    stats: {
      kda:               kdaVal.toFixed(1),
      kdaDelta:          deltas.kda.delta, kdaDeltaDir: deltas.kda.dir,
      gdScore:           gdScoreVal.toFixed(1), gdDelta: deltas.gdScore.delta, gdDeltaDir: deltas.gdScore.dir,
      kp:                kpVal.toFixed(2),  kpDelta:  deltas.kp.delta,  kpDeltaDir:  deltas.kp.dir,
      csm:               csPerMin.toFixed(1),
      csmDelta:          deltas.csm.delta, csmDeltaDir: deltas.csm.dir,
      visionScore:       visionVal.toFixed(1), visionDelta: deltas.visionScore.delta, visionDeltaDir: deltas.visionScore.dir,
      gpm:               gpmVal.toFixed(0), gpmDelta: deltas.gpm.delta, gpmDeltaDir: deltas.gpm.dir,
      goldDiff15:        gd15Val !== null ? fmtSigned(gd15Val) : '—', goldDiff15Delta: deltas.goldDiff15.delta, goldDiff15DeltaDir: deltas.goldDiff15.dir,
      kaDiff15:          ka15Val !== null ? fmtSigned(ka15Val) : '—', kaDiff15Delta:   deltas.kaDiff15.delta,   kaDiff15DeltaDir:   deltas.kaDiff15.dir,
    },
    sparklines: {
      kda:        recentGames.map((g) => (g.kills + g.assists) / Math.max(1, g.deaths)),
      gdScore:    recentGames.map((g) => g.gdScore),
      kp:         recentGames.map((g) => g.kp),
      csm:        recentGames.map((g) => g.cs / Math.max(1, g.durationMin)),
      vision:     recentGames.map((g) => g.visionPerMin),
      gpm:        recentGames.map((g) => g.gpm),
      goldDiff15: recentGames.map((g) => g.goldDiff15 ?? 0),
      kaDiff15:   recentGames.map((g) => g.kaDiff15 ?? 0),
    },
    lastGame: last,
    recentGames: gamesOut,
    championPool,
    championPerformance,
    collections,
    lens: {
      score: lensScore,
      series: lensSeries.length ? lensSeries : [50],
      avgDeaths: Number(avgDeaths.toFixed(1)),
    },
  };
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export async function getChampionTierList({ platform = 'euw1', rank = 'challenger', force = false } = {}) {
  requireBridge();
  if (!window.riotAPI.getTierList) {
    throw new Error('Tier list is not available in this build.');
  }
  try {
    return await window.riotAPI.getTierList({ platform, rank, force });
  } catch (err) {
    noticeFromError(err);
    throw err;
  }
}