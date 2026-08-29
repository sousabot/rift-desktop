import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/LocaleContext';
import { usePremium } from '../state/PremiumContext';
import { useSession } from '../state/SessionContext';
import { PLANS } from '../lib/premium';
import './Premium.css';

const ROWS = [
  { group: 'premium.groupDesktop', items: [
    { name: 'premium.featOverlays', free: false, premium: true },
    { name: 'premium.featDraft', free: false, premium: true },
    { name: 'premium.featRecorder', free: false, premium: true },
    { name: 'premium.featSpectate', free: false, premium: true },
    { name: 'premium.featCollections', free: false, premium: true },
    { name: 'premium.featDash', free: false, premium: true },
    { name: 'premium.featLive', free: false, premium: true },
    { name: 'premium.featCompare', free: false, premium: true },
    { name: 'premium.featEsports', free: false, premium: true },
    { name: 'premium.featAnalyzer', free: false, premium: 'soon' },
  ] },
  { group: 'premium.groupStats', items: [
    { name: 'premium.featHistory', free: true, premium: true },
    { name: 'premium.featChamps', free: true, premium: true },
    { name: 'premium.featBoard', free: true, premium: true },
    { name: 'premium.featBuilds', free: true, premium: true },
    { name: 'premium.featLens', free: false, premium: true },
    { name: 'premium.featStudio', free: false, premium: true },
  ] },
  { group: 'premium.groupWeb', items: [
    { name: 'premium.featWebBrowse', free: true, premium: true },
    { name: 'premium.featWebScout', free: true, premium: true },
  ] },
];

function Cell({ value, t }) {
  if (value === 'soon') return <span className="pm-soon">{t('nav.soon')}</span>;
  if (value) return <span className="pm-yes" aria-label={t('premium.included')}>✓</span>;
  return <span className="pm-no">—</span>;
}

function planLabel(plan, t) {
  if (plan === 'month') return t('premium.planMonth');
  if (plan === 'year') return t('premium.planYear');
  if (plan === 'six') return t('premium.planSix');
  return t('premium.premium');
}

function sourceLabel(source, t) {
  if (source === 'stripe') return t('premium.sourceStripe');
  if (source === 'gift') return t('premium.sourceGift');
  if (source === 'demo') return t('premium.sourceDemo');
  return t('premium.sourceTester');
}

export default function Premium() {
  const { t } = useI18n();
  const { session: account } = useSession();
  const {
    isPremium,
    plan: activePlan,
    source,
    deviceId,
    activate,
  } = usePremium();

  const [selected, setSelected] = useState('six');
  const [stripeOn, setStripeOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingSession, setPendingSession] = useState('');
  const [sessionInput, setSessionInput] = useState('');
  const [giftInput, setGiftInput] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    const api = window.riftAPI;
    if (!api?.premiumStatus) {
      setStripeOn(false);
      return undefined;
    }
    api.premiumStatus().then((st) => {
      if (!cancelled) setStripeOn(!!st?.stripe);
    }).catch(() => {
      if (!cancelled) setStripeOn(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function startStripe() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const api = window.riftAPI;
      if (!api?.premiumCheckout) throw new Error(t('premium.needApp'));
      const checkout = await api.premiumCheckout({
        plan: selected,
        deviceId,
        riotId: account?.gameName && account?.tagLine
          ? `${account.gameName}#${account.tagLine}`
          : '',
      });
      setPendingSession(checkout.id || '');
      setSessionInput(checkout.id || '');
      setNotice(t('premium.stripeOpened'));
    } catch (err) {
      setError(err?.message || t('premium.checkoutFail'));
    } finally {
      setBusy(false);
    }
  }

  async function verifyPayment() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const api = window.riftAPI;
      const id = (sessionInput || pendingSession || '').trim();
      if (!id) throw new Error(t('premium.needSession'));
      if (!api?.premiumRedeem) throw new Error(t('premium.needApp'));
      const result = await api.premiumRedeem({ sessionId: id, deviceId });
      activate({
        plan: result.plan || selected,
        source: 'stripe',
        license: result.license,
        sessionId: result.sessionId || id,
      });
      setNotice(t('premium.unlockedStripe'));
      setPendingSession('');
    } catch (err) {
      setError(err?.message || t('premium.verifyFail'));
    } finally {
      setBusy(false);
    }
  }

  async function redeemGift() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const api = window.riftAPI;
      const code = giftInput.trim();
      if (!code) throw new Error(t('premium.needGift'));
      if (!account?.gameName || !account?.tagLine) throw new Error(t('premium.giftNeedAccount'));
      if (!api?.premiumRedeemGift) throw new Error(t('premium.needApp'));
      const result = await api.premiumRedeemGift({
        code,
        deviceId,
        riotId: `${account.gameName}#${account.tagLine}`,
      });
      activate({
        plan: result.plan || 'six',
        source: 'gift',
        license: result.license,
      });
      setGiftInput('');
      setNotice(t('premium.unlockedGift'));
    } catch (err) {
      setError(err?.message || t('premium.giftFail'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pm-page">
      <header className="pm-head">
        <span className="pm-kicker">{t('premium.kicker')}</span>
        <h1>{isPremium ? t('premium.titleOwned') : t('premium.title')}</h1>
        <p>{isPremium ? t('premium.blurbOwned') : t('premium.blurb')}</p>
      </header>

      {isPremium ? (
        <section className="pm-owned">
          <div>
            <strong>{t('premium.activeTitle')}</strong>
            <p>
              {t('premium.activeBody', {
                plan: planLabel(activePlan, t),
                source: sourceLabel(source, t),
              })}
            </p>
          </div>
          <div className="pm-owned-actions">
            <Link className="pm-btn" to="/studio">{t('premium.openStudio')}</Link>
          </div>
        </section>
      ) : null}

      <div className="pm-plans">
        {PLANS.map((plan) => (
          <article
            key={plan.id}
            className={`pm-plan${plan.popular ? ' is-hot' : ''}${selected === plan.id ? ' is-selected' : ''}${isPremium && activePlan === plan.id ? ' is-active-plan' : ''}`}
          >
            {plan.popular ? <em>{t('premium.popular')}</em> : null}
            <strong>{t(plan.priceKey)}</strong>
            <span>{t(plan.perKey)}</span>
            <ul>
              {plan.notes.map((key) => <li key={key}>{t(key)}</li>)}
            </ul>
            <button
              type="button"
              className={`pm-btn${selected === plan.id ? '' : ' is-ghost'}`}
              onClick={() => setSelected(plan.id)}
              disabled={busy || isPremium}
            >
              {selected === plan.id ? t('premium.selected') : t('premium.choosePlan')}
            </button>
          </article>
        ))}
      </div>

      {!isPremium ? (
        <section className="pm-checkout">
          <div className="pm-checkout-main">
            <h2>{t('premium.checkoutTitle')}</h2>
            <p>
              {stripeOn ? t('premium.checkoutStripeHint') : t('premium.checkoutLater')}
            </p>
            {stripeOn ? (
              <>
                <div className="pm-checkout-actions">
                  <button type="button" className="pm-btn" disabled={busy} onClick={startStripe}>
                    {busy ? t('common.loading') : t('premium.payStripe')}
                  </button>
                </div>
                <div className="pm-verify">
                  <label htmlFor="pm-session">{t('premium.sessionLabel')}</label>
                  <div className="pm-verify-row">
                    <input
                      id="pm-session"
                      value={sessionInput}
                      onChange={(e) => setSessionInput(e.target.value)}
                      placeholder={t('premium.sessionPlaceholder')}
                      disabled={busy}
                    />
                    <button type="button" className="pm-btn is-ghost" disabled={busy} onClick={verifyPayment}>
                      {t('premium.verify')}
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            <div className="pm-gift">
              <label htmlFor="pm-gift">{t('premium.giftLabel')}</label>
              <p className="pm-gift-hint">{t('premium.giftHint')}</p>
              <div className="pm-verify-row">
                <input
                  id="pm-gift"
                  value={giftInput}
                  onChange={(e) => setGiftInput(e.target.value)}
                  placeholder={t('premium.giftPlaceholder')}
                  disabled={busy}
                />
                <button type="button" className="pm-btn is-ghost" disabled={busy} onClick={redeemGift}>
                  {t('premium.giftRedeem')}
                </button>
              </div>
            </div>

            {notice ? <p className="pm-ok">{notice}</p> : null}
            {error ? <p className="pm-err">{error}</p> : null}
          </div>
          {stripeOn ? <p className="pm-fine">{t('premium.checkoutLiveNote')}</p> : null}
        </section>
      ) : null}

      <section className="pm-table-wrap">
        <h2>{t('premium.unlock')}</h2>
        <div className="pm-table">
          <div className="pm-tr pm-tr--head">
            <span>{t('premium.included')}</span>
            <span>{t('premium.free')}</span>
            <span>{t('premium.premium')}</span>
          </div>
          {ROWS.map((block) => (
            <div key={block.group}>
              <div className="pm-tr pm-tr--group">{t(block.group)}</div>
              {block.items.map((row) => (
                <div key={row.name} className="pm-tr">
                  <span>{t(row.name)}</span>
                  <Cell value={row.free} t={t} />
                  <Cell value={row.premium} t={t} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
