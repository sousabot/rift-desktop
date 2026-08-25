/** Public product API client for the website. */

const DEFAULT_API = 'https://gd-desktop.onrender.com';

function apiBase() {
  const fromEnv = String(import.meta.env.VITE_RIFT_API_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  try {
    const fromWindow = String(window.RIFT_WEB_API || '').trim().replace(/\/$/, '');
    if (fromWindow) return fromWindow;
  } catch { /* ignore */ }
  // Same hosted proxy as the desktop app (Render).
  // Override with VITE_RIFT_API_URL=http://127.0.0.1:8787 only when testing a local API.
  return DEFAULT_API;
}

async function getJson(path, { timeoutMs = 45000 } = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export function linkAccount({ gameName, tagLine, platform, region }) {
  const q = new URLSearchParams({
    gameName,
    tagLine,
    platform: platform || 'euw1',
  });
  if (region) q.set('region', region);
  return getJson(`/v1/web/account?${q.toString()}`);
}

export function getTierList({ platform = 'euw1', rank = 'master', force = false } = {}) {
  const q = new URLSearchParams({ platform, rank });
  if (force) q.set('force', '1');
  return getJson(`/v1/web/tierlist?${q.toString()}`);
}

export function getLeaderboard({ tier = 'challenger', platform = 'euw1' } = {}) {
  const q = new URLSearchParams({ tier, platform });
  return getJson(`/v1/web/leaderboard?${q.toString()}`);
}

export function getChampionDetail({
  champion,
  role = 'Mid',
  rank = 'master',
  platform = 'euw1',
} = {}) {
  const q = new URLSearchParams({
    champion,
    role,
    rank,
    platform,
  });
  return getJson(`/v1/web/champion?${q.toString()}`, { timeoutMs: 90000 });
}

export function getDashboard({
  gameName,
  tagLine,
  platform = 'euw1',
  region,
  mode = 'Solo',
  count = 20,
} = {}) {
  const q = new URLSearchParams({
    gameName,
    tagLine,
    platform,
    mode,
    count: String(count),
  });
  if (region) q.set('region', region);
  return getJson(`/v1/web/dashboard?${q.toString()}`, { timeoutMs: 120000 });
}

export function getLiveGame({ gameName, tagLine, platform = 'euw1', region } = {}) {
  const q = new URLSearchParams({ gameName, tagLine, platform });
  if (region) q.set('region', region);
  return getJson(`/v1/web/live?${q.toString()}`, { timeoutMs: 30000 });
}

export function getMatchTimeline({ matchId, region = 'europe', puuid } = {}) {
  const q = new URLSearchParams({
    matchId,
    region,
    puuid,
  });
  return getJson(`/v1/web/match-timeline?${q.toString()}`, { timeoutMs: 60000 });
}

export { apiBase };
