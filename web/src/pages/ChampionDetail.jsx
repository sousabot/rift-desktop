import React, { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { peekChampionDetail, refreshChampionDetail, peekTierList, hydrateTierListFromSnapshot } from '../api';
import {
  champCenteredUrl,
  champDdragonId,
  champIconUrl,
  ddragonVersion,
  getRuneIndex,
  itemIconUrl,
  passiveIconUrl,
  runeIconUrl,
  spellIconUrl,
  summonerIconUrl,
} from '../lib';

const ROLES = [
  { id: 'Top', key: 'top' },
  { id: 'Jungle', key: 'jungle' },
  { id: 'Mid', key: 'middle' },
  { id: 'ADC', key: 'bottom' },
  { id: 'Support', key: 'support' },
];

const VS_ROLES = [
  { id: 'all', key: 'all', label: 'All' },
  { id: 'Top', key: 'top', label: 'Top' },
  { id: 'Jungle', key: 'jungle', label: 'Jungle' },
  { id: 'Mid', key: 'middle', label: 'Mid' },
  { id: 'ADC', key: 'bottom', label: 'Bot' },
  { id: 'Support', key: 'support', label: 'Support' },
];

function emblemUrl(id) {
  const tier = String(id || 'challenger').replace('_plus', '').replace(/_.*/, '');
  return `https://opgg-static.akamaized.net/images/medals_new/${tier}.png`;
}

function tierClass(tier) {
  const t = String(tier || '?');
  if (t === 'S+') return 'Sp';
  if (t === 'S') return 'S';
  if (t === 'S-') return 'Sm';
  if (t.startsWith('A')) return 'A';
  if (t.startsWith('B')) return 'B';
  if (t.startsWith('C')) return 'C';
  if (t.startsWith('D')) return 'D';
  return 'na';
}

function fmtPct(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function fmtGames(n) {
  return Number(n || 0).toLocaleString();
}

function wrTone(wr, avg = 50) {
  const v = Number(wr) || 0;
  if (v >= avg + 1.5) return 'is-up';
  if (v <= avg - 1.5) return 'is-down';
  return '';
}

function laneTagLabel(tag) {
  if (tag === 'good') return 'Good Lane';
  if (tag === 'bad') return 'Bad Lane';
  return 'Avg Lane';
}

function fmtDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function TrendChart({ title, values = [], dates = [], color = '#ffb454' }) {
  const uid = useId().replace(/:/g, '');
  const width = 320;
  const height = 120;
  const nums = values.map((v) => (v == null ? null : Number(v)));
  const finite = nums.filter((v) => v != null && Number.isFinite(v));
  if (finite.length < 2) return null;

  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min = Math.max(0, min - span * 0.12);
  max = Math.min(100, max + span * 0.12);

  const padY = 8;
  const innerH = height - padY * 2;
  const step = width / Math.max(nums.length - 1, 1);
  const coords = nums.map((v, i) => {
    if (v == null || !Number.isFinite(v)) return null;
    return [i * step, padY + innerH - ((v - min) / (max - min || 1)) * innerH];
  }).filter(Boolean);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height - padY} L${coords[0][0].toFixed(1)},${height - padY} Z`;
  const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
  const dateLabels = dates.map(fmtDateLabel);
  const xLabels = dateLabels.length >= 2
    ? [
      { x: 0, label: dateLabels[0] },
      ...(dateLabels.length > 2 ? [{ x: width / 2, label: dateLabels[Math.floor(dateLabels.length / 2)] }] : []),
      { x: width, label: dateLabels[dateLabels.length - 1] },
    ]
    : [];

  return (
    <article className="cd-trend-card">
      <h4>{title}</h4>
      <svg viewBox={`0 0 ${width} ${height + 18}`} className="cd-trend-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`cdFill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = padY + innerH - ((tick - min) / (max - min || 1)) * innerH;
          return (
            <g key={tick}>
              <line x1="0" y1={y} x2={width} y2={y} className="cd-trend-grid" />
              <text x="0" y={y - 2} className="cd-trend-y">{tick.toFixed(1)}%</text>
            </g>
          );
        })}
        <path d={area} fill={`url(#cdFill-${uid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {xLabels.map(({ x, label }) => (
          <text
            key={`${x}-${label}`}
            x={x}
            y={height + 14}
            className="cd-trend-x"
            textAnchor={x === 0 ? 'start' : x === width ? 'end' : 'middle'}
          >
            {label}
          </text>
        ))}
      </svg>
    </article>
  );
}

function MatchupCard({ row, tone, onClick, version }) {
  const delta = Number(row.delta) || 0;
  const sign = delta > 0 ? '+' : '';
  const id = row.ddragonId || champDdragonId(row.champion);
  return (
    <button type="button" className={`cd-mu-card is-${tone}`} onClick={onClick} title={row.champion}>
      <div className="cd-mu-art">
        <img
          src={champCenteredUrl(row.champion, id)}
          alt=""
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fallback === '1') return;
            img.dataset.fallback = '1';
            img.src = champIconUrl(row.champion, version);
          }}
        />
      </div>
      <strong className="cd-mu-delta">{sign}{delta.toFixed(1)}%</strong>
      <em className="cd-mu-games">{Number(row.games) || 0}</em>
      <span className={`cd-mu-lane is-${row.laneTag || 'avg'}`}>{laneTagLabel(row.laneTag)}</span>
    </button>
  );
}

function SafeItem({ id, version, size = 28, className = '' }) {
  const n = Number(typeof id === 'object' ? id?.id : id);
  if (!n) return null;
  return (
    <img
      className={className}
      src={itemIconUrl(n, version)}
      alt=""
      width={size}
      height={size}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

function RuneImg({ id, index, className = '' }) {
  const src = runeIconUrl(id, index);
  if (!src) return null;
  return (
    <img
      className={className}
      src={src}
      alt=""
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

export default function ChampionDetail() {
  const { champion: champParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const champion = decodeURIComponent(champParam || '');
  const role = searchParams.get('role') || 'Mid';
  const rank = searchParams.get('rank') || 'master';
  const platform = searchParams.get('platform') || 'euw1';
  const patch = searchParams.get('patch') || '';

  const [version, setVersion] = useState('16.16.1');
  const [kit, setKit] = useState(null);
  const [row, setRow] = useState(() => {
    const champ = decodeURIComponent(champParam || '');
    const r = searchParams.get('role') || 'Mid';
    const rk = searchParams.get('rank') || 'master';
    const p = searchParams.get('platform') || 'euw1';
    const tier = peekTierList({ platform: p, rank: rk });
    return tier?.rows?.find((x) => x.champion.toLowerCase() === champ.toLowerCase() && x.role === r) || null;
  });
  const [roleTotal, setRoleTotal] = useState(null);
  const [detail, setDetail] = useState(() => peekChampionDetail({
    champion: decodeURIComponent(champParam || ''),
    role: searchParams.get('role') || 'Mid',
    rank: searchParams.get('rank') || 'master',
    platform: searchParams.get('platform') || 'euw1',
  }));
  const [loading, setLoading] = useState(() => !peekChampionDetail({
    champion: decodeURIComponent(champParam || ''),
    role: searchParams.get('role') || 'Mid',
    rank: searchParams.get('rank') || 'master',
    platform: searchParams.get('platform') || 'euw1',
  }));
  const [error, setError] = useState('');
  const [buildIdx, setBuildIdx] = useState(0);
  const [runeIndex, setRuneIndex] = useState({});
  const [muTab, setMuTab] = useState('matchups');
  const [muLane, setMuLane] = useState('all');
  const [muQuery, setMuQuery] = useState('');
  const [muExpanded, setMuExpanded] = useState(false);

  const backUrl = useMemo(() => {
    const q = new URLSearchParams({ rank, platform });
    if (role) q.set('role', role);
    if (patch) q.set('patch', patch);
    return `/tierlist?${q}`;
  }, [rank, platform, role, patch]);

  useEffect(() => { ddragonVersion().then(setVersion); }, []);
  useEffect(() => { getRuneIndex().then(setRuneIndex); }, []);

  useEffect(() => {
    let alive = true;
    const id = champDdragonId(champion);
    fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${id}.json`)
      .then((r) => r.json())
      .then((data) => { if (alive) setKit(data.data?.[id] || null); })
      .catch(() => { if (alive) setKit(null); });
    return () => { alive = false; };
  }, [champion, version]);

  useEffect(() => {
    let alive = true;
    setError('');
    setBuildIdx(0);
    setMuLane('all');
    setMuQuery('');
    setMuExpanded(false);

    const applyTierRow = (tier) => {
      const rows = tier?.rows || [];
      const match = rows.find((r) => r.champion.toLowerCase() === champion.toLowerCase() && r.role === role);
      setRoleTotal(rows.filter((r) => r.role === role && !r.lowSample).length || null);
      if (match) setRow(match);
      return match;
    };

    (async () => {
      const cachedDetail = peekChampionDetail({ champion, role, rank, platform });
      if (cachedDetail) {
        setDetail(cachedDetail);
        setLoading(false);
      } else {
        setLoading(true);
        setDetail(null);
      }

      let tier = peekTierList({ platform, rank });
      if (!tier) tier = await hydrateTierListFromSnapshot({ platform, rank });
      if (!alive) return;
      const match = applyTierRow(tier);
      if (!match) {
        setRow({
          champion,
          role,
          tier: '?',
          roleRank: '—',
          winrate: cachedDetail?.stats?.winrate || 0,
          pickrate: cachedDetail?.stats?.pickrate || 0,
          banrate: cachedDetail?.stats?.banrate || 0,
          games: cachedDetail?.stats?.analysed || 0,
          delta: 0,
        });
      }

      try {
        const payload = await refreshChampionDetail({ champion, role, rank, platform });
        if (!alive) return;
        setDetail(payload);
        if (!match) {
          setRow((prev) => ({
            ...prev,
            winrate: payload?.stats?.winrate || prev.winrate,
            pickrate: payload?.stats?.pickrate || prev.pickrate,
            banrate: payload?.stats?.banrate || prev.banrate,
            games: payload?.stats?.analysed || prev.games,
          }));
        }
      } catch (err) {
        if (!alive) return;
        if (cachedDetail) return;
        setError(err.message || 'Could not load champion detail.');
        setDetail(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [champion, role, rank, platform]);

  const switchRole = (next) => {
    if (!next || next === role) return;
    const q = new URLSearchParams(searchParams);
    q.set('role', next);
    setSearchParams(q, { replace: true });
  };

  const lanes = detail?.stats?.lanes || {};
  const builds = detail?.builds || [];
  const build = builds[buildIdx] || builds[0];
  const avgWr = detail?.stats?.avgWr || 50;
  const trends = detail?.trends || {};

  const activeMatchups = useMemo(() => {
    const key = VS_ROLES.find((r) => r.id === muLane)?.key || 'all';
    return detail?.matchups?.[key] || detail?.matchups?.all || { good: [], bad: [] };
  }, [detail, muLane]);

  const good = useMemo(() => {
    const q = muQuery.trim().toLowerCase();
    return (activeMatchups.good || []).filter((r) => !q || r.champion.toLowerCase().includes(q));
  }, [activeMatchups, muQuery]);

  const bad = useMemo(() => {
    const q = muQuery.trim().toLowerCase();
    return (activeMatchups.bad || []).filter((r) => !q || r.champion.toLowerCase().includes(q));
  }, [activeMatchups, muQuery]);

  const spells = [
    { key: 'P', img: kit?.passive?.image?.full, name: kit?.passive?.name, passive: true },
    ...(kit?.spells || []).slice(0, 4).map((s, i) => ({
      key: ['Q', 'W', 'E', 'R'][i],
      img: s.image?.full,
      name: s.name,
    })),
  ];

  const perkIds = (build?.runes?.selectedPerkIds || []).map(Number).filter((id) => id > 0).slice(0, 9);
  const skillOrder = (build?.skills?.order || String(build?.skills?.id || '').split('')).filter(Boolean).slice(0, 3);
  const itemColumns = [
    { label: 'Starter items', options: detail?.items?.starters },
    { label: 'Boots', options: detail?.items?.boots },
    { label: 'Item 1', options: detail?.items?.slot1 },
    { label: 'Item 2', options: detail?.items?.slot2 },
    { label: 'Item 3', options: detail?.items?.slot3 },
    { label: 'Item 4', options: detail?.items?.slot4 },
    { label: 'Item 5', options: detail?.items?.slot5 },
  ].filter((col) => col.options?.length);

  const openMatchup = (m) => {
    navigate(`/tierlist/${encodeURIComponent(m.champion)}?role=${encodeURIComponent(role)}&rank=${encodeURIComponent(rank)}&platform=${encodeURIComponent(platform)}`);
  };

  return (
    <div className="cd-page">
      <div className="cd-top">
        <Link className="cd-back" to={backUrl}>← Back to tier list</Link>
        <div className="cd-meta">
          <img src={emblemUrl(rank)} alt="" />
          <span>{rank.replace('_', ' ')}</span>
          <span>{platform.toUpperCase()}</span>
          {(patch || detail?.patch) ? <span>Patch {patch || detail.patch}</span> : null}
        </div>
      </div>

      {loading && !row ? <div className="note">Loading champion detail…</div> : null}
      {loading && row && !detail?.builds?.length ? <div className="note">Updating builds…</div> : null}
      {error ? <div className="note is-error">{error}</div> : null}

      {row ? (
        <div className="cd-panel">
          <header className="cd-head">
            <div className="cd-identity">
              <img className="cd-portrait" src={champIconUrl(champion, version)} alt="" />
              <div className="cd-identity-copy">
                <div className="cd-title-row">
                  <h1>{champion}</h1>
                  <span className="cd-role-tag">{role}</span>
                </div>
                <div className="cd-spells">
                  {spells.map((s) => (
                    s.img ? (
                      <span key={s.key} title={s.name} className="cd-spell">
                        <img
                          src={s.passive ? passiveIconUrl(s.img, version) : spellIconUrl(s.img, version)}
                          alt=""
                        />
                        <em>{s.key}</em>
                      </span>
                    ) : null
                  ))}
                </div>
                <div className="cd-lane-pills">
                  {ROLES.map(({ id, key }) => {
                    const pct = lanes[key];
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`cd-lane${id === role ? ' is-on' : ''}`}
                        onClick={() => switchRole(id)}
                      >
                        <span>{id}</span>
                        <strong>{pct != null ? `${Number(pct).toFixed(1)}%` : '—'}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </header>

          <div className="cd-statbar">
            <div className="cd-stat">
              <strong className={`is-tier-${tierClass(row.tier)}`}>{row.tier}</strong>
              <span>Tier</span>
            </div>
            <div className="cd-stat">
              <strong>{row.roleRank || row.rank}{roleTotal ? ` / ${roleTotal}` : ''}</strong>
              <span>Rank</span>
            </div>
            <div className="cd-stat">
              <strong className="is-up">{fmtPct(row.winrate)}</strong>
              <span>Winrate</span>
            </div>
            <div className="cd-stat">
              <strong>{fmtPct(row.pickrate)}</strong>
              <span>Pick %</span>
            </div>
            <div className="cd-stat">
              <strong className="is-ban">{fmtPct(row.banrate)}</strong>
              <span>Ban %</span>
            </div>
            <div className="cd-stat">
              <strong>{fmtGames(row.games)}</strong>
              <span>Games</span>
            </div>
          </div>

          {(trends.winrate?.length || trends.pickrate?.length || trends.banrate?.length) ? (
            <section className="cd-trends">
              <TrendChart title={`WR · last 30d`} values={trends.winrate} dates={trends.dates} color="#ffb454" />
              <TrendChart title={`PICK · last 30d`} values={trends.pickrate} dates={trends.dates} color="#ffb454" />
              <TrendChart title={`BAN · last 30d`} values={trends.banrate} dates={trends.dates} color="#ffb454" />
            </section>
          ) : null}

          {builds.length ? (
            <section className="cd-build">
              <div className="cd-build-tabs">
                {builds.slice(0, 3).map((b, i) => (
                  <button
                    key={b.id || i}
                    type="button"
                    className={i === buildIdx ? 'is-on' : ''}
                    onClick={() => setBuildIdx(i)}
                  >
                    {b.label || (i === 0 ? 'Most played' : i === 1 ? 'Alt build' : 'Situational')}
                    {b.wr != null ? <em>{Math.round(Number(b.wr))}%</em> : null}
                  </button>
                ))}
              </div>

              {build ? (
                <div className="cd-build-grid">
                  <div className="cd-build-block">
                    <h4>Runes</h4>
                    <div className="cd-runes">
                      {perkIds[0] ? <RuneImg className="is-key" id={perkIds[0]} index={runeIndex} /> : null}
                      <div className="cd-rune-col">
                        {perkIds.slice(1, 4).map((id) => (
                          <RuneImg key={id} id={id} index={runeIndex} />
                        ))}
                      </div>
                      <div className="cd-rune-col">
                        {perkIds.slice(4, 6).map((id) => (
                          <RuneImg key={id} id={id} index={runeIndex} />
                        ))}
                      </div>
                      <div className="cd-rune-col is-shard">
                        {perkIds.slice(6, 9).map((id) => (
                          <RuneImg key={`s-${id}`} className="is-shard" id={id} index={runeIndex} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="cd-build-block">
                    <h4>Summoners</h4>
                    <div className="cd-items">
                      {(build.runes?.spells || []).slice(0, 2).map((id) => (
                        <img key={id} src={summonerIconUrl(id, version)} alt="" />
                      ))}
                    </div>
                    {build.boots ? (
                      <>
                        <h4 style={{ marginTop: 12 }}>Boots</h4>
                        <div className="cd-items">
                          <img src={itemIconUrl(build.boots, version)} alt="" />
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="cd-build-block">
                    <h4>Skill priority</h4>
                    <div className="cd-skill-prio">
                      {skillOrder.map((letter, i) => {
                        const spell = { Q: kit?.spells?.[0], W: kit?.spells?.[1], E: kit?.spells?.[2] }[letter];
                        return (
                          <React.Fragment key={`${letter}-${i}`}>
                            {i ? <i>›</i> : null}
                            <span className="cd-skill" title={spell?.name || letter}>
                              {spell?.image?.full ? (
                                <img src={spellIconUrl(spell.image.full, version)} alt="" />
                              ) : letter}
                              <em>{letter}</em>
                            </span>
                          </React.Fragment>
                        );
                      })}
                      {build.skills?.wr ? <b>{Math.round(Number(build.skills.wr))}%</b> : null}
                    </div>
                  </div>

                  <div className="cd-build-block is-wide">
                    <h4>Item path</h4>
                    <div className="cd-items cd-core-path">
                      {[
                        ...(build.starters || []).slice(0, 1),
                        build.boots,
                        ...(build.core || []),
                      ].filter(Boolean).map((id, i) => (
                        <React.Fragment key={`${id}-${i}`}>
                          {i ? <i>›</i> : null}
                          <SafeItem id={id} version={version} size={32} />
                        </React.Fragment>
                      ))}
                      {(build.extra || []).length ? (
                        <>
                          <i>›</i>
                          <div className="cd-extra">
                            {(build.extra || []).slice(0, 3).map((row) => (
                              <SafeItem key={`x-${row.id || row}`} id={row} version={version} size={28} />
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                    <p className="cd-build-note">Emerald+ ranked sample — games and winrate from that source.</p>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {(good.length || bad.length || detail?.matchups) ? (
            <section className="cd-mu-panel">
              <header className="cd-mu-head">
                <h3>Matchups as {champion}</h3>
                <div className="cd-mu-tabs">
                  <button type="button" className={muTab === 'matchups' ? 'is-on' : ''} onClick={() => setMuTab('matchups')}>Matchups</button>
                  <button type="button" className={muTab === 'synergies' ? 'is-on' : ''} onClick={() => setMuTab('synergies')}>Synergies</button>
                </div>
                <div className="cd-mu-tools">
                  <div className="cd-mu-roles">
                    {VS_ROLES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className={muLane === r.id ? 'is-on' : ''}
                        onClick={() => setMuLane(r.id)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="search"
                    value={muQuery}
                    onChange={(e) => setMuQuery(e.target.value)}
                    placeholder="Search champion…"
                  />
                </div>
              </header>

              {muTab === 'synergies' ? (
                <div className="cd-mu-empty">Synergies coming soon.</div>
              ) : !good.length && !bad.length ? (
                <div className="cd-mu-empty">No matchups for this filter.</div>
              ) : (
                <div className={`cd-mu-split${muExpanded ? ' is-expanded' : ''}`}>
                  <div className="cd-mu-strip is-good">
                    <h4>Good against</h4>
                    <div className="cd-mu-scroll">
                      {(muExpanded ? good : good.slice(0, 5)).map((m) => (
                        <MatchupCard key={`g-${m.champion}`} row={m} tone="good" version={version} onClick={() => openMatchup(m)} />
                      ))}
                    </div>
                  </div>
                  <button type="button" className={`cd-mu-full${muExpanded ? ' is-on' : ''}`} onClick={() => setMuExpanded((v) => !v)}>
                    <span>{muExpanded ? '–' : '+'}</span>
                    {muExpanded ? 'Compact' : 'Full list'}
                  </button>
                  <div className="cd-mu-strip is-bad">
                    <h4>Bad against</h4>
                    <div className="cd-mu-scroll">
                      {(muExpanded ? bad : bad.slice(0, 5)).map((m) => (
                        <MatchupCard key={`b-${m.champion}`} row={m} tone="bad" version={version} onClick={() => openMatchup(m)} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {itemColumns.length ? (
            <section className="cd-ip-panel">
              <h3>Item path</h3>
                  <div className="cd-ip-flow">
                {itemColumns.map((col) => (
                    <div key={col.label} className="cd-ip-col">
                      <h4>{col.label}</h4>
                      <div className="cd-ip-stack">
                        {col.options.slice(0, 4).map((opt, i) => {
                          const ids = (opt.ids || [opt.id]).filter(Boolean);
                          return (
                            <div key={`${col.label}-${i}`} className={`cd-ip-row${i === 0 ? ' is-top' : ''}`}>
                              <div className="cd-ip-items">
                                {ids.map((id, j) => (
                                  <React.Fragment key={`${id}-${j}`}>
                                    {j ? <i>›</i> : null}
                                    <SafeItem id={id} version={version} size={24} />
                                  </React.Fragment>
                                ))}
                              </div>
                              <div className="cd-ip-meta">
                                <strong className={wrTone(opt.wr, avgWr)}>{fmtPct(opt.wr)}</strong>
                                <em>{fmtGames(opt.games)}</em>
                                {opt.pickPct != null ? <span className="cd-ip-pick">{fmtPct(opt.pickPct)}</span> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
