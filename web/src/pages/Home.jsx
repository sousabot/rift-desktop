import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getLeaderboard, getTierList } from '../api';
import { getAppUrl } from '../getAppUrl';
import { useSession } from '../session';
import {
  REGIONS,
  champIconUrl,
  champSplashUrl,
  ddragonVersion,
  parseRiotIdInput,
  platformShort,
  profileIconUrl,
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

const QUICK_LINKS = [
  { to: '/tierlist', label: 'Tier list' },
  { to: '/leaderboard?mode=soloq&tier=challenger', label: 'Challenger ladder' },
  { to: '/tierlist/aram', label: 'ARAM' },
  { to: '/scouting', label: 'Scouting' },
];

const EXPLORE = [
  {
    to: '/scouting',
    eyebrow: 'Pre-game',
    title: 'Scouting',
    blurb: 'Read every lobby before it starts — ranks, champion pools, and recent form.',
  },
  {
    to: '/data-studio',
    eyebrow: 'Deep stats',
    title: 'Data Studio',
    blurb: 'Slice the meta by rank, region, and patch with charts you can actually read.',
  },
  {
    to: '/esports',
    eyebrow: 'Pro play',
    title: 'Esports',
    blurb: 'Follow pro games, rosters, and what the best players are picking right now.',
  },
];

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

function SkeletonRows({ count = 5, variant = '' }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`home-widget-row is-skeleton ${variant}`} aria-hidden="true">
          <span className="home-champ">
            <span className="sk sk-avatar" />
            <span className="home-champ-text">
              <span className="sk sk-line sk-line-name" />
              <span className="sk sk-line sk-line-sub" />
            </span>
          </span>
          <span className="sk sk-line sk-line-cell" />
          <span className="sk sk-line sk-line-cell" />
          <span className="sk sk-line sk-line-cell" />
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
  const [tierData, setTierData] = useState(null);
  const [lbPlatform, setLbPlatform] = useState(session?.platform || 'euw1');
  const [lbData, setLbData] = useState(null);
  const [tierLoading, setTierLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(true);
  const [searchPlatform, setSearchPlatform] = useState(session?.platform || 'euw1');

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
    setTierLoading(true);
    getTierList({ platform, rank: 'master' })
      .then((payload) => { if (alive) setTierData(payload); })
      .catch(() => { if (alive) setTierData(null); })
      .finally(() => { if (alive) setTierLoading(false); });
    return () => { alive = false; };
  }, [platform]);

  useEffect(() => {
    let alive = true;
    setLbLoading(true);
    getLeaderboard({ tier: 'challenger', platform: lbPlatform })
      .then((payload) => { if (alive) setLbData(payload); })
      .catch(() => { if (alive) setLbData(null); })
      .finally(() => { if (alive) setLbLoading(false); });
    return () => { alive = false; };
  }, [lbPlatform]);

  const tierRows = useMemo(() => topTierRows(tierData, 5), [tierData]);
  const popular = useMemo(() => topTierRows(tierData, 4), [tierData]);
  const lbRows = (lbData?.entries || []).slice(0, 5);
  const patch = tierData?.patch || '';

  const onSearch = (e) => {
    e.preventDefault();
    const parsed = parseRiotIdInput(query);
    if (!parsed.gameName) return;
    const params = new URLSearchParams();
    params.set('name', parsed.gameName);
    if (parsed.tagLine) params.set('tag', parsed.tagLine);
    if (searchPlatform) params.set('platform', searchPlatform);
    navigate(`/dashboard?${params}`);
  };

  return (
    <div className="home">
      <Meeps />

      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />

        <span className="hero-badge">
          <i aria-hidden="true" />
          {patch ? `Patch ${patch} · live data` : 'Live League data'}
        </span>

        <h1 className="hero-title">
          Win more.
          <span className="hero-title-accent">Think less.</span>
        </h1>

        <p className="hero-sub">
          Tier lists, builds, ladders and pre-game scouting for League of Legends.
          Search any Riot ID — no account needed.
        </p>

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

        <div className="hero-quick">
          <span className="hero-quick-label">Jump to</span>
          {QUICK_LINKS.map((l) => (
            <Link key={l.to} className="hero-chip" to={l.to}>{l.label}</Link>
          ))}
        </div>

        {session ? (
          <p className="hero-session">
            Linked as <Link to="/dashboard">{session.gameName}#{session.tagLine}</Link>
            {' · '}defaults to {platformShort(session.platform)}
          </p>
        ) : null}
      </section>

      <section className="home-widgets">
        <article className="home-widget">
          <Link className="home-widget-head" to="/tierlist">
            <span>Tier list &amp; builds</span>
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
          {tierLoading ? <SkeletonRows count={5} /> : null}
          {!tierLoading && !tierRows.length ? <div className="home-widget-empty">Tier list unavailable.</div> : null}
          {!tierLoading && tierRows.map((row) => (
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
          <Link className="home-widget-more" to="/tierlist">See full tier list</Link>
        </article>

        <article className="home-widget">
          <div className="home-widget-head is-static">
            <Link to="/leaderboard">Challenger ladder</Link>
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
          {lbLoading ? <SkeletonRows count={5} variant="home-widget-row-lb" /> : null}
          {!lbLoading && !lbRows.length ? <div className="home-widget-empty">Ladder unavailable.</div> : null}
          {!lbLoading && lbRows.map((row) => (
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
            {platformShort(lbPlatform)} full ladder
          </Link>
        </article>
      </section>

      <section className="home-popular">
        <header className="home-section-head">
          <div>
            <h2>Most popular champions</h2>
            <p>Best builds, matchups, and meta picks on the live patch.</p>
          </div>
          <Link className="home-section-link" to="/tierlist">All champions ›</Link>
        </header>
        <div className="home-popular-grid">
          {(popular.length ? popular : [
            { champion: 'Kai\'Sa', role: 'ADC' },
            { champion: 'Caitlyn', role: 'ADC' },
            { champion: 'Jhin', role: 'ADC' },
            { champion: 'Ahri', role: 'Mid' },
          ]).map((row) => (
            <Link
              key={row.champion}
              className="popular-card"
              to={`/tierlist/${encodeURIComponent(row.champion)}?role=${encodeURIComponent(row.role || 'Mid')}&rank=master&platform=${encodeURIComponent(platform)}`}
            >
              <img className="popular-card-art" src={champSplashUrl(row.champion)} alt="" loading="lazy" />
              <div className="popular-card-fade" />
              <div className="popular-card-copy">
                <em className="popular-card-role">{row.role || 'Mid'}</em>
                <strong>{row.champion}</strong>
                <span>Builds, runes &amp; counters ›</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-explore">
        <div className="home-explore-grid">
          {EXPLORE.map((card) => (
            <Link key={card.to} className="explore-card" to={card.to}>
              <em>{card.eyebrow}</em>
              <strong>{card.title}</strong>
              <p>{card.blurb}</p>
              <span className="explore-card-go" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>

        <Link className="home-app-cta" to={getAppUrl()}>
          <div className="home-app-cta-copy">
            <em>Rift App · Windows</em>
            <strong>Get the desktop app</strong>
            <p>Live overlays, match scouting, replay clips, and TFT comps while you play.</p>
          </div>
          <span className="btn btn-gold">Download free</span>
        </Link>
      </section>
    </div>
  );
}
