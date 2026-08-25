import React, { useEffect, useMemo, useState } from 'react';
import { getMatchTimeline } from '../api';
import {
  champIconUrl,
  getChampionKit,
  itemIconUrl,
  pingIconUrl,
  runeIconUrl,
  spellIconUrl,
  summonerIconUrl,
} from '../lib';

function fmtSigned(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Math.round(Number(v));
  return `${n >= 0 ? '+' : ''}${n}`;
}

function fmtDmg(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(Math.round(v));
}

function fmtMin(ms) {
  if (ms == null) return '';
  const m = Math.floor(Number(ms) / 60000);
  return m <= 0 ? 'Starter' : `${m} min`;
}

function ChampImg({ name, size = 36, version, className = '' }) {
  if (!name) return <span className={`wd-champ-empty ${className}`} style={{ width: size, height: size }} />;
  return (
    <img
      src={champIconUrl(name, version)}
      alt={name}
      title={name}
      width={size}
      height={size}
      className={`wd-champ ${className}`}
      onError={(e) => { e.currentTarget.src = champIconUrl('Aatrox', version); }}
    />
  );
}

function ItemCell({ id, version, sold }) {
  if (!id) return <span className="wd-item-empty" />;
  return (
    <span className={`wd-item-wrap${sold ? ' is-sold' : ''}`}>
      <img src={itemIconUrl(id, version)} alt="" />
    </span>
  );
}

function PlayerRow({ p, version, runeIndex, maxDamage }) {
  const items = [...(p.items || [])];
  while (items.length < 7) items.push(0);
  const dmgPct = maxDamage ? Math.max(6, Math.round((p.damage / maxDamage) * 100)) : 0;
  return (
    <div className={`wd-sb-row${p.isSelf ? ' is-self' : ''}${p.win ? ' is-win' : ' is-loss'}`}>
      <span className={`wd-sb-badge badge-${String(p.badge || '').toLowerCase()}`}>{p.badge}</span>
      <div className="wd-sb-id">
        <ChampImg name={p.champion} size={36} version={version} />
        {p.champLevel ? <em>{p.champLevel}</em> : null}
        <div>
          <strong>{p.gameName || p.champion}</strong>
          <span>{p.role || '—'}</span>
        </div>
      </div>
      <div className="wd-sb-icons">
        <div>
          {(p.spells || []).slice(0, 2).map((id, i) => (
            <img key={`s-${i}`} src={summonerIconUrl(id, version)} alt="" />
          ))}
        </div>
        <div>
          {p.runes?.keystone ? <img src={runeIconUrl(p.runes.keystone, runeIndex)} alt="" /> : null}
          {p.runes?.sub ? <img src={runeIconUrl(p.runes.sub, runeIndex)} alt="" /> : null}
        </div>
      </div>
      <div className="wd-sb-items">
        {items.map((id, i) => <ItemCell key={`${id}-${i}`} id={id} version={version} />)}
      </div>
      <div className="wd-sb-kda">
        <strong>{p.kills} / {p.deaths} / {p.assists}</strong>
        <span>{p.kpPct}% KP · {p.csPerMin} CS/m</span>
      </div>
      <div className="wd-sb-dmg">
        <div className="wd-sb-dmg-bar" style={{ width: `${dmgPct}%` }} />
        <span>{fmtDmg(p.damage)} <small>({p.dpm}/m)</small></span>
      </div>
      <div className={`wd-sb-score score-${p.gdScore >= 70 ? 'hi' : p.gdScore >= 50 ? 'mid' : 'lo'}`}>
        {p.gdScore}
      </div>
    </div>
  );
}

function TeamBlock({ label, win, players, obj, version, runeIndex, maxDamage }) {
  return (
    <div className={`wd-sb-team ${win ? 'is-win' : 'is-loss'}`}>
      <div className="wd-sb-team-head">
        <strong className={win ? 'win' : 'loss'}>{label}</strong>
        <div className="wd-sb-obj">
          <span title="Towers">Towers {obj?.tower ?? 0}</span>
          <span title="Dragons">Dragons {obj?.dragon ?? 0}</span>
          <span title="Barons">Barons {obj?.baron ?? 0}</span>
          <span title="Heralds">Heralds {obj?.herald ?? 0}</span>
          <span title="Grubs">Grubs {obj?.grub ?? 0}</span>
        </div>
      </div>
      {players.map((p) => (
        <PlayerRow
          key={p.puuid || p.riotId || p.champion}
          p={p}
          version={version}
          runeIndex={runeIndex}
          maxDamage={maxDamage}
        />
      ))}
    </div>
  );
}

function GeneralTab({ game, version, runeIndex }) {
  const board = game.scoreboard || {};
  const blue = board.blue || [];
  const red = board.red || [];
  const maxDamage = Math.max(1, ...(board.players || []).map((p) => p.damage || 0));
  const selfTeamWin = game.win;
  // Show self's team first
  const selfOnBlue = blue.some((p) => p.isSelf);
  const first = selfOnBlue
    ? { label: selfTeamWin ? 'Victory' : 'Defeat', win: selfTeamWin, players: blue, obj: board.blueObj }
    : { label: selfTeamWin ? 'Victory' : 'Defeat', win: selfTeamWin, players: red, obj: board.redObj };
  const second = selfOnBlue
    ? { label: selfTeamWin ? 'Defeat' : 'Victory', win: !selfTeamWin, players: red, obj: board.redObj }
    : { label: selfTeamWin ? 'Defeat' : 'Victory', win: !selfTeamWin, players: blue, obj: board.blueObj };

  if (!blue.length && !red.length) {
    return <p className="muted">Scoreboard unavailable for this match.</p>;
  }

  return (
    <div className="wd-general">
      <TeamBlock {...first} version={version} runeIndex={runeIndex} maxDamage={maxDamage} />
      <TeamBlock {...second} version={version} runeIndex={runeIndex} maxDamage={maxDamage} />
    </div>
  );
}

function DetailsTab({ game, version }) {
  const board = game.scoreboard || {};
  const players = board.players || [];
  const purchases = (game.buildPurchases || []).slice(0, 16);
  const skills = game.skillOrder || [];
  const casts = game.spellCasts || {};
  const pings = game.pings || {};
  const [dSpell, fSpell] = game.spells || [];
  const [kit, setKit] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setKit(null);
    if (!game.champion || !version) return undefined;
    getChampionKit(game.champion, version).then((data) => {
      if (!cancelled) setKit(data);
    });
    return () => { cancelled = true; };
  }, [game.champion, version]);

  const abilityIcons = useMemo(() => {
    const spells = kit?.spells || [];
    return {
      Q: spells[0]?.image?.full ? spellIconUrl(spells[0].image.full, version) : '',
      W: spells[1]?.image?.full ? spellIconUrl(spells[1].image.full, version) : '',
      E: spells[2]?.image?.full ? spellIconUrl(spells[2].image.full, version) : '',
      R: spells[3]?.image?.full ? spellIconUrl(spells[3].image.full, version) : '',
    };
  }, [kit, version]);

  const buildGroups = useMemo(() => {
    if (!purchases.length) return [];
    const groups = [];
    let cur = null;
    purchases.forEach((buy) => {
      const label = fmtMin(buy.atMs);
      if (!cur || cur.label !== label) {
        cur = { label, items: [] };
        groups.push(cur);
      }
      cur.items.push(buy);
    });
    return groups;
  }, [purchases]);

  const skillGrid = useMemo(() => {
    const rows = { 1: [], 2: [], 3: [], 4: [] };
    skills.forEach((slot, i) => {
      const level = i + 1;
      [1, 2, 3, 4].forEach((s) => {
        rows[s].push(s === slot ? level : null);
      });
    });
    return rows;
  }, [skills]);

  return (
    <div className="wd-details">
      <div className="wd-details-comps">
        {(board.blue || players.filter((p) => p.teamId === 100)).map((p) => (
          <div key={`b-${p.puuid}`} className={p.isSelf ? 'is-self' : ''}>
            <ChampImg name={p.champion} size={44} version={version} />
            <span>{p.roleKey?.[0] || '?'}</span>
          </div>
        ))}
        <strong>VS</strong>
        {(board.red || players.filter((p) => p.teamId === 200)).map((p) => (
          <div key={`r-${p.puuid}`} className={p.isSelf ? 'is-self' : ''}>
            <ChampImg name={p.champion} size={44} version={version} />
            <span>{p.roleKey?.[0] || '?'}</span>
          </div>
        ))}
      </div>

      <div className="wd-details-stats">
        <article>
          <h4>Laning Phase (at 15)</h4>
          <div><span>cs diff</span><strong>{fmtSigned(game.csDiff15)}</strong></div>
          <div><span>gold diff</span><strong>{fmtSigned(game.goldDiff15)}</strong></div>
          <div><span>xp diff</span><strong>{fmtSigned(game.xpDiff15)}</strong></div>
          <div><span>k+a diff</span><strong>{fmtSigned(game.kaDiff15)}</strong></div>
        </article>
        <article>
          <h4>Wards</h4>
          <div><span>placed</span><strong>{game.wardsPlaced ?? '—'}</strong></div>
          <div><span>killed</span><strong>{game.wardsKilled ?? '—'}</strong></div>
          <div><span>control</span><strong>{game.controlWards ?? '—'}</strong></div>
        </article>
        <article>
          <h4>Global Stats</h4>
          <div><span>CS/m</span><strong>{game.csPerMin ?? '—'}</strong></div>
          <div><span>VS/m</span><strong>{game.visionPerMin ?? '—'}</strong></div>
          <div><span>DMG/m</span><strong>{game.dpm ?? '—'}</strong></div>
          <div><span>Gold/m</span><strong>{game.gpm ?? '—'}</strong></div>
        </article>
      </div>

      <article className="wd-build-card">
        <h4>Build Order</h4>
        {buildGroups.length ? (
          <div className="wd-build-flow">
            {buildGroups.map((g, gi) => (
              <React.Fragment key={`${g.label}-${gi}`}>
                {gi > 0 ? <span className="wd-build-arrow">›</span> : null}
                <div className="wd-build-step">
                  <div className="wd-build-items">
                    {g.items.map((buy, i) => (
                      <ItemCell key={`${buy.id}-${i}`} id={buy.id} version={version} sold={buy.sold} />
                    ))}
                  </div>
                  <span>{g.label}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="muted">Build timeline unavailable (no match timeline).</p>
        )}
      </article>

      <article className="wd-skill-card">
        <h4>Skill Order</h4>
        {skills.length ? (
          <div className="wd-skill-grid">
            {[
              { slot: 1, key: 'Q', color: 'q' },
              { slot: 2, key: 'W', color: 'w' },
              { slot: 3, key: 'E', color: 'e' },
              { slot: 4, key: 'R', color: 'r' },
            ].map((row) => (
              <div key={row.key} className="wd-skill-row">
                <span className={`wd-skill-key is-${row.color}`}>
                  {abilityIcons[row.key] ? (
                    <img src={abilityIcons[row.key]} alt={row.key} title={row.key} />
                  ) : row.key}
                </span>
                {(skillGrid[row.slot] || []).map((lvl, i) => (
                  <span key={i} className={`wd-skill-cell${lvl ? ` is-${row.color}` : ''}`}>
                    {lvl || ''}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Skill order unavailable.</p>
        )}
      </article>

      <div className="wd-details-bottom">
        <article>
          <h4>Spell Casted</h4>
          <div className="wd-cast-row">
            {[
              { key: 'Q', count: casts.q, icon: abilityIcons.Q },
              { key: 'W', count: casts.w, icon: abilityIcons.W },
              { key: 'E', count: casts.e, icon: abilityIcons.E },
              { key: 'R', count: casts.r, icon: abilityIcons.R },
              { key: 'D', count: casts.d, icon: dSpell ? summonerIconUrl(dSpell, version) : '' },
              { key: 'F', count: casts.f, icon: fSpell ? summonerIconUrl(fSpell, version) : '' },
            ].map((row) => (
              <div key={row.key} title={row.key}>
                {row.icon ? (
                  <img className="wd-cast-icon" src={row.icon} alt={row.key} />
                ) : (
                  <span>{row.key}</span>
                )}
                <strong>{row.count ?? 0}</strong>
              </div>
            ))}
          </div>
        </article>
        <article>
          <h4>Pings</h4>
          <div className="wd-cast-row">
            {[
              { key: 'Assist', ping: 'assist', count: pings.assist },
              { key: 'OMW', ping: 'onMyWay', count: pings.onMyWay },
              { key: 'Missing', ping: 'missing', count: pings.missing },
              { key: 'Vision', ping: 'needVision', count: pings.needVision },
              { key: 'Enemy Vis', ping: 'enemyVision', count: pings.enemyVision },
              { key: 'All-In', ping: 'allIn', count: pings.allIn },
            ].map((row) => (
              <div key={row.key} title={row.key}>
                <img className="wd-cast-icon is-ping" src={pingIconUrl(row.ping)} alt={row.key} />
                <strong>{row.count ?? 0}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

function RunesTab({ game, version, runeIndex }) {
  const board = game.scoreboard || {};
  const blue = board.blue || [];
  const red = board.red || [];
  const Row = ({ players }) => (
    <div className="wd-runes-row">
      {players.map((p) => (
        <div key={p.puuid || p.champion} className={`wd-runes-col${p.isSelf ? ' is-self' : ''}`}>
          <ChampImg name={p.champion} size={40} version={version} />
          {p.runes?.keystone ? (
            <img className="wd-rune-key" src={runeIconUrl(p.runes.keystone, runeIndex)} alt="" />
          ) : <span className="wd-rune-empty" />}
          <div className="wd-rune-line">
            {(p.runes?.primaryPerks || []).slice(1, 4).map((id) => (
              <img key={id} src={runeIconUrl(id, runeIndex)} alt="" />
            ))}
          </div>
          <div className="wd-rune-line">
            {(p.runes?.subPerks || []).map((id) => (
              <img key={id} src={runeIconUrl(id, runeIndex)} alt="" />
            ))}
          </div>
          <div className="wd-rune-shards">
            {(p.runes?.shards || []).map((id) => (
              <img key={id} src={runeIconUrl(id, runeIndex)} alt="" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (!blue.length && !red.length) {
    return <p className="muted">Rune pages unavailable.</p>;
  }

  return (
    <div className="wd-runes-tab">
      <Row players={blue} />
      <Row players={red} />
    </div>
  );
}

export default function MatchExpand({ game, version, runeIndex, puuid, onHydrated }) {
  const [tab, setTab] = useState('general');
  const [liveGame, setLiveGame] = useState(game);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineError, setTimelineError] = useState('');

  useEffect(() => {
    setLiveGame(game);
    setTimelineError('');
  }, [game]);

  useEffect(() => {
    const needsTimeline = !liveGame?.hasTimeline
      || !(liveGame.buildPurchases || []).length
      || !(liveGame.skillOrder || []).length
      || liveGame.goldDiff15 == null;
    if (!needsTimeline || !liveGame?.matchId || !puuid) return undefined;
    let cancelled = false;
    setTimelineBusy(true);
    setTimelineError('');
    getMatchTimeline({
      matchId: liveGame.matchId,
      region: liveGame.matchRegion || 'europe',
      puuid,
    }).then((extra) => {
      if (cancelled) return;
      const next = {
        ...liveGame,
        ...extra,
        hasTimeline: true,
      };
      setLiveGame(next);
      onHydrated?.(next);
    }).catch((err) => {
      if (!cancelled) setTimelineError(err.message || 'Could not load match timeline.');
    }).finally(() => {
      if (!cancelled) setTimelineBusy(false);
    });
    return () => { cancelled = true; };
    // Only re-fetch when expanding a different match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveGame?.matchId, puuid]);

  return (
    <div className="wd-expand">
      <div className="wd-expand-tabs">
        {[
          { id: 'general', label: 'General' },
          { id: 'details', label: 'Details' },
          { id: 'runes', label: 'Runes' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'is-on' : ''}
            onClick={(e) => { e.stopPropagation(); setTab(t.id); }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {timelineBusy ? (
        <div className="wd-expand-loading muted">Loading build, skills, and laning timeline…</div>
      ) : null}
      {timelineError ? (
        <div className="wd-expand-loading is-error">{timelineError}</div>
      ) : null}
      <div className="wd-expand-body" onClick={(e) => e.stopPropagation()}>
        {tab === 'general' ? (
          <GeneralTab game={liveGame} version={version} runeIndex={runeIndex} />
        ) : null}
        {tab === 'details' ? (
          <DetailsTab game={liveGame} version={version} />
        ) : null}
        {tab === 'runes' ? (
          <RunesTab game={liveGame} version={version} runeIndex={runeIndex} />
        ) : null}
      </div>
    </div>
  );
}
