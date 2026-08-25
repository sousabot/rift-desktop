import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getDashboard, getLiveGame } from '../api';
import { useSession } from '../session';
import {
  champIconUrl,
  champLoadingUrl,
  champSplashUrl,
  ddragonVersion,
  formatMmr,
  mmrToRank,
  parseRiotIdInput,
  platformShort,
  profileIconUrl,
  rankColor,
  rankEmblemClass,
  rankImg,
} from '../lib';
import './Dashboard.css';

const MODE_LABEL = { All: 'All Queues', Solo: 'Solo/Duo', Flex: 'Flex', Aram: 'ARAM', Normal: 'Normal' };
const MODE_KEYS = ['All', 'Solo', 'Flex', 'Aram', 'Normal'];
const GD_SCORE_HINT = 'Rift Score (0–100): role-weighted from KDA, kill participation, damage share, CS/min, vision, and result.';

const fmtElapsed = (seconds = 0) => {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, Math.floor(seconds % 60));
  return `${m}:${String(s).padStart(2, '0')}`;
};

function padTeamBans(bans = [], teamId) {
  const rows = bans.filter((b) => Number(b.teamId) === Number(teamId)).slice(0, 5);
  while (rows.length < 5) rows.push({ champion: null });
  return rows;
}

function Sparkline({ data = [], up = true }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => [
      (i / Math.max(1, data.length - 1)) * w,
      h - ((v - min) / range) * (h - 6) - 3,
    ]);
    ctx.clearRect(0, 0, w, h);
    const c = up ? '#3ecf8e' : '#ff5c68';
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, `${c}55`);
    grad.addColorStop(1, c);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }, [data, up]);
  return <canvas ref={ref} width={88} height={28} className="db-sparkline" />;
}

function StatCard({ label, value, delta, deltaDir, sparkData, hint }) {
  const isDown = deltaDir === 'down';
  return (
    <div className="db-stat-card" title={hint || undefined}>
      <div className="db-stat-top">
        <span className="db-stat-label">{label}</span>
        <Sparkline data={sparkData} up={!isDown} />
      </div>
      <div className="db-stat-bottom">
        <span className="db-stat-value">{value}</span>
        <span className={`db-stat-delta-pill db-stat-delta-pill--${deltaDir || 'flat'}`}>
          <span className="db-stat-delta-dot" />
          {delta || '+0.0'} <span className="db-stat-delta-sub">vs 1w</span>
        </span>
      </div>
    </div>
  );
}

function ChampionIcon({ name, size = 36, team, rounded = false }) {
  const [version, setVersion] = useState('16.16.1');
  const [src, setSrc] = useState(() => champIconUrl(name));
  const [failed, setFailed] = useState(false);
  useEffect(() => { ddragonVersion().then(setVersion); }, []);
  useEffect(() => {
    setSrc(champIconUrl(name, version));
    setFailed(false);
  }, [name, version]);
  const teamClass = team === 'blue' ? ' db-champ-icon--blue' : team === 'red' ? ' db-champ-icon--red' : '';
  if (failed || !name) {
    return (
      <span
        className={`db-champ-icon is-empty${rounded ? ' db-champ-icon--rounded' : ''}${teamClass}`}
        style={{ width: size, height: size, display: 'inline-block' }}
        title={name || ''}
      />
    );
  }
  return (
    <img
      src={src}
      alt={name}
      title={name}
      onError={() => {
        const fallback = champIconUrl('Aatrox', version);
        if (src === fallback) {
          setFailed(true);
          return;
        }
        setSrc(fallback);
      }}
      className={`db-champ-icon${rounded ? ' db-champ-icon--rounded' : ''}${teamClass}`}
      style={{ width: size, height: size }}
    />
  );
}

function ScoreRing({ label, value, max = 100, color, size = 40 }) {
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const pct = Math.min((Number(value) || 0) / max, 1);
  const cx = size / 2;
  return (
    <div className="db-score-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3.5" />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth="3.5"
          strokeDasharray={`${pct * circ} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
        />
        <text x={cx} y={cx + 4} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="700">{value}</text>
      </svg>
      <span className="db-score-ring-label">{label}</span>
    </div>
  );
}

function LPRing({ lp, win }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const pct = Math.min((Number(lp) || 0) / 100, 1);
  const c = win ? '#3ecf8e' : '#ff5c68';
  return (
    <div className="db-lp-ring" title={`Rift Score ${lp}`}>
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        <circle
          cx="14" cy="14" r={r} fill="none" stroke={c} strokeWidth="2.5"
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 14 14)"
        />
        <text x="14" y="18" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700">{lp}</text>
      </svg>
    </div>
  );
}

function RecentGameRow({ game, active, onSelect }) {
  const { champion, win, kills, deaths, assists, kda, ago, gdScore, queueLabel, queueType } = game;
  return (
    <button
      type="button"
      className={`db-recent-row db-recent-row--${win ? 'win' : 'loss'}${active ? ' is-active' : ''}`}
      onClick={onSelect}
    >
      <div className="db-recent-left">
        <span className="db-recent-ago">{ago}</span>
        <ChampionIcon name={champion} size={32} rounded />
      </div>
      <div className="db-recent-mid">
        <div className="db-recent-top-row">
          <span className={`db-recent-result ${win ? 'win' : 'loss'}`}>{win ? 'WIN' : 'LOSS'}</span>
          <span className="db-recent-queue">{queueLabel || queueType || 'Solo/Duo'}</span>
        </div>
        <span className="db-recent-kda">{kills}/{deaths}/{assists}</span>
        <span className="db-recent-kdaval">{kda} KDA</span>
      </div>
      <LPRing lp={gdScore} win={win} />
    </button>
  );
}

export default function Dashboard() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [version, setVersion] = useState('16.16.1');

  const qName = searchParams.get('name') || '';
  const qTag = searchParams.get('tag') || '';
  const ownId = session ? `${session.gameName}#${session.tagLine}` : '';
  const activeId = (qName && qTag ? `${qName}#${qTag}` : ownId).trim();
  const viewingOther = Boolean(qName && qTag && (!ownId || activeId.toLowerCase() !== ownId.toLowerCase()));

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(activeId));
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState('Solo');
  const [liveGame, setLiveGame] = useState(null);
  const [liveAt, setLiveAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [matchIdx, setMatchIdx] = useState(0);
  const loadSeq = useRef(0);

  useEffect(() => { ddragonVersion().then(setVersion); }, []);

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
    setMatchIdx(0);
    setLiveGame(null);
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
        if (cancelled) return;
        setLiveGame(g || null);
        if (g) setLiveAt(Date.now());
      }).catch(() => {
        if (!cancelled) setLiveGame(null);
      });
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [profile?.riotId, profile?.platform, lookup.platform, lookup.region]);

  useEffect(() => {
    if (!liveGame) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [liveGame]);

  const selectMode = (m) => {
    setMode(m);
    load(activeId, m);
  };

  const winrate = profile && profile.wins != null
    ? Math.round((profile.wins / Math.max(1, profile.wins + profile.losses)) * 100)
    : null;

  const s = profile?.stats || {};
  const sp = profile?.sparklines || {};
  const games = profile?.recentGames || [];
  const lg = games[matchIdx] || profile?.lastGame || null;
  const rc = profile ? rankColor(profile.rank) : '#a06bff';
  const mmrRank = mmrToRank(profile?.estMmr);
  const mmrColor = mmrRank?.tier ? (RANK_COLORS_SAFE(mmrRank.tier)) : '#9b86ff';
  const collections = profile?.collections || { played: 0, total: 0 };
  const lens = profile?.lens || { score: 0, series: [50], avgDeaths: 0 };
  const inLive = !!(liveGame && (liveGame.blue?.length || liveGame.red?.length));
  const liveYou = inLive
    ? [...(liveGame.blue || []), ...(liveGame.red || [])].find((p) => (
      p.isSelf || String(p.riotId || '').toLowerCase() === String(profile?.riotId || '').toLowerCase()
    ))
    : null;
  const splashChamp = liveYou?.champion || lg?.champion || null;
  const liveAlly = liveYou?.teamId === 200 ? liveGame.red : liveGame?.blue;
  const liveEnemy = liveYou?.teamId === 200 ? liveGame.blue : liveGame?.red;
  const liveBlue = inLive ? (liveAlly || []).map((p) => p.champion) : null;
  const liveRed = inLive ? (liveEnemy || []).map((p) => p.champion) : null;
  const liveAllyTeam = liveYou?.teamId === 200 ? 200 : 100;
  const padList = (list = []) => {
    const rows = list.slice(0, 5);
    while (rows.length < 5) rows.push({ champion: null });
    return rows;
  };
  const allyBans = inLive
    ? padTeamBans(liveGame.bans || [], liveAllyTeam)
    : padList(lg?.allyBans);
  const enemyBans = inLive
    ? padTeamBans(liveGame.bans || [], liveAllyTeam === 200 ? 100 : 200)
    : padList(lg?.enemyBans);
  const showBans = inLive
    ? (liveGame.bans || []).length > 0
    : ((lg?.allyBans || []).length + (lg?.enemyBans || []).length) > 0;
  const liveElapsed = inLive
    ? (liveGame.gameLength || 0) + Math.floor((now - liveAt) / 1000)
    : 0;

  const lensPoints = (() => {
    const series = lens.series?.length ? lens.series : [50];
    const w = 200;
    const h = 70;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const pts = series.map((v, i) => {
      const x = (i / Math.max(1, series.length - 1)) * w;
      const y = h - 10 - ((v - min) / range) * (h - 18);
      return [x, y];
    });
    const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
    const area = `M${pts[0][0]},${pts[0][1]} ${pts.slice(1).map(([x, y]) => `L${x},${y}`).join(' ')} L${w},${h} L0,${h} Z`;
    return { line, area };
  })();

  const stats = [
    { label: 'KDA', value: s.kda, delta: s.kdaDelta, deltaDir: s.kdaDeltaDir, sparkData: sp.kda },
    { label: 'RIFT SCORE', value: s.gdScore, delta: s.gdDelta, deltaDir: s.gdDeltaDir, sparkData: sp.gdScore, hint: GD_SCORE_HINT },
    { label: 'KP', value: s.kp, delta: s.kpDelta, deltaDir: s.kpDeltaDir, sparkData: sp.kp },
    { label: 'CSM', value: s.csm, delta: s.csmDelta, deltaDir: s.csmDeltaDir, sparkData: sp.csm },
    { label: 'VISION SCORE', value: s.visionScore, delta: s.visionDelta, deltaDir: s.visionDeltaDir, sparkData: sp.vision },
    { label: 'GPM', value: s.gpm, delta: s.gpmDelta, deltaDir: s.gpmDeltaDir, sparkData: sp.gpm },
    { label: 'GOLD DIFF @15', value: s.goldDiff15, delta: s.goldDiff15Delta, deltaDir: s.goldDiff15DeltaDir, sparkData: sp.goldDiff15 },
    { label: 'K+A DIFF @15', value: s.kaDiff15, delta: s.kaDiff15Delta, deltaDir: s.kaDiff15DeltaDir, sparkData: sp.kaDiff15 },
  ];

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <h1 className="db-page-title">Dashboard</h1>
          {viewingOther ? (
            <div className="db-viewing-banner">
              Viewing {activeId}
              {ownId ? (
                <button type="button" onClick={() => setSearchParams({})}>Back to my dashboard</button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="db-toolbar">
          <div className="db-mode-filters">
            {MODE_KEYS.map((m) => (
              <button
                key={m}
                type="button"
                className={`db-mode-btn${m === mode ? ' active' : ''}`}
                onClick={() => selectMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="db-toolbar-meta">
            <span className="db-filter-label">Last 20 games</span>
            <span className="db-filter-label">
              {profile?.region || platformShort(profile?.platform || lookup.platform)}
            </span>
            <Link className="db-filter-label highlight" to="/profile">Profile</Link>
          </div>
        </div>
      </div>

      {!activeId ? (
        <div className="db-loading">
          <span>Link a Riot account to load your dashboard.</span>
          <button type="button" className="db-retry" onClick={() => navigate('/profile')}>Link profile</button>
        </div>
      ) : loadError ? (
        <div className="db-loading">
          <span>{loadError}</span>
          <button type="button" className="db-retry" onClick={() => load(activeId)}>Retry</button>
        </div>
      ) : loading || !profile ? (
        <div className="db-loading">
          <div className="db-loading-spinner" />
          <span>Loading summoner data…</span>
        </div>
      ) : (
        <div className="db-content">
          <div className="db-body">
            <div className="db-main-col">
              <div className="db-hero">
                <div
                  className="db-splash-bg"
                  style={splashChamp ? { backgroundImage: `url(${champSplashUrl(splashChamp)})` } : undefined}
                />
                <div className="db-splash-overlay" />
                <div className="db-hero-inner">
                  <div className="db-hero-top">
                    <div className="db-profile-row">
                      <div className="db-avatar-wrap" style={{ '--rc': rc }}>
                        <img
                          src={profileIconUrl(profile.profileIconId, version)}
                          alt=""
                          className="db-avatar"
                          onError={(e) => {
                            const el = e.currentTarget;
                            if (el.dataset.fb) {
                              el.style.visibility = 'hidden';
                              return;
                            }
                            el.dataset.fb = '1';
                            el.src = profileIconUrl(29, version);
                          }}
                        />
                        {profile.summonerLevel != null ? (
                          <span className="db-avatar-level">{profile.summonerLevel}</span>
                        ) : null}
                      </div>
                      <div className="db-profile-info">
                        <h2 className="db-summoner-name">{profile.riotId?.split('#')[0]}</h2>
                        <div className="db-profile-meta">
                          <span className="db-summoner-tag">#{profile.riotId?.split('#')[1]}</span>
                          <span className="db-summoner-tag">{profile.region || platformShort(profile.platform)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="db-rank-card" style={{ '--rc': rc }}>
                      <span className="db-rank-card-eyebrow">{MODE_LABEL[mode]}</span>
                      <div className="db-rank-card-main">
                        {rankImg(profile.rank) ? (
                          <img
                            src={rankImg(profile.rank)}
                            alt={profile.rank}
                            className={rankEmblemClass(profile.rank, 'db-rank-card-emblem')}
                          />
                        ) : null}
                        <div className="db-rank-card-info">
                          <span className="db-rank-card-name" style={{ color: rc }}>{profile.rank || 'Unranked'}</span>
                          {profile.ladderRank ? (
                            <span className="db-rank-card-num" style={{ color: rc }}>#{profile.ladderRank}</span>
                          ) : null}
                          <span className="db-rank-card-lp" style={{ color: rc }}>
                            {profile.lp != null ? `${profile.lp} LP` : '—'}
                          </span>
                        </div>
                      </div>
                      {mmrRank ? (
                        <div className="db-rank-split">
                          <div className="db-rank-split-col">
                            <span className="db-rank-split-label">PEAK</span>
                            <span className="db-rank-split-val" style={{ color: rc }}>—</span>
                          </div>
                          <div className="db-rank-split-col is-mmr">
                            <span className="db-rank-split-label">MMR</span>
                            {rankImg(mmrRank.tier) ? (
                              <img src={rankImg(mmrRank.tier)} alt="" className="db-rank-split-emblem" />
                            ) : null}
                            <span className="db-rank-split-val" style={{ color: mmrColor }}>
                              {mmrRank.short || '—'}
                            </span>
                            <span
                              className="db-rank-split-q"
                              title={`Estimated MMR${formatMmr(profile.estMmr) ? ` (${formatMmr(profile.estMmr)})` : ''}`}
                            >
                              ?
                            </span>
                          </div>
                        </div>
                      ) : null}
                      <div className="db-rank-card-record">
                        {profile.wins != null
                          ? `${profile.wins}W – ${profile.losses}L${winrate != null ? ` · ${winrate}%` : ''}`
                          : 'Rank unavailable'}
                      </div>
                    </div>
                  </div>

                  <div className="db-stat-grid">
                    {stats.map((stat) => (
                      <StatCard key={stat.label} {...stat} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="db-cards">
                <article className="db-dpm-card db-card-match">
                  <button type="button" className="db-card-side-arrow is-left" aria-label="Previous" onClick={() => setMatchIdx((i) => (i - 1 + games.length) % Math.max(1, games.length))}>‹</button>
                  <button type="button" className="db-card-side-arrow is-right" aria-label="Next" onClick={() => setMatchIdx((i) => (i + 1) % Math.max(1, games.length))}>›</button>

                  <div className="db-card-match-top">
                    <span className="db-region-badge">{lg?.region || platformShort(profile.platform)}</span>
                    <span className={`db-match-timer${inLive ? ' is-live' : ''}`}>
                      <span className="db-match-timer-dot" />
                      {inLive
                        ? fmtElapsed(liveElapsed)
                        : lg
                          ? `${lg.durationMin}:${String(lg.durationSec || 0).padStart(2, '0')}`
                          : '--:--'}
                    </span>
                    {(inLive ? liveGame.queueName : lg?.queueType) ? (
                      <span className="db-queue-badge">{inLive ? liveGame.queueName : lg.queueType}</span>
                    ) : null}
                  </div>

                  <div className="db-card-match-teams">
                    {showBans ? (
                      <div className="db-ban-row">
                        {allyBans.map((b, i) => (
                          <span key={`ab-${b.champion || i}`} className={`db-ban${b.champion ? '' : ' is-empty'}`}>
                            {b.champion ? <ChampionIcon name={b.champion} size={18} /> : null}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="db-card-match-row">
                      {Array.from({ length: 5 }).map((_, i) => {
                        const c = (liveBlue || lg?.allyTeam)?.[i];
                        return c
                          ? <ChampionIcon key={`a-${c}-${i}`} name={c} size={46} team="blue" />
                          : <span key={`a-empty-${i}`} className="db-champ-empty" />;
                      })}
                    </div>
                    <div className="db-vs-chip">VS</div>
                    <div className="db-card-match-row">
                      {Array.from({ length: 5 }).map((_, i) => {
                        const c = (liveRed || lg?.enemyTeam)?.[i];
                        return c
                          ? <ChampionIcon key={`e-${c}-${i}`} name={c} size={46} team="red" />
                          : <span key={`e-empty-${i}`} className="db-champ-empty" />;
                      })}
                    </div>
                    {showBans ? (
                      <div className="db-ban-row">
                        {enemyBans.map((b, i) => (
                          <span key={`eb-${b.champion || i}`} className={`db-ban${b.champion ? '' : ' is-empty'}`}>
                            {b.champion ? <ChampionIcon name={b.champion} size={18} team="red" /> : null}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="db-card-match-dots">
                    {(games.length ? games : [0]).map((g, i) => (
                      <button
                        type="button"
                        key={g.matchId || i}
                        className={i === matchIdx ? 'is-on' : ''}
                        aria-label={`Match ${i + 1}`}
                        onClick={() => setMatchIdx(i)}
                      />
                    ))}
                  </div>

                  <span className={`db-pill-btn db-pill-btn--live${inLive ? ' is-live' : ''}`}>
                    {inLive ? 'In game' : 'Live status'}
                  </span>
                </article>

                <article className="db-dpm-card db-card-soon">
                  {lg && splashChamp ? (
                    <img
                      src={champLoadingUrl(splashChamp)}
                      alt=""
                      className="db-card-soon-art"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : null}
                  <div className="db-card-soon-overlay" />
                  <div className="db-card-soon-body">
                    <span className="db-card-soon-kicker">Replays · Soon</span>
                    <h3>Paused for now</h3>
                    <p>Full replay capture stays in the desktop app for now.</p>
                  </div>
                </article>

                {lg ? (
                  <article className="db-dpm-card db-card-perf">
                    <div className="db-card-perf-head">
                      <ChampionIcon name={lg.champion} size={42} rounded />
                      <div className="db-card-perf-kda-wrap">
                        <div className="db-card-perf-kda">{lg.kills} / {lg.deaths} / {lg.assists}</div>
                        <div className="db-card-perf-kda-sub">{lg.kda} KDA</div>
                      </div>
                    </div>
                    <div className="db-card-perf-rings">
                      <ScoreRing label="EARLY" value={lg.earlyScore} color="#7c5cff" size={58} />
                      <ScoreRing label="MID" value={lg.midScore} color="#5ba2ff" size={58} />
                      <ScoreRing label="LATE" value={lg.lateScore} color="#3ecf8e" size={58} />
                    </div>
                    <div className="db-card-perf-stats">
                      <div>
                        <span>Deaths</span>
                        <strong className="is-red">{lg.deaths4}</strong>
                      </div>
                      <div>
                        <span>Kills + Assists</span>
                        <strong className="is-gold">{lg.killsAssists}</strong>
                      </div>
                      <div>
                        <span>CSM</span>
                        <strong className="is-green">{lg.csm}</strong>
                      </div>
                    </div>
                    <a className="db-pill-btn db-pill-btn--solid" href="../index.html">
                      Review in app
                    </a>
                  </article>
                ) : null}

                <article className="db-dpm-card db-card-overlays">
                  <div className="db-overlays-dim" />
                  <div className="db-overlays-foot">
                    <span className="db-overlays-logo" aria-hidden="true" />
                    <span className="db-card-title-lg">Overlays</span>
                    <span className="db-overlays-soon">Desktop app</span>
                  </div>
                </article>

                <article className="db-dpm-card db-card-collections">
                  <img className="db-collections-art" src={champSplashUrl('Rakan')} alt="" />
                  <div className="db-collections-overlay" />
                  <div className="db-collections-count">
                    {collections.played} / {collections.total} champions played
                  </div>
                  <div className="db-collections-foot">
                    <span className="db-hex-icon" aria-hidden="true" />
                    <span className="db-card-title-lg">Collections</span>
                  </div>
                </article>

                <article className="db-dpm-card db-card-lens">
                  <div className="db-lens-head">
                    <span className="db-lens-mark">◎</span>
                    <span>Rift Lens</span>
                  </div>
                  <svg viewBox="0 0 200 70" className="db-lens-graph" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="webLensFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffb454" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#ffb454" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={lensPoints.area} fill="url(#webLensFill)" />
                    <polyline
                      points={lensPoints.line}
                      fill="none"
                      stroke="#ffb454"
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="db-lens-foot">
                    <div>
                      <div className="db-lens-label">Survivability</div>
                      <div className="db-lens-sub">Avg {lens.avgDeaths} deaths / game</div>
                    </div>
                    <div className="db-lens-score">{lens.score}/100</div>
                  </div>
                </article>
              </div>
            </div>

            <aside className="db-matches">
              <div className="db-matches-header">
                {MODE_LABEL[mode]} · Recent games
              </div>
              <div className="db-recent-list">
                {(profile.recentGames || []).map((g, i) => (
                  <RecentGameRow
                    key={g.matchId}
                    game={g}
                    active={i === matchIdx}
                    onSelect={() => setMatchIdx(i)}
                  />
                ))}
                {!(profile.recentGames || []).length ? (
                  <div className="db-recent-empty">No games in this queue yet.</div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

function RANK_COLORS_SAFE(tier) {
  const map = {
    IRON: '#8a8a8a', BRONZE: '#cd7f32', SILVER: '#9fb3c8', GOLD: '#e0b256',
    PLATINUM: '#4fd7c5', EMERALD: '#3ecf8e', DIAMOND: '#5ba2ff', MASTER: '#a06bff',
    GRANDMASTER: '#ff5c68', CHALLENGER: '#ffd76b',
  };
  return map[String(tier || '').toUpperCase()] || '#9b86ff';
}
