import React from 'react';
import { Link } from 'react-router-dom';
import { getAppUrl } from '../getAppUrl';
import './Roadmap.css';

const WEB_LIVE = [
  { to: '/dashboard', title: 'Player dashboards', blurb: 'Any Riot ID — rank, history, pool, insights.' },
  { to: '/tierlist', title: 'Ranked tier list', blurb: 'Live patch, every role, builds on champion pages.' },
  { to: '/tierlist/synergy', title: 'Synergy', blurb: 'Lane duos that actually win together.' },
  { to: '/tierlist/arena', title: 'Arena', blurb: 'Arena grades on the live patch.' },
  { to: '/tierlist/aram', title: 'ARAM', blurb: 'Howling Abyss champion grades.' },
  { to: '/leaderboard?mode=soloq&tier=challenger', title: 'SoloQ ladder', blurb: 'Challenger / GM / Master by region.' },
  { to: '/leaderboard?mode=otps', title: 'OTP board', blurb: 'One-tricks ranked by SoloQ LP.' },
  { to: '/scouting', title: 'Scouting', blurb: 'Master+ SoloQ. Click a metric, sort the lobby.' },
  { to: '/esports', title: 'Esports', blurb: 'Pro directory — open a player, jump to their ladder.' },
  { to: '/data-studio', title: 'Data Studio', blurb: 'Meta sliced by rank, region, and patch.' },
];

const APP_LIVE = [
  { title: 'Linked Riot ID', blurb: 'Your ranked dashboard, on this PC.' },
  { title: 'Live lobby scouting', blurb: 'Read the lobby before the game starts.' },
  { title: 'Draft + rune import', blurb: 'Pick, ban, and load a page into the client.' },
  { title: 'In-game overlays', blurb: 'HUD on the League window, not a second monitor.' },
  { title: 'Spectate', blurb: 'Watch a live game from the app.' },
  { title: 'Clips & VODs', blurb: 'Kill recaps, seekable recordings, replays library.' },
  { title: 'Collections', blurb: 'Skins you own, in one place.' },
  { title: 'Matchup VODs', blurb: 'This champ vs that champ, from high elo.' },
  { title: 'TFT comps', blurb: 'Live-set boards inside the app.' },
  { title: 'Studio & Lens', blurb: 'Premium deep stats while you play.' },
];

const NEXT = [
  {
    n: '01',
    surface: 'Web',
    title: 'A Flex ladder that is Flex',
    blurb: 'Flex is its own queue. Until the numbers are Flex, the page stays empty — we will not paint SoloQ as Flex.',
  },
  {
    n: '02',
    surface: 'Web',
    title: 'ARAM player ladder',
    blurb: 'Champion grades are live. A Howling Abyss ladder of players is next, same shape as SoloQ.',
  },
  {
    n: '03',
    surface: 'App',
    title: 'Signed Windows installer',
    blurb: 'SmartScreen should stop treating Rift like malware. Code signing, then a quieter first-run.',
  },
  {
    n: '04',
    surface: 'App',
    title: 'Overlay HUD that stays out of the way',
    blurb: 'Fewer panels fighting the map. Tighter defaults, more panels you can actually place.',
  },
  {
    n: '05',
    surface: 'App',
    title: 'Auto-updater that just works',
    blurb: 'Install once. Get the next build without hunting GitHub.',
  },
  {
    n: '06',
    surface: 'Web',
    title: 'The rest of the phone pass',
    blurb: 'Nav and the table pages fit a phone. Dashboard, studio, and filters still need that same pass.',
  },
];

const LATER = [
  { title: 'Follow & friends', blurb: 'Watch the players you already scout.' },
  { title: 'Build import to client', blurb: 'One click from a Rift page into League.' },
  { title: 'SEO summoner pages', blurb: 'Public URLs for profiles we already look up.' },
  { title: 'TFT on the website', blurb: 'Comps in the app today. The web should have them too.' },
  { title: 'Richer matchup VODs', blurb: 'More lanes, more patches, same lookup.' },
  { title: 'Profile tags', blurb: 'Light customization on a linked account.' },
];

function Jump({ href, children }) {
  return (
    <a className="rm-jump" href={href} onClick={(e) => {
      const id = href.slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }}>
      {children}
    </a>
  );
}

export default function Roadmap() {
  return (
    <div className="rm-page">
      <header className="rm-hero">
        <div className="rm-hero-copy">
          <p className="rm-kicker">Roadmap</p>
          <h1>What we are building.</h1>
          <p>
            A League stats website you can search, and a Windows app for overlays, draft, and VODs.
            This is the public plan. Dates move. The direction does not.
          </p>
          <div className="rm-jumps">
            <Jump href="#rm-next">Shipping next</Jump>
            <Jump href="#rm-live">Already live</Jump>
            <Jump href="#rm-later">Later</Jump>
          </div>
        </div>
        <div className="rm-hero-meta">
          <div className="rm-stat">
            <em>Website</em>
            <strong>{WEB_LIVE.length}</strong>
            <span>live surfaces</span>
          </div>
          <div className="rm-stat">
            <em>Windows app</em>
            <strong>v0.1.22</strong>
            <span>{APP_LIVE.length} live tools</span>
          </div>
          <div className="rm-stat is-next">
            <em>Shipping</em>
            <strong>{NEXT.length}</strong>
            <span>next bets</span>
          </div>
        </div>
      </header>

      <section className="rm-section" id="rm-next">
        <div className="rm-section-head">
          <p className="rm-kicker">Next</p>
          <h2>Shipping next</h2>
          <p>Six product bets. Not every idea in the repo.</p>
        </div>
        <div className="rm-next">
          {NEXT.map((item) => (
            <article key={item.n}>
              <header>
                <span className="rm-n">{item.n}</span>
                <span className={`rm-surface is-${item.surface.toLowerCase()}`}>{item.surface}</span>
              </header>
              <h3>{item.title}</h3>
              <p>{item.blurb}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rm-section" id="rm-live">
        <div className="rm-section-head">
          <p className="rm-kicker is-ok">Live</p>
          <h2>Already shipping</h2>
          <p>Updated 29 Aug 2026. Click a website row to open it.</p>
        </div>
        <div className="rm-live">
          <div className="rm-col">
            <div className="rm-col-head">
              <h3>On the website</h3>
              <span>Search anyone · no install</span>
            </div>
            <ul>
              {WEB_LIVE.map((item) => (
                <li key={item.to}>
                  <Link to={item.to}>
                    <strong>{item.title}</strong>
                    <span>{item.blurb}</span>
                    <i aria-hidden="true">›</i>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="rm-col">
            <div className="rm-col-head">
              <h3>In the Windows app</h3>
              <span>Overlays, draft, VODs on your PC</span>
            </div>
            <ul>
              {APP_LIVE.map((item) => (
                <li key={item.title}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.blurb}</span>
                  </div>
                </li>
              ))}
            </ul>
            <Link className="rm-app-btn" to={getAppUrl()}>Get the Windows app</Link>
          </div>
        </div>
      </section>

      <section className="rm-section" id="rm-later">
        <div className="rm-section-head">
          <p className="rm-kicker">Later</p>
          <h2>On the horizon</h2>
          <p>After the six above. Order can change.</p>
        </div>
        <ul className="rm-later">
          {LATER.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.blurb}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rm-out">
        <p className="rm-kicker">Not this year</p>
        <div className="rm-out-row">
          <h2>Valorant, and a native phone app.</h2>
          <p>
            The website should work on a phone. A separate iOS/Android client is not the plan.
            If that changes, this page changes first.
          </p>
        </div>
      </section>
    </div>
  );
}
