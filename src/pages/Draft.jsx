import React, { useEffect, useMemo, useState } from 'react';
import { ItemIcon, ChampionIcon, ChampionPortrait, RuneIcon, SpellIcon } from '../components/GameIcons';
import RoleIcon from '../components/RoleIcon';
import {
  adviseDraft,
  adviseBans,
  catalogFromIndex,
  compareSketch,
  draftLean,
  duoLink,
  isBanPhase,
  matchupGrade,
  padSeats,
  runePagesFor,
  DUO_ROLE,
} from '../lib/draftAdvice';
import { typicalLane } from '../lib/champLane';
import { refreshRunePages } from '../lib/runePages';
import { getDdragonVersion, useRuneTrees, useRuneIndex, champLoadingUrl, useItemNameIndex, useItemCatalog } from '../services/ddragon';
import { getDraftPool } from '../services/riotApi';
import { coreItemNames, buildItemNames, resolveItemId, keystoneId, timeAgo, treeId, itemsForKeystone, fetchProbuilds } from '../lib/probuilds';
import { useSession } from '../state/SessionContext';
import { useI18n } from '../i18n/LocaleContext';
import DraftBuildCard, { SkillPriority, useMetaBuilds } from './DraftBuildCard';
import './Draft.css';

const ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const POS_FROM_LCU = { Top: 'Top', Jungle: 'Jungle', Mid: 'Mid', ADC: 'ADC', Support: 'Support' };
const champSplash = (key) =>
  key ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${key}_0.jpg` : '';

function RecArt({ champKey, featured }) {
  const splash = champSplash(champKey);
  const loading = champKey ? champLoadingUrl(champKey) : '';
  const preferred = featured ? (splash || loading) : (loading || splash);
  const fallback = featured ? loading : splash;
  const [src, setSrc] = useState(preferred);
  useEffect(() => {
    setSrc(preferred);
  }, [preferred]);
  if (!src) return <span className="dr-rec-splash is-empty" />;
  return (
    <img
      className="dr-rec-splash"
      src={src}
      alt=""
      onError={() => {
        if (fallback && src !== fallback) setSrc(fallback);
      }}
    />
  );
}

function kitMix(info) {
  const ad = Number(info?.attack) || 0;
  const ap = Number(info?.magic) || 0;
  const sum = ad + ap;
  if (sum <= 0) return null;
  return { ad: Math.round((ad / sum) * 100), ap: Math.round((ap / sum) * 100) };
}
const COMP_ROWS = [
  ['early', 'draft.early'],
  ['mid', 'draft.mid'],
  ['late', 'draft.late'],
  ['taken', 'draft.taken'],
  ['dealt', 'draft.dealt'],
];

function phaseLabel(phase) {
  const p = String(phase || '').toUpperCase();
  if (p.includes('BAN')) return 'Bans';
  if (p.includes('FINAL')) return 'Lock in';
  if (p.includes('GAME')) return 'Game starting';
  if (p.includes('PLAN')) return 'Planning';
  if (p.includes('IN_GAME') || p.includes('INPROGRESS')) return 'In game';
  return 'Pick';
}

function enrichSeat(seat, catalog) {
  if (!seat) return seat;
  const meta = catalog.find((c) => (
    c.id === seat.shownId
    || c.id === seat.championId
    || c.key === seat.name
  ));
  return {
    ...seat,
    name: seat.name || meta?.key || null,
    displayName: seat.displayName || meta?.name || null,
    tags: (seat.tags && seat.tags.length) ? seat.tags : (meta?.tags || []),
    info: meta?.info || {},
  };
}

function banIds(session) {
  return (session?.bans || []).map((b) => (typeof b === 'object' ? b.id : b)).filter((id) => Number(id) > 0);
}

function useProbuilds(champion, role) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('idle');
  useEffect(() => {
    if (!champion) {
      setRows([]);
      setStatus('idle');
      return undefined;
    }
    let alive = true;
    setStatus('loading');
    const apply = (res) => {
      if (!alive) return false;
      const next = res?.rows || [];
      if (res?.ok && next.length) {
        setRows(next);
        setStatus('ready');
        return true;
      }
      if (res?.ok) {
        setRows([]);
        setStatus('ready');
        return true;
      }
      return false;
    };
    const fail = () => {
      if (!alive) return;
      setRows([]);
      setStatus('error');
    };
    const fromWiki = () => fetchProbuilds({ champion, role }).then((res) => {
      if (!apply(res)) fail();
    }).catch(fail);

    if (window.probuildsAPI?.list) {
      window.probuildsAPI.list({ champion, role }).then((res) => {
        if (apply(res)) return;
        return fromWiki();
      }).catch(fromWiki);
    } else {
      fromWiki();
    }
    return () => { alive = false; };
  }, [champion, role]);
  return { rows, status };
}

export default function Draft() {
  const { session: account } = useSession();
  const { t } = useI18n();
  const trees = useRuneTrees();
  const [session, setSession] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [role, setRole] = useState('Mid');
  const [runeMsg, setRuneMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [focusKey, setFocusKey] = useState(null);
  const [pool, setPool] = useState({ mastery: {}, recent: {} });
  const [roleLocked, setRoleLocked] = useState(false);
  const [runeOption, setRuneOption] = useState(null);
  const [runeTick, setRuneTick] = useState(0);
  const [imported, setImported] = useState({ runes: false, spells: false, pageId: null });
  const [masteryOnly, setMasteryOnly] = useState(false);
  const [offMeta, setOffMeta] = useState(false);
  const [pickMsg, setPickMsg] = useState('');
  const [kit, setKit] = useState(null);

  useEffect(() => {
    let alive = true;
    getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`))
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const byId = {};
        Object.values(data.data || {}).forEach((c) => {
          byId[Number(c.key)] = {
            id: Number(c.key),
            key: c.id,
            name: c.name,
            tags: c.tags || [],
            info: c.info || {},
          };
        });
        setCatalog(catalogFromIndex(byId));
      })
      .catch(() => { if (alive) setCatalogError('Could not load the champion list.'); });
    refreshRunePages().then(() => { if (alive) setRuneTick((n) => n + 1); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!account?.gameName || !account?.tagLine) {
      setPool({ mastery: {}, recent: {} });
      return undefined;
    }
    let alive = true;
    getDraftPool({
      gameName: account.gameName,
      tagLine: account.tagLine,
      region: account.region || 'europe',
      platform: account.platform || 'euw1',
    }).then((next) => { if (alive) setPool(next); }).catch(() => {
      if (alive) setPool({ mastery: {}, recent: {} });
    });
    return () => { alive = false; };
  }, [account?.gameName, account?.tagLine, account?.region, account?.platform]);

  useEffect(() => {
    if (!window.lcuAPI?.getChampSelect) return undefined;
    let alive = true;
    const tick = async () => {
      try {
        const next = await window.lcuAPI.getChampSelect();
        if (alive) setSession(next);
      } catch {
        if (alive) setSession({ connected: false, inSelect: false });
      }
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const live = !!session?.inSelect;
  const replay = !live && (session?.source === 'last-draft' || session?.reason === 'last-draft')
    && ((session?.allies || []).length + (session?.enemies || []).length) > 0;
  const viewing = live || replay;
  const you = session?.you || null;

  useEffect(() => {
    setRoleLocked(false);
  }, [you?.cellId, session?.inSelect, session?.source]);

  const activeRole = role;
  const enemies = viewing ? (session.enemies || []).map((s) => enrichSeat(s, catalog)) : [];
  const allies = viewing ? (session.allies || []).map((s) => enrichSeat(s, catalog)) : [];
  const enemyLane = viewing
    ? enemies.find((e) => e.position === activeRole && e.shownId)
      || enemies.find((e) => e.shownId && typicalLane(e.name) === activeRole)
      || null
    : null;
  const allyDuo = viewing
    ? allies.find((a) => !a.isYou && a.position === DUO_ROLE[activeRole] && a.shownId) || null
    : null;

  const youChamp = viewing && (you?.championId || you?.intentId || you?.shownId)
    ? catalog.find((c) => c.id === (you.championId || you.intentId || you.shownId))
    : null;

  const lockedIn = viewing && Number(you?.championId) > 0;
  const banPhase = live && isBanPhase(session);

  useEffect(() => {
    if (roleLocked) return;
    const next = POS_FROM_LCU[you?.position];
    if (next) {
      setRole(next);
      return;
    }
    const fromChamp = typicalLane(youChamp?.key);
    if (fromChamp) setRole(fromChamp);
  }, [you?.position, youChamp?.key, roleLocked]);

  useEffect(() => {
    setFocusKey(null);
  }, [banPhase, activeRole, you?.championId]);

  const advice = useMemo(() => adviseDraft({
    role: activeRole,
    youChamp,
    enemyLane: enemyLane ? { name: enemyLane.key || enemyLane.name, tags: enemyLane.tags || [] } : null,
    allyDuo: allyDuo ? { name: allyDuo.name || allyDuo.key, tags: allyDuo.tags || [] } : null,
    enemies: viewing ? enemies.filter((e) => e.name).map((e) => ({ name: e.name, tags: e.tags || [] })) : [],
    bans: viewing ? banIds(session) : [],
    taken: viewing ? [...allies, ...enemies].map((p) => p.championId).filter(Boolean) : [],
    owned: live ? session.owned : catalog.map((c) => c.id),
    pickable: live ? session.pickable : [],
    catalog,
    pool,
    offMeta,
  }), [live, viewing, activeRole, youChamp, enemyLane, allyDuo, enemies, allies, session, catalog, pool, offMeta]);

  const banAdvice = useMemo(() => adviseBans({
    role: activeRole,
    bans: viewing ? banIds(session) : [],
    bannable: live ? (session.bannable || []) : [],
    catalog,
    pool,
  }), [activeRole, live, viewing, session, catalog, pool]);

  const suggestions = useMemo(() => {
    const rows = banPhase ? banAdvice : advice.picks;
    if (!masteryOnly) return rows;
    return rows.filter((c) => (pool.mastery?.[c.id]?.level || 0) >= 3);
  }, [banPhase, banAdvice, advice.picks, masteryOnly, pool]);
  const featured = suggestions.find((c) => c.key === focusKey) || suggestions[0] || null;
  const allyBoard = useMemo(() => padSeats(allies), [allies]);
  const enemyBoard = useMemo(() => padSeats(enemies), [enemies]);
  const lean = useMemo(() => draftLean(allyBoard, enemyBoard), [allyBoard, enemyBoard]);
  const sketch = useMemo(() => compareSketch(allyBoard, enemyBoard), [allyBoard, enemyBoard]);

  const lockedName = lockedIn ? youChamp?.key : null;
  const runeFocus = viewing ? (lockedName || focusKey || youChamp?.key || advice.picks[0]?.key) : null;
  const pickChamp = catalog.find((c) => c.key === runeFocus) || youChamp || null;
  const pickGrade = matchupGrade(pickChamp, enemyLane, activeRole);
  const runePages = useMemo(() => {
    if (!runeFocus) return [];
    return runePagesFor(runeFocus, activeRole, {
      enemyLane: enemyLane ? { name: enemyLane.key || enemyLane.name, tags: enemyLane.tags || [] } : null,
      enemies: viewing
        ? enemies.filter((e) => e.name).map((e) => ({ name: e.name, tags: e.tags || [] }))
        : [],
    });
  }, [runeFocus, activeRole, enemyLane, enemies, live, viewing, runeTick]);
  const runes = runePages.find((p) => p.id === runeOption) || runePages.find((p) => p.recommended) || runePages[0];

  useEffect(() => {
    setRuneOption(null);
    setImported({ runes: false, spells: false, pageId: null });
  }, [runeFocus]);

  useEffect(() => {
    if (!runeFocus) {
      setKit(null);
      return undefined;
    }
    let alive = true;
    getDdragonVersion()
      .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion/${runeFocus}.json`))
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const c = data.data?.[runeFocus];
        setKit(c ? { version: data.version, passive: c.passive, spells: c.spells || [] } : null);
      })
      .catch(() => { if (alive) setKit(null); });
    return () => { alive = false; };
  }, [runeFocus]);

  const sendRunes = async (page = runes) => {
    if (!window.lcuAPI?.applyRunes || !page) return;
    setSending(true);
    setRuneMsg('');
    try {
      const result = await window.lcuAPI.applyRunes(page);
      if (result.ok) {
        setImported({ runes: true, spells: !!result.spells, pageId: page.id || page.name || 'meta' });
        setRuneMsg(result.spells
          ? 'Runes and summoners sent to League.'
          : 'Rune page sent to League.');
      } else {
        setRuneMsg(result.error || 'Could not write runes.');
      }
    } catch (err) {
      setRuneMsg(err.message || 'Could not write runes.');
    } finally {
      setSending(false);
    }
  };

  const runesImported = imported.runes && imported.pageId === runes?.id;
  const spellsImported = imported.spells && imported.pageId === runes?.id;
  const canAct = !!session?.acting;
  const hasMastery = Object.keys(pool.mastery || {}).length > 0;

  const hoverChamp = async (champ) => {
    if (!champ) return;
    setFocusKey(champ.key);
    if (!window.lcuAPI?.selectChamp) return;
    const result = await window.lcuAPI.selectChamp({ championId: champ.id, lock: false });
    if (!result.ok && result.error) setPickMsg(result.error);
    else setPickMsg('');
  };

  const lockChamp = async (champ) => {
    if (!champ || !window.lcuAPI?.selectChamp) return;
    setFocusKey(champ.key);
    const result = await window.lcuAPI.selectChamp({ championId: champ.id, lock: true });
    setPickMsg(result.ok
      ? (banPhase ? `Banned ${champ.name}.` : `Locked ${champ.name}.`)
      : (result.error || 'Could not lock that champion.'));
  };

  const inGame = session?.source === 'in-game'
    || String(session?.gameflow || '').toUpperCase().includes('INPROGRESS');
  const status = live
    ? 'In champ select'
    : replay
      ? (inGame ? t('draft.inGame') : t('draft.lastDraft'))
      : inGame
        ? t('draft.inGame')
        : session?.connected
          ? 'Waiting'
          : 'League closed';

  const waitCopy = !session?.connected && !replay
    ? { title: t('draft.waitTitle'), body: t('draft.waitBody') }
    : inGame && !replay
      ? { title: t('draft.inGame'), body: t('draft.inGameBody') }
      : { title: t('draft.waitTitle'), body: t('draft.waitQueue') };

  return (
    <div className="dr-page">
      <div className="dr-head">
        <div>
          <h1>{t('draft.title')}</h1>
          <p className="dr-sub">
            {live
              ? `${banPhase ? t('draft.banPhase') : phaseLabel(session.phase)} · ${activeRole}${allyDuo?.displayName ? ` · duo ${allyDuo.displayName}` : ''}`
              : replay
                ? t('draft.lastDraftBody')
                : waitCopy.body}
          </p>
        </div>
        <div className={`dr-pill${live ? ' is-live' : replay || session?.connected ? ' is-idle' : ''}`}>
          {status}
        </div>
      </div>

      {catalogError ? <p className="dr-hint">{catalogError}</p> : null}

      {!viewing ? (
        <div className="dr-wait">
          <strong>{waitCopy.title}</strong>
          <p>{waitCopy.body}</p>
        </div>
      ) : (
        <div className={`dr-live${replay ? ' is-replay' : ''}`}>
          <DraftBoard
            allyBans={session.allyBans}
            enemyBans={session.enemyBans}
            bans={session.bans}
            allies={allyBoard}
            enemies={enemyBoard}
            lean={lean}
            sketch={sketch}
          />

          {(live || lockedIn) ? (
            <section className="dr-your">
              {lockedIn ? (
                <>
                  <div className="dr-your-head">
                    <h2>{t('draft.yourPick')}</h2>
                  </div>
                  <Loadout
                    pickChamp={pickChamp}
                    pickGrade={pickGrade}
                    activeRole={activeRole}
                    roles={ROLES}
                    onRole={(r) => { setRole(r); setRoleLocked(true); }}
                    runePages={runePages}
                    runes={runes}
                    onRune={setRuneOption}
                    runesImported={runesImported}
                    spellsImported={spellsImported}
                    trees={trees}
                    kit={kit}
                    sending={sending}
                    onSend={sendRunes}
                    runeMsg={runeMsg}
                    disclaimer={advice.disclaimer}
                    proChamp={pickChamp?.name}
                  />
                </>
              ) : (
                <PickSuggestions
                  title={t('draft.yourPick')}
                  banPhase={banPhase}
                  suggestions={suggestions}
                  featured={featured}
                  enemyLane={enemyLane}
                  activeRole={activeRole}
                  masteryOnly={masteryOnly}
                  offMeta={offMeta}
                  hasMastery={hasMastery}
                  canAct={canAct}
                  pickMsg={pickMsg}
                  onMastery={() => setMasteryOnly((v) => !v)}
                  onOffMeta={() => setOffMeta((v) => !v)}
                  onHover={hoverChamp}
                  onLock={() => lockChamp(featured)}
                  pool={pool}
                  disclaimer={advice.disclaimer}
                  proChamp={featured?.name}
                />
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ProbuildsList({ champion, role, hideEmpty = false }) {
  const { rows, status } = useProbuilds(champion, role);
  const itemsByName = useItemNameIndex();
  const itemCatalog = useItemCatalog();
  const [openId, setOpenId] = useState(null);
  useEffect(() => { setOpenId(null); }, [champion, role]);
  if (!champion) return null;
  if (hideEmpty && !rows.length) return null;
  const open = rows.find((row) => row.id === openId) || null;

  if (open) {
    const items = buildItemNames(open.items)
      .map((name) => {
        const id = resolveItemId(name, itemsByName);
        if (!id || itemCatalog[id]?.purchasable === false) return null;
        return { name, id };
      })
      .filter(Boolean);
    const key = keystoneId(open.keystone);
    const primary = treeId(open.primary);
    const sub = treeId(open.secondary);
    return (
      <div className="dr-side-card dr-pro dr-pro-page">
        <button type="button" className="dr-pro-back" onClick={() => setOpenId(null)}>
          ← Probuilds
        </button>
        <div className="dr-pro-page-who">
          <strong>{open.player}</strong>
          <em>{[open.team, timeAgo(open.at)].filter(Boolean).join(' · ')}</em>
        </div>
        <h4>Items this game</h4>
        <div className="dr-pro-build">
          {items.length ? items.map((item, i) => (
            <span key={`${open.id}-${item.id || item.name}-${i}`} className="dr-pro-slot" title={item.name}>
              <ItemIcon id={item.id} size={36} title={item.name} />
              <em>{item.name}</em>
            </span>
          )) : <p className="dr-empty">No items listed on that scoreboard.</p>}
        </div>
        <h4>Runes</h4>
        <div className="dr-pro-page-runes">
          {key ? <RuneIcon id={key} size={32} /> : null}
          {primary ? <RuneIcon id={primary} size={20} /> : null}
          {sub ? <RuneIcon id={sub} size={20} /> : null}
          <span>{[open.keystone, open.primary, open.secondary].filter(Boolean).join(' · ')}</span>
        </div>
        <p className="dr-pro-src">End-game items from the Leaguepedia scoreboard — not a path we invented.</p>
      </div>
    );
  }

  return (
    <div className="dr-side-card dr-pro">
      <h3>Probuilds</h3>
      {status === 'loading' && !rows.length ? <p className="dr-empty">Loading recent pro games…</p> : null}
      {status === 'error' ? <p className="dr-empty">Could not reach Leaguepedia.</p> : null}
      {status === 'ready' && !rows.length ? (
        <p className="dr-empty">No recent pro games on this champion.</p>
      ) : null}
      {rows.map((row) => {
        const cores = coreItemNames(row.items)
          .map((name) => ({ name, id: resolveItemId(name, itemsByName) }))
          .filter((item) => item.id);
        const key = keystoneId(row.keystone);
        const sub = treeId(row.secondary);
        return (
          <button
            key={row.id}
            type="button"
            className="dr-pro-row"
            title={`${row.team || ''} ${row.at || ''}`.trim()}
            onClick={() => setOpenId(row.id)}
          >
            <div className="dr-pro-who">
              <strong>{row.player}</strong>
              <em>{[row.team, timeAgo(row.at)].filter(Boolean).join(' · ')}</em>
            </div>
            <span className="dr-pro-runes">
              {key ? <RuneIcon id={key} size={26} /> : null}
              {sub ? <RuneIcon id={sub} size={16} /> : null}
            </span>
            <span className="dr-pro-items">
              {cores.map((item) => (
                <ItemIcon key={`${row.id}-${item.id}`} id={item.id} size={26} title={item.name} />
              ))}
            </span>
          </button>
        );
      })}
      <p className="dr-pro-src">Leaguepedia scoreboards · click a row for the full item list</p>
    </div>
  );
}

function PickSuggestions({
  title,
  banPhase,
  suggestions,
  featured,
  enemyLane,
  activeRole,
  masteryOnly,
  offMeta,
  hasMastery,
  canAct,
  pickMsg,
  onMastery,
  onOffMeta,
  onHover,
  onLock,
  pool,
  disclaimer,
  proChamp,
}) {
  return (
    <div className="dr-picks-wrap">
      <div className="dr-your-head">
        <h2>{title}</h2>
        <div className="dr-your-tools">
          <button type="button" className="dr-lock" onClick={onLock} disabled={!featured || !canAct}>
            {banPhase ? 'Ban' : 'Lock'}
          </button>
          <button
            type="button"
            className={`dr-mastery${masteryOnly ? ' is-on' : ''}`}
            onClick={onMastery}
            disabled={!hasMastery}
            title={hasMastery ? 'Only champions at mastery 3 or higher' : 'Link an account to filter by mastery'}
          >
            <span>Mastery level</span>
            <strong>3+</strong>
          </button>
          <button
            type="button"
            className="dr-offmeta"
            onClick={onOffMeta}
            aria-pressed={offMeta}
          >
            <span>Show off-meta</span>
            <i className={`dr-switch${offMeta ? ' is-on' : ''}`}><em /></i>
          </button>
        </div>
      </div>

      {!suggestions.length || !featured ? (
        <p className="dr-empty">
          {banPhase ? 'No ban suggestions left for this role.' : 'Waiting on the lobby.'}
        </p>
      ) : (
        <div className="dr-recs">
          {suggestions.map((c) => {
            const on = featured?.id === c.id;
            const grade = matchupGrade(c, enemyLane, activeRole);
            const mastery = pool.mastery?.[c.id]?.level || 0;
            const games = pool.recent?.[c.id]?.games || 0;
            const why = grade?.why || c.reasons?.[0] || '';
            const mix = kitMix(c.info);
            const label = grade?.grade || (mastery ? `M${mastery}` : '');
            return (
              <div key={c.id} className={`dr-rec-col${on ? ' is-on' : ''}`}>
                <span className={`dr-rec-delta${on ? ' is-on' : ''}${grade?.grade ? ` is-${grade.grade}` : ''}`}>
                  {label}
                </span>
                <button
                  type="button"
                  className={`dr-rec-card${on ? ' is-on' : ''}`}
                  onClick={() => onHover(c)}
                  title={why || c.name}
                >
                  <RecArt champKey={c.key} featured={on} />
                  {on ? (
                    <span className="dr-rec-foot">
                      <span className="dr-rec-stats">
                        <span>
                          <b>{mastery || '—'}</b>
                          <em>mastery</em>
                        </span>
                        <span>
                          <b>{games || '—'}</b>
                          <em>last 20</em>
                        </span>
                      </span>
                      {why ? <span className="dr-rec-why">{why}</span> : null}
                      {mix ? (
                        <span
                          className="dr-rec-mix"
                          title="Riot champion attack vs magic ratings — not live damage"
                        >
                          <span className="dr-rec-mix-lab">
                            <em>AD</em>
                            <em>AP</em>
                          </span>
                          <span className="dr-rec-mix-bar">
                            <i style={{ width: `${mix.ad}%` }} />
                          </span>
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {pickMsg ? <p className="dr-hint">{pickMsg}</p> : null}
      <ProbuildsList champion={proChamp} role={activeRole} hideEmpty />
      <p className="dr-disclaimer">{disclaimer}</p>
    </div>
  );
}

function Loadout({
  pickChamp,
  pickGrade,
  activeRole,
  roles,
  onRole,
  runePages,
  runes,
  onRune,
  runesImported,
  spellsImported,
  trees,
  kit,
  sending,
  onSend,
  runeMsg,
  disclaimer,
  proChamp,
}) {
  const { rows } = useProbuilds(proChamp, activeRole);
  const meta = useMetaBuilds(pickChamp?.key, activeRole, runes?.spells);
  const skillBuild = (meta.builds || []).find((b) => b.id === 'most') || meta.builds?.[0];
  const itemsByName = useItemNameIndex();
  const itemCatalog = useItemCatalog();
  const selectedBuild = itemsForKeystone(rows, runes?.selectedPerkIds?.[0]);
  const liveItems = selectedBuild.items
    .map((item) => {
      const id = resolveItemId(item.name, itemsByName);
      const meta = id ? itemCatalog[id] : null;
      if (!id || meta?.purchasable === false) return null;
      return { ...item, id, gold: meta?.gold || 0 };
    })
    .filter(Boolean);

  return (
    <>
      <div className="dr-your-select">
        <div className={`dr-your-champ${pickGrade?.grade ? ` is-${pickGrade.grade}` : ''}`}>
          {pickChamp ? <ChampionIcon name={pickChamp.key} size={52} /> : <span className="dr-your-champ-empty" />}
          {pickGrade?.grade ? (
            <span className={`dr-your-grade is-${pickGrade.grade}`} title={pickGrade.why}>{pickGrade.grade}</span>
          ) : null}
        </div>
        <div className="dr-your-roles">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              className={r === activeRole ? 'is-on' : ''}
              title={r}
              onClick={() => onRole(r)}
            >
              <RoleIcon role={r} size={18} />
            </button>
          ))}
        </div>
      </div>

      <DraftBuildCard
        champion={pickChamp?.key}
        role={activeRole}
        spells={runes?.spells}
        kit={kit}
      />

      <div className="dr-your-grid">
        <aside className="dr-your-side">
          <div className="dr-side-card">
            <h3>Builds</h3>
            {!runePages.length ? (
              <p className="dr-empty">No rune page for this champion yet.</p>
            ) : runePages.map((page) => {
              const on = runes?.id === page.id;
              const pageBuild = itemsForKeystone(rows, page.selectedPerkIds?.[0]);
              const cores = pageBuild.items
                .map((item) => {
                  const id = resolveItemId(item.name, itemsByName);
                  if (!id || itemCatalog[id]?.purchasable === false) return null;
                  return { ...item, id };
                })
                .filter(Boolean)
                .slice(0, 4);
              return (
                <button
                  key={page.id}
                  type="button"
                  className={`dr-build${on ? ' is-on' : ''}${page.recommended ? ' is-rec' : ''}`}
                  onClick={() => onRune(page.id)}
                >
                  <RuneIcon id={page.selectedPerkIds?.[0]} size={28} />
                  <div>
                    <strong>{page.label}</strong>
                    <em>{page.why}</em>
                    {cores.length ? (
                      <span className="dr-build-items">
                        {cores.map((item) => (
                          <ItemIcon key={`${page.id}-${item.id}`} id={item.id} size={18} title={item.name} />
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <span className="dr-build-spells">
                    {(page.spells || []).map((id) => (
                      <SpellIcon key={`${page.id}-sp-${id}`} id={id} size={18} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <ProbuildsList champion={proChamp} role={activeRole} hideEmpty />
        </aside>

        <div className="dr-your-main">
          <div className="dr-block">
            <header>
              <h3>Summoners</h3>
              {spellsImported ? <span className="dr-imported">Imported</span> : null}
            </header>
            <div className="dr-summs">
              {(runes?.spells || []).map((id) => (
                <SpellIcon key={`sum-${id}`} id={id} size={40} />
              ))}
              {activeRole === 'Jungle' && skillBuild?.pet?.id ? (
                <span className="dr-summ-pet" title="Jungle pet">
                  <ItemIcon id={skillBuild.pet.id} size={40} />
                </span>
              ) : null}
              {!runes?.spells?.length ? <p className="dr-empty">No summoner page yet.</p> : null}
            </div>
          </div>

          {liveItems.length ? (
            <div className="dr-block">
              <header>
                <div>
                  <h3>Items</h3>
                  {runes?.label ? <p className="dr-rune-kicker">{runes.label}</p> : null}
                </div>
              </header>
              <div className="dr-items">
                {liveItems.map((item) => (
                    <span key={item.name} className="dr-item" title={item.name}>
                      <ItemIcon id={item.id} size={40} title={item.name} />
                      <em>{item.name}</em>
                      {selectedBuild.hasWins ? (
                        <b>{item.w}/{item.n}</b>
                      ) : (
                        <b>{item.gold ? `${item.gold}g` : `${item.n}`}</b>
                      )}
                    </span>
                ))}
              </div>
              <p className="dr-hint">
                {selectedBuild.mixed
                  ? `No games on this keystone — most built in ${selectedBuild.games} recent Leaguepedia games.`
                  : selectedBuild.hasWins
                    ? `Sorted by wins in ${selectedBuild.games} Leaguepedia games on this keystone — end-game items, not a sitewide winrate.`
                    : `Most built in ${selectedBuild.games} Leaguepedia games on this keystone — end-game items, not a winrate.`}
              </p>
            </div>
          ) : null}

          {kit?.spells?.length ? (
            <div className="dr-block">
              <header>
                <h3>Skill priority</h3>
              </header>
              {skillBuild?.skills?.order?.length ? (
                <>
                  <SkillPriority kit={kit} skills={skillBuild.skills} size={40} />
                  <p className="dr-hint">
                    {`Max order in ${Number(skillBuild.skills.games || 0).toLocaleString()} Lolalytics emerald+ games — not a guess.`}
                  </p>
                </>
              ) : (
                <p className="dr-empty">No ranked skill-order sample for this champion yet.</p>
              )}
            </div>
          ) : null}

          <div className="dr-block dr-block-runes">
            <header>
              <div>
                <h3>Runes</h3>
                {runes?.label ? <p className="dr-rune-kicker">{runes.label}</p> : null}
              </div>
              {runesImported ? <span className="dr-imported">Imported</span> : null}
            </header>
            <RuneTree page={runes} trees={trees} />
            {runes?.note ? <p className="dr-note">{runes.note}</p> : null}
            <button type="button" className="dr-send" onClick={() => onSend()} disabled={sending || !runes}>
              {runes?.selectedPerkIds?.[0] ? <RuneIcon id={runes.selectedPerkIds[0]} size={20} /> : null}
              {sending ? 'Sending…' : 'Send runes & spells'}
            </button>
          </div>
          {runeMsg ? <p className="dr-hint">{runeMsg}</p> : null}
          <p className="dr-disclaimer">{disclaimer}</p>
        </div>
      </div>
    </>
  );
}

function padBans(list, fallback = [], start = 0) {
  const source = Array.isArray(list) ? list : fallback.slice(start, start + 5);
  const out = source.filter((b) => b && (b.key || b.id)).slice(0, 5);
  while (out.length < 5) out.push({ id: 0, key: null, name: null });
  return out;
}

function DraftBoard({ bans, allyBans, enemyBans, allies, enemies, lean, sketch }) {
  const flat = bans || [];
  return (
    <div className="dr-overview">
      <LeanBar
        lean={lean}
        allyBans={padBans(allyBans, flat, 0)}
        enemyBans={padBans(enemyBans, flat, 5)}
      />
      <div className="dr-board">
        <TeamStrip seats={allies} others={enemies} />
        <div className="dr-comps">
          {COMP_ROWS.map(([key, labelKey]) => (
            <CompRow key={key} labelKey={labelKey} row={sketch[key]} />
          ))}
        </div>
        <TeamStrip seats={enemies} others={allies} enemy />
      </div>
    </div>
  );
}

function TeamStrip({ seats, others, enemy }) {
  return (
    <div className={`dr-strip${enemy ? ' is-enemy' : ''}`}>
      <div className="dr-ports">
        {seats.map((seat, i) => (
          <DraftPortrait
            key={seat.cellId || `${enemy ? 'e' : 'a'}-${i}`}
            seat={seat}
            enemy={enemy}
            grade={matchupGrade(seat, others[i], seat.position)}
          />
        ))}
      </div>
      <LaneRow seats={seats} />
    </div>
  );
}

function LaneRow({ seats }) {
  return (
    <div className="dr-lanes">
      {seats.map((seat, i) => {
        const next = seats[i + 1];
        const link = next
          ? (duoLink(seat.name, next.name, seat.position) || duoLink(next.name, seat.name, next.position))
          : null;
        const plus = link && link.score >= 2;
        return (
          <span
            key={seat.cellId || `lane-${i}`}
            className={`dr-lane${plus ? ' has-plus' : ''}`}
            title={plus ? link.reason : seat.position}
          >
            <RoleIcon role={seat.position} size={14} />
            {plus ? <em>++</em> : null}
          </span>
        );
      })}
    </div>
  );
}

function BanSlots({ bans, enemy }) {
  return (
    <div className={`dr-ban-row${enemy ? ' is-enemy' : ' is-ally'}`}>
      {bans.map((ban, i) => (
        <span
          key={ban.id || `empty-${i}`}
          className="dr-ban-slot"
          title={ban.name || ban.key || 'Ban'}
        >
          {ban.key ? (
            <ChampionIcon name={ban.key} size={32} title={ban.name || ban.key} />
          ) : null}
        </span>
      ))}
    </div>
  );
}

function LeanBar({ lean, allyBans, enemyBans }) {
  return (
    <div className={`dr-lean${lean.ready ? '' : ' is-wait'}`}>
      <BanSlots bans={allyBans} />
      <b className="is-ally">{lean.ready ? `${lean.ally}%` : '—'}</b>
      <div className="dr-lean-mid">
        <span>Draft lean</span>
        <div className="dr-lean-track">
          <i className="is-ally" style={{ width: `${lean.ally}%` }} />
          <i className="is-enemy" style={{ width: `${lean.enemy}%` }} />
        </div>
        <em>{lean.ready ? 'Matchup notes, not a live winrate' : 'Waiting on picks'}</em>
      </div>
      <b className="is-enemy">{lean.ready ? `${lean.enemy}%` : '—'}</b>
      <BanSlots bans={enemyBans} enemy />
    </div>
  );
}

function CompRow({ labelKey, row }) {
  const { t } = useI18n();
  const ally = Number(row?.ally) || 0;
  const enemy = Number(row?.enemy) || 0;
  const ready = Boolean(row?.ready);
  const allyLead = ready && ally > enemy;
  const enemyLead = ready && enemy > ally;
  return (
    <div className={`dr-comp${ready ? '' : ' is-wait'}${allyLead ? ' is-ally-lead' : ''}${enemyLead ? ' is-enemy-lead' : ''}`} title={t('draft.compHint')}>
      <b className={`is-ally${allyLead ? ' is-ahead' : ''}`}>{ready ? `${ally}%` : '—'}</b>
      <div className="dr-comp-mid">
        <span>{t(labelKey)}</span>
        <div className="dr-comp-track">
          <i className={`is-ally${allyLead ? ' is-lead' : ''}`} style={{ width: `${ready ? ally : 50}%` }} />
          <i className={`is-enemy${enemyLead ? ' is-lead' : ''}`} style={{ width: `${ready ? enemy : 50}%` }} />
          <em className="dr-comp-midline" aria-hidden />
        </div>
      </div>
      <b className={`is-enemy${enemyLead ? ' is-ahead' : ''}`}>{ready ? `${enemy}%` : '—'}</b>
    </div>
  );
}

function DraftPortrait({ seat, enemy, grade }) {
  return (
    <div
      className={`dr-port${seat.isYou ? ' is-you' : ''}${enemy ? ' is-enemy' : ''}${seat.locked ? ' is-locked' : ''}`}
      title={grade?.why || seat.displayName || seat.position}
    >
      <ChampionPortrait name={seat.name} />
      {grade?.grade ? (
        <span className={`dr-port-grade is-${grade.grade}`} title={grade.why}>{grade.grade}</span>
      ) : null}
    </div>
  );
}

const SHARD_LABELS = ['Off', 'Flex', 'Def'];

function RuneTree({ page, trees }) {
  const index = useRuneIndex();
  if (!page) return <p className="dr-empty">No rune page yet.</p>;
  const selected = new Set((page.selectedPerkIds || []).map(Number));
  const shards = (page.selectedPerkIds || []).slice(6);
  if (!trees?.length) {
    return (
      <div className="dr-runes-fallback">
        {(page.selectedPerkIds || []).map((id, i) => (
          <RuneIcon key={`fb-${i}-${id}`} id={id} size={i < 1 ? 34 : 24} />
        ))}
      </div>
    );
  }
  const primary = trees.find((t) => t.id === page.primaryStyleId);
  const secondary = trees.find((t) => t.id === page.subStyleId);
  const keystone = Number(page.selectedPerkIds?.[0]);
  const keyName = index[keystone]?.name || '';
  return (
    <div className="dr-tree">
      <TreeColumn tree={primary} selected={selected} keyName={keyName} />
      <TreeColumn tree={secondary} selected={selected} skipKeystones />
      <div className="dr-shards">
        <strong>Shards</strong>
        {shards.map((id, i) => (
          <span key={`shard-${i}-${id}`} className="dr-shard">
            <RuneIcon id={id} size={22} />
            <em>{SHARD_LABELS[i] || 'Stat'}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function TreeColumn({ tree, selected, skipKeystones, keyName }) {
  if (!tree) return <div className="dr-tree-col is-empty" />;
  const slots = skipKeystones ? (tree.slots || []).slice(1) : (tree.slots || []);
  const icon = tree.icon ? `https://ddragon.leagueoflegends.com/cdn/img/${tree.icon}` : '';
  return (
    <div className="dr-tree-col" data-tree={tree.id}>
      <div className="dr-tree-head">
        {icon ? <img src={icon} alt="" /> : null}
        <strong>{tree.name}</strong>
        {keyName ? <span>{keyName}</span> : null}
      </div>
      {slots.map((slot, i) => (
        <div key={`${tree.id}-${i}`} className={`dr-tree-row${i === 0 && !skipKeystones ? ' is-key' : ''}`}>
          {(slot.runes || []).map((rune) => (
            <span key={rune.id} className={selected.has(rune.id) ? 'is-on' : ''} title={rune.name}>
              <RuneIcon id={rune.id} size={i === 0 && !skipKeystones ? 36 : 22} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
