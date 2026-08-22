import { useEffect, useRef, useState } from 'react';
import { getLiveGame } from '../services/riotApi';
import { useSession } from '../state/SessionContext';

/**
 * Poll spectator + ranked data for the current live game (Porofessor-style scout).
 */
export function useLiveScoutGame(enabled = true) {
  const { session } = useSession();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const hasRows = useRef(false);

  useEffect(() => {
    if (!enabled || !session?.gameName || !session?.tagLine) {
      setGame(null);
      setLoading(false);
      setEnriching(false);
      hasRows.current = false;
      return undefined;
    }

    let alive = true;
    const load = async () => {
      if (!hasRows.current) setLoading(true);
      else setEnriching(true);
      try {
        const next = await getLiveGame(
          {
            gameName: session.gameName,
            tagLine: session.tagLine,
            region: session.region || 'europe',
            platform: session.platform || 'euw1',
          },
          {
            onPartial: (partial) => {
              if (!alive || !partial) return;
              hasRows.current = true;
              setGame((prev) => (prev ? mergeScoutGame(prev, partial) : partial));
              setLoading(false);
            },
          },
        );
        if (!alive) return;
        if (next) {
          hasRows.current = true;
          setGame((prev) => (prev ? mergeScoutGame(prev, next) : next));
          setError('');
        } else if (!hasRows.current) {
          setGame(null);
        }
      } catch (err) {
        if (!alive) return;
        setError(err?.message || 'Could not load live game');
      } finally {
        if (alive) {
          setLoading(false);
          setEnriching(false);
        }
      }
    };

    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [
    enabled,
    session?.gameName,
    session?.tagLine,
    session?.region,
    session?.platform,
  ]);

  return { game, loading, enriching, error };
}

function mergeScoutGame(prev, next) {
  const oldById = {};
  [...(prev.blue || []), ...(prev.red || [])].forEach((p) => {
    if (p?.puuid) oldById[p.puuid] = p;
  });
  const mergePlayer = (p) => {
    const old = oldById[p.puuid];
    if (!old) return p;
    let row = p;
    if ((!p.gameName || p.gameName === 'Unknown') && old.gameName && old.gameName !== 'Unknown') {
      row = { ...row, gameName: old.gameName, tagLine: old.tagLine, riotId: old.riotId };
    }
    if (p.rankUnknown && old.rank && old.rank !== 'Unranked' && !old.rankUnknown) {
      row = {
        ...row,
        rank: old.rank,
        rankUnknown: false,
        lp: old.lp,
        wins: old.wins,
        losses: old.losses,
      };
    }
    if (!p.recentMainRole && old.recentMainRole) {
      row = { ...row, recentMainRole: old.recentMainRole };
    }
    if (!p.recentGames && old.recentGames) {
      row = { ...row, recentGames: old.recentGames };
    }
    if ((!p.last3 || !p.last3.length) && old.last3?.length) {
      row = {
        ...row,
        last3: old.last3,
        streak: old.streak ?? row.streak,
        champGames: old.champGames || row.champGames,
        champWins: old.champWins ?? row.champWins,
        champWr: old.champWr ?? row.champWr,
        recentMainRole: old.recentMainRole || row.recentMainRole,
        recentGames: old.recentGames || row.recentGames,
      };
    }
    return row;
  };
  return {
    ...next,
    blue: (next.blue || []).map(mergePlayer),
    red: (next.red || []).map(mergePlayer),
  };
}
