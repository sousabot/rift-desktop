import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getChampionTierList } from '../services/riotApi';
import { ChampionIcon } from '../components/GameIcons';
import { REGIONS } from '../lib/regions';
import { apiUserMessage, noticeFromError } from '../lib/apiNotice';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import RoleIcon from '../components/RoleIcon';
import './TierList.css';

const ROLES = [
  { id: 'all', labelKey: 'tierList.roleAll' },
  { id: 'Top', labelKey: 'tierList.roleTop' },
  { id: 'Jungle', labelKey: 'tierList.roleJungle' },
  { id: 'Mid', labelKey: 'tierList.roleMid' },
  { id: 'ADC', labelKey: 'tierList.roleBot' },
  { id: 'Support', labelKey: 'tierList.roleSupport' },
];

const RANKS = [
  { id: 'challenger', labelKey: 'tierList.rankChallenger' },
  { id: 'grandmaster', labelKey: 'tierList.rankGrandmaster' },
  { id: 'master_plus', labelKey: 'tierList.rankMasterPlus' },
  { id: 'master', labelKey: 'tierList.rankMaster' },
  { id: 'diamond_plus', labelKey: 'tierList.rankDiamondPlus' },
  { id: 'diamond', labelKey: 'tierList.rankDiamond' },
  { id: 'emerald_plus', labelKey: 'tierList.rankEmeraldPlus' },
  { id: 'emerald', labelKey: 'tierList.rankEmerald' },
  { id: 'platinum_plus', labelKey: 'tierList.rankPlatinumPlus' },
  { id: 'platinum', labelKey: 'tierList.rankPlatinum' },
  { id: 'gold_plus', labelKey: 'tierList.rankGoldPlus' },
  { id: 'gold', labelKey: 'tierList.rankGold' },
];

function emblemUrl(id) {
  const tier = String(id || 'challenger').replace('_plus', '').replace(/_.*/, '');
  return `https://opgg-static.akamaized.net/images/medals_new/${tier}.png`;
}

function fmtGames(n) {
  return Number(n || 0).toLocaleString();
}

function fmtDelta(n) {
  const v = Number(n || 0);
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtPct(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function tierClass(tier) {
  const t = String(tier || '?');
  if (t === 'S+') return 'Sp';
  if (t === 'S') return 'S';
  if (t === 'S-') return 'Sm';
  if (t === 'A+') return 'Ap';
  if (t === 'A') return 'A';
  if (t === 'A-') return 'Am';
  if (t.startsWith('B')) return 'B';
  if (t.startsWith('C')) return 'C';
  if (t.startsWith('D')) return 'D';
  return 'na';
}

function rankTone(index) {
  if (index === 0) return 'is-gold';
  if (index === 1) return 'is-silver';
  if (index === 2) return 'is-bronze';
  return '';
}

function IconStar() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path fill="currentColor" d="M10 2.4 12.2 7l5 .4-3.8 3.3 1.2 4.8L10 13.3 5.4 15.5 6.6 10.7 2.8 7.4l5-.4L10 2.4Z" />
    </svg>
  );
}

export default function TierList() {
  const { session } = useSession();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState(searchParams.get('role') || 'all');
  const [rank, setRank] = useState(searchParams.get('rank') || 'master');
  const [platform, setPlatform] = useState(searchParams.get('platform') || session?.platform || 'euw1');
  const [query, setQuery] = useState('');
  const [offMeta, setOffMeta] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const openChampion = (row) => {
    const params = new URLSearchParams({
      role: row.role,
      rank,
      platform,
    });
    if (data?.patch) params.set('patch', data.patch);
    navigate(`/tierlist/${encodeURIComponent(row.champion)}?${params.toString()}`, { state: { row } });
  };

  const applyPayload = (next) => {
    if (!next) return;
    setData(next);
    if (next.error) setError(apiUserMessage({ message: next.error }) || next.error);
    else setError('');
  };

  const load = async (opts = {}) => {
    setLoading(true);
    if (!opts.force) setError('');
    setProgress(opts.force ? t('tierList.refreshing') : t('tierList.loadingTitle'));
    let next = null;
    try {
      next = await getChampionTierList({
        platform,
        rank,
        force: !!opts.force,
      });
      applyPayload(next);
    } catch (err) {
      noticeFromError(err);
      setError(apiUserMessage(err) || t('tierList.fail'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubReady = window.riotAPI?.onTierListReady?.((next) => {
      if (!next) return;
      if (next.platform && next.platform !== platform) return;
      if (next.rank && next.rank !== rank) return;
      applyPayload(next);
      setLoading(false);
    });
    return () => {
      unsubReady?.();
    };
  }, [platform, rank]);

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, rank]);

  const analyzed = useMemo(
    () => data?.analysed || data?.matches || 0,
    [data],
  );

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const q = query.trim().toLowerCase();
    let list = all.filter((row) => {
      if (row.lowSample) return false;
      if (q && !String(row.champion).toLowerCase().includes(q)) return false;
      if (role !== 'all' && row.role !== role) return false;
      if (!offMeta && row.lanePct < 12) return false;
      return true;
    });
    if (role === 'all') {
      const best = new Map();
      for (const row of list) {
        const prev = best.get(row.champion);
        if (!prev || (row.metaScore ?? row.score) > (prev.metaScore ?? prev.score)) {
          best.set(row.champion, row);
        }
      }
      list = [...best.values()];
    }
    return [...list].sort((a, b) => {
      const ar = role === 'all' ? a.rank : (a.roleRank || a.rank);
      const br = role === 'all' ? b.rank : (b.roleRank || b.rank);
      return ar - br || (b.metaScore ?? b.score) - (a.metaScore ?? a.score);
    });
  }, [data, role, query, offMeta]);

  const rankLabel = t(RANKS.find((r) => r.id === rank)?.labelKey || 'tierList.rankMaster');

  return (
    <div className="tl-page">
      <header className="tl-head">
        <div className="tl-head-main">
          <div className="tl-badges">
            <span className="tl-badge is-rank">
              <img src={emblemUrl(rank)} alt="" />
              {rankLabel}
            </span>
            <span className="tl-badge is-patch">
              {t('tierList.patch', { patch: data?.patch || '—' })}
            </span>
          </div>
          <h1>{t('tierList.title')}</h1>
          <p>{t('tierList.blurb')}</p>
          {analyzed ? (
            <p className="tl-meta">
              {t('tierList.sample', { n: fmtGames(analyzed) })}
              {data?.reliable != null ? ` · ${t('tierList.reliable', { n: data.reliable })}` : ''}
              {data?.source ? ` · ${t('tierList.source')}` : ''}
            </p>
          ) : null}
        </div>
        <div className="tl-head-side">
          <div className="tl-stat">
            <strong>{fmtGames(analyzed)}</strong>
            <span>{t('tierList.analyzed')}</span>
          </div>
          <button type="button" className="tl-refresh" onClick={() => load({ force: true })} disabled={loading}>
            {loading ? t('tierList.refreshing') : t('tierList.refresh')}
          </button>
        </div>
      </header>

      <div className="tl-toolbar">
        <div className="tl-roles">
          {ROLES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tl-role${role === item.id ? ' is-on' : ''}`}
              onClick={() => setRole(item.id)}
              title={t(item.labelKey)}
            >
              {item.id === 'all'
                ? <IconStar />
                : <RoleIcon role={item.id} size={18} />}
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </div>

        <div className="tl-filters">
          <div className="tl-rank-wrap">
            <button type="button" className="tl-select" onClick={() => setRankOpen((v) => !v)}>
              <img src={emblemUrl(rank)} alt="" />
              {rankLabel}
            </button>
            {rankOpen ? (
              <div className="tl-rank-menu">
                {RANKS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === rank ? 'is-on' : ''}
                    onClick={() => { setRank(item.id); setRankOpen(false); }}
                  >
                    <img src={emblemUrl(item.id)} alt="" />
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <select
            className="tl-select"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            {REGIONS.map((r) => (
              <option key={r.platform} value={r.platform}>{r.label.replace(/ \(.*\)/, '')}</option>
            ))}
          </select>

          <label className="tl-toggle">
            <input type="checkbox" checked={offMeta} onChange={(e) => setOffMeta(e.target.checked)} />
            {t('tierList.offMeta')}
          </label>

          <input
            className="tl-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('tierList.search')}
          />
        </div>
      </div>

      {error ? <div className="tl-error">{error}</div> : null}

      {loading && !data ? (
        <div className="tl-loading">
          <strong>{progress || t('tierList.loadingTitle')}</strong>
          {t('tierList.loadingBody')}
        </div>
      ) : (
        <div className="tl-table-wrap">
          <div className="tl-table-head">
            <span>{t('tierList.colRank')}</span>
            <span>{t('tierList.colChampion')}</span>
            <span>{t('tierList.colLane')}</span>
            <span>{t('tierList.colTier')}</span>
            <span>{t('tierList.colWr')}</span>
            <span>{t('tierList.colPick')}</span>
            <span>{t('tierList.colBan')}</span>
            <span>{t('tierList.colGames')}</span>
          </div>
          <div className="tl-table-body">
            {rows.map((row, i) => (
              <button
                key={`${row.champion}-${row.role}`}
                type="button"
                className={`tl-row${rankTone(i) ? ` ${rankTone(i)}` : ''}`}
                onClick={() => openChampion(row)}
              >
                <span className={`tl-num${rankTone(i) ? ` ${rankTone(i)}` : ''}`}>{i + 1}</span>
                <span className="tl-champ">
                  <ChampionIcon name={row.champion} size={36} />
                  <span className="tl-champ-name">{row.champion}</span>
                </span>
                <span className="tl-lane">
                  <RoleIcon role={row.role} size={16} />
                  <em>{row.lanePct.toFixed(1)}%</em>
                </span>
                <span className={`tl-tier is-${tierClass(row.tier)}`}>
                  <span>{row.tier}</span>
                </span>
                <span className="tl-wr">
                  <strong className={row.delta >= 0 ? 'is-up' : 'is-down'}>
                    {fmtPct(row.winrate)}
                  </strong>
                  <em className={row.delta >= 0 ? 'is-up' : 'is-down'}>
                    {t('tierList.vsRole', { delta: fmtDelta(row.delta) })}
                  </em>
                </span>
                <span className="tl-rate">{fmtPct(row.pickrate)}</span>
                <span className="tl-rate is-ban">{fmtPct(row.banrate)}</span>
                <span className="tl-games">{fmtGames(row.games)}</span>
              </button>
            ))}
          </div>
          {!rows.length && !loading ? (
            <div className="tl-empty">
              {error ? t('tierList.emptySample') : t('tierList.emptyFilters')}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
