const cache = new Map();
const TTL_MS = 20 * 60 * 1000;
const LANE = { Top: 'top', Jungle: 'jungle', Mid: 'middle', ADC: 'bottom', Support: 'support' };
const TREE = [8000, 8100, 8200, 8300, 8400];
const BOOTS = new Set([3006, 3009, 3010, 3020, 3047, 3111, 3117, 3158, 2422, 3171, 3513]);
const PETS = new Set([1101, 1102, 1103]);
const STARTERS = new Set([
  1054, 1055, 1056, 1082, 1083, 1086, 1101, 1102, 1103, 1120,
  2003, 2031, 3070, 3850, 3851, 3854, 3855, 3858, 3859,
  3862, 3863, 3865, 3866, 3867, 1035, 1039, 1041, 1036, 1028, 1027,
]);

const ROLE_STARTERS = {
  Top: [1120, 1054],
  Jungle: [1101],
  Mid: [1056],
  ADC: [1086, 1055],
  Support: [3865],
};
const SLUG = {
  MonkeyKing: 'wukong',
  Wukong: 'wukong',
  DrMundo: 'drmundo',
  ChoGath: 'chogath',
  KaiSa: 'kaisa',
  KhaZix: 'khazix',
  VelKoz: 'velkoz',
  LeBlanc: 'leblanc',
  Nunu: 'nunu',
  RekSai: 'reksai',
  BelVeth: 'belveth',
  JarvanIV: 'jarvaniv',
  TwistedFate: 'twistedfate',
  MasterYi: 'masteryi',
  MissFortune: 'missfortune',
  TahmKench: 'tahmkench',
  AurelionSol: 'aurelionsol',
  LeeSin: 'leesin',
  XinZhao: 'xinzhao',
};

function slugOf(champion) {
  const key = String(champion || '').trim();
  if (SLUG[key]) return SLUG[key];
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function styleId(index) {
  return TREE[Number(index)] || TREE[0];
}

function parsePath(row) {
  if (!Array.isArray(row) || row.length < 2) return null;
  const ids = String(row[0] || '').split('_').map(Number).filter((id) => id > 0);
  const games = Number(row[1]) || 0;
  const wins = Number(row[2]) || 0;
  if (!ids.length || games <= 0) return null;
  return { ids, games, wins, wr: (wins / games) * 100 };
}

function topBoot(rows) {
  const ranked = (rows || []).map(parsePath).filter((p) => p && BOOTS.has(p.ids[0]));
  ranked.sort((a, b) => b.games - a.games);
  return ranked[0]?.ids[0] || null;
}

function startersFrom(rows) {
  const found = [];
  const seen = new Set();
  for (const row of rows || []) {
    const path = parsePath(row);
    if (!path) continue;
    for (const id of path.ids) {
      if (!STARTERS.has(id) || seen.has(id)) continue;
      seen.add(id);
      found.push(id);
      if (found.length >= 3) return found;
    }
  }
  return found;
}

/** First buy from early paths when it is a real fountain starter (Doran's, Cull, etc.). */
function startersFromEarly(earlySet) {
  const tally = new Map();
  for (const row of earlySet || []) {
    const path = parseEarly(row);
    if (!path) continue;
    const id = path.ids[0];
    if (!STARTERS.has(id) || PETS.has(id)) continue;
    tally.set(id, (tally.get(id) || 0) + path.games);
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, 2);
}

function resolveStarters(role, itemSet1, earlySet, tags) {
  // Jungle fountain buy is always a jungle pet companion.
  if (role === 'Jungle') {
    const pet = junglePet(earlySet);
    if (pet?.id) return [pet.id];
    const tally = new Map();
    for (const row of earlySet || []) {
      const path = parseEarly(row);
      if (!path || !PETS.has(path.ids[0])) continue;
      tally.set(path.ids[0], (tally.get(path.ids[0]) || 0) + path.games);
    }
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    return [best?.[0] || 1101];
  }

  // Early paths are real fountain buys; itemSet1 is often first completed legendary.
  const fromEarly = startersFromEarly(earlySet);
  if (fromEarly.length) return fromEarly;
  const fromSet = startersFrom(itemSet1).filter((id) => !PETS.has(id));
  if (fromSet.length) return fromSet;
  return starterFallback(role, tags);
}

function situationalFor(core, rows) {
  const prefix = `${core.join('_')}_`;
  const extra = [];
  const seen = new Set(core);
  for (const row of rows || []) {
    const path = parsePath(row);
    if (!path || !String(row[0]).startsWith(prefix)) continue;
    const id = path.ids[path.ids.length - 1];
    if (!id || seen.has(id) || BOOTS.has(id)) continue;
    seen.add(id);
    extra.push({ id, games: path.games, wins: path.wins, wr: path.wr });
    if (extra.length >= 4) break;
  }
  extra.sort((a, b) => b.games - a.games);
  return extra;
}

function perkIdsOf(arr, max) {
  const out = [];
  for (const v of arr || []) {
    const id = Number(Array.isArray(v) ? v[0] : v);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function orderSpells(spells) {
  const ids = (spells || []).map(Number).filter((id) => id > 0);
  if (ids.includes(4)) return [4, ...ids.filter((id) => id !== 4)].slice(0, 2);
  return ids.slice(0, 2);
}

/** Ranked meta summoner pair — not the player's current lobby spells. */
function resolveMetaSpells(role, tags) {
  if (role === 'Jungle') return [4, 11];
  if (role === 'ADC') return [4, 21];
  if (role === 'Support') return [4, 3];
  if (role === 'Top') return [4, 12];
  if (role === 'Mid') return [4, 14];
  if (tags?.includes('Marksman')) return [4, 21];
  if (tags?.includes('Support')) return [4, 3];
  return [4, 14];
}

function runePage(summary, key, spells, role, tags) {
  const pack = summary?.runes?.[key];
  if (!pack?.set?.pri) return null;
  const pri = perkIdsOf(pack.set.pri, 4);
  const sec = perkIdsOf(pack.set.sec, 2);
  const mod = perkIdsOf(pack.set.mod, 3);
  const selectedPerkIds = [...pri, ...sec, ...mod];
  if (selectedPerkIds.length < 6) return null;
  while (selectedPerkIds.length < 9) selectedPerkIds.push(5008);
  const hasPlayerSpells = Array.isArray(spells) && spells.filter(Boolean).length >= 2;
  const loadout = hasPlayerSpells
    ? orderSpells(spells)
    : resolveMetaSpells(role, tags);
  return {
    name: 'Rift Draft',
    primaryStyleId: styleId(pack.page?.pri),
    subStyleId: styleId(pack.page?.sec),
    selectedPerkIds: selectedPerkIds.slice(0, 9),
    spells: loadout,
    games: Number(pack.n) || 0,
    wr: Number(pack.wr) || 0,
  };
}

function parseEarly(row) {
  if (!Array.isArray(row) || row.length < 2) return null;
  const ids = String(row[0] || '').split('_').map(Number).filter((id) => id > 0);
  const wr = Number(row[1]) || 0;
  const games = Number(row[row.length - 1]) || 0;
  if (!ids.length || games <= 0) return null;
  return { ids, wr, games };
}

function junglePet(earlySet) {
  const tally = new Map();
  for (const row of earlySet || []) {
    const path = parseEarly(row);
    if (!path || !PETS.has(path.ids[0])) continue;
    const cur = tally.get(path.ids[0]) || { id: path.ids[0], games: 0, wr: 0, wrGames: 0 };
    cur.games += path.games;
    if (path.games > cur.wrGames) {
      cur.wr = path.wr;
      cur.wrGames = path.games;
    }
    tally.set(path.ids[0], cur);
  }
  return [...tally.values()].sort((a, b) => b.games - a.games)[0] || null;
}

let champTagCache = null;
async function loadChampTags() {
  if (champTagCache) return champTagCache;
  try {
    const verRes = await httpGet('https://ddragon.leagueoflegends.com/api/versions.json');
    const ver = Array.isArray(verRes) ? verRes[0] : null;
    if (!ver) return {};
    const data = await httpGet(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`);
    const map = {};
    Object.values(data.data || {}).forEach((ch) => {
      map[ch.id] = ch.tags || [];
      map[String(ch.name || '').replace(/[^a-zA-Z0-9]/g, '')] = ch.tags || [];
    });
    champTagCache = map;
    return map;
  } catch {
    return {};
  }
}

function roleFromTags(tags) {
  const t = tags || [];
  if (t.includes('Marksman')) return 'ADC';
  if (t.includes('Support') && !t.includes('Fighter') && !t.includes('Tank')) return 'Support';
  // Ambessa, Sett, Darius, etc. — Fighter (+ Assassin) defaults to Top, not Mid.
  if (t.includes('Fighter') || t.includes('Tank')) return 'Top';
  if (t.includes('Mage')) return 'Mid';
  if (t.includes('Assassin')) return 'Mid';
  return 'Top';
}

function starterFallback(role, tags) {
  const t = tags || [];
  if (role === 'Jungle') return [1101];
  if (role === 'ADC' || t.includes('Marksman')) return [1086, 1055];
  if (role === 'Support' || (t.includes('Support') && !t.includes('Fighter'))) return [3865];
  if (t.includes('Mage') || (role === 'Mid' && !t.includes('Fighter') && !t.includes('Assassin'))) return [1056];
  if (t.includes('Fighter') || t.includes('Tank') || role === 'Top') return [1120, 1054];
  if (t.includes('Assassin')) return [1055];
  return [...(ROLE_STARTERS[role] || [1054])];
}

function prioFromSeq(seq, games, wr) {
  const counts = { 1: 0, 2: 0, 3: 0 };
  const order = [];
  for (const ch of String(seq)) {
    if (ch !== '1' && ch !== '2' && ch !== '3') continue;
    counts[ch] += 1;
    if (counts[ch] === 5 && !order.includes(ch)) order.push(ch);
  }
  if (order.length < 3) return null;
  const letters = order.map((n) => ({ 1: 'Q', 2: 'W', 3: 'E' }[n]));
  return { id: letters.join(''), order: letters, games, wr };
}

function parseSkillPriorities(html) {
  const byId = new Map();
  const prioRe = /"([QWE]{3})",(\d{3,}),(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = prioRe.exec(html))) {
    const id = m[1];
    if (new Set(id).size !== 3) continue;
    const games = Number(m[2]);
    const wr = Number(m[3]);
    if (games < 80 || wr < 35 || wr > 75) continue;
    const prev = byId.get(id);
    if (!prev || games > prev.games) byId.set(id, { id, order: id.split(''), games, wr });
  }
  if (!byId.size) {
    const seqRe = /\b([1234]{15}),(\d{3,}),(\d+(?:\.\d+)?)/g;
    while ((m = seqRe.exec(html))) {
      const parsed = prioFromSeq(m[1], Number(m[2]), Number(m[3]));
      if (!parsed || parsed.games < 80) continue;
      const prev = byId.get(parsed.id);
      if (!prev || parsed.games > prev.games) byId.set(parsed.id, parsed);
    }
  }
  return [...byId.values()].sort((a, b) => b.games - a.games);
}

async function httpGetText(url) {
  const headers = {
    accept: 'text/html',
    origin: 'https://lolalytics.com',
    referer: 'https://lolalytics.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  let res;
  try {
    const { net } = require('electron');
    res = await net.fetch(url, { headers });
  } catch {
    res = await fetch(url, { headers });
  }
  if (!res.ok) throw new Error(`lolalytics ${res.status}`);
  return res.text();
}

async function fetchSkillPriorities(slug, lane) {
  const html = await httpGetText(`https://lolalytics.com/lol/${slug}/build/?lane=${lane}&tier=emerald_plus`);
  return parseSkillPriorities(html);
}

function pickSkill(list, wantWr) {
  if (!list?.length) return null;
  if (!wantWr) return list[0];
  const floor = Math.max(80, Math.round((list[0].games || 0) * 0.12));
  const ranked = list.filter((s) => s.games >= floor).sort((a, b) => b.wr - a.wr || b.games - a.games);
  const best = ranked[0];
  if (best && best.id !== list[0].id) return best;
  return list[1] || list[0];
}

/** Distinct skill max-orders for each build tab (most played, then alts). */
function skillForBuildIndex(list, index) {
  if (!list?.length) return null;
  if (index <= 0) return list[0];
  const seen = new Set([list[0].id]);
  const alts = [];
  for (const s of list) {
    if (!s?.id || seen.has(s.id)) continue;
    seen.add(s.id);
    alts.push(s);
  }
  return alts[index - 1] || pickSkill(list, true) || list[0];
}

function pickPaths(itemSet3) {
  const paths = (itemSet3 || []).map(parsePath).filter(Boolean);
  if (!paths.length) return [];
  paths.sort((a, b) => b.games - a.games);
  // Top 3 distinct openings (like DPM's build tabs) — not only most-played + WR.
  const out = [];
  const seen = new Set();
  for (const p of paths) {
    const key = p.ids.slice(0, 2).join('_');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 3) break;
  }
  return out;
}

/** Starter candidates with play volume — used to pick by enemy comp. */
function starterOptionsFrom(earlySet, itemSet1, role, tags) {
  const tally = new Map();
  for (const row of earlySet || []) {
    const path = parseEarly(row);
    if (!path) continue;
    const id = path.ids[0];
    if (!STARTERS.has(id) || PETS.has(id)) continue;
    const cur = tally.get(id) || { id, games: 0, wr: 0, wrGames: 0 };
    cur.games += path.games;
    if (path.games > cur.wrGames) {
      cur.wr = path.wr;
      cur.wrGames = path.games;
    }
    tally.set(id, cur);
  }
  for (const id of startersFrom(itemSet1)) {
    if (PETS.has(id)) continue;
    if (!tally.has(id)) tally.set(id, { id, games: 1, wr: 0, wrGames: 0 });
  }
  // Always offer the common role fountain buys so comp logic can choose them.
  for (const id of starterFallback(role, tags)) {
    if (!tally.has(id)) tally.set(id, { id, games: 0, wr: 0, wrGames: 0 });
  }
  // Doran's Bow (1086) is the current ADC fountain item; keep Blade as alt.
  if ((role === 'ADC' || tags?.includes('Marksman'))) {
    if (!tally.has(1086)) tally.set(1086, { id: 1086, games: 0, wr: 0, wrGames: 0 });
    if (!tally.has(1055)) tally.set(1055, { id: 1055, games: 0, wr: 0, wrGames: 0 });
  }
  // Long Sword is a real DPM-style opener into ER / lethality even when rare as "most played".
  if ((role === 'ADC' || role === 'Mid' || role === 'Top') && !tally.has(1036)) {
    tally.set(1036, { id: 1036, games: 0, wr: 0, wrGames: 0 });
  }
  if ((role === 'ADC' || role === 'Top') && !tally.has(1054)) {
    tally.set(1054, { id: 1054, games: 0, wr: 0, wrGames: 0 });
  }
  return [...tally.values()].sort((a, b) => b.games - a.games).slice(0, 6);
}

function labelForPath(ids, index) {
  const a = Number(ids?.[0]) || 0;
  const NAMES = {
    3153: 'On-hit shred',
    3124: 'On-hit shred',
    3085: 'On-hit shred',
    3091: 'On-hit shred',
    6672: 'AS / Kraken',
    3508: 'AD haste caster',
    3095: 'AD haste caster',
    6676: 'Crit snowball',
    3031: 'Crit',
    6691: 'Lethality snowball',
    6692: 'Lethality snowball',
    6693: 'Lethality snowball',
    6694: 'Lethality snowball',
    6695: 'Lethality snowball',
    6696: 'Lethality snowball',
    3179: 'Lethality snowball',
    3814: 'Lethality snowball',
    3078: 'Bruiser',
    6631: 'Bruiser',
    3071: 'Bruiser',
    6655: 'AP burst',
    6653: 'AP control',
    3118: 'AP',
    4645: 'AP',
  };
  if (NAMES[a]) return NAMES[a];
  return index === 0 ? 'Most played' : (index === 1 ? 'Alt build' : 'Situational');
}

async function httpGet(url) {
  const headers = {
    accept: 'application/json',
    origin: 'https://lolalytics.com',
    referer: 'https://lolalytics.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  let res;
  try {
    const { net } = require('electron');
    res = await net.fetch(url, { headers });
  } catch {
    res = await fetch(url, { headers });
  }
  if (!res.ok) throw new Error(`lolalytics ${res.status}`);
  return res.json();
}

function megaUrl(ep, slug, lane) {
  const q = new URLSearchParams({
    ep,
    c: slug,
    lane,
    tier: 'emerald_plus',
  });
  return `https://a1.lolalytics.com/mega/?${q.toString()}`;
}

async function fetchMetaBuilds({ champion, role, spells } = {}) {
  const slug = slugOf(champion);
  if (!slug) return { ok: false, builds: [] };

  const tagMap = await loadChampTags();
  const tags = tagMap[champion] || tagMap[slugOf(champion)] || tagMap[String(champion || '').replace(/[^a-zA-Z0-9]/g, '')] || [];
  const resolvedRole = LANE[role] ? role : roleFromTags(tags);
  const lane = LANE[resolvedRole] || 'top';
  const key = `${slug}|${lane}|v6`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  try {
    const [runeJson, itemJson, earlyJson, skills] = await Promise.all([
      httpGet(megaUrl('rune', slug, lane)),
      httpGet(megaUrl('build-itemset', slug, lane)),
      httpGet(megaUrl('build-earlyset', slug, lane)).catch(() => null),
      fetchSkillPriorities(slug, lane).catch(() => []),
    ]);
    const sets = itemJson?.itemSets || {};
    const paths = pickPaths(sets.itemSet3);
    const boot = topBoot(sets.itemBootSet1);
    const start = resolveStarters(resolvedRole, sets.itemSet1, earlyJson?.earlySet, tags);
    const starterOptions = starterOptionsFrom(earlyJson?.earlySet, sets.itemSet1, resolvedRole, tags);
    const pet = junglePet(earlyJson?.earlySet);
    const petId = resolvedRole === 'Jungle'
      ? (pet?.id || start[0] || 1101)
      : (pet?.id || null);
    const pickRunes = runePage(runeJson?.summary, 'pick', spells, resolvedRole, tags);
    const winRunes = runePage(runeJson?.summary, 'win', spells, resolvedRole, tags);
    const builds = paths.map((path, i) => {
      const runes = i === 0 ? pickRunes : (winRunes || pickRunes);
      return {
        id: i === 0 ? 'most' : `alt${i}`,
        label: labelForPath(path.ids, i),
        games: path.games,
        wr: path.wr,
        core: path.ids.slice(0, 3),
        boots: boot,
        starters: resolvedRole === 'Jungle' ? [petId] : start,
        starterOptions: resolvedRole === 'Jungle'
          ? [{ id: petId, games: pet?.games || 0, wr: pet?.wr || 0 }]
          : starterOptions,
        pet: petId,
        skills: skillForBuildIndex(skills, i),
        extra: situationalFor(path.ids.slice(0, 3), sets.itemSet4 || sets.itemSet5),
        runes,
        role: resolvedRole,
        source: 'Emerald+',
      };
    });
    const data = {
      ok: true,
      builds,
      role: resolvedRole,
      source: 'Emerald+',
      starterOptions,
      skillOptions: (skills || []).slice(0, 5),
    };
    // Bust old cache shape (2 builds / no starterOptions).
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    return { ok: false, builds: [], error: err.message || 'Could not load builds.' };
  }
}

function register(ipcMain) {
  ipcMain.handle('meta:builds', (_e, args) => fetchMetaBuilds(args || {}));
}

module.exports = register;
module.exports.fetchMetaBuilds = fetchMetaBuilds;
