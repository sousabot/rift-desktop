/** Public web endpoints — no desktop Bearer token required. */

const PLATFORM_TO_MATCH_REGION = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia', oc1: 'asia',
  ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea',
};

const ALL_PLATFORMS = Object.keys(PLATFORM_TO_MATCH_REGION);
const LEADERBOARD_LIMIT = 50;
const LEAGUE_TTL_MS = 10 * 60 * 1000;
const ACCOUNT_TTL_MS = 30 * 60 * 1000;
const ICON_ENRICH_LIMIT = 8;

const leagueCache = new Map();
const leagueInflight = new Map();
const accountCache = new Map();
const identityCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRiot(err) {
  const status = Number(err?.status) || 0;
  return status === 429 || status === 503 || status === 502;
}

async function riotRetry(riotFetch, url, attempts = 4) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await riotFetch(url);
    } catch (err) {
      lastErr = err;
      if (!isRetryableRiot(err) || i === attempts - 1) throw err;
      await sleep(900 * (i + 1) + Math.floor(Math.random() * 200));
    }
  }
  throw lastErr;
}

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
  const apex = t === 'challenger' || t === 'grandmaster' || t === 'master';
  // Personal keys often cannot call league-exp. Apex ladders have a dedicated endpoint — use that first.
  if (apex) {
    const data = await riotFetch(
      `https://${platform}.api.riotgames.com/lol/league/v4/${t}leagues/by-queue/${q}`
    );
    return Array.isArray(data?.entries) ? data.entries : [];
  }
  const page = await riotFetch(
    `https://${platform}.api.riotgames.com/lol/league-exp/v4/entries/${q}/${t.toUpperCase()}/I?page=1`
  );
  return Array.isArray(page) ? page : [];
}

async function getLeaderboard(riotFetch, {
  tier = 'challenger',
  platform = 'euw1',
  queue = 'soloq',
} = {}) {
  const t = String(tier || 'challenger').toLowerCase();
  const plat = String(platform || 'euw1').toLowerCase();
  const region = matchRegionOf(plat);
  const qKey = String(queue || 'soloq').toLowerCase();
  const riotQueue = qKey === 'flex' ? 'RANKED_FLEX_SR' : 'RANKED_SOLO_5x5';
  const key = `${plat}:${t}:${riotQueue}`;
  const hit = leagueCache.get(key);
  if (hit && Date.now() - hit.at < (hit.ttl || LEAGUE_TTL_MS)) return hit.data;
  if (leagueInflight.has(key)) return leagueInflight.get(key);

  const work = buildLeaderboard(riotFetch, {
    t, plat, region, qKey, riotQueue, key, stale: hit?.data,
  }).finally(() => leagueInflight.delete(key));
  leagueInflight.set(key, work);
  return work;
}

async function buildLeaderboard(riotFetch, {
  t, plat, region, qKey, riotQueue, key, stale,
}) {
  try {
    const entries = await loadLeagueEntries(riotFetch, t, riotQueue, plat);
    const ladder = [...entries].sort((a, b) => (b.leaguePoints || 0) - (a.leaguePoints || 0));
    const top = ladder.slice(0, LEADERBOARD_LIMIT);
    const accountHost = region === 'sea' ? 'asia' : region;

    const identities = top.map((row) => {
      if (!row.puuid) return { gameName: null, tagLine: '', profileIconId: null };
      const cached = identityCache.get(row.puuid);
      if (cached && Date.now() - cached.at < ACCOUNT_TTL_MS) return { ...cached };
      if (row.riotIdGameName) {
        return {
          gameName: row.riotIdGameName,
          tagLine: row.riotIdTagline || '',
          profileIconId: null,
        };
      }
      return { gameName: null, tagLine: '', profileIconId: null };
    });

    await mapWithConcurrency(top, 4, async (row, i) => {
      if (!row.puuid || identities[i].gameName) return;
      try {
        const account = await riotRetry(
          riotFetch,
          `https://${accountHost}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${row.puuid}`
        );
        identities[i].gameName = account?.gameName || null;
        identities[i].tagLine = account?.tagLine || '';
      } catch { /* leave unknown; retry next refresh */ }
    });

    await mapWithConcurrency(top.slice(0, ICON_ENRICH_LIMIT), 3, async (row, i) => {
      if (!row.puuid || identities[i].profileIconId) return;
      try {
        const summoner = await riotRetry(
          riotFetch,
          `https://${plat}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${row.puuid}`
        );
        identities[i].profileIconId = summoner?.profileIconId || null;
      } catch { /* icon is optional */ }
    });

    identities.forEach((id, i) => {
      if (!id.gameName || !top[i]?.puuid) return;
      identityCache.set(top[i].puuid, { ...id, at: Date.now() });
    });

    const rows = top.map((e, i) => {
      const id = identities[i] || {};
      return {
        rank: i + 1,
        puuid: e.puuid,
        gameName: id.gameName || e.riotIdGameName || e.summonerName || 'Unknown',
        tagLine: id.tagLine || e.riotIdTagline || '',
        summonerName: id.gameName
          ? `${id.gameName}#${id.tagLine}`
          : (e.puuid || 'Unknown').slice(0, 8),
        profileIconId: id.profileIconId || null,
        lp: e.leaguePoints || 0,
        wins: e.wins || 0,
        losses: e.losses || 0,
        hotStreak: !!e.hotStreak,
        veteran: !!e.veteran,
        freshBlood: !!e.freshBlood,
        inactive: !!e.inactive,
      };
    });

    const unknown = rows.filter((r) => r.gameName === 'Unknown').length;
    const payload = {
      tier: t,
      mode: qKey === 'flex' ? 'flex' : 'soloq',
      queue: riotQueue,
      platform: plat,
      region,
      builtAt: Date.now(),
      limit: LEADERBOARD_LIMIT,
      totalEntries: ladder.length,
      cutoffLp: ladder.length ? (ladder[ladder.length - 1].leaguePoints || 0) : null,
      entries: rows,
    };
    leagueCache.set(key, {
      at: Date.now(),
      data: payload,
      ttl: unknown > 10 ? 90 * 1000 : LEAGUE_TTL_MS,
    });
    return payload;
  } catch (err) {
    if (stale?.entries?.length) return { ...stale, stale: true };
    throw err;
  }
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
    const timeframe = url.searchParams.get('timeframe') || undefined;
    const force = url.searchParams.get('force') === '1';
    return getTierList({ platform, rank, timeframe, force });
  });

  router.get('/v1/web/leaderboard', async (req, url, riotFetch) => {
    const tier = url.searchParams.get('tier') || 'challenger';
    const platform = url.searchParams.get('platform') || 'euw1';
    const mode = String(url.searchParams.get('mode') || url.searchParams.get('queue') || 'soloq').toLowerCase();
    if (mode === 'aram') {
      return {
        mode: 'aram',
        tier,
        platform,
        ok: false,
        roadmap: true,
        error: 'ARAM player ladder is on the roadmap. Champion grades are live on the ARAM tier list.',
        entries: [],
      };
    }
    const queue = mode === 'flex' ? 'flex' : 'soloq';
    return getLeaderboard(riotFetch, { tier, platform, queue });
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

  const { getDashboard, getLiveGame, getMatchTimelineDetails, getCareerSidebar } = require('./dashboard');
  const { getStudioMeta } = require('./studio');
  const { listPros, getPro, lookupPro } = require('./pros');
  const { getSynergy } = require('./synergy');
  const { getArena } = require('./arena');
  const { getAram } = require('./aram');
  const { getOtps } = require('./otps');

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

  router.get('/v1/web/career-sidebar', async (req, url, riotFetch) => {
    const gameName = url.searchParams.get('gameName') || url.searchParams.get('name') || '';
    const tagLine = url.searchParams.get('tagLine') || url.searchParams.get('tag') || '';
    const platform = url.searchParams.get('platform') || 'euw1';
    const region = url.searchParams.get('region') || '';
    return getCareerSidebar(riotFetch, { gameName, tagLine, platform, region });
  });

  router.get('/v1/web/live', async (req, url, riotFetch) => {
    const gameName = url.searchParams.get('gameName') || url.searchParams.get('name') || '';
    const tagLine = url.searchParams.get('tagLine') || url.searchParams.get('tag') || '';
    const platform = url.searchParams.get('platform') || 'euw1';
    const region = url.searchParams.get('region') || '';
    return getLiveGame(riotFetch, { gameName, tagLine, platform, region });
  });

  router.get('/v1/web/match-lp', async (req, url) => {
    const gameName = clip(url.searchParams.get('gameName') || url.searchParams.get('name') || '', 40);
    const tagLine = clip(url.searchParams.get('tagLine') || url.searchParams.get('tag') || '', 16);
    const platform = clip(url.searchParams.get('platform') || 'euw1', 12) || 'euw1';
    const queue = Number(url.searchParams.get('queue') || 420);
    if (!gameName || !tagLine) {
      const err = new Error('Name#TAG is required.');
      err.status = 400;
      throw err;
    }
    const { fetchMatchLp } = require('./ugg-lp');
    const lp = await fetchMatchLp({
      riotId: `${gameName}#${tagLine}`,
      platform,
      queue: queue === 440 ? 440 : 420,
    });
    return { ok: true, lp };
  });

  router.get('/v1/web/match-timeline', async (req, url, riotFetch) => {
    const matchId = clip(url.searchParams.get('matchId') || '', 64);
    const region = clip(url.searchParams.get('region') || 'europe', 16) || 'europe';
    const puuid = clip(url.searchParams.get('puuid') || '', 128);
    return getMatchTimelineDetails(riotFetch, { matchId, region, puuid });
  });

  router.get('/v1/web/studio', async (req, url) => {
    const view = clip(url.searchParams.get('view') || 'home', 40) || 'home';
    const platform = clip(url.searchParams.get('platform') || 'euw1', 12) || 'euw1';
    const queue = url.searchParams.get('queue') || '420';
    const role = clip(url.searchParams.get('role') || '', 24);
    const tier = clip(url.searchParams.get('tier') || 'emerald_plus', 32) || 'emerald_plus';
    const timeframe = clip(url.searchParams.get('timeframe') || '30days', 24) || '30days';
    const dimension = clip(url.searchParams.get('dimension') || 'champion', 24) || 'champion';
    return getStudioMeta({
      view,
      platform,
      queue,
      role,
      tier,
      timeframe,
      dimension,
    });
  });

  router.get('/v1/web/pros', async (req, url) => {
    const country = clip(url.searchParams.get('country') || '', 8);
    const lane = clip(url.searchParams.get('lane') || '', 24);
    const league = clip(url.searchParams.get('league') || '', 64);
    const query = clip(url.searchParams.get('query') || '', 80);
    return listPros({ country, lane, league, query });
  });

  router.get('/v1/web/pros/player', async (req, url) => {
    const slug = clip(url.searchParams.get('slug') || url.searchParams.get('p') || '', 80);
    return getPro(slug);
  });

  router.get('/v1/web/pros/lookup', async (req, url) => {
    const riotId = clip(url.searchParams.get('riotId') || '', 80);
    return lookupPro(riotId);
  });

  router.get('/v1/web/synergy', async (req, url) => {
    const platform = clip(url.searchParams.get('platform') || 'euw1', 12) || 'euw1';
    const rank = clip(url.searchParams.get('rank') || 'master', 32) || 'master';
    const role1 = clip(url.searchParams.get('role1') || 'ADC', 24) || 'ADC';
    const role2 = clip(url.searchParams.get('role2') || 'Support', 24) || 'Support';
    const duoType = clip(url.searchParams.get('duoType') || '', 40);
    const timeframe = clip(url.searchParams.get('timeframe') || '30days', 24) || '30days';
    const minRaw = url.searchParams.get('minGames');
    const minGames = minRaw != null && minRaw !== '' ? Number(minRaw) : undefined;
    return getSynergy({
      platform,
      rank,
      role1,
      role2,
      duoType,
      timeframe,
      minGames,
    });
  });

  router.get('/v1/web/arena', async (req, url) => {
    const platform = clip(url.searchParams.get('platform') || 'euw1', 12) || 'euw1';
    const rank = clip(url.searchParams.get('rank') || 'emerald_plus', 32) || 'emerald_plus';
    const region = clip(url.searchParams.get('region') || 'all', 16) || 'all';
    return getArena({ platform, rank, region });
  });

  router.get('/v1/web/aram', async (req, url) => {
    const platform = clip(url.searchParams.get('platform') || 'euw1', 12) || 'euw1';
    const rank = clip(url.searchParams.get('rank') || 'emerald_plus', 32) || 'emerald_plus';
    const region = clip(url.searchParams.get('region') || 'all', 16) || 'all';
    return getAram({ platform, rank, region });
  });

  router.get('/v1/web/otps', async (req, url) => {
    const platform = clip(url.searchParams.get('platform') || 'all', 12) || 'all';
    const lane = clip(url.searchParams.get('lane') || 'all', 16) || 'all';
    const page = Number(url.searchParams.get('page') || 1) || 1;
    const allPages = url.searchParams.get('all') === '1' || url.searchParams.get('all') === 'true';
    return getOtps({ platform, lane, page, allPages });
  });

  const { getScouting } = require('./scouting');
  router.get('/v1/web/scouting', async (req, url, riotFetch) => {
    const platform = clip(url.searchParams.get('platform') || 'euw1', 12) || 'euw1';
    const lane = clip(url.searchParams.get('lane') || 'all', 16) || 'all';
    const minLp = Number(url.searchParams.get('minLp') || url.searchParams.get('lp') || 500);
    const maxRaw = url.searchParams.get('maxLp');
    const maxLp = maxRaw == null || maxRaw === '' ? null : Number(maxRaw);
    const sort = clip(url.searchParams.get('sort') || 'kda', 32) || 'kda';
    const dir = clip(url.searchParams.get('dir') || 'desc', 8) || 'desc';
    const q = clip(url.searchParams.get('q') || '', 64);
    const limit = Number(url.searchParams.get('limit') || 250) || 250;
    return getScouting({ platform, lane, minLp, maxLp, sort, dir, q, limit, riotFetch });
  });

  const premium = require('./premium');
  router.get('/v1/web/premium/checkout', async (req, url) => {
    const plan = clip(url.searchParams.get('plan') || 'six', 12) || 'six';
    const deviceId = clip(url.searchParams.get('deviceId') || `web-${Date.now()}`, 200);
    const riotId = clip(url.searchParams.get('riotId') || '', 80);
    return premium.createCheckoutSession({ plan, deviceId, riotId }, req);
  });
}

module.exports = { registerWebApi, lookupAccount, getLeaderboard, matchRegionOf };
