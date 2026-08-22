import { mergePeakRank, mmrFromTierInfo, rankSnapshot } from './rankMmr';

const PLATFORM_TO_OPGG = {
  euw1: 'euw',
  na1: 'na',
  kr: 'kr',
  eun1: 'eune',
  br1: 'br',
  jp1: 'jp',
  la1: 'lan',
  la2: 'las',
  oc1: 'oce',
  tr1: 'tr',
  ru: 'ru',
  ph2: 'ph',
  sg2: 'sg',
  th2: 'th',
  tw2: 'tw',
  vn2: 'vn',
  me1: 'me',
};

function regionOf(platform) {
  return PLATFORM_TO_OPGG[String(platform || '').toLowerCase()] || 'euw';
}

function isSummonerProfile(data) {
  return Boolean(
    data
    && typeof data === 'object'
    && !Array.isArray(data)
    && (data.puuid || data.current_season_high_tiers || data.league_stats),
  );
}

function profileData(json) {
  if (!json || typeof json !== 'object') return null;
  if (isSummonerProfile(json.data)) return json.data;
  if (isSummonerProfile(json)) return json;
  return null;
}

function puuidFrom(json, fallback) {
  if (Array.isArray(json?.data)) return json.data[0]?.puuid || fallback || null;
  return json?.data?.puuid || json?.puuid || fallback || null;
}

function rawPeak(tier, division, lp) {
  const snap = rankSnapshot(tier, division, lp);
  if (!snap) return null;
  return { tier: snap.tier, division: snap.division, lp: snap.lp };
}

export function peakFromOpggJson(json, flex = false) {
  const data = profileData(json);
  if (!data) return null;
  const want = flex ? 'FLEXRANKED' : 'SOLORANKED';
  const rows = [];
  const high = (data.current_season_high_tiers?.rank_entries || []).find((entry) => entry?.game_type === want);
  if (high?.high_rank_info?.tier) {
    rows.push(rawPeak(high.high_rank_info.tier, high.high_rank_info.division, high.high_rank_info.lp));
  }
  if (!flex) {
    for (const row of data.lp_histories || []) {
      const info = row?.tier_info;
      if (info?.tier) rows.push(rawPeak(info.tier, info.division, info.lp));
    }
  }
  const best = mergePeakRank(...rows.filter(Boolean).map((row) => rankSnapshot(row.tier, row.division, row.lp)));
  if (!best) return null;
  return { tier: best.tier, division: best.division, lp: best.lp };
}

function lobbyMmrFromGame(game, puuid) {
  if (!game || game.is_remake) return null;
  const others = [];
  for (const participant of game.participants || []) {
    const id = participant?.summoner?.puuid;
    if (puuid && id && id === puuid) continue;
    const mmr = mmrFromTierInfo(participant?.tier_info);
    if (mmr != null) others.push(mmr);
  }
  if (others.length >= 3) {
    return others.reduce((sum, n) => sum + n, 0) / others.length;
  }
  return mmrFromTierInfo(game.average_tier_info, { missingLp: 50 });
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`season-peak ${res.status}`);
  return res.json();
}

async function fetchLobbyMmrs({ region, puuid, flex = false }) {
  if (!puuid) return [];
  const gameType = flex ? 'FLEXRANKED' : 'SOLORANKED';
  const out = [];
  let endedAt = '';
  for (let page = 0; page < 3 && out.length < 12; page += 1) {
    const params = new URLSearchParams({ hl: 'en_US', game_type: gameType });
    if (endedAt) params.set('ended_at', endedAt);
    const json = await fetchJson(
      `https://lol-api-summoner.op.gg/api/v3/${region}/summoners/${encodeURIComponent(puuid)}/games?${params}`,
    );
    const games = Array.isArray(json?.data) ? json.data : [];
    if (!games.length) break;
    for (const game of games) {
      const mmr = lobbyMmrFromGame(game, puuid);
      if (mmr == null) continue;
      const at = Date.parse(game.created_at || '') || 0;
      out.push({ mmr, at });
    }
    endedAt = json?.meta?.last_game_created_at || games[games.length - 1]?.created_at || '';
    if (!endedAt || games.length < 2) break;
  }
  return out;
}

async function fetchOpggContext({ puuid, platform, flex = false, riotId } = {}) {
  const region = regionOf(platform);
  const urls = [];
  if (puuid) {
    urls.push(`https://lol-api-summoner.op.gg/api/v3/${region}/summoners/${encodeURIComponent(puuid)}?hl=en_US`);
  }
  if (riotId) {
    urls.push(`https://lol-api-summoner.op.gg/api/v3/${region}/summoners?riot_id=${encodeURIComponent(riotId)}&hl=en_US`);
  }

  for (const url of urls) {
    try {
      const json = await fetchJson(url);
      let profile = profileData(json);
      const found = profile?.puuid || puuidFrom(json, puuid);
      if ((!profile || !profile.current_season_high_tiers) && found) {
        const full = profileData(await fetchJson(
          `https://lol-api-summoner.op.gg/api/v3/${region}/summoners/${encodeURIComponent(found)}?hl=en_US`,
        ));
        if (full) profile = full;
      }
      if (!profile) continue;
      const peak = peakFromOpggJson({ data: profile }, flex);
      const id = profile.puuid || found;
      let lobbyMmrs = [];
      try {
        lobbyMmrs = await fetchLobbyMmrs({ region, puuid: id, flex });
      } catch { /* peak still useful */ }
      return { peak, lobbyMmrs, puuid: id };
    } catch { /* try next */ }
  }
  return { peak: null, lobbyMmrs: [], puuid: puuid || null };
}

const contextCache = new Map();
const CONTEXT_TTL_MS = 5 * 60 * 1000;

export async function loadOpggRankContext(args = {}) {
  const key = `${args.puuid || ''}:${args.riotId || ''}:${args.platform || ''}:${args.flex ? 'flex' : 'solo'}`;
  const hit = contextCache.get(key);
  if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.data;

  const http = await fetchOpggContext(args);
  let result = http;
  if (!http.peak && typeof window !== 'undefined' && window.riotAPI?.getSeasonPeak) {
    try {
      const row = await window.riotAPI.getSeasonPeak(args);
      if (row?.tier) result = { ...http, peak: row };
    } catch { /* ignore */ }
  }
  contextCache.set(key, { at: Date.now(), data: result });
  return result;
}

export async function loadSeasonPeak(args = {}) {
  const ctx = await loadOpggRankContext(args);
  return ctx?.peak || null;
}
