export const REGIONS = [
  { label: 'Europe West (EUW)', region: 'europe', platform: 'euw1' },
  { label: 'Europe Nordic & East (EUNE)', region: 'europe', platform: 'eun1' },
  { label: 'North America (NA)', region: 'americas', platform: 'na1' },
  { label: 'Brazil (BR)', region: 'americas', platform: 'br1' },
  { label: 'Latin America North (LAN)', region: 'americas', platform: 'la1' },
  { label: 'Latin America South (LAS)', region: 'americas', platform: 'la2' },
  { label: 'Korea (KR)', region: 'asia', platform: 'kr' },
  { label: 'Japan (JP)', region: 'asia', platform: 'jp1' },
  { label: 'Oceania (OCE)', region: 'sea', platform: 'oc1' },
  { label: 'Turkey (TR)', region: 'europe', platform: 'tr1' },
  { label: 'Russia (RU)', region: 'europe', platform: 'ru' },
  { label: 'Middle East (ME)', region: 'europe', platform: 'me1' },
  { label: 'Singapore (SG)', region: 'sea', platform: 'sg2' },
  { label: 'Philippines (PH)', region: 'sea', platform: 'ph2' },
  { label: 'Taiwan (TW)', region: 'sea', platform: 'tw2' },
  { label: 'Thailand (TH)', region: 'sea', platform: 'th2' },
  { label: 'Vietnam (VN)', region: 'sea', platform: 'vn2' },
];

export function parseRiotIdInput(nameInput = '', tagInput = '') {
  let gameName = String(nameInput || '').trim();
  let tagLine = String(tagInput || '').trim().replace(/^#/, '');
  if (gameName.includes('#')) {
    const [name, tag] = gameName.split('#');
    gameName = (name || '').trim();
    tagLine = (tag || tagLine).trim();
  }
  return {
    gameName,
    tagLine: tagLine.toUpperCase(),
  };
}

export function linkErrorMessage(err, t) {
  const msg = String(err?.message || err || '');
  if (msg === 'LCU_CLIENT_CLOSED' || msg.startsWith('LCU_CLIENT_CLOSED')) {
    return t ? t('link.needLeagueOpen') : 'Open the League of Legends client and log in to the account you want to link.';
  }
  if (msg === 'LCU_NOT_LOGGED_IN' || msg.startsWith('LCU_NOT_LOGGED_IN')) {
    return t ? t('link.needLeagueLogin') : 'League is open but you are not logged in. Sign in to the account you want to link.';
  }
  if (msg.startsWith('LCU_MISMATCH')) {
    const loggedInAs = msg.includes(':') ? msg.slice(msg.indexOf(':') + 1) : '';
    if (t) {
      return loggedInAs
        ? t('link.mismatch', { id: loggedInAs })
        : t('link.mismatchGeneric');
    }
    return loggedInAs
      ? `League is logged in as ${loggedInAs}. Link that Riot ID, or switch accounts in League.`
      : 'The Riot ID does not match the account logged into League.';
  }
  const lower = msg.toLowerCase();
  if (lower.includes('abort') || lower.includes('timeout') || lower.includes('timed out')) {
    return 'Rift.lol API took too long. Wait a few seconds and try again — the first request wakes the server.';
  }
  if (msg.startsWith('Proxy ')) {
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      return 'This build is not authorized for the Rift.lol API. Set the same RIFT_APP_TOKEN on the server and in client.env, then rebuild Setup.';
    }
    if (msg.includes('401') || msg.includes('403')) {
      return `Riot rejected the key on the server. ${msg}`;
    }
    if (msg.includes('429')) return 'Rate limit hit. Wait 2 minutes, then try again.';
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      return 'Could not find that Riot ID. Check the name and tag (for example Name#EUW).';
    }
    return `Could not reach the Rift.lol API (${msg}). Check that the hosted proxy is live, then try again.`;
  }
  if (msg.includes('RIOT_API_KEY is not set') || msg.toLowerCase().includes('rift_api_url') || msg.toLowerCase().includes('gd_api_url')) {
    return 'Riot connection is not configured. Dev: add RIOT_API_KEY to .env. Shared build: set RIFT_API_URL to the proxy.';
  }
  if (msg.includes(' 401 ') || msg.includes(' 403 ')) {
    return `Riot rejected the request. ${msg.slice(0, 180)}`;
  }
  if (msg.includes(' 429 ')) {
    return 'Rate limit hit. Wait 2 minutes, then try again.';
  }
  if (msg.includes(' 404 ') || msg.toLowerCase().includes('not found')) {
    return 'Could not find that Riot ID. Check the name and tag (for example Name#EUW).';
  }
  return msg ? `Could not link that account. ${msg.slice(0, 180)}` : 'Could not link that account.';
}
