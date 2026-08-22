import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import { REGIONS, parseRiotIdInput, linkErrorMessage } from '../lib/regions';
import { noticeFromError } from '../lib/apiNotice';
import './LinkAccount.css';

function idsMatch(aName, aTag, bName, bTag) {
  return String(aName || '').trim().toLowerCase() === String(bName || '').trim().toLowerCase()
    && String(aTag || '').trim().toLowerCase() === String(bTag || '').trim().toLowerCase();
}

export default function LinkAccount() {
  const { session, setSession } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [regionIdx, setRegionIdx] = useState(0);
  const [status, setStatus] = useState(null); // null | 'checking' | 'error'
  const [error, setError] = useState('');
  const [lcu, setLcu] = useState({ connected: false, reason: 'client-closed', summoner: null });
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    window.riotAPI?.wakeProxy?.().catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (!window.lcuAPI?.getStatus) return;
      try {
        const st = await window.lcuAPI.getStatus();
        if (!alive) return;
        setLcu(st || { connected: false, reason: 'client-closed', summoner: null });
        if (st?.connected && st.summoner?.gameName && st.summoner?.tagLine && !prefilled) {
          setGameName(st.summoner.gameName);
          setTagLine(String(st.summoner.tagLine).toUpperCase());
          setPrefilled(true);
        }
      } catch {
        if (alive) setLcu({ connected: false, reason: 'client-closed', summoner: null });
      }
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [prefilled]);

  const unlink = () => {
    setSession(null);
    setGameName('');
    setTagLine('');
    setStatus(null);
    setError('');
    setPrefilled(false);
  };

  const onNameChange = (value) => {
    if (value.includes('#')) {
      const parsed = parseRiotIdInput(value, tagLine);
      setGameName(parsed.gameName);
      if (parsed.tagLine) setTagLine(parsed.tagLine);
      return;
    }
    setGameName(value);
  };

  const leagueReady = !!lcu.connected && !!lcu.summoner?.gameName && !!lcu.summoner?.tagLine;
  const formMatchesLeague = leagueReady
    && idsMatch(gameName, tagLine, lcu.summoner.gameName, lcu.summoner.tagLine);
  const loggedInId = leagueReady
    ? `${lcu.summoner.gameName}#${lcu.summoner.tagLine}`
    : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsed = parseRiotIdInput(gameName, tagLine);
    if (!parsed.gameName || !parsed.tagLine) {
      setStatus('error');
      setError(t('link.needBoth'));
      return;
    }

    setGameName(parsed.gameName);
    setTagLine(parsed.tagLine);
    setError('');

    if (!leagueReady) {
      setStatus('error');
      setError(lcu.reason === 'not-logged-in' ? t('link.needLeagueLogin') : t('link.needLeagueOpen'));
      return;
    }
    if (!idsMatch(parsed.gameName, parsed.tagLine, lcu.summoner.gameName, lcu.summoner.tagLine)) {
      setStatus('error');
      setError(t('link.mismatch', { id: loggedInId }));
      return;
    }

    const hint = REGIONS[regionIdx] || REGIONS[0];
    if (!window.riotAPI?.linkAccount) {
      setStatus('error');
      setError(t('link.noApi'));
      return;
    }

    setStatus('checking');
    try {
      const linked = await window.riotAPI.linkAccount({
        gameName: parsed.gameName,
        tagLine: parsed.tagLine,
        region: hint.region,
        platform: hint.platform,
      });

      setSession({
        gameName: linked.gameName || parsed.gameName,
        tagLine: linked.tagLine || parsed.tagLine,
        region: linked.region || hint.region,
        platform: linked.platform || hint.platform,
        puuid: linked.puuid || null,
      });
      setStatus(null);
      navigate({ pathname: '/', search: '' }, { replace: true });
    } catch (err) {
      noticeFromError(err);
      setStatus('error');
      setError(linkErrorMessage(err, t));
    }
  };

  const lcuBanner = !leagueReady
    ? (lcu.reason === 'not-logged-in' ? t('link.lcuNotLoggedIn') : t('link.lcuClosed'))
    : formMatchesLeague
      ? t('link.lcuReady', { id: loggedInId })
      : t('link.lcuMismatchHint', { id: loggedInId });

  return (
    <div className="rift-page rift-page--narrow">
      <section className="rift-panel">
        <h2>{session ? t('link.switchTitle') : t('link.title')}</h2>
        {session && (
          <div className="rift-link-current">
            {t('link.current', { id: `${session.gameName}#${session.tagLine}` })}
            <button type="button" className="rift-link-unlink" onClick={unlink}>{t('login.unlink')}</button>
          </div>
        )}

        <div
          className={`rift-link-lcu ${leagueReady && formMatchesLeague ? 'rift-link-lcu--ok' : 'rift-link-lcu--warn'}`}
          role="status"
        >
          {lcuBanner}
        </div>

        <form className="rift-link-form" onSubmit={handleSubmit}>
          <div className="rift-link-row">
            <input
              value={gameName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('link.name')}
              autoFocus
              autoComplete="off"
              required
            />
            <span className="rift-link-hash">#</span>
            <input
              className="rift-link-tag"
              value={tagLine}
              onChange={(e) => setTagLine(e.target.value.replace(/^#/, '').toUpperCase())}
              placeholder={t('link.tag')}
              maxLength={5}
              autoComplete="off"
              required
            />
          </div>

          <select value={regionIdx} onChange={(e) => setRegionIdx(Number(e.target.value))}>
            {REGIONS.map((r, i) => (
              <option key={r.platform} value={i}>{r.label}</option>
            ))}
          </select>
          <p className="rift-link-hint">
            {status === 'checking' ? t('link.checking') : t('link.hint')}
          </p>

          {status === 'error' && <p className="rift-link-error">{error}</p>}

          <button type="submit" disabled={status === 'checking' || !leagueReady || !formMatchesLeague}>
            {status === 'checking' ? t('link.checkingBtn') : session ? t('link.switch') : t('link.verify')}
          </button>
        </form>
      </section>
    </div>
  );
}
