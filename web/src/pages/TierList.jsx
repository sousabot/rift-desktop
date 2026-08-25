import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTierList } from '../api';
import { useSession } from '../session';
import { REGIONS, champIconUrl, ddragonVersion, platformShort } from '../lib';

const ROLES = ['all', 'Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const RANKS = [
  { id: 'challenger', label: 'Challenger' },
  { id: 'grandmaster', label: 'Grandmaster' },
  { id: 'master_plus', label: 'Master+' },
  { id: 'master', label: 'Master' },
  { id: 'diamond_plus', label: 'Diamond+' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'emerald_plus', label: 'Emerald+' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'platinum_plus', label: 'Platinum+' },
  { id: 'gold_plus', label: 'Gold+' },
];

function tierClass(tier) {
  const t = String(tier || '?');
  if (t.startsWith('S')) return '#ffb454';
  if (t.startsWith('A')) return '#7c5cff';
  if (t.startsWith('B')) return '#5eb8ff';
  if (t.startsWith('C')) return '#8890b5';
  return '#545b7a';
}

export default function TierList() {
  const { session } = useSession();
  const [role, setRole] = useState('all');
  const [rank, setRank] = useState('master');
  const [platform, setPlatform] = useState(session?.platform || 'euw1');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('16.16.1');

  useEffect(() => { ddragonVersion().then(setVersion); }, []);

  useEffect(() => {
    if (session?.platform) setPlatform(session.platform);
  }, [session?.platform]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getTierList({ platform, rank })
      .then((payload) => { if (alive) setData(payload); })
      .catch((err) => { if (alive) { setError(err.message || 'Tier list failed'); setData(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [platform, rank]);

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const q = query.trim().toLowerCase();
    let list = all.filter((row) => {
      if (row.lowSample) return false;
      if (q && !String(row.champion).toLowerCase().includes(q)) return false;
      if (role !== 'all' && row.role !== role) return false;
      // Match desktop: hide off-meta / rare role appearances (<12% lane share).
      if (Number(row.lanePct || 0) < 12) return false;
      return true;
    });
    if (role === 'all') {
      const best = new Map();
      for (const row of list) {
        const prev = best.get(row.champion);
        if (!prev || (row.metaScore ?? row.score) > (prev.metaScore ?? prev.score)) {
          best.set(row.champion, row);
        }
      }
      list = [...best.values()];
    }
    return [...list]
      .sort((a, b) => {
        const ar = role === 'all' ? a.rank : (a.roleRank || a.rank);
        const br = role === 'all' ? b.rank : (b.roleRank || b.rank);
        return ar - br || (b.metaScore ?? b.score) - (a.metaScore ?? a.score);
      })
      .slice(0, 80);
  }, [data, role, query]);

  return (
    <div>
      <header className="page-head">
        <h1>Tier list</h1>
        <p>
          Live Solo/Duo ranked meta by role.
          {data?.patch ? ` Patch ${data.patch}.` : ''}
          {data?.analysed ? ` ${Number(data.analysed).toLocaleString()} games.` : ''}
        </p>
      </header>

      <div className="toolbar">
        {ROLES.map((id) => (
          <button key={id} type="button" className={`chip${role === id ? ' is-on' : ''}`} onClick={() => setRole(id)}>
            {id === 'all' ? 'All roles' : id}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={{ background: '#0b0e16', border: '1px solid var(--line)', color: '#fff', borderRadius: 10, padding: '8px 10px' }}
        >
          {REGIONS.map((r) => <option key={r.platform} value={r.platform}>{r.short}</option>)}
        </select>
        <select
          value={rank}
          onChange={(e) => setRank(e.target.value)}
          style={{ background: '#0b0e16', border: '1px solid var(--line)', color: '#fff', borderRadius: 10, padding: '8px 10px' }}
        >
          {RANKS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search champion…"
          style={{ flex: 1, minWidth: 160, background: '#0b0e16', border: '1px solid var(--line)', color: '#fff', borderRadius: 10, padding: '8px 10px' }}
        />
      </div>

      {loading ? <div className="note">Loading tier list…</div> : null}
      {error ? <div className="note is-error">{error}</div> : null}

      {!loading && !error ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '56px 1.4fr 70px 90px 90px 90px 90px',
            gap: 8,
            padding: '10px 14px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            borderBottom: '1px solid var(--line)',
          }}>
            <span>#</span>
            <span>Champion</span>
            <span>Tier</span>
            <span>WR</span>
            <span>PR</span>
            <span>BR</span>
            <span>Games</span>
          </div>
          {rows.map((row, i) => (
            <Link
              key={`${row.champion}-${row.role}-${i}`}
              to={`/tierlist/${encodeURIComponent(row.champion)}?role=${encodeURIComponent(row.role)}&rank=${encodeURIComponent(rank)}&platform=${encodeURIComponent(platform)}${data?.patch ? `&patch=${encodeURIComponent(data.patch)}` : ''}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '56px 1.4fr 70px 90px 90px 90px 90px',
                gap: 8,
                alignItems: 'center',
                padding: '10px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontSize: 13,
              }}
              className="tl-row"
            >
              <span className="mono muted">{i + 1}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <img src={champIconUrl(row.champion, version)} alt="" width={28} height={28} style={{ borderRadius: 6 }} />
                <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.champion}
                  <span className="muted" style={{ fontWeight: 500 }}> · {row.role}</span>
                </span>
              </span>
              <strong style={{ color: tierClass(row.tier) }}>{row.tier}</strong>
              <span className="mono">{Number(row.winrate).toFixed(1)}%</span>
              <span className="mono muted">{Number(row.pickrate).toFixed(1)}%</span>
              <span className="mono muted">{Number(row.banrate).toFixed(1)}%</span>
              <span className="mono muted">{Number(row.games).toLocaleString()}</span>
            </Link>
          ))}
          {!rows.length ? <div className="note" style={{ margin: 12 }}>No champions match these filters.</div> : null}
        </div>
      ) : null}

      <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
        Showing {platformShort(platform)} · {RANKS.find((r) => r.id === rank)?.label || rank}
      </p>
    </div>
  );
}
