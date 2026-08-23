function refIndex(s) {
  if (typeof s !== 'string') return null;
  const id = (s.startsWith('\u0011') || s.startsWith('\u0012')) ? s.slice(1).split(/[! @]/)[0] : s;
  if (!/^[\da-z]+$/i.test(id)) return null;
  return parseInt(id, 36);
}

function deref(objs, val, depth = 0, seen = new Set()) {
  if (val == null || depth > 24) return val;
  const idx = typeof val === 'string' ? refIndex(val) : null;
  if (idx != null && !Number.isNaN(idx)) {
    if (seen.has(idx)) return null;
    seen.add(idx);
    return deref(objs, objs[idx], depth + 1, seen);
  }
  if (Array.isArray(val)) return val.map((v) => deref(objs, v, depth + 1, new Set(seen)));
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = deref(objs, v, depth + 1, new Set(seen));
    return out;
  }
  return val;
}

const RANK_TIER = {
  iron: 'iron',
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
  gold_plus: 'gold',
  platinum: 'platinum',
  platinum_plus: 'platinum',
  emerald: 'emerald',
  emerald_plus: 'emerald',
  diamond: 'diamond_plus',
  diamond_plus: 'diamond_plus',
  master: 'diamond_plus',
  master_plus: 'diamond_plus',
  grandmaster: 'diamond_plus',
  challenger: 'diamond_plus',
};

function pickTierSeries(block, rank) {
  if (!block) return null;
  if (Array.isArray(block)) return block;
  const key = RANK_TIER[String(rank || '').toLowerCase()] || 'diamond_plus';
  const series = block[key] || block.diamond_plus || block.all;
  if (!Array.isArray(series)) return null;
  return series.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
}

function parseQwikGraph(html, rank = 'master') {
  const m = html.match(/type="qwik\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  const qwik = JSON.parse(m[1]);
  const objs = qwik.objs || [];
  let graphRef = null;
  for (let i = 0; i < objs.length; i += 1) {
    const o = objs[i];
    if (o && typeof o === 'object' && !Array.isArray(o) && o.dates && o.wr && o.pr && o.br) {
      graphRef = o;
      break;
    }
  }
  if (!graphRef) return null;

  const dates = deref(objs, graphRef.dates) || [];
  const wr = pickTierSeries(deref(objs, graphRef.wr), rank);
  const pick = pickTierSeries(deref(objs, graphRef.pr), rank);
  const ban = pickTierSeries(deref(objs, graphRef.br), rank);
  if (!dates.length || !wr?.length) return null;

  const len = Math.min(dates.length, wr.length, pick?.length || wr.length, ban?.length || wr.length);
  const start = Math.max(0, len - 30);
  const slice = (arr) => (Array.isArray(arr) ? arr.slice(start, len) : []);
  const dateSlice = dates.slice(start, len);

  const points = dateSlice.map((date, i) => ({
    date,
    wr: wr[start + i] ?? null,
    pick: pick?.[start + i] ?? null,
    ban: ban?.[start + i] ?? null,
  }));

  return {
    dates: dateSlice,
    winrate: slice(wr),
    pickrate: slice(pick),
    banrate: slice(ban),
    points,
  };
}

module.exports = { parseQwikGraph, refIndex, deref };
