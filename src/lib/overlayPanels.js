import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_OVERLAY_PANELS = {
  bench: true,
  items: true,
  obj: true,
  trinket: true,
  skill: true,
  winprob: true,
  scout: true,
};

export const OVERLAY_PANEL_LIST = [
  { id: 'bench', titleKey: 'overlays.benchTitle', descKey: 'overlays.panelDesc.bench' },
  { id: 'items', titleKey: 'overlays.itemsTitle', descKey: 'overlays.panelDesc.items' },
  { id: 'obj', titleKey: 'overlays.objTitle', descKey: 'overlays.panelDesc.obj' },
  { id: 'trinket', titleKey: 'overlays.trinketTitle', descKey: 'overlays.panelDesc.trinket' },
  { id: 'skill', titleKey: 'overlays.skillTitle', descKey: 'overlays.panelDesc.skill' },
  { id: 'winprob', titleKey: 'overlays.winProbTitle', descKey: 'overlays.panelDesc.winprob' },
  { id: 'scout', titleKey: 'overlays.scoutTitle', descKey: 'overlays.panelDesc.scout' },
];

export function normalizeOverlayPanels(raw) {
  const next = { ...DEFAULT_OVERLAY_PANELS };
  if (raw && typeof raw === 'object') {
    for (const { id } of OVERLAY_PANEL_LIST) {
      if (typeof raw[id] === 'boolean') next[id] = raw[id];
    }
  }
  return next;
}

export function isPanelEnabled(panels, id) {
  return panels?.[id] !== false;
}

export function useOverlayPanelToggles() {
  const [panels, setPanels] = useState(DEFAULT_OVERLAY_PANELS);

  useEffect(() => {
    let alive = true;
    window.liveClient?.getPanelToggles?.()
      .then((next) => {
        if (alive && next) setPanels(normalizeOverlayPanels(next));
      })
      .catch(() => {});
    const off = window.liveClient?.onPanelToggles?.((next) => {
      if (next) setPanels(normalizeOverlayPanels(next));
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const setPanel = useCallback(async (id, enabled) => {
    setPanels((cur) => ({ ...cur, [id]: !!enabled }));
    try {
      const next = await window.liveClient?.setPanelToggle?.(id, enabled);
      if (next) setPanels(normalizeOverlayPanels(next));
    } catch { /* ignore */ }
  }, []);

  return { panels, setPanel, panelEnabled: (id) => isPanelEnabled(panels, id) };
}
