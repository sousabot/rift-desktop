import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  hydrateLeaderboardFromSnapshot,
  hydrateTierListFromSnapshot,
  peekDashboard,
  peekLeaderboard,
  peekTierList,
  prefetchDashboard,
  refreshDashboard,
  refreshLeaderboard,
  refreshTierList,
} from '../api';
import { getAppUrl } from '../getAppUrl';
import { useSession } from '../session';
import {
  REGIONS,
  champIconUrl,
  ddragonVersion,
  parseRiotIdInput,
  platformShort,
  profileIconUrl,
  rankColor,
  rankImg,
} from '../lib';

const LB_PLATFORMS = [
  { id: 'euw1', short: 'EUW' },
  { id: 'kr', short: 'KR' },
  { id: 'na1', short: 'NA' },
];

const MEEPS = [
  { src: './meep-wave.svg', className: 'meep meep-1' },
  { src: './meep-curl.svg', className: 'meep meep-2' },
  { src: './meep-wave.svg', className: 'meep meep-3' },
  { src: './meep-curl.svg', className: 'meep meep-4' },
];

const RIOT_NOTE = 'Rift.lol is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends.';

function tierColor(tier) {
  const t = String(tier || '?');
  if (t.startsWith('S')) return '#ffb454';
  if (t.startsWith('A')) return '#7c5cff';
  if (t.startsWith('B')) return '#5eb8ff';
  return '#8890b5';
}

function wrOf(row) {
  return Math.round((row.wins / Math.max(1, (row.wins || 0) + (row.losses || 0))) * 100);
}

function topTierRows(payload, limit = 5) {
  const all = payload?.rows || [];
  const filtered = all.filter((row) => !row.lowSample && row.isPrimary !== false && Number(row.lanePct || 0) >= 12);
  const best = new Map();
  for (const row of filtered) {
    const prev = best.get(row.champion);
    if (!prev || (row.metaScore ?? row.score) > (prev.metaScore ?? prev.score)) {
      best.set(row.champion, row);
    }
  }
  return [...best.values()]
    .sort((a, b) => (a.rank - b.rank) || (b.metaScore ?? b.score) - (a.metaScore ?? a.score))
    .slice(0, limit);
}

function Meeps() {
  return (
    <div className="meeps" aria-hidden="true">
      {MEEPS.map((m, i) => (
        <img key={i} className={m.className} src={m.src} alt="" draggable={false} />
      ))}
    </div>
  );
}

function SearchBar({ query, setQuery, searchPlatform, setSearchPlatform, onSearch }) {
  return (
    <form className="hero-search" onSubmit={onSearch}>
      <label className="hero-region">
        <select
          value={searchPlatform}
          onChange={(e) => setSearchPlatform(e.target.value)}
          aria-label="Region"
        >
          {REGIONS.map((r) => (
            <option key={r.platform} value={r.platform}>{r.short}</option>
          ))}
        </select>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path fill="currentColor" d="M2.2 4.2 6 8l3.8-3.8L11 5.4 6 10.4 1 5.4z" />
        </svg>
      </label>
      <div className="hero-search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.2-1.4 1.4-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Summoner Name#TAG"
          autoComplete="off"
          aria-label="Search summoner"
        />
      </div>
      <button type="submit" className="hero-search-go">Search</button>
    </form>
  );
}

function GameSkeleton({ count = 5 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="home-game is-skeleton" aria-hidden="true">
          <span className="sk sk-avatar" />
          <span className="home-champ">
            <span className="sk sk-avatar" />
            <span className="home-champ-text">
              <span className="sk sk-line sk-line-name" />
              <span className="sk sk-line sk-line-sub" />
            </span>
          </span>
          <span className="sk sk-line sk-line-cell" />
        </div>
      ))}
    </>
  );
}

function SkeletonRows({ count = 5, variant = '' }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`home-widget-row is-skeleton ${variant}`} aria-hidden="true">
          {variant.includes('lb') ? <span className="sk sk-line sk-line-cell" /> : null}
          <span className="home-champ">
            <span className="sk sk-avatar" />
            <span className="home-champ-text">
              <span className="sk sk-line sk-line-name" />
              <span className="sk sk-line sk-line-sub" />
            </span>
          </span>
          <span className="sk sk-line sk-line-cell" />
          <span className="sk sk-line sk-line-cell" />
          {variant.includes('lb') ? null : <span className="sk sk-line sk-line-cell" />}
        </div>
      ))}
    </>
  );
}

export default function Home() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState('16.16.1');
  const [tierData, setTierData] = useState(() => peekTierList({ platform: session?.platform || 'euw1', rank: 'master' }));
  const [lbPlatform, setLbPlatform] = useState(session?.platform || 'euw1');
  const [lbData, setLbData] = useState(() => peekLeaderboard({
    tier: 'challenger',
    platform: session?.platform && LB_PLATFORMS.some((p) => p.id === session.platform)
      ? session.platform
      : 'euw1',
    mode: 'soloq',
  }));
  const [tierLoading, setTierLoading] = useState(() => !peekTierList({ platform: session?.platform || 'euw1', rank: 'master' }));
  const [lbLoading, setLbLoading] = useState(() => !peekLeaderboard({
    tier: 'challenger',
    platform: session?.platform && LB_PLATFORMS.some((p) => p.id === session.platform)
      ? session.platform
      : 'euw1',
    mode: 'soloq',
  }));
  const [searchPlatform, setSearchPlatform] = useState(session?.platform || 'euw1');
  const [you, setYou] = useState(() => (session?.gameName && session?.tagLine
    ? peekDashboard({
      gameName: session.gameName,
      tagLine: session.tagLine,
      platform: session.platform || 'euw1',
      mode: 'Solo',
      light: true,
    })
    : null));
  const [youLoading, setYouLoading] = useState(() => {
    if (!session?.gameName || !session?.tagLine) return false;
    return !peekDashboard({
      gameName: session.gameName,
      tagLine: session.tagLine,
      platform: session.platform || 'euw1',
      mode: 'Solo',
      light: true,
    });
  });
  const [youError, setYouError] = useState('');
  const [youTick, setYouTick] = useState(0);

  const platform = session?.platform || 'euw1';

  useEffect(() => { ddragonVersion().then(setVersion); }, []);

  useEffect(() => {
    if (!session?.platform) return;
    setSearchPlatform(session.platform);
    if (LB_PLATFORMS.some((p) => p.id === session.platform)) {
      setLbPlatform(session.platform);
    }
  }, [session?.platform]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let cached = peekTierList({ platform, rank: 'master' });
      if (!cached) {
        cached = await hydrateTierListFromSnapshot({ platform, rank: 'master' });
      }
      if (!alive) return;
      if (cached) {
        setTierData(cached);
        setTierLoading(false);
      } else {
        setTierLoading(true);
      }
      try {
        const payload = await refreshTierList({ platform, rank: 'master' });
        if (alive && payload) setTierData(payload);
      } catch {
        if (alive && !cached) setTierData(null);
      } finally {
        if (alive) setTierLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [platform]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let cached = peekLeaderboard({ tier: 'challenger', platform: lbPlatform, mode: 'soloq' });
      if (!cached && lbPlatform === 'euw1') {
        cached = await hydrateLeaderboardFromSnapshot({
          tier: 'challenger',
          platform: 'euw1',
          mode: 'soloq',
        });
      }
      if (!alive) return;
      if (cached) {
        setLbData(cached);
        setLbLoading(false);
      } else {
        setLbLoading(true);
      }
      try {
        const payload = await refreshLeaderboard({
          tier: 'challenger',
          platform: lbPlatform,
          mode: 'soloq',
          limit: 5,
        });
        if (alive && payload?.entries?.length) setLbData(payload);
      } catch {
        if (alive && !cached) {
          setLbData((prev) => (prev?.platform === lbPlatform && prev.entries?.length ? prev : null));
        }
      } finally {
        if (alive) setLbLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [lbPlatform]);

  useEffect(() => {
    if (!session?.gameName || !session?.tagLine) {
      setYou(null);
      setYouError('');
      setYouLoading(false);
      return undefined;
    }
    let alive = true;
    const args = {
      gameName: session.gameName,
      tagLine: session.tagLine,
      platform: session.platform || 'euw1',
      region: session.region,
      mode: 'Solo',
      count: 5,
      light: true,
    };
    const cached = peekDashboard(args);
    if (cached) {
      setYou(cached);
      setYouLoading(false);
    } else {
      setYouLoading(true);
    }
    setYouError('');

    // Early HTML prefetch may land in localStorage after first paint — pick it up.
    const poll = window.setInterval(() => {
      if (!alive) return;
      const hit = peekDashboard(args);
      if (hit) {
        setYou(hit);
        setYouLoading(false);
        window.clearInterval(poll);
      }
    }, 200);
    const pollStop = window.setTimeout(() => window.clearInterval(poll), 12000);

    refreshDashboard(args)
      .then((payload) => { if (alive && payload) setYou(payload); })
      .catch((err) => {
        if (!alive) return;
        if (!peekDashboard(args)) {
          setYou(null);
          setYouError(err.message || 'Could not load your games.');
        }
      })
      .finally(() => { if (alive) setYouLoading(false); });
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearTimeout(pollStop);
    };
  }, [session?.gameName, session?.tagLine, session?.platform, session?.region, youTick]);

  const tierRows = useMemo(() => topTierRows(tierData, 5), [tierData]);
  const lbRows = (lbData?.entries || []).slice(0, 5);
  const patch = tierData?.patch || '';
  const overview = you?.overview || {};
  const recent = (you?.recentGames || []).slice(0, 5);
  const ranked = you?.solo || {
    rank: you?.rank,
    lp: you?.lp,
    wins: you?.wins,
    losses: you?.losses,
  };
  const emblem = rankImg(ranked?.rank || you?.rank);
  const rankLabel = ranked?.rank || you?.rank || 'Unranked';
  const dashVersion = you?.ddragonVersion || version;

  const onSearch = (e) => {
    e.preventDefault();
    const parsed = parseRiotIdInput(query);
    if (!parsed.gameName) return;
    const params = new URLSearchParams();
    params.set('name', parsed.gameName);
    if (parsed.tagLine) params.set('tag', parsed.tagLine);
    if (searchPlatform) params.set('platform', searchPlatform);
    if (parsed.gameName && parsed.tagLine) {
      prefetchDashboard({
        gameName: parsed.gameName,
        tagLine: parsed.tagLine,
        platform: searchPlatform || 'euw1',
        mode: 'Solo',
        count: 8,
        light: true,
      });
    }
    navigate(`/dashboard?${params}`);
  };

  return (
    <div className="home">
      <Meeps />

      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <img className="hero-mark" src="./icon.png" alt="" />
        <p className="hero-wordmark">RIFT.LOL</p>
        <SearchBar
          query={query}
          setQuery={setQuery}
          searchPlatform={searchPlatform}
          setSearchPlatform={setSearchPlatform}
          onSearch={onSearch}
        />
        {session ? (
          <div className="hero-you">
            {emblem ? <img className="hero-you-rank" src={emblem} alt="" /> : null}
            <img
              src={profileIconUrl(you?.profileIconId || session.profileIconId || 29, dashVersion)}
              alt=""
              onError={(e) => { e.currentTarget.src = profileIconUrl(29, dashVersion); }}
            />
            <div className="hero-you-copy">
              <strong>{session.gameName}#{session.tagLine}</strong>
              <span>
                <em style={{ color: rankColor(rankLabel) }}>{rankLabel}</em>
                {ranked?.lp != null ? ` · ${ranked.lp} LP` : ''}
                {overview.games ? ` · last ${overview.games}: ${overview.winrate}% WR` : ` · ${platformShort(session.platform)}`}
              </span>
            </div>
            <Link className="hero-you-go" to="/dashboard">Dashboard</Link>
          </div>
        ) : (
          <p className="hero-session">
            Search any Riot ID — no account needed.
          </p>
        )}

        <Link className="home-promo" to={getAppUrl()}>
          <div className="home-promo-copy">
            <em>Rift App · Windows</em>
            <strong>Win more. Think less.</strong>
            <p>Live overlay, lobby scouting, and clips — while you play.</p>
          </div>
          <span className="btn btn-gold">Get the app</span>
        </Link>
      </section>

      <section className="home-widgets" aria-label="Home">
        <article className="home-widget is-you">
          {session ? (
            <>
              <Link className="home-widget-head" to="/dashboard">
                <span>
                  <em className="home-widget-kicker">You</em>
                  Recent games
                </span>
                <span className="home-widget-head-right"><span aria-hidden="true">›</span></span>
              </Link>
              <div className="home-game home-game-cols muted">
                <span>Result</span>
                <span>Champion</span>
                <span>KDA</span>
              </div>
              {youError ? (
                <div className="home-you-error">
                  <p>{youError}</p>
                  <button type="button" className="hero-chip" onClick={() => setYouTick((n) => n + 1)}>Retry</button>
                </div>
              ) : null}
              {youLoading && !you ? <GameSkeleton count={5} /> : null}
              {!youLoading && !youError && !recent.length ? <div className="home-widget-empty">No recent Solo games.</div> : null}
              {recent.map((g) => (
                <Link key={g.matchId} className={`home-game ${g.win ? 'is-win' : 'is-loss'}`} to="/dashboard">
                  <b>{g.win ? 'W' : 'L'}</b>
                  <span className="home-champ">
                    <img src={champIconUrl(g.champion, dashVersion)} alt="" />
                    <span className="home-champ-text">
                      <strong>{g.champion}</strong>
                      <em>{g.role || '—'} · {g.ago}</em>
                    </span>
                  </span>
                  <span className="mono">{g.kills}/{g.deaths}/{g.assists}</span>
                </Link>
              ))}
              <Link className="home-widget-more" to="/scouting">Scout the next lobby</Link>
            </>
          ) : (
            <div className="home-you-guest">
              <em className="home-widget-kicker">You</em>
              <strong>Your command center</strong>
              <p>Link a Riot ID and this card becomes your games, rank, and next lobby — not another stats dump.</p>
              <div className="home-you-guest-actions">
                <Link className="btn btn-violet" to="/profile">Link profile</Link>
                <Link className="hero-chip" to="/scouting">Scouting</Link>
              </div>
            </div>
          )}
        </article>

        <article className="home-widget is-tier">
          <Link className="home-widget-head" to="/tierlist">
            <span>
              <em className="home-widget-kicker">What to play</em>
              Tier list
            </span>
            <span className="home-widget-head-right">
              {patch ? <em className="home-widget-chip">{patch}</em> : null}
              <span aria-hidden="true">›</span>
            </span>
          </Link>
          <div className="home-widget-cols muted">
            <span>Champion</span>
            <span>Tier</span>
            <span>WR</span>
            <span>PR</span>
          </div>
          {tierLoading && !tierRows.length ? <SkeletonRows count={5} /> : null}
          {!tierLoading && !tierRows.length ? <div className="home-widget-empty">Tier list unavailable.</div> : null}
          {tierRows.map((row) => (
            <Link key={`${row.champion}-${row.role}`} className="home-widget-row" to="/tierlist">
              <span className="home-champ">
                <img src={champIconUrl(row.champion, version)} alt="" />
                <span className="home-champ-text">
                  <strong>{row.champion}</strong>
                  <em>{row.role}</em>
                </span>
              </span>
              <strong style={{ color: tierColor(row.tier) }}>{row.tier}</strong>
              <span className="mono">{Number(row.winrate).toFixed(1)}%</span>
              <span className="mono muted">{Number(row.pickrate).toFixed(1)}%</span>
            </Link>
          ))}
          <Link className="home-widget-more" to="/tierlist">Full tier list</Link>
        </article>

        <article className="home-widget is-ladder">
          <div className="home-widget-head is-static">
            <Link to="/leaderboard?mode=soloq&tier=challenger">
              <em className="home-widget-kicker">Who is climbing</em>
              Leaderboards
            </Link>
            <div className="home-lb-tabs">
              {LB_PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={lbPlatform === p.id ? 'is-on' : ''}
                  onClick={() => setLbPlatform(p.id)}
                >
                  {p.short}
                </button>
              ))}
            </div>
          </div>
          <div className="home-widget-cols home-widget-cols-lb muted">
            <span>#</span>
            <span>Player</span>
            <span>LP</span>
            <span>WR</span>
          </div>
          {lbLoading && !lbRows.length ? <SkeletonRows count={5} variant="home-widget-row-lb" /> : null}
          {!lbLoading && !lbRows.length ? <div className="home-widget-empty">Leaderboards unavailable.</div> : null}
          {lbRows.map((row) => (
            <Link key={row.puuid || row.rank} className="home-widget-row home-widget-row-lb" to="/leaderboard">
              <span className="mono muted">{row.rank}</span>
              <span className="home-champ">
                {row.profileIconId ? (
                  <img src={profileIconUrl(row.profileIconId, version)} alt="" />
                ) : (
                  <span className="home-avatar-fallback">{(row.gameName || '?')[0]}</span>
                )}
                <span className="home-champ-text">
                  <strong>{row.gameName}</strong>
                  <em>#{row.tagLine}</em>
                </span>
              </span>
              <span className="mono home-lp">{Number(row.lp || 0).toLocaleString()}</span>
              <span className="mono muted">{wrOf(row)}%</span>
            </Link>
          ))}
          <Link className="home-widget-more" to="/leaderboard">
            {platformShort(lbPlatform)} leaderboards
          </Link>
        </article>
      </section>

      <p className="home-riot is-end">{RIOT_NOTE}</p>
    </div>
  );
}
