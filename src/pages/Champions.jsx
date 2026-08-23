import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSummonerDashboard } from '../services/riotApi';
import { ChampionIcon } from '../components/GameIcons';
import { parsePlayerSearch, parseRiotId } from '../lib/playerRoute';
import { apiUserMessage, noticeFromError } from '../lib/apiNotice';
import { MODE_KEYS, MODE_LABEL, MODE_QUEUE } from '../lib/queues';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import './Champions.css';

export default function Champions() {
  const { session } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qParam = parsePlayerSearch(searchParams);
  const ownId = session ? `${session.gameName}#${session.tagLine}` : '';
  const activeId = (qParam || ownId).trim();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('Solo');
  const [sort, setSort] = useState('games');

  const lookup = {
    region: session?.region || 'europe',
    platform: session?.platform || 'euw1',
  };

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
        region: lookup.region,
        platform: lookup.platform,
        queue: MODE_QUEUE[selectedMode],
        count: 20,
      });
      if (!alive()) return;
      setProfile(data);
    } catch (err) {
      if (!alive()) return;
      noticeFromError(err);
      setError(apiUserMessage(err) || 'Could not load champion stats.');
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

  const pool = [...(profile?.championPool || [])].sort((a, b) => {
    if (sort === 'wr') return b.wr - a.wr || b.games - a.games;
    if (sort === 'kda') return Number(b.kda) - Number(a.kda);
    if (sort === 'cs') return Number(b.cs) - Number(a.cs);
    return b.games - a.games;
  });

  return (
    <div className="ch-page">
      <header className="ch-head">
        <div>
          <h1>{t('champions.title')}</h1>
          <p>{activeId ? t('champions.blurb', { id: activeId, mode: MODE_LABEL[mode].toLowerCase() }) : t('champions.linkBlurb')}</p>
        </div>
        <div className="ch-filters">
          {MODE_KEYS.map((m) => (
            <button
              key={m}
              type="button"
              className={`ch-chip${m === mode ? ' is-on' : ''}`}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {!activeId ? (
        <div className="ch-empty">
          <span>{t('champions.empty')}</span>
          <button type="button" onClick={() => navigate('/link-account')}>{t('chrome.linkAccount')}</button>
        </div>
      ) : error ? (
        <div className="ch-empty">
          <span>{error}</span>
          <button type="button" onClick={() => load(activeId)}>{t('champions.retry')}</button>
        </div>
      ) : loading || !profile ? (
        <div className="ch-empty">{t('champions.loading')}</div>
      ) : (
        <div className="ch-table-wrap">
          <table className="ch-table">
            <thead>
              <tr>
                <th>Champion</th>
                <th><button type="button" className={sort === 'games' ? 'is-on' : ''} onClick={() => setSort('games')}>Games</button></th>
                <th><button type="button" className={sort === 'wr' ? 'is-on' : ''} onClick={() => setSort('wr')}>WR</button></th>
                <th>W–L</th>
                <th><button type="button" className={sort === 'kda' ? 'is-on' : ''} onClick={() => setSort('kda')}>KDA</button></th>
                <th><button type="button" className={sort === 'cs' ? 'is-on' : ''} onClick={() => setSort('cs')}>CS/min</button></th>
              </tr>
            </thead>
            <tbody>
              {pool.map((row) => (
                <tr key={row.champion}>
                  <td>
                    <div className="ch-champ">
                      <ChampionIcon name={row.champion} size={32} />
                      <span>{row.champion}</span>
                    </div>
                  </td>
                  <td>{row.games}</td>
                  <td className={row.wr >= 50 ? 'is-pos' : 'is-neg'}>{row.wr.toFixed(1)}%</td>
                  <td>{row.wins}–{row.losses}</td>
                  <td>{row.kda}</td>
                  <td>{row.cs}</td>
                </tr>
              ))}
              {!pool.length && (
                <tr>
                  <td colSpan={6} className="ch-none">No games in this queue yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
