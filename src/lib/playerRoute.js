export function parsePlayerSearch(searchParams) {
  const name = searchParams.get('name');
  const tag = searchParams.get('tag');
  const q = searchParams.get('q');
  if (name && tag) return `${name}#${tag}`;
  if (name) return `${name}#`;
  if (q) return q;
  return '';
}

export function parseProIdentity(searchParams) {
  const identity = {
    name: String(searchParams.get('pro') || '').trim(),
    country: String(searchParams.get('cc') || '').trim(),
    team: String(searchParams.get('org') || '').trim(),
    short: String(searchParams.get('ot') || '').trim(),
    league: String(searchParams.get('lg') || '').trim(),
    logo: '',
    lane: String(searchParams.get('ln') || '').trim(),
    slug: '',
  };
  if (!identity.name && !identity.country && !identity.team) return null;
  return identity;
}

export function parseRiotId(raw, fallbackTag = '') {
  const text = String(raw || '').trim();
  if (!text) return null;
  const hash = text.lastIndexOf('#');
  if (hash === -1) {
    if (!fallbackTag) return null;
    return { gameName: text, tagLine: fallbackTag };
  }
  const gameName = text.slice(0, hash).trim();
  const tagLine = text.slice(hash + 1).trim() || fallbackTag;
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

export function playerSearchPath(riotId, fallbackTag = '', extra = {}) {
  const parsed = parseRiotId(riotId, fallbackTag);
  if (!parsed) return '/';
  const params = new URLSearchParams({
    name: parsed.gameName,
    tag: parsed.tagLine,
  });
  if (extra.player) params.set('pro', extra.player);
  if (extra.country) params.set('cc', extra.country);
  if (extra.team) params.set('org', extra.team);
  if (extra.short) params.set('ot', extra.short);
  if (extra.league) params.set('lg', extra.league);
  if (extra.lane) params.set('ln', extra.lane);
  return `/?${params.toString()}`;
}

export function playerQuery(riotId, fallbackTag = '') {
  const path = playerSearchPath(riotId, fallbackTag);
  const i = path.indexOf('?');
  return i >= 0 ? path.slice(i) : '';
}
