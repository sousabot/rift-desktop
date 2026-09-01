/** Per-game LP from U.GG match summaries. Riot match-v5 has no LP delta. */

const MATCH_QUERY = `query FetchMatchSummaries(
  $championId: [Int],
  $page: Int,
  $queueType: [Int],
  $regionId: String!,
  $role: [Int],
  $seasonIds: [Int]!,
  $riotUserName: String!,
  $riotTagLine: String!
) {
  fetchPlayerMatchSummaries(
    championId: $championId
    page: $page
    queueType: $queueType
    regionId: $regionId
    role: $role
    seasonIds: $seasonIds
    riotUserName: $riotUserName
    riotTagLine: $riotTagLine
  ) {
    matchSummaries {
      matchId
      matchCreationTime
      win
      queueType
      lpInfo {
        lp
        placement
      }
    }
  }
}`;

const cache = new Map();
const TTL_MS = 10 * 60 * 1000;
const SEASON_IDS = [27, 26, 25];
const MAX_LP_DELTA = 80;

function parseRiotId(riotId) {
  const raw = String(riotId || '').trim();
  const cut = raw.lastIndexOf('#');
  if (cut <= 0) return null;
  const gameName = raw.slice(0, cut).trim();
  const tagLine = raw.slice(cut + 1).trim();
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

function matchNumericId(matchId) {
  const s = String(matchId || '');
  const m = s.match(/_(\d+)$/);
  if (m) return m[1];
  return /^\d+$/.test(s) ? s : '';
}

async function postGraphql(body) {
  const res = await fetch('https://u.gg/api', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      origin: 'https://u.gg',
      referer: 'https://u.gg/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok || text.startsWith('<')) {
    const err = new Error(`ugg-lp ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

function collectLp(json, into) {
  const rows = json?.data?.fetchPlayerMatchSummaries?.matchSummaries;
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (const row of rows) {
    const id = row?.matchId != null ? String(row.matchId) : '';
    const delta = Number(row?.lpInfo?.lp);
    if (!id || !Number.isFinite(delta) || delta === 0 || Math.abs(delta) > MAX_LP_DELTA) continue;
    if (row?.lpInfo?.placement) continue;
    if (row?.win === true && delta < 0) continue;
    if (row?.win === false && delta > 0) continue;
    into[id] = Math.round(delta);
    n += 1;
  }
  return n;
}

async function fetchMatchLp({ riotId, platform, queue } = {}) {
  const ident = parseRiotId(riotId);
  if (!ident) return {};
  const regionId = String(platform || 'euw1').toLowerCase();
  const queueType = Number(queue) === 440 ? [440] : [420];
  const key = `${regionId}:${ident.gameName.toLowerCase()}#${ident.tagLine.toLowerCase()}:${queueType[0]}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const variables = {
    championId: [],
    page: 1,
    queueType,
    regionId,
    role: [],
    seasonIds: SEASON_IDS,
    riotUserName: ident.gameName.toLowerCase(),
    riotTagLine: ident.tagLine,
  };
  const out = {};
  try {
    for (let page = 1; page <= 2; page += 1) {
      const json = await postGraphql({
        operationName: 'FetchMatchSummaries',
        variables: { ...variables, page },
        query: MATCH_QUERY,
      });
      const added = collectLp(json, out);
      if (page === 1 && json?.errors?.length && !added) {
        const retry = await postGraphql({
          operationName: 'FetchMatchSummaries',
          variables: { ...variables, page: 1, riotUserName: ident.gameName },
          query: MATCH_QUERY,
        });
        collectLp(retry, out);
      }
      if (added < 8) break;
    }
  } catch {
    /* keep whatever we collected */
  }
  cache.set(key, { at: Date.now(), data: out });
  return out;
}

function applyLpDeltas(games, lpById) {
  const map = lpById && typeof lpById === 'object' ? lpById : {};
  if (!Object.keys(map).length) return games;
  return games.map((g) => {
    const nid = matchNumericId(g.matchId);
    const delta = Number(map[nid] ?? map[String(g.matchId)] ?? null);
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > MAX_LP_DELTA) return g;
    if (g.win === true && delta < 0) return g;
    if (g.win === false && delta > 0) return g;
    return { ...g, lpDelta: Math.round(delta) };
  });
}

module.exports = { fetchMatchLp, applyLpDeltas, matchNumericId };
