import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSummonerDashboard } from '../services/riotApi';
import { ChampionIcon, ItemIcon, RuneIcon, SpellIcon } from '../components/GameIcons';
import RoleIcon from '../components/RoleIcon';
import MatchReview from '../components/MatchReview';
import { parsePlayerSearch, parseProIdentity, parseRiotId } from '../lib/playerRoute';
import { countryName, flagUrl } from '../lib/countryFlag';
import { apiUserMessage, noticeFromError } from '../lib/apiNotice';
import { isPlausibleLpDelta } from '../lib/lpHistory';
import { MODE_KEYS, MODE_LABEL, MODE_QUEUE } from '../lib/queues';
import { rankColor, rankEmblemClass, rankImg } from '../lib/rankEmblem';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import './History.css';

function lpChangeLabel(game) {
  if (!isPlausibleLpDelta(game.lpDelta)) return '';
  const n = Math.round(Number(game.lpDelta));
  return n > 0 ? `+${n}` : String(n);
}

function teamCaption(identity) {
  const team = String(identity?.team || '').trim();
  const short = String(identity?.short || '').trim();
  if (!team) return short;
  if (short && !team.toLowerCase().includes(short.toLowerCase())) return `${team} · ${short}`;
  return team;
}

function padFive(list) {
  const names = (Array.isArray(list) ? list : []).slice(0, 5);
  while (names.length < 5) names.push('');
  return names;
}

function fmtClock(min, sec) {
  return `${min}:${String(sec || 0).padStart(2, '0')}`;
}

function pct(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n <= 1 ? n * 100 : n);
}

function HistoryRow({ game, t, onOpen }) {
  const lp = lpChangeLabel(game);
  const items = Array.isArray(game.items) ? game.items : [];
  const core = items.slice(0, 6);
  while (core.length < 6) core.push(0);
  const trinket = items[6] || 0;
  const kp = pct(game.kp);
  const dmg = pct(game.damageShare);
  const kdaBits = [
    `${game.kda} KDA`,
    game.cs != null ? `${game.cs} CS` : '',
    kp != null ? `${kp}% ${t('history.kp')}` : '',
    dmg != null ? `${dmg}% ${t('history.dmg')}` : '',
  ].filter(Boolean);

  return (
    <button
      type="button"
      className={`hs-row hs-row--${game.win ? 'win' : 'loss'}`}
      onClick={onOpen}
      aria-label={t('history.openMatch')}
    >
      <span className={`hs-result ${game.win ? 'win' : 'loss'}`}>
        <em>{game.win ? t('history.win') : t('history.loss')}</em>
        {lp ? (
          <strong className={`hs-lp-badge${Number(game.lpDelta) > 0 ? ' is-up' : ' is-down'}`}>
            {lp}
          </strong>
        ) : null}
      </span>

      <div className="hs-loadout">
        <div className="hs-champ-wrap">
          <ChampionIcon name={game.champion} size={48} className="hs-champ" />
          {game.champLevel ? <span className="hs-level">{game.champLevel}</span> : null}
        </div>
        <div className="hs-summs">
          {(game.spells || []).slice(0, 2).map((id, i) => (
            <SpellIcon key={`sp-${i}`} id={id} size={16} />
          ))}
        </div>
        {game.runes?.keystone ? <RuneIcon id={game.runes.keystone} size={22} /> : null}
      </div>

      <div className="hs-mid">
        <div className="hs-champ-name">
          {game.role ? <RoleIcon role={game.role} size={14} /> : null}
          {game.champion}
        </div>
        <div className="hs-meta">{[game.queueLabel || game.queueType, game.ago].filter(Boolean).join(' · ')}</div>
      </div>

      <div className="hs-kda">
        <strong>{game.kills}/{game.deaths}/{game.assists}</strong>
        <span>{kdaBits.join(' · ')}</span>
      </div>

      <div className="hs-items">
        {core.map((id, i) => <ItemIcon key={`it-${i}`} id={id} size={22} />)}
        <span className="hs-trinket"><ItemIcon id={trinket} size={22} /></span>
      </div>

      <div className="hs-teams">
        <div className="hs-team hs-team--ally">
          {padFive(game.allyTeam).map((name, i) => (
            name
              ? <ChampionIcon key={`a-${i}`} name={name} size={18} title={name} />
              : <span key={`a-${i}`} className="hs-team-empty" />
          ))}
        </div>
        <div className="hs-team hs-team--enemy">
          {padFive(game.enemyTeam).map((name, i) => (
            name
              ? <ChampionIcon key={`e-${i}`} name={name} size={18} title={name} />
              : <span key={`e-${i}`} className="hs-team-empty" />
          ))}
        </div>
      </div>

      <div className="hs-tail">
        <strong>{game.gdScore ?? '—'}</strong>
        <span>{t('history.rift')}</span>
        <em>{fmtClock(game.durationMin, game.durationSec)}</em>
      </div>
      <span className="hs-chevron" aria-hidden>›</span>
    </button>
  );
}

export default function History() {
  const { session } = useSession();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qParam = parsePlayerSearch(searchParams);
  const ownId = session ? `${session.gameName}#${session.tagLine}` : '';
  const activeId = (qParam || ownId).trim();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('Solo');
  const [review, setReview] = useState(null);
  const [proIdentity, setProIdentity] = useState(null);

  const sessionLookup = {
    region: session?.region || 'europe',
    platform: session?.platform || 'euw1',
  };
  const reviewPlatform = profile?.platform || sessionLookup.platform;

  const load = async (riotId, selectedMode = mode, opts = {}) => {
    const alive = () => !opts.signal?.aborted;
    if (!riotId) {
      if (alive()) {
        setProfile(null);
        setError('');
        setLoading(false);
      }
      return;
    }
    if (alive()) {
      setLoading(true);
      setError('');
    }
    const parsed = parseRiotId(riotId, session?.tagLine || '');
    if (!parsed) {
      if (alive()) {
        setProfile(null);
        setError(t('history.needTag'));
        setLoading(false);
      }
      return;
    }
    try {
      const data = await getSummonerDashboard({
        gameName: parsed.gameName,
        tagLine: parsed.tagLine,
        region: sessionLookup.region,
        platform: sessionLookup.platform,
        queue: MODE_QUEUE[selectedMode],
        count: 20,
      });
      if (!alive()) return;
      setProfile(data);
    } catch (err) {
      if (!alive()) return;
      noticeFromError(err);
      setError(apiUserMessage(err) || 'Could not load match history.');
      setProfile(null);
    } finally {
      if (alive()) setLoading(false);
    }
  };

  useEffect(() => {
    const ac = new AbortController();
    load(activeId, mode, { signal: ac.signal });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, session?.platform, session?.region, mode]);

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

  const games = profile?.recentGames || [];
  const sample = useMemo(() => {
    const wins = games.filter((g) => g.win).length;
    const losses = games.length - wins;
    const wr = games.length ? Math.round((wins / games.length) * 100) : null;
    return { wins, losses, wr };
  }, [games]);
  const pool = (profile?.championPerformance || []).slice(0, 3);
  const rc = rankColor(profile?.rank);
  const org = teamCaption(proIdentity);

  return (
    <div className="hs-page">
      <header className="hs-head">
        <div>
          <h1>{t('history.title')}</h1>
          <p>
            {activeId
              ? `${activeId} · ${profile?.region || ''}`
              : t('history.linkBlurb')}
          </p>
        </div>
        <div className="hs-filters">
          {MODE_KEYS.map((m) => (
            <button
              key={m}
              type="button"
              className={`hs-chip${m === mode ? ' is-on' : ''}`}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {!activeId ? (
        <div className="hs-empty">
          <span>{t('history.empty')}</span>
          <button type="button" onClick={() => navigate('/link-account')}>{t('chrome.linkAccount')}</button>
        </div>
      ) : error ? (
        <div className="hs-empty">
          <span>{error}</span>
          <button type="button" onClick={() => load(activeId)}>{t('history.retry')}</button>
        </div>
      ) : loading || !profile ? (
        <div className="hs-empty">{t('common.loading')}</div>
      ) : (
        <>
          <div className="hs-summary">
            <div className="hs-rank" style={{ '--rc': rc }}>
              {rankImg(profile.rank) ? (
                <img src={rankImg(profile.rank)} alt="" className={rankEmblemClass(profile.rank, 'hs-rank-emblem')} />
              ) : null}
              <div>
                <strong>{profile.rank && profile.rank !== 'Unavailable' ? profile.rank : t('dash.unranked')}</strong>
                <span>
                  {profile.lp != null ? `${profile.lp} LP` : ''}
                  {profile.lp != null && profile.region ? ' · ' : ''}
                  {profile.region || ''}
                </span>
              </div>
            </div>
            <div className="hs-sample">
              <strong>
                {sample.wr != null
                  ? t('history.record', { w: sample.wins, l: sample.losses, wr: sample.wr })
                  : t('history.noGames')}
              </strong>
              <span>{t('history.sample')} · {t('history.games', { n: games.length, mode: MODE_LABEL[mode].toLowerCase() })}</span>
            </div>
            {pool.length ? (
              <div className="hs-pool" title={t('history.mostPlayed')}>
                {pool.map((row) => (
                  <div key={row.champion} className="hs-pool-champ">
                    <ChampionIcon name={row.champion} size={22} />
                    <span>
                      <b>{row.champion}</b>
                      {row.record ? ` ${row.record}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {proIdentity && (proIdentity.country || proIdentity.team) ? (
              <div className="hs-pro">
                {proIdentity.country ? (
                  <span className="hs-pro-chip">
                    {flagUrl(proIdentity.country) ? (
                      <img src={flagUrl(proIdentity.country, 40)} alt="" />
                    ) : null}
                    {countryName(proIdentity.country, locale)}
                    {proIdentity.lane ? ` · ${proIdentity.lane}` : ''}
                  </span>
                ) : null}
                {org ? (
                  <span className="hs-pro-chip hs-pro-chip--team">
                    {proIdentity.logo ? <img src={proIdentity.logo} alt="" /> : null}
                    {org}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="hs-list">
            {games.map((g) => (
              <HistoryRow key={g.matchId} game={g} t={t} onOpen={() => setReview(g)} />
            ))}
            {!games.length && <div className="hs-empty">{t('history.noGames')}</div>}
          </div>
        </>
      )}

      {review && (
        <MatchReview
          game={review}
          platform={reviewPlatform}
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}
