import React, { useEffect, useMemo, useState, useRef } from 'react';
import DraftBuildCard from '../pages/DraftBuildCard';
import { SpellIcon, RuneIcon } from './GameIcons';
import { useI18n } from '../i18n/LocaleContext';
import { analyseEnemyComp } from '../lib/overlayItems';
import {
  champSplashUrl,
  orderScoutByLane,
  overallWinLine,
  scoutPlayerKey,
  SCOUT_LANES,
} from '../lib/liveScoutOrder';
import { typicalLane } from '../lib/champLane';
import { getDdragonVersion, champDdragonId } from '../services/ddragon';
import { rankImg } from '../lib/rankEmblem';
import { useLiveScoutGame } from '../lib/useLiveScoutGame';
import { buildScoutPlayerTags, scoutTagLabel } from '../lib/scoutPlayerTags';
import './ScoutOverlayPanel.css';

const SCOUT_PANEL_W = 1140;
const SCOUT_PANEL_H = 780;

function ScoutPreviewFit({ children }) {
  const shellRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return undefined;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / SCOUT_PANEL_W));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = Math.ceil(SCOUT_PANEL_H * scale);
  return (
    <div ref={shellRef} className="ov-scout-preview-fit" style={{ height }}>
      <div
        className="ov-scout-preview-inner"
        style={{
          width: SCOUT_PANEL_W,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function stopDrag(e) {
  e.stopPropagation();
}

export const PREVIEW_SCOUT_GAME = {
  queueName: 'Ranked Solo',
  blue: [
    { champion: 'Gnar', championName: 'Gnar', gameName: 'TopLaner', tagLine: 'EUW', role: 'Top', recentMainRole: 'Top', recentGames: 10, rank: 'Emerald II', lp: 34, wins: 120, losses: 118, champGames: 6, champWins: 4, champWr: 67, streak: 2, last3: [true, false, true], spell1Id: 12, spell2Id: 4, keystone: 8437, subStyle: 8400, teamId: 100, isSelf: false },
    { champion: 'LeeSin', championName: 'Lee Sin', gameName: 'JungleMain', tagLine: 'EUW', role: 'Jungle', recentMainRole: 'Jungle', recentGames: 10, rank: 'Platinum I', lp: 78, wins: 89, losses: 82, champGames: 8, champWins: 5, champWr: 63, streak: 4, last3: [true, true, true], spell1Id: 11, spell2Id: 4, keystone: 8010, subStyle: 8300, teamId: 100, isSelf: false },
    { champion: 'Ahri', championName: 'Ahri', gameName: 'MidGap', tagLine: 'EUW', role: 'Mid', recentMainRole: 'Mid', recentGames: 10, rank: 'Emerald IV', lp: 12, wins: 64, losses: 61, champGames: 1, champWins: 0, champWr: 0, streak: -1, last3: [false, true, true], spell1Id: 4, spell2Id: 14, keystone: 8112, subStyle: 8200, teamId: 100, isSelf: false },
    { champion: 'Jinx', championName: 'Jinx', gameName: 'You', tagLine: 'EUW', role: 'ADC', recentMainRole: 'ADC', recentGames: 10, rank: 'Emerald III', lp: 45, wins: 95, losses: 90, champGames: 5, champWins: 3, champWr: 60, streak: 1, last3: [true, false, false], spell1Id: 4, spell2Id: 21, keystone: 8008, subStyle: 8300, teamId: 100, isSelf: true },
    { champion: 'Thresh', championName: 'Thresh', gameName: 'HookGod', tagLine: 'EUW', role: 'Support', recentMainRole: 'Support', recentGames: 10, rank: 'Diamond IV', lp: 22, wins: 140, losses: 132, champGames: 7, champWins: 4, champWr: 57, streak: 3, last3: [true, true, true], spell1Id: 4, spell2Id: 3, keystone: 8439, subStyle: 8300, teamId: 100, isSelf: false },
  ],
  red: [
    { champion: 'Darius', championName: 'Darius', gameName: 'RedTop', tagLine: 'EUW', role: 'Top', recentMainRole: 'Top', recentGames: 10, rank: 'Emerald I', lp: 67, wins: 102, losses: 98, champGames: 4, champWins: 1, champWr: 25, streak: -4, last3: [false, false, false], dodge: true, spell1Id: 6, spell2Id: 4, keystone: 8010, subStyle: 8400, teamId: 200, isSelf: false },
    { champion: 'Graves', championName: 'Graves', gameName: 'RedJg', tagLine: 'EUW', role: 'Jungle', recentMainRole: 'ADC', recentGames: 10, rank: 'Platinum II', lp: 55, wins: 77, losses: 74, champGames: 3, champWins: 2, champWr: 67, streak: 1, last3: [true, false, true], spell1Id: 11, spell2Id: 4, keystone: 8010, subStyle: 8300, teamId: 200, isSelf: false },
    { champion: 'Syndra', championName: 'Syndra', gameName: 'RedMid', tagLine: 'EUW', role: 'Mid', recentMainRole: 'Mid', recentGames: 10, rank: 'Emerald III', lp: 18, wins: 68, losses: 66, champGames: 6, champWins: 4, champWr: 67, streak: 2, last3: [true, true, false], spell1Id: 4, spell2Id: 12, keystone: 8112, subStyle: 8200, teamId: 200, isSelf: false },
    { champion: 'MissFortune', championName: 'Miss Fortune', gameName: 'RedAdc', tagLine: 'EUW', role: 'ADC', recentMainRole: 'ADC', recentGames: 10, rank: 'Gold I', lp: 90, wins: 55, losses: 52, champGames: 1, champWins: 0, champWr: 0, streak: 0, last3: [false, false, true], spell1Id: 4, spell2Id: 21, keystone: 8008, subStyle: 8300, teamId: 200, isSelf: false },
    { champion: 'Leona', championName: 'Leona', gameName: 'RedSup', tagLine: 'EUW', role: 'Support', recentMainRole: 'Support', recentGames: 10, rank: 'Emerald IV', lp: 8, wins: 91, losses: 88, champGames: 5, champWins: 3, champWr: 60, streak: 2, last3: [true, false, true], spell1Id: 4, spell2Id: 14, keystone: 8439, subStyle: 8300, teamId: 200, isSelf: false },
  ],
};

function rankLine(player, t) {
  if (player.rankUnknown) return t('live.rankUnknown');
  if (!player.rank || player.rank === 'Unranked') return t('live.unranked');
  const lp = player.lp != null ? `${player.lp} LP` : '';
  return lp ? `${player.rank} · ${lp}` : player.rank;
}

function tagLabel(tag, t) {
  const key = `overlays.tag.${tag}`;
  const translated = t(key);
  return translated === key ? tag : translated;
}

function enemyCompTags(enemies, champMeta) {
  const analysis = analyseEnemyComp(
    (enemies || []).filter(Boolean).map((p) => ({ champion: p.champion || p.championName })),
    champMeta,
  );
  const n = analysis?.needs || {};
  const tags = [];
  if (n.vsCc >= 1) tags.push('vsCc');
  if (n.vsAssassin >= 0.9) tags.push('vsAssassin');
  if (n.vsDive >= 1) tags.push('vsDive');
  if (n.vsTanks >= 1.2) tags.push('vsTanks');
  if (n.vsHeal >= 0.8) tags.push('vsHeal');
  if (n.vsPoke >= 0.9) tags.push('vsPoke');
  if (n.vsAp >= 1.1 && n.vsAd >= 1.1) tags.push('vsMixed');
  else if (n.vsAp >= 1.1) tags.push('vsAp');
  else if (n.vsAd >= 1.1) tags.push('vsAd');
  return [...new Set(tags)].slice(0, 6);
}

function ScoutMiniCard({ player, selected, onSelect, t }) {
  if (!player) return <div className="ov-scout-card is-empty" />;
  const record = overallWinLine(player);
  const tags = buildScoutPlayerTags(player);
  const onChamp = player.champGames > 0
    ? `${player.champWr != null ? `${Math.round(player.champWr)}%` : ''}${player.champWr != null ? ' · ' : ''}${player.champWins}W`
    : '';
  return (
    <button
      type="button"
      className={`ov-scout-card${selected ? ' is-on' : ''}${player.isSelf ? ' is-self' : ''}`}
      onClick={() => onSelect?.(player)}
    >
      <img className="ov-scout-splash" src={champSplashUrl(player.champion)} alt="" />
      <div className="ov-scout-card-fade" />
      <div className="ov-scout-card-head">
        <div className="ov-scout-card-champ">{player.championName || player.champion}</div>
        {onChamp ? <div className="ov-scout-card-champwr">{onChamp}</div> : null}
        {(player.last3 || []).length > 0 ? (
          <div className="ov-scout-card-last3">
            {player.last3.slice(0, 3).map((win, i) => (
              <span key={i} className={win ? 'is-w' : 'is-l'}>{win ? 'W' : 'L'}</span>
            ))}
          </div>
        ) : null}
        {player.streak >= 3 || player.streak <= -3 ? (
          <div className={`ov-scout-card-streak${player.streak > 0 ? ' is-hot' : ' is-cold'}`}>
            {Math.abs(player.streak)}
          </div>
        ) : null}
      </div>
      <div className="ov-scout-card-bottom">
        <div className="ov-scout-card-name">{player.gameName || player.championName}</div>
        <div className="ov-scout-card-meta">{record || rankLine(player, t)}</div>
        <div className="ov-scout-card-icons">
          <SpellIcon id={player.spell1Id} size={20} />
          <SpellIcon id={player.spell2Id} size={20} />
          {player.keystone ? <RuneIcon id={player.keystone} size={18} /> : null}
        </div>
        {tags.length ? (
          <div className="ov-scout-card-tags">
            {tags.map((tag) => (
              <span key={tag.id} className={`ov-scout-ptag is-${tag.tone}`}>
                {scoutTagLabel(tag, t)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function ScoutTeamGrid({ players, red, selectedId, onSelect, t }) {
  const ordered = orderScoutByLane(players, typicalLane);
  return (
    <div className={`ov-scout-team${red ? ' is-red' : ''}`}>
      <p className={`ov-scout-team-label${red ? ' is-red' : ''}`}>
        {red ? t('overlays.scout.red') : t('overlays.scout.blue')}
      </p>
      <div className="ov-scout-grid">
        {ordered.map((p, i) => (
          <ScoutMiniCard
            key={p ? scoutPlayerKey(p, i) : SCOUT_LANES[i]}
            player={p}
            selected={p && scoutPlayerKey(p, i) === selectedId}
            onSelect={onSelect}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function ScoutBuildSidebar({ player, enemyTeam, champMeta, t }) {
  const [kit, setKit] = useState(null);

  useEffect(() => {
    if (!player?.champion) {
      setKit(null);
      return undefined;
    }
    let alive = true;
    const id = champDdragonId(player.champion);
    getDdragonVersion()
      .then((ver) => fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion/${id}.json`)
        .then((r) => r.json())
        .then((json) => {
          if (!alive) return null;
          const data = json?.data?.[id];
          return data ? { version: ver, spells: data.spells || [], id } : null;
        }))
      .then((next) => { if (alive) setKit(next); })
      .catch(() => { if (alive) setKit(null); });
    return () => { alive = false; };
  }, [player?.champion]);

  const tags = useMemo(
    () => enemyCompTags(enemyTeam, champMeta),
    [enemyTeam, champMeta],
  );

  if (!player) {
    return <div className="ov-scout-empty">{t('overlays.scout.pickPlayer')}</div>;
  }

  const emblem = rankImg(player.rank);

  return (
    <div className="ov-scout-side">
      <h3 className="ov-scout-side-head">
        {player.championName || player.champion}
        {player.role ? ` · ${player.role}` : ''}
      </h3>
      <div className="ov-scout-card-meta" style={{ marginBottom: 8 }}>
        {emblem ? <img src={emblem} alt="" style={{ width: 16, height: 16, verticalAlign: 'middle', marginRight: 4 }} /> : null}
        {rankLine(player, t)}
      </div>
      <div className="ov-scout-build">
        <DraftBuildCard
          champion={player.champion}
          role={player.role || typicalLane(player.champion) || 'Mid'}
          kit={kit}
        />
      </div>
      {tags.length ? (
        <div className="ov-scout-tags">
          {tags.map((tag) => (
            <span key={tag} className="ov-scout-tag">{tagLabel(tag, t)}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ScoutOverlayPanel({
  preview = false,
  expanded = true,
  editing = false,
  onCollapse,
  onToggle,
  onDismiss,
  dragProps,
  game: gameOverride,
}) {
  const { t } = useI18n();
  const live = useLiveScoutGame(!preview && expanded);
  const game = preview ? gameOverride || PREVIEW_SCOUT_GAME : live.game;
  const [selected, setSelected] = useState(null);
  const [champMeta, setChampMeta] = useState({ map: {}, names: {} });

  useEffect(() => {
    getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`))
      .then((r) => r.json())
      .then((json) => {
        const map = {};
        const names = {};
        Object.entries(json?.data || {}).forEach(([id, row]) => {
          map[String(row.key)] = id;
          names[id] = row.name;
        });
        setChampMeta({ map, names });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!game) {
      setSelected(null);
      return;
    }
    const all = [...(game.blue || []), ...(game.red || [])];
    const you = all.find((p) => p.isSelf);
    setSelected((cur) => {
      if (cur) {
        const key = scoutPlayerKey(cur);
        const still = all.find((p) => scoutPlayerKey(p) === key);
        if (still) return still;
      }
      return you || game.blue?.[0] || game.red?.[0] || null;
    });
  }, [game?.gameId]);

  if (!expanded) {
    return (
      <button
        type="button"
        className={`ov-scout-chip${editing ? ' is-edit' : ''}`}
        onClick={() => onToggle?.()}
        {...dragProps}
      >
        {t('overlays.scoutTitle')}
      </button>
    );
  }

  const selectedKey = selected ? scoutPlayerKey(selected) : '';
  const you = [...(game?.blue || []), ...(game?.red || [])].find((p) => p.isSelf);
  const enemyForTags = you?.teamId === 100 ? (game?.red || []) : (game?.blue || []);

  const panel = (
    <div
      className={`ov-scout-panel${editing ? ' is-edit' : ''}${preview ? ' is-preview' : ''}`}
      {...dragProps}
    >
      <header className="ov-scout-head">
        <strong>{t('overlays.scoutTitle')}</strong>
        <div className="ov-scout-head-actions">
          {game?.queueName ? <span style={{ fontSize: 10, opacity: 0.7 }}>{game.queueName}</span> : null}
          {!preview && live.enriching ? (
            <span className="ov-scout-hotkey">{t('overlays.scout.updating')}</span>
          ) : null}
          {!preview ? <span className="ov-scout-hotkey">{t('overlays.scout.hotkey')}</span> : null}
          {onCollapse ? (
            <button type="button" className="ov-close" onPointerDown={stopDrag} onClick={onCollapse}>−</button>
          ) : null}
          {onDismiss ? (
            <button type="button" className="ov-close" onPointerDown={stopDrag} onClick={onDismiss} aria-label="Close">×</button>
          ) : null}
        </div>
      </header>
      {!game ? (
        <div className="ov-scout-wait">
          {live.loading ? t('overlays.scout.loading') : t('overlays.scout.noGame')}
        </div>
      ) : (
        <div className="ov-scout-body">
          <div className="ov-scout-grid-wrap">
            <ScoutTeamGrid
              players={game.blue || []}
              selectedId={selectedKey}
              onSelect={setSelected}
              t={t}
            />
            <ScoutTeamGrid
              players={game.red || []}
              red
              selectedId={selectedKey}
              onSelect={setSelected}
              t={t}
            />
          </div>
          <ScoutBuildSidebar
            player={selected}
            enemyTeam={enemyForTags}
            champMeta={champMeta}
            t={t}
          />
        </div>
      )}
    </div>
  );

  if (preview) return <ScoutPreviewFit>{panel}</ScoutPreviewFit>;
  return panel;
}
