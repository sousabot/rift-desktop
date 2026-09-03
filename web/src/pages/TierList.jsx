import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { peekTierList, hydrateTierListFromSnapshot, refreshTierList } from '../api';
import { useSession } from '../session';
import { REGIONS, champIconUrl, ddragonVersion, platformShort } from '../lib';
import TierModeNav from '../components/TierModeNav';
import RoleIcon from '../components/RoleIcon';
import {
  TIER_NAME, WR_BAR, clamp01, tierDistribution, tierVars, wrTone,
} from '../tierScale';
import './TierList.css';

const ROLES = ['all', 'Top', 'Jungle', 'Mid', 'ADC', 'Support'];
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
];

function Metric({ value, fill, tone, bar, className = '' }) {
  return (
    <div className={`tl-metric ${className}`}>
      <span className={`tl-metric-val ${tone || 'is-mid'}`}>{value.toFixed(1)}%</span>
      <span className="tl-metric-bar">
        <i style={{ width: `${Math.max(2, Math.round(clamp01(fill) * 100))}%`, background: bar }} />
      </span>
    </div>
  );
}

function DeltaCell({ delta, className = '' }) {
  if (!delta) return <span className={`tl-delta is-flat ${className}`}>—</span>;
  const up = delta > 0;
  return (
    <span className={`tl-delta ${up ? 'is-up' : 'is-down'} ${className}`} title="Win rate change vs previous patch">
      {up ? '+' : '−'}
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}

function MoversCard({ title, rows, version, dir, hrefFor }) {
  if (!rows.length) return null;
  return (
    <div className={`tl-mover is-${dir}`}>
      <h3>
        {title}
        <b>{dir === 'up' ? '▲' : '▼'}</b>
      </h3>
      <div className="tl-mover-list">
        {rows.map((row) => (
          <Link key={`${row.champion}-${row.role}`} to={hrefFor(row)} className="tl-mover-row">
            <img src={champIconUrl(row.champion, version)} alt="" width={24} height={24} />
            <span className="tl-mover-name">
              {row.champion} <i>{row.role}</i>
            </span>
            <span className={`tl-mover-val is-${dir}`}>
              {row.delta > 0 ? '+' : '−'}
              {Math.abs(row.delta).toFixed(1)}%
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function TierList() {
  const { session } = useSession();
  const [role, setRole] = useState('all');
  const [rank, setRank] = useState('master');
  const [platform, setPlatform] = useState(session?.platform || 'euw1');
  const [query, setQuery] = useState('');
  const [offMeta, setOffMeta] = useState(false);
  const [tierPick, setTierPick] = useState(null);
  const [sort, setSort] = useState({ key: 'meta', dir: 'desc' });
  const [data, setData] = useState(() => peekTierList({ platform: session?.platform || 'euw1', rank: 'master' }));
  const [loading, setLoading] = useState(() => !peekTierList({ platform: session?.platform || 'euw1', rank: 'master' }));
  const [error, setError] = useState('');
  const [version, setVersion] = useState('16.16.1');

  useEffect(() => { ddragonVersion().then(setVersion); }, []);

  useEffect(() => {
    if (session?.platform) setPlatform(session.platform);
  }, [session?.platform]);

  useEffect(() => {
    let alive = true;
    setError('');
    (async () => {
      let cached = peekTierList({ platform, rank });
      if (!cached) {
        cached = await hydrateTierListFromSnapshot({ platform, rank });
      }
      if (!alive) return;
      if (cached) setData(cached);
      setLoading(true);
      try {
        const payload = await refreshTierList({ platform, rank });
        if (alive && payload) setData(payload);
      } catch (err) {
        if (!alive) return;
        if (cached?.rows?.length) return;
        setError(err.message || 'Tier list failed');
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [platform, rank]);

  const hasRows = Array.isArray(data?.rows) && data.rows.length > 0;
  const refreshing = loading && hasRows;

  // Filters that the tier chips and sorting both sit on top of.
  const pool = useMemo(() => {
    const all = data?.rows || [];
    const q = query.trim().toLowerCase();
    let list = all.filter((row) => {
      if (row.lowSample) return false;
      if (q && !String(row.champion).toLowerCase().includes(q)) return false;
      if (role !== 'all' && row.role !== role) return false;
      // Role view: keep anyone with real presence in that lane (Sylas Jungle ~40%).
      // All-roles view: primary only — tiny flex picks stay under Off-meta.
      if (!offMeta) {
        const lanePct = Number(row.lanePct) || 0;
        if (role === 'all') {
          if (row.isPrimary === false || lanePct < 12) return false;
        } else if (lanePct < 12) {
          return false;
        }
      }
      return true;
    });
    if (role === 'all') {
      const best = new Map();
      for (const row of list) {
        const prev = best.get(row.champion);
        if (!prev || (row.metaScore ?? row.score) > (prev.metaScore ?? prev.score)) {
          best.set(row.champion, row);
        }
      }
      list = [...best.values()];
    }
    return list.sort((a, b) => {
      const ar = role === 'all' ? a.rank : (a.roleRank || a.rank);
      const br = role === 'all' ? b.rank : (b.roleRank || b.rank);
      return ar - br || (b.metaScore ?? b.score) - (a.metaScore ?? a.score);
    });
  }, [data, role, query, offMeta]);

  const dist = useMemo(() => tierDistribution(pool), [pool]);

  const movers = useMemo(() => {
    const shifted = pool.filter((row) => row.delta && row.games >= 100);
    const up = [...shifted].sort((a, b) => b.delta - a.delta).slice(0, 4);
    const down = [...shifted].sort((a, b) => a.delta - b.delta).slice(0, 4);
    return { up: up.filter((r) => r.delta > 0), down: down.filter((r) => r.delta < 0) };
  }, [pool]);

  const rows = useMemo(() => {
    const list = tierPick ? pool.filter((row) => row.tier === tierPick) : pool;
    if (sort.key === 'meta') return sort.dir === 'desc' ? list : [...list].reverse();
    const pick = (row) => {
      if (sort.key === 'games') return Number(row.games) || 0;
      if (sort.key === 'delta') return Number(row.delta) || 0;
      return Number(row[sort.key]) || 0;
    };
    return [...list].sort((a, b) => (sort.dir === 'desc' ? pick(b) - pick(a) : pick(a) - pick(b)));
  }, [pool, tierPick, sort]);

  // Bars read as "relative to the highest value on screen".
  const scale = useMemo(() => ({
    pick: Math.max(...rows.map((r) => Number(r.pickrate) || 0), 1),
    ban: Math.max(...rows.map((r) => Number(r.banrate) || 0), 1),
  }), [rows]);

  const hrefFor = (row) => `/tierlist/${encodeURIComponent(row.champion)}?role=${encodeURIComponent(row.role)}&rank=${encodeURIComponent(rank)}&platform=${encodeURIComponent(platform)}${data?.patch ? `&patch=${encodeURIComponent(data.patch)}` : ''}`;

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  };

  const grouped = sort.key === 'meta' && sort.dir === 'desc';
  const distCounts = useMemo(() => new Map(dist.map((d) => [d.tier, d.count])), [dist]);

  const Th = ({ id, label, num, title, className = '' }) => (
    <button
      type="button"
      className={`tl-th${num ? ' is-num' : ''}${sort.key === id ? ' is-on' : ''} ${className}`}
      onClick={() => toggleSort(id)}
      title={title || `Sort by ${label}`}
    >
      {label}
      <i>{sort.key === id && sort.dir === 'asc' ? '▲' : '▼'}</i>
    </button>
  );

  let lastTier = null;

  return (
    <div className="tl-page">
      <TierModeNav active="ranked" />
      <header className="page-head">
        <h1>Tier list</h1>
        <p>
          Live Solo/Duo ranked meta by role.
          {data?.patch ? ` Patch ${data.patch}.` : ''}
          {data?.analysed ? ` ${Number(data.analysed).toLocaleString()} games analysed.` : ''}
          {refreshing ? <span className="tl-updating"> Updating…</span> : null}
        </p>
      </header>

      <div className="tl-filters">
        <div className="tl-roles">
          {ROLES.map((id) => (
            <button
              key={id}
              type="button"
              className={`tl-role${role === id ? ' is-on' : ''}`}
              onClick={() => setRole(id)}
            >
              {id === 'all' ? null : <RoleIcon role={id} size={15} />}
              {id === 'all' ? 'All roles' : id}
            </button>
          ))}
        </div>
        <select className="tl-select" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Region">
          {REGIONS.map((r) => <option key={r.platform} value={r.platform}>{r.short}</option>)}
        </select>
        <select className="tl-select" value={rank} onChange={(e) => setRank(e.target.value)} aria-label="Rank">
          {RANKS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <label className={`tl-toggle${offMeta ? ' is-on' : ''}`} title="Include rare flex picks under 12% lane presence">
          <input type="checkbox" checked={offMeta} onChange={(e) => setOffMeta(e.target.checked)} />
          Off-meta
        </label>
        <input
          className="tl-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search champion…"
        />
      </div>

      {!error && dist.length > 1 ? (
        <div className="tl-dist" role="group" aria-label="Filter by tier">
          {dist.map((d) => (
            <button
              key={d.tier}
              type="button"
              className={`tl-dist-seg${tierPick === d.tier ? ' is-on' : ''}`}
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

      {!error && (movers.up.length >= 2 || movers.down.length >= 2) ? (
        <div className="tl-movers">
          <MoversCard title="Rising this patch" rows={movers.up} version={version} dir="up" hrefFor={hrefFor} />
          <MoversCard title="Falling this patch" rows={movers.down} version={version} dir="down" hrefFor={hrefFor} />
        </div>
      ) : null}

      {error ? <div className="note is-error">{error}</div> : null}

      <div className="card tl-card">
        <div className="tl-head">
          <Th id="meta" label="#" num className="tl-col-rank" title="Sort by meta rank" />
          <span>Champion</span>
          <span>Tier</span>
          <Th id="winrate" label="Win rate" />
          <Th id="delta" label="Δ" num className="tl-col-delta" title="Sort by win rate change vs previous patch" />
          <Th id="pickrate" label="Pick" className="tl-col-pr" />
          <Th id="banrate" label="Ban" className="tl-col-br" />
          <Th id="games" label="Games" num className="tl-col-games" />
        </div>

        {loading && !hasRows ? Array.from({ length: 12 }, (_, i) => (
          <div className="tl-skel-row" key={i}>
            <span className="tl-skel tl-col-rank" />
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="tl-skel is-icon" />
              <span className="tl-skel" style={{ width: `${45 + ((i * 13) % 40)}%` }} />
            </span>
            <span className="tl-skel" />
            <span className="tl-skel" />
            <span className="tl-skel tl-col-delta" />
            <span className="tl-skel tl-col-pr" />
            <span className="tl-skel tl-col-br" />
            <span className="tl-skel tl-col-games" />
          </div>
        )) : null}

        {!error && hasRows ? rows.map((row, i) => {
          const wr = Number(row.winrate) || 0;
          const tone = wrTone(wr);
          const band = grouped && row.tier !== lastTier ? row.tier : null;
          if (band) lastTier = row.tier;
          return (
            <React.Fragment key={`${row.champion}-${row.role}-${i}`}>
              {band ? (
                <div className="tl-band" style={tierVars(band)}>
                  <span className="tl-band-chip">{band}</span>
                  <span className="tl-band-meta">
                    <span className="tl-band-name">{TIER_NAME[band] || band}</span>
                    <span className="tl-band-line" />
                    <span className="tl-band-count">{distCounts.get(band) || 0}</span>
                  </span>
                </div>
              ) : null}
              <Link to={hrefFor(row)} className="tl-row">
                <span className="tl-rank tl-col-rank">{i + 1}</span>
                <span className="tl-champ">
                  <img src={champIconUrl(row.champion, version)} alt="" width={30} height={30} loading="lazy" />
                  <span className="tl-champ-text">
                    <span className="tl-champ-name">{row.champion}</span>
                    <span className="tl-champ-role">
                      <RoleIcon role={row.role} size={13} />
                      <span>{row.role}</span>
                    </span>
                    {row.isPrimary === false ? <span className="tl-off">OFF</span> : null}
                  </span>
                </span>
                <span className="tl-tier" style={tierVars(row.tier)}>{row.tier}</span>
                <Metric value={wr} fill={(wr - 44) / 12} tone={tone} bar={WR_BAR[tone]} />
                <DeltaCell delta={Number(row.delta) || 0} className="tl-col-delta" />
                <Metric
                  className="tl-col-pr"
                  value={Number(row.pickrate) || 0}
                  fill={(Number(row.pickrate) || 0) / scale.pick}
                  tone="is-mid"
                  bar="linear-gradient(90deg, #5b48b8, #9676ff)"
                />
                <Metric
                  className="tl-col-br"
                  value={Number(row.banrate) || 0}
                  fill={(Number(row.banrate) || 0) / scale.ban}
                  tone="is-mid"
                  bar="linear-gradient(90deg, #a33b52, #ff6b7a)"
                />
                <span className="tl-games tl-col-games">{Number(row.games).toLocaleString()}</span>
              </Link>
            </React.Fragment>
          );
        }) : null}

        {!loading && !error && !rows.length ? (
          <div className="note" style={{ margin: 12 }}>No champions match these filters.</div>
        ) : null}
      </div>

      <div className="tl-foot">
        <span>
          <b>{rows.length}</b> {rows.length === 1 ? 'champion' : 'champions'}
          {tierPick ? ` in ${tierPick}` : ''} · {platformShort(platform)} · {RANKS.find((r) => r.id === rank)?.label || rank}
          {tierPick ? <> · <button type="button" className="tl-clear" onClick={() => setTierPick(null)}>clear tier filter</button></> : null}
        </span>
        <span>Bars for PR and BR are relative to the highest value on screen.</span>
      </div>
    </div>
  );
}
