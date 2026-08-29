import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../session';
import { REGIONS, champIconUrl, ddragonVersion, timeAgo } from '../lib';
import TierModeNav from '../components/TierModeNav';
import {
  TIER_NAME, WR_BAR, clamp01, tierDistribution, tierVars, wrTone,
} from '../tierScale';
import './ModeTierList.css';

const RANKS = [
  { id: 'challenger', label: 'Challenger' },
  { id: 'grandmaster', label: 'Grandmaster' },
  { id: 'master_plus', label: 'Master+' },
  { id: 'master', label: 'Master' },
  { id: 'diamond_plus', label: 'Diamond+' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'emerald_plus', label: 'Emerald+' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'platinum_plus', label: 'Platinum+' },
  { id: 'gold_plus', label: 'Gold+' },
  { id: 'all', label: 'All ranks' },
];

const MODE_REGIONS = [
  { id: 'all', label: 'Global' },
  ...REGIONS.map((r) => ({ id: r.short.toLowerCase(), label: r.short })),
];

function fmtDelta(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
}

/** Win-rate cell. `mark` places a tick at the mode average so above/below reads instantly. */
function Metric({ value, fill, tone, bar, mark, digits = 2, className = '' }) {
  return (
    <div className={`mt-metric ${className}`}>
      <span className={`mt-metric-val ${tone || 'is-mid'}`}>{value.toFixed(digits)}%</span>
      <span className="mt-metric-bar">
        <i style={{ width: `${Math.max(2, Math.round(clamp01(fill) * 100))}%`, background: bar }} />
        {mark != null ? <b style={{ left: `${clamp01(mark) * 100}%` }} /> : null}
      </span>
    </div>
  );
}

export default function ModeTierList({
  navActive,
  kicker,
  title,
  blurb,
  fetcher,
  showBan = false,
  hasRegionFallback = true,
  footNote,
}) {
  const { session } = useSession();
  const [rank, setRank] = useState('emerald_plus');
  const [region, setRegion] = useState('all');
  const [query, setQuery] = useState('');
  const [tierPick, setTierPick] = useState(null);
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('16.16.1');

  useEffect(() => { ddragonVersion().then(setVersion); }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    fetcher({ platform: session?.platform || 'euw1', rank, region })
      .then((payload) => {
        if (!alive) return;
        if (payload?.ok === false) {
          setError(payload.error || 'Tier list failed');
          setData(payload);
          return;
        }
        setData(payload);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || 'Tier list failed');
          setData(null);
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetcher, session?.platform, rank, region]);

  const avgWr = data?.avgWr != null ? Number(data.avgWr) : 50;

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows || []).filter((row) => !q || String(row.champion).toLowerCase().includes(q));
  }, [data, query]);

  const dist = useMemo(() => tierDistribution(pool), [pool]);
  const distCounts = useMemo(() => new Map(dist.map((d) => [d.tier, d.count])), [dist]);

  const rows = useMemo(() => {
    const list = tierPick ? pool.filter((row) => row.tier === tierPick) : pool;
    const pick = (row) => {
      if (sort.key === 'rank') return Number(row.rank) || 9999;
      if (sort.key === 'games') return Number(row.games) || 0;
      if (sort.key === 'delta') return Number(row.delta) || 0;
      return Number(row[sort.key]) || 0;
    };
    return [...list].sort((a, b) => {
      const d = sort.dir === 'asc' ? pick(a) - pick(b) : pick(b) - pick(a);
      return d || (b.winrate - a.winrate);
    });
  }, [pool, tierPick, sort]);

  // Bars read as "relative to the highest value on screen".
  const scale = useMemo(() => ({
    pick: Math.max(...rows.map((r) => Number(r.pickrate) || 0), 1),
    ban: Math.max(...rows.map((r) => Number(r.banrate) || 0), 1),
  }), [rows]);

  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: key === 'rank' ? 'asc' : 'desc' };
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  const Th = ({ id, label, num, title: tip, className = '' }) => (
    <button
      type="button"
      className={`mt-th${num ? ' is-num' : ''}${sort.key === id ? ' is-on' : ''} ${className}`}
      onClick={() => toggleSort(id)}
      title={tip || `Sort by ${label}`}
    >
      {label}
      <i>{sort.key === id && sort.dir === 'asc' ? '▲' : '▼'}</i>
    </button>
  );

  // Bands only make sense in natural grade order, and only across more than one grade.
  const grouped = sort.key === 'rank' && sort.dir === 'asc' && !tierPick;
  let lastTier = null;
  const built = timeAgo(data?.builtAt);

  return (
    <div className={`mt-page is-${navActive}`}>
      <TierModeNav active={navActive} />

      <header className="mt-hero">
        <div className="mt-hero-copy">
          <p className="mt-kicker">{kicker}</p>
          <h1>{title}</h1>
          <p>{blurb}</p>
        </div>
        <div className="mt-hero-meta">
          <div className="mt-stat">
            <em>Games analysed</em>
            <strong>{loading ? '—' : Number(data?.analysed || 0).toLocaleString()}</strong>
            {built ? <span>Updated {built}</span> : null}
          </div>
          <div className="mt-stat">
            <em>Average win rate</em>
            <strong>{loading || data?.avgWr == null ? '—' : `${avgWr.toFixed(1)}%`}</strong>
            <span>{loading ? '' : `${pool.length} champions`}</span>
          </div>
          <div className="mt-stat is-soft">
            <em>Scope</em>
            <strong>
              {(data?.region || region || 'all').toUpperCase()}
              <span>· {rank.replace(/_/g, ' ')}</span>
            </strong>
            {data?.patch ? <span>Patch {data.patch}</span> : null}
          </div>
        </div>
      </header>

      <section className={`mt-panel${showBan ? '' : ' no-ban'}`}>
        <div className="mt-tools">
          <label>
            <span>Rank</span>
            <select value={rank} onChange={(e) => setRank(e.target.value)}>
              {RANKS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <label>
            <span>Region</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {MODE_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <label className="mt-search">
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Champion name…"
            />
          </label>
        </div>

        {!loading && !error && dist.length > 1 ? (
          <div className="mt-dist" role="group" aria-label="Filter by tier">
            {dist.map((d) => (
              <button
                key={d.tier}
                type="button"
                className={`mt-dist-seg${tierPick === d.tier ? ' is-on' : ''}`}
                style={{ ...tierVars(d.tier), flex: d.count }}
                onClick={() => setTierPick(tierPick === d.tier ? null : d.tier)}
                title={`${d.tier} — ${TIER_NAME[d.tier] || ''} · ${d.count} champions`}
              >
                <span>{d.tier}</span>
                <em>{d.count}</em>
              </button>
            ))}
          </div>
        ) : null}

        {error ? <div className="note is-error">{error}</div> : null}

        <div className="mt-table">
          <div className="mt-tr mt-tr--head">
            <Th id="rank" label="#" num className="mt-col-rank" title="Sort by grade order" />
            <span>Champion</span>
            <span>Tier</span>
            <Th id="winrate" label="Win rate" className="mt-col-wr" />
            <Th id="delta" label="Δ" num className="mt-col-delta" title="Win-rate delta as reported by the upstream feed. Sort to find the biggest movers." />
            <Th id="pickrate" label="Pick" className="mt-col-pick" />
            {showBan ? <Th id="banrate" label="Ban" className="mt-col-ban" /> : null}
            <Th id="games" label="Games" num className="mt-col-games" />
          </div>

          {loading ? Array.from({ length: 12 }, (_, i) => (
            <div className="mt-tr mt-skel-row" key={i}>
              <span className="mt-skel mt-col-rank" />
              <span className="mt-skel-champ">
                <span className="mt-skel is-icon" />
                <span className="mt-skel" style={{ width: `${45 + ((i * 13) % 40)}%` }} />
              </span>
              <span className="mt-skel" />
              <span className="mt-skel mt-col-wr" />
              <span className="mt-skel mt-col-delta" />
              <span className="mt-skel mt-col-pick" />
              {showBan ? <span className="mt-skel mt-col-ban" /> : null}
              <span className="mt-skel mt-col-games" />
            </div>
          )) : null}

          {!loading && !error ? rows.map((row, i) => {
            const wr = Number(row.winrate) || 0;
            const tone = wrTone(wr, avgWr);
            const delta = Number(row.delta) || 0;
            const band = grouped && row.tier !== lastTier ? row.tier : null;
            if (band) lastTier = row.tier;
            return (
              <React.Fragment key={`${row.champion}-${row.rank}-${i}`}>
                {band ? (
                  <div className="mt-band" style={tierVars(band)}>
                    <span className="mt-band-chip">{band}</span>
                    <span className="mt-band-meta">
                      <span className="mt-band-name">{TIER_NAME[band] || band}</span>
                      <span className="mt-band-line" />
                      <span className="mt-band-count">{distCounts.get(band) || 0}</span>
                    </span>
                  </div>
                ) : null}
                <Link
                  className="mt-tr mt-row"
                  to={`/tierlist/${encodeURIComponent(row.champion)}?rank=${encodeURIComponent(rank)}`}
                >
                  <span className="mt-rank mt-col-rank">{row.rank || i + 1}</span>
                  <span className="mt-champ">
                    <img src={champIconUrl(row.champion, version)} alt="" width={30} height={30} loading="lazy" />
                    <strong>{row.champion}</strong>
                  </span>
                  <span className="mt-tier" style={tierVars(row.tier)}>{row.tier}</span>
                  <Metric
                    className="mt-col-wr"
                    value={wr}
                    fill={(wr - (avgWr - 12)) / 24}
                    mark={0.5}
                    tone={tone}
                    bar={WR_BAR[tone]}
                  />
                  <span className={`mt-delta mt-col-delta ${delta > 0 ? 'is-up' : (delta < 0 ? 'is-down' : 'is-flat')}`}>
                    {fmtDelta(row.delta)}
                  </span>
                  <Metric
                    className="mt-col-pick"
                    value={Number(row.pickrate) || 0}
                    fill={(Number(row.pickrate) || 0) / scale.pick}
                    tone="is-mid"
                    bar="linear-gradient(90deg, #5b48b8, #9676ff)"
                  />
                  {showBan ? (
                    <Metric
                      className="mt-col-ban"
                      value={Number(row.banrate) || 0}
                      fill={(Number(row.banrate) || 0) / scale.ban}
                      tone="is-mid"
                      bar="linear-gradient(90deg, #a33b52, #ff6b7a)"
                    />
                  ) : null}
                  <span className="mt-games mt-col-games">{Number(row.games).toLocaleString()}</span>
                </Link>
              </React.Fragment>
            );
          }) : null}

          {!loading && !error && !rows.length ? (
            <div className="note">No champions match these filters.</div>
          ) : null}
        </div>
      </section>

      <div className="mt-foot">
        <span>
          <b>{rows.length}</b> {rows.length === 1 ? 'champion' : 'champions'}
          {tierPick ? ` in ${tierPick}` : ''}
          {tierPick ? <> · <button type="button" className="mt-clear" onClick={() => setTierPick(null)}>clear tier filter</button></> : null}
          {hasRegionFallback && data?.regionFallback ? ' · fell back to Global' : ''}
        </span>
        <span>{footNote}</span>
      </div>
    </div>
  );
}
