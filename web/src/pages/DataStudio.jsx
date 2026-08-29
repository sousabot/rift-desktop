import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChampionIcon } from '../components/ChampionIcon';
import RoleIcon from '../components/RoleIcon';
import { useSession } from '../session';
import { useStudioMeta, useStudioView } from '../useStudioMeta';
import { ddragonVersion, profileIconUrl, RANK_COLORS, rankEmblemClass, rankImg, REGIONS } from '../lib';
import { fmtNum, fmtPct, fmtSigned } from '../studioStats';
import { t } from '../studioStrings';
import './DataStudio.css';

const MODE_QUEUE = { Solo: 420, Flex: 440 };

function useDdragonVersion() {
  const [version, setVersion] = useState('16.16.1');
  useEffect(() => {
    let cancelled = false;
    ddragonVersion().then((v) => { if (!cancelled) setVersion(v); });
    return () => { cancelled = true; };
  }, []);
  return version;
}

async function getDdragonVersion() {
  return ddragonVersion();
}

const ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const MODE_OPTIONS = [
  { key: 'Solo', label: 'Solo/Duo', queue: 420 },
  { key: 'Flex', label: 'Flex', queue: 440 },
];

const TIER_ORDER = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
];

const NAV = [
  { id: 'home', labelKey: 'studio.home' },
  {
    group: 'studio.groupOverview',
    items: [
      { id: 'rank-dist', labelKey: 'studio.rankDist' },
      { id: 'icons', labelKey: 'studio.icons' },
      { id: 'level', labelKey: 'studio.level' },
      { id: 'banned', labelKey: 'studio.banned' },
      { id: 'time', labelKey: 'studio.time' },
    ],
  },
  {
    group: 'studio.groupMatch',
    items: [
      { id: 'duration', labelKey: 'studio.duration' },
      { id: 'early', labelKey: 'studio.early' },
      { id: 'late', labelKey: 'studio.late' },
      { id: 'win-surrender', labelKey: 'studio.winSurrender' },
      { id: 'lose-surrender', labelKey: 'studio.loseSurrender' },
    ],
  },
  {
    group: 'studio.groupCombat',
    items: [
      { id: 'kda', labelKey: 'studio.kda' },
      { id: 'kills', labelKey: 'studio.kills' },
      { id: 'deaths', labelKey: 'studio.deaths' },
      { id: 'first-blood', labelKey: 'studio.firstBlood' },
      { id: 'pentas', labelKey: 'studio.pentas' },
    ],
  },
  {
    group: 'studio.groupLane',
    items: [
      { id: 'csm', labelKey: 'studio.csm' },
      { id: 'gold15', labelKey: 'studio.gold15' },
      { id: 'cs15', labelKey: 'studio.cs15' },
      { id: 'xp15', labelKey: 'studio.xp15' },
      { id: 'plates', labelKey: 'studio.plates' },
    ],
  },
  {
    group: 'studio.groupLater',
    items: [
      { id: 'pings', labelKey: 'studio.pings' },
    ],
  },
  {
    group: 'studio.groupObjectives',
    items: [
      { id: 'drakes', labelKey: 'studio.drakes' },
      { id: 'souls', labelKey: 'studio.souls' },
      { id: 'barons', labelKey: 'studio.barons' },
      { id: 'grubs', labelKey: 'studio.grubs' },
      { id: 'rifts', labelKey: 'studio.rifts' },
      { id: 'steals', labelKey: 'studio.steals' },
    ],
  },
];

const HOME_SECTIONS = [
  {
    group: 'studio.groupOverview',
    color: '#5b8cff',
    featured: [
      { id: 'icons', kind: 'icons', hintKey: 'studio.hintIcons' },
      { id: 'rank-dist', kind: 'ranks', hintKey: 'studio.hintRanks' },
    ],
    cards: [
      { id: 'level', hintKey: 'studio.hintLevel', tone: '#7c5cff' },
      { id: 'banned', hintKey: 'studio.hintBanned', tone: '#ff5c68' },
      { id: 'time', hintKey: 'studio.hintTime', tone: '#e0b256' },
    ],
  },
  {
    group: 'studio.groupMatch',
    color: '#e0b256',
    cards: [
      { id: 'duration', hintKey: 'studio.hintDuration', tone: '#e0b256' },
      { id: 'early', hintKey: 'studio.hintEarly', tone: '#3ecf8e' },
      { id: 'late', hintKey: 'studio.hintLate', tone: '#5b8cff' },
      { id: 'win-surrender', hintKey: 'studio.hintWinSurrender', tone: '#3ecf8e' },
      { id: 'lose-surrender', hintKey: 'studio.hintLoseSurrender', tone: '#ff5c68' },
    ],
  },
  {
    group: 'studio.groupCombat',
    color: '#ff5c68',
    cards: [
      { id: 'kda', hintKey: 'studio.hintKda', tone: '#ff7ab8' },
      { id: 'kills', hintKey: 'studio.hintKills', tone: '#ff5c68' },
      { id: 'deaths', hintKey: 'studio.hintDeaths', tone: '#ff8a5c' },
      { id: 'first-blood', hintKey: 'studio.hintFirstBlood', tone: '#ff5c68' },
      { id: 'pentas', hintKey: 'studio.hintPentas', tone: '#e0b256' },
    ],
  },
  {
    group: 'studio.groupLane',
    color: '#3ecf8e',
    cards: [
      { id: 'csm', hintKey: 'studio.hintCsm', tone: '#e0b256' },
      { id: 'gold15', hintKey: 'studio.hintGold15', tone: '#e0b256' },
      { id: 'cs15', hintKey: 'studio.hintCs15', tone: '#3ecf8e' },
      { id: 'xp15', hintKey: 'studio.hintXp15', tone: '#5b8cff' },
      { id: 'plates', hintKey: 'studio.hintPlates', tone: '#a06bff' },
    ],
  },
  {
    group: 'studio.groupLater',
    color: '#ff7ab8',
    cards: [
      { id: 'pings', hintKey: 'studio.hintPings', tone: '#ff7ab8' },
    ],
  },
  {
    group: 'studio.groupObjectives',
    color: '#a06bff',
    cards: [
      { id: 'drakes', hintKey: 'studio.hintDrakes', tone: '#5b8cff' },
      { id: 'souls', hintKey: 'studio.hintSouls', tone: '#e0b256' },
      { id: 'barons', hintKey: 'studio.hintBarons', tone: '#a06bff' },
      { id: 'grubs', hintKey: 'studio.hintGrubs', tone: '#3ecf8e' },
      { id: 'rifts', hintKey: 'studio.hintRifts', tone: '#7c5cff' },
      { id: 'steals', hintKey: 'studio.hintSteals', tone: '#ff5c68' },
    ],
  },
];

function HomeGlyph({ id }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 };
  switch (id) {
    case 'level':
      return <svg {...common}><path d="M12 3l2.2 4.5L19 9l-3.5 3.4.8 4.8L12 15.2 7.7 17.2l.8-4.8L5 9l4.8-1.5L12 3z" /></svg>;
    case 'banned':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M7 7l10 10" /></svg>;
    case 'time':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
    case 'duration':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg>;
    case 'early':
      return <svg {...common}><path d="M5 16l7-10 7 10H5z" /></svg>;
    case 'late':
      return <svg {...common}><path d="M4 8h16M6 12h12M8 16h8" /></svg>;
    case 'win-surrender':
      return <svg {...common}><path d="M8 4v16M8 5h7l-1.5 3L15 11H8" /></svg>;
    case 'lose-surrender':
      return <svg {...common}><path d="M8 4v16M8 5h7l-1.5 3L15 11H8" /><path d="M5 19h14" /></svg>;
    case 'kda':
      return <svg {...common}><path d="M7 7l10 10M17 7L7 17" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /></svg>;
    case 'kills':
      return <svg {...common}><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" /></svg>;
    case 'deaths':
      return <svg {...common}><circle cx="12" cy="9" r="4" /><path d="M6 20c1.5-3 4-4.5 6-4.5S16.5 17 18 20" /></svg>;
    case 'first-blood':
      return <svg {...common}><path d="M12 3l2 6h6l-5 4 2 7-5-4-5 4 2-7-5-4h6l2-6z" /></svg>;
    case 'pentas':
      return <svg {...common}><path d="M12 4l1.5 4.5H18l-3.5 2.8 1.3 4.7L12 13.8 8.2 16l1.3-4.7L6 8.5h4.5L12 4z" /></svg>;
    case 'csm':
      return <svg {...common}><circle cx="12" cy="12" r="7" /><path d="M12 8v8M9 12h6" /></svg>;
    case 'gold15':
      return <svg {...common}><circle cx="12" cy="12" r="7" /><path d="M12 8v2.5a2 2 0 010 4V17" /></svg>;
    case 'cs15':
      return <svg {...common}><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 12h6" /></svg>;
    case 'xp15':
      return <svg {...common}><path d="M6 18V9l6-5 6 5v9" /></svg>;
    case 'plates':
      return <svg {...common}><path d="M5 18V8l7-4 7 4v10l-7 3-7-3z" /></svg>;
    case 'pings':
      return <svg {...common}><path d="M12 4a7 7 0 017 7c0 5-7 9-7 9s-7-4-7-9a7 7 0 017-7z" /><circle cx="12" cy="11" r="2" /></svg>;
    case 'drakes':
      return <svg {...common}><path d="M4 14c2-4 5-6 8-6s6 2 8 6M8 10c1-3 2.5-5 4-5s3 2 4 5M12 14v5" /></svg>;
    case 'souls':
      return <svg {...common}><path d="M12 4c3 3 5 5.5 5 8a5 5 0 11-10 0c0-2.5 2-5 5-8z" /></svg>;
    case 'barons':
      return <svg {...common}><circle cx="12" cy="13" r="5" /><path d="M8 8l-2-3M16 8l2-3M12 8V4" /></svg>;
    case 'grubs':
      return <svg {...common}><path d="M6 15c0-3 2.5-6 6-6s6 3 6 6M9 15v3M15 15v3M12 9V6" /></svg>;
    case 'rifts':
      return <svg {...common}><path d="M5 19L12 4l7 15H5z" /></svg>;
    case 'steals':
      return <svg {...common}><path d="M12 4v7M9 8l3-4 3 4M7 14h10l-2 6H9l-2-6z" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="7" /></svg>;
  }
}

function MiniRankChart({ rows }) {
  const groups = TIER_ORDER.map((tier) => {
    const players = (rows || [])
      .filter((r) => r.tier === tier)
      .reduce((s, r) => s + (Number(r.players) || 0), 0);
    return { tier, players, color: RANK_COLORS[tier] || '#9aa4d6' };
  }).filter((g) => g.players > 0);
  const max = Math.max(1, ...groups.map((g) => g.players));
  if (!groups.length) return <div className="st-home-empty-preview" />;
  return (
    <div className="st-home-mini-ranks" aria-hidden>
      {groups.map((g) => (
        <div key={g.tier} className="st-home-mini-col">
          <i style={{ height: `${Math.max(8, Math.round((g.players / max) * 100))}%`, background: g.color }} />
          {rankImg(g.tier) ? (
            <img src={rankImg(g.tier)} alt="" className={rankEmblemClass(g.tier, 'st-home-mini-emblem')} />
          ) : (
            <span style={{ color: g.color }}>{g.tier[0]}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function MiniIconsPreview({ rows }) {
  const version = useDdragonVersion();
  const top = (rows || []).slice(0, 8);
  if (!top.length) return <div className="st-home-empty-preview" />;
  return (
    <div className="st-home-mini-icons" aria-hidden>
      {top.map((row) => {
        const id = Number(row.key ?? row.iconId);
        if (!Number.isFinite(id)) return null;
        return <ProfileIconThumb key={id} id={id} version={version} />;
      })}
    </div>
  );
}

function StudioHome({ t, onOpen, iconRows, rankRows }) {
  const labelFor = (id) => {
    for (const block of NAV) {
      for (const item of block.items || []) {
        if (item.id === id) return t(item.labelKey);
      }
    }
    return id;
  };

  return (
    <div className="st-home-hub">
      {HOME_SECTIONS.map((section) => (
        <section key={section.group} className="st-home-section" style={{ '--st-sec': section.color }}>
          <div className="st-home-section-head">
            <i />
            <h3>{t(section.group)}</h3>
            <span />
          </div>
          {section.featured?.length ? (
            <div className="st-home-featured">
              {section.featured.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="st-home-feature"
                  onClick={() => onOpen(card.id)}
                >
                  <div className="st-home-feature-copy">
                    <strong>{labelFor(card.id)}</strong>
                    <span>{t(card.hintKey)}</span>
                  </div>
                  {card.kind === 'icons'
                    ? <MiniIconsPreview rows={iconRows} />
                    : <MiniRankChart rows={rankRows} />}
                </button>
              ))}
            </div>
          ) : null}
          {section.cards?.length ? (
            <div className="st-home-cards">
              {section.cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`st-home-card${card.soon ? ' is-soon' : ''}`}
                  onClick={() => !card.soon && onOpen(card.id)}
                  disabled={!!card.soon}
                >
                  <span className="st-home-card-ico" style={{ '--st-tone': card.tone }}>
                    <HomeGlyph id={card.id} />
                  </span>
                  <span className="st-home-card-copy">
                    <strong>{labelFor(card.id)}</strong>
                    <em>{t(card.hintKey)}</em>
                  </span>
                  {card.soon ? <em className="st-home-soon">{t('nav.soon')}</em> : <span className="st-home-chev">›</span>}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

const CHAMP_VIEWS = new Set([
  'level',
  'duration', 'early', 'late', 'win-surrender', 'lose-surrender',
  'kda', 'kills', 'deaths', 'first-blood', 'pentas',
  'csm', 'gold15', 'cs15', 'xp15', 'plates',
  'pings',
  'drakes', 'barons', 'grubs', 'rifts', 'steals', 'souls',
]);

/** Views that support Champion / Rank / Platform breakdowns. */
const DIM_VIEWS = new Set([
  'level',
  'duration', 'win-surrender', 'lose-surrender',
  'kda', 'kills', 'deaths', 'first-blood', 'pentas',
  'csm', 'gold15', 'cs15', 'xp15', 'plates',
  'pings',
  'drakes', 'barons', 'grubs', 'rifts', 'steals',
]);

const DIM_OPTIONS = [
  { id: 'champion', labelKey: 'studio.dimChampion' },
  { id: 'rank', labelKey: 'studio.dimRank' },
  { id: 'platform', labelKey: 'studio.dimPlatform' },
];

const PLATFORM_LABELS = {
  euw1: 'EUW', eun1: 'EUNE', na1: 'NA', br1: 'BR', la1: 'LAN', la2: 'LAS',
  kr: 'KR', jp1: 'JP', oc1: 'OCE', tr1: 'TR', ru: 'RU', me1: 'ME',
  sg2: 'SG', ph2: 'PH', tw2: 'TW', th2: 'TH', vn2: 'VN',
};

const TIER_FILTERS = [
  { id: 'emerald_plus', labelKey: 'studio.tierEmeraldPlus' },
  { id: 'diamond_plus', labelKey: 'studio.tierDiamondPlus' },
  { id: 'master_plus', labelKey: 'studio.tierMasterPlus' },
  { id: 'challenger', labelKey: 'studio.tierChallenger' },
  { id: 'grandmaster', labelKey: 'studio.tierGrandmaster' },
  { id: 'platinum_plus', labelKey: 'studio.tierPlatinumPlus' },
  { id: 'gold_plus', labelKey: 'studio.tierGoldPlus' },
  { id: 'silver_plus', labelKey: 'studio.tierSilverPlus' },
  { id: 'iron', labelKey: 'studio.tierIron' },
];

const TIME_FILTERS = [
  { id: '7days', labelKey: 'studio.time7' },
  { id: '14days', labelKey: 'studio.time14' },
  { id: '30days', labelKey: 'studio.time30' },
];

function titleFor(view, t) {
  for (const block of NAV) {
    if (block.id === view) return t(block.labelKey);
    for (const item of block.items || []) {
      if (item.id === view) return t(item.labelKey);
    }
  }
  return t('studio.title');
}

function useChampIdMap() {
  const [map, setMap] = useState({});
  useEffect(() => {
    let cancelled = false;
    getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const next = {};
        Object.values(data?.data || {}).forEach((c) => { next[String(c.key)] = c.id; });
        setMap(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return map;
}

function formatMetric(view, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (view === 'duration') return `${fmtNum(value / 60000, 1)}m`;
  if (view === 'level' || view === 'pings' || view === 'drakes' || view === 'barons'
    || view === 'grubs' || view === 'rifts') return fmtNum(value, 2);
  if (view === 'steals') return fmtNum(value, 3);
  if (view === 'souls') {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
  }
  if (view === 'kda' || view === 'csm') return fmtNum(value, 2);
  if (view === 'kills' || view === 'deaths' || view === 'plates' || view === 'cs15') return fmtNum(value, 1);
  if (view === 'gold15' || view === 'xp15') return fmtSigned(value, 0);
  if (view === 'pentas') return fmtNum(value, 3);
  if (
    view === 'first-blood'
    || view === 'early'
    || view === 'late'
    || view === 'win-surrender'
    || view === 'lose-surrender'
  ) {
    return fmtPct(value);
  }
  return fmtNum(value, 2);
}

function fmtGamesCompact(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return Number(n).toLocaleString();
}

function tierDisplayName(tier) {
  const key = String(tier || '').toUpperCase();
  if (key === 'GRANDMASTER') return 'Grandmaster';
  if (key === 'CHALLENGER') return 'Challenger';
  return key.charAt(0) + key.slice(1).toLowerCase();
}

function platformDisplayName(key) {
  const id = String(key || '').toLowerCase();
  return PLATFORM_LABELS[id] || String(key || '').toUpperCase();
}

function MetricTable({ rows, entityLabel, renderEntity, valueLabel, format, t }) {
  const max = Math.max(0.001, ...rows.map((row) => Math.abs(row.value || 0)));
  return (
    <div className="st-table">
      <div className="st-tr st-tr--head">
        <span>#</span>
        <span>{entityLabel}</span>
        <span>{valueLabel}</span>
        <span>{t('studio.blue')}</span>
        <span>{t('studio.red')}</span>
        <span>{t('studio.gamesCol')}</span>
      </div>
      {rows.map((row, i) => {
        const width = `${Math.round((Math.abs(row.value || 0) / max) * 100)}%`;
        const signed = (row.value || 0) < 0;
        return (
          <div key={row.rowKey || `${row.soul || ''}-${row.champion || row.label}`} className="st-tr">
            <span>{i + 1}</span>
            <span className="st-champ">
              {renderEntity ? renderEntity(row) : row.label}
            </span>
            <span className="st-metric">
              <i className={`st-bar${signed ? ' is-down' : ''}`} style={{ width }} />
              {format(row.value)}
            </span>
            <span className="st-blue">{format(row.blue)}</span>
            <span className="st-red">{format(row.red)}</span>
            <span>{fmtGamesCompact(row.games)}</span>
          </div>
        );
      })}
    </div>
  );
}

function wrTone(wr) {
  if (wr == null || !Number.isFinite(wr)) return '';
  if (wr >= 50) return 'is-good';
  if (wr >= 49) return 'is-mid';
  return 'is-bad';
}

function fmtRankPct(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value < 10 ? value.toFixed(1) : value.toFixed(0)}%`;
}

function fmtPlayersShort(n) {
  if (n == null || !Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

const DIVISIONS = ['IV', 'III', 'II', 'I'];
const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

function tierShortLabel(tier) {
  const t = String(tier || '');
  if (t === 'GRANDMASTER') return 'GM';
  if (t === 'CHALLENGER') return 'CHALL.';
  if (!t) return '?';
  return t.charAt(0) + t.slice(1).toLowerCase();
}

function niceAxisMax(max) {
  if (!max || max <= 0) return 1;
  const pad = max * 1.08;
  const mag = 10 ** Math.floor(Math.log10(pad));
  const norm = pad / mag;
  const step = norm <= 1.5 ? 1.5 : norm <= 3 ? 3 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function LpHistogram({ rows, t }) {
  const groups = TIER_ORDER.map((tier) => {
    const color = RANK_COLORS[tier] || '#9aa4d6';
    if (APEX_TIERS.has(tier)) {
      const players = rows
        .filter((r) => r.tier === tier)
        .reduce((s, r) => s + (Number(r.players) || 0), 0);
      return { tier, color, bars: [{ division: '', players }] };
    }
    const bars = DIVISIONS.map((division) => {
      const hit = rows.find((r) => r.tier === tier && r.division === division);
      return { division, players: Number(hit?.players) || 0 };
    });
    return { tier, color, bars };
  }).filter((g) => g.bars.some((b) => b.players > 0));

  if (!groups.length) return null;

  const peak = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.players)));
  const yMax = niceAxisMax(peak);
  const ticks = [0, 0.25, 0.5, 1].map((p) => Math.round(yMax * p));

  const W = 720;
  const H = 220;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const gapGroup = 10;
  const gapBar = 2;
  const groupW = (plotW - gapGroup * (groups.length - 1)) / groups.length;

  return (
    <div className="st-lp">
      <div className="st-lp-head">
        <h3>{t('studio.lpDist')}</h3>
        <span>{t('studio.lpDistHint')}</span>
      </div>
      <svg className="st-lp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('studio.lpDist')}>
        {ticks.map((tick) => {
          const y = padT + plotH - (tick / yMax) * plotH;
          return (
            <g key={tick}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                className="st-lp-grid"
              />
              <text x={padL - 8} y={y + 3} textAnchor="end" className="st-lp-tick">
                {fmtPlayersShort(tick)}
              </text>
            </g>
          );
        })}
        {groups.map((group, gi) => {
          const gx = padL + gi * (groupW + gapGroup);
          const n = group.bars.length;
          const barW = Math.max(3, (groupW - gapBar * (n - 1)) / n);
          return (
            <g key={group.tier}>
              {group.bars.map((bar, bi) => {
                const h = Math.max(bar.players > 0 ? 2 : 0, (bar.players / yMax) * plotH);
                const x = gx + bi * (barW + gapBar);
                const y = padT + plotH - h;
                return (
                  <rect
                    key={`${group.tier}-${bar.division || 'x'}`}
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={2}
                    ry={2}
                    fill={group.color}
                    opacity={0.92}
                  >
                    <title>
                      {`${tierShortLabel(group.tier)}${bar.division ? ` ${bar.division}` : ''}: ${Number(bar.players).toLocaleString()}`}
                    </title>
                  </rect>
                );
              })}
              <text
                x={gx + groupW / 2}
                y={H - 12}
                textAnchor="middle"
                className="st-lp-xlabel"
                fill={group.color}
              >
                {tierShortLabel(group.tier).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ProfileIconThumb({ id, version, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [id, version]);
  if (!Number.isFinite(id) || id <= 0 || failed) {
    return <span className={`st-icon-img is-empty ${className}`.trim()} />;
  }
  return (
    <img
      src={profileIconUrl(id, version)}
      alt=""
      className={`st-icon-img ${className}`.trim()}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ProfileIcons({ rows, query, sort, t }) {
  const version = useDdragonVersion();
  const [limit, setLimit] = useState(36);
  const deferredQuery = useDeferredValue(query);
  const q = String(deferredQuery || '').trim().toLowerCase();

  const sorted = useMemo(() => {
    const list = (rows || [])
      .map((row) => ({
        id: Number(row.key ?? row.iconId ?? row.profileIconId),
        count: Number(row.count) || 0,
        winrate: Number(row.winrate),
      }))
      .filter((row) => Number.isFinite(row.id) && row.id > 0)
      .filter((row) => !q || String(row.id).includes(q));

    list.sort((a, b) => {
      if (sort === 'wr') return (b.winrate || 0) - (a.winrate || 0) || b.count - a.count;
      if (sort === 'wrAsc') return (a.winrate || 0) - (b.winrate || 0) || b.count - a.count;
      return b.count - a.count;
    });
    return list;
  }, [rows, q, sort]);

  useEffect(() => { setLimit(36); }, [q, sort, rows]);

  if (!sorted.length) return <p className="st-muted">{t('studio.noData')}</p>;

  const visible = sorted.slice(0, limit);

  return (
    <div className="st-icons">
      <div className="st-icons-grid">
        {visible.map((row) => (
          <div key={row.id} className="st-icon-card" title={`#${row.id}`}>
            <ProfileIconThumb id={row.id} version={version} />
            <strong>{row.count.toLocaleString()}</strong>
            <span>({Number.isFinite(row.winrate) ? `${row.winrate.toFixed(2)}%` : '—'} WR)</span>
          </div>
        ))}
      </div>
      {limit < sorted.length ? (
        <button type="button" className="st-load-more" onClick={() => setLimit((n) => n + 36)}>
          {t('studio.loadMore')}
        </button>
      ) : null}
    </div>
  );
}

function RankDist({ rows, totalPlayers, t }) {
  if (!rows?.length) return <p className="st-muted">{t('studio.noData')}</p>;

  const byTier = TIER_ORDER.map((tier) => {
    const parts = rows.filter((r) => r.tier === tier);
    const players = parts.reduce((s, r) => s + (r.players || 0), 0);
    const pct = totalPlayers
      ? (players / totalPlayers) * 100
      : parts.reduce((s, r) => s + (Number(r.percentOfPlatform) || 0), 0);
    return { tier, players, pct, parts };
  }).filter((r) => r.players > 0);

  // Top % = share of players at this division or higher (from Challenger down).
  const ordered = [...rows];
  let cumFromTop = 0;
  const topPctByKey = {};
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const row = ordered[i];
    const key = `${row.tier}-${row.division || ''}`;
    const share = totalPlayers
      ? ((row.players || 0) / totalPlayers) * 100
      : Number(row.percentOfPlatform) || 0;
    cumFromTop += share;
    topPctByKey[key] = cumFromTop;
  }

  const tierFirst = new Set();
  byTier.forEach((tRow) => {
    if (tRow.parts[0]) tierFirst.add(`${tRow.parts[0].tier}-${tRow.parts[0].division || ''}`);
  });

  return (
    <div className="st-rank">
      {totalPlayers ? (
        <p className="st-rank-total">
          <strong>{totalPlayers.toLocaleString()}</strong> {t('studio.rankedPlayers')}
        </p>
      ) : null}
      <LpHistogram rows={rows} t={t} />
      <div className="st-table st-table--rank">
        <div className="st-tr st-tr--head st-tr--rank">
          <span />
          <span>{t('studio.rankCol')}</span>
          <span>{t('studio.playersCol')}</span>
          <span>{t('studio.avgGames')}</span>
          <span>{t('studio.avgWr')}</span>
          <span>{t('studio.rankPct')}</span>
          <span>{t('studio.topPct')}</span>
          <span>{t('studio.tierPct')}</span>
        </div>
        {rows.map((row) => {
          const key = `${row.tier}-${row.division || ''}`;
          const color = RANK_COLORS[row.tier] || '#9aa4d6';
          const emblem = rankImg(row.tier);
          const showEmblem = tierFirst.has(key);
          const tierMeta = byTier.find((tRow) => tRow.tier === row.tier);
          const label = `${String(row.tier || '?').charAt(0)}${String(row.tier || '').slice(1).toLowerCase()}${row.division ? ` ${row.division}` : ''}`;
          const rankPct = totalPlayers
            ? ((row.players || 0) / totalPlayers) * 100
            : Number(row.percentOfPlatform) || 0;
          const tierPct = Number(row.percentOfTier) || tierMeta?.pct || null;
          return (
            <div
              key={key}
              className={`st-tr st-tr--rank${showEmblem ? ' is-tier-start' : ''}`}
              style={{ '--st-tier': color }}
            >
              <span className="st-rank-tier">
                {showEmblem && emblem ? (
                  <img
                    src={emblem}
                    alt=""
                    className={rankEmblemClass(row.tier, 'st-rank-emblem')}
                    style={{ '--st-tier': color }}
                  />
                ) : null}
              </span>
              <span className="st-rank-name" style={{ color }}>{label}</span>
              <span>{Number(row.players || 0).toLocaleString()}</span>
              <span>{fmtNum(row.avgGames, 0)}</span>
              <span className={`st-wr ${wrTone(row.winrate)}`}>{fmtRankPct(row.winrate)}</span>
              <span>{fmtRankPct(rankPct)}</span>
              <span>{fmtRankPct(topPctByKey[key])}</span>
              <span className="st-tier-pct" style={{ color }}>
                {showEmblem ? (
                  <>
                    <strong>{fmtRankPct(tierMeta?.pct ?? tierPct)}</strong>
                    <em>{fmtPlayersShort(tierMeta?.players)}</em>
                  </>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DataStudio() {
  const { session } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'home';
  const [mode, setMode] = useState('Solo');
  const [role, setRole] = useState('');
  const [query, setQuery] = useState('');
  const [iconSort, setIconSort] = useState('used');
  const [tier, setTier] = useState('emerald_plus');
  const [timeframe, setTimeframe] = useState('30days');
  const [soul, setSoul] = useState('Hextech');
  const [dimension, setDimension] = useState('champion');
  const [platformPick, setPlatformPick] = useState(() => session?.platform || 'euw1');
  const champIds = useChampIdMap();
  const platform = session?.platform || platformPick || 'euw1';
  const queue = MODE_QUEUE[mode] || 420;
  const enabled = true;
  const supportsDim = DIM_VIEWS.has(view);
  const activeDim = supportsDim ? dimension : 'champion';
  const usesTierTime = (
    ((CHAMP_VIEWS.has(view) && view !== 'souls') || view === 'banned' || view === 'time')
    && activeDim === 'champion'
  );
  const usesTimeOnly = supportsDim && activeDim !== 'champion';
  const usesRoles = view !== 'home' && view !== 'icons' && view !== 'rank-dist' && view !== 'souls' && activeDim === 'champion';
  const usesQueue = view !== 'home' && view !== 'icons' && view !== 'souls';
  const usesChampSearch = usesTierTime || view === 'souls';

  const summary = useStudioMeta({ platform: platform || 'euw1', queue, enabled });
  const homeIcons = useStudioView({
    view: 'icons',
    platform: platform || 'euw1',
    queue,
    enabled: enabled && view === 'home',
  });
  const {
    rows: rawRows,
    totalPlayers,
    totalMatches,
    loading: viewLoading,
    error: viewError,
  } = useStudioView({
    view,
    platform: platform || 'euw1',
    queue,
    role,
    tier,
    timeframe,
    dimension: activeDim,
    enabled: enabled && view !== 'home',
  });

  const setView = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'home') next.delete('view');
    else next.set('view', id);
    setSearchParams(next, { replace: true });
    setDimension('champion');
  };

  useEffect(() => {
    if (view === 'objectives') setView('drakes');
  }, [view]);

  useEffect(() => {
    if (!supportsDim && dimension !== 'champion') setDimension('champion');
  }, [supportsDim, dimension]);

  const soulOptions = useMemo(() => {
    const seen = [];
    for (const row of rawRows || []) {
      if (row.soul && !seen.includes(row.soul)) seen.push(row.soul);
    }
    return seen.length ? seen : ['Hextech', 'Chemtech', 'Infernal', 'Mountain', 'Cloud', 'Ocean'];
  }, [rawRows]);

  useEffect(() => {
    if (view !== 'souls') return;
    if (!soulOptions.includes(soul)) setSoul(soulOptions[0] || 'Hextech');
  }, [view, soul, soulOptions]);

  const metricRows = useMemo(() => {
    if (view === 'icons' || view === 'rank-dist' || view === 'home') return [];
    const q = query.trim().toLowerCase();
    return (rawRows || [])
      .map((row) => {
        if (activeDim === 'rank') {
          const tierKey = String(row.key || row.tier || '').toUpperCase();
          return {
            rowKey: tierKey,
            label: tierDisplayName(tierKey),
            tierKey,
            value: row.value ?? null,
            blue: row.blueside ?? row.blue ?? null,
            red: row.redside ?? row.red ?? null,
            games: row.total ?? row.games ?? null,
          };
        }
        if (activeDim === 'platform') {
          const platKey = String(row.key || '').toUpperCase();
          return {
            rowKey: platKey,
            label: platformDisplayName(platKey),
            value: row.value ?? null,
            blue: row.blueside ?? row.blue ?? null,
            red: row.redside ?? row.red ?? null,
            games: row.total ?? row.games ?? null,
          };
        }
        const champion = String(row.key || row.championName || champIds[String(row.championId)] || row.championId || '');
        return {
          rowKey: `${row.soul || ''}-${champion}`,
          champion,
          label: champion,
          soul: row.soul || null,
          value: row.value ?? row.banrate ?? null,
          blue: row.blueside ?? row.blue ?? null,
          red: row.redside ?? row.red ?? null,
          games: row.total ?? row.bans ?? null,
          bans: row.bans ?? null,
          banrate: row.banrate ?? null,
          night: row.nightWinrate,
          morning: row.morningWinrate,
          afternoon: row.afternoonWinrate,
          evening: row.eveningWinrate,
        };
      })
      .filter((row) => {
        if (activeDim === 'champion') {
          if (!row.champion) return false;
          if (view === 'souls' && soul && row.soul && row.soul !== soul) return false;
          if (q && !String(row.champion).toLowerCase().includes(q)) return false;
          return true;
        }
        if (activeDim === 'rank') return !!row.tierKey;
        return !!row.rowKey;
      });
  }, [rawRows, query, champIds, view, soul, activeDim]);

  const champRows = metricRows;

  const sampleNote = t('studio.sampleNote', {
    platform: (platform || 'euw1').toUpperCase(),
    n: (summary.players || totalPlayers || 0).toLocaleString(),
  });

  const isSoon = NAV.flatMap((b) => b.items || []).find((item) => item.id === view)?.soon;

  let body = null;
  if (view === 'home') {
    body = (
      <StudioHome
        t={t}
        onOpen={setView}
        iconRows={homeIcons.rows}
        rankRows={summary.distribution?.rows || []}
      />
    );
  } else if (isSoon) {
    body = (
      <div className="st-empty">
        <p>{t('studio.metaSoon')}</p>
      </div>
    );
  } else if (viewLoading) {
    body = <p className="st-muted">{t('common.loading')}</p>;
  } else if (viewError) {
    body = <p className="st-error">{viewError}</p>;
  } else if (view === 'rank-dist') {
    body = <RankDist rows={rawRows} totalPlayers={totalPlayers || summary.players} t={t} />;
  } else if (view === 'icons') {
    body = <ProfileIcons rows={rawRows} query={query} sort={iconSort} t={t} />;
  } else if (view === 'banned') {
    body = champRows.length ? (
      <div className="st-table">
        <div className="st-tr st-tr--head">
          <span>#</span>
          <span>{t('studio.champCol')}</span>
          <span>{t('studio.banRate')}</span>
          <span>{t('studio.bans')}</span>
        </div>
        {champRows.map((row, i) => (
          <div key={row.champion} className="st-tr">
            <span>{i + 1}</span>
            <span className="st-champ"><ChampionIcon name={row.champion} size={22} />{row.champion}</span>
            <span>{fmtPct(row.banrate)}</span>
            <span>{Number(row.bans || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    ) : <p className="st-muted">{t('studio.noData')}</p>;
  } else if (view === 'time') {
    body = champRows.length ? (
      <div className="st-table st-table--hours">
        <div className="st-tr st-tr--head st-tr--hours">
          <span>#</span>
          <span>{t('studio.champCol')}</span>
          <span>{t('studio.night')}</span>
          <span>{t('studio.morning')}</span>
          <span>{t('studio.afternoon')}</span>
          <span>{t('studio.evening')}</span>
          <span>{t('studio.gamesCol')}</span>
        </div>
        {champRows.map((row, i) => (
          <div key={row.champion} className="st-tr st-tr--hours">
            <span>{i + 1}</span>
            <span className="st-champ"><ChampionIcon name={row.champion} size={22} />{row.champion}</span>
            <span>{fmtSigned(row.night, 2)}</span>
            <span>{fmtSigned(row.morning, 2)}</span>
            <span>{fmtSigned(row.afternoon, 2)}</span>
            <span>{fmtSigned(row.evening, 2)}</span>
            <span>{Number(row.games || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    ) : <p className="st-muted">{t('studio.noData')}</p>;
  } else if (CHAMP_VIEWS.has(view)) {
    body = champRows.length
      ? (
        <MetricTable
          rows={champRows}
          entityLabel={
            activeDim === 'rank'
              ? t('studio.rankCol')
              : activeDim === 'platform'
                ? t('studio.platformCol')
                : t('studio.champCol')
          }
          renderEntity={(row) => {
            if (activeDim === 'rank') {
              const color = RANK_COLORS[row.tierKey] || '#9aa4d6';
              const emblem = rankImg(row.tierKey);
              return (
                <>
                  {emblem ? (
                    <img
                      src={emblem}
                      alt=""
                      className={rankEmblemClass(row.tierKey, 'st-metric-emblem')}
                      style={{ '--st-tier': color }}
                    />
                  ) : null}
                  <span style={{ color }}>{row.label}</span>
                </>
              );
            }
            if (activeDim === 'platform') {
              return <span className="st-platform-id">{row.label}</span>;
            }
            return (
              <>
                <ChampionIcon name={row.champion} size={22} />
                {row.champion}
              </>
            );
          }}
          valueLabel={view === 'souls' ? t('studio.winRate') : titleFor(view, t)}
          format={(v) => formatMetric(view, v)}
          t={t}
        />
      )
      : <p className="st-muted">{t('studio.noData')}</p>;
  }

  return (
    <div className="st-page">
      <aside className="st-nav">
        {NAV.map((block) => (
          block.items ? (
            <div key={block.group} className="st-group">
              <div className="st-group-label">{t(block.group)}</div>
              {block.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`st-link${view === item.id ? ' is-on' : ''}${item.soon ? ' is-soon' : ''}`}
                  onClick={() => setView(item.id)}
                >
                  {t(item.labelKey)}
                  {item.soon ? <em>{t('nav.soon')}</em> : null}
                </button>
              ))}
            </div>
          ) : (
            <button
              key={block.id}
              type="button"
              className={`st-link${view === block.id ? ' is-on' : ''}`}
              onClick={() => setView(block.id)}
            >
              {t(block.labelKey)}
            </button>
          )
        ))}
      </aside>
      <section className="st-main">
        <header className="st-head">
          <div>
            <span className="pm-kicker">{t('studio.kicker')}</span>
            <h1>{view === 'home' ? t('studio.title') : titleFor(view, t)}</h1>
            <p>
              {view === 'home'
                ? t('studio.homeExplore')
                : view === 'souls'
                  ? t('studio.soulsNote')
                  : (session
                    ? (totalMatches
                      ? t('studio.sampleNoteMatches', {
                        platform: (platform || 'euw1').toUpperCase(),
                        n: totalMatches.toLocaleString(),
                      })
                      : sampleNote)
                    : t('studio.blurb'))}
            </p>
          </div>
          {view !== 'home' ? (
          <div className="st-controls">
            {supportsDim ? (
              <div className="st-dims" role="tablist" aria-label={t('studio.dimension')}>
                {DIM_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={activeDim === opt.id}
                    className={activeDim === opt.id ? 'is-on' : ''}
                    onClick={() => setDimension(opt.id)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            ) : null}
            {!session?.platform ? (
              <select
                value={platform}
                onChange={(e) => setPlatformPick(e.target.value)}
                aria-label={t('studio.platform')}
              >
                {REGIONS.map((r) => (
                  <option key={r.platform} value={r.platform}>{r.short}</option>
                ))}
              </select>
            ) : null}
            {usesQueue ? (
              <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label={t('studio.queue')}>
                {MODE_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            ) : null}
            {usesRoles ? (
              <div className="st-roles">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={role === r ? 'is-on' : ''}
                    onClick={() => setRole((cur) => (cur === r ? '' : r))}
                    title={r}
                  >
                    <RoleIcon role={r} size={16} />
                  </button>
                ))}
              </div>
            ) : null}
            {view === 'icons' ? (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('studio.searchIcon')}
                />
                <select value={iconSort} onChange={(e) => setIconSort(e.target.value)} aria-label={t('studio.sortIcons')}>
                  <option value="used">{t('studio.sortMostUsed')}</option>
                  <option value="wr">{t('studio.sortWrHigh')}</option>
                  <option value="wrAsc">{t('studio.sortWrLow')}</option>
                </select>
              </>
            ) : null}
            {view === 'souls' ? (
              <>
                <div className="st-souls" role="tablist" aria-label={t('studio.souls')}>
                  {soulOptions.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={soul === id}
                      className={soul === id ? 'is-on' : ''}
                      onClick={() => setSoul(id)}
                    >
                      {id}
                    </button>
                  ))}
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('studio.searchChamp')}
                />
              </>
            ) : null}
            {usesTierTime ? (
              <>
                <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label={t('studio.rankFilter')}>
                  {TIER_FILTERS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{t(opt.labelKey)}</option>
                  ))}
                </select>
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} aria-label={t('studio.timeFilter')}>
                  {TIME_FILTERS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{t(opt.labelKey)}</option>
                  ))}
                </select>
                {usesChampSearch ? (
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('studio.searchChamp')}
                  />
                ) : null}
              </>
            ) : null}
            {usesTimeOnly ? (
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} aria-label={t('studio.timeFilter')}>
                {TIME_FILTERS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{t(opt.labelKey)}</option>
                ))}
              </select>
            ) : null}
          </div>
          ) : null}
        </header>
        {body}
      </section>
    </div>
  );
}
