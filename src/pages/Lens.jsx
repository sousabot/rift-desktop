import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { parsePlayerSearch } from '../lib/playerRoute';
import { MODE_KEYS, MODE_LABEL } from '../lib/queues';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import { useDashboardProfile } from '../lib/useDashboardProfile';
import { avg, filterByRole, fmtNum, fmtPct, fmtSigned, gameCsm, gameKda, sampleSummary, sum } from '../lib/studioStats';
import { rankColor, rankEmblemClass, rankImg, rankTierKey, RANK_COLORS } from '../lib/rankEmblem';
import { useLensBenchmarks } from '../lib/useLensBenchmarks';
import RoleIcon from '../components/RoleIcon';
import Sparkline from '../components/Sparkline';
import { profileIconUrl, useDdragonVersion } from '../services/ddragon';
import { ICONS, IcoLock } from './lensIcons';
import '../pages/Premium.css';
import './Lens.css';

const ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

const TABS = [
  { id: 'overview', labelKey: 'lens.overview', icon: 'star' },
  { id: 'fighting', labelKey: 'lens.fighting', icon: 'swords' },
  { id: 'laning', labelKey: 'lens.laning', icon: 'lane' },
  { id: 'objectives', labelKey: 'lens.objectives', icon: 'tower' },
  { id: 'vision', labelKey: 'lens.vision', icon: 'ward' },
  { id: 'survivability', labelKey: 'lens.survivability', icon: 'trophy' },
  { id: 'adaptability', labelKey: 'lens.adaptability', icon: 'mask' },
  { id: 'impact', labelKey: 'lens.impact', icon: 'team' },
];

const CATS = [
  { id: 'laning', labelKey: 'lens.laning', color: '#ff8a2a', icon: 'crest', live: true },
  { id: 'adaptability', labelKey: 'lens.adaptability', color: '#5ad6ff', icon: 'mask', live: true },
  { id: 'survivability', labelKey: 'lens.survivability', color: '#b07cff', icon: 'trophy', live: true },
  { id: 'vision', labelKey: 'lens.vision', color: '#3ecf8e', icon: 'ward', live: true },
  { id: 'objectives', labelKey: 'lens.objectives', color: '#e0b256', icon: 'tower', live: true },
  { id: 'impact', labelKey: 'lens.impact', color: '#ff5c68', icon: 'team', live: true },
  { id: 'fighting', labelKey: 'lens.fighting', color: '#4d7dff', icon: 'swords', live: true },
];

const CARD_ORDER = ['vision', 'laning', 'survivability', 'objectives', 'adaptability', 'fighting', 'impact'];

const LADDER_TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];

const LADDER_STATS = [
  { id: 'kp', labelKey: 'lens.kp', fmt: (v) => fmtNum(v, 2), fromPlayer: (stats, kpPct) => kpPct, fromBench: (v) => (v == null ? null : v * 100) },
  { id: 'dpm', labelKey: 'lens.dpm', fmt: (v) => fmtNum(v, 1), fromPlayer: (stats) => stats.dpm, fromBench: (v) => v },
  { id: 'taken', labelKey: 'lens.taken', fmt: (v) => fmtNum(v, 1), fromPlayer: (stats) => stats.taken, fromBench: (v) => v },
];

const DUEL_LADDER_STATS = [
  { id: 'soloKills', labelKey: 'lens.soloKills', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.soloKills, fromBench: (v) => v },
];

const SKIRMISH_LADDER_STATS = [
  { id: 'skirmishKills', labelKey: 'lens.skirmishKills', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.skirmishKills, fromBench: (v) => v },
];

const TEAMFIGHT_LADDER_STATS = [
  { id: 'teamfightKills', labelKey: 'lens.teamfightKills', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.teamfightKills, fromBench: (v) => v },
];

const MECH_LADDER_STATS = [
  { id: 'largestMultiKill', labelKey: 'lens.largestMultiKill', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.largestMultiKill, fromBench: (v) => v },
];

const FIGHTING_CATS = [
  { id: 'general', labelKey: 'lens.fightGeneral', color: '#4d7dff', icon: 'swords', live: true, wide: true },
  { id: 'duels', labelKey: 'lens.fightDuels', color: '#4d7dff', icon: 'vs', live: true, subKey: 'lens.fightDuelsHint' },
  { id: 'skirmishes', labelKey: 'lens.fightSkirmishes', color: '#4d7dff', icon: 'spark', live: true, subKey: 'lens.fightSkirmishesHint' },
  { id: 'teamfights', labelKey: 'lens.fightTeamfights', color: '#4d7dff', icon: 'team', live: true, subKey: 'lens.fightTeamfightsHint' },
  { id: 'mechanics', labelKey: 'lens.fightMechanics', color: '#4d7dff', icon: 'sword', live: true, subKey: 'lens.fightMechanicsHint' },
];

const LANING_CATS = [
  { id: 'general', labelKey: 'lens.laneGeneral', color: '#ff8a2a', icon: 'crest', live: true, wide: true },
  { id: 'control', labelKey: 'lens.laneControl', color: '#ff8a2a', icon: 'lane', live: true, subKey: 'lens.laneControlHint' },
  { id: 'trading', labelKey: 'lens.laneTrading', color: '#ff8a2a', icon: 'vs', live: true, subKey: 'lens.laneTradingHint' },
  { id: 'waves', labelKey: 'lens.laneWaves', color: '#ff8a2a', icon: 'spark', live: true, subKey: 'lens.laneWavesHint' },
  { id: 'roaming', labelKey: 'lens.laneRoaming', color: '#ff8a2a', icon: 'team', live: true, subKey: 'lens.laneRoamingHint' },
];

const LANING_LADDER_STATS = [
  { id: 'gold15', labelKey: 'studio.gold15', fmt: (v) => fmtSigned(v, 0), fromPlayer: (s) => s.gold15, fromBench: (v) => v, signed: true },
  { id: 'ka15', labelKey: 'dash.ka15', fmt: (v) => fmtSigned(v, 1), fromPlayer: (s) => s.ka15, fromBench: (v) => v, signed: true },
  { id: 'csDiff15', labelKey: 'lens.csDiff15', fmt: (v) => fmtSigned(v, 0), fromPlayer: (s) => s.csDiff15, fromBench: (v) => v, signed: true },
  { id: 'roamKills15', labelKey: 'lens.roamKills15', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.roamKills15, fromBench: (v) => v },
];

const OBJECTIVES_CATS = [
  { id: 'general', labelKey: 'lens.objGeneral', color: '#e0b256', icon: 'tower', live: true, wide: true },
  { id: 'structures', labelKey: 'lens.objStructures', color: '#e0b256', icon: 'tower', live: true, subKey: 'lens.objStructuresHint' },
  { id: 'epic', labelKey: 'lens.objEpic', color: '#e0b256', icon: 'star', live: true, subKey: 'lens.objEpicHint' },
  { id: 'setup', labelKey: 'lens.objSetup', color: '#e0b256', icon: 'ward', live: true, subKey: 'lens.objSetupHint' },
  { id: 'steals', labelKey: 'lens.objSteals', color: '#e0b256', icon: 'skull', live: true, subKey: 'lens.objStealsHint' },
];

const OBJECTIVES_LADDER_STATS = [
  { id: 'objDpm', labelKey: 'lens.objDpm', fmt: (v) => fmtNum(v, 0), fromPlayer: (s) => s.objDpm, fromBench: (v) => v },
  { id: 'turretTakedowns', labelKey: 'lens.turretTakedowns', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.turretTakedowns, fromBench: (v) => v },
  { id: 'visionPerMin', labelKey: 'lens.visionMin', fmt: (v) => fmtNum(v, 2), fromPlayer: (s) => s.visionPerMin, fromBench: (v) => v },
  { id: 'wardsPlaced', labelKey: 'lens.wardsPlaced', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.wardsPlaced, fromBench: (v) => v },
];

const VISION_CATS = [
  { id: 'general', labelKey: 'lens.visGeneral', color: '#3ecf8e', icon: 'ward', live: true, wide: true },
  { id: 'placement', labelKey: 'lens.visPlacement', color: '#3ecf8e', icon: 'ward', live: true, subKey: 'lens.visPlacementHint' },
  { id: 'denial', labelKey: 'lens.visDenial', color: '#3ecf8e', icon: 'spark', live: true, subKey: 'lens.visDenialHint' },
  { id: 'control', labelKey: 'lens.visControl', color: '#3ecf8e', icon: 'star', live: true, subKey: 'lens.visControlHint' },
  { id: 'timing', labelKey: 'lens.visTiming', color: '#3ecf8e', icon: 'lane', live: true, subKey: 'lens.visTimingHint' },
];

const VISION_LADDER_STATS = [
  { id: 'visionPerMin', labelKey: 'lens.visionMin', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.visionPerMin, fromBench: (v) => v },
  { id: 'wardsPlaced', labelKey: 'lens.wardsPlaced', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.wardsPlaced, fromBench: (v) => v },
];

const SURVIVE_CATS = [
  { id: 'general', labelKey: 'lens.survGeneral', color: '#b07cff', icon: 'trophy', live: true, wide: true },
  { id: 'deaths', labelKey: 'lens.survDeaths', color: '#b07cff', icon: 'skull', live: true, subKey: 'lens.survDeathsHint' },
  { id: 'tanking', labelKey: 'lens.survTanking', color: '#b07cff', icon: 'shield', live: true, subKey: 'lens.survTankingHint' },
  { id: 'sustain', labelKey: 'lens.survSustain', color: '#b07cff', icon: 'star', live: true, subKey: 'lens.survSustainHint' },
  { id: 'crowd', labelKey: 'lens.survCrowd', color: '#b07cff', icon: 'spark', live: true, subKey: 'lens.survCrowdHint' },
];

function fmtClock(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const SURVIVE_LADDER_STATS = [
  { id: 'deaths', labelKey: 'lens.deaths', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.deaths, fromBench: (v) => v },
  { id: 'taken', labelKey: 'lens.taken', fmt: (v) => fmtNum(v, 0), fromPlayer: (s) => s.taken, fromBench: (v) => v },
];

const ADAPT_CATS = [
  { id: 'general', labelKey: 'lens.adaptGeneral', color: '#5ad6ff', icon: 'mask', live: true, wide: true },
  { id: 'champs', labelKey: 'lens.adaptChamps', color: '#5ad6ff', icon: 'star', live: true, subKey: 'lens.adaptChampsHint' },
  { id: 'roles', labelKey: 'lens.adaptRoles', color: '#5ad6ff', icon: 'lane', live: true, subKey: 'lens.adaptRolesHint' },
  { id: 'runes', labelKey: 'lens.adaptRunes', color: '#5ad6ff', icon: 'spark', live: true, subKey: 'lens.adaptRunesHint' },
  { id: 'builds', labelKey: 'lens.adaptBuilds', color: '#5ad6ff', icon: 'crest', live: true, subKey: 'lens.adaptBuildsHint' },
];

const ADAPT_LADDER_STATS = [
  { id: 'champVariety', labelKey: 'lens.champVariety', fmt: (v) => fmtNum(v, 1), fromPlayer: (s) => s.champVariety, fromBench: (v) => v },
  { id: 'offRole', labelKey: 'lens.offRole', fmt: (v) => fmtPct(v), fromPlayer: (s) => s.offRolePct, fromBench: (v) => v },
];

const IMPACT_CATS = [
  { id: 'general', labelKey: 'lens.impactGeneral', color: '#ff5c68', icon: 'team', live: true, wide: true },
  { id: 'damage', labelKey: 'lens.impactDamage', color: '#ff5c68', icon: 'swords', live: true, subKey: 'lens.impactDamageHint' },
  { id: 'utility', labelKey: 'lens.impactUtility', color: '#ff5c68', icon: 'star', live: true, subKey: 'lens.impactUtilityHint' },
  { id: 'vision', labelKey: 'lens.impactVision', color: '#ff5c68', icon: 'ward', live: true, subKey: 'lens.impactVisionHint' },
  { id: 'objectives', labelKey: 'lens.impactObjectives', color: '#ff5c68', icon: 'tower', live: true, subKey: 'lens.impactObjectivesHint' },
];

const IMPACT_LADDER_STATS = [
  { id: 'kp', labelKey: 'lens.kp', fmt: (v) => fmtPct(v), fromPlayer: (s) => s.kpPct, fromBench: (v) => (v == null ? null : v * 100) },
  { id: 'damageShare', labelKey: 'lens.damageShare', fmt: (v) => fmtPct(v), fromPlayer: (s) => s.damageSharePct, fromBench: (v) => (v == null ? null : v * 100) },
  { id: 'visionPerMin', labelKey: 'lens.visionMin', fmt: (v) => fmtNum(v, 2), fromPlayer: (s) => s.visionPerMin, fromBench: (v) => v },
  { id: 'objDpm', labelKey: 'lens.objDpm', fmt: (v) => fmtNum(v, 0), fromPlayer: (s) => s.objDpm, fromBench: (v) => v },
];

function uniqueCount(games, fn) {
  const set = new Set();
  games.forEach((g) => {
    const v = fn(g);
    if (v != null && v !== '') set.add(v);
  });
  return set.size;
}

function modalShare(games, fn) {
  const counts = {};
  let n = 0;
  games.forEach((g) => {
    const v = fn(g);
    if (v == null || v === '') return;
    n += 1;
    counts[v] = (counts[v] || 0) + 1;
  });
  const top = Math.max(0, ...Object.values(counts));
  return n ? top / n : null;
}

function runningUnique(games, fn) {
  const seen = new Set();
  return games.map((g) => {
    const v = fn(g);
    if (v != null && v !== '') seen.add(v);
    return seen.size;
  });
}

function spellKey(game) {
  const ids = (game.spells || []).filter(Boolean).slice().sort((a, b) => a - b);
  return ids.length ? ids.join('-') : '';
}

function Ico({ name, size = 24 }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <Cmp />
    </svg>
  );
}

function Glyph({ name, size }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return (
    <g transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 24})`}>
      <Cmp />
    </g>
  );
}

function seriesOf(games, fn) {
  return games.map(fn).filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
}

function trendOf(points, invert = false) {
  if (points.length < 2) return 'flat';
  const a = points[0];
  const b = points[points.length - 1];
  if (b === a) return 'flat';
  const up = b > a;
  if (invert) return up ? 'down' : 'up';
  return up ? 'up' : 'down';
}

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function Ring({ pct, color, children, halo, size = 68 }) {
  const p = halo ? 0 : Math.max(0, Math.min(100, Number(pct) || 0));
  const r = size * 0.38;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <div className="ln-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={size * 0.09} />
        <circle
          cx={mid} cy={mid} r={r} fill="none" stroke={color} strokeWidth={size * 0.09}
          strokeLinecap="round" opacity={halo ? 0.55 : 1}
          strokeDasharray={halo ? `${c} 0` : `${(p / 100) * c} ${c}`}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      {children}
    </div>
  );
}

function RankMark({ tier, className = 'ln-cat-rank', wrapClass = 'ln-cat-rank-wrap' }) {
  const src = rankImg(tier);
  if (!src) return <span className="ln-cat-face is-empty" />;
  return (
    <span className={wrapClass}>
      <img className={rankEmblemClass(tier, className)} src={src} alt="" />
    </span>
  );
}

function CatCard({ cat, value, unit, ring, halo, avatar, compareRank, t, selected, onSelect }) {
  const foot = cat.live ? unit : (cat.subKey ? t(cat.subKey) : t('lens.notLive'));
  const showRing = halo || (ring != null && Number.isFinite(Number(ring)));
  return (
    <button
      type="button"
      className={`ln-cat${cat.wide ? ' is-wide' : ''}${selected ? ' is-on' : ''}${cat.live ? '' : ' is-lock'}`}
      style={{ '--ln': cat.color }}
      onClick={() => onSelect(cat.id)}
    >
      <header>
        <span className="ln-cat-ico"><Ico name={cat.icon} size={14} /></span>
        <span className="ln-cat-title">{t(cat.labelKey)}</span>
        {!cat.live ? <span className="ln-lock"><IcoLock /></span> : null}
      </header>
      <div className="ln-cat-body">
        <div className="ln-cat-id">
          {avatar}
          <span className="ln-cat-vs">vs</span>
          {compareRank}
        </div>
        <div className={`ln-cat-badge${showRing ? '' : ' is-plain'}`}>
          <strong>{cat.live ? value : '—'}</strong>
          {showRing ? <Ring pct={ring} color={cat.color} halo={halo} size={cat.wide ? 34 : 28} /> : null}
        </div>
      </div>
      <em>{foot}</em>
    </button>
  );
}

function StatSoon({ label, t }) {
  return (
    <article className="ln-card is-soon">
      <header>
        <span className="ln-lock"><IcoLock /></span>
        <span>{label}</span>
      </header>
      <div className="ln-card__row ln-card__row--soon">
        <div className="ln-soon-bar" aria-hidden="true" />
      </div>
      <p>{t('lens.notLive')}</p>
    </article>
  );
}

function RankLadder({
  spec, playerValue, playerTier, statLadder, loading, refreshing, matches, t,
}) {
  const bench = useMemo(() => {
    const raw = statLadder(spec.id);
    const out = {};
    for (const tier of LADDER_TIERS) {
      out[tier] = spec.fromBench(raw[tier]);
    }
    return out;
  }, [spec, statLadder]);

  const values = LADDER_TIERS.map((tier) => bench[tier]).filter((v) => v != null && Number.isFinite(v));
  const player = playerValue != null && Number.isFinite(playerValue) ? playerValue : null;
  const pool = player != null ? [...values, player] : values;
  const scale = (v) => {
    if (!pool.length) return 50;
    if (spec.signed) {
      const lo = Math.min(...pool, 0);
      const hi = Math.max(...pool, 0);
      const span = Math.max(hi - lo, 1) * 1.06;
      const base = lo - span * 0.03;
      return Math.max(8, Math.min(100, ((v - base) / span) * 100));
    }
    const scaleMax = Math.max(...pool, 1) * 1.04;
    return Math.max(8, Math.min(100, (v / scaleMax) * 100));
  };
  const youTier = rankTierKey(playerTier);
  const pending = loading || refreshing;

  return (
    <article className={`ln-ladder${loading ? ' is-loading' : ''}`}>
      <div className="ln-ladder-head">
        <div className="ln-ladder-stat">
          <strong>{spec.fmt(player)}</strong>
          <span>{t(spec.labelKey)}</span>
        </div>
        <div className="ln-ladder-bars">
          {LADDER_TIERS.map((tier) => {
            const avg = bench[tier];
            const hasAvg = avg != null && Number.isFinite(avg);
            const color = RANK_COLORS[tier] || rankColor(tier);
            const isYou = youTier === tier;
            return (
              <div key={tier} className={`ln-ladder-col${isYou ? ' is-you' : ''}${!hasAvg && pending ? ' is-pending' : ''}`}>
                <span className="ln-ladder-val" style={{ color: hasAvg ? color : undefined }}>
                  {hasAvg ? spec.fmt(avg) : '…'}
                </span>
                <div className="ln-ladder-track">
                  {hasAvg ? (
                    <div className="ln-ladder-fill" style={{ height: `${scale(avg)}%`, background: color }} />
                  ) : pending ? (
                    <div className="ln-ladder-fill is-pending" style={{ height: '18%', background: color }} />
                  ) : null}
                  {isYou && player != null ? (
                    <div className="ln-ladder-pin" style={{ bottom: `${scale(player)}%` }} title={t('lens.ladderYou')} />
                  ) : null}
                </div>
                <RankMark tier={tier} className="ln-ladder-rank" wrapClass="ln-ladder-rank-wrap" />
              </div>
            );
          })}
        </div>
      </div>
      <p>{t(`lens.ladderDesc.${spec.id}`)}</p>
      {loading ? (
        <p className="ln-ladder-note">{t('lens.ladderLoading')}</p>
      ) : (
        <p className="ln-ladder-note">
          {refreshing ? t('lens.ladderRefreshing') : t('lens.ladderSample', { n: matches || 0 })}
        </p>
      )}
    </article>
  );
}

function ImpactStage({
  cats, impactCat, setImpactCat, stats, hint, avatar, compareRank, ladderSpec,
  setLadderSpec, statLadder, ladderLoading, ladderRefreshing, ladderMatches, playerTier, t,
}) {
  const impactValues = {
    general: {
      value: fmtPct(stats.kpPct),
      unit: t('lens.kp'),
      ring: stats.kpPct,
      halo: false,
    },
    damage: {
      value: fmtPct(stats.damageSharePct),
      unit: t('lens.damageShare'),
      ring: stats.damageSharePct,
      halo: false,
    },
    utility: {
      value: fmtNum(stats.assists, 1),
      unit: t('lens.assists'),
      halo: stats.assists != null,
    },
    vision: {
      value: fmtPct(stats.visionSharePct),
      unit: t('lens.visionShare'),
      ring: stats.visionSharePct,
      halo: false,
    },
    objectives: {
      value: fmtPct(stats.objDamageSharePct),
      unit: t('lens.objDamageShare'),
      ring: stats.objDamageSharePct,
      halo: false,
    },
  };

  const ladderProps = {
    playerTier,
    statLadder,
    loading: ladderLoading,
    refreshing: ladderRefreshing,
    matches: ladderMatches,
    t,
  };

  return (
    <div className="ln-fight">
      <div className="ln-fight-cats">
        {cats.map((cat) => (
          <CatCard
            key={cat.id}
            cat={cat}
            t={t}
            selected={impactCat === cat.id}
            onSelect={setImpactCat}
            value={impactValues[cat.id]?.value}
            unit={impactValues[cat.id]?.unit}
            ring={impactValues[cat.id]?.ring}
            halo={impactValues[cat.id]?.halo}
            avatar={avatar}
            compareRank={compareRank}
          />
        ))}
      </div>
      <div className="ln-fight-main">
        {impactCat === 'general' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="kp" />} label={t('lens.kp')} value={fmtPct(stats.kpPct)} hint={hint} points={stats.kpS} ring={stats.kpPct} onPick={() => setLadderSpec('kp')} active={ladderSpec === 'kp'} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.damageShare')} value={fmtPct(stats.damageSharePct)} hint={hint} points={stats.damageShareS} onPick={() => setLadderSpec('damageShare')} active={ladderSpec === 'damageShare'} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.goldShare')} value={fmtPct(stats.goldSharePct)} hint={hint} points={stats.goldShareS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionShare')} value={fmtPct(stats.visionSharePct)} hint={hint} points={stats.visionShareS} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.objDamageShare')} value={fmtPct(stats.objDamageSharePct)} hint={hint} points={stats.objDamageShareS} />
              <StatCard icon={<Ico name="team" />} label={t('lens.assists')} value={fmtNum(stats.assists, 1)} hint={hint} points={stats.assistsS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.allyHealMin')} value={fmtNum(stats.allyHealPerMin, 0)} hint={hint} points={stats.allyHealPerMinS} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.shieldMin')} value={fmtNum(stats.shieldPerMin, 0)} hint={hint} points={stats.shieldPerMinS} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.ka')} value={fmtNum(stats.killsAssists, 1)} hint={hint} points={stats.killsAssistsS} />
            </div>
            {(() => {
              const spec = IMPACT_LADDER_STATS.find((row) => row.id === ladderSpec) || IMPACT_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.impactNote')}</p>
          </>
        ) : impactCat === 'damage' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="swords" />} label={t('lens.damageShare')} value={fmtPct(stats.damageSharePct)} hint={hint} points={stats.damageShareS} ring={stats.damageSharePct} onPick={() => setLadderSpec('damageShare')} active={ladderSpec === 'damageShare'} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.dpm')} value={fmtNum(stats.dpm, 0)} hint={hint} points={stats.dpmS} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.goldShare')} value={fmtPct(stats.goldSharePct)} hint={hint} points={stats.goldShareS} />
              <StatCard icon={<Ico name="kp" />} label={t('lens.kp')} value={fmtPct(stats.kpPct)} hint={hint} points={stats.kpS} ring={stats.kpPct} onPick={() => setLadderSpec('kp')} active={ladderSpec === 'kp'} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.ka')} value={fmtNum(stats.killsAssists, 1)} hint={hint} points={stats.killsAssistsS} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.dpmEarly')} value={stats.dpmEarly != null ? fmtNum(stats.dpmEarly, 0) : '—'} hint={stats.phaseHint} points={stats.dpmEarlyS} soon={stats.dpmEarly == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.dpmMid')} value={stats.dpmMid != null ? fmtNum(stats.dpmMid, 0) : '—'} hint={stats.phaseHint} points={stats.dpmMidS} soon={stats.dpmMid == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.dpmLate')} value={stats.dpmLate != null ? fmtNum(stats.dpmLate, 0) : '—'} hint={stats.phaseHint} points={stats.dpmLateS} soon={stats.dpmLate == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.objDamageShare')} value={fmtPct(stats.objDamageSharePct)} hint={hint} points={stats.objDamageShareS} />
            </div>
            {(() => {
              const spec = IMPACT_LADDER_STATS.find((row) => row.id === 'damageShare');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.impactDamageNote')}</p>
          </>
        ) : impactCat === 'utility' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="team" />} label={t('lens.assists')} value={fmtNum(stats.assists, 1)} hint={hint} points={stats.assistsS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.allyHealMin')} value={fmtNum(stats.allyHealPerMin, 0)} hint={hint} points={stats.allyHealPerMinS} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.shieldMin')} value={fmtNum(stats.shieldPerMin, 0)} hint={hint} points={stats.shieldPerMinS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.effectiveHealShield')} value={stats.effectiveHealShield != null ? fmtNum(stats.effectiveHealShield, 0) : '—'} hint={hint} points={stats.effectiveHealShieldS} soon={stats.effectiveHealShield == null} />
              <StatCard icon={<Ico name="team" />} label={t('lens.saveAllyFromDeath')} value={stats.saveAllyFromDeath != null ? fmtNum(stats.saveAllyFromDeath, 1) : '—'} hint={hint} points={stats.saveAllyFromDeathS} soon={stats.saveAllyFromDeath == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.timeCCing')} value={fmtNum(stats.timeCCing, 1)} hint={hint} points={stats.timeCCingS} />
              <StatCard icon={<Ico name="kp" />} label={t('lens.kp')} value={fmtPct(stats.kpPct)} hint={hint} points={stats.kpS} ring={stats.kpPct} onPick={() => setLadderSpec('kp')} active={ladderSpec === 'kp'} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.ka')} value={fmtNum(stats.killsAssists, 1)} hint={hint} points={stats.killsAssistsS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionShare')} value={fmtPct(stats.visionSharePct)} hint={hint} points={stats.visionShareS} />
            </div>
            {(() => {
              const spec = IMPACT_LADDER_STATS.find((row) => row.id === 'kp');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.impactUtilityNote')}</p>
          </>
        ) : impactCat === 'vision' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionShare')} value={fmtPct(stats.visionSharePct)} hint={hint} points={stats.visionShareS} ring={stats.visionSharePct} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionMin')} value={fmtNum(stats.visionPerMin, 2)} hint={hint} points={stats.visionPerMinS} onPick={() => setLadderSpec('visionPerMin')} active={ladderSpec === 'visionPerMin'} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionScore')} value={fmtNum(stats.visionScore, 1)} hint={hint} points={stats.visionScoreS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsPlaced')} value={fmtNum(stats.wardsPlaced, 1)} hint={hint} points={stats.wardsPlacedS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardsKilled')} value={fmtNum(stats.wardsKilled, 1)} hint={hint} points={stats.wardsKilledS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlWardsPlaced')} value={fmtNum(stats.controlWardsPlaced, 1)} hint={hint} points={stats.controlWardsPlacedS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsPlacedMin')} value={fmtNum(stats.wardsPlacedPerMin, 2)} hint={hint} points={stats.wardsPlacedPerMinS} />
              <StatCard icon={<Ico name="kp" />} label={t('lens.kp')} value={fmtPct(stats.kpPct)} hint={hint} points={stats.kpS} ring={stats.kpPct} onPick={() => setLadderSpec('kp')} active={ladderSpec === 'kp'} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.objDamageShare')} value={fmtPct(stats.objDamageSharePct)} hint={hint} points={stats.objDamageShareS} />
            </div>
            {(() => {
              const spec = IMPACT_LADDER_STATS.find((row) => row.id === 'visionPerMin');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.impactVisionNote')}</p>
          </>
        ) : impactCat === 'objectives' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="tower" />} label={t('lens.objDamageShare')} value={fmtPct(stats.objDamageSharePct)} hint={hint} points={stats.objDamageShareS} ring={stats.objDamageSharePct} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.objDpm')} value={fmtNum(stats.objDpm, 0)} hint={hint} points={stats.objDpmS} onPick={() => setLadderSpec('objDpm')} active={ladderSpec === 'objDpm'} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.towerDpm')} value={fmtNum(stats.towerDpm, 0)} hint={hint} points={stats.towerDpmS} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.turretTakedowns')} value={fmtNum(stats.turretTakedowns, 1)} hint={hint} points={stats.turretTakedownsS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.epicTakes')} value={stats.epicTakes != null ? fmtNum(stats.epicTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.epicTakesS} soon={stats.epicTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.dragonTakes')} value={stats.dragonTakes != null ? fmtNum(stats.dragonTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.dragonTakesS} soon={stats.dragonTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.baronTakes')} value={stats.baronTakes != null ? fmtNum(stats.baronTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.baronTakesS} soon={stats.baronTakes == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.firstTower')} value={fmtPct(stats.firstTowerPct)} hint={hint} points={stats.firstTowerS} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.objStolen')} value={fmtNum(stats.objStolenAvg, 1)} hint={hint} points={stats.objStolenAvgS} />
            </div>
            {(() => {
              const spec = IMPACT_LADDER_STATS.find((row) => row.id === 'objDpm');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.impactObjectivesNote')}</p>
          </>
        ) : (
          <div className="ln-empty ln-fight-empty">
            <span className="ln-lock-lg"><IcoLock /></span>
            <p>{t('lens.impactSubSoon')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AdaptStage({
  cats, adaptCat, setAdaptCat, stats, hint, avatar, compareRank, ladderSpec,
  setLadderSpec, statLadder, ladderLoading, ladderRefreshing, ladderMatches, playerTier, t,
}) {
  const adaptValues = {
    general: {
      value: String(stats.uniqueChamps ?? '—'),
      unit: t('lens.uniqueChamps'),
      halo: stats.uniqueChamps != null,
    },
    champs: {
      value: String(stats.uniqueChamps ?? '—'),
      unit: t('lens.uniqueChamps'),
      halo: stats.uniqueChamps != null,
    },
    roles: {
      value: fmtPct(stats.offRolePct),
      unit: t('lens.offRole'),
      halo: stats.offRolePct != null,
    },
    runes: {
      value: String(stats.uniqueKeystones ?? '—'),
      unit: t('lens.uniqueKeystones'),
      halo: stats.uniqueKeystones != null,
    },
    builds: {
      value: String(stats.uniqueItems ?? '—'),
      unit: t('lens.uniqueItems'),
      halo: stats.uniqueItems != null,
    },
  };

  const ladderProps = {
    playerTier,
    statLadder,
    loading: ladderLoading,
    refreshing: ladderRefreshing,
    matches: ladderMatches,
    t,
  };

  return (
    <div className="ln-fight">
      <div className="ln-fight-cats">
        {cats.map((cat) => (
          <CatCard
            key={cat.id}
            cat={cat}
            t={t}
            selected={adaptCat === cat.id}
            onSelect={setAdaptCat}
            value={adaptValues[cat.id]?.value}
            unit={adaptValues[cat.id]?.unit}
            ring={adaptValues[cat.id]?.ring}
            halo={adaptValues[cat.id]?.halo}
            avatar={avatar}
            compareRank={compareRank}
          />
        ))}
      </div>
      <div className="ln-fight-main">
        {adaptCat === 'general' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="mask" />} label={t('lens.uniqueChamps')} value={String(stats.uniqueChamps ?? '—')} hint={hint} points={stats.uniqueChampsS} onPick={() => setLadderSpec('champVariety')} active={ladderSpec === 'champVariety'} />
              <StatCard icon={<Ico name="star" />} label={t('lens.champVariety')} value={fmtNum(stats.champVariety, 1)} hint={t('lens.champVarietyHint')} points={stats.champVarietyS} onPick={() => setLadderSpec('champVariety')} active={ladderSpec === 'champVariety'} />
              <StatCard icon={<Ico name="star" />} label={t('lens.mainChampShare')} value={fmtPct(stats.mainChampShare)} hint={hint} points={stats.mainChampShareS} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.uniqueRoles')} value={String(stats.uniqueRoles ?? '—')} hint={hint} points={stats.uniqueRolesS} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.offRole')} value={fmtPct(stats.offRolePct)} hint={hint} points={stats.offRoleS} onPick={() => setLadderSpec('offRole')} active={ladderSpec === 'offRole'} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.uniqueKeystones')} value={String(stats.uniqueKeystones ?? '—')} hint={hint} points={stats.uniqueKeystonesS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.uniquePrimaries')} value={String(stats.uniquePrimaries ?? '—')} hint={hint} points={stats.uniquePrimariesS} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.uniqueSpells')} value={String(stats.uniqueSpells ?? '—')} hint={hint} points={stats.uniqueSpellsS} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.uniqueItems')} value={String(stats.uniqueItems ?? '—')} hint={hint} points={stats.uniqueItemsS} />
            </div>
            {(() => {
              const spec = ADAPT_LADDER_STATS.find((row) => row.id === ladderSpec) || ADAPT_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.adaptNote')}</p>
          </>
        ) : adaptCat === 'champs' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="mask" />} label={t('lens.uniqueChamps')} value={String(stats.uniqueChamps ?? '—')} hint={hint} points={stats.uniqueChampsS} onPick={() => setLadderSpec('champVariety')} active={ladderSpec === 'champVariety'} />
              <StatCard icon={<Ico name="star" />} label={t('lens.champVariety')} value={fmtNum(stats.champVariety, 1)} hint={t('lens.champVarietyHint')} points={stats.champVarietyS} onPick={() => setLadderSpec('champVariety')} active={ladderSpec === 'champVariety'} />
              <StatCard icon={<Ico name="star" />} label={t('lens.mainChampShare')} value={fmtPct(stats.mainChampShare)} hint={hint} points={stats.mainChampShareS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.mainChampGames')} value={String(stats.mainChampGames ?? '—')} hint={hint} points={stats.mainChampGamesS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.oneOffChamps')} value={String(stats.oneOffChamps ?? '—')} hint={hint} points={stats.oneOffChampsS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.champsPlayed3Plus')} value={String(stats.champsPlayed3Plus ?? '—')} hint={hint} points={stats.champsPlayed3PlusS} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.uniqueRoles')} value={String(stats.uniqueRoles ?? '—')} hint={hint} points={stats.uniqueRolesS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.uniqueKeystones')} value={String(stats.uniqueKeystones ?? '—')} hint={hint} points={stats.uniqueKeystonesS} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.uniqueSpells')} value={String(stats.uniqueSpells ?? '—')} hint={hint} points={stats.uniqueSpellsS} />
            </div>
            {(() => {
              const spec = ADAPT_LADDER_STATS.find((row) => row.id === 'champVariety');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.adaptChampsNote')}</p>
          </>
        ) : adaptCat === 'roles' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="lane" />} label={t('lens.uniqueRoles')} value={String(stats.uniqueRoles ?? '—')} hint={hint} points={stats.uniqueRolesS} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.offRole')} value={fmtPct(stats.offRolePct)} hint={hint} points={stats.offRoleS} onPick={() => setLadderSpec('offRole')} active={ladderSpec === 'offRole'} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.mainRoleShare')} value={fmtPct(stats.mainRoleShare)} hint={hint} points={stats.mainRoleShareS} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.offRoleGames')} value={String(stats.offRoleGames ?? '—')} hint={hint} points={stats.offRoleGamesS} />
              <StatCard icon={<Ico name="mask" />} label={t('lens.uniqueChamps')} value={String(stats.uniqueChamps ?? '—')} hint={hint} points={stats.uniqueChampsS} onPick={() => setLadderSpec('champVariety')} active={ladderSpec === 'champVariety'} />
              <StatCard icon={<Ico name="star" />} label={t('lens.champVariety')} value={fmtNum(stats.champVariety, 1)} hint={t('lens.champVarietyHint')} points={stats.champVarietyS} onPick={() => setLadderSpec('champVariety')} active={ladderSpec === 'champVariety'} />
              <StatCard icon={<Ico name="star" />} label={t('lens.mainChampShare')} value={fmtPct(stats.mainChampShare)} hint={hint} points={stats.mainChampShareS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.uniqueKeystones')} value={String(stats.uniqueKeystones ?? '—')} hint={hint} points={stats.uniqueKeystonesS} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.uniqueSpells')} value={String(stats.uniqueSpells ?? '—')} hint={hint} points={stats.uniqueSpellsS} />
            </div>
            {(() => {
              const spec = ADAPT_LADDER_STATS.find((row) => row.id === 'offRole');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.adaptRolesNote')}</p>
          </>
        ) : adaptCat === 'runes' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="spark" />} label={t('lens.uniqueKeystones')} value={String(stats.uniqueKeystones ?? '—')} hint={hint} points={stats.uniqueKeystonesS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.uniquePrimaries')} value={String(stats.uniquePrimaries ?? '—')} hint={hint} points={stats.uniquePrimariesS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.uniqueSecondaries')} value={String(stats.uniqueSecondaries ?? '—')} hint={hint} points={stats.uniqueSecondariesS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.uniqueRunePages')} value={String(stats.uniqueRunePages ?? '—')} hint={hint} points={stats.uniqueRunePagesS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.mainKeystoneShare')} value={fmtPct(stats.mainKeystoneShare)} hint={hint} points={stats.mainKeystoneShareS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.mainPrimaryShare')} value={fmtPct(stats.mainPrimaryShare)} hint={hint} points={stats.mainPrimaryShareS} />
              <StatCard icon={<Ico name="mask" />} label={t('lens.uniqueChamps')} value={String(stats.uniqueChamps ?? '—')} hint={hint} points={stats.uniqueChampsS} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.uniqueRoles')} value={String(stats.uniqueRoles ?? '—')} hint={hint} points={stats.uniqueRolesS} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.uniqueSpells')} value={String(stats.uniqueSpells ?? '—')} hint={hint} points={stats.uniqueSpellsS} />
            </div>
            {(() => {
              const spec = ADAPT_LADDER_STATS.find((row) => row.id === 'champVariety');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.adaptRunesNote')}</p>
          </>
        ) : adaptCat === 'builds' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="crest" />} label={t('lens.uniqueItems')} value={String(stats.uniqueItems ?? '—')} hint={hint} points={stats.uniqueItemsS} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.uniqueBuilds')} value={String(stats.uniqueBuilds ?? '—')} hint={hint} points={stats.uniqueBuildsS} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.uniqueFirstItems')} value={String(stats.uniqueFirstItems ?? '—')} hint={hint} points={stats.uniqueFirstItemsS} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.uniqueSpells')} value={String(stats.uniqueSpells ?? '—')} hint={hint} points={stats.uniqueSpellsS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.mainSpellShare')} value={fmtPct(stats.mainSpellShare)} hint={hint} points={stats.mainSpellShareS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.mainBuildShare')} value={fmtPct(stats.mainBuildShare)} hint={hint} points={stats.mainBuildShareS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.uniqueKeystones')} value={String(stats.uniqueKeystones ?? '—')} hint={hint} points={stats.uniqueKeystonesS} />
              <StatCard icon={<Ico name="mask" />} label={t('lens.uniqueChamps')} value={String(stats.uniqueChamps ?? '—')} hint={hint} points={stats.uniqueChampsS} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.offRole')} value={fmtPct(stats.offRolePct)} hint={hint} points={stats.offRoleS} onPick={() => setLadderSpec('offRole')} active={ladderSpec === 'offRole'} />
            </div>
            {(() => {
              const spec = ADAPT_LADDER_STATS.find((row) => row.id === 'champVariety');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.adaptBuildsNote')}</p>
          </>
        ) : (
          <div className="ln-empty ln-fight-empty">
            <span className="ln-lock-lg"><IcoLock /></span>
            <p>{t('lens.adaptSubSoon')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SurviveStage({
  cats, survCat, setSurvCat, stats, hint, avatar, compareRank, ladderSpec,
  setLadderSpec, statLadder, ladderLoading, ladderRefreshing, ladderMatches, playerTier, t,
}) {
  const survValues = {
    general: {
      value: fmtNum(stats.deaths, 1),
      unit: t('lens.deaths'),
      halo: stats.deaths != null,
    },
    deaths: {
      value: fmtNum(stats.deaths, 1),
      unit: t('lens.deaths'),
      halo: stats.deaths != null,
    },
    tanking: {
      value: fmtNum(stats.taken, 0),
      unit: t('lens.taken'),
      halo: stats.taken != null,
    },
    sustain: {
      value: fmtNum(stats.healPerMin, 0),
      unit: t('lens.healMin'),
      halo: stats.healPerMin != null,
    },
    crowd: {
      value: fmtNum(stats.timeCCing, 1),
      unit: t('lens.timeCCing'),
      halo: stats.timeCCing != null,
    },
  };

  const ladderProps = {
    playerTier,
    statLadder,
    loading: ladderLoading,
    refreshing: ladderRefreshing,
    matches: ladderMatches,
    t,
  };

  return (
    <div className="ln-fight">
      <div className="ln-fight-cats">
        {cats.map((cat) => (
          <CatCard
            key={cat.id}
            cat={cat}
            t={t}
            selected={survCat === cat.id}
            onSelect={setSurvCat}
            value={survValues[cat.id]?.value}
            unit={survValues[cat.id]?.unit}
            ring={survValues[cat.id]?.ring}
            halo={survValues[cat.id]?.halo}
            avatar={avatar}
            compareRank={compareRank}
          />
        ))}
      </div>
      <div className="ln-fight-main">
        {survCat === 'general' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="trophy" />} label={t('lens.deaths')} value={fmtNum(stats.deaths, 1)} hint={hint} points={stats.deathsS} invert onPick={() => setLadderSpec('deaths')} active={ladderSpec === 'deaths'} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.taken')} value={fmtNum(stats.taken, 0)} hint={hint} points={stats.takenS} invert onPick={() => setLadderSpec('taken')} active={ladderSpec === 'taken'} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.mitigated')} value={fmtNum(stats.mitigated, 0)} hint={hint} points={stats.mitigatedS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.healMin')} value={fmtNum(stats.healPerMin, 0)} hint={hint} points={stats.healPerMinS} />
              <StatCard icon={<Ico name="team" />} label={t('lens.allyHealMin')} value={fmtNum(stats.allyHealPerMin, 0)} hint={hint} points={stats.allyHealPerMinS} />
              <StatCard icon={<Ico name="trophy" />} label={t('lens.longestLife')} value={fmtClock(stats.longestLife)} hint={hint} points={stats.longestLifeS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.timeCCing')} value={fmtNum(stats.timeCCing, 1)} hint={hint} points={stats.timeCCingS} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.timeDead')} value={fmtClock(stats.timeDead)} hint={hint} points={stats.timeDeadS} invert />
              <StatCard icon={<Ico name="skull" />} label={t('lens.deathsMin')} value={fmtNum(stats.deathsPerMin, 2)} hint={hint} points={stats.deathsPerMinS} invert />
            </div>
            {(() => {
              const spec = SURVIVE_LADDER_STATS.find((row) => row.id === ladderSpec) || SURVIVE_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.survNote')}</p>
          </>
        ) : survCat === 'deaths' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="skull" />} label={t('lens.deaths')} value={fmtNum(stats.deaths, 1)} hint={hint} points={stats.deathsS} invert onPick={() => setLadderSpec('deaths')} active={ladderSpec === 'deaths'} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.deathsMin')} value={fmtNum(stats.deathsPerMin, 2)} hint={hint} points={stats.deathsPerMinS} invert />
              <StatCard icon={<Ico name="skull" />} label={t('lens.timeDead')} value={fmtClock(stats.timeDead)} hint={hint} points={stats.timeDeadS} invert />
              <StatCard icon={<Ico name="skull" />} label={t('lens.deathsBefore15')} value={stats.deathsBefore15 != null ? fmtNum(stats.deathsBefore15, 1) : '—'} hint={stats.deathTimingHint} points={stats.deathsBefore15S} invert soon={stats.deathsBefore15 == null} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.deathsBefore25')} value={stats.deathsBefore25 != null ? fmtNum(stats.deathsBefore25, 1) : '—'} hint={stats.deathTimingHint} points={stats.deathsBefore25S} invert soon={stats.deathsBefore25 == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.firstDeath')} value={stats.firstDeathSec != null ? fmtClock(stats.firstDeathSec) : '—'} hint={stats.deathTimingHint} points={stats.firstDeathSecS} invert soon={stats.firstDeathSec == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.avgDeath')} value={stats.avgDeathSec != null ? fmtClock(stats.avgDeathSec) : '—'} hint={stats.deathTimingHint} points={stats.avgDeathSecS} invert soon={stats.avgDeathSec == null} />
              <StatCard icon={<Ico name="vs" />} label={t('lens.soloDeaths')} value={stats.soloDeaths != null ? fmtNum(stats.soloDeaths, 1) : '—'} hint={stats.duelHint} points={stats.soloDeathsS} invert soon={stats.soloDeaths == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.deathsByEnemyChamps')} value={stats.deathsByEnemyChamps != null ? fmtNum(stats.deathsByEnemyChamps, 1) : '—'} hint={hint} points={stats.deathsByEnemyChampsS} invert soon={stats.deathsByEnemyChamps == null} />
            </div>
            {(() => {
              const spec = SURVIVE_LADDER_STATS.find((row) => row.id === 'deaths');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.survDeathsNote')}</p>
          </>
        ) : survCat === 'tanking' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="shield" />} label={t('lens.taken')} value={fmtNum(stats.taken, 0)} hint={hint} points={stats.takenS} invert onPick={() => setLadderSpec('taken')} active={ladderSpec === 'taken'} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.mitigated')} value={fmtNum(stats.mitigated, 0)} hint={hint} points={stats.mitigatedS} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.damageTaken')} value={fmtNum(stats.damageTaken, 0)} hint={hint} points={stats.damageTakenS} invert />
              <StatCard icon={<Ico name="shield" />} label={t('lens.mitigatedTotal')} value={fmtNum(stats.mitigatedTotal, 0)} hint={hint} points={stats.mitigatedTotalS} />
              <StatCard icon={<Ico name="team" />} label={t('lens.damageTakenShare')} value={stats.damageTakenShare != null ? fmtPct(stats.damageTakenShare * 100) : '—'} hint={hint} points={stats.damageTakenShareS} soon={stats.damageTakenShare == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.survivedSingleDigitHp')} value={stats.survivedSingleDigitHp != null ? fmtNum(stats.survivedSingleDigitHp, 1) : '—'} hint={hint} points={stats.survivedSingleDigitHpS} soon={stats.survivedSingleDigitHp == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.tookLargeDamageSurvived')} value={stats.tookLargeDamageSurvived != null ? fmtNum(stats.tookLargeDamageSurvived, 1) : '—'} hint={hint} points={stats.tookLargeDamageSurvivedS} soon={stats.tookLargeDamageSurvived == null} />
              <StatCard icon={<Ico name="trophy" />} label={t('lens.longestLife')} value={fmtClock(stats.longestLife)} hint={hint} points={stats.longestLifeS} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.deaths')} value={fmtNum(stats.deaths, 1)} hint={hint} points={stats.deathsS} invert onPick={() => setLadderSpec('deaths')} active={ladderSpec === 'deaths'} />
            </div>
            {(() => {
              const spec = SURVIVE_LADDER_STATS.find((row) => row.id === 'taken');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.survTankingNote')}</p>
          </>
        ) : survCat === 'sustain' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="star" />} label={t('lens.healMin')} value={fmtNum(stats.healPerMin, 0)} hint={hint} points={stats.healPerMinS} />
              <StatCard icon={<Ico name="team" />} label={t('lens.allyHealMin')} value={fmtNum(stats.allyHealPerMin, 0)} hint={hint} points={stats.allyHealPerMinS} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.shieldMin')} value={fmtNum(stats.shieldPerMin, 0)} hint={hint} points={stats.shieldPerMinS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.healTotal')} value={fmtNum(stats.healTotal, 0)} hint={hint} points={stats.healTotalS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.effectiveHealShield')} value={stats.effectiveHealShield != null ? fmtNum(stats.effectiveHealShield, 0) : '—'} hint={hint} points={stats.effectiveHealShieldS} soon={stats.effectiveHealShield == null} />
              <StatCard icon={<Ico name="team" />} label={t('lens.saveAllyFromDeath')} value={stats.saveAllyFromDeath != null ? fmtNum(stats.saveAllyFromDeath, 1) : '—'} hint={hint} points={stats.saveAllyFromDeathS} soon={stats.saveAllyFromDeath == null} />
              <StatCard icon={<Ico name="trophy" />} label={t('lens.longestLife')} value={fmtClock(stats.longestLife)} hint={hint} points={stats.longestLifeS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.survivedSingleDigitHp')} value={stats.survivedSingleDigitHp != null ? fmtNum(stats.survivedSingleDigitHp, 1) : '—'} hint={hint} points={stats.survivedSingleDigitHpS} soon={stats.survivedSingleDigitHp == null} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.timeDead')} value={fmtClock(stats.timeDead)} hint={hint} points={stats.timeDeadS} invert />
            </div>
            {(() => {
              const spec = SURVIVE_LADDER_STATS.find((row) => row.id === 'deaths');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.survSustainNote')}</p>
          </>
        ) : survCat === 'crowd' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="spark" />} label={t('lens.timeCCing')} value={fmtNum(stats.timeCCing, 1)} hint={hint} points={stats.timeCCingS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.timeCcDealt')} value={fmtNum(stats.timeCcDealt, 1)} hint={hint} points={stats.timeCcDealtS} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.enemyImmobilizations')} value={stats.enemyImmobilizations != null ? fmtNum(stats.enemyImmobilizations, 1) : '—'} hint={hint} points={stats.enemyImmobilizationsS} soon={stats.enemyImmobilizations == null} />
              <StatCard icon={<Ico name="vs" />} label={t('lens.immobilizeAndKill')} value={stats.immobilizeAndKill != null ? fmtNum(stats.immobilizeAndKill, 1) : '—'} hint={hint} points={stats.immobilizeAndKillS} soon={stats.immobilizeAndKill == null} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.survivedThreeImmobilizes')} value={stats.survivedThreeImmobilizes != null ? fmtNum(stats.survivedThreeImmobilizes, 1) : '—'} hint={hint} points={stats.survivedThreeImmobilizesS} soon={stats.survivedThreeImmobilizes == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.skillshotsDodged')} value={stats.skillshotsDodged != null ? fmtNum(stats.skillshotsDodged, 0) : '—'} hint={hint} points={stats.skillshotsDodgedS} soon={stats.skillshotsDodged == null} />
              <StatCard icon={<Ico name="mask" />} label={t('lens.unseenRecalls')} value={stats.unseenRecalls != null ? fmtNum(stats.unseenRecalls, 1) : '—'} hint={hint} points={stats.unseenRecallsS} soon={stats.unseenRecalls == null} />
              <StatCard icon={<Ico name="trophy" />} label={t('lens.longestLife')} value={fmtClock(stats.longestLife)} hint={hint} points={stats.longestLifeS} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.deaths')} value={fmtNum(stats.deaths, 1)} hint={hint} points={stats.deathsS} invert onPick={() => setLadderSpec('deaths')} active={ladderSpec === 'deaths'} />
            </div>
            {(() => {
              const spec = SURVIVE_LADDER_STATS.find((row) => row.id === 'deaths');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.survCrowdNote')}</p>
          </>
        ) : (
          <div className="ln-empty ln-fight-empty">
            <span className="ln-lock-lg"><IcoLock /></span>
            <p>{t('lens.survSubSoon')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function VisionStage({
  cats, visCat, setVisCat, stats, hint, avatar, compareRank, ladderSpec,
  setLadderSpec, statLadder, ladderLoading, ladderRefreshing, ladderMatches, playerTier, t,
}) {
  const visValues = {
    general: {
      value: fmtNum(stats.visionPerMin, 1),
      unit: t('lens.visionMin'),
      halo: stats.visionPerMin != null,
    },
    placement: {
      value: fmtNum(stats.wardsPlaced, 1),
      unit: t('lens.wardsPlaced'),
      halo: stats.wardsPlaced != null,
    },
    denial: {
      value: fmtNum(stats.wardsKilled, 1),
      unit: t('lens.wardsKilled'),
      halo: stats.wardsKilled != null,
    },
    control: {
      value: fmtNum(stats.controlWardsPlaced, 1),
      unit: t('lens.controlWardsPlaced'),
      halo: stats.controlWardsPlaced != null,
    },
    timing: {
      value: stats.wardsPlaced20 != null ? fmtNum(stats.wardsPlaced20, 1) : '—',
      unit: t('lens.wardsPlaced20'),
      halo: stats.wardsPlaced20 != null,
    },
  };

  const ladderProps = {
    playerTier,
    statLadder,
    loading: ladderLoading,
    refreshing: ladderRefreshing,
    matches: ladderMatches,
    t,
  };

  return (
    <div className="ln-fight">
      <div className="ln-fight-cats">
        {cats.map((cat) => (
          <CatCard
            key={cat.id}
            cat={cat}
            t={t}
            selected={visCat === cat.id}
            onSelect={setVisCat}
            value={visValues[cat.id]?.value}
            unit={visValues[cat.id]?.unit}
            ring={visValues[cat.id]?.ring}
            halo={visValues[cat.id]?.halo}
            avatar={avatar}
            compareRank={compareRank}
          />
        ))}
      </div>
      <div className="ln-fight-main">
        {visCat === 'general' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionMin')} value={fmtNum(stats.visionPerMin, 1)} hint={hint} points={stats.visionPerMinS} ring={stats.visionPerMin != null ? Math.min(100, stats.visionPerMin * 20) : null} onPick={() => setLadderSpec('visionPerMin')} active={ladderSpec === 'visionPerMin'} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionScore')} value={fmtNum(stats.visionScore, 1)} hint={hint} points={stats.visionScoreS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsPlaced')} value={fmtNum(stats.wardsPlaced, 1)} hint={hint} points={stats.wardsPlacedS} onPick={() => setLadderSpec('wardsPlaced')} active={ladderSpec === 'wardsPlaced'} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardsKilled')} value={fmtNum(stats.wardsKilled, 1)} hint={hint} points={stats.wardsKilledS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlWardsBought')} value={fmtNum(stats.controlWardsBought, 1)} hint={hint} points={stats.controlWardsBoughtS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlWardsPlaced')} value={fmtNum(stats.controlWardsPlaced, 1)} hint={hint} points={stats.controlWardsPlacedS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsPlacedMin')} value={fmtNum(stats.wardsPlacedPerMin, 2)} hint={hint} points={stats.wardsPlacedPerMinS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardsKilledMin')} value={fmtNum(stats.wardsKilledPerMin, 2)} hint={hint} points={stats.wardsKilledPerMinS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlWardsMin')} value={fmtNum(stats.controlWardsPerMin, 2)} hint={hint} points={stats.controlWardsPerMinS} />
            </div>
            {(() => {
              const spec = VISION_LADDER_STATS.find((row) => row.id === ladderSpec) || VISION_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.visNote')}</p>
          </>
        ) : visCat === 'placement' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsPlaced')} value={fmtNum(stats.wardsPlaced, 1)} hint={hint} points={stats.wardsPlacedS} onPick={() => setLadderSpec('wardsPlaced')} active={ladderSpec === 'wardsPlaced'} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.stealthWardsPlaced')} value={fmtNum(stats.stealthWardsPlaced, 1)} hint={hint} points={stats.stealthWardsPlacedS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsPlacedMin')} value={fmtNum(stats.wardsPlacedPerMin, 2)} hint={hint} points={stats.wardsPlacedPerMinS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionScore')} value={fmtNum(stats.visionScore, 1)} hint={hint} points={stats.visionScoreS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionMin')} value={fmtNum(stats.visionPerMin, 1)} hint={hint} points={stats.visionPerMinS} onPick={() => setLadderSpec('visionPerMin')} active={ladderSpec === 'visionPerMin'} />
              <StatCard icon={<Ico name="team" />} label={t('lens.visionShare')} value={fmtPct(stats.visionSharePct)} hint={hint} points={stats.visionShareS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.wardsGuarded')} value={stats.wardsGuarded != null ? fmtNum(stats.wardsGuarded, 1) : '—'} hint={hint} points={stats.wardsGuardedS} soon={stats.wardsGuarded == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlWardsPlaced')} value={fmtNum(stats.controlWardsPlaced, 1)} hint={hint} points={stats.controlWardsPlacedS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.laneVisionAdv')} value={stats.laneVisionAdv != null ? fmtSigned(stats.laneVisionAdv, 1) : '—'} hint={hint} points={stats.laneVisionAdvS} soon={stats.laneVisionAdv == null} />
            </div>
            {(() => {
              const spec = VISION_LADDER_STATS.find((row) => row.id === 'wardsPlaced');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.visPlacementNote')}</p>
          </>
        ) : visCat === 'denial' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardsKilled')} value={fmtNum(stats.wardsKilled, 1)} hint={hint} points={stats.wardsKilledS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardTakedowns')} value={fmtNum(stats.wardTakedowns, 1)} hint={hint} points={stats.wardTakedownsS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardsKilledMin')} value={fmtNum(stats.wardsKilledPerMin, 2)} hint={hint} points={stats.wardsKilledPerMinS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardTakedownsBefore20')} value={stats.wardTakedownsBefore20 != null ? fmtNum(stats.wardTakedownsBefore20, 1) : '—'} hint={hint} points={stats.wardTakedownsBefore20S} soon={stats.wardTakedownsBefore20 == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.mostWardsOneSweeper')} value={stats.mostWardsOneSweeper != null ? fmtNum(stats.mostWardsOneSweeper, 1) : '—'} hint={hint} points={stats.mostWardsOneSweeperS} soon={stats.mostWardsOneSweeper == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.twoWardsOneSweeper')} value={stats.twoWardsOneSweeper != null ? fmtNum(stats.twoWardsOneSweeper, 1) : '—'} hint={hint} points={stats.twoWardsOneSweeperS} soon={stats.twoWardsOneSweeper == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.threeWardsOneSweeper')} value={stats.threeWardsOneSweeper != null ? fmtNum(stats.threeWardsOneSweeper, 1) : '—'} hint={hint} points={stats.threeWardsOneSweeperS} soon={stats.threeWardsOneSweeper == null} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsKilled15')} value={stats.wardsKilled15 != null ? fmtNum(stats.wardsKilled15, 1) : '—'} hint={stats.visTimingHint} points={stats.wardsKilled15S} soon={stats.wardsKilled15 == null} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionMin')} value={fmtNum(stats.visionPerMin, 1)} hint={hint} points={stats.visionPerMinS} onPick={() => setLadderSpec('visionPerMin')} active={ladderSpec === 'visionPerMin'} />
            </div>
            {(() => {
              const spec = VISION_LADDER_STATS.find((row) => row.id === 'visionPerMin');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.visDenialNote')}</p>
          </>
        ) : visCat === 'control' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="star" />} label={t('lens.controlWardsPlaced')} value={fmtNum(stats.controlWardsPlaced, 1)} hint={hint} points={stats.controlWardsPlacedS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlWardsBought')} value={fmtNum(stats.controlWardsBought, 1)} hint={hint} points={stats.controlWardsBoughtS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlWardsMin')} value={fmtNum(stats.controlWardsPerMin, 2)} hint={hint} points={stats.controlWardsPerMinS} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.controlWardRiverCoverage')} value={stats.controlWardRiverCoverage != null ? fmtPct(stats.controlWardRiverCoverage * 100) : '—'} hint={hint} points={stats.controlWardRiverCoverageS} soon={stats.controlWardRiverCoverage == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlPlaced15')} value={stats.controlPlaced15 != null ? fmtNum(stats.controlPlaced15, 1) : '—'} hint={stats.visTimingHint} points={stats.controlPlaced15S} soon={stats.controlPlaced15 == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlPlaced20')} value={stats.controlPlaced20 != null ? fmtNum(stats.controlPlaced20, 1) : '—'} hint={stats.visTimingHint} points={stats.controlPlaced20S} soon={stats.controlPlaced20 == null} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsGuarded')} value={stats.wardsGuarded != null ? fmtNum(stats.wardsGuarded, 1) : '—'} hint={hint} points={stats.wardsGuardedS} soon={stats.wardsGuarded == null} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionScore')} value={fmtNum(stats.visionScore, 1)} hint={hint} points={stats.visionScoreS} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionMin')} value={fmtNum(stats.visionPerMin, 1)} hint={hint} points={stats.visionPerMinS} onPick={() => setLadderSpec('visionPerMin')} active={ladderSpec === 'visionPerMin'} />
            </div>
            {(() => {
              const spec = VISION_LADDER_STATS.find((row) => row.id === 'visionPerMin');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.visControlNote')}</p>
          </>
        ) : visCat === 'timing' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsPlaced15')} value={stats.wardsPlaced15 != null ? fmtNum(stats.wardsPlaced15, 1) : '—'} hint={stats.visTimingHint} points={stats.wardsPlaced15S} soon={stats.wardsPlaced15 == null} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsPlaced20')} value={stats.wardsPlaced20 != null ? fmtNum(stats.wardsPlaced20, 1) : '—'} hint={stats.visTimingHint} points={stats.wardsPlaced20S} soon={stats.wardsPlaced20 == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardsKilled15')} value={stats.wardsKilled15 != null ? fmtNum(stats.wardsKilled15, 1) : '—'} hint={stats.visTimingHint} points={stats.wardsKilled15S} soon={stats.wardsKilled15 == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardsKilled20')} value={stats.wardsKilled20 != null ? fmtNum(stats.wardsKilled20, 1) : '—'} hint={stats.visTimingHint} points={stats.wardsKilled20S} soon={stats.wardsKilled20 == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlPlaced20')} value={stats.controlPlaced20 != null ? fmtNum(stats.controlPlaced20, 1) : '—'} hint={stats.visTimingHint} points={stats.controlPlaced20S} soon={stats.controlPlaced20 == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardTakedownsBefore20')} value={stats.wardTakedownsBefore20 != null ? fmtNum(stats.wardTakedownsBefore20, 1) : '—'} hint={hint} points={stats.wardTakedownsBefore20S} soon={stats.wardTakedownsBefore20 == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.firstTower')} value={fmtPct(stats.firstTowerPct)} hint={hint} points={stats.firstTowerS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.firstDragon')} value={fmtPct(stats.firstDragonPct)} hint={hint} points={stats.firstDragonS} />
              <StatCard icon={<Ico name="crest" />} label={t('studio.gold15')} value={stats.gold15 != null ? fmtSigned(stats.gold15, 0) : '—'} hint={stats.laneHint} points={stats.gold15S} soon={stats.gold15 == null} />
            </div>
            {(() => {
              const spec = VISION_LADDER_STATS.find((row) => row.id === 'wardsPlaced');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.visTimingNote')}</p>
          </>
        ) : (
          <div className="ln-empty ln-fight-empty">
            <span className="ln-lock-lg"><IcoLock /></span>
            <p>{t('lens.visSubSoon')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ObjectivesStage({
  cats, objCat, setObjCat, stats, hint, avatar, compareRank, ladderSpec,
  setLadderSpec, statLadder, ladderLoading, ladderRefreshing, ladderMatches, playerTier, t,
}) {
  const objValues = {
    general: {
      value: fmtNum(stats.objDpm, 0),
      unit: t('lens.objDpm'),
      halo: stats.objDpm != null,
    },
    structures: {
      value: fmtNum(stats.turretTakedowns, 1),
      unit: t('lens.turretTakedowns'),
      halo: stats.turretTakedowns != null,
    },
    epic: {
      value: stats.epicTakes != null ? fmtNum(stats.epicTakes, 1) : '—',
      unit: t('lens.epicTakes'),
      halo: stats.epicTakes != null,
    },
    setup: {
      value: fmtNum(stats.visionPerMin, 2),
      unit: t('lens.visionMin'),
      halo: stats.visionPerMin != null,
    },
    steals: {
      value: fmtNum(stats.objStolenAvg, 1),
      unit: t('lens.objStolen'),
      halo: stats.objStolenAvg != null,
    },
  };

  const ladderProps = {
    playerTier,
    statLadder,
    loading: ladderLoading,
    refreshing: ladderRefreshing,
    matches: ladderMatches,
    t,
  };

  return (
    <div className="ln-fight">
      <div className="ln-fight-cats">
        {cats.map((cat) => (
          <CatCard
            key={cat.id}
            cat={cat}
            t={t}
            selected={objCat === cat.id}
            onSelect={setObjCat}
            value={objValues[cat.id]?.value}
            unit={objValues[cat.id]?.unit}
            ring={objValues[cat.id]?.ring}
            halo={objValues[cat.id]?.halo}
            avatar={avatar}
            compareRank={compareRank}
          />
        ))}
      </div>
      <div className="ln-fight-main">
        {objCat === 'general' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="tower" />} label={t('lens.objDpm')} value={fmtNum(stats.objDpm, 0)} hint={hint} points={stats.objDpmS} onPick={() => setLadderSpec('objDpm')} active={ladderSpec === 'objDpm'} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.towerDpm')} value={fmtNum(stats.towerDpm, 0)} hint={hint} points={stats.towerDpmS} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.turretTakedowns')} value={fmtNum(stats.turretTakedowns, 1)} hint={hint} points={stats.turretTakedownsS} onPick={() => setLadderSpec('turretTakedowns')} active={ladderSpec === 'turretTakedowns'} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.inhibTakedowns')} value={fmtNum(stats.inhibTakedowns, 1)} hint={hint} points={stats.inhibTakedownsS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.objStolen')} value={String(stats.objStolen)} hint={hint} points={stats.objStolenS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.dragonTakes')} value={stats.dragonTakes != null ? fmtNum(stats.dragonTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.dragonTakesS} soon={stats.dragonTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.baronTakes')} value={stats.baronTakes != null ? fmtNum(stats.baronTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.baronTakesS} soon={stats.baronTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.heraldTakes')} value={stats.heraldTakes != null ? fmtNum(stats.heraldTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.heraldTakesS} soon={stats.heraldTakes == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.firstTower')} value={fmtPct(stats.firstTowerPct)} hint={hint} points={stats.firstTowerS} />
            </div>
            {(() => {
              const spec = OBJECTIVES_LADDER_STATS.find((row) => row.id === ladderSpec) || OBJECTIVES_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.objNote')}</p>
          </>
        ) : objCat === 'structures' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="tower" />} label={t('lens.turretTakedowns')} value={fmtNum(stats.turretTakedowns, 1)} hint={hint} points={stats.turretTakedownsS} onPick={() => setLadderSpec('turretTakedowns')} active={ladderSpec === 'turretTakedowns'} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.inhibTakedowns')} value={fmtNum(stats.inhibTakedowns, 1)} hint={hint} points={stats.inhibTakedownsS} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.nexusTakedowns')} value={fmtNum(stats.nexusTakedowns, 1)} hint={hint} points={stats.nexusTakedownsS} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.towerDpm')} value={fmtNum(stats.towerDpm, 0)} hint={hint} points={stats.towerDpmS} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.objDpm')} value={fmtNum(stats.objDpm, 0)} hint={hint} points={stats.objDpmS} onPick={() => setLadderSpec('objDpm')} active={ladderSpec === 'objDpm'} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.turretPlates')} value={stats.turretPlates != null ? fmtNum(stats.turretPlates, 1) : '—'} hint={stats.laneHint} points={stats.turretPlatesS} soon={stats.turretPlates == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.firstTower')} value={fmtPct(stats.firstTowerPct)} hint={hint} points={stats.firstTowerS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.firstTowerKill')} value={fmtPct(stats.firstTowerKillPct)} hint={hint} points={stats.firstTowerKillS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.outerTurretExecutesBefore10')} value={stats.outerTurretExecutesBefore10 != null ? fmtNum(stats.outerTurretExecutesBefore10, 1) : '—'} hint={hint} points={stats.outerTurretExecutesBefore10S} soon={stats.outerTurretExecutesBefore10 == null} />
            </div>
            {(() => {
              const spec = OBJECTIVES_LADDER_STATS.find((row) => row.id === 'turretTakedowns');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.objStructuresNote')}</p>
          </>
        ) : objCat === 'epic' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="star" />} label={t('lens.epicTakes')} value={stats.epicTakes != null ? fmtNum(stats.epicTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.epicTakesS} soon={stats.epicTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.dragonTakes')} value={stats.dragonTakes != null ? fmtNum(stats.dragonTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.dragonTakesS} soon={stats.dragonTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.baronTakes')} value={stats.baronTakes != null ? fmtNum(stats.baronTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.baronTakesS} soon={stats.baronTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.heraldTakes')} value={stats.heraldTakes != null ? fmtNum(stats.heraldTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.heraldTakesS} soon={stats.heraldTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.grubTakes')} value={stats.grubTakes != null ? fmtNum(stats.grubTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.grubTakesS} soon={stats.grubTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.firstDragon')} value={fmtPct(stats.firstDragonPct)} hint={hint} points={stats.firstDragonS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.firstBaron')} value={fmtPct(stats.firstBaronPct)} hint={hint} points={stats.firstBaronS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.teamDragonKills')} value={fmtNum(stats.teamDragonKills, 1)} hint={hint} points={stats.teamDragonKillsS} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.objDamageShare')} value={fmtPct(stats.objDamageSharePct)} hint={hint} points={stats.objDamageShareS} />
            </div>
            {(() => {
              const spec = OBJECTIVES_LADDER_STATS.find((row) => row.id === 'objDpm');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.objEpicNote')}</p>
          </>
        ) : objCat === 'setup' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="ward" />} label={t('lens.visionMin')} value={fmtNum(stats.visionPerMin, 2)} hint={hint} points={stats.visionPerMinS} onPick={() => setLadderSpec('visionPerMin')} active={ladderSpec === 'visionPerMin'} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsPlaced')} value={fmtNum(stats.wardsPlaced, 1)} hint={hint} points={stats.wardsPlacedS} onPick={() => setLadderSpec('wardsPlaced')} active={ladderSpec === 'wardsPlaced'} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.wardsKilled')} value={fmtNum(stats.wardsKilled, 1)} hint={hint} points={stats.wardsKilledS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.controlWardsPlaced')} value={fmtNum(stats.controlWardsPlaced, 1)} hint={hint} points={stats.controlWardsPlacedS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.wardTakedownsBefore20')} value={stats.wardTakedownsBefore20 != null ? fmtNum(stats.wardTakedownsBefore20, 1) : '—'} hint={hint} points={stats.wardTakedownsBefore20S} soon={stats.wardTakedownsBefore20 == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.epicMonsterKillsNearEnemyJungler')} value={stats.epicMonsterKillsNearEnemyJungler != null ? fmtNum(stats.epicMonsterKillsNearEnemyJungler, 1) : '—'} hint={hint} points={stats.epicMonsterKillsNearEnemyJunglerS} soon={stats.epicMonsterKillsNearEnemyJungler == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.turretPlates')} value={stats.turretPlates != null ? fmtNum(stats.turretPlates, 1) : '—'} hint={stats.laneHint} points={stats.turretPlatesS} soon={stats.turretPlates == null} />
              <StatCard icon={<Ico name="crest" />} label={t('studio.gold15')} value={stats.gold15 != null ? fmtSigned(stats.gold15, 0) : '—'} hint={stats.laneHint} points={stats.gold15S} soon={stats.gold15 == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.firstTower')} value={fmtPct(stats.firstTowerPct)} hint={hint} points={stats.firstTowerS} />
            </div>
            {(() => {
              const spec = OBJECTIVES_LADDER_STATS.find((row) => row.id === ladderSpec)
                || OBJECTIVES_LADDER_STATS.find((row) => row.id === 'visionPerMin');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.objSetupNote')}</p>
          </>
        ) : objCat === 'steals' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="skull" />} label={t('lens.objStolen')} value={fmtNum(stats.objStolenAvg, 1)} hint={hint} points={stats.objStolenAvgS} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.objStolenTotal')} value={String(stats.objStolen)} hint={hint} points={stats.objStolenS} />
              <StatCard icon={<Ico name="team" />} label={t('lens.objStolenAssists')} value={fmtNum(stats.objStolenAssists, 1)} hint={hint} points={stats.objStolenAssistsS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.epicMonsterSteals')} value={stats.epicMonsterSteals != null ? fmtNum(stats.epicMonsterSteals, 1) : '—'} hint={hint} points={stats.epicMonsterStealsS} soon={stats.epicMonsterSteals == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.epicMonsterStolenWithoutSmite')} value={stats.epicMonsterStolenWithoutSmite != null ? fmtNum(stats.epicMonsterStolenWithoutSmite, 1) : '—'} hint={hint} points={stats.epicMonsterStolenWithoutSmiteS} soon={stats.epicMonsterStolenWithoutSmite == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.epicMonsterKillsNearEnemyJungler')} value={stats.epicMonsterKillsNearEnemyJungler != null ? fmtNum(stats.epicMonsterKillsNearEnemyJungler, 1) : '—'} hint={hint} points={stats.epicMonsterKillsNearEnemyJunglerS} soon={stats.epicMonsterKillsNearEnemyJungler == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.baronTakes')} value={stats.baronTakes != null ? fmtNum(stats.baronTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.baronTakesS} soon={stats.baronTakes == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.dragonTakes')} value={stats.dragonTakes != null ? fmtNum(stats.dragonTakes, 1) : '—'} hint={stats.objTimelineHint} points={stats.dragonTakesS} soon={stats.dragonTakes == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.objDpm')} value={fmtNum(stats.objDpm, 0)} hint={hint} points={stats.objDpmS} onPick={() => setLadderSpec('objDpm')} active={ladderSpec === 'objDpm'} />
            </div>
            {(() => {
              const spec = OBJECTIVES_LADDER_STATS.find((row) => row.id === 'objDpm');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.objStealsNote')}</p>
          </>
        ) : (
          <div className="ln-empty ln-fight-empty">
            <span className="ln-lock-lg"><IcoLock /></span>
            <p>{t('lens.objSubSoon')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LaningStage({
  cats, laneCat, setLaneCat, stats, hint, avatar, compareRank, ladderSpec,
  setLadderSpec, statLadder, ladderLoading, ladderRefreshing, ladderMatches, playerTier, t,
}) {
  const laneValues = {
    general: {
      value: stats.gold15 != null ? fmtSigned(stats.gold15, 0) : '—',
      unit: t('studio.gold15'),
      halo: stats.gold15 != null,
    },
    control: {
      value: stats.csDiff15 != null ? fmtSigned(stats.csDiff15, 0) : '—',
      unit: t('lens.csDiff15'),
      halo: stats.csDiff15 != null,
    },
    trading: {
      value: stats.tradeDiff15 != null ? fmtSigned(stats.tradeDiff15, 0) : '—',
      unit: t('lens.tradeDiff15'),
      halo: stats.tradeDiff15 != null,
    },
    waves: {
      value: stats.cs15 != null ? fmtNum(stats.cs15, 0) : '—',
      unit: t('lens.cs15'),
      halo: stats.cs15 != null,
    },
    roaming: {
      value: stats.roamKills15 != null ? fmtNum(stats.roamKills15, 1) : '—',
      unit: t('lens.roamKills15'),
      halo: stats.roamKills15 != null,
    },
  };

  const ladderProps = {
    playerTier,
    statLadder,
    loading: ladderLoading,
    refreshing: ladderRefreshing,
    matches: ladderMatches,
    t,
  };

  return (
    <div className="ln-fight">
      <div className="ln-fight-cats">
        {cats.map((cat) => (
          <CatCard
            key={cat.id}
            cat={cat}
            t={t}
            selected={laneCat === cat.id}
            onSelect={setLaneCat}
            value={laneValues[cat.id]?.value}
            unit={laneValues[cat.id]?.unit}
            ring={laneValues[cat.id]?.ring}
            halo={laneValues[cat.id]?.halo}
            avatar={avatar}
            compareRank={compareRank}
          />
        ))}
      </div>
      <div className="ln-fight-main">
        {laneCat === 'general' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="crest" />} label={t('studio.gold15')} value={stats.gold15 != null ? fmtSigned(stats.gold15, 0) : '—'} hint={stats.laneHint} points={stats.gold15S} onPick={() => setLadderSpec('gold15')} active={ladderSpec === 'gold15'} soon={stats.gold15 == null} />
              <StatCard icon={<Ico name="kp" />} label={t('dash.ka15')} value={stats.ka15 != null ? fmtSigned(stats.ka15, 1) : '—'} hint={stats.laneHint} points={stats.ka15S} onPick={() => setLadderSpec('ka15')} active={ladderSpec === 'ka15'} soon={stats.ka15 == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.csDiff15')} value={stats.csDiff15 != null ? fmtSigned(stats.csDiff15, 0) : '—'} hint={stats.laneHint} points={stats.csDiff15S} onPick={() => setLadderSpec('csDiff15')} active={ladderSpec === 'csDiff15'} soon={stats.csDiff15 == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.csm')} value={fmtNum(stats.csm, 1)} hint={hint} points={stats.csmS} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.laneEarly')} value={fmtNum(stats.laneEarly, 0)} hint={hint} points={stats.laneEarlyS} ring={stats.laneEarly} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.laneMid')} value={fmtNum(stats.laneMid, 0)} hint={hint} points={stats.laneMidS} ring={stats.laneMid} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.laneLate')} value={fmtNum(stats.laneLate, 0)} hint={hint} points={stats.laneLateS} ring={stats.laneLate} />
              <StatCard icon={<Ico name="star" />} label={t('lens.firstBlood')} value={fmtPct(stats.firstBloodPct)} hint={hint} points={stats.firstBloodS} />
              <StatCard icon={<Ico name="trophy" />} label={t('lens.deaths')} value={fmtNum(stats.deaths, 1)} hint={hint} points={stats.deathsS} invert />
            </div>
            {(() => {
              const spec = LANING_LADDER_STATS.find((row) => row.id === ladderSpec) || LANING_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.laneNote')}</p>
          </>
        ) : laneCat === 'control' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="crest" />} label={t('studio.gold15')} value={stats.gold15 != null ? fmtSigned(stats.gold15, 0) : '—'} hint={stats.laneHint} points={stats.gold15S} onPick={() => setLadderSpec('gold15')} active={ladderSpec === 'gold15'} soon={stats.gold15 == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.csDiff15')} value={stats.csDiff15 != null ? fmtSigned(stats.csDiff15, 0) : '—'} hint={stats.laneHint} points={stats.csDiff15S} onPick={() => setLadderSpec('csDiff15')} active={ladderSpec === 'csDiff15'} soon={stats.csDiff15 == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.xpDiff15')} value={stats.xpDiff15 != null ? fmtSigned(stats.xpDiff15, 0) : '—'} hint={stats.laneHint} points={stats.xpDiff15S} soon={stats.xpDiff15 == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.maxCsAdvantage')} value={stats.maxCsAdvantage != null ? fmtSigned(stats.maxCsAdvantage, 0) : '—'} hint={hint} points={stats.maxCsAdvantageS} soon={stats.maxCsAdvantage == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.maxLevelLead')} value={stats.maxLevelLead != null ? fmtNum(stats.maxLevelLead, 1) : '—'} hint={hint} points={stats.maxLevelLeadS} soon={stats.maxLevelLead == null} />
              <StatCard icon={<Ico name="ward" />} label={t('lens.laneVisionAdv')} value={stats.laneVisionAdv != null ? fmtSigned(stats.laneVisionAdv, 1) : '—'} hint={hint} points={stats.laneVisionAdvS} soon={stats.laneVisionAdv == null} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.laneEarly')} value={fmtNum(stats.laneEarly, 0)} hint={hint} points={stats.laneEarlyS} ring={stats.laneEarly} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.laneGoldExpAdv')} value={stats.laneGoldExpAdv != null ? fmtNum(stats.laneGoldExpAdv, 1) : '—'} hint={hint} points={stats.laneGoldExpAdvS} soon={stats.laneGoldExpAdv == null} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.earlyLaneGoldExpAdv')} value={stats.earlyLaneGoldExpAdv != null ? fmtNum(stats.earlyLaneGoldExpAdv, 1) : '—'} hint={hint} points={stats.earlyLaneGoldExpAdvS} soon={stats.earlyLaneGoldExpAdv == null} />
            </div>
            {(() => {
              const spec = LANING_LADDER_STATS.find((row) => row.id === ladderSpec) || LANING_LADDER_STATS.find((row) => row.id === 'csDiff15');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.laneControlNote')}</p>
          </>
        ) : laneCat === 'trading' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="swords" />} label={t('lens.dmg15')} value={stats.dmg15 != null ? fmtNum(stats.dmg15, 0) : '—'} hint={stats.laneHint} points={stats.dmg15S} soon={stats.dmg15 == null} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.taken15')} value={stats.taken15 != null ? fmtNum(stats.taken15, 0) : '—'} hint={stats.laneHint} points={stats.taken15S} invert soon={stats.taken15 == null} />
              <StatCard icon={<Ico name="vs" />} label={t('lens.tradeDiff15')} value={stats.tradeDiff15 != null ? fmtSigned(stats.tradeDiff15, 0) : '—'} hint={stats.laneHint} points={stats.tradeDiff15S} soon={stats.tradeDiff15 == null} />
              <StatCard icon={<Ico name="kp" />} label={t('dash.ka15')} value={stats.ka15 != null ? fmtSigned(stats.ka15, 1) : '—'} hint={stats.laneHint} points={stats.ka15S} onPick={() => setLadderSpec('ka15')} active={ladderSpec === 'ka15'} soon={stats.ka15 == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.kills15')} value={stats.kills15 != null ? fmtNum(stats.kills15, 1) : '—'} hint={stats.laneHint} points={stats.kills15S} soon={stats.kills15 == null} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.deaths15')} value={stats.deaths15 != null ? fmtNum(stats.deaths15, 1) : '—'} hint={stats.laneHint} points={stats.deaths15S} invert soon={stats.deaths15 == null} />
              <StatCard icon={<Ico name="vs" />} label={t('lens.laneSoloKills')} value={stats.laneSoloKills != null ? fmtNum(stats.laneSoloKills, 1) : '—'} hint={stats.duelHint} points={stats.laneSoloKillsS} soon={stats.laneSoloKills == null} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.laneSoloDeaths')} value={stats.laneSoloDeaths != null ? fmtNum(stats.laneSoloDeaths, 1) : '—'} hint={stats.duelHint} points={stats.laneSoloDeathsS} invert soon={stats.laneSoloDeaths == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.firstBlood')} value={fmtPct(stats.firstBloodPct)} hint={hint} points={stats.firstBloodS} />
            </div>
            {(() => {
              const spec = LANING_LADDER_STATS.find((row) => row.id === 'ka15');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.laneTradingNote')}</p>
          </>
        ) : laneCat === 'waves' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="lane" />} label={t('lens.cs15')} value={stats.cs15 != null ? fmtNum(stats.cs15, 0) : '—'} hint={stats.laneHint} points={stats.cs15S} soon={stats.cs15 == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.csDiff15')} value={stats.csDiff15 != null ? fmtSigned(stats.csDiff15, 0) : '—'} hint={stats.laneHint} points={stats.csDiff15S} onPick={() => setLadderSpec('csDiff15')} active={ladderSpec === 'csDiff15'} soon={stats.csDiff15 == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.csm')} value={fmtNum(stats.csm, 1)} hint={hint} points={stats.csmS} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.laneMinions10')} value={stats.laneMinions10 != null ? fmtNum(stats.laneMinions10, 0) : '—'} hint={hint} points={stats.laneMinions10S} soon={stats.laneMinions10 == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.turretPlates')} value={stats.turretPlates != null ? fmtNum(stats.turretPlates, 1) : '—'} hint={stats.laneHint} points={stats.turretPlatesS} soon={stats.turretPlates == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.maxCsAdvantage')} value={stats.maxCsAdvantage != null ? fmtSigned(stats.maxCsAdvantage, 0) : '—'} hint={hint} points={stats.maxCsAdvantageS} soon={stats.maxCsAdvantage == null} />
              <StatCard icon={<Ico name="crest" />} label={t('studio.gold15')} value={stats.gold15 != null ? fmtSigned(stats.gold15, 0) : '—'} hint={stats.laneHint} points={stats.gold15S} onPick={() => setLadderSpec('gold15')} active={ladderSpec === 'gold15'} soon={stats.gold15 == null} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.laneEarly')} value={fmtNum(stats.laneEarly, 0)} hint={hint} points={stats.laneEarlyS} ring={stats.laneEarly} />
              <StatCard icon={<Ico name="crest" />} label={t('lens.laneMid')} value={fmtNum(stats.laneMid, 0)} hint={hint} points={stats.laneMidS} ring={stats.laneMid} />
            </div>
            {(() => {
              const spec = LANING_LADDER_STATS.find((row) => row.id === 'csDiff15');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.laneWavesNote')}</p>
          </>
        ) : laneCat === 'roaming' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="team" />} label={t('lens.roamKills15')} value={stats.roamKills15 != null ? fmtNum(stats.roamKills15, 1) : '—'} hint={stats.laneHint} points={stats.roamKills15S} onPick={() => setLadderSpec('roamKills15')} active={ladderSpec === 'roamKills15'} soon={stats.roamKills15 == null} />
              <StatCard icon={<Ico name="team" />} label={t('lens.roamAssists15')} value={stats.roamAssists15 != null ? fmtNum(stats.roamAssists15, 1) : '—'} hint={stats.laneHint} points={stats.roamAssists15S} soon={stats.roamAssists15 == null} />
              <StatCard icon={<Ico name="kp" />} label={t('lens.roamKa15')} value={stats.roamKa15 != null ? fmtNum(stats.roamKa15, 1) : '—'} hint={stats.laneHint} points={stats.roamKa15S} soon={stats.roamKa15 == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.otherLaneKillsEarly')} value={stats.otherLaneKillsEarly != null ? fmtNum(stats.otherLaneKillsEarly, 1) : '—'} hint={hint} points={stats.otherLaneKillsEarlyS} soon={stats.otherLaneKillsEarly == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.teleportTakedowns')} value={stats.teleportTakedowns != null ? fmtNum(stats.teleportTakedowns, 1) : '—'} hint={hint} points={stats.teleportTakedownsS} soon={stats.teleportTakedowns == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.takedownsFirst25')} value={stats.takedownsFirst25 != null ? fmtNum(stats.takedownsFirst25, 1) : '—'} hint={hint} points={stats.takedownsFirst25S} soon={stats.takedownsFirst25 == null} />
              <StatCard icon={<Ico name="kp" />} label={t('dash.ka15')} value={stats.ka15 != null ? fmtSigned(stats.ka15, 1) : '—'} hint={stats.laneHint} points={stats.ka15S} onPick={() => setLadderSpec('ka15')} active={ladderSpec === 'ka15'} soon={stats.ka15 == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.kills15')} value={stats.kills15 != null ? fmtNum(stats.kills15, 1) : '—'} hint={stats.laneHint} points={stats.kills15S} soon={stats.kills15 == null} />
              <StatCard icon={<Ico name="tower" />} label={t('lens.turretPlates')} value={stats.turretPlates != null ? fmtNum(stats.turretPlates, 1) : '—'} hint={stats.laneHint} points={stats.turretPlatesS} soon={stats.turretPlates == null} />
            </div>
            {(() => {
              const spec = LANING_LADDER_STATS.find((row) => row.id === 'roamKills15');
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.laneRoamingNote')}</p>
          </>
        ) : (
          <div className="ln-empty ln-fight-empty">
            <span className="ln-lock-lg"><IcoLock /></span>
            <p>{t('lens.laneSubSoon')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FightingStage({
  cats, fightCat, setFightCat, stats, kpPct, hint, avatar, compareRank, ladderSpec,
  setLadderSpec, duelLadderSpec, setDuelLadderSpec, skirmishLadderSpec, setSkirmishLadderSpec,
  teamfightLadderSpec, setTeamfightLadderSpec, mechLadderSpec, setMechLadderSpec,
  statLadder, ladderLoading, ladderRefreshing, ladderMatches, playerTier, t,
}) {
  const fightValues = {
    general: { value: fmtNum(stats.dpm, 0), unit: t('lens.dpm'), halo: true },
    duels: {
      value: stats.soloKills != null ? fmtNum(stats.soloKills, 1) : '—',
      unit: t('lens.soloKills'),
      halo: stats.soloKills != null,
    },
    skirmishes: {
      value: stats.skirmishKills != null ? fmtNum(stats.skirmishKills, 1) : '—',
      unit: t('lens.skirmishKills'),
      halo: stats.skirmishKills != null,
    },
    teamfights: {
      value: stats.teamfightKills != null ? fmtNum(stats.teamfightKills, 1) : '—',
      unit: t('lens.teamfightKills'),
      halo: stats.teamfightKills != null,
    },
    mechanics: {
      value: stats.largestMultiKill != null ? fmtNum(stats.largestMultiKill, 1) : '—',
      unit: t('lens.largestMultiKill'),
      halo: stats.largestMultiKill != null,
    },
  };

  const ladderProps = {
    playerTier,
    statLadder,
    loading: ladderLoading,
    refreshing: ladderRefreshing,
    matches: ladderMatches,
    t,
  };

  return (
    <div className="ln-fight">
      <div className="ln-fight-cats">
        {cats.map((cat) => (
          <CatCard
            key={cat.id}
            cat={cat}
            t={t}
            selected={fightCat === cat.id}
            onSelect={setFightCat}
            value={fightValues[cat.id]?.value}
            unit={fightValues[cat.id]?.unit}
            ring={fightValues[cat.id]?.ring}
            halo={fightValues[cat.id]?.halo}
            avatar={avatar}
            compareRank={compareRank}
          />
        ))}
      </div>
      <div className="ln-fight-main">
        {fightCat === 'general' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="kp" />} label={t('lens.kp')} value={fmtPct(kpPct)} hint={hint} points={stats.kpS} ring={kpPct} onPick={() => setLadderSpec('kp')} active={ladderSpec === 'kp'} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.dpm')} value={fmtNum(stats.dpm, 0)} hint={hint} points={stats.dpmS} onPick={() => setLadderSpec('dpm')} active={ladderSpec === 'dpm'} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.taken')} value={fmtNum(stats.taken, 0)} hint={hint} points={stats.takenS} invert onPick={() => setLadderSpec('taken')} active={ladderSpec === 'taken'} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.dpmEarly')} value={stats.dpmEarly != null ? fmtNum(stats.dpmEarly, 0) : '—'} hint={stats.phaseHint} points={stats.dpmEarlyS} soon={stats.dpmEarly == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.dpmMid')} value={stats.dpmMid != null ? fmtNum(stats.dpmMid, 0) : '—'} hint={stats.phaseHint} points={stats.dpmMidS} soon={stats.dpmMid == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.dpmLate')} value={stats.dpmLate != null ? fmtNum(stats.dpmLate, 0) : '—'} hint={stats.phaseHint} points={stats.dpmLateS} soon={stats.dpmLate == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.triples')} value={String(stats.triples)} hint={hint} points={stats.tripleS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.quadras')} value={String(stats.quadras)} hint={hint} points={stats.quadraS} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.pentas')} value={String(stats.pentas)} hint={hint} points={stats.pentaS} />
            </div>
            {(() => {
              const spec = LADDER_STATS.find((row) => row.id === ladderSpec) || LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats, kpPct)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.fightNote')}</p>
          </>
        ) : fightCat === 'duels' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="vs" />} label={t('lens.soloKills')} value={stats.soloKills != null ? fmtNum(stats.soloKills, 1) : '—'} hint={stats.duelHint} points={stats.soloKillsS} onPick={() => setDuelLadderSpec('soloKills')} active={duelLadderSpec === 'soloKills'} soon={stats.soloKills == null} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.soloDeaths')} value={stats.soloDeaths != null ? fmtNum(stats.soloDeaths, 1) : '—'} hint={stats.duelHint} points={stats.soloDeathsS} invert soon={stats.soloDeaths == null} />
              <StatCard icon={<Ico name="vs" />} label={t('lens.soloKd')} value={stats.soloKd != null ? fmtNum(stats.soloKd, 2) : '—'} hint={stats.duelHint} points={stats.soloKdS} soon={stats.soloKd == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.soloWinRate')} value={fmtPct(stats.soloWinRate)} hint={stats.duelHint} points={stats.soloWinRateS} ring={stats.soloWinRate} soon={stats.soloWinRate == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.soloKillShare')} value={fmtPct(stats.soloKillShare)} hint={hint} points={stats.soloKillShareS} soon={stats.soloKillShare == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.laneSoloKills')} value={stats.laneSoloKills != null ? fmtNum(stats.laneSoloKills, 1) : '—'} hint={stats.duelHint} points={stats.laneSoloKillsS} soon={stats.laneSoloKills == null} />
              <StatCard icon={<Ico name="lane" />} label={t('lens.laneSoloDeaths')} value={stats.laneSoloDeaths != null ? fmtNum(stats.laneSoloDeaths, 1) : '—'} hint={stats.duelHint} points={stats.laneSoloDeathsS} invert soon={stats.laneSoloDeaths == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.quickSoloKills')} value={stats.quickSoloKills != null ? fmtNum(stats.quickSoloKills, 1) : '—'} hint={hint} points={stats.quickSoloKillsS} soon={stats.quickSoloKills == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.soloKillsTotal')} value={String(stats.soloKillsTotal ?? '—')} hint={stats.duelHint} points={stats.soloKillsS} soon={stats.soloKillsTotal == null} />
            </div>
            {(() => {
              const spec = DUEL_LADDER_STATS.find((row) => row.id === duelLadderSpec) || DUEL_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.duelNote')}</p>
          </>
        ) : fightCat === 'skirmishes' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="spark" />} label={t('lens.skirmishKills')} value={stats.skirmishKills != null ? fmtNum(stats.skirmishKills, 1) : '—'} hint={stats.fightBucketHint} points={stats.skirmishKillsS} onPick={() => setSkirmishLadderSpec('skirmishKills')} active={skirmishLadderSpec === 'skirmishKills'} soon={stats.skirmishKills == null} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.skirmishDeaths')} value={stats.skirmishDeaths != null ? fmtNum(stats.skirmishDeaths, 1) : '—'} hint={stats.fightBucketHint} points={stats.skirmishDeathsS} invert soon={stats.skirmishDeaths == null} />
              <StatCard icon={<Ico name="team" />} label={t('lens.skirmishAssists')} value={stats.skirmishAssists != null ? fmtNum(stats.skirmishAssists, 1) : '—'} hint={stats.fightBucketHint} points={stats.skirmishAssistsS} soon={stats.skirmishAssists == null} />
              <StatCard icon={<Ico name="vs" />} label={t('lens.skirmishKd')} value={stats.skirmishKd != null ? fmtNum(stats.skirmishKd, 2) : '—'} hint={stats.fightBucketHint} points={stats.skirmishKdS} soon={stats.skirmishKd == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.skirmishWinRate')} value={fmtPct(stats.skirmishWinRate)} hint={stats.fightBucketHint} points={stats.skirmishWinRateS} ring={stats.skirmishWinRate} soon={stats.skirmishWinRate == null} />
              <StatCard icon={<Ico name="kp" />} label={t('lens.skirmishKa')} value={stats.skirmishKa != null ? fmtNum(stats.skirmishKa, 1) : '—'} hint={stats.fightBucketHint} points={stats.skirmishKaS} soon={stats.skirmishKa == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.skirmishTakes')} value={stats.skirmishTakes != null ? fmtNum(stats.skirmishTakes, 1) : '—'} hint={stats.fightBucketHint} points={stats.skirmishTakesS} soon={stats.skirmishTakes == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.skirmishKillsTotal')} value={String(stats.skirmishKillsTotal ?? '—')} hint={stats.fightBucketHint} points={stats.skirmishKillsS} soon={stats.skirmishKillsTotal == null} />
              <StatCard icon={<Ico name="team" />} label={t('lens.skirmishAssistsTotal')} value={String(stats.skirmishAssistsTotal ?? '—')} hint={stats.fightBucketHint} points={stats.skirmishAssistsS} soon={stats.skirmishAssistsTotal == null} />
            </div>
            {(() => {
              const spec = SKIRMISH_LADDER_STATS.find((row) => row.id === skirmishLadderSpec) || SKIRMISH_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.skirmishNote')}</p>
          </>
        ) : fightCat === 'teamfights' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="team" />} label={t('lens.teamfightKills')} value={stats.teamfightKills != null ? fmtNum(stats.teamfightKills, 1) : '—'} hint={stats.fightBucketHint} points={stats.teamfightKillsS} onPick={() => setTeamfightLadderSpec('teamfightKills')} active={teamfightLadderSpec === 'teamfightKills'} soon={stats.teamfightKills == null} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.teamfightDeaths')} value={stats.teamfightDeaths != null ? fmtNum(stats.teamfightDeaths, 1) : '—'} hint={stats.fightBucketHint} points={stats.teamfightDeathsS} invert soon={stats.teamfightDeaths == null} />
              <StatCard icon={<Ico name="team" />} label={t('lens.teamfightAssists')} value={stats.teamfightAssists != null ? fmtNum(stats.teamfightAssists, 1) : '—'} hint={stats.fightBucketHint} points={stats.teamfightAssistsS} soon={stats.teamfightAssists == null} />
              <StatCard icon={<Ico name="vs" />} label={t('lens.teamfightKd')} value={stats.teamfightKd != null ? fmtNum(stats.teamfightKd, 2) : '—'} hint={stats.fightBucketHint} points={stats.teamfightKdS} soon={stats.teamfightKd == null} />
              <StatCard icon={<Ico name="star" />} label={t('lens.teamfightWinRate')} value={fmtPct(stats.teamfightWinRate)} hint={stats.fightBucketHint} points={stats.teamfightWinRateS} ring={stats.teamfightWinRate} soon={stats.teamfightWinRate == null} />
              <StatCard icon={<Ico name="kp" />} label={t('lens.teamfightKa')} value={stats.teamfightKa != null ? fmtNum(stats.teamfightKa, 1) : '—'} hint={stats.fightBucketHint} points={stats.teamfightKaS} soon={stats.teamfightKa == null} />
              <StatCard icon={<Ico name="team" />} label={t('lens.teamfightTakes')} value={stats.teamfightTakes != null ? fmtNum(stats.teamfightTakes, 1) : '—'} hint={stats.fightBucketHint} points={stats.teamfightTakesS} soon={stats.teamfightTakes == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.teamfightKillsTotal')} value={String(stats.teamfightKillsTotal ?? '—')} hint={stats.fightBucketHint} points={stats.teamfightKillsS} soon={stats.teamfightKillsTotal == null} />
              <StatCard icon={<Ico name="team" />} label={t('lens.teamfightAssistsTotal')} value={String(stats.teamfightAssistsTotal ?? '—')} hint={stats.fightBucketHint} points={stats.teamfightAssistsS} soon={stats.teamfightAssistsTotal == null} />
            </div>
            {(() => {
              const spec = TEAMFIGHT_LADDER_STATS.find((row) => row.id === teamfightLadderSpec) || TEAMFIGHT_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.teamfightNote')}</p>
          </>
        ) : fightCat === 'mechanics' ? (
          <>
            <div className="ln-fight-grid">
              <StatCard icon={<Ico name="sword" />} label={t('lens.largestMultiKill')} value={stats.largestMultiKill != null ? fmtNum(stats.largestMultiKill, 1) : '—'} hint={hint} points={stats.largestMultiKillS} onPick={() => setMechLadderSpec('largestMultiKill')} active={mechLadderSpec === 'largestMultiKill'} soon={stats.largestMultiKill == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.largestKillingSpree')} value={stats.largestKillingSpree != null ? fmtNum(stats.largestKillingSpree, 1) : '—'} hint={hint} points={stats.largestKillingSpreeS} soon={stats.largestKillingSpree == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.multikills')} value={stats.multikills != null ? fmtNum(stats.multikills, 1) : '—'} hint={hint} points={stats.multikillsS} soon={stats.multikills == null} />
              <StatCard icon={<Ico name="swords" />} label={t('lens.triples')} value={String(stats.triples)} hint={hint} points={stats.tripleS} />
              <StatCard icon={<Ico name="star" />} label={t('lens.quadras')} value={String(stats.quadras)} hint={hint} points={stats.quadraS} />
              <StatCard icon={<Ico name="skull" />} label={t('lens.pentas')} value={String(stats.pentas)} hint={hint} points={stats.pentaS} />
              <StatCard icon={<Ico name="vs" />} label={t('lens.outnumberedKills')} value={stats.outnumberedKills != null ? fmtNum(stats.outnumberedKills, 1) : '—'} hint={hint} points={stats.outnumberedKillsS} soon={stats.outnumberedKills == null} />
              <StatCard icon={<Ico name="spark" />} label={t('lens.skillshotsHit')} value={stats.skillshotsHit != null ? fmtNum(stats.skillshotsHit, 0) : '—'} hint={hint} points={stats.skillshotsHitS} soon={stats.skillshotsHit == null} />
              <StatCard icon={<Ico name="shield" />} label={t('lens.skillshotsDodged')} value={stats.skillshotsDodged != null ? fmtNum(stats.skillshotsDodged, 0) : '—'} hint={hint} points={stats.skillshotsDodgedS} soon={stats.skillshotsDodged == null} />
            </div>
            {(() => {
              const spec = MECH_LADDER_STATS.find((row) => row.id === mechLadderSpec) || MECH_LADDER_STATS[0];
              return <RankLadder spec={spec} playerValue={spec.fromPlayer(stats)} {...ladderProps} />;
            })()}
            <p className="ln-fight-note">{t('lens.mechNote')}</p>
          </>
        ) : (
          <div className="ln-empty ln-fight-empty">
            <span className="ln-lock-lg"><IcoLock /></span>
            <p>{t('lens.fightSubSoon')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, hint, points = [], invert, tone, ring, onPick, active, soon,
}) {
  if (soon) {
    return (
      <article className="ln-card is-soon">
        <header>
          <span className="ln-lock"><IcoLock /></span>
          <span>{label}</span>
        </header>
        <div className="ln-card__row ln-card__row--soon">
          <div className="ln-soon-bar" aria-hidden="true" />
        </div>
        <p>{hint || '—'}</p>
      </article>
    );
  }
  const trend = trendOf(points, invert);
  const cardTone = tone || (trend !== 'flat' ? trend : '');
  return (
    <article
      className={`ln-card${cardTone ? ` is-${cardTone}` : ''}${active ? ' is-pick' : ''}${onPick ? ' is-click' : ''}`}
      onClick={onPick}
      onKeyDown={onPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } } : undefined}
      role={onPick ? 'button' : undefined}
      tabIndex={onPick ? 0 : undefined}
    >
      <header>
        <span className="ln-ico">{icon}</span>
        <span>{label}</span>
      </header>
      <div className="ln-card__row">
        {ring != null ? (
          <Ring pct={ring} color={cardTone === 'down' ? 'var(--rift-danger)' : 'var(--rift-gold)'}>
            <strong>{value}</strong>
          </Ring>
        ) : (
          <strong>{value}</strong>
        )}
        <Sparkline points={points} trend={trend} width={108} height={36} />
      </div>
      {hint ? <p>{hint}</p> : null}
    </article>
  );
}

function boxEdge(cx, cy, half, ux, uy) {
  const ax = Math.abs(ux) || 1e-9;
  const ay = Math.abs(uy) || 1e-9;
  const t = Math.min(half / ax, half / ay);
  return [cx + ux * t, cy + uy * t];
}

function spokeCurve(x1, y1, x2, y2, bend) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const qx = mx - (dy / len) * bend;
  const qy = my + (dx / len) * bend;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function LensWeb({ cats, selected, wr, games, t, onSelect }) {
  const size = 400;
  const cx = 200;
  const cy = 200;
  const radius = 132;
  const hubHalf = 42;
  const nodeHalf = 18;
  const nodes = cats.map((cat, i) => {
    const deg = -90 + (360 / cats.length) * i;
    const [x, y] = polar(cx, cy, radius, deg);
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const [x1, y1] = boxEdge(cx, cy, hubHalf, ux, uy);
    const [x2, y2] = boxEdge(x, y, nodeHalf, -ux, -uy);
    return { ...cat, x, y, ux, uy, x1, y1, x2, y2, bend: 10 + (i % 2) * 4 };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="ln-web__svg" role="img" aria-label={t('lens.title')}>
      <defs>
        <filter id="ln-spoke-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {nodes.map((node) => (
          <linearGradient
            key={`g-${node.id}`}
            id={`ln-spoke-${node.id}`}
            gradientUnits="userSpaceOnUse"
            x1={node.x1} y1={node.y1} x2={node.x2} y2={node.y2}
          >
            <stop offset="0%" stopColor={node.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={node.color} stopOpacity="1" />
          </linearGradient>
        ))}
        {nodes.map((node) => (
          <linearGradient key={`f-${node.id}`} id={`ln-fill-${node.id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={node.color} stopOpacity="0.55" />
            <stop offset="48%" stopColor="#14161f" stopOpacity="1" />
          </linearGradient>
        ))}
      </defs>

      {nodes.map((node) => (
        <path
          key={`line-${node.id}`}
          d={spokeCurve(node.x1, node.y1, node.x2, node.y2, node.bend)}
          fill="none"
          stroke={`url(#ln-spoke-${node.id})`}
          strokeWidth={selected === node.id ? 2.8 : 2}
          strokeLinecap="round"
          opacity={node.live ? 1 : 0.38}
          filter="url(#ln-spoke-glow)"
        />
      ))}

      {nodes.map((node) => (
        <g
          key={node.id}
          className={`ln-web-hit${selected === node.id ? ' is-on' : ''}`}
          transform={`translate(${node.x} ${node.y})`}
          fill="#fff"
          opacity={node.live ? 1 : 0.5}
          onClick={() => onSelect(node.id)}
          style={{ cursor: 'pointer' }}
        >
          <title>{t(node.labelKey)}</title>
          {selected === node.id ? (
            <rect
              x={-nodeHalf - 3} y={-nodeHalf - 3}
              width={(nodeHalf + 3) * 2} height={(nodeHalf + 3) * 2}
              rx="10" fill="none" stroke={node.color} strokeWidth="1.5" opacity="0.55"
            />
          ) : null}
          <rect
            x={-nodeHalf} y={-nodeHalf}
            width={nodeHalf * 2} height={nodeHalf * 2}
            rx="8"
            fill={`url(#ln-fill-${node.id})`}
            stroke={node.color}
            strokeWidth={selected === node.id ? 2 : 1.5}
          />
          <Glyph name={node.icon} size={18} />
          {!node.live ? (
            <g transform="translate(12 -18)" style={{ color: '#e0b256' }}>
              <IcoLock />
            </g>
          ) : null}
        </g>
      ))}

      <g className="ln-hub-svg" filter="url(#ln-spoke-glow)">
        <rect
          x={cx - hubHalf} y={cy - hubHalf}
          width={hubHalf * 2} height={hubHalf * 2}
          rx="18" fill="#0c0e16" stroke="rgba(255,255,255,0.14)"
        />
        <text x={cx} y={cy - 6} textAnchor="middle" className="ln-hub-num">{fmtPct(wr)}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" className="ln-hub-lbl">{t('lens.hubWr')}</text>
        <text x={cx} y={cy + 24} textAnchor="middle" className="ln-hub-sub">{t('lens.hubGames', { n: games })}</text>
      </g>
    </svg>
  );
}

export default function Lens() {
  const { session } = useSession();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const qParam = parsePlayerSearch(searchParams);
  const ownId = session ? `${session.gameName}#${session.tagLine}` : '';
  const activeId = (qParam || ownId).trim();
  const [mode, setMode] = useState('Solo');
  const [role, setRole] = useState('');
  const [tab, setTab] = useState('overview');
  const [selected, setSelected] = useState('fighting');
  const [fightCat, setFightCat] = useState('general');
  const [laneCat, setLaneCat] = useState('general');
  const [objCat, setObjCat] = useState('general');
  const [visCat, setVisCat] = useState('general');
  const [survCat, setSurvCat] = useState('general');
  const [adaptCat, setAdaptCat] = useState('general');
  const [impactCat, setImpactCat] = useState('general');
  const [ladderSpec, setLadderSpec] = useState('kp');
  const [duelLadderSpec, setDuelLadderSpec] = useState('soloKills');
  const [skirmishLadderSpec, setSkirmishLadderSpec] = useState('skirmishKills');
  const [teamfightLadderSpec, setTeamfightLadderSpec] = useState('teamfightKills');
  const [mechLadderSpec, setMechLadderSpec] = useState('largestMultiKill');
  const [laneLadderSpec, setLaneLadderSpec] = useState('gold15');
  const [objLadderSpec, setObjLadderSpec] = useState('objDpm');
  const [visLadderSpec, setVisLadderSpec] = useState('visionPerMin');
  const [survLadderSpec, setSurvLadderSpec] = useState('deaths');
  const [adaptLadderSpec, setAdaptLadderSpec] = useState('champVariety');
  const [impactLadderSpec, setImpactLadderSpec] = useState('kp');
  const { profile, loading, error } = useDashboardProfile({ session, riotId: activeId, mode, count: 20 });
  const ddVersion = useDdragonVersion();
  const platform = profile?.platform || session?.platform || 'euw1';
  const {
    statLadder, loading: ladderLoading, refreshing: ladderRefreshing, matches: ladderMatches,
  } = useLensBenchmarks({ platform, role, queue: 420 });

  const games = useMemo(() => filterByRole(profile?.recentGames || [], role), [profile, role]);
  const sample = sampleSummary(games);
  const hint = t('lens.avgHint', { n: sample.games });

  const stats = useMemo(() => {
    const phaseGames = games.filter((g) => g.dpmEarly != null).length;
    const phaseHint = phaseGames
      ? t('lens.phaseHint', { n: phaseGames, total: games.length })
      : t('lens.phaseMissing');
    const laneGames = games.filter((g) => g.goldDiff15 != null).length;
    const laneHint = laneGames
      ? t('lens.laneAt15Hint', { n: laneGames, total: games.length })
      : t('lens.laneMissing');
    const firstBloodPct = games.length
      ? (games.filter((g) => g.firstBlood).length / games.length) * 100
      : null;
    const objTimelineGames = games.filter((g) => g.dragonTakes != null).length;
    const objTimelineHint = objTimelineGames
      ? t('lens.objTimelineHint', { n: objTimelineGames, total: games.length })
      : t('lens.objTimelineMissing');
    const visTimingGames = games.filter((g) => g.wardsPlaced20 != null).length;
    const visTimingHint = visTimingGames
      ? t('lens.visTimingDataHint', { n: visTimingGames, total: games.length })
      : t('lens.visTimingMissing');
    const deathTimingGames = games.filter((g) => g.deathsBefore15 != null).length;
    const deathTimingHint = deathTimingGames
      ? t('lens.deathTimingHint', { n: deathTimingGames, total: games.length })
      : t('lens.deathTimingMissing');
    const firstTowerPct = games.length
      ? (games.filter((g) => g.firstTower).length / games.length) * 100
      : null;
    const duelGames = games.filter((g) => g.soloKills != null).length;
    const duelDeathGames = games.filter((g) => g.soloDeaths != null).length;
    const duelHint = duelGames
      ? t('lens.duelHint', { n: Math.max(duelGames, duelDeathGames), total: games.length })
      : t('lens.duelMissing');
    const soloKills = avg(games, (g) => (g.soloKills == null ? null : Number(g.soloKills)));
    const soloDeaths = avg(games, (g) => (g.soloDeaths == null ? null : Number(g.soloDeaths)));
    const soloKd = (soloKills != null && soloDeaths != null)
      ? soloKills / Math.max(1, soloDeaths)
      : null;
    const soloWinRate = (soloKills != null && soloDeaths != null && (soloKills + soloDeaths) > 0)
      ? (soloKills / (soloKills + soloDeaths)) * 100
      : null;
    const fightBucketGames = games.filter((g) => g.skirmishKills != null).length;
    const fightBucketHint = fightBucketGames
      ? t('lens.fightBucketHint', { n: fightBucketGames, total: games.length })
      : t('lens.fightBucketMissing');
    const skirmishKills = avg(games, (g) => (g.skirmishKills == null ? null : Number(g.skirmishKills)));
    const skirmishDeaths = avg(games, (g) => (g.skirmishDeaths == null ? null : Number(g.skirmishDeaths)));
    const skirmishAssists = avg(games, (g) => (g.skirmishAssists == null ? null : Number(g.skirmishAssists)));
    const skirmishKd = (skirmishKills != null && skirmishDeaths != null)
      ? skirmishKills / Math.max(1, skirmishDeaths)
      : null;
    const skirmishWinRate = (skirmishKills != null && skirmishDeaths != null && (skirmishKills + skirmishDeaths) > 0)
      ? (skirmishKills / (skirmishKills + skirmishDeaths)) * 100
      : null;
    const skirmishKa = (skirmishKills != null && skirmishAssists != null)
      ? skirmishKills + skirmishAssists
      : null;
    const skirmishTakes = skirmishKa;
    const teamfightKills = avg(games, (g) => (g.teamfightKills == null ? null : Number(g.teamfightKills)));
    const teamfightDeaths = avg(games, (g) => (g.teamfightDeaths == null ? null : Number(g.teamfightDeaths)));
    const teamfightAssists = avg(games, (g) => (g.teamfightAssists == null ? null : Number(g.teamfightAssists)));
    const teamfightKd = (teamfightKills != null && teamfightDeaths != null)
      ? teamfightKills / Math.max(1, teamfightDeaths)
      : null;
    const teamfightWinRate = (teamfightKills != null && teamfightDeaths != null && (teamfightKills + teamfightDeaths) > 0)
      ? (teamfightKills / (teamfightKills + teamfightDeaths)) * 100
      : null;
    const teamfightKa = (teamfightKills != null && teamfightAssists != null)
      ? teamfightKills + teamfightAssists
      : null;
    const uniqueChamps = uniqueCount(games, (g) => g.champion);
    const uniqueRoles = uniqueCount(games, (g) => g.role);
    const uniqueKeystones = uniqueCount(games, (g) => g.runes?.keystone);
    const uniquePrimaries = uniqueCount(games, (g) => g.runes?.primary);
    const uniqueSecondaries = uniqueCount(games, (g) => g.runes?.sub);
    const uniqueRunePages = uniqueCount(games, (g) => {
      const r = g.runes;
      if (!r?.keystone && !r?.primary && !r?.sub) return '';
      return `${r.keystone || ''}-${r.primary || ''}-${r.sub || ''}`;
    });
    const uniqueSpells = uniqueCount(games, spellKey);
    const uniqueItems = (() => {
      const set = new Set();
      games.forEach((g) => {
        (g.items || []).slice(0, 6).forEach((id) => { if (id) set.add(String(id)); });
      });
      return set.size;
    })();
    const buildKey = (g) => (g.items || []).slice(0, 6).filter(Boolean).join('-');
    const uniqueBuilds = uniqueCount(games, buildKey);
    const uniqueFirstItems = uniqueCount(games, (g) => {
      const path = g.buildPath || [];
      return path.find((id) => id) || (g.items || []).find((id) => id) || '';
    });
    const champCounts = games.reduce((acc, row) => {
      if (row.champion) acc[row.champion] = (acc[row.champion] || 0) + 1;
      return acc;
    }, {});
    const champShare = modalShare(games, (g) => g.champion);
    const roleShare = modalShare(games, (g) => g.role);
    const keystoneShare = modalShare(games, (g) => g.runes?.keystone);
    const primaryShare = modalShare(games, (g) => g.runes?.primary);
    const spellShare = modalShare(games, spellKey);
    const buildShare = modalShare(games, buildKey);
    const champVariety = games.length ? (uniqueChamps / games.length) * 10 : null;
    const offRolePct = roleShare == null ? null : (1 - roleShare) * 100;
    const mainChampShare = champShare == null ? null : champShare * 100;
    const mainRoleShare = roleShare == null ? null : roleShare * 100;
    const mainKeystoneShare = keystoneShare == null ? null : keystoneShare * 100;
    const mainPrimaryShare = primaryShare == null ? null : primaryShare * 100;
    const mainSpellShare = spellShare == null ? null : spellShare * 100;
    const mainBuildShare = buildShare == null ? null : buildShare * 100;
    const topChamp = Object.entries(champCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const mainChampGames = topChamp ? (champCounts[topChamp] || 0) : 0;
    const oneOffChamps = Object.values(champCounts).filter((n) => n === 1).length;
    const champsPlayed3Plus = Object.values(champCounts).filter((n) => n >= 3).length;
    const topRole = Object.entries(games.reduce((acc, row) => {
      if (row.role) acc[row.role] = (acc[row.role] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];
    const offRoleGames = topRole
      ? games.filter((g) => g.role && g.role !== topRole).length
      : 0;
    const topKeystone = Object.entries(games.reduce((acc, row) => {
      const k = row.runes?.keystone;
      if (k) acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topPrimary = Object.entries(games.reduce((acc, row) => {
      const k = row.runes?.primary;
      if (k) acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topSpell = Object.entries(games.reduce((acc, row) => {
      const k = spellKey(row);
      if (k) acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topBuild = Object.entries(games.reduce((acc, row) => {
      const k = (row.items || []).slice(0, 6).filter(Boolean).join('-');
      if (k) acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      kda: avg(games, gameKda),
      kp: avg(games, (g) => Number(g.kp)),
      dpm: avg(games, (g) => Number(g.dpm)),
      dpmEarly: avg(games, (g) => g.dpmEarly),
      dpmMid: avg(games, (g) => g.dpmMid),
      dpmLate: avg(games, (g) => g.dpmLate),
      taken: avg(games, (g) => Number(g.takenPerMin ?? (Number(g.damageTaken) / Math.max(1, (g.gameDuration || g.durationMin * 60 || 1) / 60)))),
      deaths: avg(games, (g) => Number(g.deaths)),
      mitigated: avg(games, (g) => Number(g.mitigatedPerMin)),
      healPerMin: avg(games, (g) => Number(g.healPerMin)),
      allyHealPerMin: avg(games, (g) => Number(g.allyHealPerMin)),
      longestLife: avg(games, (g) => Number(g.longestLife)),
      timeCCing: avg(games, (g) => Number(g.timeCCing)),
      timeDead: avg(games, (g) => Number(g.timeDead)),
      deathsPerMin: avg(games, (g) => Number(g.deathsPerMin)),
      damageTaken: avg(games, (g) => Number(g.damageTaken)),
      mitigatedTotal: avg(games, (g) => Number(g.mitigatedTotal)),
      healTotal: avg(games, (g) => Number(g.healTotal)),
      timeCcDealt: avg(games, (g) => Number(g.timeCcDealt)),
      deathsBefore15: deathTimingGames ? avg(games, (g) => (g.deathsBefore15 == null ? null : Number(g.deathsBefore15))) : null,
      deathsBefore25: deathTimingGames ? avg(games, (g) => (g.deathsBefore25 == null ? null : Number(g.deathsBefore25))) : null,
      firstDeathSec: deathTimingGames ? avg(games, (g) => (g.firstDeathSec == null ? null : Number(g.firstDeathSec))) : null,
      avgDeathSec: deathTimingGames ? avg(games, (g) => (g.avgDeathSec == null ? null : Number(g.avgDeathSec))) : null,
      damageTakenShare: avg(games, (g) => (g.damageTakenShare == null ? null : Number(g.damageTakenShare))),
      deathsByEnemyChamps: avg(games, (g) => (g.deathsByEnemyChamps == null ? null : Number(g.deathsByEnemyChamps))),
      survivedSingleDigitHp: avg(games, (g) => (g.survivedSingleDigitHp == null ? null : Number(g.survivedSingleDigitHp))),
      tookLargeDamageSurvived: avg(games, (g) => (g.tookLargeDamageSurvived == null ? null : Number(g.tookLargeDamageSurvived))),
      effectiveHealShield: avg(games, (g) => (g.effectiveHealShield == null ? null : Number(g.effectiveHealShield))),
      saveAllyFromDeath: avg(games, (g) => (g.saveAllyFromDeath == null ? null : Number(g.saveAllyFromDeath))),
      enemyImmobilizations: avg(games, (g) => (g.enemyImmobilizations == null ? null : Number(g.enemyImmobilizations))),
      immobilizeAndKill: avg(games, (g) => (g.immobilizeAndKill == null ? null : Number(g.immobilizeAndKill))),
      survivedThreeImmobilizes: avg(games, (g) => (g.survivedThreeImmobilizes == null ? null : Number(g.survivedThreeImmobilizes))),
      unseenRecalls: avg(games, (g) => (g.unseenRecalls == null ? null : Number(g.unseenRecalls))),
      csm: avg(games, gameCsm),
      vision: avg(games, (g) => Number(g.visionPerMin)),
      visionPerMin: avg(games, (g) => Number(g.visionPerMin)),
      visionScore: avg(games, (g) => Number(g.visionScore)),
      wardsPlaced: avg(games, (g) => Number(g.wardsPlaced)),
      wardsKilled: avg(games, (g) => Number(g.wardsKilled)),
      controlWardsBought: avg(games, (g) => Number(g.controlWardsBought)),
      controlWardsPlaced: avg(games, (g) => Number(g.controlWardsPlaced)),
      wardsPlacedPerMin: avg(games, (g) => Number(g.wardsPlacedPerMin)),
      wardsKilledPerMin: avg(games, (g) => Number(g.wardsKilledPerMin)),
      controlWardsPerMin: avg(games, (g) => Number(g.controlWardsPerMin)),
      stealthWardsPlaced: avg(games, (g) => Number(g.stealthWardsPlaced)),
      wardTakedowns: avg(games, (g) => Number(g.wardTakedowns)),
      wardsGuarded: avg(games, (g) => (g.wardsGuarded == null ? null : Number(g.wardsGuarded))),
      controlWardRiverCoverage: avg(games, (g) => (g.controlWardRiverCoverage == null ? null : Number(g.controlWardRiverCoverage))),
      mostWardsOneSweeper: avg(games, (g) => (g.mostWardsOneSweeper == null ? null : Number(g.mostWardsOneSweeper))),
      twoWardsOneSweeper: avg(games, (g) => (g.twoWardsOneSweeper == null ? null : Number(g.twoWardsOneSweeper))),
      threeWardsOneSweeper: avg(games, (g) => (g.threeWardsOneSweeper == null ? null : Number(g.threeWardsOneSweeper))),
      wardsPlaced15: visTimingGames ? avg(games, (g) => (g.wardsPlaced15 == null ? null : Number(g.wardsPlaced15))) : null,
      wardsKilled15: visTimingGames ? avg(games, (g) => (g.wardsKilled15 == null ? null : Number(g.wardsKilled15))) : null,
      controlPlaced15: visTimingGames ? avg(games, (g) => (g.controlPlaced15 == null ? null : Number(g.controlPlaced15))) : null,
      wardsPlaced20: visTimingGames ? avg(games, (g) => (g.wardsPlaced20 == null ? null : Number(g.wardsPlaced20))) : null,
      wardsKilled20: visTimingGames ? avg(games, (g) => (g.wardsKilled20 == null ? null : Number(g.wardsKilled20))) : null,
      controlPlaced20: visTimingGames ? avg(games, (g) => (g.controlPlaced20 == null ? null : Number(g.controlPlaced20))) : null,
      gold15: avg(games, (g) => (g.goldDiff15 == null ? null : Number(g.goldDiff15))),
      ka15: avg(games, (g) => (g.kaDiff15 == null ? null : Number(g.kaDiff15))),
      csDiff15: avg(games, (g) => (g.csDiff15 == null ? null : Number(g.csDiff15))),
      cs15: avg(games, (g) => (g.cs15 == null ? null : Number(g.cs15))),
      xpDiff15: avg(games, (g) => (g.xpDiff15 == null ? null : Number(g.xpDiff15))),
      dmg15: avg(games, (g) => (g.dmg15 == null ? null : Number(g.dmg15))),
      taken15: avg(games, (g) => (g.taken15 == null ? null : Number(g.taken15))),
      tradeDiff15: avg(games, (g) => (g.tradeDiff15 == null ? null : Number(g.tradeDiff15))),
      kills15: avg(games, (g) => (g.kills15 == null ? null : Number(g.kills15))),
      deaths15: avg(games, (g) => (g.deaths15 == null ? null : Number(g.deaths15))),
      roamKills15: avg(games, (g) => (g.roamKills15 == null ? null : Number(g.roamKills15))),
      roamAssists15: avg(games, (g) => (g.roamAssists15 == null ? null : Number(g.roamAssists15))),
      roamKa15: avg(games, (g) => {
        if (g.roamKills15 == null && g.roamAssists15 == null) return null;
        return (Number(g.roamKills15) || 0) + (Number(g.roamAssists15) || 0);
      }),
      maxCsAdvantage: avg(games, (g) => (g.maxCsAdvantage == null ? null : Number(g.maxCsAdvantage))),
      maxLevelLead: avg(games, (g) => (g.maxLevelLead == null ? null : Number(g.maxLevelLead))),
      laneVisionAdv: avg(games, (g) => (g.laneVisionAdv == null ? null : Number(g.laneVisionAdv))),
      laneGoldExpAdv: avg(games, (g) => (g.laneGoldExpAdv == null ? null : Number(g.laneGoldExpAdv))),
      earlyLaneGoldExpAdv: avg(games, (g) => (g.earlyLaneGoldExpAdv == null ? null : Number(g.earlyLaneGoldExpAdv))),
      laneMinions10: avg(games, (g) => (g.laneMinions10 == null ? null : Number(g.laneMinions10))),
      turretPlates: avg(games, (g) => (g.turretPlates == null ? null : Number(g.turretPlates))),
      otherLaneKillsEarly: avg(games, (g) => (g.otherLaneKillsEarly == null ? null : Number(g.otherLaneKillsEarly))),
      teleportTakedowns: avg(games, (g) => (g.teleportTakedowns == null ? null : Number(g.teleportTakedowns))),
      takedownsFirst25: avg(games, (g) => (g.takedownsFirst25 == null ? null : Number(g.takedownsFirst25))),
      laneEarly: avg(games, (g) => Number(g.earlyScore)),
      laneMid: avg(games, (g) => Number(g.midScore)),
      laneLate: avg(games, (g) => Number(g.lateScore)),
      firstBloodPct,
      objDpm: avg(games, (g) => Number(g.objDpm)),
      towerDpm: avg(games, (g) => Number(g.towerDpm)),
      turretTakedowns: avg(games, (g) => Number(g.turretTakedowns)),
      inhibTakedowns: avg(games, (g) => Number(g.inhibTakedowns)),
      objStolen: sum(games, (g) => g.objStolen),
      dragonTakes: objTimelineGames ? avg(games, (g) => (g.dragonTakes == null ? null : Number(g.dragonTakes))) : null,
      baronTakes: objTimelineGames ? avg(games, (g) => (g.baronTakes == null ? null : Number(g.baronTakes))) : null,
      heraldTakes: objTimelineGames ? avg(games, (g) => (g.heraldTakes == null ? null : Number(g.heraldTakes))) : null,
      firstTowerPct,
      firstTowerKillPct: games.length
        ? (games.filter((g) => g.firstTowerKill).length / games.length) * 100
        : 0,
      firstDragonPct: games.length
        ? (games.filter((g) => g.firstDragon).length / games.length) * 100
        : 0,
      firstBaronPct: games.length
        ? (games.filter((g) => g.firstBaron).length / games.length) * 100
        : 0,
      nexusTakedowns: avg(games, (g) => Number(g.nexusTakedowns)),
      objStolenAvg: avg(games, (g) => Number(g.objStolen) || 0),
      objStolenAssists: avg(games, (g) => Number(g.objStolenAssists) || 0),
      epicTakes: (objTimelineGames || games.some((g) => g.epicTakes != null))
        ? avg(games, (g) => (g.epicTakes == null ? null : Number(g.epicTakes)))
        : null,
      grubTakes: objTimelineGames ? avg(games, (g) => (g.grubTakes == null ? null : Number(g.grubTakes))) : null,
      atakhanTakes: objTimelineGames ? avg(games, (g) => (g.atakhanTakes == null ? null : Number(g.atakhanTakes))) : null,
      teamDragonKills: avg(games, (g) => Number(g.teamDragonKills) || 0),
      teamBaronKills: avg(games, (g) => Number(g.teamBaronKills) || 0),
      teamHeraldKills: avg(games, (g) => Number(g.teamHeraldKills) || 0),
      epicMonsterSteals: avg(games, (g) => (g.epicMonsterSteals == null ? null : Number(g.epicMonsterSteals))),
      epicMonsterStolenWithoutSmite: avg(games, (g) => (g.epicMonsterStolenWithoutSmite == null ? null : Number(g.epicMonsterStolenWithoutSmite))),
      epicMonsterKillsNearEnemyJungler: avg(games, (g) => (g.epicMonsterKillsNearEnemyJungler == null ? null : Number(g.epicMonsterKillsNearEnemyJungler))),
      outerTurretExecutesBefore10: avg(games, (g) => (g.outerTurretExecutesBefore10 == null ? null : Number(g.outerTurretExecutesBefore10))),
      turretsTakenWithHerald: avg(games, (g) => (g.turretsTakenWithHerald == null ? null : Number(g.turretsTakenWithHerald))),
      wardTakedownsBefore20: avg(games, (g) => (g.wardTakedownsBefore20 == null ? null : Number(g.wardTakedownsBefore20))),
      soloKills,
      soloDeaths,
      soloKd,
      soloWinRate,
      soloKillShare: (() => {
        const v = avg(games, (g) => (g.soloKillShare == null ? null : Number(g.soloKillShare) * 100));
        return v;
      })(),
      laneSoloKills: avg(games, (g) => (g.laneSoloKills == null ? null : Number(g.laneSoloKills))),
      laneSoloDeaths: avg(games, (g) => (g.laneSoloDeaths == null ? null : Number(g.laneSoloDeaths))),
      quickSoloKills: avg(games, (g) => (g.quickSoloKills == null ? null : Number(g.quickSoloKills))),
      soloKillsTotal: duelGames ? sum(games, (g) => g.soloKills) : null,
      duelHint,
      skirmishKills,
      skirmishDeaths,
      skirmishAssists,
      skirmishKd,
      skirmishWinRate,
      skirmishKa,
      skirmishTakes,
      skirmishKillsTotal: fightBucketGames ? sum(games, (g) => g.skirmishKills) : null,
      skirmishAssistsTotal: fightBucketGames ? sum(games, (g) => g.skirmishAssists) : null,
      teamfightKills,
      teamfightDeaths,
      teamfightAssists,
      teamfightKd,
      teamfightWinRate,
      teamfightKa,
      teamfightTakes: teamfightKa,
      teamfightKillsTotal: fightBucketGames ? sum(games, (g) => g.teamfightKills) : null,
      teamfightAssistsTotal: fightBucketGames ? sum(games, (g) => g.teamfightAssists) : null,
      fightBucketHint,
      largestMultiKill: avg(games, (g) => (g.largestMultiKill == null ? null : Number(g.largestMultiKill))),
      largestKillingSpree: avg(games, (g) => (g.largestKillingSpree == null ? null : Number(g.largestKillingSpree))),
      multikills: avg(games, (g) => (g.multikills == null ? null : Number(g.multikills))),
      outnumberedKills: avg(games, (g) => (g.outnumberedKills == null ? null : Number(g.outnumberedKills))),
      skillshotsHit: avg(games, (g) => (g.skillshotsHit == null ? null : Number(g.skillshotsHit))),
      skillshotsDodged: avg(games, (g) => (g.skillshotsDodged == null ? null : Number(g.skillshotsDodged))),
      uniqueChamps,
      uniqueRoles,
      uniqueKeystones,
      uniquePrimaries,
      uniqueSecondaries,
      uniqueRunePages,
      uniqueSpells,
      uniqueItems,
      uniqueBuilds,
      uniqueFirstItems,
      champVariety,
      offRolePct,
      offRoleGames,
      mainChampShare,
      mainChampGames,
      oneOffChamps,
      champsPlayed3Plus,
      mainRoleShare,
      mainKeystoneShare,
      mainPrimaryShare,
      mainSpellShare,
      mainBuildShare,
      kpPct: (avg(games, (g) => Number(g.kp)) || 0) * 100,
      damageSharePct: (() => {
        const v = avg(games, (g) => (g.damageShare == null ? null : Number(g.damageShare) * 100));
        return v;
      })(),
      goldSharePct: avg(games, (g) => (g.goldShare == null ? null : Number(g.goldShare) * 100)),
      visionSharePct: avg(games, (g) => (g.visionShare == null ? null : Number(g.visionShare) * 100)),
      objDamageSharePct: avg(games, (g) => (g.objDamageShare == null ? null : Number(g.objDamageShare) * 100)),
      assists: avg(games, (g) => Number(g.assists ?? g.assistsAvg)),
      shieldPerMin: avg(games, (g) => Number(g.shieldPerMin)),
      killsAssists: avg(games, (g) => Number(g.killsAssists ?? ((g.kills || 0) + (g.assists || 0)))),
      objTimelineHint,
      visTimingHint,
      deathTimingHint,
      laneGames,
      laneHint,
      triples: sum(games, (g) => g.tripleKills),
      quadras: sum(games, (g) => g.quadraKills),
      pentas: sum(games, (g) => g.pentaKills),
      phaseGames,
      phaseHint,
      kdaS: seriesOf(games, gameKda),
      kpS: seriesOf(games, (g) => Number(g.kp) * 100),
      dpmS: seriesOf(games, (g) => Number(g.dpm)),
      dpmEarlyS: seriesOf(games, (g) => g.dpmEarly),
      dpmMidS: seriesOf(games, (g) => g.dpmMid),
      dpmLateS: seriesOf(games, (g) => g.dpmLate),
      takenS: seriesOf(games, (g) => Number(g.takenPerMin ?? (Number(g.damageTaken) / Math.max(1, (g.gameDuration || g.durationMin * 60 || 1) / 60)))),
      mitigatedS: seriesOf(games, (g) => Number(g.mitigatedPerMin)),
      healPerMinS: seriesOf(games, (g) => Number(g.healPerMin)),
      allyHealPerMinS: seriesOf(games, (g) => Number(g.allyHealPerMin)),
      longestLifeS: seriesOf(games, (g) => Number(g.longestLife)),
      timeCCingS: seriesOf(games, (g) => Number(g.timeCCing)),
      timeDeadS: seriesOf(games, (g) => Number(g.timeDead)),
      deathsPerMinS: seriesOf(games, (g) => Number(g.deathsPerMin)),
      damageTakenS: seriesOf(games, (g) => Number(g.damageTaken)),
      mitigatedTotalS: seriesOf(games, (g) => Number(g.mitigatedTotal)),
      healTotalS: seriesOf(games, (g) => Number(g.healTotal)),
      timeCcDealtS: seriesOf(games, (g) => Number(g.timeCcDealt)),
      deathsBefore15S: seriesOf(games, (g) => (g.deathsBefore15 == null ? null : Number(g.deathsBefore15))),
      deathsBefore25S: seriesOf(games, (g) => (g.deathsBefore25 == null ? null : Number(g.deathsBefore25))),
      firstDeathSecS: seriesOf(games, (g) => (g.firstDeathSec == null ? null : Number(g.firstDeathSec))),
      avgDeathSecS: seriesOf(games, (g) => (g.avgDeathSec == null ? null : Number(g.avgDeathSec))),
      damageTakenShareS: seriesOf(games, (g) => (g.damageTakenShare == null ? null : Number(g.damageTakenShare) * 100)),
      deathsByEnemyChampsS: seriesOf(games, (g) => (g.deathsByEnemyChamps == null ? null : Number(g.deathsByEnemyChamps))),
      survivedSingleDigitHpS: seriesOf(games, (g) => (g.survivedSingleDigitHp == null ? null : Number(g.survivedSingleDigitHp))),
      tookLargeDamageSurvivedS: seriesOf(games, (g) => (g.tookLargeDamageSurvived == null ? null : Number(g.tookLargeDamageSurvived))),
      effectiveHealShieldS: seriesOf(games, (g) => (g.effectiveHealShield == null ? null : Number(g.effectiveHealShield))),
      saveAllyFromDeathS: seriesOf(games, (g) => (g.saveAllyFromDeath == null ? null : Number(g.saveAllyFromDeath))),
      enemyImmobilizationsS: seriesOf(games, (g) => (g.enemyImmobilizations == null ? null : Number(g.enemyImmobilizations))),
      immobilizeAndKillS: seriesOf(games, (g) => (g.immobilizeAndKill == null ? null : Number(g.immobilizeAndKill))),
      survivedThreeImmobilizesS: seriesOf(games, (g) => (g.survivedThreeImmobilizes == null ? null : Number(g.survivedThreeImmobilizes))),
      unseenRecallsS: seriesOf(games, (g) => (g.unseenRecalls == null ? null : Number(g.unseenRecalls))),
      csmS: seriesOf(games, gameCsm),
      visionS: seriesOf(games, (g) => Number(g.visionPerMin)),
      visionPerMinS: seriesOf(games, (g) => Number(g.visionPerMin)),
      visionScoreS: seriesOf(games, (g) => Number(g.visionScore)),
      wardsPlacedS: seriesOf(games, (g) => Number(g.wardsPlaced)),
      wardsKilledS: seriesOf(games, (g) => Number(g.wardsKilled)),
      controlWardsBoughtS: seriesOf(games, (g) => Number(g.controlWardsBought)),
      controlWardsPlacedS: seriesOf(games, (g) => Number(g.controlWardsPlaced)),
      wardsPlacedPerMinS: seriesOf(games, (g) => Number(g.wardsPlacedPerMin)),
      wardsKilledPerMinS: seriesOf(games, (g) => Number(g.wardsKilledPerMin)),
      controlWardsPerMinS: seriesOf(games, (g) => Number(g.controlWardsPerMin)),
      stealthWardsPlacedS: seriesOf(games, (g) => Number(g.stealthWardsPlaced)),
      wardTakedownsS: seriesOf(games, (g) => Number(g.wardTakedowns)),
      wardsGuardedS: seriesOf(games, (g) => (g.wardsGuarded == null ? null : Number(g.wardsGuarded))),
      controlWardRiverCoverageS: seriesOf(games, (g) => (g.controlWardRiverCoverage == null ? null : Number(g.controlWardRiverCoverage) * 100)),
      mostWardsOneSweeperS: seriesOf(games, (g) => (g.mostWardsOneSweeper == null ? null : Number(g.mostWardsOneSweeper))),
      twoWardsOneSweeperS: seriesOf(games, (g) => (g.twoWardsOneSweeper == null ? null : Number(g.twoWardsOneSweeper))),
      threeWardsOneSweeperS: seriesOf(games, (g) => (g.threeWardsOneSweeper == null ? null : Number(g.threeWardsOneSweeper))),
      wardsPlaced15S: seriesOf(games, (g) => (g.wardsPlaced15 == null ? null : Number(g.wardsPlaced15))),
      wardsKilled15S: seriesOf(games, (g) => (g.wardsKilled15 == null ? null : Number(g.wardsKilled15))),
      controlPlaced15S: seriesOf(games, (g) => (g.controlPlaced15 == null ? null : Number(g.controlPlaced15))),
      wardsPlaced20S: seriesOf(games, (g) => (g.wardsPlaced20 == null ? null : Number(g.wardsPlaced20))),
      wardsKilled20S: seriesOf(games, (g) => (g.wardsKilled20 == null ? null : Number(g.wardsKilled20))),
      controlPlaced20S: seriesOf(games, (g) => (g.controlPlaced20 == null ? null : Number(g.controlPlaced20))),
      goldS: seriesOf(games, (g) => (g.goldDiff15 == null ? null : Number(g.goldDiff15))),
      gold15S: seriesOf(games, (g) => (g.goldDiff15 == null ? null : Number(g.goldDiff15))),
      ka15S: seriesOf(games, (g) => (g.kaDiff15 == null ? null : Number(g.kaDiff15))),
      csDiff15S: seriesOf(games, (g) => (g.csDiff15 == null ? null : Number(g.csDiff15))),
      cs15S: seriesOf(games, (g) => (g.cs15 == null ? null : Number(g.cs15))),
      xpDiff15S: seriesOf(games, (g) => (g.xpDiff15 == null ? null : Number(g.xpDiff15))),
      dmg15S: seriesOf(games, (g) => (g.dmg15 == null ? null : Number(g.dmg15))),
      taken15S: seriesOf(games, (g) => (g.taken15 == null ? null : Number(g.taken15))),
      tradeDiff15S: seriesOf(games, (g) => (g.tradeDiff15 == null ? null : Number(g.tradeDiff15))),
      kills15S: seriesOf(games, (g) => (g.kills15 == null ? null : Number(g.kills15))),
      deaths15S: seriesOf(games, (g) => (g.deaths15 == null ? null : Number(g.deaths15))),
      roamKills15S: seriesOf(games, (g) => (g.roamKills15 == null ? null : Number(g.roamKills15))),
      roamAssists15S: seriesOf(games, (g) => (g.roamAssists15 == null ? null : Number(g.roamAssists15))),
      roamKa15S: seriesOf(games, (g) => {
        if (g.roamKills15 == null && g.roamAssists15 == null) return null;
        return (Number(g.roamKills15) || 0) + (Number(g.roamAssists15) || 0);
      }),
      maxCsAdvantageS: seriesOf(games, (g) => (g.maxCsAdvantage == null ? null : Number(g.maxCsAdvantage))),
      maxLevelLeadS: seriesOf(games, (g) => (g.maxLevelLead == null ? null : Number(g.maxLevelLead))),
      laneVisionAdvS: seriesOf(games, (g) => (g.laneVisionAdv == null ? null : Number(g.laneVisionAdv))),
      laneGoldExpAdvS: seriesOf(games, (g) => (g.laneGoldExpAdv == null ? null : Number(g.laneGoldExpAdv))),
      earlyLaneGoldExpAdvS: seriesOf(games, (g) => (g.earlyLaneGoldExpAdv == null ? null : Number(g.earlyLaneGoldExpAdv))),
      laneMinions10S: seriesOf(games, (g) => (g.laneMinions10 == null ? null : Number(g.laneMinions10))),
      turretPlatesS: seriesOf(games, (g) => (g.turretPlates == null ? null : Number(g.turretPlates))),
      otherLaneKillsEarlyS: seriesOf(games, (g) => (g.otherLaneKillsEarly == null ? null : Number(g.otherLaneKillsEarly))),
      teleportTakedownsS: seriesOf(games, (g) => (g.teleportTakedowns == null ? null : Number(g.teleportTakedowns))),
      takedownsFirst25S: seriesOf(games, (g) => (g.takedownsFirst25 == null ? null : Number(g.takedownsFirst25))),
      laneEarlyS: seriesOf(games, (g) => Number(g.earlyScore)),
      laneMidS: seriesOf(games, (g) => Number(g.midScore)),
      laneLateS: seriesOf(games, (g) => Number(g.lateScore)),
      firstBloodS: seriesOf(games, (g) => (g.firstBlood ? 100 : 0)),
      objDpmS: seriesOf(games, (g) => Number(g.objDpm)),
      towerDpmS: seriesOf(games, (g) => Number(g.towerDpm)),
      turretTakedownsS: seriesOf(games, (g) => Number(g.turretTakedowns)),
      inhibTakedownsS: seriesOf(games, (g) => Number(g.inhibTakedowns)),
      objStolenS: seriesOf(games, (g) => Number(g.objStolen) || 0),
      dragonTakesS: seriesOf(games, (g) => (g.dragonTakes == null ? null : Number(g.dragonTakes))),
      baronTakesS: seriesOf(games, (g) => (g.baronTakes == null ? null : Number(g.baronTakes))),
      heraldTakesS: seriesOf(games, (g) => (g.heraldTakes == null ? null : Number(g.heraldTakes))),
      firstTowerS: seriesOf(games, (g) => (g.firstTower ? 100 : 0)),
      firstTowerKillS: seriesOf(games, (g) => (g.firstTowerKill ? 100 : 0)),
      firstDragonS: seriesOf(games, (g) => (g.firstDragon ? 100 : 0)),
      firstBaronS: seriesOf(games, (g) => (g.firstBaron ? 100 : 0)),
      nexusTakedownsS: seriesOf(games, (g) => Number(g.nexusTakedowns) || 0),
      objStolenAvgS: seriesOf(games, (g) => Number(g.objStolen) || 0),
      objStolenAssistsS: seriesOf(games, (g) => Number(g.objStolenAssists) || 0),
      epicTakesS: seriesOf(games, (g) => (g.epicTakes == null ? null : Number(g.epicTakes))),
      grubTakesS: seriesOf(games, (g) => (g.grubTakes == null ? null : Number(g.grubTakes))),
      atakhanTakesS: seriesOf(games, (g) => (g.atakhanTakes == null ? null : Number(g.atakhanTakes))),
      teamDragonKillsS: seriesOf(games, (g) => Number(g.teamDragonKills) || 0),
      teamBaronKillsS: seriesOf(games, (g) => Number(g.teamBaronKills) || 0),
      teamHeraldKillsS: seriesOf(games, (g) => Number(g.teamHeraldKills) || 0),
      epicMonsterStealsS: seriesOf(games, (g) => (g.epicMonsterSteals == null ? null : Number(g.epicMonsterSteals))),
      epicMonsterStolenWithoutSmiteS: seriesOf(games, (g) => (g.epicMonsterStolenWithoutSmite == null ? null : Number(g.epicMonsterStolenWithoutSmite))),
      epicMonsterKillsNearEnemyJunglerS: seriesOf(games, (g) => (g.epicMonsterKillsNearEnemyJungler == null ? null : Number(g.epicMonsterKillsNearEnemyJungler))),
      outerTurretExecutesBefore10S: seriesOf(games, (g) => (g.outerTurretExecutesBefore10 == null ? null : Number(g.outerTurretExecutesBefore10))),
      turretsTakenWithHeraldS: seriesOf(games, (g) => (g.turretsTakenWithHerald == null ? null : Number(g.turretsTakenWithHerald))),
      wardTakedownsBefore20S: seriesOf(games, (g) => (g.wardTakedownsBefore20 == null ? null : Number(g.wardTakedownsBefore20))),
      deathsS: seriesOf(games, (g) => Number(g.deaths)),
      tripleS: seriesOf(games, (g) => Number(g.tripleKills) || 0),
      quadraS: seriesOf(games, (g) => Number(g.quadraKills) || 0),
      pentaS: seriesOf(games, (g) => Number(g.pentaKills) || 0),
      uniqueChampsS: runningUnique(games, (g) => g.champion),
      uniqueRolesS: runningUnique(games, (g) => g.role),
      uniqueKeystonesS: runningUnique(games, (g) => g.runes?.keystone),
      uniquePrimariesS: runningUnique(games, (g) => g.runes?.primary),
      uniqueSecondariesS: runningUnique(games, (g) => g.runes?.sub),
      uniqueRunePagesS: runningUnique(games, (g) => {
        const r = g.runes;
        if (!r?.keystone && !r?.primary && !r?.sub) return '';
        return `${r.keystone || ''}-${r.primary || ''}-${r.sub || ''}`;
      }),
      uniqueSpellsS: runningUnique(games, spellKey),
      uniqueItemsS: runningUnique(games, (g) => (g.items || []).slice(0, 6).filter(Boolean).join('-')),
      uniqueBuildsS: runningUnique(games, (g) => (g.items || []).slice(0, 6).filter(Boolean).join('-')),
      uniqueFirstItemsS: runningUnique(games, (g) => {
        const path = g.buildPath || [];
        return path.find((id) => id) || (g.items || []).find((id) => id) || '';
      }),
      champVarietyS: runningUnique(games, (g) => g.champion).map((n, i) => (n / (i + 1)) * 10),
      mainChampShareS: seriesOf(games, (g) => (g.champion && g.champion === topChamp ? 100 : 0)),
      mainChampGamesS: seriesOf(games, (g) => (g.champion && g.champion === topChamp ? 1 : 0)),
      oneOffChampsS: runningUnique(games, (g) => g.champion),
      champsPlayed3PlusS: runningUnique(games, (g) => g.champion),
      mainRoleShareS: seriesOf(games, (g) => (g.role && g.role === topRole ? 100 : 0)),
      offRoleS: seriesOf(games, (g) => (g.role && topRole && g.role !== topRole ? 100 : 0)),
      offRoleGamesS: seriesOf(games, (g) => (g.role && topRole && g.role !== topRole ? 1 : 0)),
      mainKeystoneShareS: seriesOf(games, (g) => (g.runes?.keystone && String(g.runes.keystone) === String(topKeystone) ? 100 : 0)),
      mainPrimaryShareS: seriesOf(games, (g) => (g.runes?.primary && String(g.runes.primary) === String(topPrimary) ? 100 : 0)),
      mainSpellShareS: seriesOf(games, (g) => (spellKey(g) && spellKey(g) === topSpell ? 100 : 0)),
      mainBuildShareS: seriesOf(games, (g) => {
        const key = (g.items || []).slice(0, 6).filter(Boolean).join('-');
        return key && key === topBuild ? 100 : 0;
      }),
      damageShareS: seriesOf(games, (g) => (g.damageShare == null ? null : Number(g.damageShare) * 100)),
      goldShareS: seriesOf(games, (g) => (g.goldShare == null ? null : Number(g.goldShare) * 100)),
      visionShareS: seriesOf(games, (g) => (g.visionShare == null ? null : Number(g.visionShare) * 100)),
      objDamageShareS: seriesOf(games, (g) => (g.objDamageShare == null ? null : Number(g.objDamageShare) * 100)),
      assistsS: seriesOf(games, (g) => Number(g.assists ?? g.assistsAvg)),
      shieldPerMinS: seriesOf(games, (g) => Number(g.shieldPerMin)),
      killsAssistsS: seriesOf(games, (g) => Number(g.killsAssists ?? ((g.kills || 0) + (g.assists || 0)))),
      soloKillsS: seriesOf(games, (g) => (g.soloKills == null ? null : Number(g.soloKills))),
      soloDeathsS: seriesOf(games, (g) => (g.soloDeaths == null ? null : Number(g.soloDeaths))),
      soloKdS: seriesOf(games, (g) => {
        if (g.soloKills == null || g.soloDeaths == null) return null;
        return Number(g.soloKills) / Math.max(1, Number(g.soloDeaths));
      }),
      soloWinRateS: seriesOf(games, (g) => {
        if (g.soloKills == null || g.soloDeaths == null) return null;
        const tot = Number(g.soloKills) + Number(g.soloDeaths);
        return tot > 0 ? (Number(g.soloKills) / tot) * 100 : null;
      }),
      soloKillShareS: seriesOf(games, (g) => (g.soloKillShare == null ? null : Number(g.soloKillShare) * 100)),
      laneSoloKillsS: seriesOf(games, (g) => (g.laneSoloKills == null ? null : Number(g.laneSoloKills))),
      laneSoloDeathsS: seriesOf(games, (g) => (g.laneSoloDeaths == null ? null : Number(g.laneSoloDeaths))),
      quickSoloKillsS: seriesOf(games, (g) => (g.quickSoloKills == null ? null : Number(g.quickSoloKills))),
      skirmishKillsS: seriesOf(games, (g) => (g.skirmishKills == null ? null : Number(g.skirmishKills))),
      skirmishDeathsS: seriesOf(games, (g) => (g.skirmishDeaths == null ? null : Number(g.skirmishDeaths))),
      skirmishAssistsS: seriesOf(games, (g) => (g.skirmishAssists == null ? null : Number(g.skirmishAssists))),
      skirmishKdS: seriesOf(games, (g) => {
        if (g.skirmishKills == null || g.skirmishDeaths == null) return null;
        return Number(g.skirmishKills) / Math.max(1, Number(g.skirmishDeaths));
      }),
      skirmishWinRateS: seriesOf(games, (g) => {
        if (g.skirmishKills == null || g.skirmishDeaths == null) return null;
        const tot = Number(g.skirmishKills) + Number(g.skirmishDeaths);
        return tot > 0 ? (Number(g.skirmishKills) / tot) * 100 : null;
      }),
      skirmishKaS: seriesOf(games, (g) => {
        if (g.skirmishKills == null || g.skirmishAssists == null) return null;
        return Number(g.skirmishKills) + Number(g.skirmishAssists);
      }),
      skirmishTakesS: seriesOf(games, (g) => {
        if (g.skirmishKills == null || g.skirmishAssists == null) return null;
        return Number(g.skirmishKills) + Number(g.skirmishAssists);
      }),
      teamfightKillsS: seriesOf(games, (g) => (g.teamfightKills == null ? null : Number(g.teamfightKills))),
      teamfightDeathsS: seriesOf(games, (g) => (g.teamfightDeaths == null ? null : Number(g.teamfightDeaths))),
      teamfightAssistsS: seriesOf(games, (g) => (g.teamfightAssists == null ? null : Number(g.teamfightAssists))),
      teamfightKdS: seriesOf(games, (g) => {
        if (g.teamfightKills == null || g.teamfightDeaths == null) return null;
        return Number(g.teamfightKills) / Math.max(1, Number(g.teamfightDeaths));
      }),
      teamfightWinRateS: seriesOf(games, (g) => {
        if (g.teamfightKills == null || g.teamfightDeaths == null) return null;
        const tot = Number(g.teamfightKills) + Number(g.teamfightDeaths);
        return tot > 0 ? (Number(g.teamfightKills) / tot) * 100 : null;
      }),
      teamfightKaS: seriesOf(games, (g) => {
        if (g.teamfightKills == null || g.teamfightAssists == null) return null;
        return Number(g.teamfightKills) + Number(g.teamfightAssists);
      }),
      teamfightTakesS: seriesOf(games, (g) => {
        if (g.teamfightKills == null || g.teamfightAssists == null) return null;
        return Number(g.teamfightKills) + Number(g.teamfightAssists);
      }),
      largestMultiKillS: seriesOf(games, (g) => (g.largestMultiKill == null ? null : Number(g.largestMultiKill))),
      largestKillingSpreeS: seriesOf(games, (g) => (g.largestKillingSpree == null ? null : Number(g.largestKillingSpree))),
      multikillsS: seriesOf(games, (g) => (g.multikills == null ? null : Number(g.multikills))),
      outnumberedKillsS: seriesOf(games, (g) => (g.outnumberedKills == null ? null : Number(g.outnumberedKills))),
      skillshotsHitS: seriesOf(games, (g) => (g.skillshotsHit == null ? null : Number(g.skillshotsHit))),
      skillshotsDodgedS: seriesOf(games, (g) => (g.skillshotsDodged == null ? null : Number(g.skillshotsDodged))),
    };
  }, [games, t]);

  const liveTab = TABS.find((item) => item.id === tab);
  const waiting = loading && !profile;
  const kpPct = (stats.kp || 0) * 100;

  const catValues = {
    vision: { value: fmtNum(stats.vision, 1), unit: t('lens.visionMin'), halo: true },
    laning: { value: fmtSigned(stats.gold15, 0), unit: t('studio.gold15'), halo: true },
    survivability: { value: fmtNum(stats.deaths, 1), unit: t('lens.deaths'), halo: true },
    fighting: { value: fmtNum(stats.dpm, 0), unit: t('lens.dpm'), halo: true },
    objectives: { value: fmtNum(stats.objDpm, 0), unit: t('lens.objDpm'), halo: true },
    adaptability: { value: String(stats.uniqueChamps ?? '—'), unit: t('lens.uniqueChamps'), halo: true },
    impact: { value: fmtPct(kpPct), unit: t('lens.kp'), ring: kpPct, halo: false },
  };
  const compareTier = profile?.rankTier || rankTierKey(profile?.rank) || 'EMERALD';
  const cardCats = CARD_ORDER.map((id) => CATS.find((cat) => cat.id === id)).filter(Boolean);
  const avatar = profile ? (
    <img
      className="ln-cat-face"
      src={profileIconUrl(profile.profileIconId, ddVersion)}
      alt=""
      onError={(e) => { e.currentTarget.src = profileIconUrl(29, ddVersion); }}
    />
  ) : <span className="ln-cat-face is-empty" />;
  const compareRank = <RankMark tier={compareTier} />;

  return (
    <div className="ln-page">
      <header className="ln-head">
        <div className="ln-title">
          {profile ? (
            <img
              className="ln-avatar"
              src={profileIconUrl(profile.profileIconId, ddVersion)}
              alt=""
              onError={(e) => { e.currentTarget.src = profileIconUrl(29, ddVersion); }}
            />
          ) : null}
          <div>
            <span className="pm-kicker">{t('lens.kicker')}</span>
            <h1>{t('lens.title')}</h1>
            <p>{profile ? t('lens.accountNote', { id: profile.riotId, n: sample.games }) : t('lens.blurb')}</p>
          </div>
        </div>
        <div className="ln-meta">
          <div className="ln-roles">
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
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODE_KEYS.map((key) => <option key={key} value={key}>{MODE_LABEL[key]}</option>)}
          </select>
          {sample.games ? (
            <div className="ln-chips">
              <span><b>{sample.games}</b> {t('studio.gamesCol')}</span>
              <span><b>{fmtPct(sample.wr)}</b> WR</span>
            </div>
          ) : null}
        </div>
      </header>

      <div className="ln-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${tab === item.id ? 'is-on' : ''}${item.soon ? ' is-soon' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <span className="ln-tab-ico"><Ico name={item.icon} /></span>
            {t(item.labelKey)}
            {item.soon ? <span className="ln-lock"><IcoLock /></span> : null}
          </button>
        ))}
      </div>

      {!activeId ? (
        <div className="ln-empty">
          <p>{t('studio.needAccount')}</p>
          <Link className="pm-btn" to="/link-account">{t('chrome.linkAccount')}</Link>
        </div>
      ) : waiting ? (
        <p className="ln-muted">{t('common.loading')}</p>
      ) : error && !profile ? (
        <p className="ln-error">{error}</p>
      ) : liveTab?.soon ? (
        <div className="ln-empty">
          <span className="ln-lock-lg"><IcoLock /></span>
          <p>{t('lens.tabSoon')}</p>
        </div>
      ) : tab === 'fighting' ? (
        <FightingStage
          cats={FIGHTING_CATS}
          fightCat={fightCat}
          setFightCat={setFightCat}
          stats={stats}
          kpPct={kpPct}
          hint={hint}
          avatar={avatar}
          compareRank={compareRank}
          ladderSpec={ladderSpec}
          setLadderSpec={setLadderSpec}
          duelLadderSpec={duelLadderSpec}
          setDuelLadderSpec={setDuelLadderSpec}
          skirmishLadderSpec={skirmishLadderSpec}
          setSkirmishLadderSpec={setSkirmishLadderSpec}
          teamfightLadderSpec={teamfightLadderSpec}
          setTeamfightLadderSpec={setTeamfightLadderSpec}
          mechLadderSpec={mechLadderSpec}
          setMechLadderSpec={setMechLadderSpec}
          statLadder={statLadder}
          ladderLoading={ladderLoading}
          ladderRefreshing={ladderRefreshing}
          ladderMatches={ladderMatches}
          playerTier={compareTier}
          t={t}
        />
      ) : tab === 'laning' ? (
        <LaningStage
          cats={LANING_CATS}
          laneCat={laneCat}
          setLaneCat={setLaneCat}
          stats={stats}
          hint={hint}
          avatar={avatar}
          compareRank={compareRank}
          ladderSpec={laneLadderSpec}
          setLadderSpec={setLaneLadderSpec}
          statLadder={statLadder}
          ladderLoading={ladderLoading}
          ladderRefreshing={ladderRefreshing}
          ladderMatches={ladderMatches}
          playerTier={compareTier}
          t={t}
        />
      ) : tab === 'objectives' ? (
        <ObjectivesStage
          cats={OBJECTIVES_CATS}
          objCat={objCat}
          setObjCat={setObjCat}
          stats={stats}
          hint={hint}
          avatar={avatar}
          compareRank={compareRank}
          ladderSpec={objLadderSpec}
          setLadderSpec={setObjLadderSpec}
          statLadder={statLadder}
          ladderLoading={ladderLoading}
          ladderRefreshing={ladderRefreshing}
          ladderMatches={ladderMatches}
          playerTier={compareTier}
          t={t}
        />
      ) : tab === 'vision' ? (
        <VisionStage
          cats={VISION_CATS}
          visCat={visCat}
          setVisCat={setVisCat}
          stats={stats}
          hint={hint}
          avatar={avatar}
          compareRank={compareRank}
          ladderSpec={visLadderSpec}
          setLadderSpec={setVisLadderSpec}
          statLadder={statLadder}
          ladderLoading={ladderLoading}
          ladderRefreshing={ladderRefreshing}
          ladderMatches={ladderMatches}
          playerTier={compareTier}
          t={t}
        />
      ) : tab === 'survivability' ? (
        <SurviveStage
          cats={SURVIVE_CATS}
          survCat={survCat}
          setSurvCat={setSurvCat}
          stats={stats}
          hint={hint}
          avatar={avatar}
          compareRank={compareRank}
          ladderSpec={survLadderSpec}
          setLadderSpec={setSurvLadderSpec}
          statLadder={statLadder}
          ladderLoading={ladderLoading}
          ladderRefreshing={ladderRefreshing}
          ladderMatches={ladderMatches}
          playerTier={compareTier}
          t={t}
        />
      ) : tab === 'adaptability' ? (
        <AdaptStage
          cats={ADAPT_CATS}
          adaptCat={adaptCat}
          setAdaptCat={setAdaptCat}
          stats={stats}
          hint={hint}
          avatar={avatar}
          compareRank={compareRank}
          ladderSpec={adaptLadderSpec}
          setLadderSpec={setAdaptLadderSpec}
          statLadder={statLadder}
          ladderLoading={ladderLoading}
          ladderRefreshing={ladderRefreshing}
          ladderMatches={ladderMatches}
          playerTier={compareTier}
          t={t}
        />
      ) : tab === 'impact' ? (
        <ImpactStage
          cats={IMPACT_CATS}
          impactCat={impactCat}
          setImpactCat={setImpactCat}
          stats={stats}
          hint={hint}
          avatar={avatar}
          compareRank={compareRank}
          ladderSpec={impactLadderSpec}
          setLadderSpec={setImpactLadderSpec}
          statLadder={statLadder}
          ladderLoading={ladderLoading}
          ladderRefreshing={ladderRefreshing}
          ladderMatches={ladderMatches}
          playerTier={compareTier}
          t={t}
        />
      ) : (
        <div className="ln-stage">
          <div className="ln-cats">
            {cardCats.map((cat) => (
              <CatCard
                key={cat.id}
                cat={cat}
                t={t}
                selected={selected === cat.id}
                onSelect={setSelected}
                value={catValues[cat.id]?.value}
                unit={catValues[cat.id]?.unit}
                ring={catValues[cat.id]?.ring}
                halo={catValues[cat.id]?.halo}
                avatar={avatar}
                compareRank={compareRank}
              />
            ))}
          </div>
          <div className="ln-web-pane">
            <LensWeb
              cats={CATS}
              selected={selected}
              wr={sample.wr}
              games={sample.games}
              t={t}
              onSelect={setSelected}
            />
          </div>
        </div>
      )}
    </div>
  );
}
