const BASE = 'https://api.lolpros.gg';
const TTL_MS = 30 * 60 * 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 6;

const POSITION = {
  Top: '10_top',
  Jungle: '20_jungle',
  Mid: '30_mid',
  ADC: '40_adc',
  Support: '50_support',
};

const QUEUE = {
  BR: 'br1', EUNE: 'eun1', EUW: 'euw1', JP: 'jp1', KR: 'kr',
  LAN: 'la1', LAS: 'la2', NA: 'na1', OCE: 'oc1', TR: 'tr1', RU: 'ru',
  PH: 'ph2', SG: 'sg2', TH: 'th2', TW: 'tw2', VN: 'vn2', ME: 'me1',
};

const cache = {
  countries: { at: 0, list: [] },
  leagues: { at: 0, list: [] },
  ladder: new Map(),
  profiles: new Map(),
  byRiot: new Map(),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsUrl(value) {
  return String(value || '').replace(/^http:\/\//i, 'https://');
}

function laneOf(position) {
  const r = String(position || '').toLowerCase();
  if (r.includes('jung')) return 'Jungle';
  if (r.includes('mid')) return 'Mid';
  if (r.includes('sup')) return 'Support';
  if (r.includes('adc') || r.includes('bot')) return 'ADC';
  if (r.includes('top')) return 'Top';
  return '';
}

function parseTier(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const named = s.match(/_([a-z]+)$/i);
  return (named ? named[1] : s.replace(/^\d+_/, '')).toUpperCase();
}

function dayOf(value) {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

function seasonLabel(id) {
  const n = String(id || '').replace(/^season_/i, '');
  if (!n) return '';
  const year = { 15: '2025', 16: '2026' }[n];
  return `Season ${year || n}`;
}

function numOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function packRank(entry) {
  if (!entry || (!entry.tier && entry.league_points == null)) return null;
  const tier = parseTier(entry.tier);
  if (!tier) return null;
  const wins = numOrNull(entry.wins);
  const losses = numOrNull(entry.losses);
  const games = numOrNull(entry.games) ?? (wins != null && losses != null ? wins + losses : null);
  let winrate = numOrNull(entry.winrate);
  if (winrate == null && wins != null && losses != null) {
    winrate = Math.round((wins / Math.max(1, wins + losses)) * 1000) / 10;
  }
  return {
    tier,
    division: Number(entry.division) || 0,
    leaguePoints: numOrNull(entry.league_points),
    wins,
    losses,
    games,
    winrate,
    at: dayOf(entry.created_at),
  };
}

function splitRiotId(value) {
  const text = String(value || '').trim();
  const hash = text.lastIndexOf('#');
  if (hash < 1) return { riotId: text, gameName: text, tagLine: '' };
  return {
    riotId: text,
    gameName: text.slice(0, hash).trim(),
    tagLine: text.slice(hash + 1).trim(),
  };
}

function packAccount(acc) {
  if (!acc) return null;
  const server = String(acc.server || '').toUpperCase();
  const raw = acc.gamename && acc.tagline
    ? `${acc.gamename}#${acc.tagline}`
    : (acc.summoner_name || '');
  const ids = splitRiotId(raw);
  if (!ids.riotId) return null;
  return {
    riotId: ids.riotId,
    gameName: ids.gameName,
    tagLine: ids.tagLine,
    region: server,
    platform: QUEUE[server] || '',
    iconId: Number(acc.profile_icon_id) || 0,
    rank: packRank(acc.rank || acc),
    peak: packRank(acc.peak),
  };
}

function packLadderRow(row) {
  const slug = String(row?.slug || '').trim();
  const name = String(row?.name || '').trim();
  if (!slug && !name) return null;
  const team = row.team || {};
  const league = Array.isArray(row.leagues) && row.leagues[0] ? row.leagues[0] : null;
  const account = packAccount(row.account);
  return {
    slug: slug || name.toLowerCase(),
    player: name || slug,
    country: String(row.country || '').toUpperCase(),
    role: String(row.position || ''),
    lane: laneOf(row.position),
    team: String(team.name || '').trim(),
    short: String(team.tag || team.name || '').trim(),
    logo: httpsUrl(team.logo?.url),
    league: String(league?.shorthand || league?.name || '').trim(),
    leagueSlug: String(league?.slug || '').trim(),
    score: Number(row.score) || 0,
    games: Number(row.total_games || row.account?.games) || null,
    rank: packRank(row.account),
    riotId: account?.riotId || '',
  };
}

function packMemberRow(member, team, leagueShort) {
  const slug = String(member?.slug || '').trim();
  const name = String(member?.name || '').trim();
  if (!slug && !name) return null;
  const rank = packRank({
    tier: member.tier,
    division: member.division,
    league_points: member.league_points,
    wins: member.wins,
    losses: member.losses,
    games: member.games,
    winrate: member.winrate,
  });
  const ids = splitRiotId(member.summoner_name || '');
  return {
    slug: slug || name.toLowerCase(),
    player: name || slug,
    country: String(member.country || '').toUpperCase(),
    role: String(member.position || ''),
    lane: laneOf(member.position),
    team: String(team?.name || '').trim(),
    short: String(team?.tag || team?.name || '').trim(),
    logo: httpsUrl(team?.logo?.url),
    league: leagueShort,
    score: Number(member.score) || 0,
    games: rank?.games ?? null,
    rank,
    riotId: ids.riotId || '',
  };
}

function packHistory(teams) {
  return (Array.isArray(teams) ? teams : []).slice(0, 16).map((row) => ({
    team: String(row.name || row.tag || '').trim(),
    short: String(row.tag || '').trim(),
    logo: httpsUrl(row.logo?.url),
    role: laneOf(row.position) || String(row.role || '').trim(),
    start: String(row.join_date || '').slice(0, 10),
    end: row.leave_date ? String(row.leave_date).slice(0, 10) : '',
  })).filter((row) => row.team);
}

function packProfile(raw) {
  const slug = String(raw?.slug || '').trim();
  const name = String(raw?.name || '').trim();
  if (!slug && !name) return null;
  const lp = raw.league_player || {};
  const social = raw.social_media || {};
  const currentTeam = (Array.isArray(raw.teams) ? raw.teams : []).find((row) => !row.leave_date) || null;
  const league = Array.isArray(raw.leagues) && raw.leagues[0] ? raw.leagues[0] : null;
  const rawAccounts = Array.isArray(lp.accounts) ? lp.accounts : [];
  const accounts = rawAccounts.map(packAccount).filter(Boolean).slice(0, 12);
  const primaryRaw = rawAccounts[0] || {};
  const primary = accounts[0] || null;
  const history = packHistory(raw.previous_teams);
  if (currentTeam?.name && !history.some((row) => !row.end && row.team === String(currentTeam.name).trim())) {
    history.unshift({
      team: String(currentTeam.name || '').trim(),
      short: String(currentTeam.tag || '').trim(),
      logo: httpsUrl(currentTeam.logo?.url),
      role: laneOf(lp.position),
      start: dayOf(currentTeam.join_date),
      end: '',
    });
  }
  const seasons = (Array.isArray(primaryRaw.seasons) ? primaryRaw.seasons : []).slice(0, 6).map((row, i) => ({
    id: String(row.id || ''),
    label: seasonLabel(row.id),
    peak: packRank(row.peak),
    end: packRank(row.end),
    latest: i === 0,
  })).filter((row) => row.peak || row.end);
  const names = (Array.isArray(primaryRaw.summoner_names) ? primaryRaw.summoner_names : [])
    .map((row) => ({ name: String(row.name || '').trim(), at: dayOf(row.created_at) }))
    .filter((row) => row.name && row.name.toLowerCase() !== String(primary?.riotId || '').toLowerCase())
    .slice(0, 10);
  const teammates = (Array.isArray(currentTeam?.current_members) ? currentTeam.current_members : [])
    .filter((row) => row?.role === 'player' && String(row.slug || '') !== slug)
    .map((row) => ({
      name: String(row.name || '').trim(),
      slug: String(row.slug || '').trim(),
      country: String(row.country || '').toUpperCase(),
      lane: laneOf(row.position),
    }))
    .filter((row) => row.name && row.slug);
  return {
    slug: slug || name.toLowerCase(),
    player: name || slug,
    country: String(raw.country || '').toUpperCase(),
    otherCountries: (Array.isArray(raw.other_countries) ? raw.other_countries : [])
      .map((code) => String(code || '').toUpperCase())
      .filter(Boolean),
    role: String(lp.position || ''),
    lane: laneOf(lp.position),
    team: String(currentTeam?.name || '').trim(),
    short: String(currentTeam?.tag || currentTeam?.name || '').trim(),
    logo: httpsUrl(currentTeam?.logo?.url),
    league: String(league?.shorthand || league?.name || '').trim(),
    leagueName: String(league?.name || '').trim(),
    leagueLogo: httpsUrl(league?.logo?.url),
    iconId: primary?.iconId || 0,
    twitter: String(social.twitter || '').trim(),
    twitch: String(social.twitch || '').trim(),
    instagram: String(social.instagram || '').trim(),
    facebook: String(social.facebook || '').trim(),
    discord: String(social.discord || '').trim(),
    leaguepedia: String(social.leaguepedia || '').trim(),
    accounts,
    names,
    seasons,
    teammates,
    rank: primary?.rank || null,
    peak: primary?.peak || null,
    riotId: primary?.riotId || '',
    history,
  };
}

async function lolpros(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      Origin: 'https://lolpros.gg',
      Referer: 'https://lolpros.gg/ladders',
      'User-Agent': 'RiftDesktop/0.1.13 (esports ladder)',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 429) throw new Error('Rate-limited. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Esports ${res.status}`);
  return res.json();
}

function ladderPath({ country, lane, league, page, pageSize = PAGE_SIZE }) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    sort: 'rank',
    order: 'desc',
  });
  const iso = String(country || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(iso)) params.append('countries[]', iso);
  const position = POSITION[lane];
  if (position) params.append('positions[]', position);
  if (league) params.append('leagues[]', league);
  return `/es/ladder?${params.toString()}`;
}

async function loadLeagues() {
  if (cache.leagues.list.length && Date.now() - cache.leagues.at < TTL_MS * 4) {
    return cache.leagues.list;
  }
  const rows = await lolpros('/es/leagues?ongoing=true');
  const list = (Array.isArray(rows) ? rows : []).map((row) => ({
    slug: String(row.shorthand || row.slug || '').trim(),
    short: String(row.shorthand || '').trim(),
    name: String(row.name || '').trim(),
    logo: httpsUrl(row.logo?.url),
  })).filter((row) => row.slug);
  cache.leagues = { at: Date.now(), list };
  return list;
}

function tournamentYear(league) {
  const tours = Array.isArray(league?.tournaments) ? league.tournaments : [];
  const ongoing = tours.find((row) => row.ongoing) || tours[0];
  return String(ongoing?.start_date || '').slice(0, 4);
}

async function loadLeagueRoster({ league, country, lane }) {
  const key = `league|${league}|${String(country || '').toUpperCase()}|${lane || ''}`;
  const hit = cache.ladder.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const payload = await lolpros(`/es/leagues/${encodeURIComponent(league)}`);
  const short = String(payload?.shorthand || league).trim();
  const year = tournamentYear(payload);
  const bySlug = new Map();
  for (const tour of Array.isArray(payload?.tournaments) ? payload.tournaments : []) {
    if (year && !String(tour.start_date || '').startsWith(year)) continue;
    for (const team of Array.isArray(tour.participants) ? tour.participants : []) {
      for (const member of Array.isArray(team.members) ? team.members : []) {
        if (member?.role && member.role !== 'player') continue;
        const row = packMemberRow(member, team, short);
        if (!row?.slug) continue;
        const prev = bySlug.get(row.slug);
        if (!prev || (row.score || 0) > (prev.score || 0)) bySlug.set(row.slug, row);
      }
    }
  }
  let players = [...bySlug.values()];
  const iso = String(country || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(iso)) {
    players = players.filter((row) => row.country === iso);
  }
  if (lane) players = players.filter((row) => row.lane === lane);
  await enrichRosterFromLadder(players, { league: payload?.shorthand || league, lane });
  players.sort((a, b) => (b.score || 0) - (a.score || 0) || a.player.localeCompare(b.player));
  const packed = { at: Date.now(), players, truncated: false };
  cache.ladder.set(key, packed);
  return packed;
}

async function enrichRosterFromLadder(players, { league, lane }) {
  if (!players.length) return;
  const index = new Map(players.map((row) => [row.slug, row]));
  let filled = 0;
  for (let page = 1; page <= 3; page += 1) {
    const rows = await lolpros(ladderPath({ league, lane, page, pageSize: 100 }));
    const batch = Array.isArray(rows) ? rows : [];
    for (const raw of batch) {
      const slug = String(raw?.slug || '').trim();
      const row = index.get(slug);
      if (!row) continue;
      const extra = packLadderRow(raw);
      if (!extra) continue;
      if (extra.rank?.winrate != null || extra.rank?.games != null) {
        row.rank = {
          ...(row.rank || {}),
          ...extra.rank,
          tier: extra.rank.tier || row.rank?.tier,
          leaguePoints: extra.rank.leaguePoints ?? row.rank?.leaguePoints,
        };
        row.games = extra.games ?? row.games;
        row.score = extra.score || row.score;
        if (extra.riotId) row.riotId = extra.riotId;
        filled += 1;
      } else if (!row.rank && extra.rank) {
        row.rank = extra.rank;
        row.games = extra.games;
        if (extra.riotId) row.riotId = extra.riotId;
      }
    }
    if (batch.length < 100 || filled >= players.length) break;
    await sleep(120);
  }
}

async function loadCountries() {
  if (cache.countries.list.length && Date.now() - cache.countries.at < TTL_MS * 4) {
    return cache.countries.list;
  }
  const rows = await lolpros('/profiles/countries');
  const list = (Array.isArray(rows) ? rows : [])
    .map((code) => String(code || '').toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code));
  cache.countries = { at: Date.now(), list };
  return list;
}

async function loadLadder({ country, lane }) {
  const key = `${String(country || '').toUpperCase()}|${lane || ''}`;
  const hit = cache.ladder.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const players = [];
  const pages = country ? MAX_PAGES : 1;
  for (let page = 1; page <= pages; page += 1) {
    const rows = await lolpros(ladderPath({ country, lane, page }));
    const batch = (Array.isArray(rows) ? rows : []).map(packLadderRow).filter(Boolean);
    players.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    if (page < pages) await sleep(160);
  }
  const packed = { at: Date.now(), players, truncated: !country && players.length >= PAGE_SIZE };
  cache.ladder.set(key, packed);
  return packed;
}

async function searchPlayers(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const rows = await lolpros(`/es/search?query=${encodeURIComponent(q)}`);
  const list = Array.isArray(rows) ? rows : [];
  return list.slice(0, 40).map((row) => {
    const profile = packProfile(row);
    if (profile) {
      return {
        slug: profile.slug,
        player: profile.player,
        country: profile.country,
        role: profile.role,
        lane: profile.lane,
        team: profile.team,
        short: profile.short,
        logo: profile.logo,
        league: profile.league,
        rank: profile.rank,
        riotId: profile.riotId,
        games: profile.rank?.games ?? null,
      };
    }
    return packLadderRow(row);
  }).filter(Boolean);
}

async function listPros(args = {}) {
  const country = String(args.country || '').trim().toUpperCase();
  const lane = String(args.lane || '').trim();
  const league = String(args.league || '').trim();
  const query = String(args.query || '').trim();
  try {
    const [countries, leagues] = await Promise.all([
      loadCountries().catch(() => cache.countries.list),
      loadLeagues().catch(() => cache.leagues.list),
    ]);
    if (query.length >= 3) {
      const players = await searchPlayers(query);
      return { ok: true, source: 'rift.lol', countries, leagues, players, truncated: false };
    }
    const packed = league
      ? await loadLeagueRoster({ league, country, lane })
      : await loadLadder({ country, lane });
    return {
      ok: true,
      source: 'rift.lol',
      countries,
      leagues,
      players: packed.players,
      truncated: packed.truncated,
    };
  } catch (err) {
    const fallback = cache.ladder.get(league
      ? `league|${league}|${country}|${lane}`
      : `${country}|${lane}`);
    return {
      ok: false,
      source: 'rift.lol',
      countries: cache.countries.list,
      leagues: cache.leagues.list,
      players: fallback?.players || [],
      error: err.message || 'Could not load the esports ladder.',
    };
  }
}

async function getPro(slugOrName) {
  const raw = String(slugOrName || '').trim();
  if (!raw) return { ok: false, error: 'Missing player.' };
  const slug = raw.toLowerCase().replace(/\s+/g, '-');
  const hit = cache.profiles.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { ok: true, source: 'rift.lol', player: hit.player };
  }
  try {
    let profile = packProfile(await lolpros(`/es/profiles/${encodeURIComponent(slug)}`));
    if (!profile) {
      const found = await searchPlayers(raw);
      if (found[0]?.slug) {
        profile = packProfile(await lolpros(`/es/profiles/${encodeURIComponent(found[0].slug)}`));
      }
    }
    if (!profile) return { ok: false, error: 'Player not on the esports ladder.' };
    cache.profiles.set(profile.slug, { at: Date.now(), player: profile });
    return { ok: true, source: 'rift.lol', player: profile };
  } catch (err) {
    if (String(err.message || '').includes('404')) {
      return { ok: false, error: 'Player not on the esports ladder.' };
    }
    return { ok: false, error: err.message || 'Could not load player.' };
  }
}

function riotKey(value) {
  return String(value || '').trim().toLowerCase();
}

function playerHasRiotId(player, want) {
  if (!player || !want) return false;
  if (riotKey(player.riotId) === want) return true;
  return (player.accounts || []).some((acc) => riotKey(acc.riotId) === want);
}

function identityFromPlayer(player) {
  if (!player) return null;
  const identity = {
    name: String(player.player || '').trim(),
    country: String(player.country || '').trim(),
    team: String(player.team || '').trim(),
    short: String(player.short || '').trim(),
    logo: String(player.logo || '').trim(),
    league: String(player.league || '').trim(),
    lane: String(player.lane || '').trim(),
    slug: String(player.slug || '').trim(),
  };
  if (!identity.country && !identity.team && !identity.name) return null;
  return identity;
}

async function lookupPro(riotId) {
  const want = riotKey(riotId);
  if (!want.includes('#')) return { ok: false };
  const cached = cache.byRiot.get(want);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return { ok: true, identity: cached.identity };
  }
  const remember = (identity) => {
    if (!identity) return { ok: false };
    cache.byRiot.set(want, { at: Date.now(), identity });
    return { ok: true, identity };
  };
  for (const hit of cache.profiles.values()) {
    if (playerHasRiotId(hit.player, want)) return remember(identityFromPlayer(hit.player));
  }
  for (const packed of cache.ladder.values()) {
    for (const row of packed.players || []) {
      if (riotKey(row.riotId) === want) {
        const identity = identityFromPlayer(row);
        if (identity?.country || identity?.team) return remember(identity);
      }
    }
  }
  const gameName = String(riotId).split('#')[0].trim();
  const found = await searchPlayers(gameName.length >= 3 ? gameName : riotId).catch(() => []);
  for (const row of found.slice(0, 6)) {
    if (riotKey(row.riotId) !== want) continue;
    if (row.slug) {
      const full = await getPro(row.slug);
      if (full.ok && playerHasRiotId(full.player, want)) {
        return remember(identityFromPlayer(full.player));
      }
    }
    const identity = identityFromPlayer(row);
    if (identity?.country || identity?.team) return remember(identity);
  }
  for (const row of found.slice(0, 3)) {
    if (!row.slug) continue;
    const full = await getPro(row.slug);
    if (full.ok && playerHasRiotId(full.player, want)) {
      return remember(identityFromPlayer(full.player));
    }
  }
  return { ok: false };
}

function register(ipcMain) {
  ipcMain.handle('pros:list', (_e, args) => listPros(args || {}));
  ipcMain.handle('pros:player', (_e, name) => getPro(name));
  ipcMain.handle('pros:lookup', (_e, riotId) => lookupPro(riotId));
}

module.exports = register;
