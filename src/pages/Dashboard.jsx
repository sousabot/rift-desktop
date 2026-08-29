import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSummonerDashboard, getLiveGame } from '../services/riotApi';
import { champIconUrl, platformLabel, profileIconUrl, useDdragonVersion } from '../services/ddragon';
import { parsePlayerSearch, parseProIdentity, parseRiotId, playerQuery } from '../lib/playerRoute';
import { countryName, flagUrl } from '../lib/countryFlag';
import { rememberPlayer } from '../lib/recentPlayers';
import { apiUserMessage, noticeFromError } from '../lib/apiNotice';
import { MODE_KEYS, MODE_LABEL, MODE_QUEUE } from '../lib/queues';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import MatchReview from '../components/MatchReview';
import { GD_SCORE_HINT } from '../lib/gdScore';
import { padTeamBans } from '../lib/bans';
import {
  displayPeakShort,
  estimateRankMmr,
  formatMmr,
  mergePeakRank,
  mmrToRank,
  peakFromLcuPack,
  rankSnapshot,
  resolveEstimatedMmr,
} from '../lib/rankMmr';
import { loadOpggRankContext } from '../lib/seasonPeak';
import { applyLpNotes, formatLpDelta } from '../lib/lpHistory';
import { RANK_COLORS, rankColor, rankImg, rankEmblemClass } from '../lib/rankEmblem';
import './Dashboard.css';

/* ─── helpers ─────────────────────────────────────────────── */
const normChamp = (name = '') =>
  name.replace(/[^a-zA-Z0-9]/g, '').replace(/^./, (c) => c.toUpperCase());

const splashImg = (name) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${normChamp(name)}_0.jpg`;

const loadingImg = (name) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${normChamp(name)}_0.jpg`;

const fmtElapsed = (seconds = 0) => {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, Math.floor(seconds % 60));
  return `${m}:${String(s).padStart(2, '0')}`;
};

function teamCaption(identity) {
  const team = String(identity?.team || '').trim();
  const short = String(identity?.short || '').trim();
  if (!team) return short;
  if (short && !team.toLowerCase().includes(short.toLowerCase())) return `${team} · ${short}`;
  return team;
}

function peakStoreKey(riotId, mode) {
  return `rift-peak-rank:${String(riotId || '').toLowerCase()}:${mode}`;
}

function readStoredPeak(riotId, mode) {
  try {
    return JSON.parse(localStorage.getItem(peakStoreKey(riotId, mode)) || 'null');
  } catch {
    return null;
  }
}

function writeStoredPeak(riotId, mode, peak) {
  try {
    localStorage.setItem(peakStoreKey(riotId, mode), JSON.stringify(peak));
  } catch { /* ignore quota */ }
}

/* ─── Sparkline ────────────────────────────────────────────── */
function Sparkline({ data = [], up = true }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => [
      (i / (data.length - 1)) * w,
      h - ((v - min) / range) * (h - 6) - 3,
    ]);
    ctx.clearRect(0, 0, w, h);
    const c = up ? '#3ecf8e' : '#ff5c68';
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, c + '55');
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

/* ─── StatCard ─────────────────────────────────────────────── */
function StatCard({ label, value, delta, deltaDir, sparkData, hint }) {
  const isUp   = deltaDir === 'up';
  const isDown = deltaDir === 'down';
  return (
    <div className="db-stat-card" title={hint || undefined}>
      <div className="db-stat-top">
        <span className="db-stat-label">{label}</span>
        <Sparkline data={sparkData} up={!isDown} />
      </div>
      <div className="db-stat-bottom">
        <span className="db-stat-value">{value}</span>
        <span className={`db-stat-delta-pill db-stat-delta-pill--${deltaDir}`}>
          <span className="db-stat-delta-dot" />
          {delta} <span className="db-stat-delta-sub">vs 1w</span>
        </span>
      </div>
    </div>
  );
}

/* ─── ChampionIcon ─────────────────────────────────────────── */
function ChampionIcon({ name, size = 36, enemy = false, rounded = false, team }) {
  const version = useDdragonVersion();
  const [src, setSrc] = useState(() => champIconUrl(name, version));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSrc(champIconUrl(name, version));
    setFailed(false);
  }, [name, version]);
  const teamClass = team === 'blue' ? ' db-champ-icon--blue' : team === 'red' ? ' db-champ-icon--red' : '';
  if (failed) {
    return (
      <span
        className={`db-champ-icon is-empty${enemy ? ' db-champ-icon--enemy' : ''}${rounded ? ' db-champ-icon--rounded' : ''}${teamClass}`}
        style={{ width: size, height: size, display: 'inline-block' }}
        title={name}
      />
    );
  }
  return (
    <img
      src={src}
      alt={name}
      title={name}
      onError={() => setFailed(true)}
      className={`db-champ-icon${enemy ? ' db-champ-icon--enemy' : ''}${rounded ? ' db-champ-icon--rounded' : ''}${teamClass}`}
      style={{ width: size, height: size }}
    />
  );
}

/* ─── ScoreRing ────────────────────────────────────────────── */
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
        <text x={cx} y={cx + 4} textAnchor="middle" fill="#fff" fontSize={size > 48 ? 13 : 10} fontWeight="700">{value}</text>
      </svg>
      <span className="db-score-ring-label">{label}</span>
    </div>
  );
}

/* ─── LPRing (sidebar recent game badge) ───────────────────── */
function LPRing({ lp, win }) {
  const size = 36;
  const stroke = 3;
  const r = (size / 2) - stroke;
  const circ = 2 * Math.PI * r;
  const score = Math.max(0, Math.min(100, Number(lp) || 0));
  const pct = score / 100;
  return (
    <div className={`db-lp-ring db-lp-ring--${win ? 'win' : 'loss'}`} title={`Rift Score ${score}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="db-lp-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="db-lp-ring__progress"
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text className="db-lp-ring__value" x={size / 2} y={size / 2 + 4} textAnchor="middle">
          {Math.round(score)}
        </text>
      </svg>
    </div>
  );
}

/* ─── RecentGameRow ────────────────────────────────────────── */
function RecentGameRow({ game, active, onSelect }) {
  const { t } = useI18n();
  const { champion, win, kills, deaths, assists, kda, ago, gdScore, lp, queueLabel, queueType, lpDelta } = game;
  const score = gdScore ?? lp;
  const lpLabel = formatLpDelta(lpDelta);
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
          <span className={`db-recent-result ${win ? 'win' : 'loss'}`}>{win ? t('dash.win') : t('dash.loss')}</span>
          {lpLabel ? (
            <span className={`db-recent-lp ${lpDelta >= 0 ? 'is-up' : 'is-down'}`}>
              {lpLabel}
            </span>
          ) : null}
          <span className="db-recent-queue">{queueLabel || queueType || 'Solo/Duo'}</span>
        </div>
        <span className="db-recent-kda">{kills}/{deaths}/{assists}</span>
        <span className="db-recent-kdaval">{kda} KDA</span>
      </div>
      <LPRing lp={score} win={win} />
    </button>
  );
}

/* ─── Dashboard ────────────────────────────────────────────── */
export default function Dashboard() {
  const { session } = useSession();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ddVersion = useDdragonVersion();
  const qParam = parsePlayerSearch(searchParams);
  const ownId = session ? `${session.gameName}#${session.tagLine}` : '';
  const activeId = (qParam || ownId).trim();
  const viewingOther = Boolean(qParam && (!ownId || qParam.toLowerCase() !== ownId.toLowerCase()));

  const [profile, setProfile] = useState(null);
  const loadSeq = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState('Solo');
  const [liveGame, setLiveGame] = useState(null);
  const [liveAt, setLiveAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [matchIdx, setMatchIdx] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lcuCol, setLcuCol] = useState(null);
  const [peakRank, setPeakRank] = useState(null);
  const [estMmr, setEstMmr] = useState(null);
  const [proIdentity, setProIdentity] = useState(null);

  useEffect(() => {
    const riotId = String(activeId || '').trim();
    const hinted = parseProIdentity(searchParams);
    if (!riotId.includes('#')) {
      setProIdentity(null);
      return undefined;
    }
    setProIdentity(hinted);
    const api = typeof window !== 'undefined' ? window.prosAPI : null;
    if (!api?.lookup) return undefined;
    let cancelled = false;
    api.lookup(riotId).then((res) => {
      if (cancelled) return;
      if (res?.ok && res.identity) setProIdentity(res.identity);
      else if (!hinted) setProIdentity(null);
    }).catch(() => {
      if (!cancelled && !hinted) setProIdentity(null);
    });
    return () => { cancelled = true; };
  }, [activeId, searchParams]);

  const lookup = {
    region: session?.region || 'europe',
    platform: session?.platform || 'euw1',
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
    setReviewOpen(false);
    setLiveGame(null);
    const parsed = parseRiotId(riotId, session?.tagLine || '');
    if (!parsed) {
      if (reqId !== loadSeq.current) return;
      setProfile(null);
      setLoadError(t('dash.needTag'));
      setLoading(false);
      return;
    }
    try {
      const data = await getSummonerDashboard({
        gameName: parsed.gameName,
        tagLine: parsed.tagLine,
        region: lookup.region,
        platform: lookup.platform,
        queue: MODE_QUEUE[selectedMode],
        count: 20,
      });
      if (reqId !== loadSeq.current) return;
      setProfile(data);
      rememberPlayer(data?.riotId || riotId);
    } catch (err) {
      if (reqId !== loadSeq.current) return;
      console.error('[Dashboard] Failed to load summoner:', err);
      noticeFromError(err);
      setProfile(null);
      setLoadError(apiUserMessage(err) || t('dash.loadFail'));
    } finally {
      if (reqId === loadSeq.current) setLoading(false);
    }
  };

  const selectMode = (m) => {
    setMode(m);
    load(activeId, m);
  };

  useEffect(() => {
    load(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, session?.platform, session?.region]);

  useEffect(() => {
    if (!window.lcuAPI?.getCollections) return undefined;
    let alive = true;
    window.lcuAPI.getCollections(false).then((next) => {
      if (alive && next?.connected) setLcuCol(next);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Spectator for whoever is on this dashboard — linked account or a searched player.
  useEffect(() => {
    if (!profile?.riotId) return undefined;
    let cancelled = false;
    const [gameName, tagLine] = profile.riotId.split('#');
    const lookupLive = {
      gameName,
      tagLine,
      region: lookup.region,
      platform: profile.platform || lookup.platform,
    };
    const tick = (first) => {
      if (first) setLiveGame((prev) => prev);
      getLiveGame(lookupLive).then((g) => {
        if (cancelled) return;
        setLiveGame(g || null);
        if (g) setLiveAt(Date.now());
      }).catch(() => {
        if (!cancelled) setLiveGame(null);
      });
    };
    tick(true);
    const id = setInterval(() => tick(false), 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [profile?.riotId, profile?.platform, lookup.region, lookup.platform]);

  useEffect(() => {
    if (!liveGame) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [liveGame]);

  useEffect(() => {
    if (!profile?.riotId) {
      setPeakRank(null);
      setEstMmr(null);
      return undefined;
    }
    const current = rankSnapshot(profile.rankTier, profile.rankDivision, profile.lp);
    const stored = readStoredPeak(profile.riotId, mode);
    const visibleMmr = estimateRankMmr(profile.rankTier, profile.rankDivision, profile.lp);
    let cancelled = false;
    const applyPeak = (pack, seasonHigh) => {
      if (cancelled) return;
      const queueType = mode === 'Flex' ? 'RANKED_FLEX_SR' : 'RANKED_SOLO_5x5';
      const tracked = seasonHigh
        ? rankSnapshot(seasonHigh.tier, seasonHigh.division, seasonHigh.lp)
        : null;
      const peak = mergePeakRank(stored, current, tracked, ...peakFromLcuPack(pack, queueType));
      if (peak) writeStoredPeak(profile.riotId, mode, peak);
      setPeakRank(peak);
    };
    const applyMmr = (lobbyMmrs) => {
      if (cancelled) return;
      setEstMmr(resolveEstimatedMmr({
        visibleMmr,
        wins: profile.wins,
        losses: profile.losses,
        lobbyMmrs,
      }));
    };
    applyPeak(null, profile.seasonPeak || null);
    setEstMmr(profile.estMmr ?? resolveEstimatedMmr({
      visibleMmr,
      wins: profile.wins,
      losses: profile.losses,
      lobbyMmrs: [],
    }));
    const lcuJob = (!viewingOther && window.lcuAPI?.getRankedInsight)
      ? window.lcuAPI.getRankedInsight().then((insight) => {
        const same = insight?.riotId
          && String(insight.riotId).trim().toLowerCase() === String(profile.riotId).trim().toLowerCase();
        const pack = mode === 'Flex' ? insight?.flex : insight?.solo;
        return same ? pack : null;
      }).catch(() => null)
      : Promise.resolve(null);
    const trackerJob = loadOpggRankContext({
      puuid: profile.puuid,
      platform: profile.platform,
      flex: mode === 'Flex',
      riotId: profile.riotId,
    }).catch(() => ({ peak: profile.seasonPeak || null, lobbyMmrs: [] }));
    Promise.all([lcuJob, trackerJob]).then(([pack, ctx]) => {
      applyPeak(pack, ctx?.peak || profile.seasonPeak || null);
      if (ctx?.lobbyMmrs?.length) applyMmr(ctx.lobbyMmrs);
      if (cancelled || (mode !== 'Solo' && mode !== 'Flex')) return;
      const notes = pack?.notes || [];
      if (!notes.some((n) => n.lpDelta != null)) return;
      setProfile((prev) => {
        if (!prev?.recentGames) return prev;
        const recentGames = applyLpNotes(
          prev.recentGames,
          notes,
          prev.riotId,
          mode,
          MODE_QUEUE[mode],
        );
        return recentGames === prev.recentGames ? prev : { ...prev, recentGames };
      });
    });
    return () => { cancelled = true; };
  }, [profile?.riotId, profile?.puuid, profile?.platform, profile?.seasonPeak, profile?.rankTier, profile?.rankDivision, profile?.lp, profile?.wins, profile?.losses, profile?.estMmr, mode, viewingOther]);

  const winrate = profile && profile.wins != null
    ? Math.round((profile.wins / Math.max(1, profile.wins + profile.losses)) * 100)
    : null;

  const s  = profile?.stats || {};
  const sp = profile?.sparklines || {};
  const games = profile?.recentGames || [];
  const lg = games[matchIdx] || profile?.lastGame || null;
  const rc = profile ? rankColor(profile.rank) : '#a06bff';
  const mmrRank = mmrToRank(estMmr ?? profile?.estMmr);
  const mmrColor = mmrRank?.tier ? (RANK_COLORS[mmrRank.tier] || '#9b86ff') : '#9b86ff';
  const resolvedPlatform = profile?.platform || lookup.platform;
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

  const cycleMatch = (dir) => {
    if (!games.length) return;
    setMatchIdx((i) => (i + dir + games.length) % games.length);
  };

  const lensPoints = (() => {
    const series = lens.series?.length ? lens.series : [50];
    const w = 200, h = 70;
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
    { label: t('dash.kda'), value: s.kda, delta: s.kdaDelta, deltaDir: s.kdaDeltaDir, sparkData: sp.kda },
    { label: t('dash.riftScore'), value: s.gdScore, delta: s.gdDelta, deltaDir: s.gdDeltaDir, sparkData: sp.gdScore, hint: GD_SCORE_HINT },
    { label: t('dash.kp'), value: s.kp, delta: s.kpDelta, deltaDir: s.kpDeltaDir, sparkData: sp.kp },
    { label: t('dash.csm'), value: s.csm, delta: s.csmDelta, deltaDir: s.csmDeltaDir, sparkData: sp.csm },
    { label: t('dash.vision'), value: s.visionScore, delta: s.visionDelta, deltaDir: s.visionDeltaDir, sparkData: sp.vision },
    { label: t('dash.gpm'), value: s.gpm, delta: s.gpmDelta, deltaDir: s.gpmDeltaDir, sparkData: sp.gpm },
    { label: t('dash.gold15'), value: s.goldDiff15, delta: s.goldDiff15Delta, deltaDir: s.goldDiff15DeltaDir, sparkData: sp.goldDiff15 },
    { label: t('dash.ka15'), value: s.kaDiff15, delta: s.kaDiff15Delta, deltaDir: s.kaDiff15DeltaDir, sparkData: sp.kaDiff15 },
  ];

  return (
    <div className="db-page">

      {/* ── Page title + mode filters ── */}
      <div className="db-page-head">
        <div>
          <h1 className="db-page-title">Dashboard</h1>
          {viewingOther && (
            <div className="db-viewing-banner">
              Viewing {activeId}
              {ownId && (
                <button type="button" onClick={() => setSearchParams({})}>Back to my dashboard</button>
              )}
            </div>
          )}
        </div>
        <div className="db-toolbar">
          <div className="db-mode-filters">
            {MODE_KEYS.map((m) => (
              <button
                key={m}
                className={`db-mode-btn${m === mode ? ' active' : ''}`}
                onClick={() => selectMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="db-toolbar-meta">
            <span className="db-filter-label">Last 20 games</span>
            <span className="db-filter-label">{platformLabel(resolvedPlatform)}</span>
            <button type="button" className="db-filter-label highlight" onClick={() => navigate(`/history${viewingOther ? playerQuery(activeId) : ''}`)}>
              Full history
            </button>
          </div>
        </div>
      </div>

      {!activeId ? (
        <div className="db-loading">
          <span>Link a Riot account to load your dashboard.</span>
          <button type="button" className="db-retry" onClick={() => navigate('/link-account')}>Link account</button>
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

              {/* Hero: splash + profile + rank + glass stats */}
              <div className="db-hero">
                <div className="db-splash-bg" style={splashChamp ? { backgroundImage: `url(${splashImg(splashChamp)})` } : undefined} />
                <div className="db-splash-overlay" />

                <div className="db-hero-inner">
                  <div className="db-hero-top">
                    <div className="db-profile-row">
                      <div className="db-avatar-wrap" style={{ '--rc': rc }}>
                        <img src={profileIconUrl(profile.profileIconId, ddVersion)} alt="" className="db-avatar"
                          onError={(e) => {
                            const el = e.currentTarget;
                            if (el.dataset.fb) {
                              el.style.visibility = 'hidden';
                              return;
                            }
                            el.dataset.fb = '1';
                            el.src = profileIconUrl(29, ddVersion);
                          }} />
                        {profile.summonerLevel != null && (
                          <span className="db-avatar-level">{profile.summonerLevel}</span>
                        )}
                      </div>
                      <div className="db-profile-info">
                        <h2 className="db-summoner-name">{profile.riotId?.split('#')[0]}</h2>
                        <div className="db-profile-meta">
                          <span className="db-summoner-tag">#{profile.riotId?.split('#')[1]}</span>
                          <span className="db-summoner-tag">{profile.region || platformLabel(resolvedPlatform)}</span>
                        </div>
                        {proIdentity && (proIdentity.country || proIdentity.team) ? (
                          <div className="db-pro-row">
                            {proIdentity.country ? (
                              <span className="db-pro-chip">
                                {flagUrl(proIdentity.country) ? (
                                  <img src={flagUrl(proIdentity.country, 40)} alt="" />
                                ) : null}
                                {countryName(proIdentity.country, locale)}
                                {proIdentity.lane ? ` · ${proIdentity.lane}` : ''}
                              </span>
                            ) : proIdentity.lane ? (
                              <span className="db-pro-chip">{proIdentity.lane}</span>
                            ) : null}
                            {teamCaption(proIdentity) ? (
                              <span className="db-pro-chip db-pro-chip--team">
                                {proIdentity.logo ? (
                                  <img src={proIdentity.logo} alt="" />
                                ) : null}
                                {teamCaption(proIdentity)}
                              </span>
                            ) : null}
                            {proIdentity.name && proIdentity.name.toLowerCase() !== String(profile.riotId?.split('#')[0] || '').toLowerCase() ? (
                              <span className="db-pro-chip db-pro-chip--handle">{proIdentity.name}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="db-rank-card" style={{ '--rc': rc }}>
                      <span className="db-rank-card-eyebrow">{MODE_LABEL[mode] === 'All Queues' ? t('dash.ranked') : MODE_LABEL[mode]}</span>
                      <div className="db-rank-card-main">
                        {rankImg(profile.rank) && (
                          <img src={rankImg(profile.rank)} alt={profile.rank} className={rankEmblemClass(profile.rank, 'db-rank-card-emblem')} />
                        )}
                        <div className="db-rank-card-info">
                          <span className="db-rank-card-name" style={{ color: rc }}>{profile.rank || t('dash.unranked')}</span>
                          {profile.ladderRank && (
                            <span className="db-rank-card-num" style={{ color: rc }}>#{profile.ladderRank}</span>
                          )}
                          <span className="db-rank-card-lp" style={{ color: rc }}>
                            {profile.lp != null ? `${profile.lp} LP` : '—'}
                          </span>
                        </div>
                      </div>
                      {(peakRank || mmrRank) && (
                        <div className="db-rank-split">
                          <div className="db-rank-split-col">
                            <span className="db-rank-split-label">{t('dash.peak')}</span>
                            {rankImg(peakRank?.tier || profile.rank) && (
                              <img src={rankImg(peakRank?.tier || profile.rank)} alt="" className="db-rank-split-emblem" />
                            )}
                            <span className="db-rank-split-val" style={{ color: rc }}>
                              {displayPeakShort(
                                peakRank,
                                rankSnapshot(profile.rankTier, profile.rankDivision, profile.lp),
                              ) || '—'}
                            </span>
                            <span className="db-rank-split-q" title={t('dash.peakHint')}>?</span>
                          </div>
                          <div className="db-rank-split-col is-mmr">
                            <span className="db-rank-split-label">{t('dash.mmr')}</span>
                            {rankImg(mmrRank?.tier) && (
                              <img src={rankImg(mmrRank.tier)} alt="" className="db-rank-split-emblem" />
                            )}
                            <span className="db-rank-split-val" style={{ color: mmrColor }}>
                              {mmrRank?.short || '—'}
                            </span>
                            <span
                              className="db-rank-split-q"
                              title={`${t('dash.estMmrHint')}${formatMmr(estMmr ?? profile.estMmr) ? ` (${formatMmr(estMmr ?? profile.estMmr)})` : ''}`}
                            >
                              ?
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="db-rank-card-record">
                        {profile.wins != null
                          ? `${profile.wins}W – ${profile.losses}L${winrate != null ? ` · ${winrate}%` : ''}`
                          : t('dash.rankFail')}
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

              {/* DPM-style action cards */}
              <div className="db-cards">
                <article className="db-dpm-card db-card-match">
                  <button type="button" className="db-card-side-arrow is-left" aria-label="Previous" onClick={() => cycleMatch(-1)}>‹</button>
                  <button type="button" className="db-card-side-arrow is-right" aria-label="Next" onClick={() => cycleMatch(1)}>›</button>

                  <div className="db-card-match-top">
                    <span className="db-region-badge">{lg?.region || platformLabel(resolvedPlatform)}</span>
                    <span className={`db-match-timer${inLive ? ' is-live' : ''}`}>
                      <span className="db-match-timer-dot" />
                      {inLive
                        ? fmtElapsed(liveElapsed)
                        : lg
                          ? `${lg.durationMin}:${String(lg.durationSec || 0).padStart(2, '0')}`
                          : '--:--'}
                    </span>
                    {(inLive ? liveGame.queueName : lg?.queueType) && (
                      <span className="db-queue-badge">{inLive ? liveGame.queueName : lg.queueType}</span>
                    )}
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

                  <button
                    type="button"
                    className={`db-pill-btn db-pill-btn--live${inLive ? ' is-live' : ''}`}
                    onClick={() => navigate(`/live${playerQuery(activeId)}`)}
                  >
                    {inLive ? t('dash.watchLive') : t('dash.liveStatus')}
                  </button>
                </article>

                <article
                  className="db-dpm-card db-card-soon"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate('/replays')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate('/replays');
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {lg && splashChamp && (
                    <img
                      src={loadingImg(splashChamp)}
                      alt=""
                      className="db-card-soon-art"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div className="db-card-soon-overlay" />
                  <div className="db-card-soon-body">
                    <span className="db-card-soon-kicker">{t('nav.replays')}</span>
                    <h3>{t('replays.title')}</h3>
                    <p>{t('replays.blurb')}</p>
                  </div>
                </article>

                {lg && (
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
                      <ScoreRing label="MID"   value={lg.midScore}   color="#5ba2ff" size={58} />
                      <ScoreRing label="LATE"  value={lg.lateScore}  color="#3ecf8e" size={58} />
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

                    <button type="button" className="db-pill-btn db-pill-btn--solid" onClick={() => setReviewOpen(true)}>
                      Review this game
                    </button>
                  </article>
                )}

                <article
                  className="db-dpm-card db-card-overlays"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/overlays')}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate('/overlays'); }}
                >
                  <div className="db-overlays-dim" />
                  <div className="db-overlays-foot">
                    <span className="db-overlays-logo" aria-hidden="true" />
                    <span className="db-card-title-lg">Overlays</span>
                    <span className="db-overlays-soon">Benchmark HUD</span>
                  </div>
                </article>

                <article
                  className="db-dpm-card db-card-collections"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/collections')}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate('/collections'); }}
                >
                  <img className="db-collections-art" src={splashImg('Rakan')} alt="" />
                  <div className="db-collections-overlay" />
                  <div className="db-collections-count">
                    {lcuCol
                      ? `${lcuCol.skinsOwned} / ${lcuCol.skinsTotal} skins`
                      : `${collections.played} / ${collections.total} champions played`}
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
                      <linearGradient id="lensFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffb454" stopOpacity="0.35"/>
                        <stop offset="100%" stopColor="#ffb454" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    <path d={lensPoints.area} fill="url(#lensFill)"/>
                    <polyline points={lensPoints.line}
                      fill="none" stroke="#ffb454" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"/>
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
                <button type="button" className="db-matches-more" onClick={() => navigate(`/history${viewingOther ? playerQuery(activeId) : ''}`)}>All</button>
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

      {reviewOpen && lg && (
        <MatchReview
          game={lg}
          platform={resolvedPlatform}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}