const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const CACHE_MS = 45_000;
const REQ_TIMEOUT = 8000;

let cache = { at: 0, data: null };
let credsCache = { at: 0, creds: null };

function execPs(command) {
  return new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      command,
    ], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      if (err) {
        resolve('');
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function parseLockfile(raw, installDir) {
  const parts = String(raw || '').trim().split(':');
  if (parts.length < 4) return null;
  const port = Number(parts[2]);
  const password = parts[3];
  if (!Number.isFinite(port) || port < 1 || !password) return null;
  return { port, password, installDir: installDir || '' };
}

function parseCommandLine(cmd) {
  const port = Number(String(cmd).match(/--app-port=(\d+)/i)?.[1]);
  const password = String(cmd).match(/--remoting-auth-token=([\w-]+)/i)?.[1];
  if (!Number.isFinite(port) || port < 1 || !password) return null;
  return { port, password };
}

function readLockfile(filePath, installDir) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return parseLockfile(fs.readFileSync(filePath, 'utf8'), installDir || path.dirname(filePath));
  } catch {
    return null;
  }
}

async function getCredentials() {
  if (credsCache.creds && Date.now() - credsCache.at < 8000) return credsCache.creds;

  const defaults = [
    'C:\\Riot Games\\League of Legends\\lockfile',
    'D:\\Riot Games\\League of Legends\\lockfile',
  ];
  for (const file of defaults) {
    const parsed = readLockfile(file, path.dirname(file));
    if (parsed) {
      credsCache = { at: Date.now(), creds: parsed };
      return parsed;
    }
  }

  const uxPath = await execPs(
    "(Get-Process LeagueClientUx -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)",
  );
  if (uxPath) {
    const installDir = path.dirname(uxPath);
    const parsed = readLockfile(path.join(installDir, 'lockfile'), installDir);
    if (parsed) {
      credsCache = { at: Date.now(), creds: parsed };
      return parsed;
    }
  }

  const cmd = await execPs(
    "(Get-CimInstance Win32_Process -Filter \"Name = 'LeagueClientUx.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)",
  );
  const fromCmd = parseCommandLine(cmd);
  if (fromCmd) {
    credsCache = { at: Date.now(), creds: fromCmd };
    return fromCmd;
  }

  credsCache = { at: Date.now(), creds: null };
  return null;
}

function lcuGet(creds, apiPath) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`riot:${creds.password}`).toString('base64');
    const req = https.get({
      hostname: '127.0.0.1',
      port: creds.port,
      path: apiPath,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      rejectUnauthorized: false,
      timeout: REQ_TIMEOUT,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`LCU ${res.statusCode} ${apiPath}`);
          err.status = res.statusCode;
          reject(err);
          return;
        }
        if (!body) {
          resolve(null);
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LCU timeout'));
    });
    req.on('error', reject);
  });
}

function rarityLabel(raw) {
  const key = String(raw || '').replace(/^k/i, '').toLowerCase();
  if (key.includes('ultimate')) return 'Ultimate';
  if (key.includes('mythic')) return 'Mythic';
  if (key.includes('legendary')) return 'Legendary';
  if (key.includes('epic')) return 'Epic';
  if (key.includes('transcendent')) return 'Transcendent';
  if (key.includes('exalted')) return 'Exalted';
  if (key.includes('rare')) return 'Rare';
  return 'Regular';
}

function itemRp(item) {
  if (!item || typeof item !== 'object') return 0;
  if (Number.isFinite(item.rp) && item.rp > 0) return item.rp;
  if (Number.isFinite(item.RP) && item.RP > 0) return item.RP;
  const prices = item.prices || item.price;
  if (Array.isArray(prices)) {
    const rp = prices.find((p) => String(p.currency || p.currencyId || '').toUpperCase().includes('RP'));
    const cost = Number(rp?.cost ?? rp?.price ?? rp?.amount);
    return Number.isFinite(cost) && cost > 0 ? cost : 0;
  }
  if (prices && typeof prices === 'object') {
    const cost = Number(prices.RP ?? prices.rp);
    return Number.isFinite(cost) && cost > 0 ? cost : 0;
  }
  return 0;
}

function catalogMap(items) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    const id = Number(item.itemId ?? item.id ?? item.skinId);
    if (!Number.isFinite(id)) continue;
    const rp = itemRp(item);
    if (rp > 0) map.set(id, rp);
  }
  return map;
}

function isOwned(skin) {
  if (!skin) return false;
  if (skin.ownership && typeof skin.ownership === 'object') {
    if (skin.ownership.owned) return true;
    return false;
  }
  if (typeof skin.owned === 'boolean') return skin.owned;
  return false;
}

function chromaIdSet(skins) {
  const ids = new Set();
  for (const skin of skins || []) {
    for (const chroma of skin.chromas || []) {
      const id = Number(chroma.id ?? chroma.skinId);
      if (Number.isFinite(id)) ids.add(id);
    }
  }
  return ids;
}

function isChromaSkin(skin, chromaIds) {
  const id = Number(skin?.id);
  if (Number.isFinite(id) && chromaIds.has(id)) return true;
  if (skin?.isChroma === true) return true;
  const type = String(skin?.skinType || '').toLowerCase();
  if (type.includes('chroma')) return true;
  const name = String(skin?.name || '').toLowerCase();
  if (name.includes('chroma')) return true;
  return false;
}

function isBaseSkin(skin, champ) {
  if (skin?.isBase === true) return true;
  const id = Number(skin?.id);
  if (Number.isFinite(id) && id % 1000 === 0) return true;
  const name = String(skin?.name || '').trim();
  if (/^classic\b/i.test(name)) return true;
  if (/^default$/i.test(name)) return true;
  const champName = String(champ?.name || '').trim();
  if (champName && name.toLowerCase() === champName.toLowerCase()) return true;
  return false;
}

function isCollectibleSkin(skin, champ, chromaIds) {
  return !!skin && !isBaseSkin(skin, champ) && !isChromaSkin(skin, chromaIds);
}

function assetUrl(lcuPath) {
  if (!lcuPath || typeof lcuPath !== 'string') return '';
  const p = lcuPath.toLowerCase().replace(/^\/+/, '').replace(/^lol-game-data\/assets\//, '');
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${p}`;
}

function tileUrl(champ, skin) {
  const alias = String(champ.alias || champ.name || 'Aatrox').replace(/[^a-zA-Z0-9]/g, '');
  const num = Number(skin.id) % 1000;
  return assetUrl(skin.loadScreenPath)
    || assetUrl(skin.tilePath)
    || `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${alias}_${Number.isFinite(num) ? num : 0}.jpg`;
}

function splashUrl(champ, skin) {
  return assetUrl(skin.uncenteredSplashPath)
    || assetUrl(skin.splashPath)
    || assetUrl(skin.tilePath)
    || tileUrl(champ, skin);
}

async function loadRpCatalog(creds) {
  const tries = [
    '/lol-catalog/v1/items/CHAMPION_SKIN',
    '/lol-store/v1/catalog?inventoryType[]=CHAMPION_SKIN',
  ];
  for (const url of tries) {
    try {
      const items = await lcuGet(creds, url);
      const map = catalogMap(items);
      if (map.size) return map;
    } catch { /* next */ }
  }
  return new Map();
}

async function loadOwnedSkinDates(creds) {
  try {
    const items = await lcuGet(creds, '/lol-inventory/v1/inventory?inventoryTypes=CHAMPION_SKIN');
    const map = new Map();
    for (const it of Array.isArray(items) ? items : []) {
      const id = Number(it.itemId ?? it.itemID ?? it.id);
      const raw = it.purchaseDate ?? it.purchase_date ?? it.acquiredDate;
      const at = typeof raw === 'number' ? raw : Date.parse(raw);
      if (Number.isFinite(id) && Number.isFinite(at) && at > 0) map.set(id, at);
    }
    return map;
  } catch {
    return new Map();
  }
}

function emptySnapshot(extra = {}) {
  return {
    connected: false,
    summoner: null,
    championsOwned: 0,
    championsTotal: 0,
    skinsOwned: 0,
    skinsTotal: 0,
    rpValue: 0,
    champions: [],
    ...extra,
  };
}

async function fetchCollections() {
  const creds = await getCredentials();
  if (!creds) return emptySnapshot({ reason: 'client-closed' });

  let me;
  try {
    me = await lcuGet(creds, '/lol-summoner/v1/current-summoner');
  } catch {
    credsCache = { at: 0, creds: null };
    return emptySnapshot({ reason: 'not-logged-in' });
  }

  const summonerId = me?.summonerId;
  let rawChamps = [];
  if (summonerId != null) {
    try {
      rawChamps = await lcuGet(creds, `/lol-champions/v1/inventories/${summonerId}/champions`);
    } catch { /* fallback */ }
  }
  if (!Array.isArray(rawChamps) || !rawChamps.length) {
    try {
      rawChamps = await lcuGet(creds, '/lol-champions/v1/owned-champions-minimal');
    } catch {
      return emptySnapshot({ reason: 'inventory-failed', summoner: summonerFrom(me) });
    }
  }

  const missingSkins = !rawChamps.some((c) => Array.isArray(c?.skins) && c.skins.length);
  if (missingSkins) {
    rawChamps = await mergeInventorySkins(creds, rawChamps);
  }

  const [prices, dates] = await Promise.all([loadRpCatalog(creds), loadOwnedSkinDates(creds)]);
  const championsMap = (Array.isArray(rawChamps) ? rawChamps : [])
    .filter((c) => c && !c.alias?.startsWith?.('TFT') && Number(c.id) > 0)
    .map((champ) => {
      const rawSkins = Array.isArray(champ.skins) ? champ.skins : [];
      const chromaIds = chromaIdSet(rawSkins);
      const skins = rawSkins
        .filter((skin) => isCollectibleSkin(skin, champ, chromaIds))
        .map((skin) => {
          const id = Number(skin.id);
          return {
            id,
            name: String(skin.name || champ.name),
            owned: isOwned(skin),
            isBase: false,
            isChroma: false,
            rarity: rarityLabel(skin.rarity),
            isLegacy: !!skin.isLegacy,
            purchasedAt: dates.get(id) || 0,
            rp: prices.get(id) || 0,
            tile: tileUrl(champ, skin),
            splash: splashUrl(champ, skin),
          };
        });
      return {
        id: Number(champ.id),
        name: champ.name || champ.alias,
        alias: champ.alias || champ.name,
        owned: !!(champ.ownership?.owned ?? champ.owned),
        skinsOwned: skins.filter((s) => s.owned).length,
        skinsTotal: skins.length,
        skins,
      };
    })
    .reduce((map, champ) => {
      const prev = map.get(champ.id);
      if (!prev || champ.skins.length > prev.skins.length) map.set(champ.id, champ);
      return map;
    }, new Map());

  const champions = [...championsMap.values()]
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const skinsOwned = champions.reduce((n, c) => n + c.skinsOwned, 0);
  const skinsTotal = champions.reduce((n, c) => n + c.skinsTotal, 0);
  const rpValue = champions.reduce((n, c) => (
    n + c.skins.filter((s) => s.owned).reduce((sum, s) => sum + (s.rp || 0), 0)
  ), 0);

  return {
    connected: true,
    reason: '',
    summoner: summonerFrom(me),
    championsOwned: champions.filter((c) => c.owned).length,
    championsTotal: champions.length,
    skinsOwned,
    skinsTotal,
    rpValue,
    champions,
  };
}

async function mergeInventorySkins(creds, champs) {
  let items = [];
  try {
    items = await lcuGet(creds, '/lol-inventory/v1/inventory?inventoryTypes=CHAMPION_SKIN');
  } catch {
    return champs;
  }
  const owned = new Set(
    (Array.isArray(items) ? items : [])
      .map((it) => Number(it.itemId ?? it.itemID ?? it.id))
      .filter((id) => Number.isFinite(id)),
  );
  return (Array.isArray(champs) ? champs : []).map((champ) => {
    if (Array.isArray(champ.skins) && champ.skins.length) return champ;
    const champId = Number(champ.id);
    const skins = [...owned]
      .filter((id) => Math.floor(id / 1000) === champId)
      .map((id) => ({
        id,
        name: champ.name,
        isBase: id % 1000 === 0,
        ownership: { owned: true },
        rarity: '',
      }));
    return { ...champ, skins };
  });
}

function summonerFrom(me) {
  if (!me) return null;
  return {
    gameName: me.gameName || me.displayName || '',
    tagLine: me.tagLine || '',
    displayName: me.displayName || `${me.gameName || ''}#${me.tagLine || ''}`,
    profileIconId: me.profileIconId || 0,
  };
}

async function getCollections(force = false) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await fetchCollections();
  cache = { at: Date.now(), data };
  return data;
}

async function getStatus() {
  const creds = await getCredentials();
  if (!creds) return { connected: false, reason: 'client-closed' };
  try {
    const me = await lcuGet(creds, '/lol-summoner/v1/current-summoner');
    return { connected: true, summoner: summonerFrom(me) };
  } catch {
    return { connected: false, reason: 'not-logged-in' };
  }
}

function riotIdsEqual(aName, aTag, bName, bTag) {
  return String(aName || '').trim().toLowerCase() === String(bName || '').trim().toLowerCase()
    && String(aTag || '').trim().toLowerCase() === String(bTag || '').trim().toLowerCase();
}

/** Prove ownership: League client must be open and logged into Name#TAG. */
async function assertLoggedInAs(gameName, tagLine) {
  const st = await getStatus();
  if (!st.connected) {
    const code = st.reason === 'not-logged-in' ? 'LCU_NOT_LOGGED_IN' : 'LCU_CLIENT_CLOSED';
    const err = new Error(code);
    err.code = code;
    throw err;
  }
  const s = st.summoner || {};
  if (!riotIdsEqual(gameName, tagLine, s.gameName, s.tagLine)) {
    const loggedInAs = s.gameName && s.tagLine ? `${s.gameName}#${s.tagLine}` : '';
    const err = new Error(loggedInAs ? `LCU_MISMATCH:${loggedInAs}` : 'LCU_MISMATCH');
    err.code = 'LCU_MISMATCH';
    err.loggedInAs = loggedInAs;
    throw err;
  }
  return s;
}

function lcuSend(creds, method, apiPath, body, timeoutMs = REQ_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`riot:${creds.password}`).toString('base64');
    const payload = body == null ? '' : JSON.stringify(body);
    const req = https.request({
      hostname: '127.0.0.1',
      port: creds.port,
      path: apiPath,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let detail = data;
          try {
            const parsed = JSON.parse(data);
            detail = parsed.message || parsed.errorCode || data;
          } catch { /* raw body */ }
          const err = new Error(`LCU ${res.statusCode} ${apiPath}${detail ? ` · ${String(detail).slice(0, 180)}` : ''}`);
          err.status = res.statusCode;
          reject(err);
          return;
        }
        if (!data) {
          resolve(null);
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      const err = new Error('LCU timeout');
      err.timeout = true;
      reject(err);
    });
    req.end(payload);
  });
}

async function lcuGetSoft(creds, apiPath) {
  try {
    return await lcuGet(creds, apiPath);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

let champIndex = { at: 0, byId: null };
let lastDraft = null;
let ownedCache = { at: 0, ids: [] };

function lastDraftPath() {
  try {
    return path.join(app.getPath('userData'), 'last-draft.json');
  } catch {
    return '';
  }
}

function draftWorthSaving(data) {
  if (!data) return false;
  const seats = [...(data.allies || []), ...(data.enemies || [])];
  if (seats.some((s) => Number(s?.championId || s?.shownId) > 0)) return true;
  return Array.isArray(data.bans) && data.bans.length > 0;
}

function writeLastDraft(pack) {
  const file = lastDraftPath();
  if (!file) return;
  try {
    fs.writeFileSync(file, JSON.stringify(pack));
  } catch { /* ignore quota / lock */ }
}

function readLastDraft() {
  if (lastDraft?.data) return lastDraft;
  const file = lastDraftPath();
  if (!file) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw?.data && draftWorthSaving(raw.data)) {
      lastDraft = raw;
      return lastDraft;
    }
  } catch { /* missing or junk */ }
  return null;
}

function savedDraftPayload(phase = '', connected = false) {
  const saved = readLastDraft();
  if (!saved?.data) return null;
  return {
    ...saved.data,
    connected,
    inSelect: false,
    source: 'last-draft',
    reason: 'last-draft',
    acting: null,
    gameflow: phase || saved.data.gameflow || '',
    savedAt: saved.at,
  };
}

async function loadChampIndex() {
  if (champIndex.byId && Date.now() - champIndex.at < 12 * 60 * 60 * 1000) return champIndex.byId;
  const versions = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
    signal: AbortSignal.timeout(8000),
  }).then((r) => r.json());
  const version = versions[0];
  const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`, {
    signal: AbortSignal.timeout(12000),
  }).then((r) => r.json());
  const byId = {};
  Object.values(data.data || {}).forEach((c) => {
    byId[Number(c.key)] = {
      id: Number(c.key),
      key: c.id,
      name: c.name,
      tags: c.tags || [],
    };
  });
  champIndex = { at: Date.now(), byId };
  return byId;
}

const POS_LABEL = {
  top: 'Top',
  jungle: 'Jungle',
  middle: 'Mid',
  mid: 'Mid',
  bottom: 'ADC',
  adc: 'ADC',
  utility: 'Support',
  support: 'Support',
};

const SELECT_PATHS = [
  '/lol-champ-select/v1/session',
  '/lol-lobby-team-builder/champ-select/v1/session',
];

function flattenActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.flat().filter((a) => a && typeof a === 'object');
}

function actionChamp(cellId, actions, type) {
  const matches = flattenActions(actions).filter((a) => (
    a.actorCellId === cellId
    && String(a.type || '').toLowerCase() === type
    && Number(a.championId) > 0
  ));
  return Number(matches[matches.length - 1]?.championId) || 0;
}

function collectBansByTeam(session) {
  const ally = (session.bans?.myTeamBans || []).map(Number).filter((id) => id > 0);
  const enemy = (session.bans?.theirTeamBans || []).map(Number).filter((id) => id > 0);
  if (ally.length || enemy.length) return { ally, enemy };

  const myCells = new Set((session.myTeam || []).map((row) => row.cellId));
  const fromActions = { ally: [], enemy: [] };
  flattenActions(session.actions)
    .filter((a) => String(a.type || '').toLowerCase() === 'ban' && a.completed && Number(a.championId) > 0)
    .forEach((a) => {
      const id = Number(a.championId);
      if (myCells.has(a.actorCellId)) fromActions.ally.push(id);
      else fromActions.enemy.push(id);
    });
  return fromActions;
}

function mapSeat(row, byId, localCellId, actions) {
  const fromAction = actionChamp(row.cellId, actions, 'pick');
  const championId = Number(row.championId || 0) || fromAction || 0;
  const intentId = Number(row.championPickIntent || 0) || 0;
  const shown = championId || intentId || fromAction;
  const meta = shown ? byId[shown] : null;
  return {
    cellId: row.cellId,
    isYou: row.cellId === localCellId,
    position: POS_LABEL[String(row.assignedPosition || '').toLowerCase()] || '',
    championId,
    intentId,
    shownId: shown,
    name: meta?.key || null,
    displayName: meta?.name || null,
    tags: meta?.tags || [],
    spells: [row.spell1Id, row.spell2Id],
    locked: championId > 0,
  };
}

async function fetchSelectSession(creds) {
  for (const apiPath of SELECT_PATHS) {
    const session = await lcuGetSoft(creds, apiPath);
    if (session && (session.myTeam || session.theirTeam || session.actions)) return session;
  }
  return null;
}

async function loadOwnedIds(creds) {
  if (ownedCache.ids.length && Date.now() - ownedCache.at < 60_000) return ownedCache.ids;
  try {
    const raw = await lcuGet(creds, '/lol-champions/v1/owned-champions-minimal');
    const ids = (Array.isArray(raw) ? raw : [])
      .filter((c) => c && (c.ownership?.owned ?? c.owned) && Number(c.id) > 0)
      .map((c) => Number(c.id));
    if (ids.length) {
      ownedCache = { at: Date.now(), ids };
      return ids;
    }
  } catch { /* fallback */ }
  const fromCollections = (cache.data?.champions || []).filter((c) => c.owned).map((c) => c.id);
  ownedCache = { at: Date.now(), ids: fromCollections };
  return fromCollections;
}

function enrichBans(ids, byId) {
  return (ids || []).map((id) => {
    const meta = byId[Number(id)];
    return { id: Number(id), key: meta?.key || null, name: meta?.name || null };
  }).filter((b) => b.id > 0);
}

function buildDraftPayload(session, byId, extra = {}) {
  const actions = flattenActions(session.actions);
  const localCellId = session.localPlayerCellId;
  const allies = (session.myTeam || []).map((row) => mapSeat(row, byId, localCellId, actions));
  const enemies = (session.theirTeam || []).map((row) => mapSeat(row, byId, localCellId, actions));
  const you = allies.find((p) => p.isYou) || null;
  const yourAction = actions.find((a) => a.actorCellId === localCellId && a.isInProgress) || null;
  const banSplit = collectBansByTeam(session);
  return {
    connected: true,
    you,
    allies,
    enemies,
    bans: enrichBans([...banSplit.ally, ...banSplit.enemy], byId),
    allyBans: enrichBans(banSplit.ally, byId),
    enemyBans: enrichBans(banSplit.enemy, byId),
    acting: yourAction ? {
      id: yourAction.id,
      type: yourAction.type,
      isPick: String(yourAction.type).toLowerCase() === 'pick',
      isBan: String(yourAction.type).toLowerCase() === 'ban',
    } : null,
    phase: session.timer?.phase || extra.phase || 'BAN_PICK',
    ...extra,
  };
}

function rememberDraft(data) {
  if (!draftWorthSaving(data)) return;
  lastDraft = {
    at: Date.now(),
    data: {
      ...data,
      inSelect: false,
      source: 'last-draft',
      acting: null,
    },
  };
  writeLastDraft(lastDraft);
}

async function getChampSelect() {
  const creds = await getCredentials();
  if (!creds) {
    return savedDraftPayload('', false) || { connected: false, inSelect: false, reason: 'client-closed' };
  }

  let session;
  let phase = '';
  try {
    const [flow, select] = await Promise.all([
      lcuGetSoft(creds, '/lol-gameflow/v1/gameflow-phase').catch(() => null),
      fetchSelectSession(creds),
    ]);
    phase = typeof flow === 'string' ? flow : '';
    session = select;
  } catch {
    credsCache = { at: 0, creds: null };
    return savedDraftPayload('', false) || { connected: false, inSelect: false, reason: 'client-closed' };
  }

  if (!session) {
    return savedDraftPayload(phase, true) || { connected: true, inSelect: false, reason: 'idle', gameflow: phase };
  }

  const byId = await loadChampIndex().catch(() => ({}));
  const [pickable, owned, bannable] = await Promise.all([
    lcuGetSoft(creds, '/lol-champ-select/v1/pickable-champion-ids').catch(() => null),
    loadOwnedIds(creds),
    lcuGetSoft(creds, '/lol-champ-select/v1/bannable-champion-ids').catch(() => null),
  ]);

  const payload = buildDraftPayload(session, byId, {
    inSelect: true,
    source: 'champ-select',
    reason: '',
    gameflow: phase,
    pickable: Array.isArray(pickable) ? pickable.map(Number) : [],
    bannable: Array.isArray(bannable) ? bannable.map(Number) : [],
    owned,
  });
  rememberDraft(payload);
  return payload;
}

async function applyRunePage(page) {
  const creds = await getCredentials();
  if (!creds) return { ok: false, error: 'League client is not open.' };

  const selectedPerkIds = (page.selectedPerkIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0);
  if (selectedPerkIds.length < 9) {
    return { ok: false, error: 'Rune page is incomplete.' };
  }

  const payload = {
    name: String(page?.name || 'Rift Draft').slice(0, 20),
    primaryStyleId: Number(page.primaryStyleId),
    subStyleId: Number(page.subStyleId),
    selectedPerkIds: selectedPerkIds.slice(0, 9),
    current: true,
  };

  try {
    const pages = await lcuGet(creds, '/lol-perks/v1/pages');
    const list = Array.isArray(pages) ? pages : [];
    const editable = list.filter((p) => p && p.isEditable !== false && Number(p.id) > 0);
    const target = editable.find((p) => /^Rift |^GD /i.test(String(p.name || '')))
      || editable.find((p) => p.current)
      || editable[editable.length - 1]
      || null;

    if (target?.id) {
      await lcuSend(creds, 'PUT', `/lol-perks/v1/pages/${target.id}`, {
        ...payload,
        id: target.id,
        name: payload.name,
      });
      try {
        await lcuSend(creds, 'PUT', '/lol-perks/v1/currentpage', { id: target.id });
      } catch { /* current flag on the page is enough */ }
      const spells = await applySummonerSpells(creds, page.spells);
      return { ok: true, updated: true, spells: !!spells.ok };
    }

    let remaining = 1;
    try {
      const inv = await lcuGetSoft(creds, '/lol-perks/v1/inventory');
      if (inv && Number.isFinite(inv.remainingPageCount)) remaining = inv.remainingPageCount;
    } catch { /* assume we can create */ }

    if (remaining <= 0) {
      return { ok: false, error: 'No editable rune page left in the client. Delete one empty page, then try again.' };
    }

    await lcuSend(creds, 'POST', '/lol-perks/v1/pages', payload);
    const spells = await applySummonerSpells(creds, page.spells);
    return { ok: true, created: true, spells: !!spells.ok };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not write runes.' };
  }
}

async function applySummonerSpells(creds, spells) {
  const ids = (spells || []).map(Number).filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length < 2) return { ok: false, skipped: true };
  try {
    const session = await fetchSelectSession(creds);
    if (!session) return { ok: false, skipped: true };
    await lcuSend(creds, 'PATCH', '/lol-champ-select/v1/session/my-selection', {
      spell1Id: ids[0],
      spell2Id: ids[1],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not set summoner spells.' };
  }
}

async function selectChampion(championId, lock = false) {
  const creds = await getCredentials();
  if (!creds) return { ok: false, error: 'League client is not open.' };
  const id = Number(championId);
  if (!id) return { ok: false, error: 'No champion selected.' };
  try {
    const session = await fetchSelectSession(creds);
    if (!session) return { ok: false, error: 'Not in champ select.' };
    const local = session.localPlayerCellId;
    const actions = flattenActions(session.actions);
    const current = actions.find((a) => a.actorCellId === local && a.isInProgress)
      || actions.find((a) => a.actorCellId === local && !a.completed);
    if (!current?.id) return { ok: false, error: 'Not your turn.' };
    await lcuSend(creds, 'PATCH', `/lol-champ-select/v1/session/actions/${current.id}`, {
      championId: id,
      completed: !!lock,
    });
    return { ok: true, locked: !!lock, type: current.type };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not select that champion.' };
  }
}

async function gameflowPhase() {
  const creds = await getCredentials();
  if (!creds) return { connected: false, phase: null };
  try {
    const phase = await lcuGet(creds, '/lol-gameflow/v1/gameflow-phase');
    const value = typeof phase === 'string' ? phase : String(phase || '');
    return { connected: true, phase: value.replace(/^"+|"+$/g, '') };
  } catch {
    try {
      const session = await lcuGet(creds, '/lol-gameflow/v1/session');
      const phase = session?.phase || session?.gameflowPhase || '';
      return { connected: true, phase: String(phase || 'Unknown') };
    } catch {
      return { connected: true, phase: 'Unknown' };
    }
  }
}

const REGION_TO_PLATFORM = {
  EUW: 'EUW1', EUNE: 'EUN1', NA: 'NA1', KR: 'KR', BR: 'BR1',
  LAN: 'LA1', LAS: 'LA2', OCE: 'OC1', JP: 'JP1', TR: 'TR1',
  RU: 'RU', PH: 'PH2', SG: 'SG2', TH: 'TH2', TW: 'TW2', VN: 'VN2', ME: 'ME1',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queueType(queueId) {
  if (Number(queueId) === 420) return 'RANKED_SOLO_5x5';
  if (Number(queueId) === 440) return 'RANKED_FLEX_SR';
  if (Number(queueId) === 700) return 'CLASH';
  return '';
}

function spectatePayload(game) {
  return {
    allowObserveMode: 'ALL',
    dropInSpectateGameId: String(game.gameId || ''),
    gameQueueType: queueType(game.queueId),
    puuid: String(game.puuid || ''),
    spectatorKey: String(game.encryptionKey || ''),
  };
}

function spectatorCommand(game, host) {
  const key = String(game.encryptionKey || '');
  const gameId = String(game.gameId || '');
  const platformId = String(game.platformId || '').toUpperCase();
  return `spectator ${host} ${key} ${gameId} ${platformId}`;
}

function humanSpectateError(raw) {
  const msg = String(raw || '');
  if (/busy|InProgress|ChampSelect|queue/i.test(msg)) {
    return 'League is in a game or queue. Finish or leave that, stay on the home screen, then spectate.';
  }
  if (/spectator key/i.test(msg)) {
    return 'Spectator key was missing. Refresh the live list, then try again.';
  }
  return 'League could not start spectator. Stay on the client home screen, then try again.';
}

async function getClientPlatform() {
  const creds = await getCredentials();
  if (!creds) return null;
  try {
    const info = await lcuGet(creds, '/riotclient/region-locale');
    const region = String(info?.region || info?.webRegion || '').toUpperCase();
    if (REGION_TO_PLATFORM[region]) return REGION_TO_PLATFORM[region];
    if (region) return region;
  } catch { /* try platform config */ }
  try {
    const cfg = await lcuGet(creds, '/lol-platform-config/v1/namespaces/LoginDataPacket');
    const id = String(cfg?.platformId || '').toUpperCase();
    if (id) return id;
  } catch { /* ignore */ }
  return null;
}

async function dismissLeftover(creds) {
  const paths = [
    ['POST', '/lol-gameflow/v1/pre-end-of-game/complete', {}],
    ['POST', '/lol-end-of-game/v1/state/dismiss-stats', {}],
  ];
  for (const [method, apiPath, body] of paths) {
    try { await lcuSend(creds, method, apiPath, body, 1500); }
    catch { /* leftover may already be gone */ }
  }
}

async function launchedPhase() {
  const next = await gameflowPhase();
  return /InProgress|Watch|GameStart/i.test(String(next.phase || ''));
}

async function postSpectate(creds, path, body) {
  try {
    await lcuSend(creds, 'POST', path, body, 2500);
    return { ok: true };
  } catch (err) {
    if (err.timeout || await launchedPhase()) return { ok: true, via: 'pending' };
    return { ok: false, error: err.message || String(err) };
  }
}

async function launchSpectate(game) {
  const creds = await getCredentials();
  if (!creds) {
    return {
      ok: false,
      reason: 'no-client',
      error: 'Open the League client first, stay on the home screen, then spectate.',
    };
  }

  const clientPlatform = await getClientPlatform();
  const gamePlatform = String(game.platformId || '').toUpperCase();
  if (clientPlatform && gamePlatform && clientPlatform !== gamePlatform) {
    return {
      ok: false,
      reason: 'region',
      clientPlatform,
      gamePlatform,
      error: `This game is ${gamePlatform}. Your League client is ${clientPlatform} — switch servers, or pick a ${clientPlatform} game.`,
    };
  }

  let flow = await gameflowPhase();
  const leftover = /WaitingForStats|PreEndOfGame|EndOfGame|TerminatedInError/i;
  if (leftover.test(String(flow.phase || ''))) {
    await dismissLeftover(creds);
    await sleep(300);
    flow = await gameflowPhase();
  }

  const busy = /InProgress|ChampSelect|ReadyCheck|Matchmaking|Reconnect|GameStart|Watch/i;
  if (busy.test(String(flow.phase || ''))) {
    return {
      ok: false,
      reason: 'busy',
      phase: flow.phase,
      error: 'League is in a game or queue. Finish or leave that, stay on the home screen, then spectate.',
    };
  }

  const host = String(game.observerHost || '');
  const line = spectatorCommand(game, host);
  const info = spectatePayload(game);
  const first = await postSpectate(creds, '/lol-gameflow/v1/watch/launch', [line]);
  if (first.ok) return { ok: true, via: 'lcu' };

  await sleep(400);
  if (await launchedPhase()) return { ok: true, via: 'lcu' };

  const second = await postSpectate(creds, '/lol-spectator/v1/spectate/launch', info);
  if (second.ok) return { ok: true, via: 'lcu' };

  return { ok: false, reason: 'lcu', error: humanSpectateError(first.error || second.error) };
}

async function leagueGameExe(creds) {
  const found = creds || await getCredentials();
  const dir = found?.installDir;
  if (!dir) return '';
  const exe = path.join(dir, 'Game', 'League of Legends.exe');
  return fs.existsSync(exe) ? exe : '';
}

function asList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(asList);
  if (typeof value !== 'object') return [];
  if (Array.isArray(value.leagueNotifications)) return value.leagueNotifications.flatMap(asList);
  if (Array.isArray(value.notifications)) return value.notifications.flatMap(asList);
  if (value.notification && typeof value.notification === 'object') return asList(value.notification);
  return [value];
}

function noteFields(note) {
  if (!note || typeof note !== 'object') return null;
  const lp = Number(note.leaguePoints);
  const lpDelta = Number(
    note.leaguePointsDelta ?? note.lpDelta ?? note.lpChange ?? note.leaguePointsChange,
  );
  const gameId = note.gameId ?? note.game_id ?? null;
  return {
    queueType: note.queueType || note.queue || null,
    tier: note.tier || null,
    division: note.division || note.rank || null,
    gameId: gameId != null && String(gameId) ? String(gameId) : null,
    lp: Number.isFinite(lp) ? lp : null,
    lpDelta: Number.isFinite(lpDelta) ? lpDelta : null,
  };
}

function queuePack(stats, notes) {
  return (queueType) => {
    const q = stats?.queueMap?.[queueType]
      || (Array.isArray(stats?.queues) ? stats.queues.find((row) => row?.queueType === queueType) : null);
    const queueNotes = notes.filter((n) => !n.queueType || n.queueType === queueType);
    return {
      highestTier: q?.highestTier || null,
      highestDivision: q?.highestDivision || q?.highestRank || null,
      notes: queueNotes,
    };
  };
}

async function lcuTry(creds, apiPath) {
  try {
    return await lcuGet(creds, apiPath);
  } catch {
    return null;
  }
}

async function getRankedInsight() {
  const creds = await getCredentials();
  if (!creds) return { ok: false };
  let me = null;
  try {
    me = await lcuGet(creds, '/lol-summoner/v1/current-summoner');
  } catch {
    return { ok: false };
  }
  const [stats, notifications, lastChange] = await Promise.all([
    lcuTry(creds, '/lol-ranked/v1/current-ranked-stats'),
    lcuTry(creds, '/lol-ranked/v1/notifications'),
    lcuTry(creds, '/lol-ranked/v1/current-lp-change-notification'),
  ]);
  const notes = [...asList(notifications), ...asList(lastChange)]
    .map(noteFields)
    .filter(Boolean);
  const pack = queuePack(stats, notes);
  const ident = summonerFrom(me);
  const riotId = ident?.gameName && ident?.tagLine
    ? `${ident.gameName}#${ident.tagLine}`
    : '';
  return {
    ok: true,
    riotId,
    solo: pack('RANKED_SOLO_5x5'),
    flex: pack('RANKED_FLEX_SR'),
  };
}

function register(ipcMain) {
  ipcMain.handle('lcu:status', () => getStatus());
  ipcMain.handle('lcu:collections', (_e, force) => getCollections(!!force));
  ipcMain.handle('lcu:champSelect', () => getChampSelect());
  ipcMain.handle('lcu:applyRunes', (_e, page) => applyRunePage(page));
  ipcMain.handle('lcu:selectChamp', (_e, payload) => selectChampion(payload?.championId, !!payload?.lock));
  ipcMain.handle('lcu:rankedInsight', () => getRankedInsight());
}

module.exports = {
  getCollections,
  getStatus,
  assertLoggedInAs,
  getChampSelect,
  applyRunePage,
  launchSpectate,
  gameflowPhase,
  leagueGameExe,
  register,
};
