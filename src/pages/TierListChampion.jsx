import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getChampionTierList } from '../services/riotApi';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import { apiUserMessage, noticeFromError } from '../lib/apiNotice';
import TierListDetail from './TierListDetail';
import './TierListDetail.css';

function emblemUrl(id) {
  const tier = String(id || 'challenger').replace('_plus', '').replace(/_.*/, '');
  return `https://opgg-static.akamaized.net/images/medals_new/${tier}.png`;
}

export default function TierListChampion() {
  const { champion: championParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();
  const { t } = useI18n();

  const champion = decodeURIComponent(championParam || '');
  const role = searchParams.get('role') || 'Mid';
  const rank = searchParams.get('rank') || 'master';
  const platform = searchParams.get('platform') || session?.platform || 'euw1';
  const patch = searchParams.get('patch') || '';

  const [row, setRow] = useState(null);
  const [roleTotal, setRoleTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const backUrl = useMemo(() => {
    const q = new URLSearchParams({ rank, platform });
    if (role && role !== 'all') q.set('role', role);
    if (patch) q.set('patch', patch);
    return `/tierlist?${q.toString()}`;
  }, [rank, platform, role, patch]);

  const switchRole = (nextRole) => {
    if (!nextRole || nextRole === role) return;
    const next = new URLSearchParams(searchParams);
    next.set('role', nextRole);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    const stateRow = location.state?.row;
    const stateMatches = stateRow?.champion === champion && stateRow?.role === role;

    getChampionTierList({ platform, rank })
      .then((data) => {
        if (!alive) return;
        const rows = data?.rows || [];
        const match = rows.find((item) => (
          item.champion.toLowerCase() === champion.toLowerCase() && item.role === role
        ));
        const roleCount = rows.filter((item) => item.role === role && !item.lowSample).length;
        setRoleTotal(roleCount || null);

        if (match) {
          setRow(match);
        } else if (stateMatches) {
          setRow(stateRow);
        } else {
          setRow({
            champion,
            role,
            tier: '?',
            roleRank: '—',
            rank: 9999,
            winrate: 0,
            pickrate: 0,
            banrate: 0,
            games: 0,
            delta: 0,
            lanePct: 0,
            lowSample: true,
          });
        }
      })
      .catch((err) => {
        noticeFromError(err);
        if (alive) setError(apiUserMessage(err) || t('tierList.fail'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [champion, role, rank, platform, location.state?.row, t]);

  return (
    <div className="tld-page">
      <div className="tld-page-top">
        <Link className="tld-back" to={backUrl}>
          ← {t('tierList.backToList')}
        </Link>
        <div className="tld-page-meta">
          <img src={emblemUrl(rank)} alt="" />
          <span>{rank.replace('_', ' ')}</span>
          <span>{platform.toUpperCase()}</span>
          {patch ? <span>{t('tierList.patch', { patch })}</span> : null}
        </div>
      </div>

      {loading && !row ? (
        <div className="tld-page-loading">
          <strong>{t('tierList.detailLoading')}</strong>
        </div>
      ) : null}

      {error && !row ? (
        <div className="tld-page-error">
          {error}
          <button type="button" onClick={() => navigate(backUrl)}>{t('tierList.backToList')}</button>
        </div>
      ) : null}

      {row ? (
        <TierListDetail
          row={row}
          rank={rank}
          platform={platform}
          patch={patch}
          roleTotal={roleTotal}
          onRoleChange={switchRole}
          switching={loading}
          t={t}
        />
      ) : null}
    </div>
  );
}
