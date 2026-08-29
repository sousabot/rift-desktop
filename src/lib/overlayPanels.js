import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_OVERLAY_PANELS = {
  bench: true,
  items: true,
  obj: true,
  trinket: true,
  skill: true,
  winprob: true,
  scout: true,
  tftComp: true,
};

/** Gallery metadata for the Overlays settings page (DPM-style cards). */
export const OVERLAY_PANEL_LIST = [
  {
    id: 'bench',
    section: 'overlays',
    size: 'hero',
    titleKey: 'overlays.benchTitle',
    descKey: 'overlays.panelDesc.bench',
    preview: 'bench',
  },
  {
    id: 'skill',
    section: 'overlays',
    size: 'sm',
    titleKey: 'overlays.skillTitle',
    descKey: 'overlays.panelDesc.skill',
    preview: 'skill',
  },
  {
    id: 'scout',
    section: 'overlays',
    size: 'md',
    titleKey: 'overlays.scoutTitle',
    descKey: 'overlays.panelDesc.scout',
    preview: 'scout',
  },
  {
    id: 'tftComp',
    section: 'overlays',
    size: 'sm',
    titleKey: 'overlays.tftCompTitle',
    descKey: 'overlays.panelDesc.tftComp',
    preview: 'tftComp',
  },
  {
    id: 'items',
    section: 'notifications',
    size: 'tall',
    titleKey: 'overlays.itemsTitle',
    descKey: 'overlays.panelDesc.items',
    preview: 'items',
  },
  {
    id: 'winprob',
    section: 'notifications',
    size: 'sm',
    titleKey: 'overlays.winProbTitle',
    descKey: 'overlays.panelDesc.winprob',
    preview: 'winprob',
  },
  {
    id: 'trinket',
    section: 'notifications',
    size: 'sm',
    titleKey: 'overlays.trinketTitle',
    descKey: 'overlays.panelDesc.trinket',
    preview: 'trinket',
  },
  {
    id: 'obj',
    section: 'notifications',
    size: 'sm',
    titleKey: 'overlays.objTitle',
    descKey: 'overlays.panelDesc.obj',
    preview: 'obj',
  },
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
