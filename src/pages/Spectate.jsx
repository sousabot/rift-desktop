import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { typicalLane } from '../lib/champLane';
import { playerSearchPath } from '../lib/playerRoute';
import { apiUserMessage } from '../lib/apiNotice';
import { champDdragonId, champLoadingUrl } from '../services/ddragon';
import { useI18n } from '../i18n/LocaleContext';
import { fmtClock, spectateWaitSec } from '../lib/spectateDelay';
import './Spectate.css';

const api = typeof window !== 'undefined' ? window.spectateAPI : null;

const REGIONS = [
  { id: 'all', label: 'All', platforms: 'euw1,kr,na1' },
  { id: 'euw1', label: 'EUW', platforms: 'euw1' },
  { id: 'kr', label: 'KR', platforms: 'kr' },
  { id: 'na1', label: 'NA', platforms: 'na1' },
  { id: 'eun1', label: 'EUNE', platforms: 'eun1' },
  { id: 'br1', label: 'BR', platforms: 'br1' },
  { id: 'jp1', label: 'JP', platforms: 'jp1' },
];

const LANES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const SPLASH_ALIAS = {
  Wukong: 'MonkeyKing',
  'Nunu & Willump': 'Nunu',
  'Renata Glasc': 'Renata',
  'Bel\'Veth': 'Belveth',
};

function splashUrl(name) {
  const id = SPLASH_ALIAS[name] || champDdragonId(name);
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;
}
const TIER_RANK = { CHALLENGER: 3, GRANDMASTER: 2, MASTER: 1 };

function fmtElapsed(seconds = 0) {
  const n = Math.max(0, Math.floor(seconds));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function orderTeam(players = []) {
  const pool = [...players];
  const out = [];
  for (const lane of LANES) {
    const i = pool.findIndex((p) => typicalLane(p.champion) === lane);
    if (i >= 0) out.push(pool.splice(i, 1)[0]);
  }
  return [...out, ...pool];
}

function gameSeconds(game, now) {
  if (game.gameStartTime) return Math.max(0, Math.floor((now - game.gameStartTime) / 1000));
  return 0;
}

function gameSearchText(game) {
  return [
    game.regionLabel,
    game.queueName,
    game.rank?.label,
    ...(game.players || []).flatMap((p) => [p.champion, p.gameName, p.riotId, p.pro?.player, p.pro?.team, p.pro?.short]),
  ].join(' ').toLowerCase();
}

export default function Spectate() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [region, setRegion] = useState('all');
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('');
  const [sort, setSort] = useState('relevant');
  const [payload, setPayload] = useState({ games: [], scanning: false });
  const [error, setError] = useState('');
  const [launching, setLaunching] = useState('');
  const [launchErr, setLaunchErr] = useState('');
  const [launchNote, setLaunchNote] = useState('');
  const [now, setNow] = useState(Date.now());

  const platforms = REGIONS.find((r) => r.id === region)?.platforms || 'euw1,kr,na1';

  const loadSeq = useRef(0);

  async function load(force = false) {
    if (!api) {
      setError(t('spectate.needApp'));
      return;
    }
    const seq = ++loadSeq.current;
    setError('');
    setPayload((prev) => ({ ...prev, scanning: true }));
    try {
      const data = await api.list({ platforms, force });
      if (seq !== loadSeq.current) return;
      setPayload(data || { games: [] });
      if (data?.error) setError(apiUserMessage({ message: data.error }) || data.error);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setPayload((prev) => ({ ...prev, scanning: false }));
      setError(apiUserMessage(err) || err.message || 'Could not load live games.');
    }
  }

  useEffect(() => {
    load(false);
    return () => { loadSeq.current += 1; };
  }, [platforms]);

  useEffect(() => {
    if (!payload.scanning) return undefined;
    const t = setInterval(() => load(false), 4000);
    return () => clearInterval(t);
  }, [payload.scanning, platforms]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const teams = useMemo(() => {
    const set = new Set();
    (payload.games || []).forEach((g) => {
      (g.players || []).forEach((p) => { if (p.pro?.team) set.add(p.pro.team); });
    });
    return [...set].sort();
  }, [payload.games]);

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = (payload.games || []).filter((g) => {
      if (q && !gameSearchText(g).includes(q)) return false;
      if (team && !(g.players || []).some((p) => p.pro?.team === team)) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'recent') return (b.gameStartTime || 0) - (a.gameStartTime || 0);
      const pro = (b.proCount || 0) - (a.proCount || 0);
      if (pro) return pro;
      const tier = (TIER_RANK[b.rank?.tier] || 0) - (TIER_RANK[a.rank?.tier] || 0);
      if (tier) return tier;
      return (b.rank?.lp || 0) - (a.rank?.lp || 0);
    });
    return rows;
  }, [payload.games, query, team, sort]);

  async function spectateGame(game) {
    if (!api) return;
    const wait = spectateWaitSec(game.gameStartTime);
    if (wait > 0) {
      setLaunchErr(t('spectate.waitDelay', { time: fmtClock(wait) }));
      return;
    }
    const id = `${game.platformId}:${game.gameId}`;
    setLaunching(id);
    setLaunchErr('');
    setLaunchNote('');
    try {
      const result = await api.launch({
        gameId: game.gameId,
        platformId: game.platformId,
        gameStartTime: game.gameStartTime,
        puuid: game.players?.find((p) => p.puuid)?.puuid || '',
      });
      if (!result?.ok) setLaunchErr(result?.error || t('spectate.fail'));
      else setLaunchNote(t('spectate.connecting'));
    } catch (err) {
      setLaunchErr(err.message || t('spectate.fail'));
    } finally {
      setLaunching('');
    }
  }

  function openPlayer(player) {
    if (!player?.gameName || !player?.tagLine) return;
    navigate(playerSearchPath(`${player.gameName}#${player.tagLine}`));
  }

  return (
    <div className="sp-page">
      <header className="sp-head">
        <div>
          <h1>{t('spectate.title')}</h1>
          <p>{t('spectate.blurb')}</p>
        </div>
        <button type="button" className="sp-refresh" onClick={() => load(true)} disabled={payload.scanning}>
          {payload.scanning ? t('spectate.scanning') : t('spectate.refresh')}
        </button>
      </header>

      <div className="sp-note">
        {t('spectate.note')}
      </div>
      {launchErr && <div className="sp-error">{launchErr}</div>}
      {launchNote && !launchErr && <div className="sp-note">{launchNote}</div>}

      <div className="sp-toolbar">
        <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label={t('spectate.region')}>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t('spectate.team')}>
          <option value="">{t('spectate.allTeams')}</option>
          {teams.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('spectate.search')}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('spectate.sort')}>
          <option value="relevant">{t('spectate.relevant')}</option>
          <option value="recent">{t('spectate.newest')}</option>
        </select>
      </div>

      {launchErr && <div className="sp-error">{launchErr}</div>}
      {error && <div className="sp-error">{error}</div>}
      {payload.limited && (
        <div className="sp-error">{t('spectate.limited')}</div>
      )}
      {payload.scanning && games.length > 0 && (
        <div className="sp-muted">{t('spectate.still', { n: games.length, games: games.length === 1 ? t('spectate.game') : t('spectate.games') })}</div>
      )}
      {payload.note && !payload.limited && <div className="sp-muted">{payload.note}</div>}

      {!api && (
        <div className="sp-empty">
          <h2>{t('spectate.needAppTitle')}</h2>
          <p>{t('spectate.needApp')}</p>
        </div>
      )}

      {api && !games.length && (
        <div className="sp-empty">
          <h2>{payload.scanning ? t('spectate.looking') : t('spectate.none')}</h2>
          <p>
            {payload.scanning
              ? t('spectate.looking')
              : t('spectate.noneBody')}
          </p>
        </div>
      )}

      <div className="sp-list">
        {games.map((game) => {
          const id = `${game.platformId}:${game.gameId}`;
          const wait = spectateWaitSec(game.gameStartTime, now);
          const blue = orderTeam((game.players || []).filter((p) => p.teamId === 100));
          const red = orderTeam((game.players || []).filter((p) => p.teamId === 200));
          return (
            <article key={id} className="sp-game">
              <div className="sp-meta">
                <div className="sp-live">
                  <span className="sp-dot" aria-hidden="true" />
                  <span className="sp-time">{fmtElapsed(gameSeconds(game, now))}</span>
                  <span className="sp-region">{game.regionLabel}</span>
                </div>
                {game.rank?.tier ? (
                  <div className="sp-rankblock">
                    <span className="sp-avg">{game.rank.approx ? 'Average' : 'Rank'}</span>
                    <strong>{game.rank.tier}</strong>
                    {game.rank.lp != null && <span className="sp-lp">{game.rank.lp} LP</span>}
                  </div>
                ) : (
                  <div className="sp-rankblock">
                    <span className="sp-avg">{game.queueName}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="sp-watch"
                  disabled={launching === id || wait > 0}
                  title={wait > 0 ? t('spectate.waitDelay', { time: fmtClock(wait) }) : undefined}
                  onClick={() => spectateGame(game)}
                >
                  {launching === id
                    ? t('spectate.starting')
                    : wait > 0
                      ? t('spectate.wait', { time: fmtClock(wait) })
                      : t('spectate.watch')}
                </button>
              </div>
              <div className="sp-lineup">
                <TeamRow players={blue} onOpen={openPlayer} />
                <div className="sp-vs" aria-hidden="true">
                  <i />
                  <i />
                  <span>VS</span>
                  <i />
                  <i />
                </div>
                <TeamRow players={red} onOpen={openPlayer} red />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ChampSlice({ name }) {
  const [src, setSrc] = useState(() => splashUrl(name));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSrc(splashUrl(name));
    setFailed(false);
  }, [name]);
  if (failed) return <div className="sp-slice-art sp-slice-art--empty" aria-hidden />;
  return (
    <img
      className="sp-slice-art"
      src={src}
      alt=""
      onError={() => {
        const fallback = champLoadingUrl(name);
        if (src === fallback) setFailed(true);
        else setSrc(fallback);
      }}
    />
  );
}

function TeamMark({ org, size = 14 }) {
  const [failed, setFailed] = useState(!org?.logo);
  useEffect(() => { setFailed(!org?.logo); }, [org?.logo]);
  if (!org?.logo || failed) return null;
  return (
    <img
      src={org.logo}
      alt={org.short || org.team || ''}
      className="sp-team-logo"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

function TeamRow({ players, onOpen, red }) {
  return (
    <div className={`sp-team${red ? ' is-red' : ''}`}>
      {players.map((p, i) => {
        const org = p.pro
          ? { team: p.pro.team, short: p.pro.short || p.pro.team, logo: p.pro.logo || '' }
          : null;
        const label = org
          ? `${org.short || org.team} · ${p.pro.player || p.gameName}`
          : (p.riotId || p.gameName);
        return (
          <button
            key={p.puuid || `${p.champion}-${i}`}
            type="button"
            className={`sp-player${p.pro ? ' is-pro' : ''}`}
            onClick={() => onOpen(p)}
            title={label}
          >
            <span className="sp-slice">
              <ChampSlice name={p.champion} />
              {org && (
                <span className="sp-slice-tag">
                  <TeamMark org={org} size={14} />
                  <em>{org.short || org.team}</em>
                </span>
              )}
            </span>
            <span className="sp-name">{p.pro?.player || p.gameName || p.champion || 'Unknown'}</span>
          </button>
        );
      })}
    </div>
  );
}
