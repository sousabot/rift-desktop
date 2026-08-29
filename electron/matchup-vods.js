/** Matchup VODs: scan seeded streamers' ranked games and attach Twitch archives. */

const fs = require('fs');
const path = require('path');
const idCache = require('./id-cache');
const matchCache = require('./match-cache');

const PLATFORM_TO_MATCH_REGION = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia', oc1: 'asia',
  ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea',
};

const ROLE_TO_POSITION = {
  top: 'TOP',
  jungle: 'JUNGLE',
  mid: 'MIDDLE',
  middle: 'MIDDLE',
  bot: 'BOTTOM',
  bottom: 'BOTTOM',
  adc: 'BOTTOM',
  support: 'UTILITY',
  utility: 'UTILITY',
};

const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const VOD_CACHE_TTL_MS = 30 * 60 * 1000;
const FAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MATCH_IDS_PER_STREAMER = 25;
const STREAMER_CONCURRENCY = 3;
const TARGET_RESULTS = 16;
const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

const searchCache = new Map();
const vodCache = new Map();
const puuidMem = new Map();
let helixToken = null;
let helixTokenAt = 0;

function loadSeed() {
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'matchup-streamers.json'), 'utf8'));
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        displayName: String(row.displayName || row.displayName || row.twitch || row.twitch || '').trim(),
        twitch: String(row.twitch || row.twitch || '').trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').split(/[/?#]/)[0],
        riotId: String(row.riotId || row.riotId || '').trim(),
        platform: String(row.platform || row.platform || 'euw1').toLowerCase(),
      }))
      .filter((row) => row.twitch && row.riotId);
  } catch (err) {
    console.warn('[matchup-vods] seed load failed:', err?.message || err);
    return [];
  }
}

function accountHost(platform) {
  const region = PLATFORM_TO_MATCH_REGION[String(platform || '').toLowerCase()] || 'europe';
  if (region === 'americas') return 'americas';
  if (region === 'asia' || region === 'sea') return 'asia';
  return 'europe';
}

function matchRegionOf(platform) {
  const region = PLATFORM_TO_MATCH_REGION[String(platform || '').toLowerCase()] || 'europe';
  return region === 'sea' ? 'sea' : region;
}

function splitRiotId(value) {
  const text = String(value || '').trim();
  const hash = text.lastIndexOf('#');
  if (hash < 1) return { gameName: text, tagLine: '' };
  return { gameName: text.slice(0, hash).trim(), tagLine: text.slice(hash + 1).trim() };
}

function normChamp(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function formatTwitchTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}h${m}m${r}s`;
}

function relativeAge(ms) {
  const diff = Math.max(0, Date.now() - Number(ms || 0));
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function patchOf(version) {
  const m = String(version || '').match(/^(\d+\.\d+)/);
  return m ? m[1] : '';
}

function platformLabel(platformId) {
  return String(platformId || '')
    .toUpperCase()
    .replace(/1$/, '')
    .replace('EUN', 'EUNE') || '';
}

function roleLabel(position) {
  const p = String(position || '').toUpperCase();
  if (p === 'TOP') return 'Top';
  if (p === 'JUNGLE') return 'Jungle';
  if (p === 'MIDDLE') return 'Mid';
  if (p === 'BOTTOM') return 'Bot';
  if (p === 'UTILITY') return 'Support';
  return '';
}

function gameDurationMs(info) {
  const raw = Number(info?.gameDuration) || 0;
  return raw > 100000 ? raw : raw * 1000;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        console.warn('[matchup-vods] worker failed:', err?.message || err);
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () => worker()));
  return results;
}

async function resolveStreamer(streamer, riotFetch) {
  const key = `mu-puuid:${streamer.platform}:${streamer.riotId}`.toLowerCase();
  if (puuidMem.has(key)) return puuidMem.get(key);

  const disk = idCache.readCache();
  const hit = disk[key];
  if (hit?.puuid) {
    puuidMem.set(key, hit);
    return hit;
  }
  if (hit?.ok === false && Date.now() - (hit.at || 0) < FAIL_CACHE_TTL_MS) {
    puuidMem.set(key, hit);
    return hit;
  }

  const { gameName, tagLine } = splitRiotId(streamer.riotId);
  if (!gameName || !tagLine) {
    const miss = { ok: false, at: Date.now() };
    puuidMem.set(key, miss);
    return miss;
  }

  try {
    const host = accountHost(streamer.platform);
    const account = await riotFetch(
      `https://${host}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    );
    const packed = {
      ok: true,
      puuid: account.puuid,
      gameName: account.gameName || gameName,
      tagLine: account.tagLine || tagLine,
      platform: streamer.platform,
      region: matchRegionOf(streamer.platform),
      displayName: streamer.displayName,
      twitch: streamer.twitch,
      riotId: `${account.gameName || gameName}#${account.tagLine || tagLine}`,
    };
    puuidMem.set(key, packed);
    disk[key] = packed;
    idCache.writeCache(disk);
    return packed;
  } catch (err) {
    const miss = { ok: false, at: Date.now(), error: err?.message || 'resolve failed' };
    puuidMem.set(key, miss);
    disk[key] = miss;
    idCache.writeCache(disk);
    return miss;
  }
}

async function helixAppToken() {
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  const secret = String(process.env.TWITCH_CLIENT_SECRET || '').trim();
  if (!clientId || !secret) return null;
  if (helixToken && Date.now() - helixTokenAt < 50 * 60 * 1000) {
    return { token: helixToken, clientId };
  }
  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', secret);
  url.searchParams.set('grant_type', 'client_credentials');
  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const json = await res.json();
  helixToken = json.access_token;
  helixTokenAt = Date.now();
  return { token: helixToken, clientId };
}

function parseHelixDuration(raw) {
  const text = String(raw || '');
  const h = Number((text.match(/(\d+)h/) || [])[1] || 0);
  const m = Number((text.match(/(\d+)m/) || [])[1] || 0);
  const s = Number((text.match(/(\d+)s/) || [])[1] || 0);
  return h * 3600 + m * 60 + s;
}

async function fetchVodsHelix(login, auth) {
  const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
    headers: { 'Client-ID': auth.clientId, Authorization: `Bearer ${auth.token}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!userRes.ok) return [];
  const userJson = await userRes.json();
  const userId = userJson?.data?.[0]?.id;
  if (!userId) return [];
  const vodRes = await fetch(
    `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=50`,
    {
      headers: { 'Client-ID': auth.clientId, Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(12000),
    }
  );
  if (!vodRes.ok) return [];
  const vodJson = await vodRes.json();
  return (vodJson.data || []).map((row) => ({
    id: String(row.id),
    title: row.title || '',
    createdAt: Date.parse(row.created_at),
    lengthSeconds: parseHelixDuration(row.duration),
    preview: String(row.thumbnail_url || '').replace('%{width}', '440').replace('%{height}', '248'),
  })).filter((row) => row.id && Number.isFinite(row.createdAt) && row.lengthSeconds > 0);
}

async function fetchVodsGql(login) {
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim() || TWITCH_WEB_CLIENT_ID;
  const res = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': clientId, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($login: String!) {
        user(login: $login) {
          videos(first: 50, type: ARCHIVE, sort: TIME) {
            edges {
              node {
                id
                title
                createdAt
                lengthSeconds
                previewThumbnailURL(width: 440, height: 248)
              }
            }
          }
        }
      }`,
      variables: { login },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  const edges = json?.data?.user?.videos?.edges || [];
  return edges.map((edge) => {
    const node = edge?.node || {};
    return {
      id: String(node.id || '').replace(/^v/i, ''),
      title: node.title || '',
      createdAt: Date.parse(node.createdAt),
      lengthSeconds: Number(node.lengthSeconds) || 0,
      preview: node.previewThumbnailURL || '',
    };
  }).filter((row) => row.id && Number.isFinite(row.createdAt) && row.lengthSeconds > 0);
}

async function listVods(login) {
  const key = String(login || '').toLowerCase();
  const hit = vodCache.get(key);
  if (hit && Date.now() - hit.at < VOD_CACHE_TTL_MS) return hit.rows;

  let rows = [];
  try {
    const auth = await helixAppToken();
    if (auth) rows = await fetchVodsHelix(login, auth);
  } catch (err) {
    console.warn('[matchup-vods] helix vods failed:', err?.message || err);
  }
  if (!rows.length) {
    try {
      rows = await fetchVodsGql(login);
    } catch (err) {
      console.warn('[matchup-vods] gql vods failed:', err?.message || err);
    }
  }
  vodCache.set(key, { at: Date.now(), rows });
  return rows;
}

function matchVodToGame(vods, gameStartMs, gameEndMs) {
  const start = Number(gameStartMs) || 0;
  const end = Number(gameEndMs) || start;
  if (!start) return null;
  const slackMs = 8 * 60 * 1000;
  let best = null;
  for (const vod of vods) {
    const vodStart = vod.createdAt;
    const vodEnd = vodStart + vod.lengthSeconds * 1000;
    if (start < vodStart - slackMs || start > vodEnd + slackMs) continue;
    const offsetSec = Math.max(0, Math.floor((start - vodStart) / 1000));
    const overlap = Math.min(end, vodEnd) - Math.max(start, vodStart);
    const packed = {
      id: vod.id,
      provider: 'twitch',
      title: vod.title,
      preview: vod.preview,
      offsetSec,
      offsetLabel: formatTwitchTime(offsetSec),
      url: `https://www.twitch.tv/videos/${vod.id}?t=${formatTwitchTime(offsetSec)}`,
      embedUrl: `https://player.twitch.tv/?video=${vod.id}&parent=localhost&parent=127.0.0.1&autoplay=true&time=${formatTwitchTime(offsetSec)}`,
      endOffsetSec: Math.max(offsetSec, Math.floor((end - vodStart) / 1000)),
      overlap,
    };
    if (!best || overlap > best.overlap) best = packed;
  }
  return best;
}

function extractMatchup(match, puuid, champion, opponent, rolePos) {
  const info = match?.info;
  if (!info) return null;
  const parts = Array.isArray(info.participants) ? info.participants : [];
  const me = parts.find((p) => p.puuid === puuid);
  if (!me) return null;
  if (champion && normChamp(me.championName) !== normChamp(champion)) return null;
  if (rolePos && String(me.teamPosition || '').toUpperCase() !== rolePos) return null;

  const enemies = parts.filter((p) => p.teamId !== me.teamId);
  let foe = null;
  if (opponent) {
    const wanted = normChamp(opponent);
    foe = enemies.find((p) => (
      normChamp(p.championName) === wanted
      && (!rolePos || String(p.teamPosition || '').toUpperCase() === rolePos)
    )) || enemies.find((p) => normChamp(p.championName) === wanted);
    if (!foe) return null;
  } else {
    foe = enemies.find((p) => String(p.teamPosition || '') === String(me.teamPosition || ''))
      || enemies[0]
      || null;
  }

  const gameStart = Number(info.gameStartTimestamp || info.gameCreation) || 0;
  const durationMs = gameDurationMs(info);
  const gameEnd = Number(info.gameEndTimestamp) || (gameStart + durationMs);

  return {
    matchId: match.metadata?.matchId || '',
    gameCreation: gameStart,
    gameEnd,
    gameDuration: Math.round(durationMs / 1000),
    gameVersion: info.gameVersion || '',
    patch: patchOf(info.gameVersion),
    queueId: info.queueId,
    platformId: info.platformId || '',
    platform: platformLabel(info.platformId),
    win: !!me.win,
    champion: me.championName,
    opponent: foe?.championName || '',
    lane: roleLabel(me.teamPosition),
    teamPosition: me.teamPosition || '',
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6].filter((id) => id > 0),
    summoner1Id: me.summoner1Id,
    summoner2Id: me.summoner2Id,
    primaryRuneId: me.perks?.styles?.[0]?.selections?.[0]?.perk || 0,
    age: relativeAge(gameStart),
  };
}

async function fetchMatchIds(riotFetch, resolved) {
  const cache = idCache.readCache();
  const key = `muids:${resolved.region}:${resolved.puuid}`;
  const hit = cache[key];
  if (hit?.data && Date.now() - hit.timestamp < 12 * 60 * 1000 && Array.isArray(hit.data) && hit.data.length) {
    return hit.data;
  }
  try {
    const ids = await riotFetch(
      `https://${resolved.region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${resolved.puuid}/ids?start=0&count=${MATCH_IDS_PER_STREAMER}&queue=420`
    );
    const list = Array.isArray(ids) ? ids : [];
    if (list.length) {
      cache[key] = { timestamp: Date.now(), data: list };
      idCache.writeCache(cache);
    }
    return list;
  } catch {
    return [];
  }
}

async function fetchMatches(riotFetch, region, matchIds) {
  const cache = matchCache.readCache();
  const now = Date.now();
  const out = [];
  const missing = [];
  matchIds.forEach((id) => {
    const key = `match:${id}`;
    const hit = cache[key];
    if (hit?.data) out.push(hit.data);
    else missing.push(id);
  });
  if (missing.length) {
    const fetched = await mapWithConcurrency(missing, 4, async (id) => {
      try {
        const data = await riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`);
        cache[`match:${id}`] = { timestamp: now, data };
        return data;
      } catch {
        return null;
      }
    });
    matchCache.writeCache(cache);
    fetched.filter(Boolean).forEach((row) => out.push(row));
  }
  return out;
}

function packResult(hit, streamer, video, exact) {
  return {
    ...hit,
    exact,
    streamer: {
      displayName: streamer.displayName,
      twitch: streamer.twitch,
      riotId: streamer.riotId,
      platform: streamer.platform,
    },
    video: video ? {
      id: video.id,
      provider: video.provider,
      title: video.title,
      preview: video.preview,
      offsetSec: video.offsetSec,
      offsetLabel: video.offsetLabel,
      url: video.url,
      embedUrl: video.embedUrl,
    } : null,
    channelUrl: `https://www.twitch.tv/${streamer.twitch}`,
  };
}

async function collectForQuery(resolved, riotFetch, { champion, opponent, rolePos, limit, exact }) {
  const results = [];
  const stats = { scanned: 0, games: 0, withVod: 0 };

  await mapWithConcurrency(resolved, STREAMER_CONCURRENCY, async (streamer) => {
    if (results.length >= limit) return;
    stats.scanned += 1;
    const ids = await fetchMatchIds(riotFetch, streamer);
    if (!ids.length) return;
    const matches = await fetchMatches(riotFetch, streamer.region, ids);
    const hits = [];
    for (const match of matches) {
      const row = extractMatchup(match, streamer.puuid, champion, opponent, rolePos);
      if (row) hits.push(row);
    }
    if (!hits.length) return;
    stats.games += hits.length;

    let vods = [];
    try {
      vods = await listVods(streamer.twitch);
    } catch {
      vods = [];
    }

    for (const hit of hits) {
      if (results.length >= limit) break;
      const video = matchVodToGame(vods, hit.gameCreation, hit.gameEnd);
      if (video) stats.withVod += 1;
      results.push(packResult(hit, streamer, video, exact));
    }
  });

  results.sort((a, b) => {
    if (!!b.video !== !!a.video) return a.video ? -1 : 1;
    return (b.gameCreation || 0) - (a.gameCreation || 0);
  });
  return { results: results.slice(0, limit), stats };
}

async function searchMatchups({ champion, opponent = '', role = '', limit = TARGET_RESULTS } = {}, riotFetch) {
  const champ = String(champion || '').trim();
  if (!champ) throw new Error('Pick a champion to search matchups.');
  const opp = String(opponent || '').trim();
  const rolePos = ROLE_TO_POSITION[String(role || '').toLowerCase()] || '';
  const cap = Math.min(24, Math.max(6, Number(limit) || TARGET_RESULTS));
  const cacheKey = `${normChamp(champ)}|${normChamp(opp)}|${rolePos}|${cap}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return { ...cached.payload, cached: true };
  }

  const seed = loadSeed();
  const resolved = (await mapWithConcurrency(seed, 4, (row) => resolveStreamer(row, riotFetch)))
    .filter((row) => row?.ok && row.puuid);

  const exact = await collectForQuery(resolved, riotFetch, {
    champion: champ,
    opponent: opp,
    rolePos,
    limit: cap,
    exact: true,
  });

  let fallback = { results: [], stats: { scanned: 0, games: 0, withVod: 0 } };
  let broadened = false;
  if (!exact.results.length && opp) {
    broadened = true;
    fallback = await collectForQuery(resolved, riotFetch, {
      champion: champ,
      opponent: '',
      rolePos,
      limit: cap,
      exact: false,
    });
  }

  const matches = exact.results.length ? exact.results : fallback.results;
  const stats = exact.results.length ? exact.stats : fallback.stats;
  const payload = {
    champion: champ,
    opponent: opp,
    role: rolePos ? roleLabel(rolePos) : '',
    matches,
    broadened,
    meta: {
      streamers: resolved.length,
      seedSize: seed.length,
      scanned: stats.scanned,
      games: stats.games,
      withVod: stats.withVod,
    },
  };
  searchCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

function register(ipcMain, { riotFetch }) {
  ipcMain.handle('matchups:search', async (_e, args = {}) => {
    try {
      return await searchMatchups(args || {}, riotFetch);
    } catch (err) {
      return {
        champion: args?.champion || '',
        opponent: args?.opponent || '',
        matches: [],
        error: err?.message || 'Matchup search failed',
        meta: { streamers: 0, scanned: 0, withVod: 0, games: 0, seedSize: loadSeed().length },
      };
    }
  });

  ipcMain.handle('matchups:streamers', async () => {
    const seed = loadSeed();
    return {
      count: seed.length,
      streamers: seed.map((row) => ({
        displayName: row.displayName,
        twitch: row.twitch,
        platform: row.platform,
      })),
    };
  });
}

module.exports = { register, searchMatchups, loadSeed };
