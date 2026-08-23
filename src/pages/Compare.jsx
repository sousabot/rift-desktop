import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import { comparePlayers } from '../services/riotApi';
import { ChampionIcon } from '../components/GameIcons';
import { parseRiotId, playerSearchPath } from '../lib/playerRoute';
import { apiUserMessage, noticeFromError } from '../lib/apiNotice';
import { displayPeakShort, formatMmr, mergePeakRank, mmrToRank, rankSnapshot } from '../lib/rankMmr';
import { rankColor, rankImg } from '../lib/rankEmblem';
import { profileIconUrl, useDdragonVersion } from '../services/ddragon';
import { GD_SCORE_HINT } from '../lib/gdScore';
import './Compare.css';

function num(value) {
  if (value == null || value === '—') return null;
  const n = Number(String(value).replace(/[+%]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function wr(profile) {
  const games = (profile?.wins || 0) + (profile?.losses || 0);
  if (!games) return null;
  return Math.round((profile.wins / games) * 100);
}

function peakOf(profile) {
  const current = rankSnapshot(profile?.rankTier, profile?.rankDivision, profile?.lp);
  const season = profile?.seasonPeak
    ? rankSnapshot(profile.seasonPeak.tier, profile.seasonPeak.division, profile.seasonPeak.lp)
    : null;
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(`rift-peak-rank:${String(profile?.riotId || '').toLowerCase()}:Solo`) || 'null');
  } catch { /* ignore */ }
  return mergePeakRank(stored, current, season);
}

function FormDots({ games = [] }) {
  return (
    <div className="cp-form">
      {games.slice(0, 10).map((g) => (
        <span key={g.matchId} className={g.win ? 'is-w' : 'is-l'}>{g.win ? 'W' : 'L'}</span>
      ))}
    </div>
  );
}

function Side({ profile, onOpen }) {
  const { t } = useI18n();
  const version = useDdragonVersion();
  if (!profile) return <div className="cp-side cp-side--empty">{t('compare.empty')}</div>;
  const rc = rankColor(profile.rank);
  const peak = peakOf(profile);
  const mmrRank = mmrToRank(profile.estMmr);
  const winrate = wr(profile);
  const name = profile.riotId?.split('#')[0] || '';
  const tag = profile.riotId?.split('#')[1] || '';
  return (
    <button type="button" className="cp-side" style={{ '--rc': rc }} onClick={() => onOpen?.(profile.riotId)}>
      <div className="cp-side-top">
        <img
          className="cp-avatar"
          src={profileIconUrl(profile.profileIconId, version)}
          alt=""
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
        <div>
          <h2>{name}</h2>
          <div className="cp-tag">#{tag} · {profile.region || 'EUW'}</div>
        </div>
      </div>
      <div className="cp-rank-row">
        {rankImg(profile.rank) && <img src={rankImg(profile.rank)} alt="" className="cp-emblem" />}
        <div>
          <div className="cp-rank">{profile.rank || t('dash.unranked')}</div>
          <div className="cp-lp">{profile.lp != null ? `${profile.lp} LP` : '—'}</div>
        </div>
      </div>
      {(peak || mmrRank) && (
        <div className="cp-split">
          <div>
            <span>{t('dash.peak')}</span>
            <strong>{displayPeakShort(peak, rankSnapshot(profile.rankTier, profile.rankDivision, profile.lp)) || '—'}</strong>
          </div>
          <div>
            <span>{t('dash.mmr')}</span>
            <strong title={t('dash.estMmrHint')} style={mmrRank?.tier ? { color: rankColor(mmrRank.tier) } : undefined}>
              {mmrRank?.short || formatMmr(profile.estMmr) || '—'}
            </strong>
          </div>
        </div>
      )}
      <div className="cp-record">
        {profile.wins != null ? `${profile.wins}W – ${profile.losses}L${winrate != null ? ` · ${winrate}%` : ''}` : t('dash.rankFail')}
      </div>
      <div className="cp-score" title={GD_SCORE_HINT}>
        <span>{t('dash.riftScore')}</span>
        <strong>{profile.stats?.gdScore || '—'}</strong>
      </div>
    </button>
  );
}

function DuelRow({ label, left, right, hint, higher = true }) {
  const a = num(left);
  const b = num(right);
  const leftWins = a != null && b != null && (higher ? a > b : a < b);
  const rightWins = a != null && b != null && (higher ? b > a : b < a);
  let leftPct = 50;
  let rightPct = 50;
  if (a != null && b != null && a !== b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const span = hi - lo || 1;
    leftPct = 14 + ((a - lo) / span) * 72;
    rightPct = 14 + ((b - lo) / span) * 72;
  }
  return (
    <div className="cp-duel-row" title={hint}>
      <strong className={leftWins ? 'is-ahead' : ''}>{left ?? '—'}</strong>
      <div className="cp-duel-mid">
        <span>{label}</span>
        <div className="cp-duel-bars">
          <i className={leftWins ? 'is-ahead' : ''} style={{ width: `${leftPct}%` }} />
          <i className={rightWins ? 'is-ahead is-right' : 'is-right'} style={{ width: `${rightPct}%` }} />
        </div>
      </div>
      <strong className={rightWins ? 'is-ahead' : ''}>{right ?? '—'}</strong>
    </div>
  );
}

function ChampCard({ row, side }) {
  const d = row[side];
  if (!d) return null;
  return (
    <div className="cp-champ-card">
      <ChampionIcon name={row.champion} size={36} />
      <div>
        <strong>{row.champion}</strong>
        <em>{d.games}g · {d.wr.toFixed(0)}% · {d.kda} KDA</em>
      </div>
    </div>
  );
}

export default function Compare() {
  const { session } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [leftInput, setLeftInput] = useState(session ? `${session.gameName}#${session.tagLine}` : '');
  const [rightInput, setRightInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const runSeq = useRef(0);

  const openProfile = (riotId) => {
    if (!riotId) return;
    navigate(playerSearchPath(riotId));
  };

  const run = async (e) => {
    e?.preventDefault();
    const leftId = parseRiotId(leftInput, session?.tagLine || '');
    const rightId = parseRiotId(rightInput, session?.tagLine || '');
    if (!leftId || !rightId) {
      setError(t('compare.needIds'));
      return;
    }
    const seq = ++runSeq.current;
    setLoading(true);
    setError('');
    try {
      const data = await comparePlayers(
        { ...leftId, region: session?.region || 'europe', platform: session?.platform || 'euw1' },
        { ...rightId, region: session?.region || 'europe', platform: session?.platform || 'euw1' },
      );
      if (seq !== runSeq.current) return;
      setResult(data);
    } catch (err) {
      if (seq !== runSeq.current) return;
      noticeFromError(err);
      setError(apiUserMessage(err) || t('compare.fail'));
      setResult(null);
    } finally {
      if (seq === runSeq.current) setLoading(false);
    }
  };

  const left = result?.left;
  const right = result?.right;
  const overlap = result?.overlap || [];

  return (
    <div className="cp-page">
      <header className="cp-head">
        <div>
          <h1>{t('compare.title')}</h1>
          <p>{t('compare.blurb')}</p>
        </div>
      </header>

      <form className="cp-form-bar" onSubmit={run}>
        <input
          value={leftInput}
          onChange={(e) => setLeftInput(e.target.value)}
          placeholder={t('compare.playerA')}
          aria-label={t('compare.playerA')}
        />
        <span className="cp-vs">VS</span>
        <input
          value={rightInput}
          onChange={(e) => setRightInput(e.target.value)}
          placeholder={t('compare.playerB')}
          aria-label={t('compare.playerB')}
        />
        <button type="submit" disabled={loading}>{loading ? t('compare.running') : t('compare.run')}</button>
      </form>
      {error && <div className="cp-error">{error}</div>}

      {result && (
        <>
          <div className="cp-grid">
            <Side profile={left} onOpen={openProfile} />
            <Side profile={right} onOpen={openProfile} />
          </div>

          <section className="cp-panel">
            <h3>{t('compare.duel')}</h3>
            <p className="cp-panel-note">{t('compare.sample')}</p>
            <DuelRow label={t('dash.riftScore')} left={left?.stats?.gdScore} right={right?.stats?.gdScore} hint={GD_SCORE_HINT} />
            <DuelRow label={t('compare.kda')} left={left?.stats?.kda} right={right?.stats?.kda} />
            <DuelRow label={t('compare.csm')} left={left?.stats?.csm} right={right?.stats?.csm} />
            <DuelRow label={t('compare.gold15')} left={left?.stats?.goldDiff15} right={right?.stats?.goldDiff15} />
            <DuelRow label={t('dash.kp')} left={left?.stats?.kp} right={right?.stats?.kp} />
            <DuelRow label={t('dash.vision')} left={left?.stats?.visionScore} right={right?.stats?.visionScore} />
          </section>

          <section className="cp-panel">
            <h3>{t('compare.form')}</h3>
            <div className="cp-form-grid">
              <div>
                <span>{left?.riotId?.split('#')[0]}</span>
                <FormDots games={left?.recentGames} />
              </div>
              <div>
                <span>{right?.riotId?.split('#')[0]}</span>
                <FormDots games={right?.recentGames} />
              </div>
            </div>
          </section>

          <section className="cp-panel">
            <h3>{overlap.length ? t('compare.overlap') : t('compare.pools')}</h3>
            {overlap.length ? (
              <div className="cp-overlap-list">
                {overlap.slice(0, 8).map((row) => (
                  <div key={row.champion} className="cp-overlap-row">
                    <ChampCard row={row} side="left" />
                    <ChampionIcon name={row.champion} size={28} />
                    <ChampCard row={row} side="right" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="cp-panel-note">{t('compare.noOverlap')}</p>
                <div className="cp-pools">
                  <div>
                    {(left?.championPool || []).slice(0, 5).map((c) => (
                      <ChampCard key={`l-${c.champion}`} row={{ champion: c.champion, left: c }} side="left" />
                    ))}
                  </div>
                  <div>
                    {(right?.championPool || []).slice(0, 5).map((c) => (
                      <ChampCard key={`r-${c.champion}`} row={{ champion: c.champion, right: c }} side="right" />
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
