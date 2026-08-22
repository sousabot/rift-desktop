import { useEffect, useState } from 'react';
import { getSummonerDashboard, peekSummonerDashboard } from '../services/riotApi';
import { parseRiotId } from './playerRoute';
import { apiUserMessage, noticeFromError } from './apiNotice';
import { MODE_QUEUE } from './queues';
import { useI18n } from '../i18n/LocaleContext';

export function useDashboardProfile({ session, riotId, mode = 'Solo', count = 20 }) {
  const { t } = useI18n();
  const region = session?.region || 'europe';
  const platform = session?.platform || 'euw1';
  const queue = MODE_QUEUE[mode];
  const parsed = parseRiotId(riotId, session?.tagLine || '');
  const args = parsed
    ? { gameName: parsed.gameName, tagLine: parsed.tagLine, region, platform, queue, count }
    : null;
  const warm = args ? peekSummonerDashboard(args) : null;

  const [profile, setProfile] = useState(warm);
  const [loading, setLoading] = useState(!!parsed && !warm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!riotId) {
      setProfile(null);
      setError('');
      setLoading(false);
      return undefined;
    }
    const next = parseRiotId(riotId, session?.tagLine || '');
    if (!next) {
      setProfile(null);
      setError(t('history.needTag'));
      setLoading(false);
      return undefined;
    }

    const request = {
      gameName: next.gameName,
      tagLine: next.tagLine,
      region,
      platform,
      queue: MODE_QUEUE[mode],
      count,
    };
    const cached = peekSummonerDashboard(request);
    if (cached) {
      setProfile(cached);
      setError('');
      setLoading(false);
    } else {
      setLoading(true);
    }

    let cancelled = false;
    getSummonerDashboard(request).then((data) => {
      if (!cancelled) {
        setProfile(data);
        setError('');
      }
    }).catch((err) => {
      noticeFromError(err);
      if (!cancelled) {
        setError(apiUserMessage(err) || t('studio.loadFail'));
        if (!cached) setProfile(null);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [riotId, mode, region, platform, session?.tagLine, count, t]);

  return { profile, loading, error };
}
