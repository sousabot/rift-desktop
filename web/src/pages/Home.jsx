import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getLeaderboard, getTierList } from '../api';
import { useSession } from '../session';
import {
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
  { src: './meep-wave.svg', className: 'meep meep-5' },
  { src: './meep-curl.svg', className: 'meep meep-6' },
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
  const filtered = all.filter((row) => !row.lowSample && Number(row.lanePct || 0) >= 12);
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

  const platform = session?.platform || 'euw1';

  useEffect(() => { ddragonVersion().then(setVersion); }, []);

  useEffect(() => {
    if (session?.platform && LB_PLATFORMS.some((p) => p.id === session.platform)) {
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
  const popular = useMemo(() => topTierRows(tierData, 3), [tierData]);
  const lbRows = (lbData?.entries || []).slice(0, 5);

  const onSearch = (e) => {
    e.preventDefault();
    const parsed = parseRiotIdInput(query);
    const params = new URLSearchParams();
    if (parsed.gameName) params.set('name', parsed.gameName);
    if (parsed.tagLine) params.set('tag', parsed.tagLine);
    navigate(`/dashboard${params.toString() ? `?${params}` : ''}`);
  };

  return (
    <div className="home">
      <Meeps />

      <section className="home-hero">
        <div className="home-brand" aria-hidden="true">
          <img src="./icon.png" alt="" />
          <span>RIFT.LOL</span>
        </div>

        <form className="home-search" onSubmit={onSearch}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.2-1.4 1.4-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Summoner Name#TAG…"
            autoComplete="off"
            aria-label="Search summoner"
          />
          <kbd>Enter</kbd>
        </form>

        <a className="home-promo" href="../index.html">
          <div className="home-promo-copy">
            <strong>RIFT APP</strong>
            <span>Win more. Think less.</span>
          </div>
          <span className="btn btn-gold btn-sm">Get the desktop app</span>
        </a>

        <p className="home-tagline">League stats for the climb — link your profile, read the meta, watch the ladder.</p>
      </section>

      <section className="home-widgets">
        <article className="home-widget">
          <Link className="home-widget-head" to="/tierlist">
            <span>{tierData?.patch || '—'} Tier list & builds</span>
            <span aria-hidden="true">›</span>
          </Link>
          <div className="home-widget-cols muted">
            <span>Champion</span>
            <span>Tier</span>
            <span>WR</span>
            <span>PR</span>
          </div>
          {tierLoading ? <div className="home-widget-empty">Loading meta…</div> : null}
          {!tierLoading && !tierRows.length ? <div className="home-widget-empty">Tier list unavailable.</div> : null}
          {tierRows.map((row) => (
            <Link key={`${row.champion}-${row.role}`} className="home-widget-row" to="/tierlist">
              <span className="home-champ">
                <img src={champIconUrl(row.champion, version)} alt="" />
                <span>
                  <strong>{row.champion}</strong>
                  <em>{row.role}</em>
                </span>
              </span>
              <strong style={{ color: tierColor(row.tier) }}>{row.tier}</strong>
              <span className="mono">{Number(row.winrate).toFixed(1)}%</span>
              <span className="mono muted">{Number(row.pickrate).toFixed(1)}%</span>
            </Link>
          ))}
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
          {lbLoading ? <div className="home-widget-empty">Loading ladder…</div> : null}
          {!lbLoading && !lbRows.length ? <div className="home-widget-empty">Ladder unavailable.</div> : null}
          {lbRows.map((row) => (
            <Link key={row.puuid || row.rank} className="home-widget-row home-widget-row-lb" to="/leaderboard">
              <span className="mono muted">{row.rank}</span>
              <span className="home-champ">
                {row.profileIconId ? (
                  <img src={profileIconUrl(row.profileIconId, version)} alt="" />
                ) : (
                  <span className="home-avatar-fallback">{(row.gameName || '?')[0]}</span>
                )}
                <span>
                  <strong>{row.gameName}</strong>
                  <em>#{row.tagLine}</em>
                </span>
              </span>
              <span className="mono" style={{ color: 'var(--gold)', fontWeight: 700 }}>{Number(row.lp || 0).toLocaleString()}</span>
              <span className="mono muted">{wrOf(row)}%</span>
            </Link>
          ))}
          <p className="home-widget-foot muted">{platformShort(lbPlatform)} Challenger · live</p>
        </article>
      </section>

      <section className="home-popular">
        <header className="home-popular-head">
          <h2>Most popular champions</h2>
          <p>Explore the best builds, matchups, and meta picks for the live patch.</p>
        </header>
        <div className="home-popular-grid">
          {(popular.length ? popular : [
            { champion: 'Kai\'Sa', role: 'ADC' },
            { champion: 'Caitlyn', role: 'ADC' },
            { champion: 'Jhin', role: 'ADC' },
          ]).map((row) => (
            <Link
              key={row.champion}
              className="popular-card"
              to={`/tierlist/${encodeURIComponent(row.champion)}?role=${encodeURIComponent(row.role || 'Mid')}&rank=master&platform=${encodeURIComponent(platform)}`}
            >
              <img className="popular-card-art" src={champSplashUrl(row.champion)} alt="" />
              <div className="popular-card-fade" />
              <div className="popular-card-copy">
                <strong>{row.champion} ›</strong>
                <span>Discover the best builds for {row.champion}.</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {session ? (
        <p className="home-session muted">
          Linked as <Link to="/profile">{session.gameName}#{session.tagLine}</Link>
          {' · '}
          region defaults use {platformShort(session.platform)}.
        </p>
      ) : null}
    </div>
  );
}
