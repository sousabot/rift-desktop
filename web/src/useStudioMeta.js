import { useEffect, useState } from 'react';
import { getStudioMeta } from './api';

export function useStudioMeta({ platform, queue = 420, enabled = true }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(!!enabled);

  useEffect(() => {
    if (!enabled) {
      setPayload(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    getStudioMeta({ platform, queue, view: 'home' }).then((data) => {
      if (!cancelled) {
        setPayload(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [platform, queue, enabled]);

  return {
    players: payload?.players || 0,
    matches: payload?.matches || 0,
    distribution: payload?.distribution || null,
    updatedAt: payload?.updatedAt || null,
    loading: enabled && loading,
    error: payload?.error || null,
    platform: payload?.platform || platform,
  };
}

export function useStudioView({
  view,
  platform,
  queue = 420,
  role = '',
  tier = 'emerald_plus',
  timeframe = '30days',
  dimension = 'champion',
  enabled = true,
}) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(!!enabled && view !== 'home');

  useEffect(() => {
    if (!enabled || !view || view === 'home') {
      setPayload(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setPayload(null);

    getStudioMeta({
      view,
      platform,
      queue,
      role,
      tier,
      timeframe,
      dimension,
    }).then((data) => {
      if (!cancelled) {
        setPayload(data);
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setPayload({ error: err?.message || 'Failed to load', rows: [] });
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [view, platform, queue, role, tier, timeframe, dimension, enabled]);

  return {
    rows: payload?.rows || [],
    max: payload?.max ?? null,
    totalPlayers: payload?.totalPlayers ?? null,
    totalMatches: payload?.totalMatches ?? null,
    updatedAt: payload?.updatedAt || null,
    loading: enabled && loading,
    error: payload?.error || null,
    source: payload?.source || null,
    dimension: payload?.dimension || dimension,
  };
}
