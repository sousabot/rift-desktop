import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import Home from './pages/Home';
import Profile from './pages/Profile';
import TierList from './pages/TierList';
import ChampionDetail from './pages/ChampionDetail';
import Leaderboard from './pages/Leaderboard';
import Dashboard from './pages/Dashboard';
import DataStudio from './pages/DataStudio';
import Esports from './pages/Esports';
import Synergy from './pages/Synergy';
import Arena from './pages/Arena';
import Aram from './pages/Aram';
import Scouting from './pages/Scouting';
import GetApp from './pages/GetApp';
import Roadmap from './pages/Roadmap';
import { getAppUrl, sitePageUrl } from './getAppUrl';
import CommunityBlock from './components/CommunityBlock';

const TIER_MENU = [
  {
    to: '/tierlist',
    title: 'Ranked',
    blurb: 'Solo/Duo tier list and builds for every role on the live patch.',
    icon: 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Lulu.png',
    ready: true,
  },
  {
    to: '/tierlist/synergy',
    title: 'Synergy',
    blurb: 'Best champion duos and lane synergies by role pair.',
    icon: 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Tristana.png',
    ready: true,
  },
  {
    to: '/tierlist/arena',
    title: 'Arena',
    blurb: 'Arena mode tier list for the live patch.',
    icon: 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Sett.png',
    ready: true,
  },
  {
    to: '/tierlist/aram',
    title: 'ARAM',
    blurb: 'Howling Abyss ARAM tier list for the live patch.',
    icon: 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Braum.png',
    ready: true,
  },
];

const LB_MENU = [
  {
    to: '/leaderboard?mode=soloq&tier=challenger',
    title: 'SoloQ',
    blurb: 'Ranked Solo/Duo ladder from every region.',
    ready: true,
  },
  {
    to: '/leaderboard?mode=flex&tier=challenger',
    title: 'Flex',
    blurb: 'Ranked Flex ladder standings by region.',
    ready: true,
  },
  {
    to: '/leaderboard?mode=otps',
    title: 'OTPs',
    blurb: 'One-tricks ranked by SoloQ LP.',
    ready: true,
  },
  {
    to: '/leaderboard?mode=aram',
    title: 'ARAM',
    blurb: 'Howling Abyss ladder — on the roadmap.',
    ready: true,
  },
];

function Chevron({ open }) {
  return (
    <svg className={`nav-chevron${open ? ' is-open' : ''}`} viewBox="0 0 12 12" aria-hidden="true">
      <path fill="currentColor" d="M2.2 4.2 6 8l3.8-3.8L11 5.4 6 10.4 1 5.4z" />
    </svg>
  );
}

function NavDropdown({ id, label, active, items, open, onToggle, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div className={`nav-dd${active ? ' is-active' : ''}${open ? ' is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="nav-dd-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span>{label}</span>
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="nav-dd-menu" id={id} role="menu">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              className={`nav-dd-item${!item.ready ? ' is-soon' : ''}`}
              onClick={onClose}
            >
              {item.icon ? <img src={item.icon} alt="" /> : <span className="nav-dd-dot" />}
              <span>
                <strong>
                  {item.title}
                  {!item.ready ? <em>Soon</em> : null}
                </strong>
                <small>{item.blurb}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ComingSoon({ title, blurb }) {
  return (
    <div className="soon-page">
      <header className="page-head">
        <h1>{title}</h1>
        <p>{blurb}</p>
      </header>
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          This mode is on the roadmap. Ranked Solo/Duo tier list is live now.
        </p>
        <Link className="btn btn-violet" to="/tierlist" style={{ marginTop: 14, display: 'inline-flex' }}>
          Open Ranked tier list
        </Link>
      </div>
    </div>
  );
}

function Shell() {
  const { session } = useSession();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(null);
  const [navOpen, setNavOpen] = useState(false);

  const closeNav = () => {
    setOpenMenu(null);
    setNavOpen(false);
  };

  useEffect(() => { closeNav(); }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('nav-locked', navOpen);
    return () => document.body.classList.remove('nav-locked');
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeNav();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const tierActive = location.pathname.startsWith('/tierlist');
  const lbActive = location.pathname.startsWith('/leaderboard');
  const dashActive = location.pathname.startsWith('/dashboard');
  const studioActive = location.pathname.startsWith('/data-studio');
  const esportsActive = location.pathname.startsWith('/esports');
  const scoutingActive = location.pathname.startsWith('/scouting');
  const getAppActive = location.pathname.startsWith('/get-app');
  const wideMain = dashActive || studioActive || esportsActive || scoutingActive || getAppActive;

  return (
    <div className="site-shell">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link className="brand" to="/" onClick={closeNav}>
            <img src="./icon.png" alt="" />
            RIFT.LOL
          </Link>
          <div className="topnav-links">
            <NavLink to="/dashboard" onClick={closeNav}>Dashboard</NavLink>
            <NavDropdown
              id="nav-tier-menu"
              label="Tierlist & Builds"
              active={tierActive}
              items={TIER_MENU}
              open={openMenu === 'tier'}
              onToggle={() => setOpenMenu((v) => (v === 'tier' ? null : 'tier'))}
              onClose={() => setOpenMenu(null)}
            />
            <NavDropdown
              id="nav-lb-menu"
              label="Leaderboards"
              active={lbActive}
              items={LB_MENU}
              open={openMenu === 'lb'}
              onToggle={() => setOpenMenu((v) => (v === 'lb' ? null : 'lb'))}
              onClose={() => setOpenMenu(null)}
            />
            <span className="topnav-divider" aria-hidden="true" />
            <NavLink to="/scouting" onClick={closeNav}>Scouting</NavLink>
            <NavLink to="/data-studio" onClick={closeNav}>Data Studio</NavLink>
            <NavLink to="/esports" onClick={closeNav}>Esports</NavLink>
            <NavLink to="/profile" onClick={closeNav}>Profile</NavLink>
          </div>
          <div className="topnav-actions">
            {session ? (
              <Link className="pill" to="/dashboard" onClick={closeNav}>
                {session.gameName}#{session.tagLine}
              </Link>
            ) : (
              <Link className="btn btn-violet btn-sm topnav-link-profile" to="/profile" onClick={closeNav}>
                Link profile
              </Link>
            )}
            <Link className={`btn btn-gold btn-sm${getAppActive ? ' is-on' : ''}`} to={getAppUrl()} onClick={closeNav}>
              Get App
            </Link>
            <button
              type="button"
              className={`nav-burger${navOpen ? ' is-open' : ''}`}
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((v) => !v)}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
        {navOpen ? (
          <div className="nav-drawer" role="dialog" aria-label="Site menu">
            <button type="button" className="nav-drawer-backdrop" aria-label="Close menu" onClick={closeNav} />
            <div className="nav-drawer-panel">
              <NavLink to="/dashboard" onClick={closeNav}>Dashboard</NavLink>
              <NavLink to="/scouting" onClick={closeNav}>Scouting</NavLink>
              <NavLink to="/data-studio" onClick={closeNav}>Data Studio</NavLink>
              <NavLink to="/esports" onClick={closeNav}>Esports</NavLink>
              <NavLink to="/roadmap" onClick={closeNav}>Roadmap</NavLink>
              <p>Tierlist &amp; Builds</p>
              {TIER_MENU.map((item) => (
                <Link key={item.to} to={item.to} onClick={closeNav}>{item.title}</Link>
              ))}
              <p>Leaderboards</p>
              {LB_MENU.map((item) => (
                <Link key={item.to} to={item.to} onClick={closeNav}>{item.title}</Link>
              ))}
              <p>Account</p>
              {session ? (
                <Link to="/dashboard" onClick={closeNav}>{session.gameName}#{session.tagLine}</Link>
              ) : (
                <Link to="/profile" onClick={closeNav}>Link profile</Link>
              )}
              <Link className="nav-drawer-app" to={getAppUrl()} onClick={closeNav}>Get the app</Link>
            </div>
          </div>
        ) : null}
      </nav>

      <main className={`site-main${wideMain ? ' is-wide' : ''}${getAppActive ? ' is-landing' : ''}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/tierlist" element={<TierList />} />
          <Route path="/tierlist/synergy" element={<Synergy />} />
          <Route path="/tierlist/arena" element={<Arena />} />
          <Route path="/tierlist/aram" element={<Aram />} />
          <Route path="/tierlist/:champion" element={<ChampionDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/scouting" element={<Scouting />} />
          <Route path="/get-app" element={<GetApp />} />
          <Route path="/data-studio" element={<DataStudio />} />
          <Route path="/esports" element={<Esports />} />
          <Route path="/roadmap" element={<Roadmap />} />
        </Routes>
      </main>

      {!getAppActive ? (
      <footer className="foot">
        <div className="foot-inner foot-rich">
          <div className="foot-brand">
            <img src="./icon.png" alt="" width={36} height={36} />
            <div>
              <strong>RIFT.LOL</strong>
              <span className="muted">Win more. Think less.</span>
            </div>
          </div>
          <div className="foot-cols">
            <div>
              <h4>Explore</h4>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/tierlist">Tier list</Link>
              <Link to="/leaderboard">Leaderboards</Link>
              <Link to="/scouting">Scouting</Link>
              <Link to="/profile">Link profile</Link>
            </div>
            <div>
              <h4>Product</h4>
              <Link to={getAppUrl()}>Desktop app</Link>
              <Link to="/roadmap">Roadmap</Link>
              <Link to={getAppUrl('premium')}>Premium</Link>
            </div>
            <div>
              <h4>Support</h4>
              <a href={sitePageUrl('privacy.html')}>Privacy</a>
              <a href={sitePageUrl('terms.html')}>Terms</a>
              <a href="https://x.com/RIFT_LOL_" target="_blank" rel="noreferrer">Twitter / X</a>
            </div>
            <CommunityBlock />
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} Rift.lol</span>
          <span className="muted">Not endorsed by Riot Games</span>
        </div>
      </footer>
      ) : null}
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
