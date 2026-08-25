import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getDashboard, getLiveGame } from '../api';
import { useSession } from '../session';
import {
  champIconUrl,
  ddragonVersion,
  getRuneIndex,
  itemIconUrl,
  parseRiotIdInput,
  platformShort,
  profileIconUrl,
  rankColor,
  rankImg,
  runeIconUrl,
  summonerIconUrl,
} from '../lib';
import MatchExpand from './MatchExpand';
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
      onError={(e) => { e.currentTarget.src = champIconUrl('Aatrox', version); }}
    />
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
  const ownId = session ? `${session.gameName}#${session.tagLine}` : '';
  const activeId = (qName && qTag ? `${qName}#${qTag}` : ownId).trim();
  const viewingOther = Boolean(qName && qTag && (!ownId || activeId.toLowerCase() !== ownId.toLowerCase()));

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(activeId));
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState('Solo');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [tab, setTab] = useState('overview');
  const [expandedId, setExpandedId] = useState(null);
  const [liveGame, setLiveGame] = useState(null);
  const [query, setQuery] = useState(activeId);
  const loadSeq = useRef(0);

  useEffect(() => {
    ddragonVersion().then(setVersion);
    getRuneIndex().then(setRuneIndex);
  }, []);

  useEffect(() => { setQuery(activeId); }, [activeId]);

  const lookup = {
    platform: session?.platform || 'euw1',
    region: session?.region || '',
  };

  const load = async (riotId, selectedMode = mode) => {
    if (!riotId) {
      setProfile(null);
      setLoadError('');
      setLoading(false);
      return;
    }
    const reqId = ++loadSeq.current;
    setLoading(true);
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
    try {
      const data = await getDashboard({
        gameName: parsed.gameName,
        tagLine: parsed.tagLine,
        platform: lookup.platform,
        region: lookup.region,
        mode: selectedMode,
        count: 20,
      });
      if (reqId !== loadSeq.current) return;
      setProfile(data);
      if (data.ddragonVersion) setVersion(data.ddragonVersion);
    } catch (err) {
      if (reqId !== loadSeq.current) return;
      setProfile(null);
      setLoadError(err.message || 'Could not load dashboard.');
    } finally {
      if (reqId === loadSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    load(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, session?.platform, session?.region]);

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
    const id = setInterval(tick, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [profile?.riotId, profile?.platform, lookup.platform, lookup.region]);

  const onSearch = (e) => {
    e.preventDefault();
    const parsed = parseRiotIdInput(query);
    if (!parsed.gameName || !parsed.tagLine) return;
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

  return (
    <div className="wd-page">
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
          <p className="muted">Link a Riot ID to open your DPM-style overview and match history.</p>
          <button type="button" className="btn btn-violet" onClick={() => navigate('/profile')}>Link profile</button>
        </div>
      ) : loadError ? (
        <div className="wd-empty">
          <p>{loadError}</p>
          <button type="button" className="btn btn-violet" onClick={() => load(activeId)}>Retry</button>
        </div>
      ) : loading || !profile ? (
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
            <section className="wd-champ-table card">
              <header>
                <h2>Champion performance</h2>
                <span className="muted">From last {overview.games || 0} {mode} games</span>
              </header>
              <div className="wd-champ-table-head">
                <span>Champion</span>
                <span>KDA</span>
                <span>CS/M</span>
                <span>Games</span>
                <span>WR</span>
              </div>
              {pool.map((row) => (
                <div key={row.champion} className="wd-champ-table-row">
                  <div className="wd-champ-name">
                    <ChampImg name={row.champion} size={28} version={version} />
                    <span>{row.champion}</span>
                  </div>
                  <span>{row.kda}</span>
                  <span>{row.cs}</span>
                  <span>{row.games}</span>
                  <span className={row.wr >= 50 ? 'is-up' : 'is-down'}>{row.wr}%</span>
                </div>
              ))}
              {!pool.length ? <p className="muted">No champion data for this queue.</p> : null}
            </section>
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
                        <span>{row.games}</span>
                      </div>
                      <span>{row.kda}</span>
                      <span>{row.cs}</span>
                      <span className={row.wr >= 50 ? 'is-up' : 'is-down'}>{row.wr}%</span>
                    </div>
                  ))}
                  {!pool.length ? <p className="muted" style={{ padding: '8px 0 0' }}>No games in this queue.</p> : null}
                  <button type="button" className="wd-all-btn" onClick={() => setTab('champions')}>All</button>
                </article>
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
                                    row.matchId === next.matchId ? { ...row, ...next } : row
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
                    <div className="wd-empty-inline muted">No games for this queue / role filter.</div>
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
