import React, { useMemo } from 'react';
import { hourBuckets } from '../studioStats';
import { flagUrl } from '../countryFlag';
import { formatMmr, mmrToRank } from '../lib';

/* ——— shared helpers ——— */

/** Sparkline series arrive newest-first; charts read oldest→newest. */
function oldestFirst(series) {
  return (Array.isArray(series) ? series : [])
    .map(Number)
    .filter((v) => Number.isFinite(v))
    .slice()
    .reverse();
}

/**
 * Server deltas are hardcoded flat, so derive the real trend by comparing the
 * newer half of the series against the older half.
 */
function seriesTrend(series) {
  const vals = (Array.isArray(series) ? series : []).map(Number).filter(Number.isFinite);
  if (vals.length < 4) return { delta: null, dir: 'flat' };
  const half = Math.floor(vals.length / 2);
  const recent = vals.slice(0, half);
  const older = vals.slice(half);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const delta = mean(recent) - mean(older);
  if (!Number.isFinite(delta)) return { delta: null, dir: 'flat' };
  return { delta, dir: Math.abs(delta) < 0.005 ? 'flat' : delta > 0 ? 'up' : 'down' };
}

function Spark({ series, color = '#7c5cff', width = 104, height = 30 }) {
  const vals = oldestFirst(series);
  if (vals.length < 2) return <span className="wd-sg-spark is-empty" />;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = width / (vals.length - 1);
  const pad = 3;
  const pts = vals.map((v, i) => [
    i * step,
    height - pad - ((v - min) / range) * (height - pad * 2),
  ]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} ${width},${height} 0,${height}`;
  const id = `sg-${color.replace('#', '')}`;
  return (
    <svg className="wd-sg-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function Ring({ value, size = 62, stroke = 6, color = '#7c5cff', label, sub }) {
  const r = (size / 2) - stroke;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0)) / 100;
  return (
    <div className="wd-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" className="wd-ring-val">
          {Math.round(Number(value) || 0)}
        </text>
      </svg>
      <strong>{label}</strong>
      {sub ? <span>{sub}</span> : null}
    </div>
  );
}

/* ——— 1. Stat grid ——— */

const STAT_DEFS = [
  { id: 'kda', label: 'KDA', spark: 'kda', color: '#7c5cff', digits: 2 },
  { id: 'gdScore', label: 'Rift Score', spark: 'gdScore', color: '#ffb454', digits: 1, valueKey: 'gdScore' },
  { id: 'kp', label: 'Kill participation', spark: 'kp', color: '#ff7ad9', digits: 0, pct: true },
  { id: 'csm', label: 'CS / min', spark: 'csm', color: '#5eb8ff', digits: 1 },
  { id: 'vision', label: 'Vision / min', spark: 'vision', color: '#3ecf8e', digits: 2, valueKey: 'visionScore' },
  { id: 'gpm', label: 'Gold / min', spark: 'gpm', color: '#e0b256', digits: 0 },
  { id: 'goldDiff15', label: 'Gold @15', spark: 'goldDiff15', color: '#4fd7c5', digits: 0, signed: true },
  { id: 'kaDiff15', label: 'K+A @15', spark: 'kaDiff15', color: '#a06bff', digits: 1, signed: true },
];

function fmtDelta(delta, def) {
  if (delta == null) return null;
  const scaled = def.pct ? delta * 100 : delta;
  const digits = def.pct ? 0 : def.digits;
  const n = Math.abs(scaled).toFixed(digits);
  if (Number(n) === 0) return null;
  return `${scaled > 0 ? '+' : '−'}${n}${def.pct ? '%' : ''}`;
}

export function StatGrid({ stats = {}, sparklines = {}, games = 0 }) {
  const cells = STAT_DEFS.map((def) => {
    const series = sparklines[def.spark] || [];
    const raw = stats[def.valueKey || def.id];
    let display = raw == null || raw === '—' ? '—' : String(raw);
    if (def.pct && display !== '—') {
      const n = Number(display);
      if (Number.isFinite(n)) display = `${Math.round(n <= 1.5 ? n * 100 : n)}%`;
    }
    if (def.signed && display !== '—' && !/^[+−-]/.test(display)) {
      const n = Number(display);
      if (Number.isFinite(n) && n > 0) display = `+${display}`;
    }
    const trend = seriesTrend(series);
    return {
      ...def, display, series, trend, deltaLabel: fmtDelta(trend.delta, def),
    };
  });

  return (
    <article className="wd-statgrid">
      <header>
        <h3>Performance</h3>
        <span className="muted">Trend across last {games || 0} games</span>
      </header>
      <div className="wd-sg-grid">
        {cells.map((c) => (
          <div key={c.id} className="wd-sg-cell">
            <span className="wd-sg-label">{c.label}</span>
            <div className="wd-sg-value">
              <strong>{c.display}</strong>
              {c.deltaLabel ? (
                <em className={`wd-sg-delta is-${c.trend.dir}`}>{c.deltaLabel}</em>
              ) : null}
            </div>
            <Spark series={c.series} color={c.color} />
          </div>
        ))}
      </div>
    </article>
  );
}

/* ——— 2. Game phase rings ——— */

export function PhaseCard({ games = [] }) {
  const phases = useMemo(() => {
    const pick = (key) => {
      const vals = games.map((g) => Number(g[key])).filter(Number.isFinite);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    return {
      early: pick('earlyScore'),
      mid: pick('midScore'),
      late: pick('lateScore'),
    };
  }, [games]);

  if (phases.early == null && phases.mid == null && phases.late == null) return null;

  const entries = [
    { key: 'early', label: 'Early', sub: '0–15 min', color: '#5eb8ff', value: phases.early },
    { key: 'mid', label: 'Mid', sub: '15–25 min', color: '#ffb454', value: phases.mid },
    { key: 'late', label: 'Late', sub: '25 min +', color: '#ff7ad9', value: phases.late },
  ].filter((e) => e.value != null);

  const best = entries.reduce((a, b) => (b.value > a.value ? b : a), entries[0]);
  const worst = entries.reduce((a, b) => (b.value < a.value ? b : a), entries[0]);

  return (
    <article className="wd-side-card wd-phase-card">
      <header>
        <h3>Game phases</h3>
        <span className="wd-side-scope">Avg score per phase</span>
      </header>
      <div className="wd-phase-rings">
        {entries.map((e) => (
          <Ring key={e.key} value={e.value} color={e.color} label={e.label} sub={e.sub} />
        ))}
      </div>
      {entries.length > 1 && best.key !== worst.key ? (
        <p className="wd-phase-note">
          Strongest <strong style={{ color: best.color }}>{best.label.toLowerCase()} game</strong>
          {' · '}weakest <strong style={{ color: worst.color }}>{worst.label.toLowerCase()}</strong>
        </p>
      ) : null}
    </article>
  );
}

/* ——— 3. Rift Lens (survivability) ——— */

export function LensCard({ lens }) {
  if (!lens || lens.score == null) return null;
  const color = lens.score >= 70 ? '#3ecf8e' : lens.score >= 45 ? '#ffb454' : '#ff5c68';
  return (
    <article className="wd-side-card wd-lens-card">
      <header>
        <h3>Rift Lens</h3>
        <span className="wd-side-scope">Survivability</span>
      </header>
      <div className="wd-lens-body">
        <Ring value={lens.score} size={72} stroke={7} color={color} label="Score" />
        <div className="wd-lens-meta">
          <div>
            <span>Deaths / game</span>
            <strong>{lens.avgDeaths ?? '—'}</strong>
          </div>
          <Spark series={(lens.series || []).slice().reverse()} color={color} width={120} height={34} />
        </div>
      </div>
    </article>
  );
}

/* ——— 4. Collections ——— */

export function CollectionsCard({ collections }) {
  const played = Number(collections?.played) || 0;
  const total = Number(collections?.total) || 0;
  if (!total) return null;
  const pct = Math.round((played / total) * 100);
  return (
    <article className="wd-side-card wd-collections-card">
      <header>
        <h3>Champions played</h3>
        <span className="wd-side-scope">Mastery</span>
      </header>
      <div className="wd-coll-body">
        <strong>{played}<em>/{total}</em></strong>
        <span className="muted">{pct}% of the roster</span>
      </div>
      <div className="wd-coll-bar"><span style={{ width: `${pct}%` }} /></div>
    </article>
  );
}

/* ——— 5. LP progression ——— */

export function LpChart({ history = [], lpDelta30d, estMmr }) {
  const rows = useMemo(() => (Array.isArray(history) ? history : [])
    .filter((r) => r && Number.isFinite(Number(r.elo)) && Number(r.at))
    .map((r) => ({ at: Number(r.at), elo: Number(r.elo) })), [history]);

  if (rows.length < 3) return null;

  const width = 520;
  const height = 124;
  const pad = 14;
  const vals = rows.map((r) => r.elo);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = width / (rows.length - 1);
  const pts = rows.map((r, i) => [
    i * step,
    height - pad - ((r.elo - min) / range) * (height - pad * 2),
  ]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} ${width},${height} 0,${height}`;
  const rising = vals[vals.length - 1] >= vals[0];
  const color = rising ? '#3ecf8e' : '#ff5c68';
  const peak = mmrToRank(max);
  const spanDays = Math.max(1, Math.round((rows[rows.length - 1].at - rows[0].at) / 86400000));

  return (
    <article className="wd-lp-card">
      <header>
        <div>
          <h3>Rank progression</h3>
          <span className="muted">Last {spanDays} days · {rows.length} updates</span>
        </div>
        <div className="wd-lp-tags">
          {lpDelta30d != null ? (
            <em className={lpDelta30d >= 0 ? 'is-up' : 'is-down'}>
              {lpDelta30d >= 0 ? '+' : ''}{lpDelta30d} LP / 30d
            </em>
          ) : null}
          {peak?.short ? <em className="is-peak">Peak {peak.short}</em> : null}
          {estMmr != null ? <em className="is-mmr">~{formatMmr(estMmr)} MMR</em> : null}
        </div>
      </header>
      <svg className="wd-lp-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lp-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="70%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#lp-fill)" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </article>
  );
}

/* ——— 6. Strengths & weaknesses ——— */

function parseSigned(v) {
  if (v == null || v === '—' || v === '') return null;
  const n = Number(String(v).replace(/[+,\s]/g, '').replace(/[−–]/g, '-'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Ranked-typical bands. `weak` / `strong` are the edges of "average";
 * invert = lower is better (deaths).
 */
const BENCHMARKS = [
  {
    id: 'wr', label: 'Win rate', weak: 44, strong: 55,
    get: (c) => c.wr, fmt: (v) => `${Math.round(v)}%`,
  },
  {
    id: 'kda', label: 'KDA', weak: 2, strong: 3.5,
    get: (c) => c.kda, fmt: (v) => v.toFixed(2),
  },
  {
    id: 'kp', label: 'Kill participation', weak: 40, strong: 55,
    get: (c) => c.kp, fmt: (v) => `${Math.round(v)}%`,
  },
  {
    id: 'csm', label: 'CS / min', weak: 5.5, strong: 7.5,
    get: (c) => c.csm, fmt: (v) => v.toFixed(1), skipRoles: ['UTILITY'], skipModes: ['Aram'],
  },
  {
    id: 'vision', label: 'Vision / min', weak: 0.7, strong: 1.3,
    get: (c) => c.vision, fmt: (v) => v.toFixed(2), skipModes: ['Aram'],
  },
  {
    id: 'gold15', label: 'Gold @15', weak: -250, strong: 250,
    get: (c) => c.gold15, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`, skipModes: ['Aram'],
  },
  {
    id: 'deaths', label: 'Deaths / game', weak: 7, strong: 4.5, invert: true,
    get: (c) => c.deaths, fmt: (v) => v.toFixed(1),
  },
];

function goodnessOf(value, weak, strong, invert) {
  const span = invert ? (weak - strong) : (strong - weak);
  if (!span) return 0.5;
  return invert ? (weak - value) / span : (value - weak) / span;
}

function insightTakeaway(rows) {
  const up = rows.filter((r) => r.tone === 'is-up').sort((a, b) => b.goodness - a.goodness);
  const down = rows.filter((r) => r.tone === 'is-down').sort((a, b) => a.goodness - b.goodness);
  if (up.length && down.length) {
    return `${up[0].label} is ahead of a typical ranked sample. ${down[0].label} is the leak.`;
  }
  if (up.length === 1) return `${up[0].label} is the clear edge in this sample.`;
  if (up.length > 1) return `${up[0].label} and ${up[1].label} stand out.`;
  if (down.length === 1) return `${down[0].label} is the stat to tighten up.`;
  if (down.length > 1) return `Focus on ${down[0].label} and ${down[1].label}.`;
  return 'A balanced sample — nothing sits far from typical ranked.';
}

export function InsightsCard({ stats = {}, overview = {}, lens, mainRole, mode }) {
  const context = useMemo(() => {
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const kpRaw = num(stats.kp);
    return {
      wr: num(overview.winrate),
      kda: num(stats.kda),
      kp: kpRaw == null ? num(overview.avgKp) : (kpRaw <= 1.5 ? kpRaw * 100 : kpRaw),
      csm: num(stats.csm),
      vision: num(stats.visionScore),
      gold15: parseSigned(stats.goldDiff15),
      deaths: num(lens?.avgDeaths) ?? num(overview.avgDeaths),
    };
  }, [stats, overview, lens]);

  const rows = useMemo(() => BENCHMARKS.flatMap((b) => {
    if (b.skipRoles?.includes(mainRole)) return [];
    if (b.skipModes?.includes(mode)) return [];
    const value = b.get(context);
    if (value == null) return [];
    if (b.id === 'vision' && value <= 0) return [];
    const goodness = goodnessOf(value, b.weak, b.strong, b.invert);
    const tone = goodness >= 1 ? 'is-up' : goodness <= 0 ? 'is-down' : 'is-mid';
    const tag = tone === 'is-up' ? 'ahead' : tone === 'is-down' ? 'behind' : 'typical';
    const pct = Math.max(4, Math.min(96, 25 + goodness * 50));
    return [{
      id: b.id,
      label: b.label,
      display: b.fmt(value),
      goodness,
      tone,
      tag,
      pct,
      title: `${b.label} ${b.fmt(value)} · typical ${b.invert ? `${b.strong}–${b.weak}` : `${b.weak}–${b.strong}`}`,
    }];
  }), [context, mainRole, mode]);

  if (!rows.length) return null;

  const takeaway = insightTakeaway(rows);
  const nUp = rows.filter((r) => r.tone === 'is-up').length;
  const nDown = rows.filter((r) => r.tone === 'is-down').length;

  return (
    <article className="wd-insights-card">
      <header>
        <h3>Strengths &amp; weaknesses</h3>
        <span className="muted">vs typical ranked</span>
      </header>
      <p className="wd-ib-take">{takeaway}</p>
      <div className="wd-ib-pills">
        {nUp ? <em className="is-up">{nUp} ahead</em> : null}
        {nDown ? <em className="is-down">{nDown} behind</em> : null}
        {!nUp && !nDown ? <em className="is-mid">all typical</em> : null}
      </div>
      <ul className="wd-ib-list">
        {rows.map((row) => (
          <li key={row.id} className={row.tone} title={row.title}>
            <span className="wd-ib-label">{row.label}</span>
            <span className="wd-ib-val">{row.display}</span>
            <span className="wd-ib-meter">
              <i className="wd-ib-track" />
              <b className="wd-ib-dot" style={{ left: `${row.pct}%` }} />
            </span>
            <span className="wd-ib-tag">{row.tag}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ——— 7. Hourly win rate ——— */

export function HourHeatmap({ games = [] }) {
  const buckets = useMemo(() => hourBuckets(games), [games]);
  const played = buckets.filter((b) => b.games > 0);
  if (played.length < 2) return null;

  const maxGames = Math.max(...played.map((b) => b.games));
  const best = played
    .filter((b) => b.games >= 2)
    .reduce((a, b) => {
      const wrA = a ? a.wins / a.games : -1;
      return b.wins / b.games > wrA ? b : a;
    }, null);

  const label = (h) => `${String(h).padStart(2, '0')}:00`;

  const totalGames = played.reduce((s, b) => s + b.games, 0);

  return (
    <article className="wd-hours-card">
      <header>
        <div>
          <h3>When you play</h3>
          <span className="muted">Win rate by hour · {totalGames} games · local time</span>
        </div>
        {best ? (
          <em className="wd-hours-best">
            Best at {label(best.hour)} · {Math.round((best.wins / best.games) * 100)}%
          </em>
        ) : null}
      </header>
      <div className="wd-hours-grid">
        {buckets.map((b) => {
          const wr = b.games ? (b.wins / b.games) * 100 : null;
          const tone = wr == null ? 'is-none' : wr >= 60 ? 'is-hot' : wr >= 50 ? 'is-good' : wr >= 40 ? 'is-mid' : 'is-cold';
          // Fade low-sample hours so a single game does not read as a trend.
          const strength = b.games ? 0.35 + (b.games / maxGames) * 0.65 : 1;
          return (
            <div
              key={b.hour}
              className={`wd-hour-cell ${tone}`}
              style={{ opacity: strength }}
              title={b.games
                ? `${label(b.hour)} · ${b.games} game${b.games === 1 ? '' : 's'} · ${Math.round(wr)}% WR`
                : `${label(b.hour)} · no games`}
            >
              <span>{b.games || ''}</span>
            </div>
          );
        })}
      </div>
      <div className="wd-hours-axis">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </article>
  );
}

/* ——— 8. Pro identity chip ——— */

export function ProChip({ identity }) {
  if (!identity) return null;
  const flag = flagUrl(identity.country, 24);
  return (
    <span className="wd-pro-chip" title={[identity.team, identity.league].filter(Boolean).join(' · ')}>
      {flag ? <img className="wd-pro-flag" src={flag} alt="" /> : null}
      {identity.logo ? <img className="wd-pro-logo" src={identity.logo} alt="" /> : null}
      <strong>{identity.name || identity.short}</strong>
      {identity.lane ? <em>{identity.lane}</em> : null}
    </span>
  );
}
