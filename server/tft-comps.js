/** TFT meta comps — MetaTFT cluster feed (static comps for pin overlay). */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cloudscraper = require('cloudscraper');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HC = 'https://api-hc.metatft.com';
const CDN = 'https://cdn.metatft.com/file/metatft';

const memory = { at: 0, data: null, stale: null };
let inflight = null;

function cachePath() {
  const dir = process.env.RIFT_CACHE_DIR
    || (process.env.RENDER_DISK_PATH
      ? path.join(process.env.RENDER_DISK_PATH, 'rift-cache')
      : path.join(os.tmpdir(), 'rift-lol-cache'));
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return path.join(dir, 'tft-comps-cache.json');
}

function readDisk() {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), 'utf8'));
  } catch {
    return null;
  }
}

function writeDisk(payload) {
  try { fs.writeFileSync(cachePath(), JSON.stringify(payload)); } catch { /* ignore */ }
}

async function fetchJson(url) {
  const body = await cloudscraper.get({
    uri: url,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Origin: 'https://www.metatft.com',
      Referer: 'https://www.metatft.com/comps',
    },
    cloudflareTimeout: 25000,
  });
  const text = String(body || '');
  if (text.trimStart().startsWith('<')) {
    const err = new Error('MetaTFT blocked');
    err.status = 403;
    throw err;
  }
  return JSON.parse(text);
}

function tierFromAvg(avg) {
  const e = Number(avg);
  if (!Number.isFinite(e)) return '';
  if (e < 4.2) return 'S';
  if (e < 4.4) return 'A';
  if (e < 4.6) return 'B';
  if (e < 4.8) return 'C';
  return 'D';
}

function unitIcon(apiName) {
  const key = String(apiName || '').toLowerCase();
  return key ? `${CDN}/champions/${key}.png` : '';
}

function itemIcon(itemId) {
  const key = String(itemId || '').toLowerCase();
  return key ? `${CDN}/items/${key}.png` : '';
}

function traitIcon(apiName, name) {
  const key = String(apiName || name || '').toLowerCase();
  return key ? `${CDN}/traits/${key}.png` : '';
}

function isShopUnit(assetId, u) {
  const cost = Number(u?.unit_cost) || 0;
  if (cost < 1 || cost > 5) return false;
  const name = String(u?.name || '').trim();
  const api = String(u?.apiName || assetId || '');
  if (!name) return false;
  if (/drag |hold to|set them|over bff|click |press /i.test(name)) return false;
  const junk = /sapling|soldier|spider|summon|dummy|egg|golem|thorn|protector|training|augment|minion|pet/i;
  if (junk.test(assetId) || junk.test(api) || junk.test(name)) return false;
  if (!Array.isArray(u?.traits) || u.traits.length === 0) return false;
  return true;
}

function catalogPreferScore(assetId, u) {
  let score = 0;
  const id = String(assetId || '');
  const api = String(u?.apiName || '');
  if (/_Base$/i.test(id) || /_Base$/i.test(api)) score += 20;
  if (!/_(AD|AP)$/i.test(id)) score += 8;
  if (/^DA_18_[A-Za-z]+$/i.test(id) || /^DA_[A-Za-z]+18$/i.test(id)) score += 6;
  if (!/_(Blackthorn|Blossom|Coven|Elderwood|Fae|Inferno|Moonbeam|Primal|Sunbeam)$/i.test(id)) score += 4;
  score += Math.min(Number(u?.traits?.length) || 0, 4);
  return score;
}

function buildUnitsCatalog(unitLookup) {
  const bestByApi = new Map();
  for (const [assetId, raw] of Object.entries(unitLookup || {})) {
    if (!isShopUnit(assetId, raw)) continue;
    const apiName = String(raw.apiName || assetId);
    const score = catalogPreferScore(assetId, raw);
    const prev = bestByApi.get(apiName);
    if (prev && prev.score >= score) continue;
    bestByApi.set(apiName, {
      score,
      unit: {
        id: assetId,
        apiName,
        name: raw.name || assetId,
        cost: Number(raw.unit_cost) || 1,
        stars: 2,
        items: [],
        icon: unitIcon(apiName),
        traits: Array.isArray(raw.traits) ? raw.traits : [],
      },
    });
  }

  const bestByName = new Map();
  for (const { score, unit } of bestByApi.values()) {
    const key = String(unit.name || '').toLowerCase();
    const prev = bestByName.get(key);
    if (!prev || score > prev.score || (score === prev.score && unit.cost > prev.unit.cost)) {
      bestByName.set(key, { score, unit });
    }
  }

  return [...bestByName.values()]
    .map((x) => x.unit)
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
}

function parseTraitToken(token, traitLookup) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(.*)_(\d+)$/);
  const asset = m ? m[1] : raw;
  const level = m ? Number(m[2]) : 1;
  const info = traitLookup?.[asset] || {};
  return {
    id: asset,
    apiName: info.apiName || asset,
    name: info.name || asset.replace(/^DA_(\d+_)?/, '').replace(/18$/, ''),
    level: Number.isFinite(level) ? level : 1,
    icon: traitIcon(asset, info.name),
  };
}

function displayName(cluster, unitLookup, traitLookup) {
  const parts = Array.isArray(cluster?.name) ? cluster.name : [];
  const labels = parts.map((p) => {
    const key = p?.name;
    if (p?.type === 'unit') return unitLookup?.[key]?.name || key;
    if (p?.type === 'trait') return traitLookup?.[key]?.name || key;
    return key;
  }).filter(Boolean);
  if (labels.length) return labels.join(' ');
  const fallback = String(cluster?.name_string || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (fallback.length) {
    return fallback.map((k) => unitLookup?.[k]?.name || traitLookup?.[k]?.name || k).join(' ');
  }
  return `Comp ${cluster?.Cluster ?? ''}`;
}

function defaultStars(cost, hasItems) {
  const c = Number(cost) || 1;
  if (hasItems && c >= 4) return 3;
  if (hasItems && c >= 3) return 2;
  return c >= 5 ? 3 : 2;
}

function bestBuildsByUnit(buildsForCluster) {
  const list = Array.isArray(buildsForCluster?.builds) ? buildsForCluster.builds : [];
  const best = new Map();
  for (const row of list) {
    const unit = row?.unit;
    if (!unit || !Array.isArray(row.buildName) || !row.buildName.length) continue;
    const prev = best.get(unit);
    const score = Number(row.score) || 0;
    const count = Number(row.count) || 0;
    if (!prev || score > prev.score || (score === prev.score && count > prev.count)) {
      best.set(unit, {
        items: row.buildName.map(String),
        score,
        count,
        avg: Number(row.avg) || null,
      });
    }
  }
  return best;
}

function normalizeUnit(assetId, unitLookup, builds, { shopOnly = false } = {}) {
  const u = unitLookup?.[assetId] || {};
  const name = String(u.name || '').trim();
  const api = String(u.apiName || assetId || '');
  if (/drag |hold to|set them|over bff/i.test(name)) return null;
  if (shopOnly) {
    const junk = /sapling|soldier|spider|summon|dummy|egg|golem|thorn|protector|training|augment|minion|pet|lifeblossom|stonebark|lifebloom/i;
    if (junk.test(assetId) || junk.test(api) || junk.test(name)) return null;
    if (!Array.isArray(u.traits) || u.traits.length === 0) return null;
  }
  const build = builds?.get?.(assetId);
  const items = (build?.items || []).map((itemId) => ({
    id: itemId,
    name: String(itemId).replace(/^DA_/, '').replace(/^TFT_Item_/, ''),
    icon: itemIcon(itemId),
  }));
  const cost = Number(u.unit_cost) || 0;
  return {
    id: assetId,
    apiName: u.apiName || assetId,
    name: name || assetId.replace(/^DA_(\d+_)?/, '').replace(/_/g, ' '),
    cost: cost >= 1 ? cost : 1,
    stars: defaultStars(cost || 1, items.length > 0),
    items,
    icon: unitIcon(u.apiName || assetId),
  };
}

function unitsFromDelimitedList(raw, unitLookup, builds, opts = {}) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const sep = text.includes('&') ? '&' : ',';
  const seen = new Set();
  const out = [];
  for (const part of text.split(sep)) {
    const id = part.trim();
    if (!id) continue;
    const unit = normalizeUnit(id, unitLookup, builds, opts);
    if (!unit) continue;
    const key = String(unit.apiName || unit.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(unit);
  }
  return out;
}

function pickBestBoardOption(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return [...list].sort((a, b) => {
    const as = Number(a.score);
    const bs = Number(b.score);
    if (Number.isFinite(as) || Number.isFinite(bs)) return (bs || 0) - (as || 0);
    const aw = Number(a.win);
    const bw = Number(b.win);
    if (Number.isFinite(aw) || Number.isFinite(bw)) {
      const ac = (Number(a.count) || 0) * (Number.isFinite(aw) ? aw : 0.5);
      const bc = (Number(b.count) || 0) * (Number.isFinite(bw) ? bw : 0.5);
      if (bc !== ac) return bc - ac;
    }
    return (Number(b.count) || 0) - (Number(a.count) || 0);
  })[0];
}

function buildStages(earlyOptions, lateOptions, finalUnits, unitLookup, builds) {
  const stages = [];
  const early = earlyOptions && typeof earlyOptions === 'object' ? earlyOptions : {};
  const late = lateOptions && typeof lateOptions === 'object' ? lateOptions : {};
  const shopOpts = { shopOnly: true };

  for (const lvl of [3, 4, 5, 6, 7]) {
    const best = pickBestBoardOption(early[String(lvl)]);
    if (!best) continue;
    const list = best.unit_list || best.units_list;
    const units = unitsFromDelimitedList(list, unitLookup, builds, shopOpts);
    if (!units.length) continue;
    stages.push({
      level: lvl,
      label: `Lvl ${lvl}`,
      winRate: best.win != null ? Math.round(Number(best.win) * 1000) / 1000 : null,
      avgPlacement: best.avg != null ? Math.round(Number(best.avg) * 100) / 100 : null,
      playCount: Number(best.count) || 0,
      units,
    });
  }

  // MetaTFT rarely has Lvl 3 — seed an "openers" board from cheapest Lvl 4 shop units.
  if (!stages.some((s) => s.level === 3)) {
    const lvl4 = stages.find((s) => s.level === 4);
    if (lvl4?.units?.length) {
      const openers = [...lvl4.units]
        .sort((a, b) => (a.cost - b.cost) || a.name.localeCompare(b.name))
        .slice(0, 4)
        .map((u) => ({ ...u, stars: 2, items: [] }));
      if (openers.length) {
        stages.unshift({
          level: 3,
          label: 'Lvl 3',
          winRate: null,
          avgPlacement: null,
          playCount: 0,
          units: openers,
        });
      }
    }
  }

  for (const lvl of [8, 9]) {
    if (stages.some((s) => s.level === lvl)) continue;
    const best = pickBestBoardOption(late[String(lvl)]);
    if (!best) continue;
    const units = unitsFromDelimitedList(best.units_list || best.unit_list, unitLookup, builds, shopOpts);
    if (!units.length) continue;
    stages.push({
      level: lvl,
      label: `Lvl ${lvl}`,
      winRate: null,
      avgPlacement: best.avg != null ? Math.round(Number(best.avg) * 100) / 100 : null,
      playCount: Number(best.count) || 0,
      units,
    });
  }

  if (Array.isArray(finalUnits) && finalUnits.length) {
    stages.push({
      level: 'final',
      label: 'Final',
      winRate: null,
      avgPlacement: null,
      playCount: 0,
      units: finalUnits,
    });
  }

  return stages;
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function fetchFresh() {
  const [idPayload, infoPayload, buildsPayload] = await Promise.all([
    fetchJson(`${HC}/tft-comps-api/latest_cluster_id`),
    fetchJson(`${HC}/tft-comps-api/latest_cluster_info`),
    fetchJson(`${HC}/tft-comps-api/comp_builds`),
  ]);

  const clusterId = idPayload?.cluster_id || infoPayload?.cluster_info?.cluster_id;
  const tftSet = idPayload?.tft_set || infoPayload?.cluster_info?.tft_set || '';
  const details = infoPayload?.cluster_info?.cluster_details || {};
  const clusters = Array.isArray(details.clusters) ? details.clusters : [];
  const unitLookup = details.unit_lookup || {};
  const traitLookup = details.trait_lookup || {};
  const buildsRoot = buildsPayload?.results || {};

  const statsList = await mapPool(clusters, 6, async (cluster) => {
    const id = String(cluster.Cluster);
    try {
      const det = await fetchJson(
        `${HC}/tft-comps-api/comp_details?comp=${encodeURIComponent(id)}&cluster_id=${encodeURIComponent(clusterId)}`,
      );
      const place = det?.results?.placements?.[0];
      return {
        id,
        avgPlacement: place?.avg != null ? Number(place.avg) : null,
        playCount: place?.count != null ? Number(place.count) : 0,
        earlyOptions: det?.results?.early_options || {},
        lateOptions: det?.results?.options || {},
      };
    } catch {
      return { id, avgPlacement: null, playCount: 0, earlyOptions: {}, lateOptions: {} };
    }
  });

  const statsById = new Map(statsList.map((s) => [s.id, s]));
  const totalPlays = statsList.reduce((sum, s) => sum + (s.playCount || 0), 0) || 1;

  const comps = clusters.map((cluster) => {
    const id = String(cluster.Cluster);
    const stats = statsById.get(id) || {};
    const unitIds = String(cluster.units_string || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const builds = bestBuildsByUnit(buildsRoot[id]);

    const units = unitIds
      .map((assetId) => normalizeUnit(assetId, unitLookup, builds))
      .filter(Boolean);

    const traits = String(cluster.traits_string || '')
      .split(',')
      .map((t) => parseTraitToken(t.trim(), traitLookup))
      .filter(Boolean)
      .sort((a, b) => (b.level || 0) - (a.level || 0));

    const avgPlacement = stats.avgPlacement;
    const playCount = stats.playCount || 0;
    const pickRate = playCount / totalPlays;
    const stages = buildStages(stats.earlyOptions, stats.lateOptions, units, unitLookup, builds);

    return {
      id,
      name: displayName(cluster, unitLookup, traitLookup),
      tier: tierFromAvg(avgPlacement),
      avgPlacement: avgPlacement != null ? Math.round(avgPlacement * 100) / 100 : null,
      pickRate: Math.round(pickRate * 10000) / 10000,
      playCount,
      traits,
      units,
      stages,
    };
  });

  comps.sort((a, b) => {
    const ap = a.avgPlacement == null ? 99 : a.avgPlacement;
    const bp = b.avgPlacement == null ? 99 : b.avgPlacement;
    if (ap !== bp) return ap - bp;
    return (b.playCount || 0) - (a.playCount || 0);
  });

  const unitsCatalog = buildUnitsCatalog(unitLookup);

  return {
    builtAt: Date.now(),
    clusterId,
    tftSet,
    source: 'metatft',
    comps,
    units: unitsCatalog,
    unitsVersion: 4,
    error: null,
  };
}

async function getTftComps({ force = false } = {}) {
  const now = Date.now();
  if (!force && memory.data?.comps?.length && memory.data.unitsVersion === 4 && Array.isArray(memory.data.units) && now - memory.at < CACHE_TTL_MS) {
    return { ...memory.data, cached: true };
  }

  if (!force && !memory.data) {
    const disk = readDisk();
    if (
      disk?.data?.comps?.length
      && disk.data.unitsVersion === 4
      && Array.isArray(disk.data.units)
      && disk.at
      && now - disk.at < CACHE_TTL_MS
    ) {
      memory.at = disk.at;
      memory.data = disk.data;
      memory.stale = disk.data;
      return { ...disk.data, cached: true };
    }
    if (disk?.data?.comps?.length) memory.stale = disk.data;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const fresh = await fetchFresh();
      memory.at = Date.now();
      memory.data = fresh;
      memory.stale = fresh;
      writeDisk({ at: memory.at, data: fresh });
      return { ...fresh, cached: false };
    } catch (err) {
      const stale = memory.stale || memory.data || readDisk()?.data || null;
      if (stale?.comps?.length) {
        return {
          ...stale,
          cached: true,
          stale: true,
          error: err?.message || 'Could not refresh TFT comps',
        };
      }
      return {
        builtAt: Date.now(),
        clusterId: null,
        tftSet: '',
        source: 'metatft',
        comps: [],
        units: [],
        cached: false,
        error: err?.message || 'Could not load TFT comps',
      };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

module.exports = { getTftComps, unitIcon, itemIcon, traitIcon };
