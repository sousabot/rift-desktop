import React, { useId, useMemo } from 'react';

function fmtDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function niceBounds(values, { pad = 0.12, floor = 0, ceil = 100 } = {}) {
  const nums = values.filter((v) => v != null && Number.isFinite(v));
  if (!nums.length) return { min: floor, max: ceil };
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min = Math.max(floor, min - span * pad);
  max = Math.min(ceil, max + span * pad);
  if (max - min < 1) {
    min = Math.max(floor, min - 0.5);
    max = Math.min(ceil, max + 0.5);
  }
  return { min, max };
}

function buildPath(values, min, max, width, height, padY = 8) {
  const innerH = height - padY * 2;
  const step = width / Math.max(values.length - 1, 1);
  const coords = values.map((v, i) => {
    const x = i * step;
    if (v == null || !Number.isFinite(v)) return null;
    const y = padY + innerH - ((v - min) / (max - min || 1)) * innerH;
    return [x, y];
  }).filter(Boolean);
  if (!coords.length) return { line: '', area: '' };
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [firstX] = coords[0];
  const [lastX] = coords[coords.length - 1];
  const base = height - padY;
  const area = `${line} L${lastX.toFixed(1)},${base} L${firstX.toFixed(1)},${base} Z`;
  return { line, area };
}

function yTicks(min, max, count = 4) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(min + ((max - min) * i) / (count - 1));
  }
  return out;
}

export default function TrendChart({
  title,
  values = [],
  dates = [],
  formatValue = (v) => `${v.toFixed(1)}%`,
  color = '#ffb454',
}) {
  const uid = useId().replace(/:/g, '');
  const width = 320;
  const height = 120;

  const { min, max, path, ticks, labels } = useMemo(() => {
    const nums = values.map((v) => (v == null ? null : Number(v)));
    const bounds = niceBounds(nums.filter((v) => v != null));
    const built = buildPath(nums, bounds.min, bounds.max, width, height);
    const tickVals = yTicks(bounds.min, bounds.max);
    const dateLabels = dates.map(fmtDateLabel);
    const xLabels = [];
    if (dateLabels.length >= 2) {
      xLabels.push({ x: 0, label: dateLabels[0] });
      if (dateLabels.length > 2) {
        xLabels.push({ x: width / 2, label: dateLabels[Math.floor(dateLabels.length / 2)] });
      }
      xLabels.push({ x: width, label: dateLabels[dateLabels.length - 1] });
    }
    return { min: bounds.min, max: bounds.max, path: built, ticks: tickVals, labels: xLabels };
  }, [values, dates]);

  if (!values.length) return null;

  return (
    <article className="tld-trend-card">
      <h4>{title}</h4>
      <svg viewBox={`0 0 ${width} ${height + 18}`} className="tld-trend-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`tldFill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = 8 + (height - 16) - ((tick - min) / (max - min || 1)) * (height - 16);
          return (
            <g key={tick}>
              <line x1="0" y1={y} x2={width} y2={y} className="tld-trend-grid" />
              <text x="0" y={y - 2} className="tld-trend-y">{formatValue(tick)}</text>
            </g>
          );
        })}
        {path.area ? <path d={path.area} fill={`url(#tldFill-${uid})`} /> : null}
        {path.line ? (
          <path
            d={path.line}
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {labels.map(({ x, label }) => (
          <text key={`${x}-${label}`} x={x} y={height + 14} className="tld-trend-x" textAnchor={x === 0 ? 'start' : x === width ? 'end' : 'middle'}>
            {label}
          </text>
        ))}
      </svg>
    </article>
  );
}
