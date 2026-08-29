import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/LocaleContext';
import { OverlayPanelPreview } from './OverlayHud';
import { useOverlayPanelToggles, OVERLAY_PANEL_LIST } from '../lib/overlayPanels';
import './Overlays.css';
import './OverlayHud.css';

function IconOverlays() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="14" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="7" y="9" width="14" height="11" rx="2" fill="currentColor" opacity="0.35" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconNotify() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M6 8h12v10H6zM9 8V6a3 3 0 0 1 6 0v2" />
      <path fill="currentColor" d="M10 20h4a2 2 0 0 1-4 0Z" />
    </svg>
  );
}

function OverlayCard({ panel, on, disabled, onToggle, t }) {
  return (
    <article className={`ovp-tile ovp-tile--${panel.size} ovp-tile--id-${panel.id}${on ? ' is-on' : ''}`}>
      <div className={`ovp-tile-visual ovp-tile-visual--${panel.id}`}>
        <OverlayPanelPreview id={panel.id} />
      </div>
      <div className="ovp-tile-foot">
        <div className="ovp-tile-copy">
          <h3>{t(panel.titleKey)}</h3>
          <p>{t(panel.descKey)}</p>
        </div>
        <label className="ovp-switch">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => onToggle(panel.id, e.target.checked)}
            disabled={disabled}
          />
          <span aria-hidden="true" />
        </label>
      </div>
    </article>
  );
}

export default function Overlays() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [clickThrough, setClickThrough] = useState(true);
  const [inGame, setInGame] = useState(false);
  const [video, setVideo] = useState(null);
  const [status, setStatus] = useState(null);
  const [attached, setAttached] = useState(false);
  const hasApi = typeof window !== 'undefined' && !!window.liveClient;
  const { panels, setPanel } = useOverlayPanelToggles();

  const refresh = async () => {
    if (!window.liveClient) return;
    const [isOpen, through, snap, mode, st, onLeague] = await Promise.all([
      window.liveClient.isOverlayOpen(),
      window.liveClient.getClickThrough(),
      window.liveClient.getSnapshot(),
      window.liveClient.getVideoMode?.() || Promise.resolve(null),
      window.liveClient.getStatus?.() || Promise.resolve(null),
      window.liveClient.isAttached?.() || Promise.resolve(false),
    ]);
    setOpen(!!isOpen);
    setClickThrough(through !== false);
    const attachOn = typeof onLeague === 'object' ? !!onLeague?.attached : !!onLeague;
    const kind = (typeof onLeague === 'object' && onLeague?.kind)
      || st?.kind
      || null;
    setInGame(!!snap?.inGame || (attachOn && kind === 'tft'));
    if (mode) setVideo(mode);
    if (st) setStatus(st);
    setAttached(attachOn);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  const toggle = async () => {
    if (!window.liveClient) return;
    if (open) await window.liveClient.closeOverlay();
    else {
      const result = await window.liveClient.openOverlay();
      if (result?.video) setVideo(result.video);
    }
    refresh();
  };

  const toggleClick = async () => {
    if (!window.liveClient) return;
    const next = await window.liveClient.setClickThrough(!clickThrough);
    setClickThrough(!!next);
  };

  const modeLabel = video?.label || status?.video?.label;
  const overlayPanels = OVERLAY_PANEL_LIST.filter((p) => p.section === 'overlays');
  const notifyPanels = OVERLAY_PANEL_LIST.filter((p) => p.section === 'notifications');

  return (
    <div className="ovp-page">
      <div className="ovp-control">
        <div className="ovp-control-main">
          <div>
            <strong>{t('overlays.hudTitle')}</strong>
            <div className="ovp-badges">
              {!hasApi ? (
                <span className="ovp-badge is-warn">{t('overlays.badgeNeedRestart')}</span>
              ) : (
                <>
                  <span className={`ovp-badge${open ? ' is-on' : ''}`}>
                    {open ? t('overlays.badgeOverlayOn') : t('overlays.badgeOverlayOff')}
                  </span>
                  <span className={`ovp-badge${inGame ? ' is-live' : ''}`}>
                    {inGame ? t('overlays.badgeInGame') : t('overlays.badgeWaiting')}
                  </span>
                  {open ? (
                    <span className={`ovp-badge${attached ? ' is-live' : ''}`}>
                      {attached ? t('overlays.badgeAttached') : t('overlays.badgeNotAttached')}
                    </span>
                  ) : null}
                  {modeLabel ? (
                    <span className="ovp-badge is-muted">{t('overlays.videoMode', { mode: modeLabel })}</span>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            className={`ovp-btn${open ? ' is-on' : ''}`}
            onClick={toggle}
            disabled={!hasApi}
          >
            {open ? t('overlays.hide') : t('overlays.show')}
          </button>
        </div>
        <div className="ovp-control-row">
          <div>
            <strong>{t('overlays.settingClickThrough')}</strong>
            <p>{t('overlays.settingClickThroughDesc')}</p>
          </div>
          <label className="ovp-switch">
            <input type="checkbox" checked={clickThrough} onChange={toggleClick} disabled={!hasApi} />
            <span aria-hidden="true" />
          </label>
        </div>
        <p className="ovp-warn">
          {video?.applyNow ? t('overlays.warnApply') : t('overlays.warnBorderless')}
        </p>
        <p className="ovp-hotkeys">
          {t('overlays.hotkeyEdit')} · {t('overlays.hotkeyScout')}
        </p>
      </div>

      <section className="ovp-section">
        <header className="ovp-section-head">
          <span className="ovp-section-ico"><IconOverlays /></span>
          <div>
            <h2>{t('overlays.sectionOverlays')}</h2>
            <p>{t('overlays.sectionOverlaysLead')}</p>
          </div>
        </header>
        <div className="ovp-gallery ovp-gallery--overlays">
          {overlayPanels.map((panel) => (
            <OverlayCard
              key={panel.id}
              panel={panel}
              on={panels[panel.id] !== false}
              disabled={!hasApi}
              onToggle={setPanel}
              t={t}
            />
          ))}
        </div>
      </section>

      <section className="ovp-section">
        <header className="ovp-section-head">
          <span className="ovp-section-ico"><IconNotify /></span>
          <div>
            <h2>{t('overlays.sectionNotifications')}</h2>
            <p>{t('overlays.sectionNotificationsLead')}</p>
          </div>
        </header>
        <div className="ovp-gallery ovp-gallery--notify">
          {notifyPanels.map((panel) => (
            <OverlayCard
              key={panel.id}
              panel={panel}
              on={panels[panel.id] !== false}
              disabled={!hasApi}
              onToggle={setPanel}
              t={t}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
