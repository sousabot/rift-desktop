import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getLeaderboard } from '../api';
import { useSession } from '../session';
import { REGIONS, ddragonVersion, platformShort, profileIconUrl } from '../lib';

const TIERS = [
  { id: 'challenger', label: 'Challenger', color: '#ffd76b' },
  { id: 'grandmaster', label: 'Grandmaster', color: '#ff5c68' },
  { id: 'master', label: 'Master', color: '#a06bff' },
];

function wrOf(row) {
  return Math.round((row.wins / Math.max(1, (row.wins || 0) + (row.losses || 0))) * 100);
}

export default function Leaderboard() {
  const { session } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const tierParam = searchParams.get('tier');
  const [tier, setTier] = useState(() => (
    TIERS.some((t) => t.id === tierParam) ? tierParam : 'challenger'
  ));
  const [platform, setPlatform] = useState(session?.platform || 'euw1');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('16.16.1');

  useEffect(() => { ddragonVersion().then(setVersion); }, []);

  useEffect(() => {
    if (TIERS.some((t) => t.id === tierParam)) setTier(tierParam);
  }, [tierParam]);

  useEffect(() => {
    if (session?.platform) setPlatform(session.platform);
  }, [session?.platform]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getLeaderboard({ tier, platform })
      .then((payload) => { if (alive) setData(payload); })
      .catch((err) => { if (alive) { setError(err.message || 'Leaderboard failed'); setData(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tier, platform]);

  const pickTier = (id) => {
    setTier(id);
    const next = new URLSearchParams(searchParams);
    next.set('tier', id);
    setSearchParams(next, { replace: true });
  };

  const entries = data?.entries || [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const tone = TIERS.find((t) => t.id === tier)?.color || '#ffd76b';

  return (
    <div>
      <header className="page-head">
        <h1>Leaderboards</h1>
        <p>Top Solo/Duo ladder for {platformShort(platform)}. Names refresh every few minutes.</p>
      </header>

      <div className="toolbar">
        {TIERS.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`chip${tier === row.id ? ' is-on' : ''}`}
            onClick={() => pickTier(row.id)}
            style={tier === row.id ? { borderColor: row.color, color: '#fff' } : undefined}
          >
            {row.label}
          </button>
        ))}
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={{ marginLeft: 'auto', background: '#0b0e16', border: '1px solid var(--line)', color: '#fff', borderRadius: 10, padding: '8px 10px' }}
        >
          {REGIONS.map((r) => <option key={r.platform} value={r.platform}>{r.short}</option>)}
        </select>
      </div>

      {loading ? <div className="note">Loading ladder…</div> : null}
      {error ? <div className="note is-error">{error}</div> : null}

      {!loading && !error && podium.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
          {podium.map((row) => (
            <div key={row.puuid || row.rank} className="card" style={{ textAlign: 'center' }}>
              <div style={{ color: tone, fontFamily: 'var(--display)', fontWeight: 800, fontSize: 18 }}>#{row.rank}</div>
              {row.profileIconId ? (
                <img
                  src={profileIconUrl(row.profileIconId, version)}
                  alt=""
                  width={52}
                  height={52}
                  style={{ borderRadius: 14, margin: '10px auto' }}
                />
              ) : null}
              <div style={{ fontWeight: 700 }}>{row.gameName}</div>
              <div className="muted" style={{ fontSize: 12 }}>#{row.tagLine}</div>
              <div className="mono" style={{ marginTop: 10, color: tone, fontWeight: 700 }}>{row.lp.toLocaleString()} LP</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{row.wins}W – {row.losses}L · {wrOf(row)}%</div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {rest.map((row) => (
            <div
              key={row.puuid || row.rank}
              style={{
                display: 'grid',
                gridTemplateColumns: '48px 44px 1.4fr 100px 140px',
                gap: 10,
                alignItems: 'center',
                padding: '10px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <span className="mono muted">{row.rank}</span>
              {row.profileIconId ? (
                <img src={profileIconUrl(row.profileIconId, version)} alt="" width={36} height={36} style={{ borderRadius: 10 }} />
              ) : <span />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.gameName}</div>
                <div className="muted" style={{ fontSize: 12 }}>#{row.tagLine}</div>
              </div>
              <div className="mono" style={{ fontWeight: 700, color: tone }}>{row.lp.toLocaleString()} LP</div>
              <div className="muted" style={{ fontSize: 12 }}>{row.wins}W – {row.losses}L · {wrOf(row)}%</div>
            </div>
          ))}
          {!entries.length ? <div className="note" style={{ margin: 12 }}>No ladder entries for this region/tier.</div> : null}
        </div>
      ) : null}
    </div>
  );
}
