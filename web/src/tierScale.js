/**
 * Shared tier/win-rate presentation scale.
 *
 * Every tier page (ranked, arena, aram) grades on the same S+..D- ladder, so the
 * colours, band names and win-rate tones live here rather than being re-derived
 * per page.
 */

export const TIER_ORDER = ['S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'];

/** One hue per letter band; the +/- variants shift lightness inside the band. */
const TIER_HUE = {
  S: [255, 168, 66],
  A: [150, 118, 255],
  B: [94, 184, 255],
  C: [136, 144, 181],
  D: [96, 103, 134],
};

export const TIER_NAME = {
  'S+': 'Meta defining',
  S: 'Very strong',
  'S-': 'Strong',
  'A+': 'Great',
  A: 'Good',
  'A-': 'Solid',
  'B+': 'Fair',
  B: 'Balanced',
  'B-': 'Situational',
  'C+': 'Weak',
  C: 'Struggling',
  'C-': 'Poor',
  'D+': 'Rough',
  D: 'Avoid',
  'D-': 'Avoid',
};

/** Solid text colour plus matching tints, handed to CSS as custom properties. */
export function tierVars(tier) {
  const label = String(tier || '?');
  const [r, g, b] = TIER_HUE[label.charAt(0)] || TIER_HUE.D;
  const lift = label.endsWith('+') ? 1.06 : (label.endsWith('-') ? 0.84 : 1);
  const ch = (v) => Math.min(255, Math.round(v * lift));
  return {
    '--tl-c': `rgb(${ch(r)}, ${ch(g)}, ${ch(b)})`,
    '--tl-bd': `rgba(${r}, ${g}, ${b}, 0.42)`,
    '--tl-bg': `rgba(${r}, ${g}, ${b}, 0.13)`,
    '--tl-bg-strong': `rgba(${r}, ${g}, ${b}, 0.3)`,
  };
}

export const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** Tone buckets are relative to a mode's own average, since ARAM/Arena sit above 50%. */
export function wrTone(wr, baseline = 50) {
  if (wr >= baseline + 3) return 'is-hot';
  if (wr >= baseline + 1) return 'is-good';
  if (wr >= baseline - 1) return 'is-mid';
  return 'is-bad';
}

export const WR_BAR = {
  'is-hot': 'linear-gradient(90deg, #ffb454, #ffd08a)',
  'is-good': 'linear-gradient(90deg, #2fae78, #3ecf8e)',
  'is-mid': 'linear-gradient(90deg, #5c6485, #8890b5)',
  'is-bad': 'linear-gradient(90deg, #c4444f, #ff8d96)',
};

/** Counts per tier, in ladder order, for the distribution strip. */
export function tierDistribution(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.tier, (counts.get(row.tier) || 0) + 1);
  return TIER_ORDER
    .filter((t) => counts.get(t))
    .map((t) => ({ tier: t, count: counts.get(t) }));
}
