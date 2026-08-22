import React from 'react';
import { Link } from 'react-router-dom';
import { usePremium } from '../state/PremiumContext';
import { useI18n } from '../i18n/LocaleContext';
import '../pages/Premium.css';

export default function PremiumGate({ children }) {
  const { isPremium } = usePremium();
  const { t } = useI18n();
  if (isPremium) return children;
  return (
    <div className="pm-gate">
      <span className="pm-kicker">{t('premium.kicker')}</span>
      <h2>{t('premium.lockedTitle')}</h2>
      <p>{t('premium.lockedBody')}</p>
      <Link className="pm-btn" to="/premium">{t('premium.seePlans')}</Link>
    </div>
  );
}
