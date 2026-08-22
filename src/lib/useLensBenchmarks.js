import { useEffect, useState } from 'react';

const LADDER_TIER_COUNT = 10;

export function useLensBenchmarks({ platform, role, queue = 420 }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  const tierCount = (data) => Object.values(data?.stats || {}).filter((row) => row?.n > 0).length;
  const isComplete = (data) => tierCount(data) >= LADDER_TIER_COUNT && !data?.refreshing;

  useEffect(() => {
    const api = window.riotAPI;
    if (!api?.getLensBenchmarks) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    api.getLensBenchmarks({ platform, role: role || '', queue }).then((data) => {
      if (!cancelled) {
        setPayload(data);
        setLoading(!tierCount(data));
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    const off = api.onLensBenchmarksReady?.((data) => {
      if (cancelled) return;
      if (!data?.key) return;
      const want = `${platform || 'euw1'}:${queue}:${role || 'all'}`;
      if (data.key !== want) return;
      setPayload(data);
      setLoading(!isComplete(data) && tierCount(data) === 0);
    });

    return () => {
      cancelled = true;
      off?.();
    };
  }, [platform, role, queue]);

  const tierStats = (tierKey) => payload?.stats?.[tierKey] || null;
  const statLadder = (statKey) => {
    const out = {};
    for (const [tier, row] of Object.entries(payload?.stats || {})) {
      const val = row?.[statKey];
      if (val != null && Number.isFinite(val)) out[tier] = val;
    }
    return out;
  };

  const filled = tierCount(payload);

  return {
    payload,
    loading: loading && filled === 0,
    refreshing: !!payload?.refreshing || (filled > 0 && filled < LADDER_TIER_COUNT),
    matches: payload?.matches || 0,
    tierStats,
    statLadder,
  };
}
