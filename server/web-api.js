/** Public web endpoints — no desktop Bearer token required. */

const PLATFORM_TO_MATCH_REGION = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia', oc1: 'asia',
  ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea',
};

const ALL_PLATFORMS = Object.keys(PLATFORM_TO_MATCH_REGION);
const LEADERBOARD_LIMIT = 50;
const LEAGUE_TTL_MS = 5 * 60 * 1000;
const ACCOUNT_TTL_MS = 30 * 60 * 1000;

const leagueCache = new Map();
const accountCache = new Map();
const enrichCache = new Map();

function accountHost(regionOrPlatform) {
  const value = String(regionOrPlatform || 'europe').toLowerCase();
  if (PLATFORM_TO_MATCH_REGION[value]) {
    const r = PLATFORM_TO_MATCH_REGION[value];
    if (r === 'americas') return 'americas';
    if (r === 'asia' || r === 'sea') return 'asia';
    return 'europe';
  }
  if (value === 'americas' || value === 'na' || value === 'na1') return 'americas';
  if (value === 'asia' || value === 'sea' || value === 'kr') return 'asia';
  return 'europe';
}

function matchRegionOf(platform) {
  return PLATFORM_TO_MATCH_REGION[String(platform || '').toLowerCase()] || 'europe';
}

function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

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

async function fetchAccountByRiotId(riotFetch, gameName, tagLine, regionHint) {
  const name = clip(gameName, 40);
  const tag = clip(tagLine, 20).replace(/^#/, '');
  if (!name || !tag) {
    const err = new Error('Enter Name and TAG (for example Name#EUW).');
    err.status = 400;
    throw err;
  }
  const cacheKey = `${name.toLowerCase()}#${tag.toLowerCase()}:${String(regionHint || '').toLowerCase()}`;
  const hit = accountCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ACCOUNT_TTL_MS) return hit.data;

  const preferred = accountHost(regionHint);
  const hosts = [preferred, 'europe', 'americas', 'asia'].filter((h, i, all) => all.indexOf(h) === i);
  let lastErr = null;
  for (const host of hosts) {
    try {
      const data = await riotFetch(
        `https://${host}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
      );
      accountCache.set(cacheKey, { at: Date.now(), data });
      return data;
    } catch (err) {
      lastErr = err;
      if (err.status && err.status !== 404) throw err;
    }
  }
  const err = lastErr || new Error('Could not find that Riot ID.');
  err.status = err.status || 404;
  throw err;
}

async function findLeagueShard(riotFetch, puuid, preferredPlatform) {
  const preferred = String(preferredPlatform || 'euw1').toLowerCase();
  const preferredOk = PLATFORM_TO_MATCH_REGION[preferred] ? preferred : 'euw1';
  const continent = PLATFORM_TO_MATCH_REGION[preferredOk];
  const sameRegion = ALL_PLATFORMS.filter((p) => PLATFORM_TO_MATCH_REGION[p] === continent && p !== preferredOk);
  const others = ALL_PLATFORMS.filter((p) => p !== preferredOk && PLATFORM_TO_MATCH_REGION[p] !== continent);
  const order = [preferredOk, ...sameRegion, ...others];
  for (const platform of order) {
    try {
      await riotFetch(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`);
      return platform;
    } catch {
      /* try next */
    }
  }
  return preferredOk;
}

async function lookupAccount(riotFetch, { gameName, tagLine, platform, region }) {
  const preferred = String(platform || '').toLowerCase() || 'euw1';
  const account = await fetchAccountByRiotId(riotFetch, gameName, tagLine, region || preferred);
  const shard = await findLeagueShard(riotFetch, account.puuid, preferred);
  let summoner = null;
  let ranked = [];
  try {
    summoner = await riotFetch(`https://${shard}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`);
  } catch { /* optional */ }
  try {
    ranked = await riotFetch(`https://${shard}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`);
  } catch { /* optional */ }
  const solo = (Array.isArray(ranked) ? ranked : []).find((e) => e.queueType === 'RANKED_SOLO_5x5') || null;
  return {
    gameName: account.gameName,
    tagLine: account.tagLine,
    puuid: account.puuid,
    platform: shard,
    region: matchRegionOf(shard),
    profileIconId: summoner?.profileIconId || 0,
    summonerLevel: summoner?.summonerLevel || null,
    ranked: solo ? {
      tier: solo.tier,
      rank: solo.rank,
      leaguePoints: solo.leaguePoints,
      wins: solo.wins,
      losses: solo.losses,
    } : null,
  };
}

async function loadLeagueEntries(riotFetch, tier, queue, platform) {
  const t = String(tier || 'challenger').toLowerCase();
  const q = queue || 'RANKED_SOLO_5x5';
  try {
    const page = await riotFetch(
      `https://${platform}.api.riotgames.com/lol/league-exp/v4/entries/${q}/${t.toUpperCase()}/I?page=1`
    );
    if (Array.isArray(page) && page.length) return page;
  } catch { /* fallback */ }
  const data = await riotFetch(
    `https://${platform}.api.riotgames.com/lol/league/v4/${t}leagues/by-queue/${q}`
  );
  return Array.isArray(data?.entries) ? data.entries : [];
}

async function getLeaderboard(riotFetch, { tier = 'challenger', platform = 'euw1' } = {}) {
  const t = String(tier || 'challenger').toLowerCase();
  const plat = String(platform || 'euw1').toLowerCase();
  const region = matchRegionOf(plat);
  const key = `${plat}:${t}`;
  const hit = leagueCache.get(key);
  if (hit && Date.now() - hit.at < LEAGUE_TTL_MS) return hit.data;

  const entries = await loadLeagueEntries(riotFetch, t, 'RANKED_SOLO_5x5', plat);
  const top = [...entries]
    .sort((a, b) => (b.leaguePoints || 0) - (a.leaguePoints || 0))
    .slice(0, LEADERBOARD_LIMIT);

  const enrichKey = `${key}:names`;
  let names = enrichCache.get(enrichKey);
  if (!names || Date.now() - names.at > LEAGUE_TTL_MS) {
    const accounts = await mapWithConcurrency(top, 5, async (row) => {
      if (!row.puuid) return null;
      try {
        return await riotFetch(`https://${region === 'sea' ? 'asia' : region}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${row.puuid}`);
      } catch {
        return null;
      }
    });
    const summoners = await mapWithConcurrency(top, 5, async (row) => {
      if (!row.puuid) return null;
      try {
        return await riotFetch(`https://${plat}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${row.puuid}`);
      } catch {
        return null;
      }
    });
    names = {
      at: Date.now(),
      accounts,
      summoners,
    };
    enrichCache.set(enrichKey, names);
  }

  const rows = top.map((e, i) => {
    const account = names.accounts[i];
    const summoner = names.summoners[i];
    return {
      rank: i + 1,
      puuid: e.puuid,
      gameName: account?.gameName || 'Unknown',
      tagLine: account?.tagLine || '',
      summonerName: account ? `${account.gameName}#${account.tagLine}` : (e.puuid || 'Unknown').slice(0, 8),
      profileIconId: summoner?.profileIconId || null,
      lp: e.leaguePoints || 0,
      wins: e.wins || 0,
      losses: e.losses || 0,
    };
  });

  const payload = { tier: t, platform: plat, region, builtAt: Date.now(), entries: rows };
  leagueCache.set(key, { at: Date.now(), data: payload });
  return payload;
}

function registerWebApi(router) {
  const { getTierList } = require('./tierlist');

  router.get('/v1/web/account', async (req, url, riotFetch) => {
    const gameName = url.searchParams.get('gameName') || url.searchParams.get('name') || '';
    const tagLine = url.searchParams.get('tagLine') || url.searchParams.get('tag') || '';
    const platform = url.searchParams.get('platform') || 'euw1';
    const region = url.searchParams.get('region') || '';
    return lookupAccount(riotFetch, { gameName, tagLine, platform, region });
  });

  router.get('/v1/web/tierlist', async (req, url) => {
    const platform = url.searchParams.get('platform') || 'euw1';
    const rank = url.searchParams.get('rank') || 'master';
    const force = url.searchParams.get('force') === '1';
    return getTierList({ platform, rank, force });
  });

  router.get('/v1/web/leaderboard', async (req, url, riotFetch) => {
    const tier = url.searchParams.get('tier') || 'challenger';
    const platform = url.searchParams.get('platform') || 'euw1';
    return getLeaderboard(riotFetch, { tier, platform });
  });

  router.get('/v1/web/champion', async (req, url) => {
    const champion = clip(url.searchParams.get('champion') || url.searchParams.get('name') || '', 40);
    const role = clip(url.searchParams.get('role') || 'Mid', 16) || 'Mid';
    const rank = clip(url.searchParams.get('rank') || 'master', 24) || 'master';
    const platform = clip(url.searchParams.get('platform') || 'euw1', 12) || 'euw1';
    if (!champion) {
      const err = new Error('Champion is required.');
      err.status = 400;
      throw err;
    }
    const { fetchChampionDetail } = require('../electron/champion-detail');
    const { fetchMetaBuilds } = require('../electron/meta-builds');
    const [detail, builds] = await Promise.all([
      fetchChampionDetail({ champion, role, rank, platform }),
      fetchMetaBuilds({ champion, role }).catch(() => null),
    ]);
    if (!detail?.ok) {
      const err = new Error(detail?.error || 'Could not load champion detail.');
      err.status = 502;
      throw err;
    }
    return {
      ...detail,
      builds: Array.isArray(builds?.builds) ? builds.builds : [],
      buildSource: builds?.source || null,
    };
  });

  const { getDashboard, getLiveGame, getMatchTimelineDetails } = require('./dashboard');

  router.get('/v1/web/dashboard', async (req, url, riotFetch) => {
    const gameName = url.searchParams.get('gameName') || url.searchParams.get('name') || '';
    const tagLine = url.searchParams.get('tagLine') || url.searchParams.get('tag') || '';
    const platform = url.searchParams.get('platform') || 'euw1';
    const region = url.searchParams.get('region') || '';
    const mode = url.searchParams.get('mode') || 'Solo';
    const queue = url.searchParams.get('queue');
    const count = url.searchParams.get('count') || '20';
    return getDashboard(riotFetch, {
      gameName, tagLine, platform, region, mode, queue, count,
    });
  });

  router.get('/v1/web/live', async (req, url, riotFetch) => {
    const gameName = url.searchParams.get('gameName') || url.searchParams.get('name') || '';
    const tagLine = url.searchParams.get('tagLine') || url.searchParams.get('tag') || '';
    const platform = url.searchParams.get('platform') || 'euw1';
    const region = url.searchParams.get('region') || '';
    return getLiveGame(riotFetch, { gameName, tagLine, platform, region });
  });

  router.get('/v1/web/match-timeline', async (req, url, riotFetch) => {
    const matchId = clip(url.searchParams.get('matchId') || '', 64);
    const region = clip(url.searchParams.get('region') || 'europe', 16) || 'europe';
    const puuid = clip(url.searchParams.get('puuid') || '', 128);
    return getMatchTimelineDetails(riotFetch, { matchId, region, puuid });
  });
}

module.exports = { registerWebApi, lookupAccount, getLeaderboard, matchRegionOf };
