import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/LocaleContext';
import OverlayHud from './OverlayHud';
import { useOverlayPanelToggles, OVERLAY_PANEL_LIST } from '../lib/overlayPanels';
import './Overlays.css';

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
    setInGame(!!snap?.inGame);
    if (mode) setVideo(mode);
    if (st) setStatus(st);
    setAttached(!!onLeague);
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
  const enabledCount = OVERLAY_PANEL_LIST.filter(({ id }) => panels[id] !== false).length;

  return (
    <div className="ovp-page">
      <header className="ovp-head">
        <span className="ovp-kicker">{t('nav.overlays')}</span>
        <h1>{t('overlays.title')}</h1>
        <p>{t('overlays.blurb')}</p>
      </header>

      <section className="ovp-card ovp-card--control">
        <div className="ovp-control-top">
          <div className="ovp-control-copy">
            <h2>{t('overlays.hudTitle')}</h2>
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
                    <span className="ovp-badge is-muted">
                      {t('overlays.videoMode', { mode: modeLabel })}
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            className={`ovp-btn ovp-btn--lg${open ? ' is-on' : ''}`}
            onClick={toggle}
            disabled={!hasApi}
          >
            {open ? t('overlays.hide') : t('overlays.show')}
          </button>
        </div>

        <div className="ovp-setting-row">
          <div className="ovp-setting-copy">
            <strong>{t('overlays.settingClickThrough')}</strong>
            <p>{t('overlays.settingClickThroughDesc')}</p>
          </div>
          <label className="ovp-switch">
            <input
              type="checkbox"
              checked={clickThrough}
              onChange={toggleClick}
              disabled={!hasApi}
            />
            <span aria-hidden="true" />
          </label>
        </div>

        <div className="ovp-hotkeys">
          <h3>{t('overlays.hotkeysTitle')}</h3>
          <ul>
            <li>{t('overlays.hotkeyEdit')}</li>
            <li>{t('overlays.hotkeyScout')}</li>
          </ul>
        </div>

        <div className="ovp-warn">
          {video?.applyNow ? t('overlays.warnApply') : t('overlays.warnBorderless')}
        </div>
      </section>

      <section className="ovp-card">
        <header className="ovp-section-head">
          <div>
            <h2>{t('overlays.panelsTitle')}</h2>
            <p>{t('overlays.panelsLead')}</p>
          </div>
          <span className="ovp-count">
            {enabledCount}/{OVERLAY_PANEL_LIST.length}
          </span>
        </header>
        <div className="ovp-panels-grid">
          {OVERLAY_PANEL_LIST.map(({ id, titleKey, descKey }) => {
            const on = panels[id] !== false;
            return (
              <label key={id} className={`ovp-panel-toggle${on ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setPanel(id, e.target.checked)}
                  disabled={!hasApi}
                />
                <span className="ovp-panel-toggle-body">
                  <strong>{t(titleKey)}</strong>
                  <span>{t(descKey)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="ovp-card ovp-card--preview">
        <header className="ovp-section-head">
          <div>
            <h2>{t('overlays.preview')}</h2>
            <p>{t('overlays.previewLead')}</p>
          </div>
        </header>
        <OverlayHud preview />
      </section>
    </div>
  );
}
