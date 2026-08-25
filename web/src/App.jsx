import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import Home from './pages/Home';
import Profile from './pages/Profile';
import TierList from './pages/TierList';
import ChampionDetail from './pages/ChampionDetail';
import Leaderboard from './pages/Leaderboard';
import Dashboard from './pages/Dashboard';

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
    blurb: 'Best champion duos and lane synergies — coming soon.',
    icon: 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Tristana.png',
    ready: false,
  },
  {
    to: '/tierlist/arena',
    title: 'Arena',
    blurb: 'Arena mode tier list — coming soon.',
    icon: 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Sett.png',
    ready: false,
  },
  {
    to: '/tierlist/aram',
    title: 'ARAM',
    blurb: 'ARAM tier list — coming soon.',
    icon: 'https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Braum.png',
    ready: false,
  },
];

const LB_MENU = [
  {
    to: '/leaderboard?tier=challenger',
    title: 'Challenger',
    blurb: 'Top Solo/Duo Challenger ladder by region.',
    ready: true,
  },
  {
    to: '/leaderboard?tier=grandmaster',
    title: 'Grandmaster',
    blurb: 'Grandmaster ladder standings.',
    ready: true,
  },
  {
    to: '/leaderboard?tier=master',
    title: 'Master',
    blurb: 'Master ladder standings.',
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

  const tierActive = location.pathname.startsWith('/tierlist');
  const lbActive = location.pathname.startsWith('/leaderboard');
  const dashActive = location.pathname.startsWith('/dashboard');
  const wideMain = dashActive;

  return (
    <div className="site-shell">
      <nav className="topnav">
        <div className="topnav-inner">
          <Link className="brand" to="/" onClick={() => setOpenMenu(null)}>
            <img src="./icon.png" alt="" />
            RIFT.LOL
          </Link>
          <div className="topnav-links">
            <NavLink to="/dashboard" onClick={() => setOpenMenu(null)}>Dashboard</NavLink>
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
            <NavLink to="/profile" onClick={() => setOpenMenu(null)}>Profile</NavLink>
          </div>
          <div className="topnav-actions">
            {session ? (
              <Link className="pill" to="/dashboard">
                {session.gameName}#{session.tagLine}
              </Link>
            ) : (
              <Link className="btn btn-violet btn-sm" to="/profile">Link profile</Link>
            )}
            <a className="btn btn-gold btn-sm" href="../index.html">Get App</a>
          </div>
        </div>
      </nav>

      <main className={`site-main${wideMain ? ' is-wide' : ''}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/tierlist" element={<TierList />} />
          <Route path="/tierlist/synergy" element={<ComingSoon title="Synergy" blurb="Find the best champion duos and lane pairings." />} />
          <Route path="/tierlist/arena" element={<ComingSoon title="Arena" blurb="Arena mode tier list for the live patch." />} />
          <Route path="/tierlist/aram" element={<ComingSoon title="ARAM" blurb="Howling Abyss ARAM tier list." />} />
          <Route path="/tierlist/:champion" element={<ChampionDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </main>

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
              <Link to="/profile">Link profile</Link>
            </div>
            <div>
              <h4>Product</h4>
              <a href="../index.html">Desktop app</a>
              <a href="../roadmap.html">Roadmap</a>
              <a href="../index.html#premium">Premium</a>
            </div>
            <div>
              <h4>Support</h4>
              <a href="../privacy.html">Privacy</a>
              <a href="../terms.html">Terms</a>
              <a href="https://x.com/RIFT_LOL_" target="_blank" rel="noreferrer">Twitter / X</a>
            </div>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} Rift.lol</span>
          <span className="muted">Not endorsed by Riot Games</span>
        </div>
      </footer>
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
