import React, { useEffect, useRef, useState } from 'react';
import { ItemIcon } from '../components/GameIcons';
import { useI18n } from '../i18n/LocaleContext';
import { useItemCatalog } from '../services/ddragon';
import { champIconUrl, champSpellImgUrl, useDdragonVersion } from '../services/ddragon';
import { buildItemSuggestions, PREVIEW_SUGGESTIONS, roleFromPosition } from '../lib/overlayItems';
import { nextObjectiveAlert, PREVIEW_OBJECTIVE } from '../lib/overlayObjectives';
import { shouldRemindTrinketSwap, PREVIEW_TRINKET } from '../lib/overlayTrinkets';
import {
  PREVIEW_SKILL,
  resolveSkillOrderForComp,
  resolveSkillTip,
  skillPointsAvailable,
} from '../lib/overlaySkills';
import { computeWinProbability, PREVIEW_WIN_PROB } from '../lib/overlayWinProb';
import ScoutOverlayPanel, { PREVIEW_SCOUT_GAME } from '../components/ScoutOverlayPanel';
import LOGO_MARK from '../assets/logo-mark.png';
import { useOverlayPanelToggles, OVERLAY_PANEL_LIST } from '../lib/overlayPanels';
import './OverlayHud.css';

const MOCK = {
  inGame: true,
  gameTime: 197,
  you: {
    level: 3,
    cs: 12,
    gold: 450,
    goldTotal: 263 * (197 / 60),
    kills: 0,
    assists: 0,
    teamKills: 0,
    vision: 0,
    champion: 'Jinx',
    items: [],
  },
};

/** How long an item toast stays on screen. */
const TOAST_MS = 7000;
/** Objective spawn warning — brief ping, not a live countdown. */
const OBJ_TOAST_MS = 3000;
/** Trinket swap reminder. */
const TRINKET_TOAST_MS = 5000;
/** Exit animation before unmount. */
const EXIT_MS = 380;

function targets(minutes) {
  const m = Math.max(0.2, minutes);
  const gpm = 320 + Math.min(m, 8) * 12 + Math.max(0, m - 8) * 4;
  const csm = 2.2 + Math.min(m, 15) * 0.12;
  const kp = Math.min(55, 4 + m * 1.6);
  const vis = 0.35 + Math.min(m, 20) * 0.055;
  const lvl = Math.min(18, 1 + m * 0.85);
  return { gpm, csm, kp, vis, lvl };
}

function rowsFromSnap(snap) {
  const you = snap.you || {};
  const minutes = Math.max(0.2, (snap.gameTime || 0) / 60);
  const t = targets(minutes);
  const gpm = (you.goldTotal ?? you.gold ?? 0) / minutes;
  const cs = Number(you.cs);
  const csm = (Number.isFinite(cs) ? cs : 0) / minutes;
  const kills = Number(you.kills) || 0;
  const assists = Number(you.assists) || 0;
  const teamKills = Math.max(Number(you.teamKills) || 0, kills);
  const kp = teamKills > 0 ? ((kills + assists) / teamKills) * 100 : 0;
  const vis = (Number(you.vision) || 0) / minutes;
  const lvl = you.level || 1;
  return [
    { key: 'GPM', current: Math.round(gpm), target: Math.round(t.gpm), fmt: (n) => String(Math.round(n)) },
    { key: 'CSM', current: csm, target: t.csm, fmt: (n) => Number(n).toFixed(2) },
    { key: 'KP', current: kp, target: t.kp, fmt: (n) => `${Math.round(n)}%` },
    { key: 'VISION', current: vis, target: t.vis, fmt: (n) => Number(n).toFixed(2) },
    { key: 'LVL', current: lvl, target: t.lvl, fmt: (n) => String(Math.round(n)) },
  ];
}

function tagLabel(tag, t) {
  const key = `overlays.tag.${tag}`;
  const translated = t(key);
  return translated === key ? t('overlays.tag.situational') : translated;
}

function shellProps(editing) {
  return {};
}

function ToastShell({
  className,
  title,
  onClose,
  editing,
  children,
  progress,
  ephemeral,
  leaving,
  dragProps,
}) {
  const shell = shellProps(editing);
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div
      className={`ov-toast${editing ? ' is-edit' : ''}${ephemeral ? ' is-ephemeral' : ''}${leaving ? ' is-leaving' : ''} ${className || ''}`.trim()}
      {...shell}
      {...dragProps}
    >
      <header className="ov-toast-head">
        <span>{title}</span>
        {onClose ? (
          <button type="button" className="ov-close" onClick={onClose} aria-label="Close">×</button>
        ) : null}
      </header>
      <div className="ov-toast-body">{children}</div>
      <div className="ov-toast-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function usePanelDrag(panelId, pos, setPos, editing) {
  const drag = useRef(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const onPointerDown = (e) => {
    if (!editing || e.button !== 0) return;
    // Don't steal clicks from build tabs, scout cards, dismiss buttons, etc.
    if (e.target?.closest?.('button, a, input, select, textarea, label, [role="button"]')) return;
    drag.current = {
      ox: e.clientX - posRef.current.x,
      oy: e.clientY - posRef.current.y,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!drag.current) return;
    setPos({
      x: Math.round(e.clientX - drag.current.ox),
      y: Math.round(e.clientY - drag.current.oy),
    });
  };

  const endDrag = (e) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    window.liveClient?.setPanelPos?.(panelId, posRef.current);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    style: { touchAction: 'none', cursor: editing ? 'move' : undefined },
  };
}

function DraggablePanel({ id, pos, setPos, editing, children }) {
  const dragProps = usePanelDrag(id, pos, setPos, editing);
  return (
    <div
      className={`ov-float${editing ? ' is-edit' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      data-ov-hit="1"
    >
      {typeof children === 'function' ? children(dragProps) : children}
      {editing ? <span className="ov-float-badge">Drag</span> : null}
    </div>
  );
}

function HudCard({ snap, onClose, attached, applyHint, editing, dragProps }) {
  const rows = rowsFromSnap(snap);

  return (
    <div
      className={`ov-bench${editing ? ' is-edit' : ''}`}
      {...shellProps(editing)}
      {...dragProps}
    >
      <header className="ov-bench-head">
        <div className="ov-brand" aria-label="Rift.lol">
          <img className="ov-brand-mark" src={LOGO_MARK} alt="" />
          <span className="ov-brand-text">
            RIFT<span>.LOL</span>
          </span>
        </div>
        {editing && onClose ? (
          <button type="button" className="ov-close" onClick={onClose} aria-label="Close">×</button>
        ) : null}
      </header>
      <ul className="ov-rows">
        {rows.map((row) => {
          const behind = row.current + 0.001 < row.target;
          return (
            <li key={row.key}>
              <span className="ov-label">{row.key}</span>
              <span className="ov-vals">
                <span className={`ov-now${behind ? ' is-low' : ' is-ok'}`}>{row.fmt(row.current)}</span>
                <span className="ov-sep">/</span>
                <span className="ov-tgt">{row.fmt(row.target)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
      {attached === false && !editing && <p className="ov-hint">not on League</p>}
      {applyHint && !editing && <p className="ov-hint">{applyHint}</p>}
    </div>
  );
}

function ItemToast({
  row,
  editing,
  gold = 0,
  remainingMs,
  onDismiss,
  leaving,
  dragProps,
  placeholder,
}) {
  const { t } = useI18n();
  const catalog = useItemCatalog();

  if (placeholder) {
    return (
      <ToastShell
        className="ov-items"
        title={t('overlays.itemsTitle')}
        editing={editing}
        progress={70}
        dragProps={dragProps}
      >
        <div className="ov-item-row">
          <span className="ov-item-icon-wrap ov-item-ph" />
          <div className="ov-items-body">
            <strong>{t('overlays.itemsTitle')}</strong>
            <span className="ov-items-tag">{t('overlays.tag.situational')}</span>
          </div>
        </div>
        {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
      </ToastShell>
    );
  }

  if (!row) return null;

  const cost = Number(catalog[row.id]?.gold) || Number(row.cost) || 0;
  const goldPct = cost > 0
    ? Math.round((Math.max(0, Number(gold) || 0) / cost) * 100)
    : 50;
  const timePct = Math.round((Math.max(0, remainingMs) / TOAST_MS) * 100);
  const progress = Math.max(goldPct * 0.25, timePct);
  const tagText = row.tag === 'finish' && row.targetName
    ? t('overlays.tag.finishOf', { item: row.targetName })
    : tagLabel(row.tag, t);

  return (
    <ToastShell
      className="ov-items"
      title={t('overlays.itemsTitle')}
      onClose={onDismiss}
      editing={editing}
      progress={progress}
      ephemeral={!editing}
      leaving={leaving}
      dragProps={dragProps}
    >
      <div className="ov-item-row">
        <span className="ov-item-icon-wrap">
          <ItemIcon id={row.id} size={40} title={row.name} />
        </span>
        <div className="ov-items-body">
          <strong>{row.name}</strong>
          <span className="ov-items-tag">{tagText}</span>
        </div>
      </div>
      {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
    </ToastShell>
  );
}

function ObjIcon({ kind }) {
  const k = String(kind || 'grubs');
  if (k === 'dragon') {
    return (
      <svg className="ov-obj-svg" viewBox="0 0 40 40" aria-hidden="true">
        <path fill="#7b6ad4" d="M20 2l14 6v10c0 9-6 16-14 20C12 34 6 27 6 18V8l14-6z" />
        <path fill="#1a1630" d="M20 11c-4 0-7 3-7 7 0 5 3 8 7 11 4-3 7-6 7-11 0-4-3-7-7-7zm0 3.2c2.2 0 3.8 1.6 3.8 3.8S22.2 22 20 22s-3.8-1.8-3.8-3.8 1.6-3.8 3.8-3.8z" />
      </svg>
    );
  }
  if (k === 'baron') {
    return (
      <svg className="ov-obj-svg" viewBox="0 0 40 40" aria-hidden="true">
        <path fill="#6a5ac8" d="M20 2l14 6v10c0 9-6 16-14 20C12 34 6 27 6 18V8l14-6z" />
        <path fill="#120e22" d="M13 16h14v3H13zm2 5h10v8c-1.5 1.2-3.5 2-5 2s-3.5-.8-5-2v-8z" />
      </svg>
    );
  }
  if (k === 'herald') {
    return (
      <svg className="ov-obj-svg" viewBox="0 0 40 40" aria-hidden="true">
        <path fill="#5b7fd4" d="M20 2l14 6v10c0 9-6 16-14 20C12 34 6 27 6 18V8l14-6z" />
        <circle cx="20" cy="18" r="7" fill="#0e1428" />
        <circle cx="20" cy="18" r="3.2" fill="#9eb8ff" />
      </svg>
    );
  }
  return (
    <svg className="ov-obj-svg" viewBox="0 0 40 40" aria-hidden="true">
      <path fill="#8b7ae0" d="M20 2l14 6v10c0 9-6 16-14 20C12 34 6 27 6 18V8l14-6z" />
      <path fill="#1a1433" d="M14 15c0-2 2.5-4 6-4s6 2 6 4c0 1.5-.8 2.5-1.6 3.2.8.6 1.6 1.8 1.6 3.3 0 2.4-2.5 4.5-6 4.5s-6-2.1-6-4.5c0-1.5.8-2.7 1.6-3.3C14.8 17.5 14 16.5 14 15z" />
      <circle cx="17.5" cy="16" r="1.2" fill="#c8b8ff" />
      <circle cx="22.5" cy="16" r="1.2" fill="#c8b8ff" />
    </svg>
  );
}

function ObjectiveToast({
  alert,
  editing,
  onDismiss,
  leaving,
  dragProps,
  placeholder,
  remainingMs = OBJ_TOAST_MS,
}) {
  const { t } = useI18n();
  const shell = shellProps(editing);

  if (placeholder) {
    return (
      <div
        className={`ov-toast ov-obj${editing ? ' is-edit' : ''}`}
        {...shell}
        {...dragProps}
      >
        <button type="button" className="ov-close ov-obj-x" aria-label="Close">×</button>
        <div className="ov-obj-row">
          <span className="ov-obj-icon"><ObjIcon kind="grubs" /></span>
          <div className="ov-obj-copy">
            <strong>
              <span>VOID</span>
              <span>GRUBS</span>
            </strong>
            <em>{t('overlays.obj.in', { n: 30 })}</em>
          </div>
        </div>
        <div className="ov-toast-bar" aria-hidden="true"><i style={{ width: '100%' }} /></div>
        {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
      </div>
    );
  }

  if (!alert) return null;

  const line1 = alert.line1 || '';
  const line2 = alert.line2 || '';
  const pct = Math.round((Math.max(0, remainingMs) / OBJ_TOAST_MS) * 100);

  return (
    <div
      className={`ov-toast ov-obj${editing ? ' is-edit' : ''}${leaving ? ' is-leaving' : ''} is-ephemeral`}
      {...shell}
      {...dragProps}
    >
      {onDismiss ? (
        <button type="button" className="ov-close ov-obj-x" onClick={onDismiss} aria-label="Close">×</button>
      ) : null}
      <div className="ov-obj-row">
        <span className="ov-obj-icon"><ObjIcon kind={alert.key} /></span>
        <div className="ov-obj-copy">
          <strong>
            {line2 ? (
              <>
                <span>{line1}</span>
                <span>{line2}</span>
              </>
            ) : (
              <span>{line1 || t(alert.labelKey)}</span>
            )}
          </strong>
          <em>{t('overlays.obj.in', { n: alert.secondsLeft ?? 30 })}</em>
        </div>
      </div>
      <div className="ov-toast-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
    </div>
  );
}

/** Brief 3s ping at ~30s before spawn — once per objective spawn id. */
function useObjectiveNotify(snap, preview, editing) {
  const [alert, setAlert] = useState(preview ? PREVIEW_OBJECTIVE : null);
  const [leaving, setLeaving] = useState(false);
  const [remainingMs, setRemainingMs] = useState(OBJ_TOAST_MS);
  const shown = useRef(new Set());
  const activeId = useRef('');
  const hideTimer = useRef(null);
  const tickTimer = useRef(null);
  const exitTimer = useRef(null);
  const leavingRef = useRef(false);
  const startedAt = useRef(0);

  const clearTimers = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    hideTimer.current = null;
    tickTimer.current = null;
    exitTimer.current = null;
  };

  const finishHide = () => {
    clearTimers();
    leavingRef.current = false;
    activeId.current = '';
    setAlert(null);
    setLeaving(false);
    setRemainingMs(0);
  };

  const beginExit = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    exitTimer.current = setTimeout(() => finishHide(), EXIT_MS);
  };

  const dismiss = () => {
    if (activeId.current) shown.current.add(activeId.current);
    beginExit();
  };

  const showAlert = (next) => {
    if (!next || shown.current.has(next.id)) return;
    clearTimers();
    shown.current.add(next.id);
    activeId.current = next.id;
    startedAt.current = Date.now();
    leavingRef.current = false;
    setLeaving(false);
    setAlert({ ...next, secondsLeft: 30 });
    setRemainingMs(OBJ_TOAST_MS);

    tickTimer.current = setInterval(() => {
      const left = OBJ_TOAST_MS - (Date.now() - startedAt.current);
      setRemainingMs(Math.max(0, left));
    }, 100);

    hideTimer.current = setTimeout(() => {
      beginExit();
    }, OBJ_TOAST_MS);
  };

  useEffect(() => {
    if (preview) {
      setAlert(PREVIEW_OBJECTIVE);
      setRemainingMs(OBJ_TOAST_MS);
      return undefined;
    }
    if (editing) {
      clearTimers();
      setAlert(null);
      setLeaving(false);
      return undefined;
    }
    if (!snap?.inGame) {
      shown.current.clear();
      finishHide();
      return undefined;
    }

    const next = nextObjectiveAlert(snap.gameTime || 0, snap.objectiveEvents || []);
    if (next && !shown.current.has(next.id) && activeId.current !== next.id) {
      showAlert(next);
    }
    return undefined;
  }, [
    preview,
    editing,
    snap?.inGame,
    Math.floor(snap?.gameTime || 0),
    (snap?.objectiveEvents || []).map((e) => e.id).join(','),
  ]);

  useEffect(() => () => clearTimers(), []);

  return { alert, leaving, dismiss, remainingMs };
}

function TrinketToast({
  row,
  editing,
  onDismiss,
  leaving,
  dragProps,
  placeholder,
  remainingMs = TRINKET_TOAST_MS,
}) {
  const { t } = useI18n();
  const pct = Math.round((Math.max(0, remainingMs) / TRINKET_TOAST_MS) * 100);

  if (placeholder) {
    return (
      <ToastShell
        className="ov-trinket"
        title={t('overlays.trinketTitle')}
        editing={editing}
        progress={80}
        dragProps={dragProps}
      >
        <div className="ov-trinket-row">
          <span className="ov-item-icon-wrap ov-item-ph" />
          <span className="ov-trinket-arrow" aria-hidden="true">↔</span>
          <span className="ov-item-icon-wrap ov-item-ph" />
        </div>
        {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
      </ToastShell>
    );
  }

  if (!row) return null;

  return (
    <ToastShell
      className="ov-trinket"
      title={t('overlays.trinketTitle')}
      onClose={onDismiss}
      editing={editing}
      progress={pct}
      ephemeral={!editing}
      leaving={leaving}
      dragProps={dragProps}
    >
      <div className="ov-trinket-row">
        <span className="ov-item-icon-wrap">
          <ItemIcon id={row.fromId} size={40} title="Stealth Ward" />
        </span>
        <span className="ov-trinket-arrow" aria-hidden="true">↔</span>
        <span className="ov-item-icon-wrap">
          <ItemIcon id={row.toId} size={40} title="Oracle Lens" />
        </span>
      </div>
      {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
    </ToastShell>
  );
}

/**
 * Support / Jungle: remind Stealth Ward → Oracle Lens once the clock hits
 * the role window — no need to be in base.
 */
function useTrinketNotify(snap, preview, editing) {
  const [active, setActive] = useState(preview ? PREVIEW_TRINKET : null);
  const [leaving, setLeaving] = useState(false);
  const [remainingMs, setRemainingMs] = useState(TRINKET_TOAST_MS);
  const shownGame = useRef(false);
  const wasInGame = useRef(false);
  const hideTimer = useRef(null);
  const tickTimer = useRef(null);
  const exitTimer = useRef(null);
  const leavingRef = useRef(false);
  const startedAt = useRef(0);
  const activeRef = useRef(null);

  const clearTimers = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    hideTimer.current = null;
    tickTimer.current = null;
    exitTimer.current = null;
  };

  const finishHide = () => {
    clearTimers();
    leavingRef.current = false;
    activeRef.current = null;
    setActive(null);
    setLeaving(false);
    setRemainingMs(0);
  };

  const beginExit = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    exitTimer.current = setTimeout(() => finishHide(), EXIT_MS);
  };

  const dismiss = () => {
    shownGame.current = true;
    beginExit();
  };

  const showRow = (row) => {
    if (!row || activeRef.current || shownGame.current) return;
    clearTimers();
    shownGame.current = true;
    startedAt.current = Date.now();
    activeRef.current = row;
    leavingRef.current = false;
    setLeaving(false);
    setActive(row);
    setRemainingMs(TRINKET_TOAST_MS);
    tickTimer.current = setInterval(() => {
      const left = TRINKET_TOAST_MS - (Date.now() - startedAt.current);
      setRemainingMs(Math.max(0, left));
    }, 100);
    hideTimer.current = setTimeout(() => beginExit(), TRINKET_TOAST_MS);
  };

  useEffect(() => {
    if (preview) {
      setActive(PREVIEW_TRINKET);
      setRemainingMs(TRINKET_TOAST_MS);
      return undefined;
    }
    if (editing) {
      clearTimers();
      setActive(null);
      setLeaving(false);
      return undefined;
    }

    const inGame = !!snap?.inGame;
    if (inGame && !wasInGame.current) {
      shownGame.current = false;
    }
    if (!inGame && wasInGame.current) {
      shownGame.current = false;
      finishHide();
    }
    wasInGame.current = inGame;
    if (!inGame || shownGame.current || activeRef.current) return undefined;

    let cancelled = false;
    const run = async () => {
      try {
        const roster = await window.liveClient?.getRoster?.();
        const you = (roster?.players || []).find((p) => p.isYou);
        const pos = you?.position || '';
        const role = roleFromPosition(pos, snap.you?.champion, null, {
          hasSmite: !!(snap.you?.hasSmite || you?.hasSmite),
          ownedIds: snap.you?.items || [],
        });
        if (cancelled || shownGame.current) return;
        const tip = shouldRemindTrinketSwap({
          role,
          ownedIds: snap.you?.items || [],
          gameTime: snap.gameTime || 0,
          hasSmite: !!(snap.you?.hasSmite || you?.hasSmite),
        });
        if (tip) showRow(tip);
      } catch { /* ignore */ }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    preview,
    editing,
    snap?.inGame,
    Math.floor((snap?.gameTime || 0) / 5),
    (snap?.you?.items || []).join(','),
    snap?.you?.hasSmite,
    snap?.you?.champion,
  ]);

  useEffect(() => () => clearTimers(), []);

  return { active, leaving, dismiss, remainingMs };
}

function SkillRankDots({ current, max }) {
  const n = Math.max(1, Number(max) || 5);
  const filled = Math.max(0, Math.min(n, Number(current) || 0));
  return (
    <span className="ov-skill-dots" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i < filled ? 'is-on' : ''} />
      ))}
    </span>
  );
}

function SkillToast({
  tip,
  editing,
  onDismiss,
  leaving,
  dragProps,
  placeholder,
}) {
  const { t } = useI18n();
  const version = useDdragonVersion();
  const shell = shellProps(editing);

  if (placeholder) {
    return (
      <div className={`ov-toast ov-skill${editing ? ' is-edit' : ''}`} {...shell} {...dragProps}>
        <header className="ov-toast-head">
          <span>{t('overlays.skillTitle')}</span>
        </header>
        <div className="ov-skill-row">
          <span className="ov-skill-champ ov-item-ph" />
          <span className="ov-skill-spell-wrap">
            <span className="ov-skill-spell ov-item-ph" />
            <em className="ov-skill-key">Q</em>
          </span>
          <div className="ov-skill-copy">
            <strong>
              LEVEL 5
              <span className="ov-skill-up" aria-hidden="true" />
            </strong>
            <SkillRankDots current={3} max={5} />
          </div>
        </div>
        {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
      </div>
    );
  }

  if (!tip) return null;

  const champSrc = champIconUrl(tip.champion, version);
  const spellSrc = tip.iconUrl
    || (tip.spellImage ? champSpellImgUrl(tip.spellImage, version) : '');

  return (
    <div
      className={`ov-toast ov-skill${editing ? ' is-edit' : ''}${leaving ? ' is-leaving' : ''} is-ephemeral`}
      {...shell}
      {...dragProps}
    >
      <header className="ov-toast-head">
        <span>{t('overlays.skillTitle')}</span>
        {onDismiss ? (
          <button type="button" className="ov-close" onClick={onDismiss} aria-label="Close">×</button>
        ) : null}
      </header>
      <div className="ov-skill-row">
        <img className="ov-skill-champ" src={champSrc} alt="" />
        <span className="ov-skill-spell-wrap">
          {spellSrc ? (
            <img className="ov-skill-spell" src={spellSrc} alt={tip.spellName || tip.letter} />
          ) : (
            <span className="ov-skill-spell ov-item-ph" />
          )}
          <em className="ov-skill-key">{tip.letter}</em>
        </span>
        <div className="ov-skill-copy">
          <strong>
            {t('overlays.skill.level', { n: tip.champLevel })}
            <span className="ov-skill-up" aria-hidden="true" />
          </strong>
          <SkillRankDots current={tip.currentRank} max={tip.maxRank} />
        </div>
      </div>
      {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
    </div>
  );
}

/**
 * Show while the player has an unspent skill point; hide when spent.
 */
function useSkillNotify(snap, preview, editing) {
  const [tip, setTip] = useState(preview ? PREVIEW_SKILL : null);
  const [leaving, setLeaving] = useState(false);
  const dismissed = useRef(new Set());
  const activeId = useRef('');
  const exitTimer = useRef(null);
  const leavingRef = useRef(false);
  const wasInGame = useRef(false);

  const finishHide = () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = null;
    leavingRef.current = false;
    activeId.current = '';
    setTip(null);
    setLeaving(false);
  };

  const beginExit = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    exitTimer.current = setTimeout(() => finishHide(), EXIT_MS);
  };

  const dismiss = () => {
    if (activeId.current) dismissed.current.add(activeId.current);
    beginExit();
  };

  useEffect(() => {
    if (preview) {
      setTip(PREVIEW_SKILL);
      return undefined;
    }
    if (editing) {
      setTip(null);
      setLeaving(false);
      return undefined;
    }

    const inGame = !!snap?.inGame;
    if (inGame && !wasInGame.current) dismissed.current.clear();
    if (!inGame && wasInGame.current) {
      dismissed.current.clear();
      finishHide();
    }
    wasInGame.current = inGame;
    if (!inGame) return undefined;

    let cancelled = false;
    const run = async () => {
      try {
        const abilities = snap.you?.abilities || {};
        const champLevel = snap.you?.level || 1;
        if (skillPointsAvailable(champLevel, abilities) <= 0) {
          if (activeId.current) beginExit();
          return;
        }

        const roster = await window.liveClient?.getRoster?.();
        const you = (roster?.players || []).find((p) => p.isYou);
        const enemies = (roster?.players || []).filter((p) => you && p.team && p.team !== you.team);

        const skillMeta = await resolveSkillOrderForComp({
          champion: snap.you?.champion,
          position: you?.position || '',
          enemies,
          ownedIds: snap.you?.items || [],
          hasSmite: !!(snap.you?.hasSmite || you?.hasSmite),
        });

        if (cancelled) return;
        const next = await resolveSkillTip({
          champion: snap.you?.champion,
          champLevel,
          abilities,
          skillOrder: skillMeta?.order || null,
          buildLabel: skillMeta?.buildLabel || '',
        });
        if (cancelled) return;
        if (!next || dismissed.current.has(next.id)) {
          if (activeId.current && (!next || next.id !== activeId.current)) beginExit();
          return;
        }
        activeId.current = next.id;
        leavingRef.current = false;
        setLeaving(false);
        setTip(next);
      } catch {
        if (!cancelled && activeId.current) beginExit();
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    preview,
    editing,
    snap?.inGame,
    snap?.you?.champion,
    snap?.you?.level,
    snap?.you?.abilities?.Q,
    snap?.you?.abilities?.W,
    snap?.you?.abilities?.E,
    snap?.you?.abilities?.R,
    snap?.you?.hasSmite,
    (snap?.you?.items || []).join(','),
  ]);

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  return { tip, leaving, dismiss };
}

function WinProbPanel({
  prob,
  editing,
  onDismiss,
  dragProps,
}) {
  const { t } = useI18n();
  const shell = shellProps(editing);
  const blue = Math.max(0, Math.min(100, Number(prob?.blue) || 50));
  const red = Math.max(0, Math.min(100, Number(prob?.red) ?? (100 - blue)));

  return (
    <div className={`ov-toast ov-winprob${editing ? ' is-edit' : ''}`} {...shell} {...dragProps}>
      <header className="ov-toast-head">
        <span>{t('overlays.winProbTitle')}</span>
        {onDismiss ? (
          <button type="button" className="ov-close" onClick={onDismiss} aria-label="Close">×</button>
        ) : null}
      </header>
      <div className="ov-winprob-row">
        <div className="ov-winprob-side is-blue">
          <strong>{blue}%</strong>
          <span>{t('overlays.winProb.blue')}</span>
        </div>
        <div className="ov-winprob-side is-red">
          <strong>{red}%</strong>
          <span>{t('overlays.winProb.red')}</span>
        </div>
      </div>
      <div className="ov-winprob-bar" aria-hidden="true">
        <i style={{ width: `${blue}%` }} />
      </div>
      {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
    </div>
  );
}

const PREVIEW_TFT_COMP = {
  id: 'preview',
  name: 'Elderwood Aphelios',
  tier: 'S',
  traits: [
    { id: 'elderwood', name: 'Elderwood', level: 2, icon: 'https://cdn.metatft.com/file/metatft/traits/da_18_elderwood.png' },
    { id: 'rapidfire', name: 'Rapidfire', level: 2, icon: 'https://cdn.metatft.com/file/metatft/traits/da_18_rapidfire.png' },
  ],
  units: [
    {
      id: 'a',
      name: 'Aphelios',
      cost: 4,
      stars: 3,
      icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_aphelios.png',
      items: [
        { id: 'ie', name: 'Infinity Edge', icon: 'https://cdn.metatft.com/file/metatft/items/da_infinityedge.png' },
        { id: 'lw', name: 'Last Whisper', icon: 'https://cdn.metatft.com/file/metatft/items/da_lastwhisper.png' },
        { id: 'ga', name: 'Giant Slayer', icon: 'https://cdn.metatft.com/file/metatft/items/da_giantslayer.png' },
      ],
    },
    { id: 'b', name: 'Ashe', cost: 2, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_ashe.png', items: [] },
    {
      id: 'c',
      name: 'Gnar',
      cost: 3,
      stars: 2,
      icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_gnar.png',
      items: [
        { id: 'th', name: "Titan's Resolve", icon: 'https://cdn.metatft.com/file/metatft/items/da_titansresolve.png' },
      ],
    },
    { id: 'd', name: 'Ornn', cost: 4, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_ornn.png', items: [] },
    { id: 'e', name: 'Braum', cost: 2, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_braum.png', items: [] },
  ],
  stages: [
    {
      level: 4,
      label: 'Lvl 4',
      winRate: 0.656,
      units: [
        { id: 'e', name: 'Braum', cost: 2, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_braum.png', items: [] },
        { id: 'b', name: 'Ashe', cost: 2, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_ashe.png', items: [] },
        { id: 'd', name: 'Ornn', cost: 4, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_ornn.png', items: [] },
      ],
    },
    {
      level: 5,
      label: 'Lvl 5',
      winRate: 0.722,
      units: [
        { id: 'e', name: 'Braum', cost: 2, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_braum.png', items: [] },
        { id: 'b', name: 'Ashe', cost: 2, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_ashe.png', items: [] },
        { id: 'c', name: 'Gnar', cost: 3, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_gnar.png', items: [] },
        { id: 'd', name: 'Ornn', cost: 4, stars: 2, icon: 'https://cdn.metatft.com/file/metatft/champions/tft18_ornn.png', items: [] },
      ],
    },
  ],
};

function tftUnitIsCore(unit) {
  return Array.isArray(unit?.items) && unit.items.length > 0;
}

function sortTftChecklist(units) {
  return [...(units || [])].sort((a, b) => {
    const ac = tftUnitIsCore(a) ? 1 : 0;
    const bc = tftUnitIsCore(b) ? 1 : 0;
    if (ac !== bc) return bc - ac;
    const costDiff = (Number(b.cost) || 0) - (Number(a.cost) || 0);
    if (costDiff) return costDiff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function TftCompOverlayPanel({
  comp,
  editing,
  placeholder,
  onUnpin,
  dragProps,
}) {
  const { t } = useI18n();
  const shell = shellProps(editing);
  const [open, setOpen] = useState(false);
  const units = sortTftChecklist(comp?.units || []);
  const traits = (comp?.traits || []).slice(0, 3);

  return (
    <div className={`ov-toast ov-tftcomp${editing ? ' is-edit' : ''}${open ? ' is-open' : ''}`} {...shell} {...dragProps}>
      <header className="ov-toast-head">
        <span>{t('overlays.tftCompTitle')}</span>
        <div className="ov-tftcomp-head-actions">
          {comp && !placeholder ? (
            <button
              type="button"
              className="ov-tftcomp-toggle"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? t('overlays.tftCompCollapse') : t('overlays.tftCompExpand')}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : null}
          {onUnpin ? (
            <button type="button" className="ov-close" onClick={onUnpin} aria-label={t('overlays.tftCompUnpin')}>×</button>
          ) : null}
        </div>
      </header>
      {placeholder || !comp ? (
        <p className="ov-tftcomp-empty">{t('overlays.tftCompEmpty')}</p>
      ) : (
        <>
          <div className="ov-tftcomp-title">
            {comp.tier ? <em className={`ov-tftcomp-tier tier-${comp.tier}`}>{comp.tier}</em> : null}
            <strong>{comp.name}</strong>
          </div>
          {/* Compact strip — always visible, MetaTFT-header style but tiny */}
          <div className="ov-tftcomp-strip">
            {units.slice(0, 9).map((u) => {
              const core = tftUnitIsCore(u);
              const items = (u.items || []).slice(0, 3);
              return (
                <div key={u.id} className={`ov-tftcomp-strip-cell${core ? ' is-core' : ''}`} title={u.name}>
                  <span className={`ov-tftcomp-unit cost-${u.cost || 1}`}>
                    {u.icon ? <img src={u.icon} alt="" /> : <b>{(u.name || '?').slice(0, 1)}</b>}
                    <span className="ov-tftcomp-stars" aria-hidden="true">
                      {Array.from({ length: Math.max(1, Math.min(3, u.stars || 2)) }, (_, i) => (
                        <i key={i} />
                      ))}
                    </span>
                    <em className="ov-tftcomp-cost">{u.cost || 1}</em>
                  </span>
                  {items.length ? (
                    <span className="ov-tftcomp-strip-items">
                      {items.map((it) => (
                        <img key={it.id || it.name} src={it.icon} alt="" title={it.name || it.id} />
                      ))}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {open ? (
            <div className="ov-tftcomp-details">
              <p className="ov-tftcomp-hint">{t('overlays.tftCompHint')}</p>
              {traits.length ? (
                <div className="ov-tftcomp-traits">
                  {traits.map((tr) => (
                    <span key={`${tr.id}-${tr.level}`} className="ov-tftcomp-trait" title={tr.name}>
                      {tr.icon ? <img src={tr.icon} alt="" /> : null}
                      <i>{tr.name}</i>
                    </span>
                  ))}
                </div>
              ) : null}
              {(comp.stages || []).filter((s) => s.level !== 'final').length ? (
                <div className="ov-tftcomp-stages">
                  {(comp.stages || [])
                    .filter((s) => s.level !== 'final')
                    .slice(0, 5)
                    .map((stage) => (
                      <div key={String(stage.level)} className="ov-tftcomp-stage">
                        <span className="ov-tftcomp-stage-lvl">{stage.label || `Lvl ${stage.level}`}</span>
                        <div className="ov-tftcomp-stage-units">
                          {(stage.units || []).slice(0, 8).map((u) => (
                            <span key={`${stage.level}-${u.id}`} className={`ov-tftcomp-unit cost-${u.cost || 1}`} title={u.name}>
                              {u.icon ? <img src={u.icon} alt="" /> : <b>{(u.name || '?').slice(0, 1)}</b>}
                            </span>
                          ))}
                        </div>
                        {stage.winRate != null ? (
                          <em className="ov-tftcomp-stage-wr">{`${(Number(stage.winRate) * 100).toFixed(0)}%`}</em>
                        ) : null}
                      </div>
                    ))}
                </div>
              ) : (
                <ul className="ov-tftcomp-list">
                  {units.slice(0, 9).map((u) => {
                    const core = tftUnitIsCore(u);
                    const items = (u.items || []).slice(0, 3);
                    return (
                      <li key={u.id} className={`ov-tftcomp-row${core ? ' is-core' : ''}`}>
                        <span className={`ov-tftcomp-unit cost-${u.cost || 1}`}>
                          {u.icon ? <img src={u.icon} alt="" /> : <b>{(u.name || '?').slice(0, 1)}</b>}
                          <span className="ov-tftcomp-stars" aria-hidden="true">
                            {Array.from({ length: Math.max(1, Math.min(3, u.stars || 2)) }, (_, i) => (
                              <i key={i} />
                            ))}
                          </span>
                          <em className="ov-tftcomp-cost">{u.cost || 1}</em>
                        </span>
                        <div className="ov-tftcomp-row-copy">
                          <div className="ov-tftcomp-row-name">
                            <strong>{u.name}</strong>
                            {core ? <span className="ov-tftcomp-core-badge">{t('overlays.tftCompCoreBadge')}</span> : null}
                          </div>
                          {items.length ? (
                            <span className="ov-tftcomp-row-items">
                              {items.map((it) => (
                                <img key={it.id || it.name} src={it.icon} alt="" title={it.name || it.id} />
                              ))}
                            </span>
                          ) : (
                            <span className="ov-tftcomp-row-meta">{t('overlays.tftCompBoard')}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </>
      )}
      {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
    </div>
  );
}

function usePinnedTftComp(preview) {
  const [comp, setComp] = useState(preview ? PREVIEW_TFT_COMP : null);

  useEffect(() => {
    if (preview) {
      setComp(PREVIEW_TFT_COMP);
      return undefined;
    }
    let alive = true;
    window.tftAPI?.getPinned?.()
      .then((next) => { if (alive) setComp(next || null); })
      .catch(() => { if (alive) setComp(null); });
    const off = window.tftAPI?.onPinned?.((next) => {
      if (alive) setComp(next || null);
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [preview]);

  const unpin = async () => {
    if (preview) return;
    try {
      await window.tftAPI?.setPinned?.(null);
    } catch { /* ignore */ }
    setComp(null);
  };

  return { comp, unpin };
}

function useSuggestionPool(snap, preview) {
  const [pool, setPool] = useState(preview ? PREVIEW_SUGGESTIONS : []);

  useEffect(() => {
    if (preview) {
      setPool(PREVIEW_SUGGESTIONS);
      return undefined;
    }
    if (!snap?.inGame || !snap?.you?.champion) {
      setPool([]);
      return undefined;
    }

    let alive = true;
    const load = async () => {
      try {
        const roster = await window.liveClient?.getRoster?.();
        const you = (roster?.players || []).find((p) => p.isYou);
        const enemies = (roster?.players || []).filter((p) => you && p.team && p.team !== you.team);
        const next = await buildItemSuggestions({
          champion: snap.you.champion,
          position: you?.position || '',
          ownedIds: snap.you.items || [],
          enemies,
          gold: snap.you.gold || 0,
          gameTime: snap.gameTime || 0,
          you: {
            kills: snap.you.kills || 0,
            deaths: snap.you.deaths || 0,
            assists: snap.you.assists || 0,
            cs: snap.you.cs || 0,
            perkIds: snap.you.perkIds || [],
            hasSmite: !!(snap.you.hasSmite || you?.hasSmite),
          },
        });
        if (alive) setPool(next || []);
      } catch {
        if (alive) setPool([]);
      }
    };

    load();
    const id = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [
    preview,
    snap?.inGame,
    snap?.you?.champion,
    (snap?.you?.items || []).join(','),
    Math.floor((snap?.gameTime || 0) / 20),
    Math.floor((snap?.you?.gold || 0) / 40),
    snap?.you?.kills,
    snap?.you?.deaths,
    Math.floor((snap?.you?.cs || 0) / 5),
  ]);

  return pool;
}

/**
 * Shows one item toast per recall (or when the next buy changes after a purchase).
 * No soft-shop / mana hacks — those were re-firing the toast every minute in lane.
 */
function useItemNotify(pool, preview, inBase, editing, inGame = false, ownedKey = '') {
  const [active, setActive] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const hideTimer = useRef(null);
  const tickTimer = useRef(null);
  const exitTimer = useRef(null);
  const enterTimer = useRef(null);
  const leaveTimer = useRef(null);
  const shownThisVisit = useRef(new Set());
  const startedAt = useRef(0);
  const activeRef = useRef(null);
  const leavingRef = useRef(false);
  const poolKeyRef = useRef('');
  const shopOpenRef = useRef(false);
  const wasInGameRef = useRef(false);
  const ownedKeyRef = useRef(ownedKey);
  const canShowRef = useRef(preview || editing || inBase);

  canShowRef.current = preview || editing || inBase;

  const clearTimers = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    if (enterTimer.current) clearTimeout(enterTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    hideTimer.current = null;
    tickTimer.current = null;
    exitTimer.current = null;
    enterTimer.current = null;
    leaveTimer.current = null;
  };

  const finishHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    hideTimer.current = null;
    tickTimer.current = null;
    exitTimer.current = null;
    activeRef.current = null;
    leavingRef.current = false;
    setActive(null);
    setLeaving(false);
    setRemainingMs(0);
  };

  const beginExit = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    exitTimer.current = setTimeout(() => finishHide(), EXIT_MS);
  };

  const dismiss = () => {
    beginExit();
  };

  const showRow = (row) => {
    if (!row || !canShowRef.current) return;
    if (row.id != null && shownThisVisit.current.has(row.id)) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    startedAt.current = Date.now();
    activeRef.current = row;
    leavingRef.current = false;
    setLeaving(false);
    setActive(row);
    setRemainingMs(TOAST_MS);
    if (row.id != null) shownThisVisit.current.add(row.id);

    tickTimer.current = setInterval(() => {
      const left = TOAST_MS - (Date.now() - startedAt.current);
      setRemainingMs(Math.max(0, left));
    }, 100);

    hideTimer.current = setTimeout(() => beginExit(), TOAST_MS);
  };

  // New / ended match → reset.
  useEffect(() => {
    if (preview) return;
    const started = inGame && !wasInGameRef.current;
    const ended = !inGame && wasInGameRef.current;
    wasInGameRef.current = inGame;
    if (!started && !ended) return;
    clearTimers();
    shownThisVisit.current.clear();
    poolKeyRef.current = '';
    shopOpenRef.current = false;
    if (ended) finishHide();
  }, [inGame, preview]);

  // Bought / sold something → allow the *new* next buy once (same recall).
  useEffect(() => {
    if (preview || !inGame) return;
    if (ownedKey === ownedKeyRef.current) return;
    ownedKeyRef.current = ownedKey;
    shownThisVisit.current.clear();
    poolKeyRef.current = '';
  }, [ownedKey, inGame, preview]);

  // Debounced shop visits: sticky fountain flickers must not re-open the toast.
  useEffect(() => {
    if (preview || editing) {
      shopOpenRef.current = inBase;
      return undefined;
    }

    if (inBase) {
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
      if (shopOpenRef.current) return undefined;
      // Confirmed enter (or first poll already in base).
      if (enterTimer.current) clearTimeout(enterTimer.current);
      enterTimer.current = setTimeout(() => {
        enterTimer.current = null;
        if (!canShowRef.current) return;
        shopOpenRef.current = true;
        const row = pool[0];
        if (row) showRow(row);
      }, 400);
      return undefined;
    }

    // Left base — wait before closing the visit (avoids 8s sticky expiry spam).
    if (!shopOpenRef.current) return undefined;
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      shopOpenRef.current = false;
      if (enterTimer.current) {
        clearTimeout(enterTimer.current);
        enterTimer.current = null;
      }
      // Real leave (not sticky flicker) → next recall can tip again.
      shownThisVisit.current.clear();
      poolKeyRef.current = '';
      if (activeRef.current) beginExit();
    }, 4500);

    return undefined;
  }, [inBase, preview, editing, pool]);

  // Next buy changed while still in this shop visit (e.g. finished a component).
  useEffect(() => {
    if (preview || editing) return;
    const next = pool[0];
    const key = next ? String(next.id) : '';
    if (key === poolKeyRef.current) return;
    const hadPrev = !!poolKeyRef.current;
    poolKeyRef.current = key;
    if (!next) {
      if (activeRef.current) beginExit();
      return;
    }
    if (!shopOpenRef.current && !inBase) return;
    if (!hadPrev && inBase) {
      showRow(next);
      return;
    }
    if (hadPrev && (shopOpenRef.current || inBase)) showRow(next);
  }, [pool, preview, editing, inBase]);

  useEffect(() => {
    if (preview) {
      showRow(PREVIEW_SUGGESTIONS[0]);
      return () => clearTimers();
    }
    return undefined;
  }, [preview]);

  useEffect(() => () => clearTimers(), []);

  return { active, remainingMs, dismiss, leaving };
}

function OverlayPanelPreviewInner({ id }) {
  const { t } = useI18n();
  switch (id) {
    case 'bench':
      return <HudCard snap={MOCK} editing={false} />;
    case 'items':
      return (
        <ItemToast
          row={PREVIEW_SUGGESTIONS[0]}
          editing={false}
          gold={780}
          remainingMs={TOAST_MS * 0.7}
        />
      );
    case 'obj':
      return <ObjectiveToast alert={PREVIEW_OBJECTIVE} editing={false} remainingMs={OBJ_TOAST_MS * 0.7} />;
    case 'trinket':
      return <TrinketToast row={PREVIEW_TRINKET} editing={false} remainingMs={TRINKET_TOAST_MS * 0.7} />;
    case 'skill':
      return <SkillToast tip={PREVIEW_SKILL} editing={false} />;
    case 'winprob':
      return <WinProbPanel prob={PREVIEW_WIN_PROB} editing={false} />;
    case 'scout':
      return <ScoutOverlayPanel preview expanded editing={false} game={PREVIEW_SCOUT_GAME} />;
    case 'tftComp':
      return <TftCompOverlayPanel comp={PREVIEW_TFT_COMP} editing={false} />;
    default:
      return <p className="ov-preview-note">{t('overlays.panelsNone')}</p>;
  }
}

/** Single real HUD widget for the Overlays settings gallery. */
export function OverlayPanelPreview({ id }) {
  return (
    <div className={`ov-panel-preview ov-panel-preview--${id}`}>
      <OverlayPanelPreviewInner id={id} />
    </div>
  );
}

export default function OverlayHud({ preview = false }) {
  const { t } = useI18n();
  const { panelEnabled } = useOverlayPanelToggles();
  const [snap, setSnap] = useState(preview ? MOCK : { inGame: false });
  const [editing, setEditing] = useState(false);
  const [attached, setAttached] = useState(null);
  const [gameKind, setGameKind] = useState(null);
  const [applyHint, setApplyHint] = useState('');
  const [benchPos, setBenchPos] = useState({ x: 18, y: 48 });
  const [itemsPos, setItemsPos] = useState({ x: 300, y: 48 });
  const [objPos, setObjPos] = useState({ x: 300, y: 160 });
  const [trinketPos, setTrinketPos] = useState({ x: 300, y: 260 });
  const [skillPos, setSkillPos] = useState({ x: 18, y: 200 });
  const [winprobPos, setWinprobPos] = useState({ x: 18, y: 320 });
  const [scoutPos, setScoutPos] = useState({ x: 240, y: 40 });
  const [tftCompPos, setTftCompPos] = useState({ x: 18, y: 400 });
  const [winProbDismissed, setWinProbDismissed] = useState(false);
  const [scoutExpanded, setScoutExpanded] = useState(true);
  // Hidden until Ctrl+Shift+S; persisted in main across alt-tab remounts.
  const [scoutDismissed, setScoutDismissed] = useState(true);
  const wasInGameWinProb = useRef(false);
  const catalog = useItemCatalog();
  const pool = useSuggestionPool(snap, preview);
  const { comp: pinnedTftComp, unpin: unpinTftComp } = usePinnedTftComp(preview);
  const winProb = preview
    ? PREVIEW_WIN_PROB
    : (snap?.teams ? computeWinProbability(snap.teams, snap.gameTime) : null);
  const shopOpen = !!snap?.you?.inBase;
  const ownedKey = (snap?.you?.items || []).join(',');
  const { active, remainingMs, dismiss, leaving } = useItemNotify(
    pool,
    preview,
    shopOpen,
    editing,
    !!snap?.inGame,
    ownedKey,
  );
  const {
    alert: objAlert,
    leaving: objLeaving,
    dismiss: dismissObj,
    remainingMs: objRemainingMs,
  } = useObjectiveNotify(snap, preview, editing);
  const {
    active: trinketActive,
    leaving: trinketLeaving,
    dismiss: dismissTrinket,
    remainingMs: trinketRemainingMs,
  } = useTrinketNotify(snap, preview, editing);
  const {
    tip: skillTip,
    leaving: skillLeaving,
    dismiss: dismissSkill,
  } = useSkillNotify(snap, preview, editing);
  const close = () => window.liveClient?.closeOverlay();

  useEffect(() => {
    if (preview) return;
    const started = snap.inGame && !wasInGameWinProb.current;
    const ended = !snap.inGame && wasInGameWinProb.current;
    wasInGameWinProb.current = !!snap.inGame;
    if (started || ended) setWinProbDismissed(false);
  }, [snap.inGame, preview]);

  useEffect(() => {
    if (preview) return undefined;
    // Restore after alt-tab remount; stay hidden unless user used Ctrl+Shift+S.
    window.liveClient?.getScoutDismissed?.().then((d) => {
      if (typeof d === 'boolean') setScoutDismissed(d);
    }).catch(() => {});
    const off = window.liveClient?.onScoutToggle?.((state) => {
      if (state && typeof state.dismissed === 'boolean') {
        setScoutDismissed(state.dismissed);
        if (!state.dismissed) {
          setScoutExpanded(true);
        } else {
          /* keep click-through — do not toggle ignoreMouse (cursor flicker) */
        }
        return;
      }
      setScoutDismissed((hidden) => {
        if (hidden) {
          setScoutExpanded(true);
        }
        return !hidden;
      });
    });
    return () => off?.();
  }, [preview]);

  // Click-through stays hard-on while not editing. Do not hit-test / toggle
  // setIgnoreMouse on mousemove — that flickers the Windows cursor.
  useEffect(() => {
    if (preview || editing) return undefined;
    window.liveClient?.setIgnoreMouse?.(true);
    return undefined;
  }, [preview, editing]);

  useEffect(() => {
    if (preview) return undefined;
    document.documentElement.classList.add('rift-overlay');
    window.liveClient?.isEditMode?.().then((v) => setEditing(!!v));
    const offEdit = window.liveClient?.onEditMode?.((v) => {
      setEditing(!!v);
      if (!v) window.liveClient?.setIgnoreMouse?.(true);
    });
    window.liveClient?.getLayout?.().then((layout) => {
      if (layout?.bench) setBenchPos(layout.bench);
      if (layout?.items) setItemsPos(layout.items);
      if (layout?.obj) setObjPos(layout.obj);
      if (layout?.trinket) setTrinketPos(layout.trinket);
      if (layout?.skill) setSkillPos(layout.skill);
      if (layout?.winprob) setWinprobPos(layout.winprob);
      if (layout?.scout) setScoutPos(layout.scout);
      if (layout?.tftComp) setTftCompPos(layout.tftComp);
    });
    const offLayout = window.liveClient?.onLayout?.((layout) => {
      if (layout?.panels?.bench) setBenchPos(layout.panels.bench);
      if (layout?.panels?.items) setItemsPos(layout.panels.items);
      if (layout?.panels?.obj) setObjPos(layout.panels.obj);
      if (layout?.panels?.trinket) setTrinketPos(layout.panels.trinket);
      if (layout?.panels?.skill) setSkillPos(layout.panels.skill);
      if (layout?.panels?.winprob) setWinprobPos(layout.panels.winprob);
      if (layout?.panels?.scout) setScoutPos(layout.panels.scout);
      if (layout?.panels?.tftComp) setTftCompPos(layout.panels.tftComp);
    });
    window.liveClient?.getVideoHint?.().then((v) => {
      if (v?.applyNow) setApplyHint('Esc → Video → Borderless → Apply');
    });
    const offVideo = window.liveClient?.onVideoHint?.((v) => {
      if (v?.applyNow) setApplyHint('Esc → Video → Borderless → Apply');
      else setApplyHint('');
    });
    window.liveClient?.isAttached?.().then((v) => {
      if (v && typeof v === 'object') {
        setAttached(!!v.attached);
        setGameKind(v.kind || null);
      } else {
        setAttached(!!v);
      }
    });
    const offAttach = window.liveClient?.onAttached?.((v) => {
      if (v && typeof v === 'object') {
        setAttached(!!v.attached);
        setGameKind(v.attached ? (v.kind || null) : null);
      } else {
        setAttached(!!v);
      }
    });
    const releaseMouse = () => window.liveClient?.setIgnoreMouse?.(true);
    document.documentElement.addEventListener('mouseleave', releaseMouse);
    let alive = true;
    const tick = async () => {
      if (!window.liveClient?.getSnapshot) return;
      const next = await window.liveClient.getSnapshot();
      if (alive) setSnap(next || { inGame: false });
    };
    tick();
    const id = setInterval(tick, 900);
    return () => {
      alive = false;
      clearInterval(id);
      offVideo?.();
      offAttach?.();
      offEdit?.();
      offLayout?.();
      document.documentElement.removeEventListener('mouseleave', releaseMouse);
      document.documentElement.classList.remove('rift-overlay');
    };
  }, [preview]);

  if (preview) {
    const visiblePreview = OVERLAY_PANEL_LIST.filter(({ id }) => panelEnabled(id));
    return (
      <div className="ov-preview">
        <div className="ov-preview-stage">
          {visiblePreview.length
            ? visiblePreview.map(({ id, titleKey }) => (
              <article key={id} className={`ov-preview-cell${id === 'scout' ? ' is-scout' : ''}`}>
                <h3>{t(titleKey)}</h3>
                <OverlayPanelPreview id={id} />
              </article>
            ))
            : <p className="ov-preview-note">{t('overlays.panelsNone')}</p>}
        </div>
        <p className="ov-preview-note">{t('overlays.previewNote')}</p>
      </div>
    );
  }

  const showBench = panelEnabled('bench');
  const showItems = panelEnabled('items') && (editing || !!active);
  const showObj = panelEnabled('obj') && (editing || !!objAlert);
  const showTrinket = panelEnabled('trinket') && (editing || !!trinketActive);
  const showSkill = panelEnabled('skill') && (editing || !!skillTip);
  const showWinProb = panelEnabled('winprob') && (editing || ((preview || snap.inGame) && !winProbDismissed && !!winProb));
  const showScout = panelEnabled('scout') && (editing || ((preview || snap.inGame) && !scoutDismissed));
  // TFT has no Live Client API — detect via game window kind from the League watcher.
  const inTft = gameKind === 'tft';
  // Static pin — show when pinned, editing, preview, or TFT match (prompt to pin).
  const showTftComp = panelEnabled('tftComp') && (editing || preview || !!pinnedTftComp || inTft);

  return (
    <div className={`ov-root ov-stage${editing ? ' is-editing' : ''}`}>
      {editing ? (
        <div className="ov-edit-banner">{t('overlays.editBanner')}</div>
      ) : null}

      {snap.inGame || editing ? (
        <>
          {showBench ? (
            <DraggablePanel id="bench" pos={benchPos} setPos={setBenchPos} editing={editing}>
              {(dragProps) => (
                <HudCard
                  snap={snap}
                  attached={attached}
                  applyHint={applyHint}
                  editing={editing}
                  onClose={close}
                  dragProps={dragProps}
                />
              )}
            </DraggablePanel>
          ) : null}

          {showItems ? (
            <DraggablePanel id="items" pos={itemsPos} setPos={setItemsPos} editing={editing}>
              {(dragProps) => (
                <ItemToast
                  row={active}
                  placeholder={editing && !active}
                  editing={editing}
                  gold={snap.you?.gold || 0}
                  remainingMs={remainingMs}
                  onDismiss={dismiss}
                  leaving={leaving}
                  dragProps={dragProps}
                />
              )}
            </DraggablePanel>
          ) : null}

          {showObj ? (
            <DraggablePanel id="obj" pos={objPos} setPos={setObjPos} editing={editing}>
              {(dragProps) => (
                <ObjectiveToast
                  alert={objAlert}
                  placeholder={editing && !objAlert}
                  editing={editing}
                  onDismiss={dismissObj}
                  leaving={objLeaving}
                  remainingMs={objRemainingMs}
                  dragProps={dragProps}
                />
              )}
            </DraggablePanel>
          ) : null}

          {showTrinket ? (
            <DraggablePanel id="trinket" pos={trinketPos} setPos={setTrinketPos} editing={editing}>
              {(dragProps) => (
                <TrinketToast
                  row={trinketActive}
                  placeholder={editing && !trinketActive}
                  editing={editing}
                  onDismiss={dismissTrinket}
                  leaving={trinketLeaving}
                  remainingMs={trinketRemainingMs}
                  dragProps={dragProps}
                />
              )}
            </DraggablePanel>
          ) : null}

          {showSkill ? (
            <DraggablePanel id="skill" pos={skillPos} setPos={setSkillPos} editing={editing}>
              {(dragProps) => (
                <SkillToast
                  tip={skillTip}
                  placeholder={editing && !skillTip}
                  editing={editing}
                  onDismiss={dismissSkill}
                  leaving={skillLeaving}
                  dragProps={dragProps}
                />
              )}
            </DraggablePanel>
          ) : null}

          {showWinProb ? (
            <DraggablePanel id="winprob" pos={winprobPos} setPos={setWinprobPos} editing={editing}>
              {(dragProps) => (
                <WinProbPanel
                  prob={winProb}
                  editing={editing}
                  onDismiss={editing ? null : () => setWinProbDismissed(true)}
                  dragProps={dragProps}
                />
              )}
            </DraggablePanel>
          ) : null}

          {showScout ? (
            <DraggablePanel id="scout" pos={scoutPos} setPos={setScoutPos} editing={editing}>
              {(dragProps) => (
                <ScoutOverlayPanel
                  expanded={scoutExpanded}
                  editing={editing}
                  onToggle={() => setScoutExpanded((v) => !v)}
                  onCollapse={() => setScoutExpanded(false)}
                  onDismiss={editing ? null : () => {
                    setScoutDismissed(true);
                    window.liveClient?.setScoutDismissed?.(true);
                    window.liveClient?.setIgnoreMouse?.(true);
                  }}
                  dragProps={dragProps}
                />
              )}
            </DraggablePanel>
          ) : null}
        </>
      ) : showTftComp ? null : showBench && !inTft ? (
        <DraggablePanel id="bench" pos={benchPos} setPos={setBenchPos} editing={editing}>
          {(dragProps) => (
            <ToastShell
              title="Rift.lol"
              onClose={close}
              editing={editing}
              progress={15}
              dragProps={dragProps}
            >
              <p className="ov-wait-copy">{t('overlays.waitLeagueCopy')}</p>
              {editing && <p className="ov-edit-hint">Drag this box · Ctrl+B to lock</p>}
            </ToastShell>
          )}
        </DraggablePanel>
      ) : null}

      {showTftComp ? (
        <DraggablePanel id="tftComp" pos={tftCompPos} setPos={setTftCompPos} editing={editing}>
          {(dragProps) => (
            <TftCompOverlayPanel
              comp={pinnedTftComp}
              placeholder={(editing && !pinnedTftComp) || (inTft && !pinnedTftComp)}
              editing={editing}
              onUnpin={editing || !pinnedTftComp ? null : unpinTftComp}
              dragProps={dragProps}
            />
          )}
        </DraggablePanel>
      ) : null}
    </div>
  );
}
