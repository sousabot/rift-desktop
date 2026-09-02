import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import RoleIcon from '../components/RoleIcon';
import { getScouting } from '../api';
import { useSession } from '../session';
import {
  REGIONS,
  champIconUrl,
  ddragonVersion,
  platformShort,
  profileIconUrl,
  rankColor,
  rankImg,
} from '../lib';
import './Scouting.css';

const LANES = [
  { id: 'all', label: 'All', role: null },
  { id: 'top', label: 'Top', role: 'Top' },
  { id: 'jungle', label: 'Jungle', role: 'Jungle' },
  { id: 'middle', label: 'Mid', role: 'Mid' },
  { id: 'bottom', label: 'ADC', role: 'ADC' },
  { id: 'utility', label: 'Support', role: 'Support' },
];

const LP_STEPS = [300, 500, 800, 1000, 1500, 0];

function snapLpStep(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 0;
  if (n < 300) return 300;
  let best = 300;
  let dist = Infinity;
  LP_STEPS.forEach((step) => {
    if (!step) return;
    const d = Math.abs(step - n);
    if (d < dist) { dist = d; best = step; }
  });
  return best;
}

function lpCap(step) {
  const snapped = snapLpStep(step);
  if (!snapped) return { min: 0, max: null, label: 'All LP' };
  return { min: 0, max: snapped, label: `Max ${snapped.toLocaleString()} LP` };
}

const LANE_ROLE = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support',
};

const APEX = /MASTER|GRANDMASTER|CHALLENGER/i;

function profilePath(row) {
  const name = String(row?.gameName || '').trim();
  const tag = String(row?.tagLine || '').trim();
  if (!name || !tag) return null;
  const q = new URLSearchParams({ name, tag });
  const plat = String(row?.platform || '').trim().toLowerCase();
  if (plat) q.set('platform', plat);
  return `/dashboard?${q.toString()}`;
}

function champSrc(ch, version) {
  if (ch.championKey) {
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${ch.championKey}.png`;
  }
  return champIconUrl(ch.champion, version);
}

function fmtDiff(n, digits = 0) {
  const v = Number(n) || 0;
  const body = digits ? v.toFixed(digits) : String(Math.round(v));
  if (v > 0) return `+${body}`;
  return body;
}

function diffClass(n) {
  const v = Number(n) || 0;
  if (v > 0) return 'is-pos';
  if (v < 0) return 'is-neg';
  return '';
}

function wrTone(wr) {
  if (wr >= 58) return 'is-hot';
  if (wr >= 53) return 'is-good';
  if (wr >= 48) return 'is-mid';
  return 'is-bad';
}

function kdaTone(kda) {
  if (kda >= 5) return 'is-hot';
  if (kda >= 3.5) return 'is-good';
  if (kda >= 2.4) return 'is-mid';
  return 'is-bad';
}

function formatTier(tier, division) {
  const raw = String(tier || '').replace(/_/g, ' ').trim();
  if (!raw) return '';
  const nice = raw.charAt(0) + raw.slice(1).toLowerCase();
  if (APEX.test(raw) || !division) return nice;
  return `${nice} ${division}`;
}

function recordOf(row) {
  const games = Number(row.games) || 0;
  const wr = Number(row.winrate) || 0;
  const wins = Number.isFinite(Number(row.wins))
    ? Number(row.wins)
    : Math.round(games * wr / 100);
  const losses = Number.isFinite(Number(row.losses))
    ? Number(row.losses)
    : Math.max(0, games - wins);
  return { games, wr, wins, losses };
}

function updatedLabel(at) {
  if (!at) return 'Live feed';
  const mins = Math.max(1, Math.round((Date.now() - at) / 60000));
  if (mins < 60) return `Updated ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `Updated ${hrs}h ago`;
}

function Avatar({ row, version }) {
  const [broken, setBroken] = useState(false);
  const src = !broken && row.profileIconId ? profileIconUrl(row.profileIconId, version) : '';
  return (
    <span className="sc-avatar">
      {src
        ? <img src={src} alt="" width={36} height={36} loading="lazy" onError={() => setBroken(true)} />
        : <b>{String(row.displayName || row.gameName || '?').charAt(0).toUpperCase()}</b>}
    </span>
  );
}

function SortBtn({ id, sort, dir, onSort, children, className = '', title }) {
  const on = sort === id;
  return (
    <button
      type="button"
      className={`sc-sort${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => onSort(id)}
      title={title}
    >
      {children}
      {on ? <i>{dir === 'desc' ? '↓' : '↑'}</i> : null}
    </button>
  );
}

function Metric({ id, sort, dir, onSort, value, label, className = '', title }) {
  return (
    <SortBtn
      id={id}
      sort={sort}
      dir={dir}
      onSort={onSort}
      className={`sc-metric${className ? ` ${className}` : ''}`}
      title={title || `Sort by ${label}`}
    >
      <b>{value}</b>
      <em>{label}</em>
    </SortBtn>
  );
}

function WrCell({ row, sort, dir, onSort }) {
  const { wr, wins, losses, games } = recordOf(row);
  return (
    <div className={`sc-wr ${wrTone(wr)}`} title={`${wins}W – ${losses}L · ${games} games`}>
      <strong>{wr.toFixed(1)}%</strong>
      <span className="sc-wr-bar"><i style={{ width: `${Math.max(4, Math.min(100, wr))}%` }} /></span>
      <SortBtn id="games" sort={sort} dir={dir} onSort={onSort} className="sc-wr-games" title="Sort by games">
        {games}g
      </SortBtn>
    </div>
  );
}

function SkeletonRows() {
  return Array.from({ length: 8 }, (_, i) => (
    <tr key={i} className="is-skel">
      <td className="is-rank"><span className="sc-skel" style={{ width: 18 }} /></td>
      <td className="is-player">
        <div className="sc-player">
          <span className="sc-skel is-avatar" />
          <div>
            <span className="sc-skel" style={{ width: 110 }} />
            <span className="sc-skel" style={{ width: 72, marginTop: 6 }} />
          </div>
        </div>
      </td>
      <td><span className="sc-skel" style={{ width: 88 }} /></td>
      <td><span className="sc-skel" style={{ width: 64 }} /></td>
      <td><span className="sc-skel" style={{ width: 48 }} /></td>
      <td><span className="sc-skel" style={{ width: 70 }} /></td>
      <td><span className="sc-skel" style={{ width: 70 }} /></td>
      <td><span className="sc-skel" style={{ width: 64 }} /></td>
      <td><span className="sc-skel" style={{ width: 96 }} /></td>
    </tr>
  ));
}

export default function Scouting() {
  const { session } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [platform, setPlatform] = useState(
    searchParams.get('platform') || session?.platform || 'euw1',
  );
  const [lane, setLane] = useState(searchParams.get('lane') || 'all');
  const [minLp, setMinLp] = useState(
    searchParams.has('lp') ? snapLpStep(searchParams.get('lp')) : 0,
  );
  const [sort, setSort] = useState(searchParams.get('sort') || 'kda');
  const [dir, setDir] = useState(searchParams.get('dir') || 'desc');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [draftQ, setDraftQ] = useState(searchParams.get('q') || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('16.16.1');

  useEffect(() => { ddragonVersion().then(setVersion); }, []);

  useEffect(() => {
    if (session?.platform && !searchParams.get('platform')) {
      setPlatform(session.platform);
    }
  }, [session?.platform, searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(draftQ.trim()), 250);
    return () => clearTimeout(t);
  }, [draftQ]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('platform', platform);
    if (lane !== 'all') next.set('lane', lane);
    if (minLp) next.set('lp', String(minLp));
    if (sort !== 'kda') next.set('sort', sort);
    if (dir !== 'desc') next.set('dir', dir);
    if (query) next.set('q', query);
    setSearchParams(next, { replace: true });
  }, [platform, lane, minLp, sort, dir, query, setSearchParams]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const cap = query ? { min: 0, max: null } : lpCap(minLp);
    getScouting({
      platform,
      lane,
      minLp: cap.min,
      maxLp: cap.max,
      sort,
      dir,
      q: query,
      limit: 250,
    })
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        if (payload?.ddragonVersion) setVersion(payload.ddragonVersion);
        if (payload?.ok === false) setError(payload.error || 'Could not load scouting players.');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || 'Could not load scouting players.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [platform, lane, minLp, sort, dir, query]);

  const entries = data?.entries || [];
  const hasRows = entries.length > 0;
  const slim = data?.source === 'riot';
  const reloading = loading && hasRows;
  const nearestLp = useMemo(() => snapLpStep(minLp), [minLp]);
  const band = useMemo(() => lpCap(nearestLp), [nearestLp]);

  const maxLp = useMemo(
    () => Math.max(1, ...entries.map((row) => Number(row.lp) || 0)),
    [entries],
  );

  const region = REGIONS.find((r) => r.platform === platform)?.short || platform.toUpperCase();
  const laneLabel = LANES.find((row) => row.id === lane)?.label || 'All';
  const sortLabel = {
    lp: 'LP', level: 'level', games: 'games', winrate: 'win rate', kda: 'KDA',
    goldDiffAt15: 'gold@15', csDiffAt15: 'CS@15', killParticipation: 'KP%',
    firstbloodRate: 'first blood', visionScorePerMinute: 'vision/m',
    csm: 'CS/m', dmgm: 'damage/m', dmggold: 'damage/gold', uniqueChampions: 'pool',
  }[slim ? (data?.sort || 'lp') : sort] || sort;

  const pickSort = (id) => {
    if (sort === id) setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSort(id);
      setDir('desc');
    }
  };

  return (
    <div className="sc-page">
      <header className="sc-hero">
        <div>
          <p className="sc-kicker">Scouting</p>
          <h1>Scouting Players</h1>
          <p>
            {updatedLabel(data?.updatedAt)}
            {' · '}
            {slim
              ? 'Master+ SoloQ ladder by region — LP and win rate.'
              : 'Master+ SoloQ by region. Click a metric to sort.'}
          </p>
        </div>
        <div className="sc-hero-meta">
          <div className="sc-stat">
            <em>Shown</em>
            <strong>{loading && !hasRows ? '—' : entries.length}</strong>
          </div>
          <div className="sc-stat">
            <em>Matched</em>
            <strong>{loading && !hasRows ? '—' : (data?.matched ?? 0).toLocaleString()}</strong>
            <span>of {(data?.total || 0).toLocaleString()} in {region}</span>
          </div>
        </div>
      </header>

      <div className="sc-tools">
        {slim ? null : (
        <div className="sc-lanes" role="group" aria-label="Lane filter">
          {LANES.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`sc-lane${lane === row.id ? ' is-on' : ''}`}
              onClick={() => setLane(row.id)}
              title={row.label}
            >
              {row.role ? <RoleIcon role={row.role} size={16} /> : <span className="sc-lane-all">All</span>}
              {row.role ? <span>{row.label}</span> : null}
            </button>
          ))}
        </div>
        )}

        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          aria-label="Region"
        >
          {REGIONS.map((r) => (
            <option key={r.platform} value={r.platform}>{r.short}</option>
          ))}
        </select>

        <label className="sc-lp">
          <span>{band.label}</span>
          <input
            type="range"
            min={0}
            max={LP_STEPS.length - 1}
            step={1}
            value={Math.max(0, LP_STEPS.indexOf(nearestLp))}
            onChange={(e) => setMinLp(LP_STEPS[Number(e.target.value)] || 0)}
            aria-label="Maximum LP"
          />
        </label>

        <input
          className="sc-search"
          type="search"
          placeholder="Search player…"
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          aria-label="Search player"
        />
      </div>

      <p className="sc-context">
        {region}
        {' · '}
        {query ? 'Name search · all Master+' : band.label}
        {slim ? null : ` · ${laneLabel}`}
        {' · '}
        Sorted by {sortLabel}
        {dir === 'asc' ? ' (low first)' : ''}
      </p>

      {error ? <div className="note is-error">{error}</div> : null}

      {loading && !hasRows ? (
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th className="is-rank">#</th>
                <th className="is-player">Player</th>
                <th>Rank</th>
                <th>WR</th>
                <th>KDA</th>
                <th className="is-num">Early</th>
                <th className="is-num">Impact</th>
                <th className="is-num">Farm</th>
                <th>Pool</th>
              </tr>
            </thead>
            <tbody><SkeletonRows /></tbody>
          </table>
        </div>
      ) : null}

      {!loading && !error && !hasRows ? (
        <div className="sc-empty">
          <h2>No players for this filter</h2>
          <p>Drop the LP floor, switch region, or clear the search.</p>
        </div>
      ) : null}

      {hasRows ? (
        <div className={`sc-table-wrap${reloading ? ' is-reloading' : ''}`}>
          <table className={`sc-table${slim ? ' is-slim' : ''}`}>
            <thead>
              <tr>
                <th className="is-rank">#</th>
                <th className="is-player">Player</th>
                <th>
                  <SortBtn id="lp" sort={sort} dir={dir} onSort={pickSort}>Rank</SortBtn>
                </th>
                <th>
                  <SortBtn id="winrate" sort={sort} dir={dir} onSort={pickSort}>WR</SortBtn>
                </th>
                {slim ? null : (
                  <>
                    <th>
                      <SortBtn id="kda" sort={sort} dir={dir} onSort={pickSort}>KDA</SortBtn>
                    </th>
                    <th className="is-num">Early</th>
                    <th className="is-num">Impact</th>
                    <th className="is-num">Farm</th>
                    <th>
                      <SortBtn id="uniqueChampions" sort={sort} dir={dir} onSort={pickSort}>Pool</SortBtn>
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => {
                const href = profilePath(row);
                const role = LANE_ROLE[row.lane] || null;
                const medal = rankImg(row.tier);
                const color = rankColor(row.tier);
                const lpPct = Math.max(6, Math.round((Number(row.lp) / maxLp) * 100));
                const tag = row.tagLine ? `#${row.tagLine}` : '';
                const plat = row.platform ? platformShort(row.platform) : '';
                const regionBit = plat && String(row.tagLine || '').toUpperCase() !== plat ? ` · ${plat}` : '';
                const showName = row.displayName || row.gameName;
                const showTag = showName === row.gameName
                  ? `${tag}${regionBit}`
                  : `${row.gameName}${tag}${regionBit}`;
                const kda = Number(row.kda) || 0;
                const hasLine = row.kills != null && row.deaths != null && row.assists != null
                  && (row.kills || row.deaths || row.assists);
                const player = (
                  <div className="sc-player">
                    <Avatar row={row} version={version} />
                    <div className="sc-who">
                      <strong>{showName}</strong>
                      <span>
                        {showTag || plat}
                        {role ? (
                          <>
                            <em>·</em>
                            <RoleIcon role={role} size={11} />
                            {role}
                          </>
                        ) : null}
                      </span>
                    </div>
                  </div>
                );
                return (
                  <tr key={row.puuid || `${row.gameName}-${row.rank}`}>
                    <td className={`is-rank${row.rank <= 3 ? ` is-${row.rank}` : ''}`}>
                      {row.rank}
                    </td>
                    <td className="is-player">
                      {href ? <Link className="sc-link" to={href}>{player}</Link> : player}
                    </td>
                    <td className={sort === 'lp' ? 'is-sorted' : ''}>
                      <div className="sc-rank" style={{ '--rc': color }}>
                        {medal ? <img src={medal} alt="" /> : null}
                        <div>
                          <b>{row.lp.toLocaleString()} <em>LP</em></b>
                          <span>{formatTier(row.tier, row.division)}</span>
                          <span className="sc-lp-bar"><i style={{ width: `${lpPct}%`, background: color }} /></span>
                        </div>
                      </div>
                    </td>
                    <td className={sort === 'winrate' || sort === 'games' ? 'is-sorted' : ''}>
                      <WrCell row={row} sort={sort} dir={dir} onSort={pickSort} />
                    </td>
                    {slim ? null : (
                      <>
                        <td className={`is-kda ${kdaTone(kda)}${sort === 'kda' ? ' is-sorted' : ''}`}>
                          <strong>{kda.toFixed(2)}</strong>
                          {hasLine ? (
                            <em>{row.kills} / {row.deaths} / {row.assists}</em>
                          ) : null}
                        </td>
                        <td className={`is-num${sort === 'goldDiffAt15' || sort === 'csDiffAt15' ? ' is-sorted' : ''}`}>
                          <div className="sc-stack">
                            <Metric
                              id="goldDiffAt15"
                              sort={sort}
                              dir={dir}
                              onSort={pickSort}
                              value={fmtDiff(row.goldDiffAt15)}
                              label="G@15"
                              className={diffClass(row.goldDiffAt15)}
                            />
                            <Metric
                              id="csDiffAt15"
                              sort={sort}
                              dir={dir}
                              onSort={pickSort}
                              value={fmtDiff(row.csDiffAt15, 1)}
                              label="CS@15"
                              className={diffClass(row.csDiffAt15)}
                            />
                          </div>
                        </td>
                        <td className={`is-num${['killParticipation', 'firstbloodRate', 'visionScorePerMinute'].includes(sort) ? ' is-sorted' : ''}`}>
                          <div className="sc-stack">
                            <Metric
                              id="killParticipation"
                              sort={sort}
                              dir={dir}
                              onSort={pickSort}
                              value={`${row.killParticipation}%`}
                              label="KP"
                            />
                            <Metric
                              id="firstbloodRate"
                              sort={sort}
                              dir={dir}
                              onSort={pickSort}
                              value={`${row.firstbloodRate}%`}
                              label="FB"
                            />
                            <Metric
                              id="visionScorePerMinute"
                              sort={sort}
                              dir={dir}
                              onSort={pickSort}
                              value={Number(row.visionScorePerMinute).toFixed(2)}
                              label="VS/m"
                            />
                          </div>
                        </td>
                        <td className={`is-num is-farm${['csm', 'dmgm', 'dmggold'].includes(sort) ? ' is-sorted' : ''}`}>
                          <div className="sc-stack">
                            <Metric
                              id="csm"
                              sort={sort}
                              dir={dir}
                              onSort={pickSort}
                              value={Number(row.csm).toFixed(2)}
                              label="CS/m"
                            />
                            <Metric
                              id="dmgm"
                              sort={sort}
                              dir={dir}
                              onSort={pickSort}
                              value={Number(row.dmgm).toLocaleString()}
                              label="DMG/m"
                            />
                            <Metric
                              id="dmggold"
                              sort={sort}
                              dir={dir}
                              onSort={pickSort}
                              value={Number(row.dmggold).toFixed(2)}
                              label="DMG/g"
                            />
                          </div>
                        </td>
                        <td className={sort === 'uniqueChampions' ? 'is-sorted' : ''}>
                          <div className="sc-champs" title={`${row.uniqueChampions} champions`}>
                            {(row.champions || []).slice(0, 4).map((ch) => (
                              <img
                                key={ch.championId}
                                src={champSrc(ch, version)}
                                alt={ch.champion}
                                title={ch.champion}
                              />
                            ))}
                            <em>{row.uniqueChampions}</em>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
