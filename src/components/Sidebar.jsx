import React from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/LocaleContext';
import { usePremium } from '../state/PremiumContext';
import './Sidebar.css';

function IconHome() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.5 9.2 10 3.5l6.5 5.7V16a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16V9.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 17.5v-5h4v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconList() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 5.5h12M4 10h12M4 14.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconLive() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="3" fill="currentColor"/>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" opacity="0.55"/>
    </svg>
  );
}
function IconLink() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M8.2 11.8a3.4 3.4 0 0 0 4.8 0l2-2a3.4 3.4 0 0 0-4.8-4.8l-1.1 1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11.8 8.2a3.4 3.4 0 0 0-4.8 0l-2 2a3.4 3.4 0 1 0 4.8 4.8l1.1-1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconReplay() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8.2 7.2v5.6L13.2 10 8.2 7.2Z" fill="currentColor"/>
    </svg>
  );
}
function IconGrid() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="11" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function IconWatch() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5Z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function IconCollection() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 6.5h12v9.2a1.3 1.3 0 0 1-1.3 1.3H5.3A1.3 1.3 0 0 1 4 15.7V6.5Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 6.5V5.2A1.7 1.7 0 0 1 8.7 3.5h2.6A1.7 1.7 0 0 1 13 5.2v1.3" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function IconEsports() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6.5 13.5 4 16.2M13.5 13.5 16 16.2M10 3.5v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="10" cy="10.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function IconChamp() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3.2 12.4 8l5.2.5-3.9 3.4 1.2 5.1L10 14.4 5.1 17l1.2-5.1L2.4 8.5 7.6 8 10 3.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}
function IconTier() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 14.5h12M6.2 11h7.6M8 7.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10 3.2 12.1 7.4 16.8 8l-3.4 3.1.9 4.6L10 13.6 5.7 15.7l.9-4.6L3.2 8l4.7-.6L10 3.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}
function IconCompare() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6 4.5v11M14 4.5v11M3.5 8.5H8.5M11.5 11.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconHistory() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 7.2v3.5l2.4 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconDraft() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="5.2" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="11.3" y="4.5" width="5.2" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6.1 8h0M6.1 11h0M13.9 8h0M13.9 11h0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function IconStudio() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.5 14.5 7 9.5l3 3 6.5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3.5 16.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconLens() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 3.8v1.6M10 14.6v1.6M3.8 10h1.6M14.6 10h1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const NAV_GROUPS = [
  {
    labelKey: 'nav.core',
    items: [
      { to: '/', labelKey: 'nav.dashboard', icon: <IconHome />, end: true },
      { to: '/history', labelKey: 'nav.history', icon: <IconHistory /> },
      { to: '/champions', labelKey: 'nav.champions', icon: <IconChamp /> },
      { labelKey: 'nav.tierList', icon: <IconTier />, soon: true },
      { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: <IconList /> },
      { to: '/live', labelKey: 'nav.live', icon: <IconLive /> },
      { to: '/compare', labelKey: 'nav.compare', icon: <IconCompare /> },
    ],
  },
  {
    labelKey: 'nav.app',
    items: [
      { to: '/link-account', labelKey: 'nav.link', icon: <IconLink /> },
      { to: '/draft', labelKey: 'nav.draft', icon: <IconDraft /> },
      { labelKey: 'nav.replays', icon: <IconReplay />, soon: true },
      { to: '/overlays', labelKey: 'nav.overlays', icon: <IconGrid /> },
      { to: '/spectate', labelKey: 'nav.spectate', icon: <IconWatch /> },
      { to: '/collections', labelKey: 'nav.collections', icon: <IconCollection /> },
    ],
  },
  {
    labelKey: 'nav.insights',
    items: [
      { to: '/pros', labelKey: 'nav.esports', icon: <IconEsports /> },
      { to: '/studio', labelKey: 'nav.studio', icon: <IconStudio />, gated: true },
      { to: '/lens', labelKey: 'nav.lens', icon: <IconLens />, gated: true },
    ],
  },
];

const PLAYER_PATHS = new Set(['/', '/history', '/champions', '/live', '/studio', '/lens']);

function playerNavTo(to, searchParams) {
  if (!PLAYER_PATHS.has(to)) return to;
  const name = searchParams.get('name');
  const tag = searchParams.get('tag');
  const q = searchParams.get('q');
    if (name) {
      return `${to}?name=${encodeURIComponent(name)}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`;
    }
  if (q) return `${to}?q=${encodeURIComponent(q)}`;
  return to;
}

export default function Sidebar() {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const { isPremium } = usePremium();
  const showLock = !isPremium;

  return (
    <aside className="rift-sidebar">
      <nav className="rift-sidebar__nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="rift-sidebar__group">
            <div className="rift-sidebar__group-label">{t(group.labelKey)}</div>
            {group.items.map((item) => (
              item.soon ? (
                <span key={item.labelKey} className="rift-sidebar__link rift-sidebar__link--soon">
                  <span className="rift-sidebar__icon">{item.icon}</span>
                  {t(item.labelKey)}
                  <span className="rift-sidebar__soon">{t('nav.soon')}</span>
                </span>
              ) : (
                <NavLink
                  key={item.to}
                  to={playerNavTo(item.to, searchParams)}
                  end={item.end}
                  className={({ isActive }) =>
                    `rift-sidebar__link${isActive ? ' rift-sidebar__link--active' : ''}`
                  }
                >
                  <span className="rift-sidebar__icon">{item.icon}</span>
                  {t(item.labelKey)}
                  {showLock && item.gated ? (
                    <span className="rift-sidebar__lock" aria-hidden>
                      <svg viewBox="0 0 12 12" fill="none">
                        <rect x="2.25" y="5.25" width="7.5" height="5.25" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M4 5.25V3.7a2 2 0 0 1 4 0v1.55" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </span>
                  ) : null}
                </NavLink>
              )
            ))}
          </div>
        ))}
      </nav>
      <NavLink
        to="/premium"
        className={({ isActive }) =>
          `rift-sidebar__premium${isActive ? ' is-on' : ''}${isPremium ? ' is-owned' : ''}`
        }
      >
        {isPremium ? t('nav.premium') : t('chrome.getPremium')}
      </NavLink>
    </aside>
  );
}
