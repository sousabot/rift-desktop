import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { champPortraitUrls, getChampionIndex } from '../services/ddragon';
import RoleIcon from './RoleIcon';

const VS_ROLES = [
  { id: 'all', key: 'all' },
  { id: 'Top', key: 'top' },
  { id: 'Jungle', key: 'jungle' },
  { id: 'Mid', key: 'middle' },
  { id: 'ADC', key: 'bottom' },
  { id: 'Support', key: 'support' },
];

const ROLE_MATCHUP_KEY = Object.fromEntries(VS_ROLES.map(({ id, key }) => [id, key]));

function laneTagLabel(tag, t) {
  if (tag === 'good') return t('tierList.matchupLaneGood');
  if (tag === 'bad') return t('tierList.matchupLaneBad');
  return t('tierList.matchupLaneAvg');
}

function MatchupPortrait({ name, cid, ddragonId }) {
  const [index, setIndex] = useState(null);
  const [urlIdx, setUrlIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    getChampionIndex().then((idx) => {
      if (alive) {
        setIndex(idx);
        setUrlIdx(0);
      }
    });
    return () => { alive = false; };
  }, [name, cid, ddragonId]);

  const urls = useMemo(
    () => champPortraitUrls({ name, ddragonId, cid, index }),
    [name, ddragonId, cid, index],
  );

  useEffect(() => {
    setUrlIdx(0);
  }, [urls]);

  const src = urls[urlIdx];
  if (!src) return <div className="tld-mu-art is-empty" aria-hidden="true" />;

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => {
        setUrlIdx((i) => (i + 1 < urls.length ? i + 1 : i));
      }}
    />
  );
}

function MatchupCard({ row, tone, onClick, t }) {
  const delta = Number(row.delta) || 0;
  const sign = delta > 0 ? '+' : '';
  return (
    <button type="button" className={`tld-mu-card is-${tone}`} onClick={onClick} title={row.champion}>
      <div className="tld-mu-art">
        <MatchupPortrait name={row.champion} cid={row.cid} ddragonId={row.ddragonId} />
      </div>
      <strong className="tld-mu-delta">{sign}{delta.toFixed(1)}%</strong>
      <em className="tld-mu-games">{Number(row.games) || 0}</em>
      <span className={`tld-mu-lane is-${row.laneTag || 'avg'}`}>
        {laneTagLabel(row.laneTag, t)}
      </span>
    </button>
  );
}

const COMPACT_CARDS = 5;

function MatchupStrip({ title, tone, rows, compact, onPick, t }) {
  if (!rows?.length) return null;
  const visible = compact ? rows.slice(0, COMPACT_CARDS) : rows;
  return (
    <section className={`tld-mu-strip is-${tone}${compact ? ' is-compact' : ' is-expanded'}`}>
      <h4>{title}</h4>
      <div className="tld-mu-scroll">
        {visible.map((row) => (
          <MatchupCard
            key={`${tone}-${row.cid || row.champion}`}
            row={row}
            tone={tone}
            onClick={() => onPick?.(row)}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

export default function ChampionMatchups({
  champion,
  role,
  rank,
  platform,
  patch,
  matchups,
  t,
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('matchups');
  const [vsRole, setVsRole] = useState('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setVsRole('all');
    setQuery('');
    setExpanded(false);
  }, [champion, role]);

  const activeMatchups = useMemo(() => {
    const key = ROLE_MATCHUP_KEY[vsRole] || 'all';
    if (matchups?.[key]?.good || matchups?.[key]?.bad) return matchups[key];
    if (matchups?.good || matchups?.bad) return matchups;
    return { good: [], bad: [] };
  }, [matchups, vsRole]);

  const filterRows = (rows) => {
    let out = rows || [];
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((row) => row.champion.toLowerCase().includes(q));
    return out;
  };

  const good = useMemo(() => filterRows(activeMatchups.good), [activeMatchups.good, query]);
  const bad = useMemo(() => filterRows(activeMatchups.bad), [activeMatchups.bad, query]);

  const openChampion = (row) => {
    if (!row?.champion) return;
    const roleMap = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'ADC', support: 'Support' };
    const params = new URLSearchParams({
      role: roleMap[row.lane] || role,
      rank,
      platform,
    });
    if (patch) params.set('patch', patch);
    navigate(`/tierlist/${encodeURIComponent(row.champion)}?${params.toString()}`);
  };

  const hasMatchups = useMemo(() => {
    if (matchups?.good?.length || matchups?.bad?.length) return true;
    return Object.values(matchups || {}).some(
      (group) => group?.good?.length || group?.bad?.length,
    );
  }, [matchups]);

  if (!hasMatchups) return null;

  return (
    <section className="tld-mu-panel">
      <header className="tld-mu-head">
        <div className="tld-mu-title">
          <RoleIcon role={role} size={16} />
          <h3>{t('tierList.matchupsAs', { champion })}</h3>
        </div>

        <div className="tld-mu-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'matchups'}
            className={tab === 'matchups' ? 'is-on' : ''}
            onClick={() => setTab('matchups')}
          >
            {t('tierList.matchupsTab')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'synergies'}
            className={tab === 'synergies' ? 'is-on' : ''}
            onClick={() => setTab('synergies')}
          >
            {t('tierList.synergiesTab')}
          </button>
        </div>

        <div className="tld-mu-tools">
          <div className="tld-mu-roles" role="group" aria-label={t('tierList.matchupVsRole')}>
            {VS_ROLES.map(({ id }) => (
              <button
                key={id}
                type="button"
                className={`tld-mu-role${vsRole === id ? ' is-on' : ''}`}
                onClick={() => setVsRole(id)}
                title={id === 'all' ? t('tierList.roleAll') : id}
              >
                {id === 'all' ? 'All' : <RoleIcon role={id} size={14} />}
              </button>
            ))}
          </div>
          <label className="tld-mu-search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tierList.matchupSearch')}
            />
          </label>
        </div>
      </header>

      {tab === 'synergies' ? (
        <div className="tld-mu-empty">{t('tierList.synergiesSoon')}</div>
      ) : !good.length && !bad.length ? (
        <div className="tld-mu-empty">{t('tierList.matchupEmptyRole')}</div>
      ) : expanded ? (
        <div className="tld-mu-expanded">
          <MatchupStrip
            title={t('tierList.detailStrong')}
            tone="good"
            rows={good}
            compact={false}
            onPick={openChampion}
            t={t}
          />
          <MatchupStrip
            title={t('tierList.detailWeak')}
            tone="bad"
            rows={bad}
            compact={false}
            onPick={openChampion}
            t={t}
          />
          <button type="button" className="tld-mu-full is-on" onClick={() => setExpanded(false)}>
            {t('tierList.matchupCompact')}
          </button>
        </div>
      ) : (
        <div className="tld-mu-split">
          <MatchupStrip
            title={t('tierList.detailStrong')}
            tone="good"
            rows={good}
            compact
            onPick={openChampion}
            t={t}
          />
          <button type="button" className="tld-mu-full" onClick={() => setExpanded(true)}>
            <span aria-hidden="true">+</span>
            {t('tierList.matchupFullList')}
          </button>
          <MatchupStrip
            title={t('tierList.detailWeak')}
            tone="bad"
            rows={bad}
            compact
            onPick={openChampion}
            t={t}
          />
        </div>
      )}
    </section>
  );
}
