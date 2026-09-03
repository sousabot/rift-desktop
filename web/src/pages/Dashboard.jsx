import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getCareerSidebar,
  getLiveGame,
  getMatchLp,
  lookupPro,
  peekDashboard,
  prefetchDashboard,
  refreshDashboard,
} from '../api';
import { applyTrackedLp, formatLpDelta, syncMatchLp } from '../lib/lpHistory';
import { useSession } from '../session';
import {
  champIconUrl,
  ddragonVersion,
  deriveDashboardExtras,
  formatMmr,
  getRuneIndex,
  itemIconUrl,
  parseRiotIdInput,
  pingIconUrl,
  platformShort,
  profileIconUrl,
  rankColor,
  rankImg,
  roleIconUrl,
  runeIconUrl,
  summonerIconUrl,
} from '../lib';
import MatchExpand from './MatchExpand';
import {
  CollectionsCard,
  LensCard,
  PhaseCard,
  ProChip,
  StatGrid,
} from './DashboardInsights';
import './Dashboard.css';

const MODE_KEYS = ['All', 'Solo', 'Flex', 'Aram', 'Normal'];
const ROLE_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'TOP', label: 'Top' },
  { key: 'JUNGLE', label: 'Jng' },
  { key: 'MIDDLE', label: 'Mid' },
  { key: 'BOTTOM', label: 'Bot' },
  { key: 'UTILITY', label: 'Sup' },
];

function rankedQueue(mode) {
  if (mode === 'Flex') return 440;
  if (mode === 'Solo') return 420;
  return null;
}

function attachLocalLp(data, selectedMode) {
  if (!data) return data;
  const queue = rankedQueue(selectedMode);
  const ranked = selectedMode === 'Flex' ? data.flex : data.solo;
  const games = syncMatchLp({
    riotId: data.riotId,
    mode: selectedMode,
    lp: ranked?.lp ?? data.lp,
    tier: ranked?.rankTier ?? data.rankTier,
    division: ranked?.rankDivision ?? data.rankDivision,
    games: data.recentGames || [],
    queueId: queue,
  });
  return { ...data, recentGames: games };
}

function WinDonut({ winrate = 0, wins = 0, losses = 0 }) {
  const size = 84;
  const stroke = 8;
  const r = (size / 2) - stroke;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(winrate) || 0)) / 100;
  return (
    <div className="wd-donut" aria-label={`${winrate}% winrate`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#5ba2ff"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" className="wd-donut-pct">{winrate}%</text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="wd-donut-sub">{wins}W {losses}L</text>
      </svg>
    </div>
  );
}

function ScoreRing({ score, win }) {
  const size = 44;
  const stroke = 3.2;
  const r = (size / 2) - stroke;
  const circ = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const pct = value / 100;
  return (
    <div className={`wd-score-ring ${win ? 'is-win' : 'is-loss'}`} title={`Rift Score ${value}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={win ? '#3ecf8e' : '#ff5c68'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle">{Math.round(value)}</text>
      </svg>
    </div>
  );
}

function Sparkline({ data = [], color = '#3ecf8e' }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => [
      (i / (data.length - 1)) * w,
      h - ((v - min) / range) * (h - 8) - 4,
    ]);
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, [data, color]);
  return <canvas ref={ref} width={160} height={36} className="wd-spark" />;
}

function ChampImg({ name, size = 36, version }) {
  if (!name) return <span className="wd-champ-empty" style={{ width: size, height: size }} />;
  return (
    <img
      src={champIconUrl(name, version)}
      alt={name}
      title={name}
      width={size}
      height={size}
      className="wd-champ"
      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

function wrTone(wr) {
  if (wr >= 60) return 'is-hot';
  if (wr >= 50) return 'is-up';
  return 'is-down';
}

function ChampionPoolPanel({
  pool = [],
  gamesCount,
  mode,
  version,
  onMode,
}) {
  const [sort, setSort] = useState({ key: 'games', dir: 'desc' });

  const rows = useMemo(() => {
    const pick = (row) => {
      if (sort.key === 'champion') return String(row.champion || '').toLowerCase();
      if (sort.key === 'kda') return Number(row.kda) || 0;
      if (sort.key === 'cs') return Number(row.cs) || 0;
      if (sort.key === 'wr') return Number(row.wr) || 0;
      if (sort.key === 'record') return Number(row.wins) || 0;
      return Number(row.games) || 0;
    };
    return [...pool].sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (typeof av === 'string') {
        const d = av.localeCompare(bv);
        return sort.dir === 'asc' ? d : -d;
      }
      const d = sort.dir === 'asc' ? av - bv : bv - av;
      return d || (b.games - a.games);
    });
  }, [pool, sort]);

  const maxGames = Math.max(...pool.map((r) => Number(r.games) || 0), 1);
  const highlights = useMemo(() => {
    if (!pool.length) return [];
    const byGames = [...pool].sort((a, b) => b.games - a.games)[0];
    const sample = pool.filter((r) => r.games >= 2);
    const ranked = sample.length ? sample : pool;
    const byWr = [...ranked].sort((a, b) => b.wr - a.wr || b.games - a.games)[0];
    const byKda = [...ranked].sort((a, b) => Number(b.kda) - Number(a.kda) || b.games - a.games)[0];
    const min2 = sample.length > 0 && sample.length < pool.length;
    return [
      { id: 'played', sortKey: 'games', label: 'Most played', row: byGames, value: `${byGames.games} games` },
      { id: 'wr', sortKey: 'wr', label: min2 ? 'Best WR · 2+ games' : 'Best win rate', row: byWr, value: `${byWr.wr}% · ${byWr.games}g` },
      { id: 'kda', sortKey: 'kda', label: min2 ? 'Best KDA · 2+ games' : 'Best KDA', row: byKda, value: `${byKda.kda} KDA` },
    ];
  }, [pool]);

  const toggle = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: key === 'champion' ? 'asc' : 'desc' };
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  const Th = ({ id, label, num }) => (
    <button
      type="button"
      className={`wd-cp-th${num ? ' is-num' : ''}${sort.key === id ? ' is-on' : ''}`}
      onClick={() => toggle(id)}
    >
      {label}
      <i>{sort.key === id && sort.dir === 'asc' ? '▲' : '▼'}</i>
    </button>
  );

  const champWord = pool.length === 1 ? 'champion' : 'champions';

  return (
    <section className="wd-cp card">
      <header className="wd-cp-head">
        <div>
          <h2>Champion performance</h2>
          <span className="muted">
            {pool.length} {champWord} from last {gamesCount || 0} {mode} games
          </span>
        </div>
        <div className="wd-mode-filters" role="group" aria-label="Queue">
          {MODE_KEYS.map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'is-on' : ''}
              onClick={() => onMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {highlights.length ? (
        <div className="wd-cp-tiles">
          {highlights.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`wd-cp-tile${sort.key === h.sortKey ? ' is-on' : ''}`}
              onClick={() => setSort({ key: h.sortKey, dir: 'desc' })}
            >
              <ChampImg name={h.row.champion} size={40} version={version} />
              <div>
                <em>{h.label}</em>
                <strong>{h.row.champion}</strong>
                <span>{h.value}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="wd-cp-table">
        <div className="wd-cp-row wd-cp-row--head">
          <Th id="champion" label="Champion" />
          <Th id="games" label="Games" num />
          <Th id="wr" label="Win rate" num />
          <Th id="record" label="W–L" num />
          <Th id="kda" label="KDA" num />
          <Th id="cs" label="CS/M" num />
        </div>
        {rows.map((row) => {
          const wr = Number(row.wr) || 0;
          const games = Number(row.games) || 0;
          return (
            <Link
              key={row.champion}
              className="wd-cp-row"
              to={`/tierlist/${encodeURIComponent(row.champion)}`}
            >
              <span className="wd-cp-champ">
                <ChampImg name={row.champion} size={32} version={version} />
                <strong>{row.champion}</strong>
              </span>
              <span className="wd-cp-games">
                <b>{games}</b>
                <span className="wd-cp-bar">
                  <i style={{ width: `${Math.max(8, Math.round((games / maxGames) * 100))}%` }} />
                </span>
              </span>
              <span className={`wd-cp-wr ${wrTone(wr)}`}>
                <b>{wr}%</b>
                <span className="wd-cp-bar is-wr">
                  <i style={{ width: `${Math.max(4, wr)}%` }} />
                </span>
              </span>
              <span className="wd-cp-record">{row.wins}W <em>–</em> {row.losses}L</span>
              <span className="wd-cp-kda">
                <b>{row.kda}</b>
                <em>{row.kills} / {row.deaths} / {row.assists}</em>
              </span>
              <span className="wd-cp-cs">{row.cs}</span>
            </Link>
          );
        })}
        {!rows.length ? <p className="muted wd-cp-empty">No champion data for this queue.</p> : null}
      </div>
    </section>
  );
}

function dayKey(ts) {
  if (!ts) return 'Unknown';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function groupByDay(games) {
  const groups = [];
  const map = new Map();
  games.forEach((g) => {
    const key = dayKey(g.endedAt);
    if (!map.has(key)) {
      const row = { key, games: [] };
      map.set(key, row);
      groups.push(row);
    }
    map.get(key).games.push(g);
  });
  return groups;
}

function wrClass(wr, games) {
  if (games === 0 || wr == null) return '';
  if (wr >= 52) return 'is-up';
  if (wr < 48) return 'is-down';
  return '';
}

function truncateName(name, max = 14) {
  const s = String(name || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function RolePerformanceCard({
  rows, career, careerGames, loading, error, recentGames,
}) {
  const scope = (
    <SideScopeNote
      career={career}
      careerGames={careerGames}
      loading={loading}
      error={error}
      recentGames={recentGames}
    />
  );
  if (!rows?.length) {
    return (
      <article className="wd-side-card">
        <header>
          <h3>Role Performance</h3>
          {scope}
        </header>
        <p className="muted" style={{ padding: '4px 0 0' }}>
          {loading ? 'Loading career roles…' : 'No role data yet.'}
        </p>
      </article>
    );
  }
  return (
    <article className="wd-side-card">
      <header>
        <h3>Role Performance</h3>
        {scope}
      </header>
      <div className="wd-role-table-head">
        <span>Role</span>
        <span>Games</span>
        <span>WR</span>
      </div>
      {rows.map((row) => (
        <div key={row.roleKey} className="wd-role-table-row">
          <div>
            {roleIconUrl(row.roleKey) ? (
              <img src={roleIconUrl(row.roleKey)} alt="" className="wd-role-icon" />
            ) : null}
            <span>{row.role}</span>
          </div>
          <span>{row.games}</span>
          <span className={wrClass(row.wr, row.games)}>{row.wr}%</span>
        </div>
      ))}
    </article>
  );
}

function PlayedWithCard({
  rows, version, career, careerGames, loading, error, recentGames,
}) {
  const scope = (
    <SideScopeNote
      career={career}
      careerGames={careerGames}
      loading={loading}
      error={error}
      recentGames={recentGames}
    />
  );
  if (!rows?.length) {
    return (
      <article className="wd-side-card">
        <header>
          <h3>Played With</h3>
          {scope}
        </header>
        <p className="muted" style={{ padding: '4px 0 0' }}>
          {loading ? 'Loading teammates…' : 'No frequent teammates yet.'}
        </p>
      </article>
    );
  }
  return (
    <article className="wd-side-card">
      <header>
        <h3>Played With</h3>
        {scope}
      </header>
      <div className="wd-played-list">
        {rows.map((row) => (
          <div key={row.puuid} className="wd-played-row">
            <ChampImg name={row.champion} size={28} version={version} />
            <div className="wd-played-meta">
              <strong title={row.riotId || row.gameName}>{truncateName(row.gameName)}</strong>
              <span>{row.games} Games</span>
            </div>
            <div className="wd-played-stats">
              <strong className={wrClass(row.wr)}>{row.wr}% WR</strong>
              <span>{row.wins}W - {row.losses}L</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

const TOTAL_PING_KEYS = [
  { key: 'onMyWay', label: 'OMW' },
  { key: 'assist', label: 'Assist' },
  { key: 'missing', label: 'Missing' },
  { key: 'needVision', label: 'Need Vision' },
  { key: 'enemyVision', label: 'Enemy Vision' },
  { key: 'allIn', label: 'All-In' },
];

function SideScopeNote({ career, careerGames, loading, error, recentGames }) {
  if (career && careerGames) {
    return <span className="wd-side-scope">Career · all queues · {careerGames} games</span>;
  }
  // Until the career scan lands we are showing the dashboard's last-N sample.
  const fallback = recentGames ? `Last ${recentGames} games` : 'Recent games';
  if (loading) return <span className="wd-side-scope is-loading">{fallback} · widening…</span>;
  if (error) return <span className="wd-side-scope is-error">{fallback} · career unavailable</span>;
  return <span className="wd-side-scope">{fallback}</span>;
}

function TotalPingsCard({
  totalPings, career, careerGames, loading, error, recentGames,
}) {
  const totals = totalPings?.totals || {};
  const averages = totalPings?.averages || {};
  return (
    <article className="wd-side-card">
      <header>
        <h3>Total Pings</h3>
        <SideScopeNote
          career={career}
          careerGames={careerGames}
          loading={loading}
          error={error}
          recentGames={recentGames}
        />
      </header>
      <div className="wd-pings-grid">
        {TOTAL_PING_KEYS.map((row) => (
          <div key={row.key} className="wd-ping-cell" title={row.label}>
            <img src={pingIconUrl(row.key)} alt={row.label} />
            <strong>{totals[row.key] ?? 0}</strong>
            <span>({averages[row.key] ?? 0})</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function RankCard({ title, ranked, ladderRank, sparkData }) {
  const color = rankColor(ranked?.rank);
  const emblem = rankImg(ranked?.rank);
  const wr = ranked?.winrate != null
    ? ranked.winrate
    : (ranked?.wins != null
      ? Math.round((ranked.wins / Math.max(1, ranked.wins + ranked.losses)) * 100)
      : null);
  const lpDelta = ranked?.lpDelta30d;
  const lpDeltaLabel = lpDelta == null
    ? null
    : `${lpDelta > 0 ? '+' : ''}${lpDelta} LP`;
  return (
    <article className="wd-rank-card">
      <div className="wd-rank-card-top">
        <span className="wd-rank-card-title">{title}</span>
        {ladderRank ? <span className="wd-rank-ladder">#{ladderRank}</span> : null}
      </div>
      <div className="wd-rank-card-main">
        {emblem ? (
          <img
            src={emblem}
            alt={ranked?.rank || ''}
            className="wd-rank-emblem"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) fallback.hidden = false;
            }}
          />
        ) : null}
        <span className="wd-rank-emblem is-empty" hidden={Boolean(emblem)} />
        <div>
          <strong style={{ color }}>{ranked?.rank || 'Unranked'}</strong>
          <span>{ranked?.lp != null ? `${ranked.lp} LP` : '—'}</span>
          {ranked?.estMmr != null ? (
            <em className="wd-rank-mmr" title="Estimated matchmaking rating">
              ~{formatMmr(ranked.estMmr)} MMR
            </em>
          ) : null}
        </div>
      </div>
      {ranked?.wins != null ? (
        <div className="wd-rank-stats">
          <div className="wd-rank-stat">
            <span>Record</span>
            <strong>{ranked.wins}W – {ranked.losses}L</strong>
          </div>
          <div className="wd-rank-stat">
            <span>Winrate</span>
            <strong className={wr >= 50 ? 'is-up' : wr != null ? 'is-down' : ''}>
              {wr != null ? `${wr}%` : '—'}
            </strong>
          </div>
          <div className="wd-rank-stat">
            <span>LP 30d</span>
            <strong className={lpDelta > 0 ? 'is-up' : lpDelta < 0 ? 'is-down' : ''}>
              {lpDeltaLabel || '—'}
            </strong>
          </div>
        </div>
      ) : (
        <div className="wd-rank-record muted">No ranked games yet</div>
      )}
      {sparkData?.length > 1 ? (
        <div className="wd-rank-spark">
          <span>Rift Score trend</span>
          <Sparkline data={sparkData} color={color} />
        </div>
      ) : null}
    </article>
  );
}

function MatchRow({ game, version, runeIndex, expanded, onToggle, puuid, onHydrated }) {
  const items = (game.items || []).slice(0, 7);
  while (items.length < 7) items.push(0);
  return (
    <div className={`wd-match ${game.win ? 'is-win' : 'is-loss'}${expanded ? ' is-open' : ''}`}>
      <button type="button" className="wd-match-row" onClick={onToggle}>
        <div className="wd-match-meta">
          <span className={`wd-match-result ${game.win ? 'win' : 'loss'}`}>
            {game.win ? 'Victory' : 'Defeat'}
          </span>
          {formatLpDelta(game.lpDelta, game.lpDeltaEst) ? (
            <span
              className={`wd-match-lp ${game.lpDelta > 0 ? 'is-up' : 'is-down'}`}
              title={game.lpDeltaEst ? 'Typical LP for this rank — Riot does not publish the exact swing' : 'LP this game'}
            >
              {formatLpDelta(game.lpDelta, game.lpDeltaEst)}
            </span>
          ) : null}
          <span>{game.queueLabel || 'Solo/Duo'}</span>
          <span>{game.ago}</span>
          <span>
            {game.durationMin}:{String(game.durationSec || 0).padStart(2, '0')}
          </span>
        </div>

        <div className="wd-match-champ">
          <ChampImg name={game.champion} size={48} version={version} />
          <div className="wd-match-spells">
            {(game.spells || []).slice(0, 2).map((id, i) => (
              <img key={`${id}-${i}`} src={summonerIconUrl(id, version)} alt="" />
            ))}
          </div>
          <div className="wd-match-runes">
            {game.runes?.keystone ? (
              <img src={runeIconUrl(game.runes.keystone, runeIndex)} alt="" />
            ) : null}
            {game.runes?.sub ? (
              <img src={runeIconUrl(game.runes.sub, runeIndex)} alt="" />
            ) : null}
          </div>
        </div>

        <div className="wd-match-kda">
          <strong>{game.kills} / {game.deaths} / {game.assists}</strong>
          <span>{game.kda} KDA</span>
          <span>{game.kpPct != null ? `${game.kpPct}% KP` : '—'}</span>
        </div>

        <div className="wd-match-items">
          {items.map((id, i) => (
            id ? (
              <img key={`${id}-${i}`} src={itemIconUrl(id, version)} alt="" />
            ) : (
              <span key={`empty-${i}`} className="wd-item-empty" />
            )
          ))}
        </div>

        <div className="wd-match-vs">
          <span>vs</span>
          <ChampImg name={game.opponent} size={32} version={version} />
        </div>

        <div className="wd-match-score">
          <ScoreRing score={game.gdScore} win={game.win} />
          {game.badge ? <span className="wd-match-place">{game.badge}</span> : null}
        </div>
      </button>

      {expanded ? (
        <MatchExpand
          game={game}
          version={version}
          runeIndex={runeIndex}
          puuid={puuid}
          onHydrated={onHydrated}
        />
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [version, setVersion] = useState('16.16.1');
  const [runeIndex, setRuneIndex] = useState({});

  const qName = searchParams.get('name') || '';
  const qTag = searchParams.get('tag') || '';
  const qPlatform = (searchParams.get('platform') || '').toLowerCase();
  const ownId = session ? `${session.gameName}#${session.tagLine}` : '';
  const activeId = (qName && qTag ? `${qName}#${qTag}` : ownId).trim();
  const viewingOther = Boolean(qName && qTag && (!ownId || activeId.toLowerCase() !== ownId.toLowerCase()));
  const lookup = {
    platform: qPlatform || session?.platform || 'euw1',
    region: session?.region || '',
  };

  const [profile, setProfile] = useState(() => {
    const parsed = parseRiotIdInput(activeId);
    if (!parsed.gameName || !parsed.tagLine) return null;
    const hit = peekDashboard({
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
      platform: lookup.platform,
      mode: 'Solo',
    });
    return hit ? attachLocalLp(hit, 'Solo') : null;
  });
  const [loading, setLoading] = useState(() => {
    if (!activeId) return false;
    const parsed = parseRiotIdInput(activeId);
    if (!parsed.gameName || !parsed.tagLine) return false;
    return !peekDashboard({
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
      platform: lookup.platform,
      mode: 'Solo',
    });
  });
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState('Solo');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [tab, setTab] = useState('overview');
  const [expandedId, setExpandedId] = useState(null);
  const [liveGame, setLiveGame] = useState(null);
  const [proIdentity, setProIdentity] = useState(null);
  const [query, setQuery] = useState(activeId);
  const [careerLoading, setCareerLoading] = useState(false);
  const [careerError, setCareerError] = useState(false);
  const loadSeq = useRef(0);
  const lpTried = useRef('');

  useEffect(() => {
    ddragonVersion().then(setVersion);
    getRuneIndex().then(setRuneIndex);
  }, []);

  useEffect(() => { setQuery(activeId); }, [activeId]);

  const load = async (riotId, selectedMode = mode) => {
    if (!riotId) {
      setProfile(null);
      setLoadError('');
      setLoading(false);
      return;
    }
    const reqId = ++loadSeq.current;
    setLoadError('');
    setExpandedId(null);
    const parsed = parseRiotIdInput(riotId);
    if (!parsed.gameName || !parsed.tagLine) {
      if (reqId !== loadSeq.current) return;
      setProfile(null);
      setLoadError('Enter Name#TAG to load a dashboard.');
      setLoading(false);
      return;
    }
    const dashArgs = {
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
      platform: lookup.platform,
      region: lookup.region,
      mode: selectedMode,
    };
    const cached = peekDashboard(dashArgs);
    if (cached && reqId === loadSeq.current) {
      setProfile(attachLocalLp(cached, selectedMode));
      if (cached.ddragonVersion) setVersion(cached.ddragonVersion);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const hasWarmFull = cached && !cached.light && (cached.recentGames?.length || 0) >= 8;
      if (!hasWarmFull) {
        const lightData = await refreshDashboard({ ...dashArgs, count: 8, light: true });
        if (reqId !== loadSeq.current) return;
        if (lightData) {
          setProfile(attachLocalLp(lightData, selectedMode));
          if (lightData.ddragonVersion) setVersion(lightData.ddragonVersion);
          setLoading(false);
        }
      }
      const fetchFull = () => refreshDashboard({ ...dashArgs, count: 20, light: false });
      let data = await fetchFull();
      const rankedPlayed = (Number(data?.solo?.wins) || 0) + (Number(data?.solo?.losses) || 0)
        + (Number(data?.flex?.wins) || 0) + (Number(data?.flex?.losses) || 0);
      // Ranks can land while match-v5 is rate-limited — retry instead of showing 0 games.
      if (!(data?.recentGames || []).length && rankedPlayed > 0) {
        await new Promise((r) => setTimeout(r, 2500));
        if (reqId !== loadSeq.current) return;
        data = await fetchFull();
      }
      if (reqId !== loadSeq.current) return;
      setProfile(attachLocalLp(data, selectedMode));
      if (data.ddragonVersion) setVersion(data.ddragonVersion);
    } catch (err) {
      if (reqId !== loadSeq.current) return;
      if (!peekDashboard(dashArgs)) {
        setProfile(null);
        setLoadError(err.message || 'Could not load dashboard.');
      }
    } finally {
      if (reqId === loadSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    load(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, lookup.platform, session?.region]);

  // Career Role / Played With / Pings — delayed so match history can finish first.
  useEffect(() => {
    if (!profile?.puuid || profile.careerSidebar || !(profile.recentGames || []).length) {
      setCareerLoading(false);
      setCareerError(false);
      return undefined;
    }
    const parsed = parseRiotIdInput(activeId);
    if (!parsed.gameName || !parsed.tagLine) return undefined;
    let cancelled = false;
    setCareerLoading(true);
    setCareerError(false);

    const run = async () => {
      // Let dashboard match/timeline requests settle before career burn.
      await new Promise((r) => setTimeout(r, 2500));
      if (cancelled) return;
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const career = await getCareerSidebar({
            gameName: parsed.gameName,
            tagLine: parsed.tagLine,
            platform: lookup.platform,
            region: lookup.region,
          });
          if (cancelled) return;
          if (!career?.careerSidebar) {
            lastErr = new Error('empty career');
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          setProfile((prev) => {
            if (!prev || prev.puuid !== career.puuid) return prev;
            return {
              ...prev,
              rolePerformance: career.rolePerformance,
              playedWith: career.playedWith,
              totalPings: career.totalPings,
              careerSidebar: true,
              careerGames: career.careerGames,
            };
          });
          setCareerError(false);
          return;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
        }
      }
      if (!cancelled && lastErr) setCareerError(true);
    };

    run().finally(() => { if (!cancelled) setCareerLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.puuid, profile?.careerSidebar, profile?.recentGames?.length, activeId]);

  useEffect(() => {
    if (!profile?.riotId) return undefined;
    let cancelled = false;
    const [gameName, tagLine] = profile.riotId.split('#');
    const tick = () => {
      getLiveGame({
        gameName,
        tagLine,
        platform: profile.platform || lookup.platform,
        region: lookup.region,
      }).then((g) => {
        if (!cancelled) setLiveGame(g || null);
      }).catch(() => {
        if (!cancelled) setLiveGame(null);
      });
    };
    tick();
    // Don't poll spectator every 20s until match history has landed — it steals Riot quota.
    if (!(profile.recentGames || []).length) {
      return () => { cancelled = true; };
    }
    const id = setInterval(tick, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [profile?.riotId, profile?.platform, profile?.recentGames?.length, lookup.platform, lookup.region]);

  // Per-game LP is not on Riot match-v5 — fill from the local U.GG helper.
  useEffect(() => {
    const games = profile?.recentGames || [];
    if (!profile?.riotId || !games.length) return undefined;
    const queue = rankedQueue(mode);
    if (!queue) return undefined;
    const key = `${profile.riotId}|${mode}|${games.length}`;
    if (lpTried.current === key) return undefined;
    if (games.filter((g) => g.lpDelta != null).length >= Math.min(3, games.length)) {
      lpTried.current = key;
      return undefined;
    }
    const parsed = parseRiotIdInput(profile.riotId);
    if (!parsed.gameName || !parsed.tagLine) return undefined;
    let cancelled = false;
    lpTried.current = key;
    getMatchLp({
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
      platform: profile.platform || lookup.platform,
      queue,
    }).then((res) => {
      if (cancelled || !res?.lp) return;
      setProfile((prev) => {
        if (!prev?.recentGames) return prev;
        return {
          ...prev,
          recentGames: applyTrackedLp(prev.recentGames, res.lp, prev.riotId, mode),
        };
      });
    }).catch(() => { /* LP is optional */ });
    return () => { cancelled = true; };
  }, [profile?.riotId, profile?.recentGames?.length, profile?.platform, mode, lookup.platform]);

  // Pro identity badge — silent no-op for the vast majority of accounts.
  useEffect(() => {
    setProIdentity(null);
    if (!profile?.riotId) return undefined;
    let cancelled = false;
    lookupPro(profile.riotId)
      .then((res) => {
        if (!cancelled && res?.ok && res.identity) setProIdentity(res.identity);
      })
      .catch(() => { /* not a pro, or directory offline */ });
    return () => { cancelled = true; };
  }, [profile?.riotId]);

  const onSearch = (e) => {
    e.preventDefault();
    const parsed = parseRiotIdInput(query);
    if (!parsed.gameName || !parsed.tagLine) return;
    prefetchDashboard({
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
      platform: lookup.platform,
      region: lookup.region,
      mode: 'Solo',
      count: 8,
      light: true,
    });
    setSearchParams({ name: parsed.gameName, tag: parsed.tagLine });
  };

  const selectMode = (m) => {
    setMode(m);
    load(activeId, m);
  };

  const games = useMemo(() => {
    const list = profile?.recentGames || [];
    if (roleFilter === 'ALL') return list;
    return list.filter((g) => g.roleKey === roleFilter);
  }, [profile?.recentGames, roleFilter]);

  const dayGroups = useMemo(() => groupByDay(games), [games]);
  const overview = profile?.overview || {};
  const pool = profile?.championPool || [];
  const topChamps = pool.slice(0, 3);
  const inLive = !!(liveGame && (liveGame.blue?.length || liveGame.red?.length));
  const sideExtras = useMemo(() => deriveDashboardExtras(profile), [profile]);
  const allGames = profile?.recentGames || [];
  const mainRole = sideExtras.rolePerformance?.[0]?.roleKey || null;

  return (
    <div className={`wd-page${loading && profile ? ' is-reloading' : ''}`}>
      <header className="wd-head">
        <form className="wd-search" onSubmit={onSearch}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Summoner Name#TAG"
            aria-label="Search summoner"
          />
          <button type="submit" className="btn btn-violet btn-sm">Search</button>
        </form>
        {viewingOther && ownId ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearchParams({})}>
            Back to my dashboard
          </button>
        ) : null}
        <Link className="btn btn-ghost btn-sm" to="/profile">Profile</Link>
      </header>

      {!activeId ? (
        <div className="wd-empty">
          <h1>Dashboard</h1>
          <p className="muted">Link a Riot ID to open your overview and match history.</p>
          <button type="button" className="btn btn-violet" onClick={() => navigate('/profile')}>Link profile</button>
        </div>
      ) : loadError ? (
        <div className="wd-empty">
          <p>{loadError}</p>
          <button type="button" className="btn btn-violet" onClick={() => load(activeId)}>Retry</button>
        </div>
      ) : !profile ? (
        <div className="wd-empty">
          <div className="wd-spinner" />
          <p className="muted">Loading summoner data…</p>
        </div>
      ) : (
        <>
          <section className="wd-profile">
            <div className="wd-profile-main">
              <div className="wd-avatar-wrap">
                <img
                  src={profileIconUrl(profile.profileIconId, version)}
                  alt=""
                  className="wd-avatar"
                  onError={(e) => { e.currentTarget.src = profileIconUrl(29, version); }}
                />
                {profile.summonerLevel != null ? (
                  <span className="wd-level">{profile.summonerLevel}</span>
                ) : null}
              </div>
              <div>
                <h1>
                  {profile.gameName}
                  <span>#{profile.tagLine}</span>
                </h1>
                <div className="wd-profile-meta">
                  <span>{profile.region || platformShort(profile.platform)}</span>
                  {inLive ? <span className="wd-live-pill">Live now</span> : null}
                  <ProChip identity={proIdentity} />
                  <span className="muted">Last {overview.games || 0} games · {mode}</span>
                </div>
              </div>
            </div>
            <div className="wd-tabs">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'champions', label: 'Champions' },
                { id: 'live', label: 'Live' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={tab === t.id ? 'is-on' : ''}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {tab === 'live' ? (
            <section className="wd-live-panel card">
              {inLive ? (
                <>
                  <h2>In game · {liveGame.queueName || 'Custom'}</h2>
                  <div className="wd-live-teams">
                    <div>
                      {(liveGame.blue || []).map((p) => (
                        <div key={p.puuid || p.riotId} className={p.isSelf ? 'is-self' : ''}>
                          <ChampImg name={p.champion} size={32} version={version} />
                          <span>{p.riotId || p.champion}</span>
                        </div>
                      ))}
                    </div>
                    <strong>VS</strong>
                    <div>
                      {(liveGame.red || []).map((p) => (
                        <div key={p.puuid || p.riotId} className={p.isSelf ? 'is-self' : ''}>
                          <ChampImg name={p.champion} size={32} version={version} />
                          <span>{p.riotId || p.champion}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Not in a live game right now.</p>
              )}
            </section>
          ) : null}

          {tab === 'champions' ? (
            <ChampionPoolPanel
              pool={pool}
              gamesCount={overview.games}
              mode={mode}
              version={version}
              onMode={selectMode}
            />
          ) : null}

          {tab === 'overview' ? (
            <div className="wd-layout">
              <aside className="wd-side">
                <RankCard
                  title="Ranked Solo"
                  ranked={profile.solo || {
                    rank: profile.rank,
                    lp: profile.lp,
                    wins: profile.wins,
                    losses: profile.losses,
                  }}
                  ladderRank={profile.ladderRank}
                  sparkData={profile.sparklines?.gdScore || []}
                />
                <RankCard title="Ranked Flex" ranked={profile.flex} />

                <article className="wd-side-card">
                  <header>
                    <h3>Champion performance</h3>
                    <div className="wd-mode-mini">
                      {MODE_KEYS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={mode === m ? 'is-on' : ''}
                          onClick={() => selectMode(m)}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </header>
                  <div className="wd-champ-mini-head">
                    <span>Champ</span>
                    <span>KDA</span>
                    <span>CS</span>
                    <span>WR</span>
                  </div>
                  {pool.slice(0, 6).map((row) => (
                    <div key={row.champion} className="wd-champ-mini-row">
                      <div>
                        <ChampImg name={row.champion} size={24} version={version} />
                        <span>
                          <strong>{row.champion}</strong>
                          <em>{row.games}g</em>
                        </span>
                      </div>
                      <span>{row.kda}</span>
                      <span>{row.cs}</span>
                      <span className={wrTone(row.wr)}>{row.wr}%</span>
                    </div>
                  ))}
                  {!pool.length ? <p className="muted" style={{ padding: '8px 0 0' }}>No games in this queue.</p> : null}
                  <button type="button" className="wd-all-btn" onClick={() => setTab('champions')}>All</button>
                </article>

                <RolePerformanceCard
                  rows={sideExtras.rolePerformance}
                  career={profile.careerSidebar}
                  careerGames={profile.careerGames}
                  loading={careerLoading}
                  error={careerError}
                  recentGames={overview.games}
                />
                <PhaseCard games={allGames} />
                <LensCard lens={profile.lens} />
                <PlayedWithCard
                  rows={sideExtras.playedWith}
                  version={version}
                  career={profile.careerSidebar}
                  careerGames={profile.careerGames}
                  loading={careerLoading}
                  error={careerError}
                  recentGames={overview.games}
                />
                <TotalPingsCard
                  totalPings={sideExtras.totalPings}
                  career={profile.careerSidebar}
                  careerGames={profile.careerGames}
                  loading={careerLoading}
                  error={careerError}
                  recentGames={overview.games}
                />
                <CollectionsCard collections={profile.collections} />
              </aside>

              <section className="wd-main">
                <article className="wd-summary">
                  <WinDonut
                    winrate={overview.winrate || 0}
                    wins={overview.wins || 0}
                    losses={overview.losses || 0}
                  />
                  <div className="wd-summary-champs">
                    {topChamps.map((row) => (
                      <div key={row.champion}>
                        <ChampImg name={row.champion} size={40} version={version} />
                        <strong className={row.wr >= 50 ? 'is-up' : 'is-down'}>{row.wr}%</strong>
                        <span>{row.kda} KDA</span>
                      </div>
                    ))}
                    {!topChamps.length ? <span className="muted">Play some games to fill this.</span> : null}
                  </div>
                  <div className="wd-summary-stats">
                    <div>
                      <span>KDA</span>
                      <strong>{overview.avgKda || '—'}</strong>
                      <small>
                        {overview.avgKills ?? '—'} / {overview.avgDeaths ?? '—'} / {overview.avgAssists ?? '—'}
                      </small>
                    </div>
                    <div>
                      <span>Rift Score</span>
                      <strong>{overview.avgGdScore || '—'}</strong>
                      <small>avg last {overview.games || 0}</small>
                    </div>
                    <div>
                      <span>KP</span>
                      <strong>{overview.avgKp != null ? `${overview.avgKp}%` : '—'}</strong>
                      <small>kill participation</small>
                    </div>
                  </div>
                </article>

                <StatGrid
                  stats={profile.stats}
                  sparklines={profile.sparklines}
                  games={overview.games}
                />

                <div className="wd-filters">
                  <div className="wd-role-filters">
                    {ROLE_FILTERS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        className={roleFilter === r.key ? 'is-on' : ''}
                        onClick={() => setRoleFilter(r.key)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <div className="wd-mode-filters">
                    {MODE_KEYS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={mode === m ? 'is-on' : ''}
                        onClick={() => selectMode(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wd-history">
                  {dayGroups.map((group) => {
                    const wins = group.games.filter((g) => g.win).length;
                    const losses = group.games.length - wins;
                    const avgScore = group.games.length
                      ? (group.games.reduce((s, g) => s + (g.gdScore || 0), 0) / group.games.length).toFixed(1)
                      : '—';
                    return (
                      <div key={group.key} className="wd-day">
                        <div className="wd-day-head">
                          <strong>{group.key}</strong>
                          <span>Rift Score: {avgScore}</span>
                          <span>{wins} wins</span>
                          <span>{losses} losses</span>
                        </div>
                        {group.games.map((g) => (
                          <MatchRow
                            key={g.matchId}
                            game={g}
                            version={version}
                            runeIndex={runeIndex}
                            expanded={expandedId === g.matchId}
                            onToggle={() => setExpandedId((id) => (id === g.matchId ? null : g.matchId))}
                            puuid={profile.puuid}
                            onHydrated={(next) => {
                              setProfile((prev) => {
                                if (!prev?.recentGames) return prev;
                                return {
                                  ...prev,
                                  recentGames: prev.recentGames.map((row) => (
                                    row.matchId === next.matchId
                                      ? { ...row, ...next, lpDelta: next.lpDelta ?? row.lpDelta }
                                      : row
                                  )),
                                };
                              });
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                  {!games.length ? (
                    <div className="wd-empty-inline muted">
                      {(Number(profile.solo?.wins) || 0) + (Number(profile.flex?.wins) || 0) > 0 ? (
                        <>
                          Couldn’t load match history (Riot is busy).
                          {' '}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => load(activeId)}>
                            Retry
                          </button>
                        </>
                      ) : (
                        'No games for this queue / role filter.'
                      )}
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
