import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/LocaleContext';
import { apiUserMessage } from '../lib/apiNotice';
import './TftComps.css';

const api = typeof window !== 'undefined' ? window.tftAPI : null;
const MAX_BUILD = 9;
const HEX_COLS = 7;
const HEX_ROWS = 4;
const HEX_COUNT = HEX_COLS * HEX_ROWS;

function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${(Number(n) * 100).toFixed(1)}%`;
}

function fmtAvg(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(2);
}

function hexKey(row, col) {
  return row * HEX_COLS + col;
}

function costBorderClass(cost) {
  return `cost-${Math.max(1, Math.min(5, Number(cost) || 1))}`;
}

function Stars({ n }) {
  const count = Math.max(1, Math.min(3, Number(n) || 2));
  return (
    <span className="tft-stars" aria-label={`${count} star`}>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

function UnitPortrait({ unit }) {
  return (
    <div className={`tft-unit ${costBorderClass(unit.cost)}`} title={unit.name}>
      {unit.icon ? (
        <img src={unit.icon} alt="" loading="lazy" />
      ) : (
        <span className="tft-unit-ph">{(unit.name || '?').slice(0, 1)}</span>
      )}
      <Stars n={unit.stars} />
    </div>
  );
}

function ItemStrip({ items }) {
  if (!items?.length) return null;
  return (
    <span className="tft-items">
      {items.slice(0, 3).map((it) => (
        <img key={it.id} src={it.icon} alt={it.name || ''} title={it.name || it.id} loading="lazy" />
      ))}
    </span>
  );
}

function TraitChip({ trait }) {
  const style = Number(trait.style) || (trait.active ? 1 : 0);
  return (
    <span
      className={`tft-trait${trait.active || style ? ' is-on' : ''} style-${style || 'off'}`}
      title={`${trait.name} ${trait.level || ''}`.trim()}
    >
      {trait.icon ? <img src={trait.icon} alt="" /> : null}
      <em>{trait.name}</em>
      {trait.level ? <b>{trait.level}</b> : null}
    </span>
  );
}

function StageBoard({ stage, t }) {
  const winPct = stage.winRate != null && Number.isFinite(Number(stage.winRate))
    ? `${(Number(stage.winRate) * 100).toFixed(1)}%`
    : null;
  return (
    <div className="tft-stage">
      <div className="tft-stage-lvl">{stage.label || `Lvl ${stage.level}`}</div>
      <div className="tft-stage-units">
        {(stage.units || []).map((u) => (
          <div key={`${stage.level}-${u.id}`} className="tft-stage-unit">
            <UnitPortrait unit={u} />
            <em>{u.name}</em>
            <ItemStrip items={u.items} />
          </div>
        ))}
      </div>
      {winPct ? (
        <div className="tft-stage-stat">
          <strong>{winPct}</strong>
          <span>{t('tft.roundWinRate')}</span>
        </div>
      ) : null}
    </div>
  );
}

const COST_STROKE = {
  1: '#9aa0a8',
  2: '#1fbf4a',
  3: '#3b82f6',
  4: '#c84be0',
  5: '#e0b020',
};

/** Pointy-top hex geometry — same formula MetaTFT uses for Positioning. */
function hexCornerPoints(cx, cy, size) {
  const s3 = Math.sqrt(3);
  return [
    [cx, cy - size],
    [cx + (s3 * size) / 2, cy - size / 2],
    [cx + (s3 * size) / 2, cy + size / 2],
    [cx, cy + size],
    [cx - (s3 * size) / 2, cy + size / 2],
    [cx - (s3 * size) / 2, cy - size / 2],
  ];
}

function HexBoard({ board, selectedId, onHexClick, onHexContext, t }) {
  const HEX_SIZE = 28;
  const s3 = Math.sqrt(3);
  const colStep = s3 * HEX_SIZE + 3;
  const rowStep = 1.5 * HEX_SIZE + 2;
  const padX = HEX_SIZE * s3;
  const padY = HEX_SIZE + 8;
  const width = padX * 2 + (HEX_COLS - 1) * colStep + colStep * 0.5;
  const height = padY * 2 + (HEX_ROWS - 1) * rowStep;

  const byHex = useMemo(() => {
    const map = new Map();
    for (const u of board || []) {
      if (u.hex == null || u.hex < 0 || u.hex >= HEX_COUNT) continue;
      map.set(u.hex, u);
    }
    return map;
  }, [board]);

  const cells = [];
  for (let row = 0; row < HEX_ROWS; row += 1) {
    for (let col = 0; col < HEX_COLS; col += 1) {
      const hex = hexKey(row, col);
      const cx = padX + col * colStep + (row % 2 ? colStep / 2 : 0);
      const cy = padY + row * rowStep;
      cells.push({ hex, row, col, cx, cy, unit: byHex.get(hex) });
    }
  }

  return (
    <div className="tft-hex-wrap">
      <div className="tft-hex-label">{t('tft.positioning')}</div>
      <svg
        className="tft-hex-svg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="grid"
        aria-label={t('tft.positioning')}
      >
        <defs>
          {cells.filter((c) => c.unit?.icon).map((c) => (
            <pattern
              key={`pat-${c.hex}-${c.unit.id}`}
              id={`tft-hex-pat-${c.hex}`}
              patternUnits="objectBoundingBox"
              width="1"
              height="1"
            >
              <image
                href={c.unit.icon}
                x={-HEX_SIZE * 0.15}
                y={-HEX_SIZE * 0.1}
                width={HEX_SIZE * 2.3}
                height={HEX_SIZE * 2.3}
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          ))}
        </defs>
        {cells.map((c) => {
          const pts = hexCornerPoints(c.cx, c.cy, HEX_SIZE).map((p) => p.join(',')).join(' ');
          const selected = c.unit && selectedId === c.unit.id;
          const cost = Number(c.unit?.cost) || 1;
          const stroke = c.unit
            ? (selected ? '#ffd76a' : COST_STROKE[cost] || COST_STROKE[1])
            : 'rgba(180, 190, 210, 0.35)';
          const fill = c.unit?.icon
            ? `url(#tft-hex-pat-${c.hex})`
            : c.unit
              ? '#1a1e28'
              : 'rgba(20, 24, 34, 0.92)';
          return (
            <g
              key={c.hex}
              className={`tft-hex-g${c.unit ? ' is-filled' : ''}${selected ? ' is-selected' : ''}`}
              role="gridcell"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
              onClick={() => onHexClick(c.hex, c.unit)}
              onContextMenu={(e) => {
                e.preventDefault();
                onHexContext?.(c.hex, c.unit);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onHexClick(c.hex, c.unit);
                }
              }}
            >
              <title>{c.unit ? `${c.unit.name} · ${t('tft.builderSlotHint')}` : t('tft.hexEmpty')}</title>
              <polygon
                points={pts}
                className="tft-hex-poly"
                fill={fill}
                stroke={stroke}
                strokeWidth={c.unit ? (selected ? 2.4 : 2) : 1.2}
              />
              {c.unit ? (
                <>
                  {Array.from({ length: Math.max(1, Math.min(3, c.unit.stars || 2)) }, (_, i) => {
                    const count = Math.max(1, Math.min(3, c.unit.stars || 2));
                    const start = c.cx - (count - 1) * 4.5;
                    return (
                      <polygon
                        key={i}
                        className="tft-hex-star"
                        points="0,-3.2 0.95,-1 3.4,-0.9 1.5,0.55 2.1,3 0,1.7 -2.1,3 -1.5,0.55 -3.4,-0.9 -0.95,-1"
                        transform={`translate(${start + i * 9}, ${c.cy - HEX_SIZE * 0.62})`}
                      />
                    );
                  })}
                  <text
                    className="tft-hex-text"
                    x={c.cx}
                    y={c.cy + HEX_SIZE * 0.42}
                    textAnchor="middle"
                    fontSize={Math.max(8, Math.floor(HEX_SIZE / 3.2))}
                  >
                    {c.unit.name}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function firstEmptyHex(board) {
  const used = new Set((board || []).map((u) => u.hex).filter((h) => h != null));
  for (let i = 0; i < HEX_COUNT; i += 1) {
    if (!used.has(i)) return i;
  }
  return null;
}

function BuilderPanel({ catalog, pinnedId, onPin, onUnpin, t }) {
  const [board, setBoard] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [costFilter, setCostFilter] = useState(0);

  const filtered = useMemo(() => {
    const list = Array.isArray(catalog) ? catalog : [];
    const needle = q.trim().toLowerCase();
    return list.filter((u) => {
      if (costFilter && Number(u.cost) !== costFilter) return false;
      if (!needle) return true;
      return String(u.name || '').toLowerCase().includes(needle);
    });
  }, [catalog, q, costFilter]);

  const placeOrToggle = (unit) => {
    setBoard((cur) => {
      if (cur.some((u) => u.id === unit.id)) return cur;
      if (cur.length >= MAX_BUILD) return cur;
      const hex = firstEmptyHex(cur);
      if (hex == null) return cur;
      return [...cur, {
        ...unit,
        stars: unit.cost >= 4 ? 3 : 2,
        items: [],
        hex,
      }];
    });
    setSelectedId(unit.id);
  };

  const onHexClick = (hex, occupant) => {
    if (selectedId) {
      setBoard((cur) => {
        const selected = cur.find((u) => u.id === selectedId);
        if (!selected) return cur;
        if (occupant && occupant.id === selectedId) {
          return cur.map((u) => (
            u.id === selectedId ? { ...u, stars: u.stars >= 3 ? 1 : (u.stars || 1) + 1 } : u
          ));
        }
        if (occupant) {
          return cur.map((u) => {
            if (u.id === selected.id) return { ...u, hex: occupant.hex };
            if (u.id === occupant.id) return { ...u, hex: selected.hex };
            return u;
          });
        }
        return cur.map((u) => (u.id === selectedId ? { ...u, hex } : u));
      });
      return;
    }
    if (occupant) setSelectedId(occupant.id);
  };

  const onHexContext = (_hex, occupant) => {
    if (!occupant) return;
    setBoard((cur) => cur.filter((u) => u.id !== occupant.id));
    setSelectedId((id) => (id === occupant.id ? null : id));
  };

  const pinCustom = async () => {
    if (!board.length) return;
    const ordered = [...board].sort((a, b) => (a.hex ?? 99) - (b.hex ?? 99));
    const label = name.trim() || ordered.slice(0, 2).map((u) => u.name).join(' ');
    await onPin({
      id: `custom-${ordered.map((u) => `${u.id}@${u.hex}`).join('-').slice(0, 100)}`,
      name: label,
      tier: '',
      avgPlacement: null,
      pickRate: null,
      playCount: 0,
      traits: [],
      units: ordered,
    });
  };

  const pinId = board.length
    ? `custom-${[...board].sort((a, b) => (a.hex ?? 99) - (b.hex ?? 99)).map((u) => `${u.id}@${u.hex}`).join('-').slice(0, 100)}`
    : '';
  const isPinned = pinnedId && pinnedId === pinId;

  return (
    <div className="tft-builder">
      <p className="tft-builder-blurb">{t('tft.builderBlurb')}</p>
      <div className="tft-builder-board">
        <div className="tft-builder-board-head">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('tft.builderName')}
            aria-label={t('tft.builderName')}
          />
          <span className="tft-chip">{board.length}/{MAX_BUILD}</span>
        </div>

        <HexBoard
          board={board}
          selectedId={selectedId}
          onHexClick={onHexClick}
          onHexContext={onHexContext}
          t={t}
        />

        <p className="tft-builder-hint">{t('tft.builderHexHint')}</p>

        <div className="tft-builder-actions">
          <button
            type="button"
            className="tft-btn ghost"
            onClick={() => { setBoard([]); setSelectedId(null); }}
            disabled={!board.length}
          >
            {t('tft.builderClear')}
          </button>
          {isPinned ? (
            <button type="button" className="tft-btn is-on" onClick={onUnpin}>{t('tft.unpin')}</button>
          ) : (
            <button type="button" className="tft-btn primary" onClick={pinCustom} disabled={!board.length}>
              {t('tft.pin')}
            </button>
          )}
        </div>
      </div>

      <div className="tft-builder-pool">
        <div className="tft-toolbar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('tft.searchUnits')}
            aria-label={t('tft.searchUnits')}
          />
          <div className="tft-cost-filters">
            {[0, 1, 2, 3, 4, 5].map((c) => (
              <button
                key={c}
                type="button"
                className={`tft-cost-btn${costFilter === c ? ' is-on' : ''}${c ? ` cost-${c}` : ''}`}
                onClick={() => setCostFilter(c)}
              >
                {c === 0 ? t('tft.costAll') : c}
              </button>
            ))}
          </div>
        </div>
        <div className="tft-builder-grid">
          {filtered.map((u) => {
            const on = board.some((b) => b.id === u.id);
            const selected = selectedId === u.id;
            return (
              <button
                key={u.id}
                type="button"
                className={`tft-builder-pick${on ? ' is-on' : ''}${selected ? ' is-selected' : ''}`}
                onClick={() => placeOrToggle(u)}
                disabled={!on && board.length >= MAX_BUILD}
              >
                <UnitPortrait unit={u} />
                <span>{u.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TftComps() {
  const { t } = useI18n();
  const [tab, setTab] = useState('meta');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pinnedId, setPinnedId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [query, setQuery] = useState('');

  const load = async (force = false) => {
    if (!api?.getComps) {
      setError(t('tft.needApp'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.getComps({ force });
      setData(res || null);
      if (res?.error && !res?.comps?.length) {
        setError(apiUserMessage({ message: res.error }) || res.error);
      } else {
        setError('');
      }
    } catch (err) {
      setError(apiUserMessage(err) || err?.message || t('tft.failed'));
    }
    try {
      const pin = await api.getPinned?.();
      setPinnedId(pin?.id || null);
    } catch {
      /* pin is optional — do not blank the comps list */
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const off = api?.onPinned?.((comp) => setPinnedId(comp?.id || null));
    return () => off?.();
  }, []);

  const comps = useMemo(() => {
    const list = Array.isArray(data?.comps) ? data.comps : [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      if (c.name?.toLowerCase().includes(q)) return true;
      if (c.units?.some((u) => u.name?.toLowerCase().includes(q))) return true;
      if (c.traits?.some((tr) => tr.name?.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [data, query]);

  const pin = async (comp) => {
    if (!api?.setPinned) return;
    const next = await api.setPinned(comp);
    setPinnedId(next?.id || null);
  };

  const unpin = async () => {
    if (!api?.setPinned) return;
    await api.setPinned(null);
    setPinnedId(null);
  };

  return (
    <div className="tft-page">
      <header className="tft-head">
        <div>
          <h1>{t('tft.title')}</h1>
          <p>{t('tft.blurb')}</p>
          <p className="tft-note">{t('tft.staticNote')}</p>
        </div>
        <div className="tft-head-meta">
          {data?.tftSet ? <span className="tft-chip">{data.tftSet}</span> : null}
          <button type="button" className="tft-btn ghost" onClick={() => load(true)} disabled={loading}>
            {loading ? t('tft.loading') : t('tft.refresh')}
          </button>
        </div>
      </header>

      <nav className="tft-tabs" aria-label={t('tft.tabs')}>
        <button type="button" className={tab === 'meta' ? 'is-on' : ''} onClick={() => setTab('meta')}>
          {t('tft.tabMeta')}
        </button>
        <button type="button" className={tab === 'builder' ? 'is-on' : ''} onClick={() => setTab('builder')}>
          {t('tft.tabBuilder')}
        </button>
      </nav>

      {error ? <div className="tft-error">{error}</div> : null}

      {tab === 'builder' ? (
        <BuilderPanel
          catalog={data?.units || []}
          pinnedId={pinnedId}
          onPin={pin}
          onUnpin={unpin}
          t={t}
        />
      ) : (
        <>
          <div className="tft-toolbar">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tft.search')}
              aria-label={t('tft.search')}
            />
            {pinnedId ? (
              <button type="button" className="tft-btn" onClick={unpin}>
                {t('tft.unpin')}
              </button>
            ) : null}
          </div>

          {loading && !comps.length ? (
            <div className="tft-empty">{t('tft.loading')}</div>
          ) : !comps.length ? (
            <div className="tft-empty">{t('tft.empty')}</div>
          ) : (
            <ul className="tft-list">
              {comps.map((comp, idx) => {
                const open = expanded === comp.id;
                const isPinned = pinnedId === comp.id;
                return (
                  <li key={comp.id} className={`tft-row${open ? ' is-open' : ''}${isPinned ? ' is-pinned' : ''}`}>
                    <button
                      type="button"
                      className="tft-row-main"
                      onClick={() => setExpanded(open ? null : comp.id)}
                    >
                      <span className="tft-rank">{idx + 1}</span>
                      <span className={`tft-tier tier-${comp.tier || 'na'}`}>{comp.tier || '—'}</span>
                      <div className="tft-row-copy">
                        <strong>{comp.name}</strong>
                        <span className="tft-stats">
                          {t('tft.avgPlace')}: {fmtAvg(comp.avgPlacement)}
                          <i>·</i>
                          {t('tft.pickRate')}: {fmtPct(comp.pickRate)}
                        </span>
                      </div>
                      <div className="tft-row-units">
                        {comp.units?.slice(0, 8).map((u) => (
                          <UnitPortrait key={u.id} unit={u} />
                        ))}
                      </div>
                    </button>
                    <div className="tft-row-actions">
                      {isPinned ? (
                        <button type="button" className="tft-btn is-on" onClick={unpin}>
                          {t('tft.unpin')}
                        </button>
                      ) : (
                        <button type="button" className="tft-btn primary" onClick={() => pin(comp)}>
                          {t('tft.pin')}
                        </button>
                      )}
                    </div>
                    {open ? (
                      <div className="tft-detail">
                        <div className="tft-traits">
                          {comp.traits?.map((tr) => (
                            <TraitChip key={`${tr.id}-${tr.level}`} trait={tr} />
                          ))}
                        </div>
                        {comp.stages?.length ? (
                          <div className="tft-stages">
                            <div className="tft-stages-head">{t('tft.stages')}</div>
                            {comp.stages
                              .filter((s) => s.level !== 'final')
                              .map((stage) => (
                                <StageBoard key={String(stage.level)} stage={stage} t={t} />
                              ))}
                            <div className="tft-stages-head tft-stages-head--final">{t('tft.finalBoard')}</div>
                          </div>
                        ) : null}
                        <div className="tft-detail-units">
                          {comp.units?.map((u) => (
                            <div key={u.id} className="tft-detail-unit">
                              <UnitPortrait unit={u} />
                              <div>
                                <strong>{u.name}</strong>
                                <span className="tft-cost">{t('tft.cost', { n: u.cost })}</span>
                                <ItemStrip items={u.items} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
