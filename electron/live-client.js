const https = require('https');

const LIVE_URL = 'https://127.0.0.1:2999/liveclientdata/allgamedata';
const ACTIVE_URL = 'https://127.0.0.1:2999/liveclientdata/activeplayer';
/** Keep in-base briefly after a *confirmed* fountain stay. */
const FOUNTAIN_STICKY_MS = 14000;
/** Consecutive fountain polls before in-base (~0.8s at 400ms). */
const FOUNTAIN_CONFIRM_POLLS = 2;
const JUNGLE_PETS = new Set([1101, 1102, 1103]);
let lastFountainSignalAt = 0;
let prevVitals = null;
let wasDead = false;
let fountainConfirmStreak = 0;
let noFountainStreak = 0;
let prevShop = null;
let regenBaseline = 0;
let manaRegenBaseline = 0;
let lastMissingAt = 0;
let lastManaMissingAt = 0;
let lastDamagedAt = 0;
/** After mana returns to full (fountain), keep treating as base for a bit. */
let manaFilledFountainUntil = 0;
let snapCache = null;
let snapCacheAt = 0;
const SNAP_CACHE_MS = 850;

function resetFountainState() {
  lastFountainSignalAt = 0;
  prevVitals = null;
  wasDead = false;
  fountainConfirmStreak = 0;
  noFountainStreak = 0;
  prevShop = null;
  regenBaseline = 0;
  manaRegenBaseline = 0;
  lastMissingAt = 0;
  lastManaMissingAt = 0;
  lastDamagedAt = 0;
  manaFilledFountainUntil = 0;
}

const INTERESTING = new Set([
  'FirstBlood',
  'Multikill',
  'Ace',
  'DragonKill',
  'HeraldKill',
  'BaronKill',
  'HordeKill',
  'TurretKilled',
  'InhibKilled',
  'DragonSoulGiven',
]);

/**
 * Live Client has no "inBase" flag.
 * Jungle pet heals are HP-only — mana restore / shop spend is the reliable fountain signal.
 */
function computeInBase(stats, youRow, gameTime, ownedItemIds = [], opts = {}) {
  const now = Date.now();
  const regen = Number(stats.healthRegenRate) || 0;
  const maxHp = Math.max(1, Number(stats.maxHealth) || 1);
  const hp = Number(stats.currentHealth) || 0;
  const manaRegen = Number(stats.resourceRegenRate) || 0;
  const maxMana = Number(stats.resourceMax) || 0;
  const mana = Number(stats.resourceValue) || 0;
  const resourceType = String(stats.resourceType || '').toUpperCase();
  const usesMana = resourceType === 'MANA' && maxMana > 40;
  const isDead = Boolean(youRow.isDead) || Number(youRow.respawnTimer) > 0.4;
  const jungler = Boolean(opts.hasSmite)
    || (ownedItemIds || []).some((id) => JUNGLE_PETS.has(Number(id)));
  const gold = Math.max(0, Number(opts.gold) || 0);
  const itemKey = (ownedItemIds || []).join(',');
  const gt = Number(gameTime) || 0;

  const hpRegenNeed = jungler ? Math.max(90, maxHp * 0.07) : Math.max(45, maxHp * 0.038);
  const manaRegenNeed = Math.max(22, maxMana * 0.035);
  const hpDeltaNeed = jungler ? maxHp * 0.085 : maxHp * 0.045;
  const manaDeltaNeed = Math.max(18, maxMana * 0.03);

  let signal = false;
  let instant = false;

  // Match start at fountain (ends before typical first clear/recall).
  if (gt < 28) {
    signal = true;
    instant = true;
  }

  if (isDead) {
    signal = true;
    instant = true;
    wasDead = true;
  } else if (wasDead) {
    signal = true;
    instant = true;
    wasDead = false;
  }

  // Bought in shop → fountain / shop.
  if (prevShop) {
    const spent = gold < prevShop.gold - 40;
    const gainedItem = itemKey !== prevShop.itemKey
      && (ownedItemIds || []).length >= (prevShop.count || 0);
    if (spent && gainedItem) {
      signal = true;
      instant = true;
    }
  }
  prevShop = { gold, itemKey, count: (ownedItemIds || []).length };

  const strongHpRegen = regen >= hpRegenNeed;
  const strongManaRegen = maxMana > 40 && manaRegen >= manaRegenNeed;
  if (strongHpRegen && strongManaRegen) signal = true;
  else if (!jungler && strongHpRegen) signal = true;
  else if (strongHpRegen && maxMana <= 40) signal = true;
  else if (usesMana && strongManaRegen) signal = true;
  else if (!usesMana && strongHpRegen) signal = true; // fury / energy / none — HP fountain regen

  if (regenBaseline > 8 && regen >= Math.max(hpRegenNeed * 0.65, regenBaseline * 2.4)) {
    signal = true;
  }
  if (usesMana && manaRegenBaseline > 5
    && manaRegen >= Math.max(manaRegenNeed * 0.65, manaRegenBaseline * 2.2)) {
    signal = true;
  }

  const missingHp = hp < maxHp - 20;
  const missingMana = usesMana && mana < maxMana - 15;
  if (missingHp || missingMana) lastMissingAt = now;
  if (missingMana) lastManaMissingAt = now;

  if (prevVitals) {
    const dt = Math.max(0.15, (now - prevVitals.t) / 1000);
    if (!isDead && hp < prevVitals.hp - 4) {
      lastFountainSignalAt = 0;
      fountainConfirmStreak = 0;
      noFountainStreak = 8;
      lastDamagedAt = now;
      manaFilledFountainUntil = 0;
    }
    const dHp = (hp - prevVitals.hp) / dt;
    const dMana = (mana - prevVitals.mana) / dt;
    const notDamaged = !lastDamagedAt || (now - lastDamagedAt) > 900;

    // Mana ticking up while low = fountain (pets / clears do not restore mana).
    if (!isDead && missingMana && dMana >= manaDeltaNeed && notDamaged) {
      signal = true;
    }
    // Non-jungler or non-mana: HP fountain heal.
    if ((!jungler || !usesMana) && !isDead && missingHp && dHp >= hpDeltaNeed && notDamaged) {
      signal = true;
    }
    // Jungler + mana: HP heal counts when mana is also recovering.
    if (jungler && usesMana && !isDead && missingHp && dHp >= hpDeltaNeed && notDamaged
      && (dMana >= manaDeltaNeed * 0.35 || strongManaRegen || missingMana)) {
      signal = true;
    }

    // Mana just topped off after being low → landed on fountain.
    if (!isDead && usesMana && notDamaged && lastManaMissingAt > 0
      && (now - lastManaMissingAt) < 10000
      && mana >= maxMana - 12
      && prevVitals.mana < maxMana - 15) {
      signal = true;
      instant = true;
      manaFilledFountainUntil = now + 10000;
    }

    // Non-mana champ topped HP after being low + strong regen → fountain.
    if (!usesMana && !isDead && notDamaged && lastMissingAt > 0
      && (now - lastMissingAt) < 10000
      && hp >= maxHp - 12
      && prevVitals.hp < maxHp - 20
      && (strongHpRegen || dHp >= hpDeltaNeed)) {
      signal = true;
      instant = true;
      manaFilledFountainUntil = now + 10000;
    }
  }

  // Stay in base after mana fill so standing full still counts for the toast.
  if (manaFilledFountainUntil > now && (!lastDamagedAt || (now - lastDamagedAt) > 900)) {
    signal = true;
  }

  prevVitals = { hp, mana, t: now };

  if (signal) {
    fountainConfirmStreak += 1;
    noFountainStreak = 0;
  } else {
    fountainConfirmStreak = 0;
    noFountainStreak += 1;
    if (noFountainStreak >= 2) lastFountainSignalAt = 0;
    if (!isDead) {
      regenBaseline = regenBaseline > 0 ? regenBaseline * 0.88 + regen * 0.12 : regen;
      if (maxMana > 40) {
        manaRegenBaseline = manaRegenBaseline > 0
          ? manaRegenBaseline * 0.88 + manaRegen * 0.12
          : manaRegen;
      }
    }
  }

  if (instant || fountainConfirmStreak >= FOUNTAIN_CONFIRM_POLLS) {
    lastFountainSignalAt = now;
  }

  const inBase = lastFountainSignalAt > 0 && (now - lastFountainSignalAt) < FOUNTAIN_STICKY_MS;

  return {
    inBase,
    isDead,
    healthRegen: regen,
    hp: Math.round(hp),
    hpMax: Math.round(maxHp),
    resource: Math.round(mana),
    resourceMax: Math.round(maxMana),
  };
}

function nameMatches(name, keys) {
  const n = normName(name);
  if (!n) return false;
  if (keys.has(n)) return true;
  const hash = n.lastIndexOf('#');
  if (hash > 0 && keys.has(n.slice(0, hash))) return true;
  for (const key of keys) {
    if (key && (n === key || n.startsWith(`${key}#`) || key.startsWith(`${n}#`))) return true;
  }
  return false;
}

function shortName(name) {
  const n = String(name || '').trim();
  const hash = n.indexOf('#');
  return hash > 0 ? n.slice(0, hash) : n;
}

function teamNameKeys(raw, youRow, active) {
  const keys = new Set([...playerKeys(youRow), ...playerKeys(active)]);
  const team = youRow.team || active.team;
  if (!team) return keys;
  for (const p of raw.allPlayers || []) {
    if (p.team === team) {
      for (const key of playerKeys(p)) keys.add(key);
    }
  }
  return keys;
}

function involvedWithTeam(ev, keys) {
  if (nameMatches(ev.KillerName, keys) || nameMatches(ev.Recipient, keys)) return true;
  return (ev.Assisters || []).some((n) => nameMatches(n, keys));
}

function turretOwner(turretId) {
  const id = String(turretId || '');
  if (/_T1_/.test(id)) return 'ORDER';
  if (/_T2_/.test(id)) return 'CHAOS';
  return '';
}

function multiLabel(streak) {
  const n = Number(streak) || 0;
  if (n >= 5) return 'Penta kill';
  if (n === 4) return 'Quadra kill';
  if (n === 3) return 'Triple kill';
  if (n === 2) return 'Double kill';
  return '';
}

function dragonClipLabel(ev) {
  const raw = String(ev.DragonType || '').trim().toLowerCase();
  const names = {
    fire: 'Infernal Drake',
    infernal: 'Infernal Drake',
    water: 'Ocean Drake',
    ocean: 'Ocean Drake',
    earth: 'Mountain Drake',
    mountain: 'Mountain Drake',
    air: 'Cloud Drake',
    cloud: 'Cloud Drake',
    hextech: 'Hextech Drake',
    chemtech: 'Chemtech Drake',
    elder: 'Elder Dragon',
  };
  const name = names[raw] || (ev.DragonType ? `${ev.DragonType} Drake` : 'Drake');
  return ev.Stolen ? `${name} stolen` : name;
}

function recorderEventsFromRaw(raw, youRow, active) {
  const you = new Set([...playerKeys(youRow), ...playerKeys(active)]);
  const team = teamNameKeys(raw, youRow, active);
  const youTeam = youRow.team || active.team || '';
  const events = (raw.events && raw.events.Events) || [];
  const out = [];
  for (const ev of events) {
    const name = ev.EventName;
    if (name === 'ChampionKill') {
      const victim = ev.VictimName ? shortName(ev.VictimName) : '';
      if (nameMatches(ev.VictimName, you)) {
        const killer = ev.KillerName ? shortName(ev.KillerName) : '';
        out.push({
          id: `d-${ev.EventID}`,
          type: 'death',
          label: killer ? `Death · ${killer}` : 'Death',
          time: ev.EventTime || 0,
        });
        continue;
      }
      if (nameMatches(ev.KillerName, you)) {
        out.push({
          id: ev.EventID,
          type: 'kill',
          label: victim ? `Kill · ${victim}` : 'Kill',
          time: ev.EventTime || 0,
        });
        continue;
      }
      const assisters = Array.isArray(ev.Assisters) ? ev.Assisters : [];
      if (assisters.some((a) => nameMatches(a, you))) {
        out.push({
          id: `a-${ev.EventID}`,
          type: 'assist',
          label: victim ? `Assist · ${victim}` : 'Assist',
          time: ev.EventTime || 0,
        });
      }
      continue;
    }
    if (name === 'Multikill') {
      const label = multiLabel(ev.KillStreak);
      if (label && nameMatches(ev.KillerName, team)) {
        const who = shortName(ev.KillerName);
        const yours = nameMatches(ev.KillerName, you);
        out.push({
          id: ev.EventID,
          type: 'multikill',
          label: who && !yours ? `${label} · ${who}` : label,
          time: ev.EventTime || 0,
        });
      }
      continue;
    }
    if (name === 'FirstBlood' && nameMatches(ev.Recipient || ev.KillerName, you)) {
      out.push({
        id: ev.EventID,
        type: 'firstblood',
        label: 'First blood',
        time: ev.EventTime || 0,
      });
      continue;
    }
    if (name === 'BaronKill' && involvedWithTeam(ev, team)) {
      out.push({
        id: ev.EventID,
        type: 'baron',
        label: ev.Stolen ? 'Baron stolen' : 'Baron',
        time: ev.EventTime || 0,
      });
      continue;
    }
    if (name === 'DragonKill' && involvedWithTeam(ev, team)) {
      out.push({
        id: ev.EventID,
        type: 'dragon',
        label: dragonClipLabel(ev),
        time: ev.EventTime || 0,
      });
      continue;
    }
    if ((name === 'HeraldKill' || name === 'HordeKill') && involvedWithTeam(ev, team)) {
      out.push({
        id: ev.EventID,
        type: name === 'HordeKill' ? 'grub' : 'herald',
        label: name === 'HordeKill'
          ? (ev.Stolen ? 'Grubs stolen' : 'Void grubs')
          : (ev.Stolen ? 'Herald stolen' : 'Herald'),
        time: ev.EventTime || 0,
      });
      continue;
    }
    if (name === 'TurretKilled') {
      const owner = turretOwner(ev.TurretKilled);
      const enemyTurret = !!(owner && youTeam && owner !== youTeam);
      const unknownTurret = !owner && involvedWithTeam(ev, team);
      if (enemyTurret || unknownTurret) {
        out.push({
          id: ev.EventID,
          type: 'tower',
          label: 'Tower',
          time: ev.EventTime || 0,
        });
      }
    }
  }
  return out;
}

function fetchLiveJson(url = LIVE_URL) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      rejectUnauthorized: false,
      timeout: 700,
      headers: { Accept: 'application/json' },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Live client ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Live client timeout'));
    });
    req.on('error', reject);
  });
}

function playerName(p = {}) {
  return p.riotId || [p.riotIdGameName, p.riotIdTagLine].filter(Boolean).join('#') || p.summonerName || '';
}

function normName(s) {
  return String(s || '').trim().toLowerCase();
}

function playerKeys(p = {}) {
  const riotId = normName(p.riotId);
  const gameName = normName(p.riotIdGameName);
  const tag = normName(p.riotIdTagLine);
  const summoner = normName(p.summonerName);
  const keys = new Set();
  if (riotId) keys.add(riotId);
  if (gameName && tag) keys.add(`${gameName}#${tag}`);
  if (gameName) keys.add(gameName);
  if (summoner) {
    keys.add(summoner);
    const hash = summoner.lastIndexOf('#');
    if (hash > 0) keys.add(summoner.slice(0, hash));
  }
  return keys;
}

function samePlayer(a, b) {
  const A = playerKeys(a);
  const B = playerKeys(b);
  for (const key of A) {
    if (B.has(key)) return true;
  }
  return false;
}

/** True if either summoner spell is Smite (Practice Tool / missing lane → jungle). */
function playerHasSmite(player) {
  const spells = player?.summonerSpells || {};
  const parts = [
    spells.summonerSpellOne,
    spells.summonerSpellTwo,
    spells.spellOne,
    spells.spellTwo,
  ];
  for (const s of parts) {
    if (!s) continue;
    const blob = `${s.displayName || ''} ${s.rawDisplayName || ''} ${s.rawDescription || ''}`.toLowerCase();
    if (blob.includes('smite')) return true;
  }
  return false;
}

function findYouRow(raw) {
  const active = raw.activePlayer || {};
  const players = raw.allPlayers || [];
  return players.find((p) => samePlayer(active, p))
    || players.find((p) => !p.isBot)
    || players[0]
    || {};
}

function readCs(...sources) {
  let best = 0;
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const key of ['creepScore', 'cs', 'minionsKilled', 'totalMinionsKilled']) {
      const n = Number(src[key]);
      if (Number.isFinite(n) && n > best) best = n;
    }
    const jungle = Number(src.neutralMinionsKilled ?? src.jungleMinionsKilled);
    const lane = Number(src.totalMinionsKilled ?? src.minionsKilled);
    if (Number.isFinite(jungle) && Number.isFinite(lane) && jungle + lane > best) {
      best = jungle + lane;
    }
  }
  return best;
}

function emptyTeamTotals() {
  return { gold: 0, kills: 0, deaths: 0, dragons: 0, barons: 0, heralds: 0, towers: 0 };
}

function playerGoldEstimate(p, active, activeGold) {
  const itemGold = (p.items || []).reduce((sum, it) => {
    if (!it?.itemID) return sum;
    return sum + (Number(it.price) || 0) * Math.max(1, Number(it.count) || 1);
  }, 0);
  if (samePlayer(p, active)) {
    return itemGold + Math.max(0, Number(activeGold) || 0);
  }
  const cs = readCs(p.scores, p);
  const kills = Number(p.scores?.kills) || 0;
  const assists = Number(p.scores?.assists) || 0;
  const level = Number(p.level) || 1;
  return itemGold + cs * 21 + (kills + assists * 0.55) * 300 + level * 14;
}

function killerTeam(ev, players) {
  const killer = String(ev.KillerName || ev.Recipient || '').trim();
  if (!killer) return '';
  for (const p of players) {
    if (nameMatches(killer, playerKeys(p))) return p.team || '';
  }
  return '';
}

function teamTotalsFromRaw(raw, active, activeGold) {
  const totals = { ORDER: emptyTeamTotals(), CHAOS: emptyTeamTotals() };
  const players = raw.allPlayers || [];
  for (const p of players) {
    const team = p.team === 'CHAOS' ? 'CHAOS' : 'ORDER';
    const bucket = totals[team];
    bucket.gold += playerGoldEstimate(p, active, activeGold);
    bucket.kills += Number(p.scores?.kills) || 0;
    bucket.deaths += Number(p.scores?.deaths) || 0;
  }
  const events = (raw.events && raw.events.Events) || [];
  for (const ev of events) {
    const name = ev.EventName;
    if (name === 'DragonKill') {
      const t = killerTeam(ev, players);
      if (totals[t]) totals[t].dragons += 1;
      continue;
    }
    if (name === 'BaronKill') {
      const t = killerTeam(ev, players);
      if (totals[t]) totals[t].barons += 1;
      continue;
    }
    if (name === 'HeraldKill' || name === 'HordeKill') {
      const t = killerTeam(ev, players);
      if (totals[t]) totals[t].heralds += 1;
      continue;
    }
    if (name === 'TurretKilled') {
      const owner = turretOwner(ev.TurretKilled);
      if (owner === 'ORDER') totals.CHAOS.towers += 1;
      else if (owner === 'CHAOS') totals.ORDER.towers += 1;
    }
  }
  return totals;
}

function formatEvent(ev) {
  if (!ev) return '';
  if (ev.EventName === 'DragonKill') {
    const kind = ev.DragonType || 'Dragon';
    return ev.Stolen ? `${kind} stolen` : kind;
  }
  if (ev.EventName === 'HeraldKill') return ev.Stolen ? 'Herald stolen' : 'Herald';
  if (ev.EventName === 'BaronKill') return ev.Stolen ? 'Baron stolen' : 'Baron';
  if (ev.EventName === 'HordeKill') return 'Voidgrubs';
  if (ev.EventName === 'TurretKilled') return 'Turret';
  if (ev.EventName === 'InhibKilled') return 'Inhib';
  if (ev.EventName === 'DragonSoulGiven') return `${ev.DragonType || 'Dragon'} soul`;
  if (ev.EventName === 'FirstBlood') return 'First blood';
  if (ev.EventName === 'Ace') return 'Ace';
  if (ev.EventName === 'Multikill') return ev.KillStreak ? `${ev.KillStreak}x` : 'Multikill';
  return ev.EventName;
}

function snapshotFromRaw(raw, extraScores, activeOverride) {
  const active = activeOverride || raw.activePlayer || {};
  const youRow = findYouRow(raw);
  const youName = playerName(active) || playerName(youRow) || 'You';
  const scores = youRow.scores || {};
  const stats = active.championStats || {};
  const items = (youRow.items || [])
    .filter((it) => it && it.itemID)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
    .map((it) => it.itemID);

  const gameTime = raw.gameData?.gameTime || 0;
  const hasSmite = playerHasSmite(youRow) || playerHasSmite(active);
  const gold = Math.floor(active.currentGold || 0);
  const base = computeInBase(stats, youRow, gameTime, items, { hasSmite, gold });

  const OBJ_EVENTS = new Set(['DragonKill', 'HeraldKill', 'BaronKill', 'HordeKill']);
  const allEvents = (raw.events && raw.events.Events) || [];
  const events = allEvents
    .filter((ev) => INTERESTING.has(ev.EventName))
    .slice(-5)
    .map((ev) => ({
      id: ev.EventID,
      name: formatEvent(ev),
      time: ev.EventTime || 0,
    }));
  const objectiveEvents = allEvents
    .filter((ev) => OBJ_EVENTS.has(ev.EventName))
    .map((ev) => ({
      id: ev.EventID,
      EventName: ev.EventName,
      EventTime: ev.EventTime || 0,
      DragonType: ev.DragonType || '',
      Stolen: !!ev.Stolen,
    }));

  const itemGold = (youRow.items || []).reduce((sum, it) => {
    if (!it?.itemID) return sum;
    return sum + (Number(it.price) || 0) * Math.max(1, Number(it.count) || 1);
  }, 0);

  const youTeam = youRow.team || active.team || '';
  let teamKills = 0;
  for (const p of raw.allPlayers || []) {
    if (youTeam && p.team !== youTeam) continue;
    teamKills += Number(p.scores?.kills) || 0;
  }

  const abilitiesRaw = active.abilities || {};
  const abilityLevel = (key) => {
    const a = abilitiesRaw[key] || abilitiesRaw[key.toLowerCase()];
    return Math.max(0, Number(a?.abilityLevel) || 0);
  };
  const abilities = {
    Q: abilityLevel('Q'),
    W: abilityLevel('W'),
    E: abilityLevel('E'),
    R: abilityLevel('R'),
  };

  return {
    inGame: true,
    gameTime,
    gameMode: raw.gameData?.gameMode || '',
    teams: teamTotalsFromRaw(raw, active, gold),
    youTeam: youTeam || 'ORDER',
    you: {
      name: youName || playerName(youRow) || 'You',
      champion: youRow.championName || '',
      level: youRow.level || active.level || 1,
      kills: scores.kills || 0,
      deaths: scores.deaths || 0,
      assists: scores.assists || 0,
      teamKills,
      cs: readCs(scores, extraScores, youRow, active, active.scores),
      gold,
      goldTotal: itemGold + gold,
      vision: Number(scores.wardScore) || 0,
      items,
      abilities,
      hp: base.hp,
      hpMax: base.hpMax,
      resource: base.resource,
      resourceMax: base.resourceMax,
      resourceType: stats.resourceType || '',
      healthRegen: base.healthRegen,
      isDead: base.isDead,
      inBase: base.inBase,
      hasSmite,
    },
    events,
    objectiveEvents,
  };
}

async function fetchPlayerScores(riotId) {
  if (!riotId) return null;
  const url = `https://127.0.0.1:2999/liveclientdata/playerscores?riotId=${encodeURIComponent(riotId)}`;
  try {
    return await fetchLiveJson(url);
  } catch {
    return null;
  }
}

/** Perk IDs for the local player (Magical Footwear, etc.). */
async function fetchActivePerkIds() {
  try {
    const data = await fetchLiveJson('https://127.0.0.1:2999/liveclientdata/activeplayerrunes');
    const ids = new Set();
    if (data?.keystone?.id) ids.add(Number(data.keystone.id));
    for (const r of data?.generalRunes || []) {
      if (r?.id) ids.add(Number(r.id));
    }
    return [...ids].filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

async function getLiveSnapshot() {
  const now = Date.now();
  if (snapCache && now - snapCacheAt < SNAP_CACHE_MS) {
    return snapCache;
  }
  try {
    const [raw, activeExtra] = await Promise.all([
      fetchLiveJson(),
      fetchLiveJson(ACTIVE_URL).catch(() => null),
    ]);
    if (!raw || !raw.gameData) {
      resetFountainState();
      snapCache = { inGame: false };
      snapCacheAt = now;
      return snapCache;
    }
    const riotId = playerName(activeExtra || raw.activePlayer) || playerName(findYouRow(raw));
    const [extraScores, perkIds] = await Promise.all([
      fetchPlayerScores(riotId),
      fetchActivePerkIds(),
    ]);
    const snap = snapshotFromRaw(raw, extraScores, activeExtra);
    if (snap?.you) snap.you.perkIds = perkIds;
    snapCache = snap;
    snapCacheAt = now;
    return snap;
  } catch {
    resetFountainState();
    snapCache = { inGame: false };
    snapCacheAt = now;
    return snapCache;
  }
}

async function getRecorderTick() {
  try {
    const raw = await fetchLiveJson();
    if (!raw || !raw.gameData) return { inGame: false };
    const youRow = findYouRow(raw);
    const active = raw.activePlayer || {};
    return {
      inGame: true,
      gameTime: raw.gameData?.gameTime || 0,
      gameMode: raw.gameData?.gameMode || '',
      you: playerName(active) || playerName(youRow) || 'You',
      champion: youRow.championName || '',
      events: recorderEventsFromRaw(raw, youRow, active),
    };
  } catch {
    return { inGame: false };
  }
}

async function getLiveRoster() {
  try {
    const raw = await fetchLiveJson();
    const players = raw?.allPlayers || [];
    if (!players.length) return { inGame: false, players: [] };
    const youRow = findYouRow(raw);
    return {
      inGame: true,
      gameTime: raw.gameData?.gameTime || 0,
      players: players.map((p) => ({
        champion: p.championName || '',
        riotId: playerName(p),
        gameName: p.riotIdGameName || '',
        tagLine: p.riotIdTagLine || p.riotIdTagline || '',
        team: p.team || '',
        items: (p.items || []).map((it) => it.itemID).filter(Boolean),
        cs: readCs(p.scores, p),
        position: p.position || '',
        hasSmite: playerHasSmite(p),
        isYou: samePlayer(p, youRow) || samePlayer(p, raw.activePlayer),
      })),
    };
  } catch {
    return { inGame: false, players: [] };
  }
}

module.exports = { getLiveSnapshot, getRecorderTick, getLiveRoster };
