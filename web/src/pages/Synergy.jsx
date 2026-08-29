import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import RoleIcon from '../components/RoleIcon';
import { getSynergy } from '../api';
import { useSession } from '../session';
import { REGIONS, champIconUrl, ddragonVersion, platformShort } from '../lib';
import TierModeNav from '../components/TierModeNav';
import './Synergy.css';

const PAIRINGS = [
  { id: 'BOTTOM_UTILITY', role1: 'ADC', role2: 'Support' },
  { id: 'JUNGLE_MIDDLE', role1: 'Jungle', role2: 'Mid' },
  { id: 'TOP_JUNGLE', role1: 'Top', role2: 'Jungle' },
  { id: 'JUNGLE_UTILITY', role1: 'Jungle', role2: 'Support' },
  { id: 'TOP_MIDDLE', role1: 'Top', role2: 'Mid' },
  { id: 'TOP_BOTTOM', role1: 'Top', role2: 'ADC' },
  { id: 'TOP_UTILITY', role1: 'Top', role2: 'Support' },
];

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

const TIMES = [
  { id: '7days', label: '7 days' },
  { id: '14days', label: '14 days' },
  { id: '30days', label: '30 days' },
];

const clamp01 = (n) => Math.max(0, Math.min(1, n));

function fmtSynergy(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = Math.abs(value).toFixed(2);
  return value >= 0 ? `+${n}` : `−${n}`;
}

function wrTone(wr) {
  if (wr >= 54) return 'is-hot';
  if (wr >= 51) return 'is-good';
  if (wr >= 49) return 'is-mid';
  return 'is-bad';
}

const WR_BAR = {
  'is-hot': 'linear-gradient(90deg, #ffb454, #ffd08a)',
  'is-good': 'linear-gradient(90deg, #2fae78, #3ecf8e)',
  'is-mid': 'linear-gradient(90deg, #5c6485, #8890b5)',
  'is-bad': 'linear-gradient(90deg, #c4444f, #ff8d96)',
};

/** Win rate only varies in a narrow band, so stretch bars over 42–62%. */
function Metric({ value, fill, tone, bar, className = '' }) {
  return (
    <div className={`sy-metric ${className}`}>
      <span className={`sy-metric-val ${tone || 'is-mid'}`}>{value.toFixed(1)}%</span>
      <span className="sy-metric-bar">
        <i style={{ width: `${Math.max(2, Math.round(clamp01(fill) * 100))}%`, background: bar }} />
      </span>
    </div>
  );
}

/** Diverging bar around a zero centre — the sign is the whole point here. */
function SynergyBar({ value, max, className = '' }) {
  const v = Number(value) || 0;
  const mag = clamp01(Math.abs(v) / (max || 1)) * 50;
  const up = v >= 0;
  return (
    <div className={`sy-div ${className}`}>
      <span className={`sy-div-val ${up ? 'is-up' : 'is-down'}`}>{fmtSynergy(v)}</span>
      <span className="sy-div-track">
        <i
          className={up ? 'is-up' : 'is-down'}
          style={up ? { left: '50%', width: `${mag}%` } : { left: `${50 - mag}%`, width: `${mag}%` }}
        />
      </span>
    </div>
  );
}

function DuoFaces({ row, version }) {
  return (
    <span className="sy-faces">
      <img src={champIconUrl(row.champion1Id || row.champion1, version)} alt="" />
      <img src={champIconUrl(row.champion2Id || row.champion2, version)} alt="" />
    </span>
  );
}

function HighlightTile({ label, row, version, value, tone }) {
  if (!row) return null;
  return (
    <div className={`sy-tile is-${tone}`}>
      <em>{label}</em>
      <div className="sy-tile-body">
        <DuoFaces row={row} version={version} />
        <span className="sy-tile-names">
          {row.champion1} <i>&</i> {row.champion2}
        </span>
      </div>
      <strong className={`sy-tile-val is-${tone}`}>{value}</strong>
    </div>
  );
}

export default function Synergy() {
  const { session } = useSession();
  const [pairId, setPairId] = useState('BOTTOM_UTILITY');
  const [rank, setRank] = useState('master');
  const [platform, setPlatform] = useState(session?.platform || 'euw1');
  const [timeframe, setTimeframe] = useState('30days');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'synergy', dir: 'desc' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('16.16.1');

  useEffect(() => { ddragonVersion().then(setVersion); }, []);
  useEffect(() => {
    if (session?.platform) setPlatform(session.platform);
  }, [session?.platform]);

  // The API ships the valid pairings; the local list is just a first-paint fallback.
  const pairings = data?.pairings?.length ? data.pairings : PAIRINGS;
  const pair = useMemo(
    () => pairings.find((p) => p.id === pairId) || PAIRINGS.find((p) => p.id === pairId) || PAIRINGS[0],
    [pairings, pairId],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getSynergy({
      platform,
      rank,
      role1: pair.role1,
      role2: pair.role2,
      duoType: pair.id,
      timeframe,
    })
      .then((payload) => {
        if (!alive) return;
        if (payload?.ok === false) {
          setError(payload.error || 'Synergy failed');
          setData(payload);
          return;
        }
        setData(payload);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || 'Synergy failed');
          setData(null);
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [platform, rank, pair.role1, pair.role2, pair.id, timeframe]);

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows || []).filter((row) => (
      !q || `${row.champion1} ${row.champion2}`.toLowerCase().includes(q)
    ));
  }, [data, query]);

  const rows = useMemo(() => {
    const pick = (row) => {
      if (sort.key === 'winrate') return Number(row.winrate) || 0;
      if (sort.key === 'games') return Number(row.games) || 0;
      if (sort.key === 'expectedWr') return Number(row.expectedWr) || 0;
      return Number(row.synergy) || 0;
    };
    return [...pool].sort((a, b) => (
      sort.dir === 'desc' ? pick(b) - pick(a) || b.games - a.games : pick(a) - pick(b) || b.games - a.games
    ));
  }, [pool, sort]);

  const stats = useMemo(() => {
    if (!pool.length) return null;
    let best = pool[0];
    let worst = pool[0];
    let played = pool[0];
    let negatives = 0;
    for (const row of pool) {
      if ((row.synergy ?? 0) > (best.synergy ?? 0)) best = row;
      if ((row.synergy ?? 0) < (worst.synergy ?? 0)) worst = row;
      if ((row.games ?? 0) > (played.games ?? 0)) played = row;
      if ((row.synergy ?? 0) < 0) negatives += 1;
    }
    return { best, worst, played, negatives };
  }, [pool]);

  // Shared scale so the diverging bars stay comparable down the column.
  const scale = useMemo(() => ({
    synergy: Math.max(...rows.map((r) => Math.abs(Number(r.synergy) || 0)), 1),
  }), [rows]);

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  };

  const Th = ({ id, label, num, title, className = '' }) => (
    <button
      type="button"
      className={`sy-th${num ? ' is-num' : ''}${sort.key === id ? ' is-on' : ''} ${className}`}
      onClick={() => toggleSort(id)}
      title={title || `Sort by ${label}`}
    >
      {label}
      <i>{sort.key === id && sort.dir === 'asc' ? '▲' : '▼'}</i>
    </button>
  );

  const hrefFor = (champion, role) => `/tierlist/${encodeURIComponent(champion)}?role=${encodeURIComponent(role)}&rank=${encodeURIComponent(rank)}&platform=${encodeURIComponent(platform)}`;
  const pairLabel = `${pair.role1} + ${pair.role2}`;

  return (
    <div className="sy-page">
      <TierModeNav active="synergy" />

      <header className="sy-hero">
        <div className="sy-hero-copy">
          <p className="sy-kicker">Tierlist · Duos</p>
          <h1>Duo Winrate &amp; Synergy</h1>
          <p>
            How much better a {pairLabel.toLowerCase()} pair performs together than each champion
            manages on its own. Positive means the duo beats the sum of its parts.
          </p>
        </div>
        <div className="sy-hero-meta">
          <div className="sy-stat">
            <em>Duos analyzed</em>
            <strong>{loading ? '—' : (data?.analysed || data?.total || 0).toLocaleString()}</strong>
          </div>
          <div className="sy-stat">
            <em>Pairs listed</em>
            <strong>{loading ? '—' : rows.length.toLocaleString()}</strong>
            {data?.minGames ? <span>{data.minGames}+ games each</span> : null}
          </div>
          <div className="sy-stat is-soft">
            <em>Scope</em>
            <strong>
              {platformShort(platform)}
              <span>· {rank.replace(/_/g, ' ')}</span>
            </strong>
            {data?.patch ? <span>Patch {data.patch}</span> : null}
          </div>
        </div>
      </header>

      <section className="sy-panel">
        <div className="sy-tools">
          <div className="sy-pairs" role="group" aria-label="Role pairing">
            {pairings.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`sy-pair${p.id === pairId ? ' is-on' : ''}`}
                onClick={() => setPairId(p.id)}
              >
                <RoleIcon role={p.role1} size={15} />
                <RoleIcon role={p.role2} size={15} />
                <span>{p.role1} + {p.role2}</span>
              </button>
            ))}
          </div>

          <div className="sy-filters">
            <label>
              <span>Rank</span>
              <select value={rank} onChange={(e) => setRank(e.target.value)}>
                {RANKS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            <label>
              <span>Region</span>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {REGIONS.map((r) => <option key={r.platform} value={r.platform}>{r.short}</option>)}
              </select>
            </label>
            <label>
              <span>Window</span>
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                {TIMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="sy-search">
              <span>Search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Champion name…"
              />
            </label>
          </div>
        </div>

        {error ? <div className="note is-error">{error}</div> : null}

        {!loading && !error && stats ? (
          <div className="sy-tiles">
            <HighlightTile
              label="Strongest pairing"
              row={stats.best}
              version={version}
              tone="up"
              value={`${fmtSynergy(stats.best.synergy)}%`}
            />
            <HighlightTile
              label="Worst pairing"
              row={stats.worst}
              version={version}
              tone="down"
              value={`${fmtSynergy(stats.worst.synergy)}%`}
            />
            <HighlightTile
              label="Most played"
              row={stats.played}
              version={version}
              tone="neutral"
              value={`${Number(stats.played.games).toLocaleString()} games`}
            />
          </div>
        ) : null}

        <div className="sy-table">
          <div className="sy-tr sy-tr--head">
            <span className="sy-num sy-col-rank">#</span>
            <span>Duo</span>
            <Th id="winrate" label="Duo WR" className="sy-col-wr" />
            <Th id="expectedWr" label="Expected" num className="sy-col-exp" title="Sort by the pair's solo-lane baseline win rate" />
            <Th id="synergy" label="Synergy" className="sy-col-syn" />
            <Th id="games" label="Games" num className="sy-col-games" />
          </div>

          {loading ? Array.from({ length: 10 }, (_, i) => (
            <div className="sy-tr sy-skel-row" key={i}>
              <span className="sy-skel sy-col-rank" />
              <span className="sy-skel-duo">
                <span className="sy-skel is-face" />
                <span className="sy-skel is-face" />
                <span className="sy-skel" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
              </span>
              <span className="sy-skel sy-col-wr" />
              <span className="sy-skel sy-col-exp" />
              <span className="sy-skel sy-col-syn" />
              <span className="sy-skel sy-col-games" />
            </div>
          )) : null}

          {!loading && !error ? rows.map((row, i) => {
            const wr = Number(row.winrate) || 0;
            const tone = wrTone(wr);
            const syn = Number(row.synergy) || 0;
            return (
              <div key={`${row.champion1}-${row.champion2}-${i}`} className={`sy-tr${syn < 0 ? ' is-neg' : ''}`}>
                <span className="sy-rank sy-num sy-col-rank">{i + 1}</span>
                <span className="sy-champs">
                  <Link className="sy-champ" to={hrefFor(row.champion1, row.role1)}>
                    <img src={champIconUrl(row.champion1Id || row.champion1, version)} alt="" loading="lazy" />
                    <strong>{row.champion1}</strong>
                  </Link>
                  <em>&amp;</em>
                  <Link className="sy-champ" to={hrefFor(row.champion2, row.role2)}>
                    <img src={champIconUrl(row.champion2Id || row.champion2, version)} alt="" loading="lazy" />
                    <strong>{row.champion2}</strong>
                  </Link>
                </span>
                <Metric className="sy-col-wr" value={wr} fill={(wr - 42) / 20} tone={tone} bar={WR_BAR[tone]} />
                <span className="sy-exp sy-col-exp" title="Average solo win rate for these two champions in these roles">
                  {Number(row.expectedWr).toFixed(1)}%
                </span>
                <SynergyBar value={syn} max={scale.synergy} className="sy-col-syn" />
                <span className="sy-games sy-col-games">{Number(row.games).toLocaleString()}</span>
              </div>
            );
          }) : null}

          {!loading && !error && !rows.length ? (
            <div className="note">No duos match this filter.</div>
          ) : null}
        </div>
      </section>

      <div className="sy-foot">
        <span>
          <b>{rows.length}</b> {pairLabel} pairs
          {stats ? <> · <b>{stats.negatives}</b> with negative synergy</> : null}
          {data?.minGames ? ` · ${data.minGames}+ games and on-role lane share` : ''}
        </span>
        <span>Synergy = duo win rate − the average solo win rate of both champions.</span>
      </div>
    </div>
  );
}
