import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { startPremiumCheckout } from '../api';
import { sitePageUrl } from '../getAppUrl';
import CommunityBlock from '../components/CommunityBlock';
import './GetApp.css';

const VERSION = '0.1.22';
const GITHUB = 'sousabot/rift-desktop';
const DEVICE_KEY = 'rift-web-device-id';

function docsAsset(rel) {
  const clean = String(rel || '').replace(/^\.\//, '');
  if (import.meta.env.DEV) return `/site/${clean}`;
  return `../${clean}`;
}

function webDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `web-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `web-${Date.now()}`;
  }
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Jump({ to, children, className }) {
  return (
    <a
      className={className}
      href={`#${to}`}
      onClick={(e) => {
        e.preventDefault();
        scrollToId(to);
      }}
    >
      {children}
    </a>
  );
}

export default function GetApp() {
  const [searchParams] = useSearchParams();
  const [busyPlan, setBusyPlan] = useState('');
  const [checkoutError, setCheckoutError] = useState('');

  const setupUrl = useMemo(
    () => `https://github.com/${GITHUB}/releases/download/v${VERSION}/Rift.lol-Setup-${VERSION}.exe`,
    [],
  );

  useEffect(() => {
    const section = searchParams.get('section');
    if (!section) return undefined;
    const t = setTimeout(() => scrollToId(section), 80);
    return () => clearTimeout(t);
  }, [searchParams]);

  const buyPremium = async (plan) => {
    setCheckoutError('');
    setBusyPlan(plan);
    try {
      const session = await startPremiumCheckout({
        plan,
        deviceId: webDeviceId(),
      });
      if (session?.url) {
        window.location.href = session.url;
        return;
      }
      setCheckoutError('Checkout did not return a payment link.');
    } catch (err) {
      setCheckoutError(err.message || 'Could not start Premium checkout.');
    } finally {
      setBusyPlan('');
    }
  };

  return (
    <div className="ga-page">
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <h1>
              Win more.
              <br />
              <span className="gold">Think less.</span>
            </h1>
            <p className="lead">
              You’re not hardstuck — you’re playing blind. Rift.lol reads your ranked games,
              drafts, and fights with you — so you climb with real numbers, not vibes.
            </p>
            <div className="hero-cta">
              <Jump className="btn btn-gold btn-xl" to="premium">Get the app</Jump>
              <Jump className="link-discover" to="inside">
                Discover
                <svg className="link-discover__arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M2.5 7h7.2M6.8 3.2 10.6 7 6.8 10.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Jump>
            </div>
            <p className="hero-price">Unlock Premium first · then download the Windows app · Cancel anytime</p>
            <div className="hero-meta">
              <span>Windows</span>
              <i />
              <span>Standalone app</span>
              <i />
              <span>Riot compliant</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="app-glow">
              <img
                src={docsAsset('screens/app-dashboard.png')}
                alt="Rift.lol dashboard"
                width={1280}
                height={800}
              />
            </div>
          </div>
        </div>
      </header>

      <section className="inside" id="inside">
        <p className="section-kicker">Inside the app</p>
        <h2 className="section-title">Everything you need to actually climb.</h2>
        <p className="section-sub">
          You draft ahead, read every fight, and never lose the context — while you focus on getting better.
        </p>
      </section>

      <section className="feature" id="features">
        <div className="feature-inner">
          <div className="feature-copy">
            <span className="feature-num" aria-hidden="true">01</span>
            <p className="feature-label">Draft assistant</p>
            <h3>Win the game in champ select</h3>
            <p>
              Live draft lean, pick grades, and Emerald+ ranked builds — runes, summoners,
              starters, and skill order ready to send into League.
            </p>
            <ul className="check-list">
              <li>Draft win probability &amp; team comps</li>
              <li>Most played / alt / situational builds</li>
              <li>One-click runes &amp; items into League</li>
            </ul>
            <a className="btn btn-gold" href="#premium" onClick={(e) => { e.preventDefault(); scrollToId('premium'); }}>Get the app →</a>
          </div>
          <div className="feature-media">
            <img src={docsAsset('screens/app-draft.png')} alt="Draft assistant" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="feature">
        <div className="feature-inner">
          <div className="feature-copy">
            <span className="feature-num" aria-hidden="true">02</span>
            <p className="feature-label">In-game overlay</p>
            <h3>See the fight before it starts</h3>
            <p>
              The reads that separate a good player from a hardstuck one — live on your screen
              the moment they matter. Stop guessing at fights, timers, and builds.
            </p>
            <ul className="check-list">
              <li>Win probability &amp; gold lead</li>
              <li>Objective timers</li>
              <li>Item &amp; build suggestions</li>
              <li>Skill-up &amp; trinket reminders</li>
            </ul>
            <p className="feature-footnote">Plenty more overlays · drag any of them anywhere</p>
            <a className="btn btn-gold" href="#premium" onClick={(e) => { e.preventDefault(); scrollToId('premium'); }}>Get the app →</a>
          </div>
          <div className="feature-media">
            <img src={docsAsset('screens/app-overlays.png')} alt="In-game overlays" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="feature is-flip">
        <div className="feature-inner">
          <div className="feature-copy">
            <span className="feature-num" aria-hidden="true">03</span>
            <p className="feature-label">Ranked dashboard</p>
            <h3>Your climb, reviewed like a coach</h3>
            <p>
              Rank, LP, KDA, rift score, KP, CS/min, vision, gold @15 — plus live status and
              recent Solo/Duo form on one screen.
            </p>
            <ul className="check-list">
              <li>Peak, MMR estimate &amp; winrate</li>
              <li>Per-game early / mid / late review</li>
              <li>Search any Name#TAG</li>
            </ul>
            <a className="btn btn-gold" href="#premium" onClick={(e) => { e.preventDefault(); scrollToId('premium'); }}>Get the app →</a>
          </div>
          <div className="feature-media">
            <img src={docsAsset('screens/app-dashboard.png')} alt="Ranked dashboard" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="feature">
        <div className="feature-inner">
          <div className="feature-copy">
            <span className="feature-num" aria-hidden="true">04</span>
            <p className="feature-label">Collections</p>
            <h3>Every skin, valued from the client</h3>
            <p>
              Pull your owned skins straight from the League client — rarity breakdown, RP total,
              and a grid that feels like your wardrobe, not a spreadsheet.
            </p>
            <ul className="check-list">
              <li>Owned vs total skins</li>
              <li>Account value in RP</li>
              <li>Rarity chips &amp; quick search</li>
            </ul>
            <a className="btn btn-gold" href="#premium" onClick={(e) => { e.preventDefault(); scrollToId('premium'); }}>Get the app →</a>
          </div>
          <div className="feature-media">
            <img src={docsAsset('screens/app-collections.png')} alt="Collections" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="feature is-flip">
        <div className="feature-inner">
          <div className="feature-copy">
            <span className="feature-num" aria-hidden="true">05</span>
            <p className="feature-label">Rift Lens · Premium</p>
            <h3>See the fight before it starts</h3>
            <p>
              Lens breaks fighting, laning, objectives, vision, and team impact across your last
              games — with sparklines and rank benchmarks.
            </p>
            <ul className="check-list">
              <li>Damage / min by game phase</li>
              <li>Kill participation vs ranks</li>
              <li>Duels, skirmishes &amp; multi-kills</li>
            </ul>
            <Jump className="btn btn-gold" to="premium">Get Premium →</Jump>
          </div>
          <div className="feature-media">
            <img src={docsAsset('screens/app-lens.png')} alt="Rift Lens" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="premium" id="premium">
        <p className="section-kicker">Step 1 · Premium</p>
        <h2 className="section-title">Everything you unlock</h2>
        <p className="section-sub">
          Premium unlocks the full Windows desktop app — overlays, draft, spectate, Lens, Data Studio,
          and everything else. The website stays free for browsing stats.
        </p>

        <div className="unlock-table" role="table" aria-label="Free vs Premium">
          <div className="unlock-tr unlock-tr--head" role="row">
            <span role="columnheader">What’s included</span>
            <span role="columnheader">Free</span>
            <span role="columnheader">Premium</span>
          </div>

          <div className="unlock-tr unlock-tr--group" role="row">
            <span>Desktop app</span>
          </div>
          {[
            'In-game overlay',
            'Draft assistant',
            'Auto-clips & recorder',
            'Spectate pros in 1 click',
            'Skin collection value',
            'Dashboard & live status',
            'Compare & esports ladders',
          ].map((name) => (
            <div className="unlock-tr" role="row" key={name}>
              <span>{name}</span>
              <span className="unlock-no" aria-label="Not included">—</span>
              <span className="unlock-yes" aria-label="Included">✓</span>
            </div>
          ))}
          <div className="unlock-tr" role="row">
            <span>Game analyzer</span>
            <span className="unlock-no" aria-label="Not included">—</span>
            <span className="unlock-soon">Soon</span>
          </div>

          <div className="unlock-tr unlock-tr--group" role="row">
            <span>Stats &amp; analysis</span>
          </div>
          {[
            ['Match history & champion stats', true],
            ['Builds, runes & tier lists', true],
            ['Leaderboards, OTPs & scouting', true],
            ['Rift Lens — deep gameplay stats', false],
            ['Data Studio', false],
          ].map(([name, free]) => (
            <div className="unlock-tr" role="row" key={name}>
              <span>{name}</span>
              <span className={free ? 'unlock-yes' : 'unlock-no'} aria-label={free ? 'Included' : 'Not included'}>
                {free ? '✓' : '—'}
              </span>
              <span className="unlock-yes" aria-label="Included">✓</span>
            </div>
          ))}

          <div className="unlock-tr unlock-tr--group" role="row">
            <span>Website</span>
          </div>
          {[
            'Browse any Name#TAG',
            'Public leaderboards & scouting',
          ].map((name) => (
            <div className="unlock-tr" role="row" key={name}>
              <span>{name}</span>
              <span className="unlock-yes" aria-label="Included">✓</span>
              <span className="unlock-yes" aria-label="Included">✓</span>
            </div>
          ))}
        </div>

        <div className="price-row">
          <article className="price-card">
            <h3>1 month</h3>
            <p className="price">€4.99<span>/mo</span></p>
            <p className="price-note">Billed monthly · No commitment</p>
            <button
              type="button"
              className="btn btn-gold btn-block"
              disabled={Boolean(busyPlan)}
              onClick={() => buyPremium('month')}
            >
              {busyPlan === 'month' ? 'Opening checkout…' : 'Get Premium · €4.99'}
            </button>
          </article>
          <article className="price-card is-hot">
            <span className="dl-badge">Most popular</span>
            <h3>6 months</h3>
            <p className="price">€19.99<span>/6 mo</span></p>
            <p className="price-note">€3.33/mo · Save 33%</p>
            <button
              type="button"
              className="btn btn-gold btn-block"
              disabled={Boolean(busyPlan)}
              onClick={() => buyPremium('six')}
            >
              {busyPlan === 'six' ? 'Opening checkout…' : 'Get Premium · €19.99'}
            </button>
          </article>
          <article className="price-card">
            <h3>1 year</h3>
            <p className="price">€35.99<span>/yr</span></p>
            <p className="price-note">€3.00/mo · Save 40%</p>
            <button
              type="button"
              className="btn btn-gold btn-block"
              disabled={Boolean(busyPlan)}
              onClick={() => buyPremium('year')}
            >
              {busyPlan === 'year' ? 'Opening checkout…' : 'Get Premium · €35.99'}
            </button>
          </article>
        </div>
        {checkoutError ? (
          <p className="section-sub" role="alert" style={{ color: '#ff8f8f', marginTop: '1rem' }}>
            {checkoutError}
          </p>
        ) : null}
        <div className="price-trust">
          <span>Secure checkout</span>
          <span>Cancel anytime</span>
          <span>Full desktop app</span>
          <span>Everything included</span>
        </div>
      </section>

      <section className="download" id="download">
        <p className="section-kicker">Step 2 · Download</p>
        <h2 className="section-title">Get Rift.lol for Windows</h2>
        <p className="section-sub">
          After checkout, install the app and activate Premium with your Stripe session id.
        </p>
        <div className="dl-row dl-row--single">
          <article className="dl-card is-hot">
            <h3>Installer</h3>
            <p>Shortcut, uninstaller, and in-app updates when a new version ships.</p>
            <a className="btn btn-gold btn-block" href={setupUrl}>Download Setup</a>
            <code className="dl-file">Rift.lol-Setup-{VERSION}.exe</code>
          </article>
        </div>
        <ol className="section-sub" style={{ textAlign: 'left', maxWidth: 520, margin: '1.25rem auto 0', paddingLeft: '1.2rem' }}>
          <li>Finish Stripe checkout (you’ll see a session id like <code>cs_…</code>)</li>
          <li>Open Rift.lol → <strong>Premium</strong> in the sidebar</li>
          <li>Paste the session id → tap <strong>Verify payment</strong></li>
        </ol>
        <p className="dl-note">
          <span>v{VERSION}</span>
          {' '}
          · Windows 10/11 · Unsigned beta — SmartScreen:
          {' '}
          <strong>More info → Run anyway</strong>
          .
          Overlays need Borderless or Windowed in League (Esc → Video).
        </p>
      </section>

      <section className="faq" id="faq">
        <p className="section-kicker">FAQ</p>
        <h2 className="section-title">Everything you need to know</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary>What is Rift Premium?</summary>
            <p>
              Premium unlocks the full Rift.lol Windows desktop app — overlays, draft, spectate,
              collections, Lens, Data Studio, and everything we ship. The website stays free for
              browsing match history, builds, and leaderboards.
            </p>
          </details>
          <details className="faq-item">
            <summary>Does the app work on Windows and Mac?</summary>
            <p>Rift.lol is Windows-only for now (Windows 10/11).</p>
          </details>
          <details className="faq-item">
            <summary>Is the Rift app allowed by Riot?</summary>
            <p>Yes. Rift uses Riot’s official APIs and League’s local Live Client Data for overlays.</p>
          </details>
          <details className="faq-item">
            <summary>How do I activate Premium after paying on the website?</summary>
            <p>
              Stripe shows a checkout session id (<code>cs_…</code>) on the success page. Open the
              desktop app → <strong>Premium</strong> → paste that id → <strong>Verify payment</strong>.
              That unlocks Lens and Data Studio on this PC.
            </p>
          </details>
          <details className="faq-item">
            <summary>How do I get started?</summary>
            <p>
              Choose a Premium plan above, complete checkout, then download the Setup installer and
              activate in the app. If SmartScreen warns, click <strong>More info</strong>, then{' '}
              <strong>Run anyway</strong>.
            </p>
          </details>
        </div>
      </section>

      <p className="riot">
        Rift.lol isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games
        or anyone officially involved in producing or managing League of Legends.
      </p>

      <div className="ga-community">
        <CommunityBlock />
      </div>

      <div className="foot">
        <div className="foot-inner">
          <span>© {new Date().getFullYear()} Rift.lol</span>
          <span>
            <a href={sitePageUrl('privacy.html')}>Privacy</a>
            {' · '}
            <a href={sitePageUrl('terms.html')}>Terms</a>
            {' · '}
            <Link to="/roadmap">Roadmap</Link>
          </span>
        </div>
      </div>

      <div className="sticky-bar" aria-label="Premium offer">
        <div className="sticky-inner">
          <div className="sticky-copy">
            <img src={docsAsset('logo-mark.png')} alt="" width={22} height={22} />
            <span>Rift Premium — full desktop app from <strong>€4.99/mo</strong></span>
          </div>
          <Jump className="btn btn-gold btn-sm" to="premium">Get Premium →</Jump>
        </div>
      </div>
    </div>
  );
}
