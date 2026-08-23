import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getLatestMatchReview, getLiveGame } from '../services/riotApi';
import { platformLabel } from '../services/ddragon';
import { SpellIcon, RuneIcon, ChampionIcon } from '../components/GameIcons';
import MatchReview from '../components/MatchReview';
import { parsePlayerSearch, playerSearchPath, parseRiotId } from '../lib/playerRoute';
import { rememberPlayer } from '../lib/recentPlayers';
import { apiUserMessage, noticeFromError, isNotFound } from '../lib/apiNotice';
import { RANKED_QUEUE_IDS } from '../lib/queues';
import { typicalLane } from '../lib/champLane';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import { SPECTATE_DELAY_SEC, fmtClock, spectateWaitSec } from '../lib/spectateDelay';
import RoleIcon from '../components/RoleIcon';
import { padTeamBans } from '../lib/bans';
import { rankImg } from '../lib/rankEmblem';
import './LiveStatus.css';

const champKey = (name = '') =>
  String(name).replace(/[^a-zA-Z0-9]/g, '').replace(/^./, (c) => c.toUpperCase());

const splashArt = (name) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champKey(name)}_0.jpg`;

function fmtElapsed(seconds = 0) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, Math.floor(seconds % 60));
  return `${m}:${String(s).padStart(2, '0')}`;
}

function rankLine(player, t) {
  if (player.rankUnknown) return t('live.rankUnknown');
  if (!player.rank || player.rank === 'Unranked') return t('live.unranked');
  const lp = player.lp != null ? `${player.lp} LP` : '';
  return lp ? `${player.rank} · ${lp}` : player.rank;
}

function overallLine(player) {
  if (player.wins == null && player.losses == null) return '';
  const w = player.wins || 0;
  const l = player.losses || 0;
  const games = w + l;
  if (!games) return '';
  return `${((w / games) * 100).toFixed(1)}% (${w}w-${l}L)`;
}

const LANES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const LANE_QUEUES = new Set([400, 420, 430, 440, 480, 490, 700]);

function hasSpell(player, id) {
  return player.spell1Id === id || player.spell2Id === id;
}

function typicalLaneOfPlayer(player) {
  return typicalLane(player.champion) || null;
}

function hasSupportItem(player) {
  return (player.items || []).some((id) => (id >= 3850 && id <= 3877));
}

function playerKey(player, index = 0) {
  return player.puuid || `${player.champion || 'na'}-${player.riotId || index}`;
}

function orderByLane(players = []) {
  const pool = [...players];
  const taken = new Set();
  const byLane = {};

  const claim = (lane, pred) => {
    if (byLane[lane]) return;
    const i = pool.findIndex((p, idx) => !taken.has(playerKey(p, idx)) && pred(p));
    if (i < 0) return;
    byLane[lane] = pool[i];
    taken.add(playerKey(pool[i], i));
  };

  claim('Jungle', (p) => p.role === 'Jungle' || hasSpell(p, 11));
  claim('Support', (p) => p.role === 'Support' || hasSupportItem(p));
  for (const lane of LANES) claim(lane, (p) => p.role === lane);
  claim('Support', (p) => hasSpell(p, 3));
  claim('ADC', (p) => hasSpell(p, 7) || hasSpell(p, 21));
  const withCs = pool.filter((p, idx) => !taken.has(playerKey(p, idx)) && Number.isFinite(p.cs));
  const maxCs = withCs.reduce((n, p) => Math.max(n, p.cs), 0);
  if (!byLane.Support && maxCs >= 80) {
    const lowest = [...withCs].sort((a, b) => a.cs - b.cs)[0];
    if (lowest && lowest.cs <= maxCs * 0.45) claim('Support', (p) => p === lowest);
  }
  claim('Top', (p) => hasSpell(p, 12) && typicalLaneOfPlayer(p) !== 'Mid');
  claim('Mid', (p) => hasSpell(p, 12));
  claim('Top', (p) => hasSpell(p, 12));
  for (const lane of LANES) claim(lane, (p) => typicalLaneOfPlayer(p) === lane);
  for (const lane of LANES) claim(lane, () => true);
  return LANES.map((lane) => (byLane[lane] ? { ...byLane[lane], lane, role: lane } : null));
}

function TeamGrid({ players, ranked, red }) {
  return (
    <div className={`lv-grid${red ? ' lv-grid--red' : ''}`}>
      {players.map((p, i) => (
        p
          ? <PlayerCard key={playerKey(p, i)} player={p} ranked={ranked} />
          : <div key={LANES[i] || i} className="lv-card lv-card--empty" />
      ))}
    </div>
  );
}

function BanRow({ bans, team }) {
  const { t } = useI18n();
  if (!bans?.length) return <div className="lv-bans lv-bans--empty">{t('live.noBans')}</div>;
  const list = padTeamBans(bans, team);
  return (
    <div className="lv-bans">
      {list.map((b, i) => (
        <div key={`${b.champion || b.championId || 'empty'}-${i}`} className={`lv-ban${b.champion ? '' : ' is-empty'}`}>
          {b.champion ? <ChampionIcon name={b.champion} size={26} /> : <span className="lv-ban-empty" />}
        </div>
      ))}
    </div>
  );
}

function PlayerCard({ player, ranked }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const emblem = rankImg(player.rank);
  const record = overallLine(player);
  const unranked = player.rankUnknown || !player.rank || player.rank === 'Unranked';
  const riotId = player.riotId || (player.tagLine ? `${player.gameName}#${player.tagLine}` : '');
  const canOpen = player.gameName && player.gameName !== 'Unknown' && riotId.includes('#');
  const open = () => {
    if (!canOpen) return;
    rememberPlayer(riotId);
    navigate(playerSearchPath(riotId));
  };

  return (
    <button
      type="button"
      className={`lv-card${player.isSelf ? ' is-self' : ''}${canOpen ? '' : ' is-locked'}`}
      onClick={open}
      disabled={!canOpen}
      title={canOpen ? `Open ${riotId}` : undefined}
    >
      <img className="lv-card-splash" src={splashArt(player.champion)} alt="" />
      <div className="lv-card-fade" />

      <div className="lv-card-top">
        <div className="lv-card-champ">{player.championName || player.champion}</div>
        {player.champGames > 0 && (
          <div className="lv-card-onchamp">
            vs {player.championName || player.champion}: {player.champWins ?? 0}–{Math.max(0, (player.champGames || 0) - (player.champWins || 0))}
            {player.champWr != null ? ` · ${player.champWr.toFixed(0)}%` : ''}
          </div>
        )}
        {(player.last3 || []).length > 0 && (
          <div className="lv-card-last3">
            {player.last3.slice(0, 3).map((win, i) => (
              <span key={i} className={win ? 'is-w' : 'is-l'}>{win ? 'W' : 'L'}</span>
            ))}
          </div>
        )}
      </div>

      {ranked && player.dodge ? (
        <div className="lv-card-dodge">Dodge</div>
      ) : player.streak ? (
        <div className={`lv-card-streak ${player.streak > 0 ? 'is-hot' : 'is-cold'}`}>
          <span>{Math.abs(player.streak)}</span>
        </div>
      ) : null}

      <div className="lv-card-bottom">
        <div className="lv-card-name">{player.gameName}{player.tagLine ? <span className="lv-card-tag">#{player.tagLine}</span> : null}</div>
        <div className="lv-card-actions">
          <div className="lv-card-spells">
            <SpellIcon id={player.spell1Id} size={22} />
            <SpellIcon id={player.spell2Id} size={22} />
          </div>
          <div className="lv-card-runes">
            <RuneIcon id={player.keystone} size={24} />
            <RuneIcon id={player.subStyle} size={16} />
          </div>
        </div>
        <div className="lv-card-meta">
          {emblem && !unranked && <img src={emblem} alt="" className="lv-card-emblem" />}
          <span>{rankLine(player, t)}</span>
          {record && <span className="lv-card-record">{record}</span>}
        </div>
      </div>
    </button>
  );
}

function keepKnownRanks(prev, next) {
  if (!prev || !next) return next;
  const oldById = {};
  [...(prev.blue || []), ...(prev.red || [])].forEach((p) => {
    if (p?.puuid) oldById[p.puuid] = p;
  });
  const merge = (p) => {
    const old = oldById[p.puuid];
    if (!old) return p;
    const sameChamp = old.champion === p.champion;
    const samePerson = sameChamp && (old.riotId === p.riotId || (!p.gameName || p.gameName === 'Unknown'));
    let next = p;
    if ((!p.gameName || p.gameName === 'Unknown') && old.gameName && old.gameName !== 'Unknown' && sameChamp) {
      next = {
        ...next,
        gameName: old.gameName,
        tagLine: old.tagLine,
        riotId: old.riotId,
      };
    }
    const hadRank = old.rank && old.rank !== 'Unranked' && !old.rankUnknown;
    if (p.rankUnknown && hadRank && samePerson) {
      next = {
        ...next,
        rank: old.rank,
        rankUnknown: false,
        lp: old.lp,
        wins: old.wins,
        losses: old.losses,
      };
    }
    return next;
  };
  return {
    ...next,
    blue: (next.blue || []).map(merge),
    red: (next.red || []).map(merge),
  };
}

export default function LiveStatus() {
  const { session } = useSession();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [recap, setRecap] = useState(null);
  const [error, setError] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchErr, setLaunchErr] = useState('');
  const [launchNote, setLaunchNote] = useState('');
  const hadGameRef = useRef(false);
  const spectateApi = typeof window !== 'undefined' ? window.spectateAPI : null;

  const viewed = parseRiotId(parsePlayerSearch(searchParams), session?.tagLine || '');
  const lookup = {
    gameName: viewed?.gameName || session?.gameName,
    tagLine: viewed?.tagLine || session?.tagLine,
    region: session?.region || 'europe',
    platform: session?.platform || 'euw1',
  };
  const label = lookup.gameName ? `${lookup.gameName}#${lookup.tagLine || ''}` : null;

  const checkSeq = useRef(0);

  const check = async ({ silent = false } = {}) => {
    if (!lookup.gameName) { setLoading(false); setGame(null); return; }
    const seq = ++checkSeq.current;
    if (!silent) setLoading(true);
    try {
      const data = await getLiveGame(lookup);
      if (seq !== checkSeq.current) return;
      setError('');
      if (hadGameRef.current && !data) {
        let ended = await getLatestMatchReview(lookup);
        if (seq !== checkSeq.current) return;
        if (!ended) {
          await new Promise((r) => setTimeout(r, 4000));
          if (seq !== checkSeq.current) return;
          ended = await getLatestMatchReview(lookup);
          if (seq !== checkSeq.current) return;
        }
        if (ended) setRecap(ended);
      }
      hadGameRef.current = !!data;
      setGame((prev) => keepKnownRanks(prev, data));
      if (data) setFetchedAt(Date.now());
      setCheckedAt(new Date());
    } catch (err) {
      if (seq !== checkSeq.current) return;
      console.warn('[live] check failed:', err?.message || err);
      noticeFromError(err);
      setGame(null);
      setError(
        isNotFound(err)
          ? t('live.notFound')
          : (apiUserMessage(err) || t('live.fail'))
      );
      setCheckedAt(new Date());
    } finally {
      if (seq === checkSeq.current && !silent) setLoading(false);
    }
  };

  useEffect(() => {
    setLaunchErr('');
    setLaunching(false);
  }, [lookup.gameName, lookup.tagLine, lookup.platform]);

  useEffect(() => {
    check();
    return () => { checkSeq.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup.gameName, lookup.tagLine, lookup.platform]);

  useEffect(() => {
    if (!lookup.gameName) return undefined;
    const t = setInterval(() => check({ silent: true }), 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup.gameName, lookup.tagLine, lookup.platform]);

  useEffect(() => {
    if (!game) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [game]);

  const elapsed = game ? (game.gameLength || 0) + Math.floor((now - fetchedAt) / 1000) : 0;
  const waitSec = game
    ? (game.gameStartTime ? spectateWaitSec(game.gameStartTime, now) : Math.max(0, SPECTATE_DELAY_SEC - elapsed))
    : 0;
  const ranked = game ? RANKED_QUEUE_IDS.has(game.queueId) : false;
  const useLanes = game ? LANE_QUEUES.has(Number(game.queueId)) : false;
  const blue = game ? (useLanes ? orderByLane(game.blue) : (game.blue || [])) : [];
  const red = game ? (useLanes ? orderByLane(game.red) : (game.red || [])) : [];
  const canSpectate = Boolean(
    spectateApi
    && game?.encryptionKey
    && game?.gameId
    && game?.platformId
    && game.source !== 'live-client'
  );

  async function spectateLive() {
    if (!canSpectate || launching) return;
    if (waitSec > 0) {
      setLaunchErr(t('spectate.waitDelay', { time: fmtClock(waitSec) }));
      return;
    }
    setLaunching(true);
    setLaunchErr('');
    setLaunchNote('');
    try {
      const result = await spectateApi.launch({
        gameId: game.gameId,
        platformId: game.platformId,
        encryptionKey: game.encryptionKey,
        queueId: game.queueId,
        puuid: game.puuid,
        rawPlatform: game.platform || lookup.platform,
        gameStartTime: game.gameStartTime,
      });
      if (!result?.ok) setLaunchErr(result?.error || t('spectate.fail'));
      else setLaunchNote(t('spectate.connecting'));
    } catch (err) {
      setLaunchErr(err.message || t('spectate.fail'));
    } finally {
      setLaunching(false);
    }
  }

  if (!lookup.gameName) {
    return (
      <div className="lv-page">
        <section className="lv-empty">
          <h1>{t('live.title')}</h1>
          <p>{t('live.empty')}</p>
        </section>
      </div>
    );
  }

  return (
    <div className={`lv-page${game && !loading ? ' lv-page--live' : ''}`}>
      <header className="lv-head">
        <div>
          <h1>{t('live.title')}</h1>
          <div className="lv-sub">{label} · {platformLabel(lookup.platform)}</div>
        </div>
        <div className="lv-head-actions">
          {canSpectate && (
            <button
              type="button"
              className="lv-spectate"
              onClick={spectateLive}
              disabled={launching || waitSec > 0}
              title={waitSec > 0 ? t('spectate.waitDelay', { time: fmtClock(waitSec) }) : undefined}
            >
              {launching
                ? t('live.starting')
                : waitSec > 0
                  ? t('spectate.wait', { time: fmtClock(waitSec) })
                  : t('live.spectate')}
            </button>
          )}
          <button type="button" className="lv-refresh" onClick={check} disabled={loading}>
            {loading ? t('live.checking') : t('live.refresh')}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="lv-loading">{t('live.loading')}</div>
      ) : error ? (
        <section className="lv-idle">
          <h2>{t('live.failTitle')}</h2>
          <p>{error}</p>
        </section>
      ) : game ? (
        <div className="lv-match">
          <div className="lv-match-bar">
            <BanRow bans={game.bans || []} team={100} />
            <div className="lv-timer">
              <span className="lv-timer-dot" />
              <span className="lv-timer-queue">{game.queueName}</span>
              <span className="lv-timer-clock">{fmtElapsed(elapsed)}</span>
            </div>
            <BanRow bans={game.bans || []} team={200} />
          </div>

          <TeamGrid players={blue} ranked={ranked} />
          {useLanes && (
            <div className="lv-roles">
              {LANES.map((lane) => (
                <div key={lane} className="lv-roles-tag" title={lane}>
                  <RoleIcon role={lane} size={18} className="lv-role-icon" />
                </div>
              ))}
            </div>
          )}
          <TeamGrid players={red} ranked={ranked} red />
          {launchErr && <div className="lv-spectate-err">{launchErr}</div>}
          {launchNote && !launchErr && (
            <div className="lv-spectate-hint">{launchNote}</div>
          )}
          {canSpectate && !launchErr && !launchNote && (
            <div className="lv-spectate-hint">{t('live.hint')}</div>
          )}
        </div>
      ) : (
        <section className="lv-idle">
          <div className="lv-idle-dot" />
          <h2>{t('live.idleTitle')}</h2>
          <p>{t('live.idleBody', { id: label })}</p>
        </section>
      )}

      {checkedAt && !game && (
        <div className="lv-checked">{t('live.lastChecked', { time: checkedAt.toLocaleTimeString() })}</div>
      )}

      {recap && (
        <MatchReview
          game={recap}
          platform={lookup.platform}
          kicker={t('live.recap')}
          onClose={() => setRecap(null)}
        />
      )}
    </div>
  );
}
