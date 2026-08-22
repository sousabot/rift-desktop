import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { playerSearchPath, parsePlayerSearch, parseRiotId, playerQuery } from '../lib/playerRoute';
import { readRecentPlayers, rememberPlayer } from '../lib/recentPlayers';
import { useSession } from '../state/SessionContext';
import { usePremium } from '../state/PremiumContext';
import { useI18n } from '../i18n/LocaleContext';
import FeedbackForm from './FeedbackForm';
import LOGO from '../assets/logo-mark.png';
import './TitleBar.css';

const FALLBACK_VERSION = '0.1.0';
const hasWindowApi = typeof window !== 'undefined' && !!window.windowControls;

function IconBack() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconFwd() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M16.2 10a6.2 6.2 0 1 1-1.8-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M16.2 4.2v4.2h-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconBug() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 7.2c2 0 3.4 1.3 3.4 3.4v2.2c0 1.9-1.5 3.2-3.4 3.2s-3.4-1.3-3.4-3.2V10.6c0-2.1 1.4-3.4 3.4-3.4Z" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M6.6 8.2 4.4 6.4M13.4 8.2l2.2-1.8M6.6 12H4.2M13.4 12h2.4M10 7.2V4.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function IconGear() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 3.4v1.8M10 14.8v1.8M3.4 10h1.8M14.8 10h1.8M5.3 5.3l1.3 1.3M13.4 13.4l1.3 1.3M14.7 5.3 13.4 6.6M6.6 13.4 5.3 14.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export default function TitleBar() {
  const { session } = useSession();
  const { isPremium } = usePremium();
  const { t, locale, setLocale, locales } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const viewedId = parsePlayerSearch(searchParams);
  const ownId = session ? `${session.gameName}#${session.tagLine}` : '';
  const [query, setQuery] = useState(viewedId || ownId);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHint, setSearchHint] = useState('');
  const [recent, setRecent] = useState(readRecentPlayers);
  const [appVersion, setAppVersion] = useState(FALLBACK_VERSION);

  useEffect(() => {
    window.riftUpdate?.info?.().then((info) => {
      if (info?.version) setAppVersion(info.version);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setQuery(viewedId || ownId);
  }, [viewedId, ownId, location.pathname]);

  const goToPlayer = (raw) => {
    const parsed = parseRiotId(raw, session?.tagLine || '');
    if (!parsed) return;
    const riotId = `${parsed.gameName}#${parsed.tagLine}`;
    rememberPlayer(riotId);
    setRecent(readRecentPlayers());
    setSearchHint('');
    setSearchOpen(false);
    const isOwn = ownId && riotId.toLowerCase() === ownId.toLowerCase();
    if (location.pathname.startsWith('/live')) {
      navigate(`/live${playerQuery(riotId, parsed.tagLine)}`);
      return;
    }
    navigate(isOwn ? '/' : playerSearchPath(riotId, parsed.tagLine));
  };

  const submitSearch = (e) => {
    e.preventDefault();
    const next = query.trim();
    if (!next) return;
    if (!next.includes('#')) {
      setSearchHint(t('chrome.searchHint'));
      setSearchOpen(true);
      return;
    }
    goToPlayer(next);
  };

  return (
    <header className="rift-titlebar">
      <div className="rift-titlebar__left" onDoubleClick={(e) => e.stopPropagation()}>
        <div className="rift-titlebar__brand">
          <img className="rift-titlebar__logo" src={LOGO} alt="Rift.lol" />
          <div className="rift-titlebar__names">
            <span className="rift-titlebar__name">RIFT<span className="rift-titlebar__lol">.LOL</span></span>
            <span className="rift-titlebar__ver">APP V.{appVersion}</span>
          </div>
        </div>
        <div className="rift-titlebar__nav">
          <button type="button" className="rift-titlebar__icon-btn" onClick={() => window.history.back()} aria-label={t('chrome.back')}>
            <IconBack />
          </button>
          <button type="button" className="rift-titlebar__icon-btn" onClick={() => window.history.forward()} aria-label={t('chrome.forward')}>
            <IconFwd />
          </button>
          <button type="button" className="rift-titlebar__icon-btn" onClick={() => window.location.reload()} aria-label={t('chrome.refresh')}>
            <IconRefresh />
          </button>
        </div>
      </div>

      <div className="rift-titlebar__search-wrap" onDoubleClick={(e) => e.stopPropagation()}>
        <form className="rift-titlebar__search" onSubmit={submitSearch}>
          <svg className="rift-titlebar__search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchHint(''); }}
            onFocus={() => { setRecent(readRecentPlayers()); setSearchOpen(true); }}
            onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
            placeholder={t('chrome.searchPlaceholder')}
            spellCheck={false}
          />
        </form>
        {searchOpen && (searchHint || recent.length > 0) && (
          <div className="rift-titlebar__recent">
            {searchHint && <div className="rift-titlebar__search-hint">{searchHint}</div>}
            {recent.length > 0 && <div className="rift-titlebar__recent-label">{t('chrome.recent')}</div>}
            {recent.map((id) => (
              <button
                key={id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setQuery(id); goToPlayer(id); }}
              >
                {id}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rift-titlebar__right" onDoubleClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`rift-titlebar__premium${isPremium ? ' is-owned' : ''}`}
          onClick={() => navigate('/premium')}
        >
          {isPremium ? t('nav.premium') : t('chrome.getPremium')}
        </button>
        <button type="button" className="rift-titlebar__feedback" onClick={() => setFeedbackOpen(true)}>
          <IconBug />
          {t('chrome.feedback')}
        </button>
        <label className="rift-titlebar__lang">
          <span className="rift-titlebar__lang-label">{t('lang.label')}</span>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            aria-label={t('lang.label')}
          >
            {locales.map((item) => (
              <option key={item.id} value={item.id}>{item.native}</option>
            ))}
          </select>
        </label>
        <button type="button" className="rift-titlebar__icon-btn" onClick={() => navigate('/link-account')} aria-label={t('chrome.settings')}>
          <IconGear />
        </button>
        <button
          type="button"
          className="rift-titlebar__profile"
          onClick={() => navigate(session ? '/' : '/link-account')}
        >
          {session ? `${session.gameName}#${session.tagLine}` : t('chrome.linkAccount')}
        </button>

        {hasWindowApi && (
          <div className="rift-titlebar__win">
            <button type="button" className="rift-win-btn" onClick={() => window.windowControls.minimize()} aria-label={t('chrome.minimize')}>
              <svg viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.2"/></svg>
            </button>
            <button type="button" className="rift-win-btn rift-win-btn--close" onClick={() => window.windowControls.close()} aria-label={t('chrome.closeTray')} title={t('chrome.closeTray')}>
              <svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3 3 9" stroke="currentColor" strokeWidth="1.2"/></svg>
            </button>
          </div>
        )}
      </div>
      <FeedbackForm open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </header>
  );
}
