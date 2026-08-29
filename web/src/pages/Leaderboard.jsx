import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getLeaderboard, getOtps } from '../api';
import { useSession } from '../session';
import {
  REGIONS,
  champIconUrl,
  ddragonVersion,
  getRuneIndex,
  itemIconUrl,
  platformShort,
  profileIconUrl,
  runeIconUrl,
  timeAgo,
} from '../lib';
import './Leaderboard.css';

const MODES = [
  { id: 'soloq', label: 'SoloQ', blurb: 'Ranked Solo/Duo ladder' },
  { id: 'flex', label: 'Flex', blurb: 'Ranked Flex ladder' },
  { id: 'otps', label: 'OTPs', blurb: 'One-tricks ranked by SoloQ LP' },
  { id: 'aram', label: 'ARAM', blurb: 'Howling Abyss ladder' },
];

const TIERS = [
  { id: 'challenger', label: 'Challenger', color: '#ffd76b' },
  { id: 'grandmaster', label: 'Grandmaster', color: '#ff5c68' },
  { id: 'master', label: 'Master', color: '#a06bff' },
];

const OTP_LANES = [
  { id: 'all', label: 'All' },
  { id: 'top', label: 'Top' },
  { id: 'jungle', label: 'Jungle' },
  { id: 'middle', label: 'Mid' },
  { id: 'bottom', label: 'ADC' },
  { id: 'utility', label: 'Support' },
];

function isKeyError(message) {
  return /invalid or expired|unknown apikey|unauthorized/i.test(String(message || ''));
}

function EmptyLadder({ title, body, children }) {
  return (
    <section className="lb-empty">
      <div className="lb-empty-copy">
        <h2>{title}</h2>
        <p>{body}</p>
        {children}
      </div>
    </section>
  );
}

function wrOf(row) {
  return Math.round((row.wins / Math.max(1, (row.wins || 0) + (row.losses || 0))) * 100);
}

function wrTone(wr) {
  if (wr >= 60) return 'is-hot';
  if (wr >= 53) return 'is-good';
  if (wr >= 48) return 'is-mid';
  return 'is-bad';
}

/** Riot's league flags, as short badges. Decay is the one that changes how you read a row. */
const FLAGS = [
  { key: 'inactive', label: 'Decay', title: 'Flagged inactive — losing LP to decay', cls: 'is-decay' },
  { key: 'hotStreak', label: 'Streak', title: 'On a win streak', cls: 'is-streak' },
  { key: 'freshBlood', label: 'New', title: 'Recently promoted into this tier', cls: 'is-fresh' },
  { key: 'veteran', label: 'Vet', title: '100+ games in this tier', cls: 'is-vet' },
];

function Flags({ row }) {
  const on = FLAGS.filter((f) => row[f.key]);
  if (!on.length) return null;
  return (
    <span className="lb-flags">
      {on.map((f) => (
        <em key={f.key} className={`lb-flag ${f.cls}`} title={f.title}>{f.label}</em>
      ))}
    </span>
  );
}

/** Avatar that always occupies its slot, so a missing icon can't collapse the row. */
function Avatar({ row, version, size = 36 }) {
  const src = row.profileIconId ? profileIconUrl(row.profileIconId, version) : '';
  return (
    <span className="lb-avatar" style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt="" width={size} height={size} loading="lazy" />
        : <b>{String(row.gameName || '?').charAt(0).toUpperCase()}</b>}
    </span>
  );
}

/** Wins/losses as a single split bar — reads faster than "1108W – 915L". */
function WlBar({ wins, losses }) {
  const total = Math.max(1, (wins || 0) + (losses || 0));
  const wr = Math.round(((wins || 0) / total) * 100);
  return (
    <div className={`lb-wl ${wrTone(wr)}`}>
      <span className="lb-wl-val">{wr}%</span>
      <span className="lb-wl-bar" title={`${wins}W – ${losses}L of ${total} games`}>
        <i style={{ width: `${wr}%` }} />
      </span>
      <span className="lb-wl-split">{wins}W <em>–</em> {losses}L</span>
    </div>
  );
}

function profilePath(row, fallbackPlatform = '') {
  const name = String(row?.gameName || '').trim();
  const tag = String(row?.tagLine || '').trim();
  if (!name || !tag) return null;
  const q = new URLSearchParams({ name, tag });
  const plat = String(row?.platform || fallbackPlatform || '').trim().toLowerCase();
  if (plat && plat !== 'all') q.set('platform', plat);
  return `/dashboard?${q.toString()}`;
}

function champSrc(row, version) {
  return row.championKey
    ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${row.championKey}.png`
    : champIconUrl(row.champion, version);
}

function BuildIcons({ row, version, runeIndex }) {
  return (
    <div className="lb-otp-build" aria-hidden="true">
      {row.primaryRuneId ? (
        <img className="is-rune" src={runeIconUrl(row.primaryRuneId, runeIndex)} alt="" />
      ) : null}
      {row.secondaryRuneId ? (
        <img className="is-rune is-sub" src={runeIconUrl(row.secondaryRuneId, runeIndex)} alt="" />
      ) : null}
      {(row.items || []).slice(0, 2).map((id) => (
        <img key={id} className="is-item" src={itemIconUrl(id, version)} alt="" />
      ))}
    </div>
  );
}

function OtpPlayer({ row }) {
  return (
    <div className="lb-otp-player">
      <div className="lb-otp-player-name">{row.displayName || row.gameName}</div>
      <div className="lb-otp-player-id">
        {row.gameName}#{row.tagLine}
        {row.platform ? ` · ${platformShort(row.platform)}` : ''}
      </div>
    </div>
  );
}

function OtpChamp({ row, version, size = 28 }) {
  return (
    <div className="lb-otp-champ">
      <img src={champSrc(row, version)} alt="" width={size} height={size} />
      <div>
        <strong>{row.champion}</strong>
        <span>{row.playRate}%</span>
      </div>
    </div>
  );
}

function OtpPodiumCard({ row, version, runeIndex, place }) {
  const href = profilePath(row);
  const top = (
    <div className="lb-otp-card-top">
      {row.profileIconId ? (
        <img
          className="lb-otp-card-avatar"
          src={profileIconUrl(row.profileIconId, version)}
          alt=""
        />
      ) : null}
      <OtpPlayer row={row} />
    </div>
  );

  return (
    <article className={`lb-otp-card is-place-${place}`}>
      <div className="lb-otp-card-place">#{row.rank}</div>
      {href ? (
        <Link className="lb-profile-link" to={href}>{top}</Link>
      ) : top}
      <div className="lb-otp-card-lp">{row.lp.toLocaleString()} <em>LP</em></div>
      <div className="lb-otp-card-champ">
        <img src={champSrc(row, version)} alt="" />
        <div>
          <strong>{row.champion}</strong>
          <span>{row.playRate}% play rate</span>
        </div>
      </div>
      <div className="lb-otp-card-stats">
        <span><b>{row.kda}</b> KDA</span>
        <span><b>{row.winrate}%</b> WR</span>
        <span><b>{row.games}</b> games</span>
      </div>
      <BuildIcons row={row} version={version} runeIndex={runeIndex} />
    </article>
  );
}

export default function Leaderboard() {
  const { session } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const tierParam = searchParams.get('tier');
  const laneParam = searchParams.get('lane');
  const [mode, setMode] = useState(() => (
    MODES.some((m) => m.id === modeParam) ? modeParam : 'soloq'
  ));
  const [tier, setTier] = useState(() => (
    TIERS.some((t) => t.id === tierParam) ? tierParam : 'challenger'
  ));
  const [lane, setLane] = useState(() => (
    OTP_LANES.some((l) => l.id === laneParam) ? laneParam : 'all'
  ));
  const [platform, setPlatform] = useState(() => (
    modeParam === 'otps' ? (searchParams.get('platform') || 'all') : (session?.platform || 'euw1')
  ));
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [version, setVersion] = useState('16.16.1');
  const [runeIndex, setRuneIndex] = useState({});

  useEffect(() => {
    ddragonVersion().then(setVersion);
    getRuneIndex().then(setRuneIndex);
  }, []);

  useEffect(() => {
    if (MODES.some((m) => m.id === modeParam)) setMode(modeParam);
  }, [modeParam]);

  useEffect(() => {
    if (TIERS.some((t) => t.id === tierParam)) setTier(tierParam);
  }, [tierParam]);

  useEffect(() => {
    if (OTP_LANES.some((l) => l.id === laneParam)) setLane(laneParam);
  }, [laneParam]);

  useEffect(() => {
    if (mode === 'otps') return;
    if (session?.platform) setPlatform(session.platform);
  }, [session?.platform, mode]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const req = mode === 'otps'
      ? getOtps({ platform, lane, all: true })
      : getLeaderboard({ tier, platform: platform === 'all' ? 'euw1' : platform, mode });

    req
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        if (payload?.ddragonVersion) setVersion(payload.ddragonVersion);
        if (payload?.roadmap) setError('');
        else if (payload?.ok === false) setError(payload.error || 'Leaderboard failed');
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || 'Leaderboard failed');
          setData(null);
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tier, platform, mode, lane, retryTick]);

  const patchParams = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  };

  const pickMode = (id) => {
    setMode(id);
    setQuery('');
    setError('');
    setLoading(true);
    if (id === 'otps') {
      setPlatform((prev) => (prev === 'euw1' && !searchParams.get('platform') ? 'all' : prev));
      patchParams({ mode: id, tier: null, lane, platform: platform === 'euw1' ? 'all' : platform });
      return;
    }
    if (id === 'aram') {
      patchParams({ mode: id, tier: null, lane: null });
      return;
    }
    const nextPlatform = platform === 'all' ? (session?.platform || 'euw1') : platform;
    setPlatform(nextPlatform);
    patchParams({ mode: id, tier, lane: null, platform: nextPlatform });
  };

  const pickTier = (id) => {
    setTier(id);
    setError('');
    setLoading(true);
    patchParams({ mode, tier: id });
  };

  const pickLane = (id) => {
    setLane(id);
    patchParams({ mode, lane: id === 'all' ? null : id, platform });
  };

  const isAram = mode === 'aram';
  const isOtps = mode === 'otps';
  const updated = timeAgo(data?.builtAt);
  const modeMeta = MODES.find((m) => m.id === mode) || MODES[0];
  const tone = isOtps ? '#ffd76b' : (TIERS.find((t) => t.id === tier)?.color || '#ffd76b');

  const entries = useMemo(() => {
    const raw = data?.entries || [];
    const q = query.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((row) => (
      String(row.champion || '').toLowerCase().includes(q)
      || String(row.displayName || '').toLowerCase().includes(q)
      || String(row.gameName || '').toLowerCase().includes(q)
      || `${row.gameName || ''}#${row.tagLine || ''}`.toLowerCase().includes(q)
    ));
  }, [data, query]);

  // While searching, a "podium" of arbitrary matches is meaningless — list them all instead.
  const searching = query.trim().length > 0;
  const podium = searching ? [] : entries.slice(0, 3);
  const rest = searching ? entries : entries.slice(3);
  const rankedReady = !isAram && !loading && !error && entries.length > 0;
  // Classic podium order: 2nd · 1st · 3rd
  const reorder = (list) => (list.length === 3 ? [list[1], list[0], list[2]] : list);
  const otpPodiumOrder = reorder(podium);
  const rankedPodiumOrder = reorder(podium);
  // Scaled across the visible LP spread, not from zero — at this level every LP
  // value is huge, so a zero-based bar would make all 50 rows look identical.
  const lpRange = useMemo(() => {
    if (!entries.length) return { min: 0, span: 1 };
    const values = entries.map((r) => r.lp || 0);
    const min = Math.min(...values);
    return { min, span: Math.max(1, Math.max(...values) - min) };
  }, [entries]);

  return (
    <div className="lb-page">
      <nav className="lb-mode-nav" aria-label="Leaderboard modes">
        {MODES.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`lb-mode-link${mode === row.id ? ' is-on' : ''}`}
            onClick={() => pickMode(row.id)}
          >
            {row.label}
          </button>
        ))}
      </nav>

      <header className="lb-hero">
        <div className="lb-hero-copy">
          <p className="lb-kicker">Leaderboards</p>
          <h1>{isOtps ? 'Leaderboard OTPs' : modeMeta.label}</h1>
          <p>
            {isAram
              ? 'ARAM player ladder is coming. Champion grades for Howling Abyss are live now.'
              : isOtps
                ? 'Same champion more than 50% of games, at least 10 games on that champ. Ranked by SoloQ LP.'
                : `${modeMeta.blurb} for ${platformShort(platform)}. Badges flag win streaks, fresh promotions and LP decay.`}
          </p>
        </div>
        {!isAram ? (
          <div className="lb-hero-meta">
            <div className="lb-stat">
              <em>{isOtps ? 'OTPs shown' : 'Players shown'}</em>
              <strong>{loading || error ? '—' : entries.length}</strong>
              {!isOtps && data?.totalEntries ? (
                <span>of {Number(data.totalEntries).toLocaleString()} in tier</span>
              ) : null}
              {updated ? <span>Updated {updated}</span> : null}
            </div>
            {!isOtps && data?.cutoffLp != null ? (
              <div className="lb-stat">
                <em>Tier cutoff</em>
                <strong>{Number(data.cutoffLp).toLocaleString()} <small>LP</small></strong>
                <span>lowest {tier} player</span>
              </div>
            ) : null}
            <div className="lb-stat is-soft">
              <em>{isOtps ? 'Filter' : 'Queue'}</em>
              <strong>
                {isOtps
                  ? (OTP_LANES.find((l) => l.id === lane)?.label || 'All')
                  : (mode === 'flex' ? 'Flex' : 'Solo/Duo')}
              </strong>
              <span>
                {isOtps
                  ? (platform === 'all' ? 'All regions' : platformShort(platform))
                  : tier.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        ) : null}
      </header>

      {isOtps ? (
        <div className="lb-tools lb-otp-tools">
          <div className="lb-tiers" role="group" aria-label="Lane filter">
            {OTP_LANES.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`lb-tier-chip${lane === row.id ? ' is-on' : ''}`}
                onClick={() => pickLane(row.id)}
              >
                {row.label}
              </button>
            ))}
          </div>
          <input
            className="lb-search"
            type="search"
            placeholder="Search champion…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search champion"
          />
          <select
            value={platform}
            onChange={(e) => {
              const next = e.target.value;
              setPlatform(next);
              patchParams({ mode, lane: lane === 'all' ? null : lane, platform: next });
            }}
            aria-label="Region"
          >
            <option value="all">All regions</option>
            {REGIONS.map((r) => <option key={r.platform} value={r.platform}>{r.short}</option>)}
          </select>
        </div>
      ) : null}

      {!isAram && !isOtps ? (
        <div className="lb-tools">
          <div className="lb-tiers" role="group" aria-label="Ladder tier">
            {TIERS.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`lb-tier-chip${tier === row.id ? ' is-on' : ''}`}
                onClick={() => pickTier(row.id)}
                style={tier === row.id ? { borderColor: row.color, color: '#fff' } : undefined}
              >
                {row.label}
              </button>
            ))}
          </div>
          <input
            className="lb-search"
            type="search"
            placeholder="Search player…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search player"
          />
          <select
            value={platform === 'all' ? 'euw1' : platform}
            onChange={(e) => setPlatform(e.target.value)}
            aria-label="Region"
          >
            {REGIONS.map((r) => <option key={r.platform} value={r.platform}>{r.short}</option>)}
          </select>
        </div>
      ) : null}

      {loading && !isAram ? (
        <>
          <div className="lb-podium">
            {[1, 2, 3].map((i) => <div key={i} className={`lb-podium-card is-skel is-place-${i}`} />)}
          </div>
          <div className="lb-table card">
            {Array.from({ length: 10 }, (_, i) => (
              <div className="lb-row is-skel" key={i}>
                <span className="lb-skel lb-row-rank" />
                <span className="lb-row-id">
                  <span className="lb-skel is-avatar" />
                  <span className="lb-skel" style={{ width: `${40 + ((i * 17) % 45)}%` }} />
                </span>
                <span className="lb-skel" />
                <span className="lb-skel" />
                <span className="lb-skel" />
              </div>
            ))}
          </div>
        </>
      ) : null}
      {loading && isAram ? <div className="note">Loading ladder…</div> : null}
      {error && !data?.roadmap && !loading ? (
        <EmptyLadder
          title={`Couldn't load ${modeMeta.label}`}
          body={isKeyError(error)
            ? 'The ranked ladder is temporarily unavailable. Retry in a moment.'
            : error}
        >
          <div className="lb-empty-actions">
            <button type="button" className="lb-empty-btn" onClick={() => setRetryTick((n) => n + 1)}>Retry</button>
            {mode === 'flex' ? (
              <button type="button" className="lb-empty-btn is-ghost" onClick={() => pickMode('soloq')}>Open SoloQ</button>
            ) : null}
          </div>
        </EmptyLadder>
      ) : null}

      {!loading && !error && !isAram && !entries.length ? (
        <EmptyLadder
          title={searching ? 'No matching players' : `No ${tier} ${modeMeta.label} players`}
          body={searching
            ? `Nothing matches “${query.trim()}” on this ladder.`
            : `Nothing in ${platformShort(platform)} for this queue right now. Try another tier or region.`}
        />
      ) : null}

      {isAram && !loading ? (
        <section className="lb-roadmap">
          <div className="lb-roadmap-copy">
            <h2>ARAM ladder</h2>
            <p>
              Riot does not publish an official ARAM ladder yet. We are wiring estimated standings next.
              Until then, use the live ARAM champion tier list.
            </p>
            <Link className="lb-roadmap-btn" to="/tierlist/aram">Open ARAM tier list</Link>
          </div>
        </section>
      ) : null}

      {rankedReady && isOtps && podium.length ? (
        <div className="lb-otp-podium">
          {otpPodiumOrder.map((row) => (
            <OtpPodiumCard
              key={row.puuid || row.rank}
              row={row}
              version={version}
              runeIndex={runeIndex}
              place={row.rank}
            />
          ))}
        </div>
      ) : null}

      {rankedReady && !isOtps && podium.length ? (
        <div className="lb-podium">
          {rankedPodiumOrder.map((row) => {
            const href = profilePath(row, platform === 'all' ? 'euw1' : platform);
            const games = (row.wins || 0) + (row.losses || 0);
            const body = (
              <>
                <div className="lb-podium-badge">
                  <span className="lb-podium-rank">#{row.rank}</span>
                  <Flags row={row} />
                </div>
                <Avatar row={row} version={version} size={row.rank === 1 ? 64 : 54} />
                <div className="lb-podium-id">
                  <strong>{row.gameName}</strong>
                  {row.tagLine ? <span>#{row.tagLine}</span> : null}
                </div>
                <div className="lb-podium-lp">
                  {row.lp.toLocaleString()} <em>LP</em>
                </div>
                <div className="lb-podium-foot">
                  <span className={`lb-podium-wr ${wrTone(wrOf(row))}`}>{wrOf(row)}% WR</span>
                  <span>{games.toLocaleString()} games</span>
                </div>
              </>
            );
            const cls = `lb-podium-card is-place-${row.rank}${href ? ' lb-profile-link' : ''}`;
            return href ? (
              <Link key={row.puuid || row.rank} className={cls} to={href}>{body}</Link>
            ) : (
              <div key={row.puuid || row.rank} className={cls}>{body}</div>
            );
          })}
        </div>
      ) : null}

      {rankedReady ? (
        <div className={`lb-table card${isOtps ? ' is-otp' : ''}`}>
          {isOtps && rest.length ? (
            <div className="lb-otp-head" aria-hidden="true">
              <span>#</span>
              <span>Player</span>
              <span>LP</span>
              <span>Champion</span>
              <span>Build</span>
              <span>Games</span>
              <span>KDA</span>
              <span>WR</span>
            </div>
          ) : null}
          {!isOtps && rest.length ? (
            <div className="lb-row-head" aria-hidden="true">
              <span>#</span>
              <span>Player</span>
              <span>League points</span>
              <span>Win rate</span>
              <span>Games</span>
            </div>
          ) : null}
          {isOtps ? rest.map((row) => {
            const href = profilePath(row);
            const identity = (
              <div className="lb-otp-identity">
                {row.profileIconId ? (
                  <img src={profileIconUrl(row.profileIconId, version)} alt="" width={36} height={36} />
                ) : <span className="lb-otp-avatar-gap" />}
                <OtpPlayer row={row} />
              </div>
            );
            return (
              <div key={row.puuid || row.rank} className="lb-otp-row">
                <span className="lb-otp-rank mono">{row.rank}</span>
                {href ? (
                  <Link className="lb-profile-link" to={href}>{identity}</Link>
                ) : identity}
                <div className="lb-otp-lp mono">{row.lp.toLocaleString()} <em>LP</em></div>
                <OtpChamp row={row} version={version} />
                <BuildIcons row={row} version={version} runeIndex={runeIndex} />
                <span className="lb-otp-metric mono is-games">{row.games}</span>
                <span className="lb-otp-metric mono is-kda">{row.kda}</span>
                <span className="lb-otp-metric mono is-wr">{row.winrate}%</span>
              </div>
            );
          }) : rest.map((row) => {
            const href = profilePath(row, platform === 'all' ? 'euw1' : platform);
            const games = (row.wins || 0) + (row.losses || 0);
            const body = (
              <>
                <span className="lb-row-rank">{row.rank}</span>
                <span className="lb-row-id">
                  <Avatar row={row} version={version} size={34} />
                  <span className="lb-row-name">
                    <strong>{row.gameName}</strong>
                    {row.tagLine ? <span>#{row.tagLine}</span> : null}
                  </span>
                  <Flags row={row} />
                </span>
                <span className="lb-row-lp">
                  <b style={{ color: tone }}>{row.lp.toLocaleString()}</b>
                  <span className="lb-row-lp-bar">
                    <i
                      style={{
                        width: `${Math.max(4, Math.round((((row.lp || 0) - lpRange.min) / lpRange.span) * 100))}%`,
                        background: tone,
                      }}
                    />
                  </span>
                </span>
                <WlBar wins={row.wins} losses={row.losses} />
                <span className="lb-row-games">{games.toLocaleString()}</span>
              </>
            );
            return href ? (
              <Link key={row.puuid || row.rank} className="lb-row lb-profile-link" to={href}>{body}</Link>
            ) : (
              <div key={row.puuid || row.rank} className="lb-row">{body}</div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
